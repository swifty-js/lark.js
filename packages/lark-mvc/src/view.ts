/**
 * Copyright (c) 2026 hangtiancheng
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * View system — functional API for defining and managing views.
 *
 * A view is defined by a setup function that receives a `ViewCtx` and
 * returns `{ template }`. The ctx provides all framework APIs (refData,
 * capture/release, events, etc.) via closures — no `this` binding, no
 * `class`, no `prototype`, no `mixin`.
 *
 * ## Reactive rendering
 *
 * Every mounted view runs its template inside ONE `@preact/signals-core`
 * `effect()` — the render effect. Any signal read during template evaluation
 * (view-local `signal()`s, `params.key`, `State.get(key)`, store state,
 * `Router.parse()`) subscribes the view; writing a subscribed signal re-runs
 * the effect synchronously (writes inside `batch()` coalesce). There is no
 * manual digest, no dirty-checking, no dispatcher walk — the effect IS the
 * dirty check.
 *
 * ## Lifecycle
 *
 * 1. **Setup** — `mountCtx(frame, setup, params)` creates a `ViewCtx`, sets it
 *    as the current hooks context, runs `setup(ctx, params)` inside
 *    `untracked()` (so signal reads in the setup body never leak into an
 *    enclosing render effect), then wires the returned `template` onto the ctx.
 * 2. **Render** — the render effect's first run is the initial render; each
 *    run increments `signature`, fires `render`, destroys transient
 *    resources, evaluates the template (tracked), applies the DOM diff, and
 *    calls `endUpdate` inside `untracked()` (child views mounted by
 *    `mountZone` own their own render effects).
 * 3. **Destroy** — `unmountCtx(ctx)` runs `useEffect` cleanups (including the
 *    render-effect dispose), destroys all resources, fires `destroy`, and
 *    sets `signature = 0`.
 *
 * ## Async safety
 *
 * `ctx.wrapAsync(fn)` captures `signature` at wrap time; the wrapped function
 * only executes if `signature` still matches — stale callbacks after a view
 * re-render or destroy are silently dropped. Note that ANY reactive re-render
 * bumps `signature`.
 */
import { hasOwnProperty, funcWithTry, noop, getById } from "./utils";
import { SPLITTER, isRefToken } from "./common";
import { domGetNode, domSetChildNodes, applyDomOps, applyIdUpdates, createDomRef } from "./dom";
import { signal, effect, untracked, type Signal } from "./reactive";
import { createEmitter } from "./event-emitter";
import { setCurrentCtx } from "./hooks";
import { VIEW_MARK } from "./jsx/vnode";
import { resolveSetup } from "./view-registry";
import type {
  AnyFunc,
  AnyLarkView,
  LarkView,
  ViewCtx,
  ViewParams,
  ViewSetup,
  ViewSetupResult,
  FrameObj,
  ViewResourceEntry,
  ViewTemplate,
} from "./types";

// ============================================================
// defineView — the public API for defining views
// ============================================================

let warnedDirectCall = false;

/**
 * Define a view component via a setup function (hooks style).
 *
 * The setup function runs once on mount, receives a `ViewCtx` and the props
 * passed at the JSX usage site, and returns `{ template }`. Hooks
 * (`useSignal`, `useEffect`, etc.) can be called inside setup. Events are
 * inline functions in the template JSX; reactive data is read inside the
 * template via signals (read = subscribe).
 *
 * The returned `LarkView` is used directly as a JSX tag — the serializer
 * intercepts it and mounts the view through the Frame tree. Calling it like
 * a plain function renders nothing (dev warning).
 *
 * @example
 * const Counter = defineView<{ step: number; onChange: (d?: object) => void }>(
 *   (ctx, params) => {
 *     const count = signal(0);
 *     const template = jsxTemplate(() => (
 *       <button onClick={() => (count.value += params?.step ?? 1)}>{count.value}</button>
 *     ));
 *     return { template };
 *   },
 * );
 * // Parent: <Counter step={2} onChange={(d) => ...} key="c1" class="mx-2" />
 */
export function defineView<P extends object = object>(
  setup: (ctx: ViewCtx, params?: ViewParams<P> & Record<string, unknown>) => ViewSetupResult,
): LarkView<P> {
  const view = (() => {
    if (!warnedDirectCall) {
      warnedDirectCall = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[lark-mvc] A defineView component was invoked as a function. " +
          "Use it as a JSX tag (<MyView .../>) so the framework can mount it.",
      );
    }
    return null;
  }) as unknown as LarkView<P>;
  view.$$ = VIEW_MARK;
  view.setup = setup as ViewSetup;
  return view;
}

// ============================================================
// createCtx — creates a ViewCtx with all framework APIs
// ============================================================

/**
 * Create a ViewCtx for a frame. Called by the Frame system when mounting a view.
 *
 * The ctx provides all framework APIs via closures — no `this` binding.
 */
export function createCtx(frame: FrameObj): ViewCtx {
  const id = frame.id;
  const emitter = createEmitter();
  const signature = { value: 0 };
  const rendered = { value: false };
  const resources: Record<string, ViewResourceEntry> = {};
  const signals = new Map<string, Signal<unknown>>();

  /** Ref-token store for template rendering (JSX object/function values). */
  const refData: Record<string, unknown> = {};
  refData[SPLITTER] = 1;

  const mutable = {
    endUpdatePending: undefined as number | undefined,
    template: undefined as ViewTemplate | undefined,
    events: undefined as Record<string, AnyFunc> | undefined,
  };

  const cleanups: Array<() => void> = [];

  // ── Event emitter passthrough ──
  function on(event: string, handler: AnyFunc): () => void {
    emitter.on(event, handler);
    return () => emitter.off(event, handler);
  }

  function off(event: string, handler?: AnyFunc): void {
    emitter.off(event, handler);
  }

  function fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): void {
    emitter.fire(event, data, remove, lastToFirst);
  }

  // ── Ref-token resolution ──

  /**
   * Resolve a SPLITTER-prefixed reference token to its original JS value.
   *
   * Used to restore object references that were tokenized by `refFn` during
   * JSX serialization (component props, object/function attribute values).
   */
  function translate(dataVal: unknown): unknown {
    if (typeof dataVal !== "string" || !isRefToken(dataVal)) return dataVal;
    return hasOwnProperty(refData, dataVal) ? refData[dataVal] : dataVal;
  }

  // ── Resource management ──

  /**
   * Register a destroyable resource tied to the view lifecycle.
   *
   * If `resource` is provided, stores it under `key` (replacing any existing
   * entry — the old resource's `destroy()` is called first). If `resource` is
   * omitted, returns the previously stored entity for `key`.
   *
   * @param key - Unique resource key
   * @param resource - Object with a `destroy()` method (omit to read)
   * @param destroyOnRender - If true, destroyed on the next render
   * @returns The stored entity (when reading) or the resource (when writing)
   */
  function capture(key: string, resource?: unknown, destroyOnRender = false): unknown {
    if (resource !== undefined) {
      destroyResource(resources, key, true, resource);
      resources[key] = { entity: resource, destroyOnRender };
    } else {
      const entry = resources[key];
      return entry ? entry.entity : undefined;
    }
    return resource;
  }

  /**
   * Remove a resource entry and optionally call its `destroy()`.
   *
   * @param key - Resource key to remove
   * @param destroy - If true (default), call `destroy()` on the entity
   * @returns The removed entity
   */
  function release(key: string, destroy = true): unknown {
    return destroyResource(resources, key, destroy);
  }

  // ── Render lifecycle ──

  /**
   * Force a re-render through the render effect.
   *
   * Reactive updates never need this — writing any signal the template reads
   * re-renders automatically. `render()` exists for non-reactive triggers
   * (HMR template swaps, imperative refresh).
   *
   * Placeholder — `createRenderEffect` rebinds it to bump the effect's
   * invalidation signal; template-less views keep this no-op.
   */
  function render(): void {
    // no template → nothing to re-render
  }

  // ── Update zones ──

  /**
   * End a zone update: re-mount child frames via `frame.mountZone`, then
   * flush deferred `invoke` calls.
   *
   * Marks the view as rendered (`rendered.value = true`) on the first call.
   */
  function endUpdate(zoneId?: string, inner?: boolean): void {
    if (signature.value > 0) {
      const updateId = zoneId ?? id;
      let flag: number | boolean | undefined;

      if (inner) {
        flag = inner;
      } else {
        flag = mutable.endUpdatePending;
        mutable.endUpdatePending = 1;
        rendered.value = true;
      }

      frame.mountZone(updateId);

      if (!flag) {
        setTimeout(
          wrapAsync(() => {
            runInvokes(frame);
          }),
          0,
        );
      }
    }
  }

  // ── Async safety ──

  /**
   * Wrap an async callback with a signature guard.
   *
   * Captures `signature` at wrap time. The returned function only executes
   * `fn` if the view is still alive (`signature > 0`) AND the signature
   * hasn't changed (no re-render or destroy occurred). Otherwise returns
   * `undefined` — stale callbacks are silently dropped.
   */
  function wrapAsync<Fn extends AnyFunc>(
    fn: Fn,
    context?: unknown,
  ): (...args: Parameters<Fn>) => ReturnType<Fn> | undefined {
    const currentSignature = signature.value;
    return (...args: Parameters<Fn>) => {
      if (currentSignature > 0 && currentSignature === signature.value) {
        return fn.apply(context ?? ctx, args) as ReturnType<Fn>;
      }
      return undefined;
    };
  }

  // ── Getters/setters as functions (no getter/setter syntax) ──
  function getTemplate(): ViewTemplate | undefined {
    return mutable.template;
  }
  function setTemplate(v: ViewTemplate | undefined): void {
    mutable.template = v;
  }
  function getEvents(): Record<string, AnyFunc> | undefined {
    return mutable.events;
  }
  function setEvents(v: Record<string, AnyFunc> | undefined): void {
    mutable.events = v;
  }

  const ctx: ViewCtx = {
    id,
    owner: frame,
    refData,
    translate,
    signals,
    signature,
    rendered,
    getTemplate,
    setTemplate,
    resources,
    emitter,
    getEvents,
    setEvents,
    cleanups,
    render,
    endUpdate,
    wrapAsync,
    capture,
    release,
    fire,
    on,
    off,
  };

  return ctx;
}

// ============================================================
// Render effect — the single reactive render pipeline
// ============================================================

/**
 * One render pass: bump signature, fire `render`, destroy transient
 * resources, evaluate the template (TRACKED — signal reads subscribe the
 * render effect), apply the DOM diff, then mount child zones inside
 * `untracked()` so child setups/renders never leak dependencies into this
 * view's effect.
 */
function renderCore(ctx: ViewCtx, invalidate: Signal<number>): void {
  // Read the manual-invalidation signal FIRST so `ctx.render()` always
  // re-triggers, even when a previous pass bailed before touching signals.
  invalidate.value;
  if (ctx.signature.value <= 0) return;

  ctx.signature.value++;
  ctx.fire("render");
  destroyAllResources(ctx, false);

  const template = ctx.getTemplate();
  const node = getById(ctx.id);
  if (typeof template !== "function" || !node) return;

  const html = template(ctx.id, ctx.refData);
  const newDom = domGetNode(html, node);
  const ref = createDomRef();
  domSetChildNodes(node, newDom, ref, ctx.owner);
  applyIdUpdates(ref.idUpdates);
  applyDomOps(ref.domOps);
  untracked(() => ctx.endUpdate(ctx.id));
}

/**
 * Create the view's render effect. The first run is the initial render.
 * The dispose function is pushed into `ctx.cleanups` (run by `unmountCtx`
 * and by HMR before re-setup).
 *
 * Errors thrown during a render pass are routed through `funcWithTry` to the
 * global error sink (`config.error`) instead of propagating to whichever
 * signal write happened to trigger the pass.
 */
export function createRenderEffect(ctx: ViewCtx): void {
  const invalidate = signal(0);
  // Rebind ctx.render to bump THIS effect's invalidation signal.
  ctx.render = () => {
    if (ctx.signature.value > 0) {
      invalidate.value++;
    }
  };
  const dispose = effect(() => {
    funcWithTry(renderCore, [ctx, invalidate], null, noop);
  });
  ctx.cleanups.push(dispose);
}

// ============================================================
// Resource management
// ============================================================

/**
 * Destroy all resources managed by a ctx.
 * If lastly=true, destroy ALL resources; otherwise only destroyOnRender ones.
 */
export function destroyAllResources(ctx: ViewCtx, lastly: boolean): void {
  const cache = ctx.resources;
  for (const p in cache) {
    if (hasOwnProperty(cache, p)) {
      const entry = cache[p];
      if (lastly || entry.destroyOnRender) {
        destroyResource(cache, p, true);
      }
    }
  }
}

/**
 * Destroy a single resource entry.
 */
function destroyResource(
  cache: Record<string, ViewResourceEntry>,
  key: string,
  callDestroy: boolean,
  oldEntity?: unknown,
): unknown {
  const entry = cache[key];
  if (!entry || entry.entity === oldEntity) return undefined;

  const entity = entry.entity;
  if (entity && typeof entity === "object") {
    const destroyFn = Reflect.get(entity, "destroy");
    if (typeof destroyFn === "function" && callDestroy) {
      funcWithTry(destroyFn, [], entity, noop);
    }
  }

  Reflect.deleteProperty(cache, key);
  return entity;
}

// ============================================================
// Invoke queue
// ============================================================

/**
 * Process deferred invoke calls on a frame.
 */
export function runInvokes(frame: FrameObj): void {
  const list = frame.invokeList;
  if (!list) return;

  while (list.length) {
    const entry = list.shift();
    if (entry && !entry.removed) {
      frame.invoke(entry.name, entry.args);
    }
  }
}

// ============================================================
// Mount / unmount a ctx (called by Frame)
// ============================================================

/**
 * Mount a view: create ctx, run setup, create the render effect.
 *
 * Called by `frame.mountView` (via `doMountView`) after the setup function
 * is loaded. Steps:
 * 1. Create a `ViewCtx` via `createCtx(frame)`
 * 2. Set it as the current hooks context (`setCurrentCtx`) so `useSignal` /
 *    `useEffect` / hooks can access it during setup
 * 3. Run `setup(ctx, params)` inside `untracked()` — returns `{ template }`.
 *    Untracked because a synchronous mount can happen inside the PARENT's
 *    render effect (mountZone); signal reads in the child setup body must
 *    not subscribe the parent.
 * 4. Wire the template onto the ctx
 * 5. Activate: `signature.value = 1`, `frame.view = ctx`
 * 6. Create the render effect — its first run is the initial render (inline
 *    JSX handlers are wired during render by `jsxTemplate`). Views without
 *    a template call `ctx.endUpdate()` directly.
 */
export function mountCtx(
  frame: FrameObj,
  setup: ViewSetup | AnyLarkView,
  params?: unknown,
): ViewCtx {
  const ctx = createCtx(frame);
  const setupFn = resolveSetup(setup);

  // Set currentCtx so hooks (useSignal, useEffect, etc.) can access the ctx
  // during setup execution. Must be reset to null after setup completes.
  setCurrentCtx(ctx);
  let descriptor: ViewSetupResult;
  try {
    descriptor = untracked(() => setupFn(ctx, params));
  } finally {
    setCurrentCtx(null);
  }

  ctx.setTemplate(descriptor.template);

  // Activate
  ctx.signature.value = 1;

  // Wire ctx to frame BEFORE the first render so that the render pass can
  // find `frame.view` (mountZone, event wiring) and the template.
  frame.view = ctx;

  // Render
  if (ctx.getTemplate()) {
    createRenderEffect(ctx);
  } else {
    ctx.endUpdate();
  }

  return ctx;
}

/**
 * Unmount a view: run `useEffect` cleanups (which include the render-effect
 * dispose and the JSX event wiring cleanup — it unbinds delegated event
 * types), destroy resources, fire `destroy`, and set `signature = 0`.
 *
 * Called by `frame.unmountView`.
 */
export function unmountCtx(ctx: ViewCtx): void {
  // Run useEffect cleanups
  for (let i = ctx.cleanups.length - 1; i >= 0; i--) {
    const cleanup = ctx.cleanups[i];
    funcWithTry(cleanup, [], null, noop);
  }
  ctx.cleanups.length = 0;

  // Destroy all resources
  destroyAllResources(ctx, true);

  // Fire destroy event
  if (ctx.signature.value > 0) {
    ctx.fire("destroy", undefined, true, true);
  }

  // Mark as destroyed
  ctx.signature.value = 0;
}

// ============================================================
// HMR support
// ============================================================
// HMR hot-swap is handled by the hmr module (hotSwapByView), called via
// globalThis.__lark_hmr__ by auto-injected HMR snippets.
