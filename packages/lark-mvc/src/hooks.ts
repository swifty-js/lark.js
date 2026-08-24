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
 * Hooks for function components (React rules of hooks).
 *
 * The component function re-runs on EVERY render pass, so hooks are
 * call-order-indexed slots on the current instance: call them
 * unconditionally, in the same order, at the top level of the component body
 * — never inside conditions, loops, or event handlers.
 *
 * Signals-first divergences from React worth knowing:
 * - `useSignal(initial)` returns a stable `Signal` — write `sig.value` from
 *   handlers, read it in JSX. There is no setState/re-render-the-world; only
 *   readers of that signal re-render.
 * - The component body is a TRACKED region: reading `props.x`, a signal,
 *   `State.get(key)`, store state, or `Router.parse()` subscribes the
 *   instance. Handlers and async callbacks read snapshots.
 * - `useEffect` runs after the DOM commit (deps semantics match React:
 *   no deps → every render, `[]` → mount only, cleanup before re-run and on
 *   unmount).
 */
import { signal, computed, effect, type Signal, type ReadonlySignal } from "./reactive";
import { requireInstance, useValueSlot, useMemoSlot, useEffectSlot } from "./component";

// ============================================================
// State hooks
// ============================================================

/**
 * Declare instance-local reactive state.
 *
 * Returns the SAME `Signal` on every render (created from `initial` on the
 * first). Reading `sig.value` in JSX subscribes the component; writing it
 * from a handler re-renders synchronously. State survives HMR swaps.
 *
 * @example
 * function Counter() {
 *   const count = useSignal(0);
 *   return <button onClick={() => count.value++}>{count.value}</button>;
 * }
 */
export function useSignal<T>(initial: T): Signal<T> {
  return useValueSlot(() => signal(initial), undefined, true);
}

/**
 * Create a stable mutable `{ current }` cell. Pass it to a JSX `ref` prop to
 * receive the DOM element after commit (`null` after unmount), or use it to
 * hold any mutable value across renders without triggering re-renders.
 *
 * @example
 * const input = useRef<HTMLInputElement>();
 * useEffect(() => input.current?.focus(), []);
 * return <input ref={input} />;
 */
export function useRef<T = Element>(initial: T | null = null): { current: T | null } {
  return useValueSlot(() => ({ current: initial }), undefined, true);
}

/**
 * Create a derived `computed` once per instance. Reading `.value` in JSX
 * subscribes the component; the computation re-runs lazily when its signal
 * dependencies change. Prefer this over `useMemo` for signal-derived data —
 * no deps array needed.
 *
 * Note: the computation closure is captured on the FIRST render — read
 * reactive inputs (signals/props/stores) inside it, not captured locals.
 *
 * @example
 * const doubled = useComputed(() => count.value * 2);
 */
export function useComputed<T>(fn: () => T): ReadonlySignal<T> {
  return useValueSlot(() => computed(fn));
}

/**
 * Memoize a computation against a deps array (React semantics): recomputed
 * when any dep changes (`Object.is`); no deps → every render. For
 * signal-derived values prefer `useComputed`.
 */
export function useMemo<T>(fn: () => T, deps?: unknown[]): T {
  return useMemoSlot(fn, deps);
}

// ============================================================
// Effect hooks
// ============================================================

/**
 * Run a side effect after the DOM commit (React semantics).
 *
 * - no `deps` → runs after every render
 * - `[]` → runs once after mount
 * - `[a, b]` → runs when any dep changes (`Object.is` comparison)
 *
 * A returned function is the cleanup: it runs before the next effect run and
 * on unmount.
 *
 * @example
 * useEffect(() => {
 *   const timer = setInterval(tick, 1000);
 *   return () => clearInterval(timer);
 * }, []);
 */
export function useEffect(fn: () => void | (() => void), deps?: unknown[]): void {
  useEffectSlot(fn, deps);
}

/**
 * Run a REACTIVE side effect: created once on mount, re-runs whenever any
 * signal it read changes (`@preact/signals-core` `effect` semantics — no
 * deps array). A returned function is the between-runs / final cleanup.
 * Disposed on unmount.
 *
 * Do not WRITE signals the callback also reads — that is a cycle. The
 * callback closure is captured on the first render; read reactive inputs
 * inside it.
 *
 * @example
 * useSignalEffect(() => {
 *   const path = Router.parse().path; // subscribe to navigation
 *   void loadContent(path);
 * });
 */
export function useSignalEffect(fn: () => void | (() => void)): void {
  useValueSlot(
    () => effect(fn),
    (dispose) => (dispose as () => void)(),
  );
}

/**
 * Register a cleanup to run on unmount. Registered once per slot (safe under
 * per-render re-runs — the first render's `fn` wins).
 */
export function onCleanup(fn: () => void): void {
  const inst = requireInstance("onCleanup");
  useValueSlot(() => {
    inst.cleanups.push(fn);
    return fn;
  });
}
