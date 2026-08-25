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
 * on every render pass inside a per-instance render effect — the body IS the
 * tracked template. State lives in call-order-indexed hook slots (`useSignal`,
 * `useEffect`, ... — see ./hooks.ts), which are preserved across re-runs.
 *
 * This module owns everything about an instance EXCEPT its rendered DOM
 * slice (nodes/anchor live on the reconciler's `RComponent` bookkeeping):
 *
 * - the **props store** — one shallow signal per prop key behind a stable
 *   proxy; reading `props.x` inside the component body subscribes the
 *   instance to THAT key only (finer-grained than React's whole-props
 *   identity model). Shallow: parent-owned objects keep their identity.
 * - the **hook slot array** + `currentInstance` tracking (rules of hooks)
 * - **mount flushing** — `useEffect` callbacks run after the DOM commit
 * - **teardown** — hook slots disposed in reverse order (`onCleanup`
 *   callbacks are slots too)
 * - the **live-instance registry** used by HMR to hot-swap component code
 *   while preserving state slots
 *
 * There is deliberately NO deps-array machinery: signals are the single
 * dependency-tracking mechanism — derive with `useComputed`, react with
 * `useSignalEffect`.
 */
import { shallowSignal, isFlushRunaway, queueJob, untracked, type Signal } from "./reactive";
import { hasOwnProperty, devWarn } from "./utils";
import type { Component } from "./jsx/vnode";

// ============================================================
// Hook slots
// ============================================================

const VALUE_SLOT = 1;
const MOUNT_SLOT = 2;

/** A once-created value (signal, ref cell, computed, effect dispose). */
export interface ValueSlot {
  t: typeof VALUE_SLOT;
  value: unknown;
  /** Disposer run on unmount (and on HMR swap unless `keep`). */
  dispose?: (value: unknown) => void;
  /** Plain state (signals/refs) — preserved across HMR swaps. */
  keep?: boolean;
}

/** `useEffect` slot — run once post-commit; cleanup on unmount. */
export interface MountSlot {
  t: typeof MOUNT_SLOT;
  fn: () => void | (() => void);
  cleanup: (() => void) | undefined;
  /** Set on creation; cleared by `flushInstanceEffects`. */
  pending: boolean;
}

export type HookSlot = ValueSlot | MountSlot;

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
  /** Debug id (creation sequence) — used in [larky] logs. */
  id: number;
  destroyed: boolean;
  /** Stable tracked props proxy passed to `fn` on every render. */
  proxy: Record<string, unknown>;
  /** Proxy target — plain mirror of current props (spread/`in` support). */
  propsTarget: Record<string, unknown>;
  /** One shallow signal per prop key (created on first sight). */
  propsSignals: Map<string, Signal<unknown>>;
  /** Bumped when the prop KEY SET changes — tracks `in`/spread/Object.keys. */
  keysVersion: Signal<number>;
  /** Plain mirror of `keysVersion` — bump without a tracked read. */
  keysN: number;
  /** Keys owned by parent pushes — removal candidates (React semantics). */
  propsKeys: Set<string>;
  /** Call-order-indexed hook slots. */
  hooks: Array<HookSlot | undefined>;
  hookIndex: number;
  /** Hook count of the last completed render (rules-of-hooks check). */
  hookCount: number;
  /** Completed render passes (0 = mounting; reset by HMR swaps). */
  renderCount: number;
  /** Manual/HMR re-render channel — the render effect reads it. */
  invalidate: Signal<number>;
  /** Plain mirror of `invalidate` — bump without a tracked read. */
  invalidateN: number;
  /** Dispose of the instance's render effect (set by the reconciler). */
  renderDispose: (() => void) | undefined;
}

let instanceSeq = 0;

/** `Name#id` label for [larky] debug logs. */
export function debugName(inst: Instance): string {
  return `${inst.fn.name || "anonymous"}#${inst.id}`;
}

/** Create an instance for a component function (props seeded separately). */
export function createInstance(fn: Component): Instance {
  const propsSignals = new Map<string, Signal<unknown>>();
  const propsTarget: Record<string, unknown> = {};
  const keysVersion = shallowSignal(0);
  const proxy = new Proxy(propsTarget, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const sig = propsSignals.get(prop);
        if (sig) return sig.value; // tracked read
      }
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      void keysVersion.value; // tracked — `"x" in props` reacts to key changes
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      void keysVersion.value; // tracked — spread / Object.keys react to key changes
      return Reflect.ownKeys(target);
    },
  });
  return {
    fn,
    id: ++instanceSeq,
    destroyed: false,
    proxy,
    propsTarget,
    propsSignals,
    keysVersion,
    keysN: 0,
    propsKeys: new Set(),
    hooks: [],
    hookIndex: 0,
    hookCount: 0,
    renderCount: 0,
    invalidate: shallowSignal(0),
    invalidateN: 0,
    renderDispose: undefined,
  };
}

/** Invalidate the instance — its render job enqueues on the microtask queue. */
export function invalidateInstance(inst: Instance): void {
  if (isFlushRunaway()) console.error(`[larky] invalidate ${debugName(inst)}`);
  inst.invalidate.value = ++inst.invalidateN;
}

/**
 * Push a props object into the instance's per-key signals. Writes enqueue
 * subscribed render jobs on the microtask queue (deduplicated — one
 * re-render). Keys previously pushed but absent this round are removed
 * (`undefined` — React prop-removal semantics). The vnode-level `key` never
 * lands in props.
 */
export function writeInstanceProps(inst: Instance, props: Record<string, unknown>): void {
  const { propsSignals, propsTarget, propsKeys } = inst;
  let keysChanged = false;
  // Runaway-only diagnostics — zero allocation on the normal hot path.
  const changed: string[] | null = isFlushRunaway() ? [] : null;
  for (const key of propsKeys) {
    if (!hasOwnProperty(props, key)) {
      propsKeys.delete(key);
      Reflect.deleteProperty(propsTarget, key);
      keysChanged = true;
      changed?.push(`-${key}`);
      const sig = propsSignals.get(key);
      if (sig) sig.value = undefined;
    }
  }
  for (const key of Object.keys(props)) {
    if (key === "key") continue;
    if (!propsKeys.has(key)) {
      propsKeys.add(key);
      keysChanged = true;
    }
    const value = props[key];
    if (changed && !Object.is(propsTarget[key], value)) changed.push(key);
    propsTarget[key] = value;
    const sig = propsSignals.get(key);
    if (sig) {
      sig.value = value; // shallow signal — same-value writes are no-ops
    } else {
      propsSignals.set(key, shallowSignal(value));
    }
  }
  if (changed && changed.length > 0) {
    console.error(`[larky] props→${debugName(inst)}: ${changed.join(", ")}`);
  }
  // Plain mirror ++: reading `keysVersion.value` here would run inside the
  // parent's tracked render effect on the seed path and subscribe the parent.
  if (keysChanged) inst.keysVersion.value = ++inst.keysN;
}

// ============================================================
// Current instance + render bracketing (rules of hooks)
// ============================================================

let currentInstance: Instance | null = null;

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
  if (inst.renderCount > 0 && inst.hookIndex !== inst.hookCount) {
    devWarn(
      `Component "${inst.fn.name || "anonymous"}" called a different number of hooks ` +
        `than the previous render (${inst.hookIndex} vs ${inst.hookCount}). ` +
        `Hooks must run unconditionally in the same order every render.`,
    );
  }
  // Dispose orphaned trailing slots: hook-count shrink between renders, or
  // leftover `keep` slots after an HMR swap to a version with fewer hooks.
  if (inst.hooks.length > inst.hookIndex) {
    for (let i = inst.hooks.length - 1; i >= inst.hookIndex; i--) {
      const slot = inst.hooks[i];
      if (slot) disposeSlot(slot);
    }
    inst.hooks.length = inst.hookIndex;
  }
  inst.hookCount = inst.hookIndex;
  inst.renderCount++;
}

// ============================================================
// Slot primitives (consumed by ./hooks.ts)
// ============================================================

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

/**
 * `useEffect` slot (mount-only): registered on the first render, run once
 * post-commit via `flushInstanceEffects` (the DOM exists). A returned
 * function is the unmount cleanup. Later renders are no-ops (the first
 * render's `fn` wins).
 */
export function useMountSlot(fn: () => void | (() => void)): void {
  const inst = requireInstance("useEffect");
  const i = inst.hookIndex++;
  const prev = inst.hooks[i];
  if (prev) {
    if (prev.t === MOUNT_SLOT) return;
    replaceSlotWarn(inst, prev);
  }
  inst.hooks[i] = { t: MOUNT_SLOT, fn, cleanup: undefined, pending: true };
}

// ============================================================
// Post-commit mounts / teardown
// ============================================================

/**
 * Run pending `useEffect` callbacks (slot order). Runs INSIDE a scheduler
 * job (see `queueMountEffects`), untracked. Errors bubble to the flush site
 * — there is no swallowing.
 */
export function flushInstanceEffects(inst: Instance): void {
  for (const slot of inst.hooks) {
    if (slot && slot.t === MOUNT_SLOT && slot.pending && !inst.destroyed) {
      slot.pending = false;
      const result = slot.fn();
      if (typeof result === "function") {
        slot.cleanup = result;
      }
    }
  }
}

/**
 * Defer the instance's pending `useEffect`s to a scheduler job.
 *
 * They must NOT run inside the instance's render effect: @vue/reactivity
 * suppresses a running effect re-triggering itself, so a mount effect that
 * synchronously writes a signal the component body reads would be silently
 * dropped. As a job they run in the SAME flush after the tree committed
 * (children before parents, React passive-effect order); the imperative
 * `render()` entry drains the queue synchronously.
 */
export function queueMountEffects(inst: Instance): void {
  let pending = false;
  for (const slot of inst.hooks) {
    if (slot && slot.t === MOUNT_SLOT && slot.pending) {
      pending = true;
      break;
    }
  }
  if (!pending) return;
  queueJob(() => untracked(() => flushInstanceEffects(inst)), `mountEffects<${debugName(inst)}>`);
}

function disposeSlot(slot: HookSlot): void {
  if (slot.t === MOUNT_SLOT) {
    if (slot.cleanup) {
      const cleanup = slot.cleanup;
      slot.cleanup = undefined;
      cleanup();
    }
  } else if (slot.dispose) {
    slot.dispose(slot.value);
  }
}

/**
 * Destroy the instance's logical state: dispose hook slots in reverse order
 * (`useSignalEffect` disposers, `useEffect` cleanups, and `onCleanup`
 * callbacks are all slots), unregister from the HMR registry. The reconciler
 * disposes the render effect and removes the DOM range separately (child
 * instances are destroyed before this runs — React's
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
 * (effects, computeds) is disposed and recreated by the next render so no
 * stale closures linger. Caller triggers the re-render via
 * `invalidateInstance`.
 *
 * Known limit: keep slots pair by CALL ORDER (there is no Fast-Refresh-style
 * signature hashing), so an edit that reorders `useSignal`/`useRef` calls can
 * hand a slot's old state to a different hook. Trailing surplus slots are
 * disposed by the post-swap render (`endRender`).
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
  // The new version may legitimately use a different hook layout — treat the
  // next render as a mount for the hook-count check.
  inst.renderCount = 0;
}
