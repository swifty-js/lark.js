type Listener = () => void;

export interface Signal<T> {
  value: T;
  subscribe(listener: Listener): () => void;
}

export function signal<T>(initial: T): Signal<T> {
  const listeners = new Set<Listener>();
  let current = initial;

  return {
    get value() {
      return current;
    },
    set value(next: T) {
      if (Object.is(current, next)) return;
      current = next;
      for (const fn of listeners) fn();
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function effect(fn: () => void): () => void {
  fn();
  return () => {};
}
