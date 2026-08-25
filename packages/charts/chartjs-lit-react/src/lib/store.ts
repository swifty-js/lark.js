type Listener = () => void;

export interface StoreApi<T> {
  getState(): T;
  setState(partial: Partial<T>): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T extends object>(
  initializer: (set: (partial: Partial<T>) => void) => T,
): StoreApi<T> {
  const listeners = new Set<Listener>();
  let state: T;

  const set = (partial: Partial<T>) => {
    state = { ...state, ...partial };
    for (const fn of listeners) fn();
  };

  state = initializer(set);

  return {
    getState: () => state,
    setState: set,
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
