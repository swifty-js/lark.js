# Components & Hooks (`@lark.js/larky`)

## Function components

A component is a plain function `(props) => JSXNode`, used directly as a
JSX tag. No `class` components, no `this`, no lifecycle methods.

```tsx
import type { FC, JSXNode } from "@lark.js/larky";

interface ItemProps {
  id: string;
  onPick?: (id: string) => void;
  children?: JSXNode;
}

function Item(props: ItemProps) {
  return <li onClick={() => props.onPick?.(props.id)}>{props.children}</li>;
}
// or: const Item: FC<ItemProps> = (props) => ...
```

- The body **re-runs on every render pass** inside the instance's render
  effect — the body IS the tracked template. Reading `props.x`, a signal
  `.value`, `store.getState().x`, or `router.params.value` in the body
  subscribes the instance to exactly that data.
- Instances are matched across renders by **function identity + `key`**.
  A changed function reference (or incompatible tag) unmounts the old
  instance (hook state lost) and mounts a fresh one.
- Output is **hostless**: no wrapper element. Multi-root output (Fragment
  at the root) is supported. The rendered range splices directly into the
  parent element, terminated by a comment end-anchor.

### Props (per-key reactive, shallow)

Each instance holds one SHALLOW signal per prop key behind a stable proxy:

- Reading `props.x` in the body subscribes to THAT key only — a parent
  re-render that pushes an identical value for `x` does NOT re-render the
  child (finer-grained than React's whole-props identity model).
- Prop values keep their identity (no deep proxying) — parent-owned
  objects arrive unchanged. Same-value pushes (`Object.is`) are no-ops.
- Keys absent from the latest parent render are removed (read as
  `undefined`) — React prop-removal semantics. `key` never lands in props.
- Spread (`{...props}`), `Object.keys(props)`, and `"x" in props` are
  tracked against the key SET (re-run when keys appear/disappear).

### Callbacks and children

- Callbacks are ordinary props (`onSave={fn}`); the child calls
  `props.onSave?.(data)` from a handler. Calling one in the BODY would
  subscribe to its identity — call from handlers/effects.
- `children` arrive as `props.children` (any `JSXNode`). Render them
  directly: `<div>{props.children}</div>`.
- `class`/`style`/`id`/`ref` on a COMPONENT tag are ordinary props — the
  component must apply them itself (hostless: there is no host element to
  route them to).

## Hooks (call-order slots — React rules of hooks)

Hooks must run unconditionally, in the same order, at the top level of the
body — never in conditions, loops, or handlers. Hook-count changes between
renders dev-warn and reset trailing slots. There is NO `useState`, NO
`useMemo`, NO deps arrays.

### `useSignal(initial)` — reactive state (DEEP)

```tsx
const count = useSignal(0);
const todos = useSignal<string[]>([]);
count.value++; // re-renders readers (next microtask)
todos.value.push("milk"); // DEEP (@vue/reactivity ref) — this notifies too
```

Returns the SAME `Signal` every render (created once from `initial`).
State survives HMR swaps. Never call bare `signal()` in a body — it would
be recreated per render.

DEEP means stored plain objects/arrays are wrapped in a reactive proxy
(`sig.value !== stored`). **Never store third-party class instances
(Monaco/CodeMirror editors, chart/map SDKs, sockets) in a deep signal** —
the proxy breaks their internal identity checks (`a !== b` for the same
object) and can hang the page in a silent synchronous loop. Use `useRef`
for instance handles, or `useShallowSignal` when the reference must be
reactive. DOM elements are exempt (Vue never proxies them).

### `useShallowSignal(initial)` — reactive reference (SHALLOW, identity-preserving)

```tsx
const editor = useShallowSignal<monaco.editor.IStandaloneCodeEditor | null>(
  null,
);
useEffect(() => {
  editor.value = monaco.editor.create(el.current!); // stored AS-IS, no proxy
});
return <div>{editor.value ? "ready" : "loading"}</div>; // re-renders on assignment
```

Only `.value` ASSIGNMENT notifies; the value is never proxied
(`sig.value === stored`). The reactive-safe container for third-party
instances. Module-level equivalent: `shallowSignal`; per-object opt-out for
deep signals: `markRaw(obj)`; unwrap an existing proxy: `toRaw(v)`.

### `useRef(initial?)` — mutable cell (NOT reactive)

```tsx
const input = useRef<HTMLInputElement>();
useEffect(() => input.current?.focus());
return <input ref={input} />;
```

React `.current` semantics: writes never re-render. Pass to a JSX `ref`
prop to receive the element post-commit (`null` after unmount), or hold
any mutable value across renders. Survives HMR swaps.

### `useComputed(fn)` — derived value

```tsx
const doubled = useComputed(() => count.value * 2);
```

Created once per instance; auto-tracked and lazy. Read `.value` in JSX to
subscribe. The closure is captured on the FIRST render — read reactive
inputs (signals/props/stores) inside it, not captured locals.

### `useSignalEffect(fn)` — reactive side effect

```tsx
useSignalEffect(() => {
  const path = router.location.value.pathname; // subscribes to navigation
  void loadContent(path);
  return () => cancel(); // between-runs / final cleanup
});
```

Created once on mount; runs immediately, re-runs (microtask-batched) when
any signal it read changes. Do not WRITE signals the callback also reads.
Disposed on unmount.

### `useEffect(fn)` — mount-only setup

```tsx
useEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer); // unmount cleanup
});
```

Runs ONCE after the first DOM commit (refs are filled), as a queued job in
the SAME flush after the whole tree committed — synchronous after
`render()`. Because it runs OUTSIDE the render effect, writing a signal the
body reads correctly schedules a re-render. There is NO deps parameter —
for data-driven re-runs use `useSignalEffect`.

### `onCleanup(fn)` — teardown hook

Registers a callback for instance teardown (unmount, or HMR swap of the
slot). First render's `fn` wins.

### `useBlocker(fn)` — navigation guard (see state-routing.md)

## Instance lifecycle

```
mount:   createInstance → seed props → render effect created (first run
         SYNC) → body runs (tracked) → slice committed → child mounts →
         refs called → useEffect callbacks run (post-commit)
update:  signal/prop write → render job enqueued (microtask, deduped) →
         body re-runs → keyed slice diff → deferred ops → (new) useEffects
unmount: render effect disposed → children destroyed bottom-up → hook
         slots disposed in REVERSE order (useSignalEffect disposers,
         useEffect cleanups, onCleanup) → refs called with null → DOM range
         removed
```

`render(node, container)` (React-DOM style) mounts or diffs a tree —
both commit synchronously. `unmount(container)` tears everything down and
returns whether a tree was mounted.

## DOM events

- camelCase props: `onClick`, `onInput`, `onKeyDown`, ... (`onDblClick`,
  not `onDoubleClick`). The native event type is `name.slice(2)
.toLowerCase()` — handlers receive the NATIVE event (no synthetic
  wrapper), typed with a narrowed `currentTarget` (`TargetedEvent`).
- Inline functions only — string values and native-lowercase forms
  (`onclick`) are rejected (XSS channel).
- No capture-phase props (`onClickCapture` is a compile error and skipped
  at runtime) — use a ref + `addEventListener(type, fn, true)`.
- Listeners are per-node with a stable proxy; the current handler is
  swapped every render, so closures never go stale.
- Handler writes auto-batch: N writes in one click = one re-render per
  subscribed instance, committed on the next microtask.

## Composition patterns

```tsx
// Conditional + list (keys preserve instance state across reorders)
<ul>
  {todos.value.map((t) => (
    <TodoItem key={t.id} todo={t} onToggle={toggle} />
  ))}
</ul>;

// Controlled input (form-state props sync as DOM properties)
<input
  value={text.value}
  onInput={(e) => (text.value = e.currentTarget.value)}
/>;

// Escape hatch to imperative DOM
const canvas = useRef<HTMLCanvasElement>();
useEffect(() => {
  const ctx = canvas.current!.getContext("2d")!;
  return () => cancelAnimationFrame(raf);
});
```

Testing note: after any write, `await nextTick()` before asserting the
DOM (or wrap writes in `flushSync`). `render()`/`unmount()` themselves are
synchronous.
