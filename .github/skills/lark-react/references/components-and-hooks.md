# Components and Hooks

## Function components

A component is a plain function `(props) => Children` used directly as a JSX
tag. `Children` covers everything a body may return:

```ts
type Children =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | Children[];
```

Strings/numbers become text nodes; `null`/`undefined`/booleans render
nothing; arrays flatten (keys are NOT rewritten when flattening, so keys must
not collide across sibling arrays at the same level).

- **Props are read-only descriptors.** The renderer never copies or mutates
  them; a new descriptor object arrives each parent render.
- **`props.children`** carries nested JSX. Components position it freely
  (`<div>{props.children}</div>`); it is not special beyond being skipped by
  the DOM prop writer.
- **Callbacks are plain props** (React semantics): the child calls
  `props.onSave?.(data)` from an event handler. There is no emitter.
- **`key`** is consumed by the reconciler — it never reaches `props`.
- **`class` / `style` / `ref` on a component tag are ordinary props.**
  Components are hostless (no wrapper element), so they must forward such
  props to a host element themselves.

Instances are matched across renders by function identity among siblings
(plus `key`). Renaming a component or swapping which function renders at a
position unmounts the old instance (hook state is lost) — except through the
HMR alias chain (see hmr-and-build.md).

## The five core hooks

Hooks live in call-order-indexed slots on the instance (`vnode.hooks`), the
one array that survives across renders. Calling a hook outside a component
body throws `"Hooks can only be called inside a function component."`
`useStore`, `useRouter`, `useBlocker`, and `useUrlState` (see store.md and
router-and-url-state.md) are composed FROM these slots — the same rules of
hooks apply to them.

### useState

```ts
const [state, setState] = useState(initial); // or useState(() => initial)
```

- Lazy initializer runs exactly once (on mount).
- `setState` identity is stable — safe in deps arrays and closures.
- Accepts a value or an updater `(prev) => next`. Updaters queue and apply
  in order at the next render, so `setN(n => n + 1); setN(n => n + 1)` adds 2.
- **Storing functions**: because ANY function argument is invoked as an
  updater, `setState(someFn)` calls `someFn(prevState)` instead of storing
  it. Wrap: `setState(() => someFn)`. Classic trigger: an external-store
  hook doing `setValue(selector(store.getState()))` where the selector picks
  a store ACTION — the action runs with the previous state, re-enters the
  store, and loops until `Maximum update depth exceeded` (or, pre-guard, a
  frozen page).
- **Eager bailout**: when nothing is queued and the computed next value is
  `Object.is`-equal to the current state, the call is a complete no-op (no
  re-render).
- Scheduling: marks the owning root dirty; a single `queueMicrotask` flush
  re-renders each dirty root once. All setStates from the same synchronous
  tick — across components and even across roots — batch into that flush.

### useEffect

```ts
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id); // cleanup
}, [deps]);
```

- No deps argument → runs after EVERY render. `[]` → mount only. Deps
  compare element-wise with `Object.is`.
- Effects flush **synchronously at the end of renderRoot** (after the DOM
  commit — layout-effect timing; there is no separate passive queue, hence
  no `useLayoutEffect`). DOM reads inside effects see the committed tree,
  and host refs are already attached.
- Two-pass order per flush: first every due cleanup across the whole tree,
  then every due create — both passes children-before-parents. Unmount runs
  cleanups children-first as well.
- A setState inside an effect schedules the next microtask wave (it does not
  loop synchronously).

### useMemo / useCallback / useRef

```ts
const value = useMemo(() => expensive(a, b), [a, b]);
const onSave = useCallback(() => submit(form), [form]);
const box = useRef<HTMLDivElement | null>(null); // {current} — stable object
```

- `useMemo` recomputes only when deps change; `useCallback(fn, deps)` is
  `useMemo(() => fn, deps)`; `useRef(v)` is `useMemo(() => ({current: v}), [])`.
- `useMemo` runs the factory during render — keep it pure.

### HMR resilience (why hook edits don't crash)

When a hot swap changes the hook sequence:

- a slot whose TAG changed at the same index (e.g. `useState` → `useMemo`) is
  destructively reset (its effect cleanup runs first if it was an effect);
- trailing slots the new body no longer reaches are cleaned up and truncated
  after the body returns.

Same-tag slots at the same index are REUSED — editing `useState(0)` to
`useState(100)` keeps the live value (initializers only run for fresh slots).

## Roots, render, unmount

```ts
import { createRoot, render } from "@lark.js/react";

render(<App/>, container);          // mount or update (diffs against previous)
render(null, container);            // unmount everything (cleanups + refs run)

const root = createRoot(container); // React-DOM-style wrapper over render()
root.render(<App/>);
root.unmount();
```

- One `Root` per container, held in a WeakMap — repeated `render` calls into
  the same container diff incrementally. A direct `render()` call commits
  synchronously (only setState defers to a microtask).
- Rendering is non-interruptible: diff → commit → flushEffects, start to
  finish. Errors thrown in bodies/effects/handlers bubble to the caller
  (render call or event dispatch) — there are no error boundaries.

## Testing patterns (vitest + jsdom)

```tsx
import { render } from "@lark.js/react";

const container = document.createElement("div");
document.body.appendChild(container);

render(<Counter />, container); // commit is synchronous
button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
await Promise.resolve(); // flush ONE setState wave
expect(container.textContent).toBe("1");
```

- `await Promise.resolve()` queues its continuation AFTER the pending
  microtask flush (FIFO), so the committed DOM is observable. A cascade
  (effect → setState) needs one await per wave.
- Direct `render()` calls need no await.
- `packages/react/tests/helpers.ts` ships `flush()` (= `Promise.resolve()`),
  `createContainer()`, and `click(el)` — reuse them.
- See `packages/react/vitest.config.ts` for the jsdom + automatic-JSX +
  alias wiring, and `packages/react/tests/` for worked examples of every
  pattern above.
