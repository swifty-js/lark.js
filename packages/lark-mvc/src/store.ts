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
 * @lark.js/mvc Store
 *
 * Zustand-aligned state management, backed by per-key signals.
 *
 * Core API:
 * - createStore(name, creator): define a store with (set, get) => initialState
 * - store.getState(): stable tracked proxy — reading a key inside a tracked
 *   region (template / computed / useSignalEffect) subscribes the reader to
 *   THAT key only
 * - store.setState(partial | updater): batch-write keys and notify listeners
 * - store.subscribe(listener): manual (state, prevState) listener
 * - store.destroy(): tear down the store
 * - `computed(fn)` (from the reactive core) declares derived state — its
 *   dependencies are tracked automatically, no deps array
 *
 * ## Reactivity (shallow)
 *
 * Key values are compared by reference (`Object.is`). Mutating a nested field
 * or pushing into an array does NOT notify — replace the reference:
 * `set({ list: [...get().list, item] })`.
 */

import { signal, batch, untracked, Signal, type ReadonlySignal } from "./reactive";

// ---- Types ----------------------------------------------------------------

type Listener<T> = (state: T, prevState: T) => void;

export interface StoreApi<T = object> {
  getState(): T;
  setState(partial: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: Listener<T>): () => void;
  destroy(): void;
}

/**
 * Creator return shape: each key holds either its plain initial value, an
 * action function, or a `computed(fn)` (ReadonlySignal) derived slot.
 */
type StateInit<T> = { [K in keyof T]: T[K] | ReadonlySignal<T[K]> };

type StateCreator<T> = (
  set: (partial: Partial<T> | ((prev: T) => Partial<T>)) => void,
  get: () => T,
) => StateInit<T>;

// ---- Store registry --------------------------------------------------------

const storeRegistry = new Map<string, StoreApi>();

// ---- create ----------------------------------------------------------------

/**
 * Create a zustand-aligned store.
 *
 * The `creator` function receives `(set, get)` and executes **once** during
 * store creation. Lark iterates the return value:
 * - **Functions** become actions (attached to state, unaffected by `setState`)
 * - **`computed(fn)` signals** occupy derived slots — dependencies are
 *   tracked automatically (reads of `get().x` inside the computed subscribe
 *   it to that key), and `getState().derivedKey` unwraps the current value
 * - **All other fields** become signal-backed state keys
 *
 * `getState()` returns a stable proxy: property reads go through the key
 * signals, so reads inside a view template subscribe that view to exactly
 * the keys it uses. Writes to computed/action keys via `setState` are
 * silently ignored.
 *
 * @param name - Unique store name for the global registry
 * @param creator - Factory function `(set, get) => initialState`
 * @returns A `StoreApi` with `getState` / `setState` / `subscribe` / `destroy`
 *
 * @example
 * ```ts
 * const store = createStore("counter", (set, get) => ({
 *   count: 0,
 *   doubled: computed(() => get().count * 2),
 *   increment: () => set({ count: get().count + 1 }),
 * }));
 * ```
 */
export function createStore<T extends object>(name: string, creator: StateCreator<T>): StoreApi<T> {
  /** Listeners notified on every state change. */
  const listeners = new Set<Listener<T>>();
  /** Signal per plain state key. */
  const keySignals = new Map<string, Signal<unknown>>();
  /** Derived (computed) slots keyed by state key. */
  const derived = new Map<string, ReadonlySignal<unknown>>();
  /** Action keys (functions — writes ignored by setState). */
  const actionKeys = new Set<string>();
  /**
   * Plain snapshot mirror (state + actions + last derived values). Serves as
   * the proxy target so `ownKeys` / spread / `Object.keys` behave like a
   * plain object, and as the `prevState` source for listeners.
   */
  const mirror: Record<string, unknown> = {};

  let destroyed = false;

  const proxy = new Proxy(mirror, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const d = derived.get(prop);
        if (d) return d.value; // tracked read
        const s = keySignals.get(prop);
        if (s) return s.value; // tracked read
      }
      return Reflect.get(target, prop, receiver); // actions / unknown keys
    },
  }) as T;

  /** Read the stable tracked state proxy. */
  const getState = (): T => proxy;

  /** Refresh the mirror's derived-value snapshot (untracked reads). */
  const syncDerived = (): void => {
    for (const [key, d] of derived) {
      mirror[key] = untracked(() => d.value);
    }
  };

  /**
   * Batch-merge `partial` into state and notify listeners.
   *
   * Accepts a partial object or an updater function `(prev) => partial`.
   * Computed and action keys are skipped. If no value actually changed
   * (`Object.is`), the update is a no-op — listeners are NOT notified.
   * Unknown keys create new signal-backed slots (zustand semantics).
   */
  const setState = (partial: Partial<T> | ((prev: T) => Partial<T>)): void => {
    if (destroyed) return;
    const resolved = typeof partial === "function" ? partial(proxy) : partial;

    const prevState = { ...mirror } as T;
    let changed = false;

    batch(() => {
      for (const key of Object.keys(resolved)) {
        if (derived.has(key) || actionKeys.has(key)) continue;
        const newVal = Reflect.get(resolved, key);
        let sig = keySignals.get(key);
        if (!sig) {
          sig = signal(newVal);
          keySignals.set(key, sig);
          mirror[key] = newVal;
          changed = true;
          continue;
        }
        if (!Object.is(mirror[key], newVal)) {
          mirror[key] = newVal;
          sig.value = newVal;
          changed = true;
        }
      }
      if (changed) {
        syncDerived();
      }
    });

    if (!changed) return;

    for (const listener of listeners) {
      listener(proxy, prevState);
    }
  };

  /**
   * Subscribe to state changes. The listener receives `(state, prevState)` —
   * `state` is the stable proxy, `prevState` a plain snapshot taken before
   * the write. Returns an unsubscribe function.
   */
  const subscribe = (listener: Listener<T>): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  /**
   * Tear down the store: clear listeners and remove from the global registry.
   * Further `setState` calls are no-ops.
   */
  const destroy = (): void => {
    destroyed = true;
    listeners.clear();
    storeRegistry.delete(name);
  };

  const api: StoreApi<T> = { getState, setState, subscribe, destroy };

  // Run creator to get the initial body
  const body = creator(setState, getState);

  // Classify: derived signals, actions, plain state keys
  for (const key of Object.keys(body)) {
    const val = Reflect.get(body, key);
    if (val instanceof Signal) {
      derived.set(key, val as ReadonlySignal<unknown>);
    } else if (typeof val === "function") {
      Reflect.set(mirror, key, val);
      actionKeys.add(key);
    } else {
      keySignals.set(key, signal(val));
      mirror[key] = val;
    }
  }

  // Derived initial values compute AFTER all key signals exist (computed is
  // lazy — first .value read runs the fn, which may call get()).
  syncDerived();

  // Register
  storeRegistry.set(name, api as StoreApi);

  return api;
}
