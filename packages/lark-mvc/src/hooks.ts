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
 * Hooks runtime for the functional view system.
 *
 * Hooks (`useSignal`, `useEffect`, `useSignalEffect`, etc.) work via a
 * module-level `currentCtx` that is set during setup function execution. The
 * setup function runs once on mount (inside `mountCtx`), and hooks register
 * signals, effects, and subscriptions on the ctx.
 *
 * Key difference from React hooks: Lark's setup runs ONCE (not on every
 * render). View-local state lives in signals closed over by the template —
 * the template runs inside the view's render effect, so signal reads
 * subscribe the view and writes re-render it automatically.
 */
import type { ViewCtx, AnyFunc } from "./types";
import { signal, effect, type Signal } from "./reactive";

// ============================================================
// Current context — set during setup function execution
// ============================================================

let currentCtx: ViewCtx | null = null;

/**
 * Set the current ctx. Called by `mountCtx` before running the setup function.
 * @internal
 */
export function setCurrentCtx(ctx: ViewCtx | null): void {
  currentCtx = ctx;
}

/**
 * Get the current ctx. Throws if called outside a setup function.
 */
function getCtx(): ViewCtx {
  if (!currentCtx) {
    throw new Error("Hooks can only be called inside a view setup function");
  }
  return currentCtx;
}

// ============================================================
// useSignal — keyed view-local signal (HMR-stable)
// ============================================================

/**
 * Declare a keyed view-local signal.
 *
 * Identical to `signal(initial)` except the signal is stored on the ctx by
 * key and REUSED when the setup re-runs on the same ctx (HMR hot-swap) — so
 * state survives hot updates. Use plain `signal()` when HMR persistence
 * doesn't matter.
 *
 * @param key - Stable key identifying this piece of state
 * @param initial - Initial value (used only when the signal is first created)
 *
 * @example
 * const count = useSignal("count", 0);
 * // template: <button onClick={() => count.value++}>{count.value}</button>
 */
export function useSignal<T>(key: string, initial: T): Signal<T> {
  const ctx = getCtx();
  let sig = ctx.signals.get(key);
  if (!sig) {
    sig = signal(initial) as Signal<unknown>;
    ctx.signals.set(key, sig);
  }
  return sig as Signal<T>;
}

// ============================================================
// useSignalEffect — reactive side effect bound to the view lifecycle
// ============================================================

/**
 * Run a reactive side effect tied to the view lifecycle.
 *
 * The callback runs immediately and re-runs whenever any signal it read
 * changes (`State.get(key)`, `Router.parse()`, store reads, local signals).
 * A returned function is used as the between-runs / final cleanup, matching
 * `@preact/signals-core` `effect` semantics. The effect is disposed on view
 * destroy (and before HMR re-setup).
 *
 * Do not WRITE signals the callback also reads — that is a cycle. For async
 * work, read the signals first, then continue inside `untracked()` /
 * `ctx.wrapAsync`.
 *
 * @example
 * useSignalEffect(() => {
 *   const path = Router.parse().path; // subscribe to navigation
 *   void loadContent(path);
 * });
 */
export function useSignalEffect(fn: () => void | (() => void)): void {
  const ctx = getCtx();
  const dispose = effect(fn);
  ctx.cleanups.push(dispose);
}

// ============================================================
// useEffect — register cleanup functions
// ============================================================

/**
 * Register a side effect with optional cleanup.
 *
 * The effect function runs immediately during setup. If it returns a cleanup
 * function, that cleanup is called on view destroy (or on HMR re-setup).
 *
 * Unlike React's `useEffect`, this runs synchronously during setup (not
 * deferred to a later tick) and does not re-run on dependency changes
 * (since setup only runs once). For reactive re-runs use `useSignalEffect`.
 *
 * @example
 * useEffect(() => {
 *   const timer = setInterval(tick, 1000);
 *   return () => clearInterval(timer);
 * });
 */
export function useEffect(fn: () => (() => void) | void, _deps?: unknown[]): void {
  const ctx = getCtx();
  const cleanup = fn();
  if (typeof cleanup === "function") {
    ctx.cleanups.push(cleanup);
  }
}

// ============================================================
// useInterval — setInterval with automatic cleanup
// ============================================================

/**
 * Set up an interval that is automatically cleared on view destroy.
 *
 * @param fn - Function to call on each interval
 * @param delay - Interval delay in milliseconds
 *
 * @example
 * const time = useSignal("time", Date.now());
 * useInterval(() => {
 *   time.value = Date.now();
 * }, 1000);
 */
export function useInterval(fn: () => void, delay: number): void {
  const ctx = getCtx();
  const timer = setInterval(fn, delay);
  ctx.cleanups.push(() => clearInterval(timer));
}

// ============================================================
// useTimeout — setTimeout with automatic cleanup
// ============================================================

/**
 * Set up a timeout that is automatically cleared on view destroy.
 *
 * @param fn - Function to call after delay
 * @param delay - Timeout delay in milliseconds
 */
export function useTimeout(fn: () => void, delay: number): void {
  const ctx = getCtx();
  const timer = setTimeout(fn, delay);
  ctx.cleanups.push(() => clearTimeout(timer));
}

// ============================================================
// useResource — capture a resource with automatic cleanup
// ============================================================

/**
 * Capture a resource (e.g., a Service instance, observer, etc.) that is
 * automatically destroyed on view destroy or render (if destroyOnRender).
 *
 * @param key - Unique key for the resource
 * @param resource - The resource object (must have a `destroy()` method)
 * @param destroyOnRender - If true, destroyed on next render
 *
 * @example
 * const service = createService(syncFn);
 * useResource('myService', service.instance(), true);
 */
export function useResource(key: string, resource: unknown, destroyOnRender = false): void {
  const ctx = getCtx();
  ctx.capture(key, resource, destroyOnRender);
}

// ============================================================
// useEvent — register an event handler on the ctx emitter
// ============================================================

/**
 * Register an event handler on the view's internal emitter.
 * Automatically unregistered on view destroy.
 *
 * @param event - Event name (e.g., "destroy", "render")
 * @param handler - Event handler function
 *
 * @example
 * useEvent("destroy", () => console.log("View destroyed"));
 */
export function useEvent(event: string, handler: AnyFunc): void {
  const ctx = getCtx();
  const off = ctx.on(event, handler);
  ctx.cleanups.push(off);
}
