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
 * Component instance runtime (React-FC model).
 *
 * A component is a plain function `(props) => JSXNode`. The function re-runs
 * on every render pass inside a per-instance signals effect — the body IS the
 * tracked template. State lives in call-order-indexed hook slots (`useSignal`,
 * `useEffect`, ... — see ./hooks.ts), which are preserved across re-runs.
 *
 * This module owns everything about an instance EXCEPT its rendered DOM
 * slice (nodes/anchor live on the reconciler's `RComponent` bookkeeping):
 *
 * - the **props store** — one signal per prop key behind a stable proxy;
 *   reading `props.x` inside the component body subscribes the instance to
 *   THAT key only (finer-grained than React's whole-props identity model)
 * - the **hook slot array** + `currentInstance` tracking (rules of hooks)
 * - **effect flushing** — `useEffect` callbacks run after the DOM commit
 * - **teardown** — slot disposal + `onCleanup` callbacks in reverse order
 * - the **live-instance registry** used by HMR to hot-swap component code
 *   while preserving state slots
 */
import { signal, batch, type Signal } from "./reactive";
import { funcWithTry, noop, hasOwnProperty, devWarn } from "./utils";
import type { Component } from "./jsx/vnode";

// ============================================================
// Hook slots
// ============================================================

export const VALUE_SLOT = 1;
export const MEMO_SLOT = 2;
export const EFFECT_SLOT = 3;

/** A once-created value (signal, ref cell, computed, effect dispose, query). */
export interface ValueSlot {
  t: typeof VALUE_SLOT;
  value: unknown;
  /** Disposer run on unmount (and on HMR swap unless `keep`). */
  dispose?: (value: unknown) => void;
  /** Plain state (signals/refs) — preserved across HMR swaps. */
  keep?: boolean;
}

/** `useMemo` slot — recomputed when deps change. */
export interface MemoSlot {
  t: typeof MEMO_SLOT;
  value: unknown;
  deps: unknown[] | undefined;
}

/** `useEffect` slot — run post-commit when deps change. */
export interface EffectSlot {
  t: typeof EFFECT_SLOT;
  fn: () => void | (() => void);
  deps: unknown[] | undefined;
  cleanup: (() => void) | undefined;
  /** Set when deps changed this render; cleared by `flushInstanceEffects`. */
  pending: boolean;
}

export type HookSlot = ValueSlot | MemoSlot | EffectSlot;

// ============================================================
// Instance
// ============================================================

/**
 * A live component instance. Created by the reconciler when a function tag
 * mounts; destroyed when the tag leaves the tree.
 */
export interface Instance {
  /** The component function (mutated in place by HMR swaps). */
  fn: Component;
  destroyed: boolean;
  /** Stable tracked props proxy passed to `fn` on every render. */
  proxy: Record<string, unknown>;
  /** Proxy target — plain mirror of current props (spread/`in` support). */
  propsTarget: Record<string, unknown>;
  /** One signal per prop key (created on first sight). */
  propsSignals: Map<string, Signal<unknown>>;
  /** Keys owned by parent pushes — removal candidates (React semantics). */
  propsKeys: Set<string>;
  /** Call-order-indexed hook slots. */
  hooks: Array<HookSlot | undefined>;
  hookIndex: number;
  /** Completed render passes (0 = mounting). */
  renderCount: number;
  /** Manual/HMR re-render channel — the render effect reads it. */
  invalidate: Signal<number>;
  /** `onCleanup` callbacks (and other unmount-time disposers). */
  cleanups: Array<() => void>;
  /** Dispose of the instance's render effect (set by the reconciler). */
  renderDispose: (() => void) | undefined;
}

/** Create an instance for a component function (props seeded separately). */
export function createInstance(fn: Component): Instance {
  const propsSignals = new Map<string, Signal<unknown>>();
  const propsTarget: Record<string, unknown> = {};
  const proxy = new Proxy(propsTarget, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const sig = propsSignals.get(prop);
        if (sig) return sig.value; // tracked read
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return {
    fn,
    destroyed: false,
    proxy,
    propsTarget,
    propsSignals,
    propsKeys: new Set(),
    hooks: [],
    hookIndex: 0,
    renderCount: 0,
    invalidate: signal(0),
    cleanups: [],
    renderDispose: undefined,
  };
}

/**
 * Push a props object into the instance's per-key signals. Batched —
 * subscribed reads re-render once. Keys previously pushed but absent this
 * round are removed (`undefined` — React prop-removal semantics). The
 * vnode-level `key` never lands in props.
 */
export function writeInstanceProps(inst: Instance, props: Record<string, unknown>): void {
  const { propsSignals, propsTarget, propsKeys } = inst;
  batch(() => {
    for (const key of propsKeys) {
      if (!hasOwnProperty(props, key)) {
        propsKeys.delete(key);
        Reflect.deleteProperty(propsTarget, key);
        const sig = propsSignals.get(key);
        if (sig) sig.value = undefined;
      }
    }
    for (const key of Object.keys(props)) {
      if (key === "key") continue;
      propsKeys.add(key);
      const value = props[key];
      propsTarget[key] = value;
      const sig = propsSignals.get(key);
      if (sig) {
        sig.value = value; // same-value writes are no-ops
      } else {
        propsSignals.set(key, signal(value));
      }
    }
  });
}

// ============================================================
// Current instance + render bracketing (rules of hooks)
// ============================================================

let currentInstance: Instance | null = null;

/** The instance currently rendering, or `null` outside a component body. */
export function getCurrentInstance(): Instance | null {
  return currentInstance;
}

/** Get the current instance or throw (hooks outside a component body). */
export function requireInstance(hook: string): Instance {
  if (!currentInstance) {
    throw new Error(`${hook} can only be called inside a component function`);
  }
  return currentInstance;
}

/**
 * Enter a render pass: set the hook context and reset the slot cursor.
 * Returns the previously current instance — pass it back to `endRender`
 * (stack discipline: nested passes restore the outer context).
 */
export function beginRender(inst: Instance): Instance | null {
  const prev = currentInstance;
  currentInstance = inst;
  inst.hookIndex = 0;
  return prev;
}

/** Leave a render pass: verify hook-count stability, bump the pass counter. */
export function endRender(inst: Instance, prev: Instance | null): void {
  currentInstance = prev;
  if (inst.renderCount > 0 && inst.hookIndex !== inst.hooks.length) {
    devWarn(
      `Component "${inst.fn.name || "anonymous"}" called a different number of hooks ` +
        `than the previous render (${inst.hookIndex} vs ${inst.hooks.length}). ` +
        `Hooks must run unconditionally in the same order every render.`,
    );
    inst.hooks.length = inst.hookIndex;
  }
  inst.renderCount++;
}

// ============================================================
// Slot primitives (consumed by ./hooks.ts)
// ============================================================

/** Shallow deps comparison (React semantics — `Object.is` per entry). */
export function depsDiffer(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return true;
  }
  return false;
}

function replaceSlotWarn(inst: Instance, prev: HookSlot): void {
  devWarn(
    `Component "${inst.fn.name || "anonymous"}" changed the type of a hook between ` +
      `renders — the previous slot was reset. Hooks must run in a stable order.`,
  );
  disposeSlot(prev);
}

/**
 * A once-created value slot: `create` runs on the first render (or after an
 * HMR reset); later renders return the stored value. `dispose` runs on
 * unmount. `keep: true` marks plain state preserved across HMR swaps.
 */
export function useValueSlot<T>(create: () => T, dispose?: (value: T) => void, keep?: boolean): T {
  const inst = requireInstance("useValueSlot");
  const i = inst.hookIndex++;
  const prev = inst.hooks[i];
  if (prev) {
    if (prev.t === VALUE_SLOT) return prev.value as T;
    replaceSlotWarn(inst, prev);
  }
  const value = create();
  inst.hooks[i] = {
    t: VALUE_SLOT,
    value,
    dispose: dispose as ((value: unknown) => void) | undefined,
    keep: !!keep,
  };
  return value;
}

/** `useMemo` slot: recompute when deps change (no deps → every render). */
export function useMemoSlot<T>(compute: () => T, deps: unknown[] | undefined): T {
  const inst = requireInstance("useMemo");
  const i = inst.hookIndex++;
  const prev = inst.hooks[i];
  if (prev) {
    if (prev.t === MEMO_SLOT) {
      if (deps && prev.deps && !depsDiffer(prev.deps, deps)) return prev.value as T;
    } else {
      replaceSlotWarn(inst, prev);
    }
  }
  const value = compute();
  inst.hooks[i] = { t: MEMO_SLOT, value, deps };
  return value;
}

/**
 * `useEffect` slot: marks the effect pending when deps changed (no deps →
 * every render; `[]` → mount only). Pending effects run post-commit via
 * `flushInstanceEffects`; the previous cleanup runs first.
 */
export function useEffectSlot(fn: () => void | (() => void), deps: unknown[] | undefined): void {
  const inst = requireInstance("useEffect");
  const i = inst.hookIndex++;
  const prev = inst.hooks[i];
  if (prev) {
    if (prev.t === EFFECT_SLOT) {
      prev.fn = fn;
      if (!deps || !prev.deps || depsDiffer(prev.deps, deps)) prev.pending = true;
      prev.deps = deps;
      return;
    }
    replaceSlotWarn(inst, prev);
  }
  inst.hooks[i] = { t: EFFECT_SLOT, fn, deps, cleanup: undefined, pending: true };
}

// ============================================================
// Post-commit effects / teardown
// ============================================================

/**
 * Run pending `useEffect` callbacks (slot order). The previous cleanup runs
 * before its effect re-runs. Called by the reconciler after the DOM commit,
 * inside `untracked()`.
 */
export function flushInstanceEffects(inst: Instance): void {
  for (const slot of inst.hooks) {
    if (slot && slot.t === EFFECT_SLOT && slot.pending && !inst.destroyed) {
      slot.pending = false;
      if (slot.cleanup) {
        const cleanup = slot.cleanup;
        slot.cleanup = undefined;
        funcWithTry(cleanup, [], null, noop);
      }
      const result = funcWithTry(slot.fn, [], null, noop);
      if (typeof result === "function") {
        slot.cleanup = result as () => void;
      }
    }
  }
}

function disposeSlot(slot: HookSlot): void {
  if (slot.t === EFFECT_SLOT) {
    if (slot.cleanup) {
      const cleanup = slot.cleanup;
      slot.cleanup = undefined;
      funcWithTry(cleanup, [], null, noop);
    }
  } else if (slot.t === VALUE_SLOT && slot.dispose) {
    funcWithTry(slot.dispose, [slot.value], null, noop);
  }
}

/**
 * Destroy the instance's logical state: dispose hook slots (reverse order),
 * run `onCleanup` callbacks (reverse order), unregister from the HMR
 * registry. The reconciler disposes the render effect and removes the DOM
 * range separately (child instances are destroyed before this runs — React's
 * child-cleanups-before-parent order).
 */
export function destroyInstanceState(inst: Instance): void {
  if (inst.destroyed) return;
  inst.destroyed = true;
  unregisterInstance(inst);
  for (let i = inst.hooks.length - 1; i >= 0; i--) {
    const slot = inst.hooks[i];
    if (slot) disposeSlot(slot);
  }
  inst.hooks.length = 0;
  for (let i = inst.cleanups.length - 1; i >= 0; i--) {
    funcWithTry(inst.cleanups[i], [], null, noop);
  }
  inst.cleanups.length = 0;
}

// ============================================================
// Live-instance registry (HMR)
// ============================================================

/** Live instances per component function. */
const instanceRegistry = new Map<Component, Set<Instance>>();

/** Register a mounted instance (reconciler mount path). */
export function registerInstance(inst: Instance): void {
  let set = instanceRegistry.get(inst.fn);
  if (!set) {
    set = new Set();
    instanceRegistry.set(inst.fn, set);
  }
  set.add(inst);
}

/** Unregister a destroyed instance. */
export function unregisterInstance(inst: Instance): void {
  const set = instanceRegistry.get(inst.fn);
  if (set) {
    set.delete(inst);
    if (set.size === 0) instanceRegistry.delete(inst.fn);
  }
}

/** Live instances of a component function (empty set if none). */
export function getInstances(fn: Component): ReadonlySet<Instance> {
  return instanceRegistry.get(fn) ?? EMPTY_INSTANCES;
}

const EMPTY_INSTANCES: ReadonlySet<Instance> = new Set();

/**
 * Swap the instance's component function (HMR). Plain state slots
 * (`useSignal`/`useRef`, marked `keep`) survive; everything closure-bound
 * (effects, computeds, memos, queries) is disposed and recreated by the next
 * render so no stale closures linger. Caller triggers the re-render via
 * `inst.invalidate`.
 */
export function swapInstanceFn(inst: Instance, newFn: Component): void {
  unregisterInstance(inst);
  inst.fn = newFn;
  registerInstance(inst);
  for (let i = 0; i < inst.hooks.length; i++) {
    const slot = inst.hooks[i];
    if (!slot) continue;
    if (slot.t === VALUE_SLOT && slot.keep) continue;
    disposeSlot(slot);
    inst.hooks[i] = undefined;
  }
}
