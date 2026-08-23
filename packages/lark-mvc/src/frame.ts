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
 * Frame tree for view lifecycle management (functional factory).
 *
 * Replaces the former `Frame` class with `createFrame()` + `Frame` singleton.
 * No `class`, no `this`, no `prototype`. Each frame is a plain object (FrameObj)
 * with closure-based methods. The `Frame` singleton provides static-like
 * registry methods (get, getAll, getRoot, createRoot, on, off, fire).
 */
import { SPLITTER, LARK_VIEW, LARK_PROP } from "./common";
import {
  hasOwnProperty,
  parseUri,
  getAttribute,
  funcWithTry,
  noop,
  assign,
  ensureElementId,
} from "./utils";
import { signal, batch, type Signal } from "./reactive";
import { createEmitter } from "./event-emitter";
import { unmark } from "./mark";
import { mountCtx, unmountCtx, runInvokes } from "./view";
import type { ViewSetup } from "./types";
import { use, config as frameworkConfig } from "./module-loader";
import { getViewClass, registerViewClass } from "./view-registry";
import type { AnyFunc, FrameObj, FrameInvokeEntry } from "./types";

/** Component props matching `on` + Capitalized are child→parent event handlers. */
const VIEW_EVENT_PROP_REGEXP = /^on[A-Z]/;

// ============================================================
// Internal state
// ============================================================

/** All frames registry */
const frameRegistry = new Map<string, FrameObj>();

/** Root frame instance */
let rootFrame: FrameObj | undefined;

/** Marker for alter-event propagation during an active unmountView cycle */
let globalAlter: { id: string } | undefined;

/** Static event emitter for Frame-level events (add/remove) */
const staticEmitter = createEmitter();

/** Type guard: verify a dynamically loaded module is a ViewSetup function */
function isViewSetup(fn: unknown): fn is ViewSetup {
  return typeof fn === "function";
}

// ============================================================
// Reactive params store
// ============================================================

/**
 * Per-frame prop mirrors: proxy target (own keys for spread/`in`) and the
 * set of keys owned by mountZone prop pushes (candidates for removal).
 */
const paramsTargets = new WeakMap<FrameObj, Record<string, unknown>>();
const paramsPropKeys = new WeakMap<FrameObj, Set<string>>();

/**
 * Get or create the frame's reactive params store: one signal per key behind
 * a stable proxy. The proxy is handed to the child setup as `params` —
 * reading a key inside a tracked region (template/computed/effect)
 * subscribes the reader to that key.
 */
function ensureParamsStore(frame: FrameObj): NonNullable<FrameObj["paramsStore"]> {
  let store = frame.paramsStore;
  if (!store) {
    const signals = new Map<string, Signal<unknown>>();
    const target: Record<string, unknown> = {};
    const proxy = new Proxy(target, {
      get(t, prop, receiver) {
        if (typeof prop === "string") {
          const sig = signals.get(prop);
          if (sig) return sig.value; // tracked read
        }
        return Reflect.get(t, prop, receiver);
      },
    });
    store = { signals, proxy };
    frame.paramsStore = store;
    paramsTargets.set(frame, target);
    paramsPropKeys.set(frame, new Set());
  }
  return store;
}

/** Write one key into the store (creating its signal on first sight). */
function writeParamKey(
  store: NonNullable<FrameObj["paramsStore"]>,
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  target[key] = value;
  const sig = store.signals.get(key);
  if (sig) {
    sig.value = value; // same-value writes are no-ops
  } else {
    store.signals.set(key, signal(value));
  }
}

/**
 * Seed initial mount params (URI params + first props). Does NOT register
 * keys for prop-removal tracking — only `writeParams` (mountZone pushes)
 * owns removal semantics, so URI params on raw `v-lark` hosts survive
 * parent re-renders that carry no props.
 */
function seedParams(frame: FrameObj, params: Record<string, unknown>): void {
  const store = ensureParamsStore(frame);
  const target = paramsTargets.get(frame)!;
  batch(() => {
    for (const key of Object.keys(params)) {
      writeParamKey(store, target, key, params[key]);
    }
  });
}

/**
 * Push a fresh props object from a parent render (mountZone). Batched:
 * subscribed child reads re-render once. Keys mountZone previously pushed
 * but absent this round are removed (`undefined` — React prop-removal
 * semantics).
 */
function writeParams(frame: FrameObj, data: Record<string, unknown>): void {
  const store = ensureParamsStore(frame);
  const target = paramsTargets.get(frame)!;
  const propKeys = paramsPropKeys.get(frame)!;
  batch(() => {
    for (const key of propKeys) {
      if (!hasOwnProperty(data, key)) {
        propKeys.delete(key);
        Reflect.deleteProperty(target, key);
        const sig = store.signals.get(key);
        if (sig) sig.value = undefined;
      }
    }
    for (const key of Object.keys(data)) {
      propKeys.add(key);
      writeParamKey(store, target, key, data[key]);
    }
  });
}

// ============================================================
// createFrame — factory function
// ============================================================

/**
 * Create a frame object. Called internally by mountFrame / createRoot.
 * Not intended for direct user use — use `Frame.createRoot()` or
 * `frame.mountFrame()` instead.
 *
 * @internal
 */
export function createFrame(id: string, parentId?: string): FrameObj {
  const emitter = createEmitter();
  const invokeList: FrameInvokeEntry[] = [];
  const childrenMap: Record<string, string> = {};
  const readyMap = new Set<string>();
  let viewPath: string | undefined;
  function getViewPath(): string | undefined {
    return viewPath;
  }

  const frame: FrameObj = {
    id,
    getViewPath,
    parentId,
    view: undefined,
    invokeList,
    signature: 1,
    destroyed: 0,
    hasAltered: 0,
    originalTemplate: undefined,
    holdFireCreated: 0,
    childrenCreated: 0,
    childrenAlter: 0,
    childrenMap,
    childrenCount: 0,
    readyCount: 0,
    readyMap,
    emitter,

    mountView(viewPathArg: string, viewInitParams?: Record<string, unknown>): void {
      const node = document.getElementById(frame.id);

      // Store original template before alter
      if (!frame.hasAltered && node) {
        frame.hasAltered = 1;
        frame.originalTemplate = node.innerHTML;
      }

      // Unmount current view
      frame.unmountView();
      frame.destroyed = 0;

      // Parse view path and params
      const parsed = parseUri(viewPathArg || "");
      const viewClassName = parsed.path;
      if (!node || !viewClassName) return;

      viewPath = viewPathArg;

      // Merge init params
      const initParams: Record<string, unknown> = { ...parsed.params };
      if (viewInitParams) {
        assign(initParams, viewInitParams);
      }

      const sign = frame.signature;

      // Use the require function from Framework config to load the View setup
      const registered = getViewClass(viewClassName);
      if (registered) {
        // Synchronous path: View setup already loaded
        doMountView(registered, initParams, node, sign);
        return;
      }

      // Asynchronous path: load View setup from remote module
      use(viewClassName, (loadedModule: unknown) => {
        // Guard: Frame may have been unmounted or re-mounted during async load
        if (sign !== frame.signature) return;

        if (isViewSetup(loadedModule)) {
          registerViewClass(viewClassName, loadedModule);
          doMountView(loadedModule, initParams, node, sign);
        } else {
          const error = new Error(`Cannot load view: ${viewClassName}`);
          const errorHandler = frameworkConfig.error;
          if (errorHandler) {
            errorHandler(error);
          }
        }
      });
    },

    unmountView(): void {
      const currentView = frame.view;

      // Clear invoke list
      frame.invokeList.length = 0;

      if (!currentView) return;

      // Set global alter if not set
      if (!globalAlter) {
        globalAlter = { id: frame.id };
      }

      // Mark as destroying
      frame.destroyed = 1;

      // Unmount zone (child frames)
      frame.unmountZone();

      // Notify alter
      notifyAlter(frame, globalAlter);

      // Unmount the view (run cleanups, unregister events, destroy resources)
      unmountCtx(currentView);

      // Clear view reference
      frame.view = undefined;

      // Restore original template
      const node = document.getElementById(frame.id);
      if (node && frame.originalTemplate) {
        node.innerHTML = frame.originalTemplate;
      }

      // Reset global alter
      globalAlter = undefined;

      // Increment signature to cancel async operations
      unmark(currentView);
    },

    mountFrame(
      frameId: string,
      viewPathArg: string,
      viewInitParams?: Record<string, unknown>,
    ): FrameObj {
      // Notify alter
      notifyAlter(frame, { id: frameId });

      let childFrame = frameRegistry.get(frameId);

      if (!childFrame) {
        // Add to children map
        if (!frame.childrenMap[frameId]) {
          frame.childrenCount++;
        }
        frame.childrenMap[frameId] = frameId;

        // Always create a new frame object. The frameCache pool is skipped
        // because reInitFrame cannot reassign the readonly `id` field —
        // reusing a cached frame would leave it with a stale id, causing
        // registry lookups and unmountFrame to fail.
        childFrame = createFrame(frameId, frame.id);
      }

      // Mount view
      childFrame.mountView(viewPathArg, viewInitParams);

      return childFrame;
    },

    unmountFrame(id?: string): void {
      const targetId = id ? frame.childrenMap[id] : frame.id;
      const targetFrame = frameRegistry.get(targetId);
      if (!targetFrame) return;

      const wasCreated = targetFrame.readyCount > 0;
      const pId = targetFrame.parentId;

      // Unmount view
      targetFrame.unmountView();

      // Remove from registry (fires the static "remove" event)
      removeFrame(targetId, wasCreated);

      // Remove from parent's children
      const parent = frameRegistry.get(pId ?? "");
      if (parent && parent.childrenMap[targetId]) {
        Reflect.deleteProperty(parent.childrenMap, targetId);
        parent.childrenCount--;
        notifyCreated(parent);
      }
    },

    mountZone(zoneId?: string): void {
      const targetZone = zoneId ?? frame.id;

      // Hold fire created event
      frame.holdFireCreated = 1;

      // Find all child-view host elements in zone
      const rootEl = document.getElementById(targetZone);
      if (!rootEl) return;

      // v-lark is a valid HTML attribute name — no CSS escaping needed
      const selector = `[${LARK_VIEW}]`;
      const viewElements = rootEl.querySelectorAll(selector);
      const mountList: Array<{
        frameId: string;
        viewPathArg: string;
        data: Record<string, unknown>;
        handlers: Record<string, AnyFunc>;
      }> = [];

      // Helper: resolve the single `p-lark` props token into the props
      // object the parent serialized this render. Prop names never pass
      // through HTML attribute names, so camelCase arrives exactly.
      const readProps = (el: Element): Record<string, unknown> => {
        const token = getAttribute(el, LARK_PROP);
        if (!token) return {};
        const resolved = frame.view ? frame.view.translate(token) : undefined;
        return resolved && typeof resolved === "object"
          ? (resolved as Record<string, unknown>)
          : {};
      };

      // Helper: split the props object into child data vs child→parent event
      // handlers (`on` + Capitalized, function value → event "xxx").
      const splitProps = (
        all: Record<string, unknown>,
      ): { data: Record<string, unknown>; handlers: Record<string, AnyFunc> } => {
        const data: Record<string, unknown> = {};
        const handlers: Record<string, AnyFunc> = {};
        for (const key of Object.keys(all)) {
          const value = all[key];
          if (VIEW_EVENT_PROP_REGEXP.test(key) && typeof value === "function") {
            handlers[key[2].toLowerCase() + key.slice(3)] = value as AnyFunc;
          } else {
            data[key] = value;
          }
        }
        return { data, handlers };
      };

      // Helper: (re)wire child→parent event handlers via stable trampolines.
      // The frame emitter subscribes ONE wrapper per event name; each parent
      // render swaps `.current`, so inline closures never go stale. A handler
      // prop removed by the parent parks the trampoline (`current=undefined`).
      // Handler calls run inside `batch()` — multi-signal writes render once.
      const syncHostEvents = (child: FrameObj, handlers: Record<string, AnyFunc>): void => {
        let map = child.hostEvents;
        if (!map && Object.keys(handlers).length === 0) return;
        if (!map) {
          map = {};
          child.hostEvents = map;
        }
        for (const name of Object.keys(map)) {
          if (!handlers[name]) map[name].current = undefined;
        }
        for (const name of Object.keys(handlers)) {
          let holder = map[name];
          if (!holder) {
            holder = map[name] = {};
            const h = holder;
            child.on(name, (data?: Record<string, unknown>) => {
              if (h.current) {
                batch(() =>
                  funcWithTry(h.current as AnyFunc, data ? [data] : [], frame.view, noop),
                );
              }
            });
          }
          holder.current = handlers[name];
        }
      };

      viewElements.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        const elId = el.id || ensureElementId(el, "frame_");

        // Already-bound host element: re-sync events and push props into the
        // existing child's params signals. The child re-renders only if its
        // tracked regions (template/computed/effect) read the changed keys.
        if (htmlElIsBound(el)) {
          const childFrame = frameRegistry.get(elId);
          const childView = childFrame?.view;
          if (childFrame && childView && childView.signature.value > 0) {
            const { data, handlers } = splitProps(readProps(el));
            syncHostEvents(childFrame, handlers);
            writeParams(childFrame, data);
          }
          return;
        }

        // New host element: mount with props and wire events
        Reflect.set(el, "frameBound", 1);
        const viewPathArg = getAttribute(el, LARK_VIEW);
        if (!viewPathArg) return;

        const { data, handlers } = splitProps(readProps(el));
        mountList.push({ frameId: elId, viewPathArg, data, handlers });
      });

      // Mount each frame with props, then wire child→parent events. The
      // writeParams call registers prop ownership (removal tracking) — the
      // values are already seeded, so no notifications fire.
      for (const { frameId, viewPathArg, data, handlers } of mountList) {
        const childFrame = frame.mountFrame(frameId, viewPathArg, data);
        if (childFrame) {
          syncHostEvents(childFrame, handlers);
          writeParams(childFrame, data);
        }
      }

      // Release hold
      frame.holdFireCreated = 0;

      // Notify created
      notifyCreated(frame);
    },

    unmountZone(zoneId?: string): void {
      for (const childId in frame.childrenMap) {
        if (hasOwnProperty(frame.childrenMap, childId)) {
          if (!zoneId || childId !== zoneId) {
            frame.unmountFrame(childId);
          }
        }
      }
      notifyCreated(frame);
    },

    parent(level = 1): FrameObj | undefined {
      let result: FrameObj | undefined = undefined;
      let currentPid: string | undefined = frame.parentId;
      let n = level >>> 0 || 1;
      while (currentPid && n--) {
        result = frameRegistry.get(currentPid);
        currentPid = result?.parentId;
      }
      return result;
    },

    invoke(name: string, args?: unknown[]): unknown {
      let result: unknown;
      const currentView = frame.view;

      if (currentView && currentView.rendered.value) {
        // View is rendered, invoke directly
        const fn = Reflect.get(currentView, name);
        if (typeof fn === "function") {
          result = funcWithTry(fn, args ?? [], currentView, noop);
        }
      } else {
        // View not rendered, add to invoke list
        const key = SPLITTER + name;
        let existingEntry: FrameInvokeEntry | undefined;

        for (const entry of frame.invokeList) {
          if (entry.key === key) {
            existingEntry = entry;
            break;
          }
        }

        if (existingEntry) {
          existingEntry.removed = args === existingEntry.args;
        }

        const newEntry: FrameInvokeEntry = {
          name,
          args: args ?? [],
          key,
        };
        frame.invokeList.push(newEntry);
      }

      return result;
    },

    children(): string[] {
      const result: string[] = [];
      for (const id in frame.childrenMap) {
        if (hasOwnProperty(frame.childrenMap, id)) {
          result.push(id);
        }
      }
      return result;
    },

    on(event: string, handler: AnyFunc): FrameObj {
      emitter.on(event, handler);
      return frame;
    },

    off(event: string, handler?: AnyFunc): FrameObj {
      emitter.off(event, handler);
      return frame;
    },

    fire(event: string, data?: Record<string, unknown>): FrameObj {
      emitter.fire(event, data);
      return frame;
    },
  };

  // Register frame
  frameRegistry.set(id, frame);

  // Attach frame to DOM element
  const element = document.getElementById(id);
  if (element) {
    Reflect.set(element, "frame", frame);
    Reflect.set(element, "frameBound", 1);
  }

  // Fire add event
  staticEmitter.fire("add", { frame });

  return frame;
}

// ============================================================
// doMountView — internal: mount after setup is loaded
// ============================================================

function doMountView(
  setup: ViewSetup,
  params: Record<string, unknown>,
  node: HTMLElement,
  sign: number,
): void {
  // This function is called in the context of a specific frame.
  // But since we're functional, we need the frame reference.
  // The frame is found via the node's id.
  const frameId = node.id;
  const frame = frameRegistry.get(frameId);
  if (!frame) return;
  if (sign !== frame.signature) return; // Frame may have been unmounted

  // Seed the reactive params store and hand the tracked proxy to setup —
  // `params.key` reads inside the template subscribe the view, and later
  // parent renders push fresh values through the same signals (mountZone).
  const store = ensureParamsStore(frame);
  seedParams(frame, params);

  // Create ctx and run setup
  const ctx = mountCtx(frame, setup, store.proxy);
  frame.view = ctx;

  // Fire created event for child frames
  runInvokes(frame);
}

// ============================================================
// Frame singleton — static-like methods
// ============================================================

export interface FrameApi {
  get(id: string): FrameObj | undefined;
  getAll(): Map<string, FrameObj>;
  getRoot(): FrameObj | undefined;
  createRoot(rootId?: string): FrameObj;
  on(event: string, handler: AnyFunc): FrameApi;
  off(event: string, handler?: AnyFunc): FrameApi;
  fire(event: string, data?: Record<string, unknown>): void;
}

export const Frame: FrameApi = {
  /** Get frame by ID */
  get(id: string): FrameObj | undefined {
    return frameRegistry.get(id);
  },

  /** Get all frames */
  getAll(): Map<string, FrameObj> {
    return frameRegistry;
  },

  /**
   * Returns the existing root frame, or undefined if none has been created.
   */
  getRoot(): FrameObj | undefined {
    return rootFrame;
  },

  /**
   * Create (or return) the singleton root frame.
   * Idempotent: subsequent calls always return the original root.
   */
  createRoot(rootId?: string): FrameObj {
    if (!rootFrame) {
      const id = rootId ?? "root";

      let rootElement = document.getElementById(id);
      if (!rootElement) {
        rootElement = document.body;
        rootElement.id = id;
      }

      rootFrame = createFrame(id);
    }
    return rootFrame;
  },

  /** Bind event listener (static) */
  on(event: string, handler: AnyFunc): typeof Frame {
    staticEmitter.on(event, handler);
    return Frame;
  },

  /** Unbind event listener (static) */
  off(event: string, handler?: AnyFunc): typeof Frame {
    staticEmitter.off(event, handler);
    return Frame;
  },

  /** Fire event (static) */
  fire(event: string, data?: Record<string, unknown>): void {
    staticEmitter.fire(event, data);
  },
};

// ============================================================
// Internal helper functions
// ============================================================

/**
 * Check whether a DOM element already has a Frame attached.
 *
 * Prevents `mountZone` from re-initializing an element that's already
 * bound to a child Frame.
 */
function htmlElIsBound(element: HTMLElement): boolean {
  return !!Reflect.get(element, "frameBound");
}

/**
 * Remove a frame from the registry, fire the static `remove` event, and
 * clear the DOM element's frame reference.
 */
function removeFrame(id: string, wasCreated: boolean): void {
  const frameInstance = frameRegistry.get(id);
  if (!frameInstance) return;

  frameRegistry.delete(id);

  // Fire remove event
  staticEmitter.fire("remove", { frame: frameInstance, fcc: wasCreated });

  // Clear DOM reference
  const element = document.getElementById(id);
  if (element) {
    Reflect.set(element, "frameBound", 0);
    Reflect.deleteProperty(element, "frame");
  }
}

/**
 * Propagate a `created` event up the Frame tree.
 *
 * A frame fires `created` when all its child frames have finished mounting
 * (`childrenCount === readyCount`). The event bubbles to the parent, which
 * increments its own `readyCount` and may itself fire `created`.
 */
function notifyCreated(frameInstance: FrameObj): void {
  if (
    !frameInstance.childrenCreated &&
    !frameInstance.holdFireCreated &&
    frameInstance.childrenCount === frameInstance.readyCount
  ) {
    frameInstance.childrenCreated = 1;
    frameInstance.childrenAlter = 0;
    frameInstance.emitter.fire("created");

    const pId = frameInstance.parentId;
    if (pId) {
      const parent = frameRegistry.get(pId);
      if (parent && !parent.readyMap.has(frameInstance.id)) {
        parent.readyMap.add(frameInstance.id);
        parent.readyCount++;
        notifyCreated(parent);
      }
    }
  }
}

/**
 * Propagate an `alter` event up the Frame tree.
 *
 * Fires when a child frame's content changes (e.g. before unmounting),
 * transitioning the parent from `created` to `alter` state. Decrements
 * the parent's `readyCount` and may bubble further up.
 */
function notifyAlter(frameInstance: FrameObj, data: { id: string }): void {
  if (!frameInstance.childrenAlter && frameInstance.childrenCreated) {
    frameInstance.childrenCreated = 0;
    frameInstance.childrenAlter = 1;
    frameInstance.emitter.fire("alter", data);

    const pId = frameInstance.parentId;
    if (pId) {
      const parent = frameRegistry.get(pId);
      if (parent && parent.readyMap.has(frameInstance.id)) {
        parent.readyCount--;
        parent.readyMap.delete(frameInstance.id);
        notifyAlter(parent, data);
      }
    }
  }
}

// ============================================================
// View setup registration (re-exported)
// ============================================================

export { registerViewClass, invalidateViewClass } from "./view-registry";
