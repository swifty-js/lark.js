# @lark.js/mvc

A lightweight TypeScript frontend framework for single-page applications and micro-frontend scenarios.

## Overview

lark-mvc is a functional-first framework built on **signals reactivity**
(`@preact/signals-core`) with **React-style function components**. A
component is a plain function `(props) => JSX`; it re-runs per render inside
its own render effect — reading a signal (or a prop) subscribes the
instance, writing it re-renders synchronously. Rendering is a direct
**VNode → DOM reconciler** with **hostless component instances**: no wrapper
elements, no virtual-DOM double bookkeeping, no HTML-string serialization.

```tsx
import { render, useSignal } from "@lark.js/mvc";

function Counter(props: { step?: number }) {
  const count = useSignal(0);
  return <button onClick={() => (count.value += props.step ?? 1)}>Count: {count.value}</button>;
}

render(<Counter step={2} />, document.getElementById("root")!);
```

Design principles:

- Functional API: no class, no this, no prototype, no mixin
- React FC authoring model: plain functions, call-order hooks, callback
  props, `children`, `key`, `ref`
- Signals-based reactivity — read = subscribe, write = re-render; **shallow**
  (reference) comparison, like React/Preact
- Hostless reconciliation — component output splices directly into the
  parent element (output DOM identical to React's)
- Fine-grained updates — one render effect per component instance; props are
  per-key signals, so a child re-renders only when a prop it READ changed
- Module Federation support for micro-frontends
- One runtime dependency: `@preact/signals-core` (~1.5 kB gzip)

## Architecture

```
                render(<App/>, container)        Framework.boot(config)
                          |                             |
                          |                    Router CHANGED → render
                          +-------------+---------------+
                                        |
                        component INSTANCE (per function tag)
                                        |
             one render effect  (@preact/signals-core)
                                        |
         fn(props)  -- TRACKED: signal reads + props.key reads subscribe
                                        |
         VNode slice diff  -- keyed match, per-node listeners, anchors
                                        |
         post-commit flush (untracked) -- child mounts, prop pushes, refs
                                        |
         flushInstanceEffects -- pending useEffect callbacks run
                                        |
signal / prop write --> only SUBSCRIBED instances re-render (batched)
```

Every function tag mounts an **instance** whose rendered children live
directly in the parent element as a contiguous range terminated by a
persistent comment anchor. Parents and children re-render independently;
prop pushes are batched per-key signal writes, so an unchanged prop never
touches the child.

## Installation

```bash
# pnpm
pnpm add @lark.js/mvc

# npm
npm install @lark.js/mvc

# yarn
yarn add @lark.js/mvc
```

`@preact/signals-core` is installed automatically as the framework's only
runtime dependency.

### TypeScript setup

Enable the automatic JSX runtime in `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@lark.js/mvc",
  },
}
```

Add `"@lark.js/mvc/client"` to `types` (or a triple-slash reference) for
`*.css` module declarations and the HMR globals.

### Bundler plugin

Install the bundler plugin matching your build tool. The Vite plugin also
defaults `oxc.jsx = { runtime: "automatic", importSource: "@lark.js/mvc" }`
for you; with Webpack/Rspack the JSX transform comes from your existing
TS/SWC/Babel loader reading the tsconfig above. All three plugins auto-inject
state-preserving component HMR (no `import.meta.hot` boilerplate needed).

> Linking this package via the `file:` protocol? Vite's dependency
> pre-bundle cache is keyed by the lockfile, not by dep contents — after
> rebuilding lark-mvc run `vite --force` (or delete `node_modules/.vite`)
> so the browser picks up the new build.

```ts
// vite.config.ts
import { larkMvcPlugin } from "@lark.js/mvc/vite";

export default defineConfig({
  plugins: [larkMvcPlugin()],
});
```

```ts
// webpack.config.js — plugin form (recommended, zero config)
import { LarkMvcPlugin } from "@lark.js/mvc/webpack";

export default {
  plugins: [new LarkMvcPlugin()],
};
```

```ts
// rspack.config.js — plugin form (recommended, zero config)
import { LarkMvcPlugin } from "@lark.js/mvc/rspack";

export default {
  plugins: [new LarkMvcPlugin()],
};
```

## Quick Start

### 1. Write a function component

```tsx
// src/views/home.tsx
import { useSignal } from "@lark.js/mvc";

export default function Home() {
  const count = useSignal(0);
  return (
    <div class="home">
      <h1>Welcome to Lark</h1>
      <p>Count: {count.value}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  );
}
```

That's the whole reactive loop: the body reads `count.value` (subscribe),
the click handler writes it (re-render). The function re-runs per render;
`useSignal` state survives because hooks are call-order-indexed slots on the
instance.

### 2a. Mount directly (React-DOM style)

```ts
// src/main.ts
import { render } from "@lark.js/mvc";
import Home from "./views/home";

render(<Home />, document.getElementById("root")!);
```

### 2b. Or boot with routing

```ts
// src/main.ts
import { Framework } from "@lark.js/mvc";
import HomeView from "./views/home";
import AboutView from "./views/about";

Framework.boot({
  rootId: "root",
  routeMode: "history",
  defaultView: HomeView,
  routes: {
    "/": HomeView,
    "/about": AboutView,
  },
});
```

Routes accept imported components directly, or registered path strings for
lazy loading / Module Federation (see `registerComponent`). Every confirmed
navigation renders the matched component into the root container — the same
component keeps its instance (state survives param-only changes) and
receives the fresh URL params as props.

### 3. HTML entry point

```html
<!doctype html>
<html>
  <head>
    <title>Lark App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Reactivity

The framework re-exports the `@preact/signals-core` primitives — they are the
single reactivity mechanism for everything:

```ts
import { signal, computed, effect, batch, untracked } from "@lark.js/mvc";
import type { Signal, ReadonlySignal } from "@lark.js/mvc";

const count = signal(1); //   count.value  (read/write)
const doubled = computed(() => count.value * 2); // derived, auto-tracked, lazy
const dispose = effect(() => console.log(count.value)); // runs now + on change
batch(() => {
  count.value = 2;
  count.value = 3; // effects notified ONCE, at batch end
});
untracked(() => count.value); // read without subscribing
```

### Tracked regions

A signal read subscribes the reader **only inside a tracked region**:

| Region                               | Established by               |
| ------------------------------------ | ---------------------------- |
| The component function body          | the instance's render effect |
| `computed(fn)` / `useComputed(fn)`   | the computed                 |
| `useSignalEffect(fn)` / `effect(fn)` | the effect                   |

Every reactive data source in the framework is signal-backed, so reading it
in a tracked region subscribes automatically:

| Source               | Tracked read                 | Write                           |
| -------------------- | ---------------------------- | ------------------------------- |
| instance-local state | `sig.value` (`useSignal`)    | `sig.value = next`              |
| props                | `props.key`                  | parent re-render (per-key push) |
| cross-view State     | `State.get("key")`           | `State.set({ key: next })`      |
| stores               | `store.getState().key`       | `store.setState({...})`         |
| router               | `Router.parse()` (any field) | `Router.to(...)`                |
| queries              | `q.data.value` (`useQuery`)  | fetch lifecycle                 |

Reads outside a tracked region (event handlers, async callbacks) return the
current value without subscribing — use `.peek()` / `untracked()` when you
want to be explicit about it.

### Shallow reactivity (important)

Signals compare by **reference** (`===`), exactly like React state:

```ts
const list = signal([1, 2]);

list.value.push(3); // ✗ in-place mutation — nothing re-renders
list.value = [...list.value, 3]; // ✓ replace the reference

const user = signal({ name: "a" });
user.value.name = "b"; // ✗ invisible
user.value = { ...user.value, name: "b" }; // ✓
```

The same rule applies to `State.set`, `store.setState`, and props: pushing
the **same object reference** again is a no-op; deriving new data requires a
new reference. There is no deep proxy and no dependency on property paths —
one signal per key, compared by identity.

### Rules

- **Do not write a signal that the same body/computed reads.** The effect
  would invalidate itself; `@preact/signals-core` throws `Cycle detected`
  after 100 batch iterations. Derive with `computed`, or write from event
  handlers / `useSignalEffect` with disjoint reads.
- Event handlers already run inside `batch()` — multiple writes in one
  handler produce one render pass per affected instance.
- Rules of hooks apply (the body re-runs per render): call hooks
  unconditionally, in the same order, at the top level of the component.

## Core Concepts

### Components

A component is a plain function used as a JSX tag — never called manually.
Every function tag mounts an **instance** with its own hook slots, props
signals, and render effect. There is no wrapper element: the component's
output is spliced directly into the parent (so `<ul><Row/></ul>` produces
valid `<ul><li>...</li></ul>` DOM).

```tsx
import { useSignal, useComputed, useEffect } from "@lark.js/mvc";

interface Props {
  items?: string[];
  onPick?: (data: { item: string }) => void;
}

export default function Picker(props: Props) {
  const query = useSignal("");
  const filtered = useComputed(() => (props.items ?? []).filter((i) => i.includes(query.value)));

  useEffect(() => {
    const timer = setInterval(() => console.log("tick"), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <input
        value={query.value}
        onInput={(e) => (query.value = (e.target as HTMLInputElement).value)}
      />
      <ul>
        {filtered.value.map((item) => (
          <li key={item} onClick={() => props.onPick?.({ item })}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

The body is the tracked template — it re-runs per render. Derived data is
ordinary code inline, or `useComputed` when it should cache.

### Hooks

Hooks are call-order-indexed slots on the current instance (React rules of
hooks). All state survives re-renders; `useSignal`/`useRef` also survive HMR
swaps.

| Hook                        | Semantics                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `useSignal(initial)`        | Stable `Signal` per slot — read in JSX (subscribe), write from handlers (re-render)                 |
| `useRef(initial?)`          | Stable `{ current }` cell — element refs (`ref={r}`) or mutable non-reactive storage                |
| `useComputed(fn)`           | `computed(fn)` created once — signal-derived data, no deps array                                    |
| `useMemo(fn, deps?)`        | Recompute when deps change (`Object.is`); no deps → every render                                    |
| `useEffect(fn, deps?)`      | Runs AFTER the DOM commit; no deps → every render, `[]` → mount only; cleanup before re-run/unmount |
| `useSignalEffect(fn)`       | Reactive effect created once — re-runs when signals it read change; disposed on unmount             |
| `onCleanup(fn)`             | Register an unmount cleanup (once per slot)                                                         |
| `useUrlState(defaults)`     | `[read, write]` — URL params as tracked state                                                       |
| `useQuery(key, fetcher, o)` | TanStack-style async state — slot-cached, disposed on unmount                                       |

```tsx
// DOM access: ref + mount effect
const input = useRef<HTMLInputElement>();
useEffect(() => input.current?.focus(), []);
return <input ref={input} />;
```

```tsx
// Window listeners: useEffect; reactive side effects: useSignalEffect
const width = useSignal(window.innerWidth);
useEffect(() => {
  const onResize = () => (width.value = window.innerWidth);
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}, []);
useSignalEffect(() => {
  document.title = `width: ${width.value}`;
});
```

### render / unmount

React-DOM-style root API:

```ts
import { render, unmount } from "@lark.js/mvc";

render(<App />, container); // first call takes ownership (clears content)
render(<App page={2} />, container); // re-render: diff in place, state survives
unmount(container); // dispose everything, run cleanups, clear DOM
```

- Repeat `render()` calls diff against the previous tree: instances are
  matched by function identity (and `key`), changed props are pushed through
  per-key signals.
- Signal children/attributes in the tree stay live without re-calling
  `render` (the root owns a render effect too).

### Component props, callbacks, children, key, ref

Props are **real in-memory objects** delivered through a stable reactive
proxy — reading `props.key` in the body subscribes the instance to THAT key
only.

```tsx
function Parent() {
  const rows = useSignal<Row[]>([]);
  return (
    <Child key="c1" rows={rows.value} onSelect={(d) => console.log(d)}>
      <em>slot content</em>
    </Child>
  );
}

function Child(props: {
  rows?: Row[];
  children?: JSXNode;
  onSelect?: (d: { id: number }) => void;
}) {
  return (
    <section>
      <ul>
        {(props.rows ?? []).map((r) => (
          <li key={`r-${r.id}`} onClick={() => props.onSelect?.({ id: r.id })}>
            {r.name}
          </li>
        ))}
      </ul>
      {props.children}
    </section>
  );
}
```

| Prop            | Behavior                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `key`           | Vnode-level sibling compare key — preserves the instance across reorders   |
| `children`      | Delivered as `props.children` (JSXNode)                                    |
| callbacks       | Plain function props — the child calls them directly (`props.onX?.(data)`) |
| everything else | The child's reactive `props` proxy — objects/functions by live reference   |

Notes:

- **Callbacks are just props** (React semantics) — there is no event
  emitter, no trampoline, no `fire()`. Compose by wrapping:
  `<Grandchild onPick={(d) => props.onPick?.(transform(d))} />`.
- **Fine-grained updates**: a parent re-render pushes only CHANGED prop
  values (reference comparison); the child re-renders only if it read a
  changed key. A prop the parent stops passing reads as `undefined`.
- **Signal-as-prop**: pass the signal itself (`<Child count={count} />`) —
  the child reads `.value` in its own body and updates **without the parent
  re-rendering** (component props are the one place signals are NOT
  auto-unwrapped).
- `class`/`style`/`id`/`ref` on a component tag are **ordinary props** — the
  component decides where they land (there is no host element). React 19
  style: `ref` is a normal prop to forward.
- Children vnodes are created in the PARENT's body, so signal reads inside
  slot expressions subscribe the parent (React semantics).

### Routing

The Router supports two modes with a two-phase change confirmation protocol.
`Router.parse()` is a **tracked read** — calling it inside a component body,
`computed`, or `useSignalEffect` subscribes the caller to navigation.

```ts
import { Router } from "@lark.js/mvc";

// Navigate
Router.to("/list", { page: 2 });
Router.to({ page: 3 }); // update params only, keep current path
Router.to("/detail", { id: "123" }, true); // replace history entry

// Parse current URL (tracked when called in a tracked region)
const loc = Router.parse();
loc.path; // "/list"
loc.params; // { page: "2" }
loc.get("page"); // "2"
loc.get("missing", "default"); // "default"

// Compute diff
Router.diff();
// { params: { page: { from: "1", to: "2" } }, path: {...}, changed: true }

// Join path segments
Router.join("/api", "v1", "users"); // "/api/v1/users"
```

A component that reacts to the URL simply reads it in the body:

```tsx
function Pager() {
  return <p>page = {Router.parse().get("page", "1")}</p>;
}

// Or drive async work from navigation:
useSignalEffect(() => {
  const path = Router.parse().path; // subscribe
  untracked(() => void loadContent(path)); // async body untracked
});
```

#### Two-Phase Change Confirmation

```
User action (Router.to, back/forward, link click)
       |
   CHANGE event (preventable)
       |
   +---+---+
   |       |
 reject  resolve  prevent
 (revert) (commit) (suspend)
   |       |
   |   beforeEach guards (async)
   |       |
   |   +---+---+
   |   |       |
   | false   true/undefined
   |   |       |
   | reject  resolve
   |           |
   CHANGED event (final)
       |
   location signal bump  -->  tracked Router.parse() readers re-render
       |
   route dispatch: render(matched component, rootContainer)
```

```ts
Router.on("change", (e) => {
  // e.reject() -- revert URL
  // e.prevent() -- pause navigation
  // e.resolve() -- commit navigation
});

Router.on("changed", (e) => {
  // e.params / e.path / e.view / e.changed
});

// Async navigation guard
const unGuard = Router.beforeEach(async (to, from) => {
  if (to.path === "/admin") {
    return await checkAuth(); // false aborts navigation
  }
  return true;
});
// Later: unGuard()
```

#### Route dispatch

Every confirmed navigation renders the matched component into the root
container via the same `render()` diff:

- Route-view change → the component swaps (old instance unmounted).
- Param-only change → SAME instance, fresh URL params pushed as props
  (state survives).
- Async loads (string routes via `config.require`) are guarded by a
  navigation token — a stale load never overwrites a newer route.

```ts
Framework.boot({
  rootId: "root",
  routes: {
    "/home": HomeView, // imported component
    "/detail": { view: DetailView, title: "Detail" },
    "/admin": "app/views/admin", // lazy-loaded via config.require
  },
  defaultView: HomeView,
  unmatchedView: NotFoundView,
  defaultPath: "/home",
  rewrite(path, params, routes) {
    if (path === "/" && !routes[path]) return "/home";
    return path;
  },
});
```

### State Management

lark-mvc provides two state management layers, both signal-backed.

#### State (Simple Cross-View Data)

`State` is a singleton for lightweight shared values (counters, toggles,
session info). Every key is its own signal:

```tsx
import { State, useEffect } from "@lark.js/mvc";

// Write — batched per-key signal writes; subscribed components re-render.
State.set({ count: 1, title: "Hello" });

// Read — tracked when called inside a body/computed/useSignalEffect
State.get("count"); // subscribes to "count" only
State.get(); // snapshot; subscribes to EVERY State change

// In a component:
export default function Header() {
  // Ref-counted cleanup: key data dropped when the last observer unmounts
  useEffect(() => State.clean("count,title"), []);
  return (
    <p>
      {String(State.get("title"))}: {Number(State.get("count"))}
    </p>
  );
}
```

Shallow semantics apply: `State.set({ list: sameArrayRef })` is a no-op —
replace the reference. `State.on/off/fire` remain as a general-purpose
pub/sub channel (unrelated to reactivity).

#### createStore (Complex Reactive State)

For complex state with actions, derived data, and fine-grained subscriptions:

```tsx
import { createStore, computed } from "@lark.js/mvc";

const counterStore = createStore("counter", (set, get) => ({
  count: 0,
  step: 1,

  // Derived: dependencies tracked automatically — no deps array
  doubled: computed(() => get().count * 2),

  // Actions: functions attached to state
  increment() {
    set({ count: get().count + get().step });
  },
  setStep(step: number) {
    set({ step });
  },
}));

// Read state — getState() returns a STABLE tracked proxy: reading a key
// inside a component body subscribes that instance to THAT key only.
counterStore.getState().count;

// Update state — batched; Object.is-equal values are skipped
counterStore.setState({ count: 5 });

// Manual subscription (zustand semantics)
const unSub = counterStore.subscribe((state, prevState) => {});

// In a component — no hook needed, just read in the body:
export default function CounterButton() {
  const { count, doubled, increment } = counterStore.getState();
  return (
    <button onClick={increment}>
      {count} (doubled: {doubled})
    </button>
  );
}
```

Notes:

- `getState()` is one stable proxy — spreading it (`{ ...getState() }`)
  produces a plain snapshot (and subscribes to all keys read).
- Writes to computed/action keys via `setState` are silently ignored;
  unknown keys create new state slots (zustand semantics).
- Shallow: `setState({ list: get().list })` after an in-place `push` is a
  no-op — build a new array.

### Data Fetching

#### useQuery / createQuery (TanStack-style, recommended)

```tsx
import { useQuery, Router } from "@lark.js/mvc";

export default function UserCard() {
  const user = useQuery(
    () => `user/${Router.parse().get("id")}`, // reactive key (tracked)
    (key) => fetch(`/api/${key}`).then((r) => r.json()),
    { staleTime: 30_000 },
  );
  return (
    <div>
      {user.isLoading.value && <p>Loading…</p>}
      {user.error.value != null && <p>Failed to load.</p>}
      {user.data.value && <p>{user.data.value.name}</p>}
      <button onClick={() => user.refetch()}>Reload</button>
    </div>
  );
}
```

- Results are signals (`data`/`error`/`isLoading`/`isFetching`) — reads
  subscribe the component.
- In-flight dedup, `staleTime` freshness, reactive keys, and
  `invalidateQueries(prefix?)` for cache invalidation.
- `useQuery` is the hook form (slot-cached, auto-disposed on unmount);
  `createQuery` is the standalone form — the caller owns `dispose()`.
- `createMutation(fn)` is the write-side counterpart:
  `{ mutate, data, error, isPending, reset }`.

#### createService (callback-based request layer)

The Service system manages API requests with LFU caching, deduplication,
serial queuing, and lifecycle events:

```tsx
import { createService, useSignal, onCleanup } from "@lark.js/mvc";

const apiService = createService(
  (payload, callback) => {
    fetch(payload.get("url"), { method: payload.get("method") || "GET" })
      .then((res) => res.json())
      .then((result) => {
        payload.set("result", result);
        callback();
      })
      .catch((err) => {
        payload.set("error", err);
        callback();
      });
  },
  20, // cacheMax
  5, // cacheBuffer
);

apiService.add({
  name: "getUser",
  url: "/api/user",
  cache: 30000, // 30s TTL
  before(payload) {
    payload.set("url", `/api/user/${payload.get("id")}`);
  },
});

// In a component — create the instance in a slot, results land in signals
export default function UserButton() {
  const svc = useMemo(() => apiService.instance(), []);
  onCleanup(() => svc.destroy());
  const userName = useSignal("");

  const loadUser = (): void => {
    svc.all([{ name: "getUser", id: "123" }], (errors, payload) => {
      userName.value = String(payload.get("userName") ?? "");
    });
  };

  return <button onClick={loadUser}>{userName.value || "Load user"}</button>;
}
```

| Instance method              | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `instance.all(attrs, done)`  | Fetch all, callback with `(errors, p1, p2, ...)`                         |
| `instance.one(attrs, done)`  | Fetch all, callback per-attribute with `(error, payload, isLast, index)` |
| `instance.save(attrs, done)` | Fetch all, skip cache (always request)                                   |
| `instance.enqueue(callback)` | Add to serial task queue (self-drains once idle)                         |
| `instance.destroy()`         | Cancel pending requests                                                  |

| Type method         | Description                                |
| ------------------- | ------------------------------------------ |
| `api.add(meta)`     | Register endpoint metadata                 |
| `api.meta(name)`    | Look up endpoint metadata                  |
| `api.cached(attrs)` | Read from cache without fetching           |
| `api.clear(names)`  | Clear cached responses for endpoints       |
| `api.on/off/fire`   | Type-level events (begin, done, fail, end) |
| `api.instance()`    | Create a new service instance              |

## JSX Semantics

JSX compiles to plain `jsx()` calls via the standard automatic runtime; the
VNode tree is pure data reconciled directly into the live DOM. There is no
template compiler — conditionals, loops, and formatting are ordinary code.

### Children semantics

| JSX                      | Behavior                                                            |
| ------------------------ | ------------------------------------------------------------------- |
| `{expr}` (string/number) | Text node (`0` renders; `boolean/null/undefined/""` render nothing) |
| `{sig}` (Signal)         | Auto-unwrapped to `sig.value` (tracked read)                        |
| `{raw(html)}`            | Trusted raw HTML block — never pass untrusted input                 |
| `{cond && <div/>}`       | Conditional rendering (falsy values are dropped)                    |
| `{list.map(...)}`        | List rendering (arrays are flattened)                               |
| `<>...</>` (Fragment)    | Multiple roots without a wrapper element                            |
| `<Comp prop={x}/>`       | Function component — mounts a hostless INSTANCE (state, hooks)      |

Strings are ALWAYS text — dangerous characters stay text data, nothing is
parsed as markup. `raw()` is the single explicit trusted-HTML path
(dangerouslySetInnerHTML equivalent).

### Attribute semantics

| Attribute                        | Behavior                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `class` / `className`            | String, array (falsy entries dropped), or `{ name: boolean }` map — merged               |
| `style`                          | String, or camelCase object (kebab-cased; `--x` custom props pass through)               |
| `key`                            | Vnode-level sibling compare key (React semantics) — NOT written to the DOM               |
| `ref`                            | `(el \| null) => void` callback or `{ current }` cell — called post-commit               |
| `disabled={true}`                | Boolean attribute → `disabled=""`; `false`/nullish remove the attribute                  |
| `title={sig}`                    | Signal attribute values auto-unwrap (tracked read)                                       |
| `value` / `checked` / `selected` | Synced as DOM **properties** on form elements; template value re-asserts over user edits |
| `data-x={object}`                | NOT supported — objects/functions are skipped with a dev warning                         |
| `onClick={fn}`                   | Per-node listener — inline functions only                                                |

SVG (`<svg>`) and MathML (`<math>`) subtrees create namespaced elements;
`<foreignObject>` children return to the HTML namespace.

### Event binding

Events use React-style camelCase props with **inline function values only**;
the type is the lowercased remainder (`onClick` → `click`). Each node gets
ONE native listener per event type with a stable proxy whose `.current`
handler is swapped every render — closures never go stale:

```tsx
{
  items.value.map((item) => (
    <button key={`del-${item.id}`} onClick={() => deleteItem(item.id)}>
      Delete
    </button>
  ));
}
```

Notes:

- Handlers receive the **native DOM event** — use `e.target` /
  `e.currentTarget`.
- Handlers run inside `batch()` — multiple signal writes in one handler
  produce ONE render pass per affected instance.
- Lowercase `onclick`-style props and string handler values are rejected
  (native inline handlers would execute attribute text as JavaScript).
- Window/document listeners: use `useEffect` + `addEventListener`.

## Hot Module Replacement

HMR hot-swaps component code without a full page reload, preserving instance
state.

On module update, `hotSwapByComponent(old, new)`:

1. Aliases the new function to the old one — parents holding the stale
   import keep matching live instances (canonical identity), and string
   routes keep resolving.
2. Swaps registry entries.
3. Swaps every live instance in place: **`useSignal`/`useRef` slots
   survive**; closure-bound slots (effects, computeds, memos, queries) are
   disposed and recreated by the next render so no stale closures linger.
   The instance re-renders with the new code.

The bundler plugins auto-inject the HMR boilerplate at compile time into
every `.tsx`/`.jsx` module with a default export (runtime guards make
non-component exports a no-op). Users never write `import.meta.hot` /
`import.meta.webpackHot` themselves.

## Micro-Frontend Support

lark-mvc supports Module Federation and cross-project component loading via
`FrameworkConfig.require`:

```ts
Framework.boot({
  rootId: "root",
  require(names, params) {
    return Promise.all(
      names.map((name) => {
        if (name.startsWith("remote-app/")) {
          return import("remote_app/" + name.slice("remote-app/".length));
        }
        return import("./src/" + name);
      }),
    );
  },
  routes: {
    "/": "host-app/views/home",
    "/remote": "remote-app/views/detail",
  },
});
```

String routes resolve through the component registry
(`registerComponent(path, fn)`); unregistered paths load through
`config.require` and register on arrival. Share `@lark.js/mvc` as a
singleton in the MF `shared` config.

## API Reference

### Exports

| Category   | Exports                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Reactive   | `signal`, `computed`, `effect`, `batch`, `untracked`, `Signal`, `ReadonlySignal` (type)         |
| Rendering  | `render`, `unmount`, `raw`, `Fragment`                                                          |
| Components | `registerComponent`, `invalidateComponent`; `FC` / `Component` / `JSXNode` / `VNode` (types)    |
| Hooks      | `useSignal`, `useRef`, `useComputed`, `useMemo`, `useEffect`, `useSignalEffect`, `onCleanup`    |
| State      | `State`, `createStore`, `useUrlState`                                                           |
| Query      | `createQuery`, `useQuery`, `createMutation`, `invalidateQueries`, `clearQueryCache`             |
| Router     | `Router`                                                                                        |
| Service    | `createService`; `ServiceApi`, `ServiceInstance` (types)                                        |
| Framework  | `Framework` (boot / config / toUri / parseUri / delay / createCache / createEmitter / ...)      |
| Types      | All types from `./types` via `export *` (`LarkEvent`, `LarkAttributes`, `FrameworkConfig`, ...) |

### Package Entry Points

| Import                         | Description                                                         |
| ------------------------------ | ------------------------------------------------------------------- |
| `@lark.js/mvc`                 | Main runtime API (`render`, hooks, `raw`, `Fragment`, ...)          |
| `@lark.js/mvc/jsx-runtime`     | JSX automatic runtime (`jsx`, `jsxs`, `Fragment`, `raw`, JSX types) |
| `@lark.js/mvc/jsx-dev-runtime` | JSX automatic dev runtime (`jsxDEV`)                                |
| `@lark.js/mvc/vite`            | Vite plugin (`larkMvcPlugin`)                                       |
| `@lark.js/mvc/webpack`         | Webpack integration (`LarkMvcPlugin`, `larkMvcLoader`)              |
| `@lark.js/mvc/rspack`          | Rspack integration (`LarkMvcPlugin`, `larkMvcLoader`)               |
| `@lark.js/mvc/client`          | Ambient types (`*.css` modules, HMR globals)                        |

## Configuration

### FrameworkConfig

| Key             | Type                                                     | Default     | Description                                        |
| --------------- | -------------------------------------------------------- | ----------- | -------------------------------------------------- |
| `rootId`        | `string`                                                 | `"root"`    | DOM root element ID (route components render here) |
| `routeMode`     | `"history" or "hash"`                                    | `"history"` | Routing mode                                       |
| `defaultView`   | `string or Component`                                    | -           | Default view when URL matches no route             |
| `defaultPath`   | `string`                                                 | `"/"`       | Default path when URL hash/query is empty          |
| `routes`        | `Record<string, string or Component or RouteViewConfig>` | -           | Path-to-component mapping                          |
| `hashbang`      | `string`                                                 | `"#!"`      | Hash prefix (hash mode only)                       |
| `error`         | `(error: Error) => void`                                 | -           | Global error sink (render errors included)         |
| `rewrite`       | `(path, params, routes) => string`                       | -           | Route rewriting function                           |
| `unmatchedView` | `string or Component`                                    | -           | View for 404 pages                                 |
| `require`       | `(names, params?) => Promise<unknown[]>`                 | -           | Async module loader (Module Federation)            |

`boot()` normalizes function-component entries to internal registry-name
strings (`ensureComponentName`), so Router internals stay string-based.

### RouteViewConfig

```ts
interface RouteViewConfig {
  view: string | Component; // Path or imported component
  [k: string]: unknown; // Additional properties merged into location
}
```

## Development

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test           # run tests
pnpm test:watch     # watch mode
pnpm test:coverage  # with coverage
```

### Type Check

```bash
pnpm typecheck
```

### Format

```bash
pnpm format
```

### Project Structure

```
packages/lark-mvc/
  src/
    index.ts              -- public API barrel export
    types.ts              -- all shared type definitions
    reactive.ts           -- @preact/signals-core facade (signal/computed/...)
    common.ts             -- constants, shared helpers
    utils.ts              -- utility functions
    framework.ts          -- Framework.boot, route dispatch (render into root)
    component.ts          -- instance model, hook slots, props store, HMR registry
    component-registry.ts -- path-string registry + HMR alias map
    router.ts             -- Router with two-phase change + location signal
    state.ts              -- State singleton (per-key signals)
    store.ts              -- createStore (per-key signals, tracked proxy)
    query.ts              -- createQuery/useQuery/createMutation
    service.ts            -- createService, API management
    hooks.ts              -- useSignal, useEffect, useComputed, etc.
    event-emitter.ts      -- multi-cast event system
    cache.ts              -- LFU-style bounded cache
    url-state.ts          -- useUrlState hook
    module-loader.ts      -- async module loading
    hmr.ts                -- hotSwapByComponent
    hmr-inject.ts         -- HMR code generation for bundlers
    client.d.ts           -- ambient type declarations
    vite.ts               -- Vite plugin
    webpack.ts            -- Webpack loader/plugin
    rspack.ts             -- Rspack loader/plugin
    jsx-runtime.ts        -- JSX automatic runtime entry (jsx/jsxs + JSX types)
    jsx-dev-runtime.ts    -- JSX automatic dev runtime entry (jsxDEV)
    jsx/
      vnode.ts            -- pure VNode model (Symbol.for markers, raw())
      reconcile.ts        -- VNode -> DOM reconciler, instances, render/unmount
  tests/                  -- vitest test suite
  dist/                   -- built output
```

### Key Design Decisions

1. **Functional over OOP**: all APIs are factory functions and closures. No
   class, this, or prototype anywhere in the framework runtime.

2. **React FC authoring, signals execution**: the component function re-runs
   per render inside ONE signals effect per instance — the effect IS the
   dirty check. No digest, no dispatcher, no whole-tree re-render: only
   instances that READ a changed signal/prop re-run.

3. **Hostless reconciliation**: component instances live inside the
   reconciler; their rendered children splice directly into the parent
   element as an anchor-terminated range. Output DOM matches React's — no
   wrapper elements, valid table/list structures.

4. **Per-key props signals**: parents push props through per-key signals
   with reference comparison — finer-grained than React's whole-props
   identity model, no `memo()` needed.

5. **Two-phase routing**: the Router fires a `change` event before
   navigation (allowing rejection) and a `changed` event after; a location
   version signal makes `Router.parse()` a tracked read. Route dispatch is
   just `render()` into the root container.

6. **Per-node event listeners**: one native listener per (node, type) with a
   stable proxy; renders swap `.current`. Dispatch runs inside `batch()`.

7. **State-preserving HMR**: live instances swap their component function in
   place — plain state slots survive, closure-bound slots are recreated —
   via a broad compile-time injection with runtime guards.

8. **LFU cache with frequency eviction**: the bounded cache uses single-pass
   partial selection instead of full sorting, keeping eviction cheap for the
   typical buffer size of 5.
