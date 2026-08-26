# Store (`createStore` / `useStore`)

Zustand-aligned state management, vanilla-store style. Stores are anonymous
values (no global registry, no provider): create one in a module, export it,
import it anywhere — components subscribe with `useStore`, plain code with
`store.subscribe`. Source: `packages/react/src/store.ts`.

```ts
import { createStore, useStore } from "@lark.js/react";

const todoStore = createStore((set, get) => ({
  todos: [] as Todo[],
  filter: "all",
  add: (t: Todo) => set({ todos: [...get().todos, t] }),
  setFilter: (filter: string) => set({ filter }),
}));
```

## createStore(creator)

`creator` is `(set, get) => initialState` and executes **exactly once** at
creation. The returned object is classified per key:

- **Functions become actions** — attached to state, callable via
  `getState().add(...)`, and IMMUNE to `setState` (writes to action keys are
  silently ignored; `replace: true` never clears them).
- **Every other field becomes a plain state key.**

There is no computed/derived-key tier — derive with a selector
(`useStore(store, s => s.todos.length)`) or compute in the component body.

### The StoreApi

```ts
interface StoreApi<T> {
  getState(): T;
  setState(
    partial: Partial<T> | ((prev: T) => Partial<T>),
    replace?: boolean,
  ): void;
  subscribe(listener: (state: T, prevState: T) => void): () => void;
  subscribe<S>(
    selector: (state: T) => S,
    listener: (slice: S, prevSlice: S) => void,
  ): () => void;
  destroy(): void;
}
```

- **`getState()`** returns a **stable read-only Proxy** over the snapshot —
  the SAME object identity forever. Spread / `Object.keys` behave like a
  plain object (actions included); direct writes and deletes THROW
  (`store state is read-only — use setState()`), because they would bypass
  change detection and listener notification.
- **`setState(partial | updater, replace?)`** merge-writes: each key
  compares with `Object.is`; if NOTHING actually changed the call is a
  complete no-op (listeners are not notified). Unknown keys create new state
  slots (zustand semantics). The updater form receives the state proxy.
  `replace: true` additionally resets plain state keys MISSING from the
  partial to `undefined` (actions untouched).
- **`subscribe(listener)`** fires on every actual change with
  `(state, prevState)` — `state` is the stable proxy, `prevState` a plain
  snapshot (actions included). One `setState` writing several keys notifies
  ONCE. Returns an unsubscribe function.
- **`subscribe(selector, listener)`** fires only when the selected slice
  changes (`Object.is`), with `(slice, prevSlice)`; the initial slice is
  captured at subscribe time.
- **`destroy()`** clears listeners; further `setState` calls are no-ops.

### Shallow reactivity (the classic bug)

Key values compare by reference. Mutating a nested field or pushing into an
array does NOT notify — replace the reference:

```ts
set({ todos: [...get().todos, todo] }); // ✅ new reference → notifies
get().todos.push(todo); // ❌ silent — nobody re-renders
```

(The proxy only guards TOP-LEVEL writes; nested objects are ordinary
mutable references — discipline required.)

## useStore(store, selector?)

```tsx
const state = useStore(todoStore); // whole state
const todos = useStore(todoStore, (s) => s.todos); // slice
```

A REAL hook (rules of hooks apply). Subscribes the component and calls its
own `setState` tick on change — so re-renders batch through the normal
microtask flush, and one `store.setState` re-renders ALL subscribed
components in one wave.

- **Whole-state form** re-renders on EVERY store change. Because
  `getState()` is a stable proxy, change detection uses an internal per-store
  version counter (invisible to consumers).
- **Selector form** re-renders only when `Object.is(selector(state), prev)`
  differs. Selectors returning fresh objects/arrays per call
  (`s => ({...s})`, `s => s.list.filter(...)`) make every check "changed" —
  select primitives or stable references instead. Inline selectors are fine
  (identity of the FUNCTION doesn't matter, only the slice).
- **No missed updates**: the subscription starts in a post-commit effect, and
  the hook re-checks immediately after subscribing — a write that lands
  between render and subscription (e.g. another component's mount effect
  calling `setState`) still re-renders the component.
- Unmount unsubscribes automatically (effect cleanup).

Selecting an ACTION via `useStore` is unnecessary — actions are stable, so
read them off `store.getState()` directly in handlers. Never do
`setLocal(useStore(store, s => s.someAction))`-style forwarding into
`useState` — `setState(fn)` calls the function as an updater (SKILL rule 2).

## Testing patterns

```ts
// Plain store logic — no DOM needed:
const store = createStore((set, get) => ({ n: 0, inc: () => set({ n: get().n + 1 }) }));
const seen: number[] = [];
const stop = store.subscribe((s) => seen.push(s.n));
store.getState().inc();          // synchronous — seen === [1]
stop();

// Component subscription — one microtask wave per change:
render(<Counter />, container);
store.setState({ n: 5 });
await Promise.resolve();         // flush the batched re-render
expect(container.textContent).toBe("5");
```

`store.setState`/`subscribe` are synchronous; only the component re-render is
batched. Worked examples: `packages/react/tests/store.test.ts` (vanilla API)
and `tests/use-store.test.tsx` (hook + staleness re-check + batching).
