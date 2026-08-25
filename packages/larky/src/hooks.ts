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
 * Hooks for function components (React rules of hooks, signals-only).
 *
 * The component function re-runs on EVERY render pass, so hooks are
 * call-order-indexed slots on the current instance: call them
 * unconditionally, in the same order, at the top level of the component body
 * — never inside conditions, loops, or event handlers.
 *
 * Signals are the SINGLE dependency-tracking mechanism — there are NO deps
 * arrays anywhere (and no `useState`):
 * - declare state with `useSignal` (Vue-deep: nested mutations notify)
 * - derive values with `useComputed` (auto-tracked, lazy)
 * - run reactive side effects with `useSignalEffect` (auto-tracked)
 * - run one-time post-commit setup with `useEffect` (mount-only; cleanup on
 *   unmount)
 * - register teardown with `onCleanup`
 */
import {
  signal,
  shallowSignal,
  computed,
  effect,
  type Signal,
  type ShallowSignal,
  type ReadonlySignal,
} from "./reactive";
import { requireInstance, useValueSlot, useMountSlot, debugName } from "./component";

// ============================================================
// State hooks
// ============================================================

/**
 * Declare instance-local reactive state.
 *
 * Returns the SAME `Signal` on every render (created from `initial` on the
 * first). Reading `sig.value` in JSX subscribes the component; writing it
 * from a handler re-renders on the next microtask (writes auto-batch).
 * Deep (`@vue/reactivity` `ref`): `list.value.push(x)` notifies readers —
 * no immutable-update dance required. State survives HMR swaps.
 *
 * DEEP means plain objects/arrays stored here are wrapped in a reactive
 * PROXY (`sig.value !== stored`). Never store third-party class instances
 * (Monaco/CodeMirror editors, chart/map SDKs, sockets) in a deep signal —
 * the proxy breaks their internal identity checks (`a !== b` for the same
 * object) and can hang them in an infinite loop. Hold instances in
 * `useRef` (non-reactive), or use `useShallowSignal` / `markRaw` when
 * reactivity on the reference itself is needed.
 *
 * @example
 * function Counter() {
 *   const count = useSignal(0);
 *   return <button onClick={() => count.value++}>{count.value}</button>;
 * }
 */
export function useSignal<T>(initial: T): Signal<T> {
  return useValueSlot(() => signal(initial) as Signal<T>, undefined, true);
}

/**
 * Declare instance-local reactive state that is SHALLOW: only `.value`
 * ASSIGNMENT notifies, and the stored value is kept AS-IS — no deep proxy,
 * identity preserved (`sig.value === stored`). This is the reactive-safe
 * container for third-party class instances (Monaco editors, chart/map
 * SDKs) when components must re-render on the reference change; for
 * non-reactive holders prefer `useRef`. State survives HMR swaps.
 *
 * @example
 * const editor = useShallowSignal<monaco.editor.IStandaloneCodeEditor | null>(null);
 * useEffect(() => { editor.value = monaco.editor.create(el); });
 * return <div>{editor.value ? "ready" : "loading"}</div>;
 */
export function useShallowSignal<T>(initial: T): ShallowSignal<T> {
  return useValueSlot(() => shallowSignal(initial) as ShallowSignal<T>, undefined, true);
}

/**
 * Create a stable mutable `{ current }` cell (React `useRef` semantics —
 * NOT reactive; writes never re-render). Pass it to a JSX `ref` prop to
 * receive the DOM element after commit (`null` after unmount), or use it to
 * hold any mutable value across renders.
 *
 * @example
 * const input = useRef<HTMLInputElement>();
 * useEffect(() => input.current?.focus());
 * return <input ref={input} />;
 */
export function useRef<T = Element>(initial: T | null = null): { current: T | null } {
  return useValueSlot(() => ({ current: initial }), undefined, true);
}

/**
 * Create a derived `computed` once per instance. Reading `.value` in JSX
 * subscribes the component; the computation re-runs lazily when its signal
 * dependencies change — no deps array, dependencies are tracked
 * automatically.
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

// ============================================================
// Effect hooks
// ============================================================

/**
 * Run a REACTIVE side effect: created once on mount, runs immediately and
 * re-runs (microtask-batched) whenever any signal it read changes — no deps
 * array. A returned function is the between-runs / final cleanup. Disposed
 * on unmount.
 *
 * Do not WRITE signals the callback also reads — that is a cycle. The
 * callback closure is captured on the first render; read reactive inputs
 * inside it.
 *
 * @example
 * useSignalEffect(() => {
 *   const path = router.location.value.pathname; // subscribe to navigation
 *   void loadContent(path);
 * });
 */
export function useSignalEffect(fn: () => void | (() => void)): void {
  const inst = requireInstance("useSignalEffect");
  useValueSlot(
    () => effect(fn, `signalEffect<${debugName(inst)}>`),
    (dispose) => (dispose as () => void)(),
  );
}

/**
 * Run a one-time setup AFTER the first DOM commit (refs are filled). A
 * returned function is the unmount cleanup.
 *
 * This is mount-only — there is NO deps parameter. For side effects that
 * should re-run when data changes, use `useSignalEffect` (signals are the
 * dependency-tracking mechanism, not deps arrays).
 *
 * @example
 * useEffect(() => {
 *   const timer = setInterval(tick, 1000);
 *   return () => clearInterval(timer);
 * });
 */
export function useEffect(fn: () => void | (() => void)): void {
  useMountSlot(fn);
}

/**
 * Register a cleanup to run when the instance tears down. Registered once
 * per slot (safe under per-render re-runs — the first render's `fn` wins).
 * The callback runs when its slot is disposed: on unmount, and on an HMR
 * swap (the next render registers the new version's callback).
 */
export function onCleanup(fn: () => void): void {
  requireInstance("onCleanup");
  useValueSlot(
    () => fn,
    (value) => (value as () => void)(),
  );
}
