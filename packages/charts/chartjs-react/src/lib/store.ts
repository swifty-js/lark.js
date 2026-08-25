import { useEffect, useState } from "@lark.js/react";

/**
 * Minimal external store — the lark-react replacement for lark-mvc's
 * `createStore` / `signal`. lark-react has no reactive primitives of its
 * own (every update re-renders the whole root), so global state lives in
 * plain module stores and components subscribe with `useStore`.
 *
 * `setState` merges a partial and notifies subscribers synchronously;
 * `getState` returns the live (mutated) object.
 */
export interface Store<T> {
  getState(): T;
  setState(partial: Partial<T>): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(
  init: (set: (partial: Partial<T>) => void, get: () => T) => T,
): Store<T> {
  let state = {} as T;
  const listeners = new Set<() => void>();
  const set = (partial: Partial<T>): void => {
    state = { ...state, ...partial };
    for (const l of listeners) l();
  };
  const get = (): T => state;
  state = init(set, get);
  return {
    getState: get,
    setState: set,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Subscribe a component to a store. A version counter drives the
 * re-render (the store mutates in place, so the snapshot identity never
 * changes); the component reads fresh state via `store.getState()`.
 *
 * The function argument is wrapped (`() => v + 1`) so lark-react treats
 * it as an updater rather than a new state value.
 */
export function useStore<T>(store: Store<T>): T {
  const [, bump] = useState(0);
  useEffect(() => store.subscribe(() => bump((v) => v + 1)), [store]);
  return store.getState();
}
