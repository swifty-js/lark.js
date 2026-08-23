# @lark.js/mvc

A lightweight TypeScript Mvc frontend framework for single-page applications and micro-frontend scenarios.

## Overview

lark-mvc is a functional-first framework built on **signals reactivity**
(`@preact/signals-core`). Views are written with React-style JSX (automatic
runtime, `jsxImportSource: "@lark.js/mvc"`) and rendered through a real-DOM
diff engine. Every mounted view runs its template inside one render effect —
reading a signal subscribes the view, writing it re-renders synchronously.
There is no manual digest, no dirty-checking, no observer declarations.

Design principles:

- Functional API: no class, no this, no prototype, no mixin
- Signals-based reactivity — read = subscribe, write = re-render; **shallow**
  (reference) comparison, like React/Preact
- React-style JSX templates — real JS scoping, inline event closures, type checking
- Real DOM diff via innerHTML plus keyed comparison (no virtual DOM)
- Module Federation support for micro-frontends
- One runtime dependency: `@preact/signals-core` (~1.5 kB gzip)

## Architecture

```
                          Framework.boot(config)
                                |
          +---------------------+---------------------+
          |                     |                     |
       Router               State                Frame Tree
    (history/hash)     (per-key signals)       (mount/unmount)
          |                     |                     |
    two-phase             tracked get(key)        createFrame
    confirmation          batched set(obj)       parent-child
          |                     |                     |
   route-view mount             |              params proxy (per-key signals)
          |                     |                     |
          +----------+----------+----------+----------+
                     |
        per-view render effect  (@preact/signals-core)
                     |
        template()  -- TRACKED: every signal read subscribes the view
                     |
     real-DOM diff (innerHTML plus keyed comparison)
                     |
        endUpdate -> mountZone  -- UNTRACKED: children own their own effects
```

Signal writes re-run only the render effects that read them. DOM event
handlers and child→parent trampolines run inside `batch()`, so multi-signal
writes coalesce into one render pass per affected view.

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

### Peer dependencies

- Vite 8+ (optional, for the Vite plugin)

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

### Bundler plugin

Install the bundler plugin matching your build tool. The Vite plugin also
defaults `oxc.jsx = { runtime: "automatic", importSource: "@lark.js/mvc" }`
for you; with Webpack/Rspack the JSX transform comes from your existing
TS/SWC/Babel loader reading the tsconfig above. All three plugins auto-inject
state-preserving view HMR (no `import.meta.hot` boilerplate needed).

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

### 1. Define a view component (JSX)

```tsx
// src/views/home.tsx
import { defineView, jsxTemplate, signal } from "@lark.js/mvc";

export default defineView(() => {
  const count = signal(0);

  const template = jsxTemplate(() => (
    <div class="home">
      <h1>Welcome to Lark Mvc</h1>
      <p>Count: {count.value}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  ));

  return { template };
});
```

That's the whole reactive loop: the template reads `count.value` (subscribe),
the click handler writes it (re-render). No digest calls, no state
declarations. Events are inline functions — there is no events map and no
handler-name strings.

### 2. Boot the framework

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

Routes accept imported components directly (or registered view-path strings
for lazy loading / Module Federation — see `registerViewClass`).

### 3. HTML entry point

```html
<!doctype html>
<html>
  <head>
    <title>Lark Mvc App</title>
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

| Region                               | Established by           |
| ------------------------------------ | ------------------------ |
| The view template (`jsxTemplate` fn) | the view's render effect |
| `computed(fn)` bodies                | the computed             |
| `useSignalEffect(fn)` / `effect(fn)` | the effect               |

Every reactive data source in the framework is signal-backed, so reading it
in a tracked region subscribes automatically:

| Source           | Tracked read                 | Write                          |
| ---------------- | ---------------------------- | ------------------------------ |
| view-local state | `sig.value`                  | `sig.value = next`             |
| props            | `params.key`                 | parent re-render (`mountZone`) |
| cross-view State | `State.get("key")`           | `State.set({ key: next })`     |
| stores           | `store.getState().key`       | `store.setState({...})`        |
| router           | `Router.parse()` (any field) | `Router.to(...)`               |

Reads outside a tracked region (setup body, event handlers, async callbacks)
return the current value without subscribing — use `.peek()` /
`untracked()` when you want to be explicit about it.

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

- **Do not write a signal that the same template/computed reads.** The
  effect would invalidate itself; `@preact/signals-core` throws
  `Cycle detected` after 100 batch iterations. Derive with `computed`, or
  write from event handlers / `useSignalEffect` with disjoint reads.
- Event handlers already run inside `batch()` (DOM delegation and
  child→parent trampolines) — multiple writes in one handler produce one
  render pass per affected view.
- Every reactive re-render bumps `ctx.signature` — `ctx.wrapAsync` callbacks
  from before the render are dropped (by design).

## Core Concepts

### Views

A view component is defined via `defineView<P>()`. The setup function runs
once on mount, receives a `ViewCtx` and the reactive `params` proxy, and
returns `{ template }`. The result is used directly as a JSX tag — never
called as a function.

```tsx
import { defineView, jsxTemplate, signal, useEffect } from "@lark.js/mvc";

export default defineView((ctx) => {
  // View-local state — template reads subscribe, writes re-render
  const name = signal("world");

  // Side effect with cleanup
  useEffect(() => {
    const timer = setInterval(() => console.log("tick"), 1000);
    return () => clearInterval(timer);
  });

  const template = jsxTemplate(() => (
    <p onClick={() => (name.value = "Lark")}>Hello, {name.value}!</p>
  ));

  return { template };
});
```

Derived data is ordinary code inside the template (it re-runs per render) or
a `computed()` when it should cache:

```tsx
const items = signal<Item[]>([]);
const total = computed(() => items.value.reduce((s, i) => s + i.price, 0));

const template = jsxTemplate(() => (
  <p>
    {items.value.length} items, total {total.value}
  </p>
));
```

Window/document-level listeners are plain `useEffect` work; reactive
side effects (run again when a signal changes) use `useSignalEffect`:

```tsx
const width = signal(window.innerWidth);

useEffect(() => {
  const onResize = () => (width.value = window.innerWidth);
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
});

useSignalEffect(() => {
  document.title = `width: ${width.value}`; // re-runs on every width change
});
```

#### ViewCtx

The `ViewCtx` is the first argument to every setup function:

| Member                       | Description                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `ctx.render()`               | Force a re-render through the render effect (rarely needed — writes re-render automatically) |
| `ctx.capture(key, resource)` | Register a destroyable resource                                                              |
| `ctx.release(key)`           | Remove and destroy a resource                                                                |
| `ctx.on(event, handler)`     | Listen to view lifecycle events (`render`, `destroy`)                                        |
| `ctx.fire(event, data)`      | Emit a view event                                                                            |
| `ctx.wrapAsync(fn)`          | Wrap async callback with signature guard                                                     |
| `ctx.endUpdate(zoneId)`      | End zone update (remount children)                                                           |
| `ctx.refData`                | Ref-token store read by templates (internal)                                                 |
| `ctx.translate(token)`       | Resolve a refData token to its live value (internal)                                         |
| `ctx.signals`                | Keyed signals created via `useSignal` (HMR-preserved)                                        |
| `ctx.id`                     | View ID (same as owner frame ID)                                                             |
| `ctx.owner`                  | Owner frame reference (`ctx.owner.fire` = child→parent)                                      |

#### View Lifecycle

```
mountView(viewPath)
       |
   createCtx(frame)
       |
   setCurrentCtx(ctx)
       |
   untracked( setup(ctx, params) )   -- setup-body reads never leak into an
       |                                enclosing render effect
   +-- hooks: useSignal, useEffect, useSignalEffect, ...
       |
   setCurrentCtx(null)
       |
   wire template
       |
   signature.value = 1;  frame.view = ctx
       |
   createRenderEffect(ctx)
       |
   effect(() => renderCore())        -- first run = initial render
       |
   template() TRACKED --> DOM diff --> untracked( endUpdate/mountZone )
```

Each render pass: `signature.value++` → fire `"render"` → destroy
`destroyOnRender` resources → evaluate template (tracked) → keyed DOM diff →
mount child zones (untracked — children own their own render effects).

On unmount:

```
unmountView()
       |
   run useEffect cleanups (reverse order)   -- includes the render-effect
       |                                       dispose and event unbinding
   destroyAllResources(ctx, true)
       |
   fire("destroy")
       |
   signature.value = 0
```

### Frame System

The Frame system manages the view lifecycle tree. Each Frame is a plain object with closure-based methods, registered in a global Map keyed by DOM element ID.

```ts
import { Frame, createFrame } from "@lark.js/mvc";

// Create the root frame (called by Framework.boot)
const root = Frame.createRoot("root");

// Mount a view into a DOM element
root.mountView("src/views/home");

// Mount a child frame
const child = root.mountFrame("child-id", "src/views/detail", { id: "123" });

// Navigate the tree
const parent = child.parent();
const children = root.children();

// Cross-view method invocation
child.invoke("loadData", [{ id: "456" }]);

// Zone management: mount/unmount child frames in a DOM region
root.mountZone("zone-id");
root.unmountZone("zone-id");

// Unmount
child.unmountView();
root.unmountFrame("child-id");
```

#### Frame Singleton API

| Method                      | Description                                 |
| --------------------------- | ------------------------------------------- |
| `Frame.get(id)`             | Get frame by DOM element ID                 |
| `Frame.getAll()`            | Get all frames as a Map                     |
| `Frame.getRoot()`           | Get the root frame                          |
| `Frame.createRoot(rootId)`  | Create (or return) the singleton root frame |
| `Frame.on(event, handler)`  | Listen to static frame events (add/remove)  |
| `Frame.off(event, handler)` | Unbind static frame event                   |
| `Frame.fire(event, data)`   | Fire static frame event                     |

#### Frame Instance Methods

| Method                                | Description                                 |
| ------------------------------------- | ------------------------------------------- |
| `frame.mountView(path, params?)`      | Mount a view (sync or async load)           |
| `frame.unmountView()`                 | Unmount current view                        |
| `frame.mountFrame(id, path, params?)` | Mount a child frame                         |
| `frame.unmountFrame(id?)`             | Unmount a child frame                       |
| `frame.mountZone(zoneId?)`            | Find and mount all \v-lark elements in zone |
| `frame.unmountZone(zoneId?)`          | Unmount child frames in zone                |
| `frame.parent(level?)`                | Navigate up the tree                        |
| `frame.invoke(name, args?)`           | Cross-view method call                      |
| `frame.children()`                    | Get child frame IDs                         |
| `frame.paramsStore`                   | Reactive props store (per-key signals)      |
| `frame.on/off/fire`                   | Frame-level events                          |

#### Embedded Components

Child views are embedded by using the imported component directly as a JSX
tag. The serializer emits a host `<div>` carrying an internal `v-lark` wire
attribute (an auto-registered name like `__v1_Detail`, or the explicit
`registerViewClass` path when one exists); `mountZone` scans these hosts and
mounts a child frame for each one.

```tsx
import Detail from "./views/detail";

const template = jsxTemplate(() => <Detail class="panel" />);
```

Raw registered-path HTML still mounts (markdown pipelines, router views):
`registerViewClass("views/detail", Detail)` + `<div v-lark="views/detail"></div>`.

#### Component Props & Events

Pass data and event handlers to child components as regular JSX props:

```tsx
import CounterUpdater from "./components/counter-updater";

const count = signal(0);
const history = signal<number[]>([]);

const template = jsxTemplate(() => (
  <CounterUpdater
    key="counter-updater"
    class="mx-2"
    count={count.value}
    history={history.value}
    onIncrement={() => (count.value += 1)}
    onClearHistory={() => (history.value = [])}
  />
));
```

| Prop                               | Behavior                                                                |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `id` / `key` / `class` / `style`   | Routed to the auto-generated host element (`key` becomes the host `id`) |
| `on` + Capitalized, function value | Child→parent event subscription (`onClearHistory` → `"clearHistory"`)   |
| everything else                    | Delivered to the child's `params` — objects/functions by live reference |

All child props travel through ONE refData token (`p-lark` wire attribute),
so names keep their exact camelCase and values keep their types — `count={5}`
arrives as the number `5`. `children` are not supported on component tags.

**Props flow (reactive):** the child's `params` is a proxy over per-key
signals. Reading `params.key` inside the child's **template** subscribes the
child to that key. When the parent re-renders, `mountZone` batch-writes the
fresh props into the signals — the child re-renders only if a key it actually
read changed (reference comparison). Props read once in the setup body are a
snapshot and never update — read props in the template, like React render
functions. A prop the parent stops passing reads as `undefined`.

```tsx
// Child component — props are read INSIDE the template (tracked)
export default defineView<{ count?: number; onIncrement?: () => void }>((ctx, params) => {
  const template = jsxTemplate(() => (
    <button onClick={() => ctx.owner.fire("increment")}>count: {params?.count ?? 0}</button>
  ));
  return { template };
});
```

**Signal-as-prop (fine-grained):** pass the signal itself instead of its
value — the child reads `.value` in its own template and updates **without
re-rendering the parent**:

```tsx
const count = signal(0);
// Parent template does NOT read count.value — parent never re-renders on count
const template = jsxTemplate(() => <Counter count={count} />);

// Child
const template = jsxTemplate(() => <b>{(params!.count as Signal<number>).value}</b>);
```

**Events flow:** Child calls `ctx.owner.fire("eventName", data?)` → the frame
emitter hits a stable trampoline that always points at the parent's LATEST
handler prop (re-synced every parent render — inline closures never go
stale). Handler calls run inside `batch()`. Event names match exactly
(case-sensitive); they never pass through HTML attributes.

Use `key` on components rendered in `map()` loops — it becomes the host `id`
and preserves child frames (and their state) across list reorders.

### Routing

The Router supports two modes with a two-phase change confirmation protocol.
`Router.parse()` is a **tracked read** — calling it inside a template,
`computed`, or `useSignalEffect` subscribes the caller to navigation, so
views that read the URL re-render on every route change automatically.

```ts
import { Router } from "@lark.js/mvc";

// Navigate
Router.to("/list", { page: 2 });
Router.to({ page: 3 }); // update params only, keep current path
Router.to("/detail", { id: "123" }, true); // replace history entry

// Parse current URL (tracked when called in a tracked region)
const loc = Router.parse();
console.log(loc.path); // "/list"
console.log(loc.params); // { page: "2" }
console.log(loc.get("page")); // "2"
console.log(loc.get("missing", "default")); // "default"

// Compute diff
const diff = Router.diff();
// { params: { page: { from: "1", to: "2" } }, path: { from: "/home", to: "/list" }, changed: true }

// Join path segments
Router.join("/api", "v1", "users"); // "/api/v1/users"
```

A view that reacts to the URL simply reads it in a tracked region:

```tsx
const template = jsxTemplate(() => <p>page = {Router.parse().get("page", "1")}</p>);

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
   route-view mount (when the matched VIEW changed)
```

```ts
// Listen to route changes
Router.on("change", (e) => {
  // e.reject() -- revert URL
  // e.prevent() -- pause navigation
  // e.resolve() -- commit navigation
});

Router.on("changed", (e) => {
  // e.params -- changed params { key: { from, to } }
  // e.path -- path diff
  // e.view -- view diff
  // e.changed -- whether anything changed
});

// Async navigation guard
const unGuard = Router.beforeEach(async (to, from) => {
  if (to.path === "/admin") {
    return await checkAuth(); // false aborts navigation
  }
  return true;
});

// Later: unGuard() to remove the guard
```

#### Routing Modes

```ts
Framework.boot({
  routeMode: "history", // default: uses pushState/popstate, clean URLs
  // routeMode: "hash",  // uses location.hash with #! prefix
});
```

#### Route Configuration

Routes accept imported components or registered view-path strings (strings
pair with `registerViewClass` / the `require` lazy loader):

```ts
import HomeView from "./views/home";
import DetailView from "./views/detail";
import NotFoundView from "./views/not-found";

Framework.boot({
  rootId: "root",
  routes: {
    "/home": HomeView,
    "/detail": { view: DetailView, title: "Detail Page" },
    "/admin": "app/views/admin", // lazy-loaded via config.require
  },
  defaultView: HomeView,
  unmatchedView: NotFoundView,
  defaultPath: "/home",
  rewrite(path, params, routes) {
    // Custom path rewriting logic
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

```ts
import { State } from "@lark.js/mvc";

// Write — batched per-key signal writes; subscribed views re-render. Done.
State.set({ count: 1, title: "Hello" });

// Read — tracked when called inside a template/computed/useSignalEffect
const count = State.get("count"); // subscribes to "count" only
const all = State.get(); // snapshot; subscribes to EVERY State change

// In a view — no observe declarations, just read in the template:
export default defineView((ctx) => {
  // Reference-counted cleanup: key data dropped when the last reader dies
  State.clean("count,title")(ctx);

  const template = jsxTemplate(() => (
    <p>
      {String(State.get("title"))}: {Number(State.get("count"))}
    </p>
  ));
  return { template };
});
```

Shallow semantics apply: `State.set({ list: sameArrayRef })` is a no-op —
replace the reference. `State.on/off/fire` remain as a general-purpose
pub/sub channel (unrelated to reactivity).

#### createStore (Complex Reactive State)

For complex state with actions, derived data, and fine-grained subscriptions:

```ts
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
// inside a template subscribes that view to THAT key only.
const state = counterStore.getState();
console.log(state.count); // 0
console.log(state.doubled); // 0

// Update state — batched; Object.is-equal values are skipped
counterStore.setState({ count: 5 });

// Manual subscription (zustand semantics)
const unSub = counterStore.subscribe((state, prevState) => {
  console.log("count changed:", prevState.count, "->", state.count);
});

// Use in a view — read getState() in the template, nothing else needed:
export default defineView(() => {
  const template = jsxTemplate(() => {
    const { count, doubled, increment } = counterStore.getState();
    return (
      <button onClick={increment}>
        {count} (doubled: {doubled})
      </button>
    );
  });
  return { template };
});

// Cleanup
unSub();
counterStore.destroy();
```

Notes:

- `getState()` is one stable proxy — spreading it (`{ ...getState() }`)
  produces a plain snapshot (and subscribes to all keys read).
- Writes to computed/action keys via `setState` are silently ignored;
  unknown keys create new state slots (zustand semantics).
- Shallow: `setState({ list: get().list })` after an in-place `push` is a
  no-op — build a new array.

### Service Layer

The Service system manages API requests with LFU caching, deduplication, serial queuing, and lifecycle events.

```ts
import { createService } from "@lark.js/mvc";

// Create a service type with a transport function
const apiService = createService(
  (payload, callback) => {
    const url = payload.get("url");
    const method = payload.get("method") || "GET";
    const data = payload.get("data");

    fetch(url, { method, body: data ? JSON.stringify(data) : undefined })
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

// Register endpoint metadata
apiService.add({
  name: "getUser",
  url: "/api/user",
  cache: 30000, // 30s TTL
  before(payload) {
    // Transform request data before fetch
    const id = payload.get("id");
    payload.set("url", `/api/user/${id}`);
  },
});

// Use in a view — results land in signals
export default defineView((ctx) => {
  const service = apiService.instance();
  ctx.capture("api", service); // auto-destroy with the view

  const userName = signal("");

  const loadUser = (): void => {
    service.all([{ name: "getUser", id: "123" }], (errors, payload) => {
      userName.value = String(payload.get("userName") ?? "");
    });
  };

  const template = jsxTemplate(() => (
    <button onClick={loadUser}>{userName.value || "Load user"}</button>
  ));

  return { template };
});
```

#### Service Instance API

| Method                       | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `instance.all(attrs, done)`  | Fetch all, callback with `(errors, p1, p2, ...)`                         |
| `instance.one(attrs, done)`  | Fetch all, callback per-attribute with `(error, payload, isLast, index)` |
| `instance.save(attrs, done)` | Fetch all, skip cache (always request)                                   |
| `instance.enqueue(callback)` | Add to serial task queue                                                 |
| `instance.dequeue()`         | Process next task                                                        |
| `instance.destroy()`         | Cancel pending requests                                                  |
| `instance.on/off/fire`       | Instance-level events                                                    |

#### Service Type API

| Method              | Description                                |
| ------------------- | ------------------------------------------ |
| `api.add(meta)`     | Register endpoint metadata                 |
| `api.meta(name)`    | Look up endpoint metadata                  |
| `api.cached(attrs)` | Read from cache without fetching           |
| `api.clear(names)`  | Clear cached responses for endpoints       |
| `api.on/off/fire`   | Type-level events (begin, done, fail, end) |
| `api.instance()`    | Create a new service instance              |

### Hooks

All hooks are called inside the `defineView` setup function. The setup runs once on mount (not on every render like React).

#### useSignal

A keyed view-local signal. Identical to `signal(initial)` except it is stored
on the ctx by key and **reused when the setup re-runs on the same ctx (HMR
hot-swap)** — state survives hot updates. Use plain `signal()` when HMR
persistence doesn't matter.

```ts
const count = useSignal("count", 0);
// template: <button onClick={() => count.value++}>{count.value}</button>
```

#### useSignalEffect

A reactive side effect tied to the view lifecycle: runs immediately, re-runs
whenever any signal it read changes, disposed on view destroy (and before HMR
re-setup). A returned function is the between-runs / final cleanup.

```ts
useSignalEffect(() => {
  const path = Router.parse().path; // subscribe to navigation
  untracked(() => void loadContent(path));
});
```

#### useEffect

Register a side effect with optional cleanup. Runs synchronously during setup
and never re-runs (setup is once) — for reactive re-runs use `useSignalEffect`.

```ts
useEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer); // cleanup on destroy
});
```

#### useInterval

Set up an interval that is automatically cleared on view destroy.

```ts
const time = useSignal("time", Date.now());
useInterval(() => {
  time.value = Date.now();
}, 1000);
```

#### useTimeout

Set up a timeout that is automatically cleared on view destroy.

```ts
useTimeout(() => {
  console.log("fired");
}, 5000);
```

#### useResource

Capture a resource that is automatically destroyed on view destroy or render.

```ts
const service = createService(syncFn);
useResource("myService", service.instance(), true); // destroyOnRender = true
```

#### useEvent

Register an event handler on the view's internal emitter. Auto-cleaned on destroy.

```ts
useEvent("destroy", () => console.log("View destroyed"));
useEvent("render", () => console.log("View rendered"));
```

#### useUrlState

Sync view state with URL query parameters. Returns `[read, write]`; `read()`
goes through `Router.parse()` and is therefore **tracked** — call it inside
the template, not once in setup.

```tsx
const [readPage, writePage] = useUrlState({ page: "1", size: "20" });

const template = jsxTemplate(() => (
  <button onClick={() => writePage((prev) => ({ page: String(Number(prev.page) + 1) }))}>
    Page {readPage().page}
  </button>
));
```

### JSX Template System

Templates are written in JSX/TSX. `jsxTemplate(renderFn)` adapts a
`() => JSX` function into the framework's template contract; the render
function takes **no arguments** — it reads signals, `params`, `State`, and
stores via closures, and runs inside the view's render effect (reads =
subscriptions). On every render pass the JSX tree is serialized to an HTML
string and applied through the real-DOM keyed diff. There is no template
compiler — JSX is plain JavaScript with real scoping, so conditionals, loops,
and formatting are ordinary code.

```tsx
import { defineView, jsxTemplate, raw, signal } from "@lark.js/mvc";

const user = signal({ isAdmin: false });
const items = signal<{ id: number; name: string }[]>([]);
const md = signal("");

const template = jsxTemplate(() => (
  <>
    {user.value.isAdmin ? <div class="admin-panel">Welcome, admin</div> : <div>Welcome</div>}
    <ul>
      {items.value.map((item) => (
        <li key={`item-${item.id}`}>{item.name}</li>
      ))}
    </ul>
    <article>{raw(md.value)}</article>
  </>
));
```

#### Output semantics

| JSX                      | Behavior                                                            |
| ------------------------ | ------------------------------------------------------------------- |
| `{expr}` (string/number) | HTML-escaped text (`0` renders; `boolean/null/undefined` render "") |
| `{sig}` (Signal)         | Auto-unwrapped to `sig.value` (tracked read)                        |
| `{raw(html)}`            | Trusted raw HTML, no escaping — never pass untrusted input          |
| `{cond && <div/>}`       | Conditional rendering (falsy values are dropped)                    |
| `{list.map(...)}`        | List rendering (arrays are flattened)                               |
| `<>...</>` (Fragment)    | Multiple roots without a wrapper element                            |
| `<Row item={x} />`       | Functional component — a pure template partial, invoked at render   |
| `<MyView prop={x} />`    | View component (`defineView` result) — mounted as a child frame     |

#### Attribute semantics

| Attribute             | Behavior                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| `class` / `className` | String, array (falsy entries dropped), or `{ name: boolean }` map        |
| `style`               | String, or camelCase object (kebab-cased; no implicit `px`)              |
| `id` / `key`          | Keyed-diff compare key; `key` emits as `id` when no explicit `id` is set |
| `disabled={true}`     | Boolean attribute → `disabled=""`; `false`/nullish omit the attribute    |
| `title={sig}`         | Signal values auto-unwrap to their current value (tracked read)          |
| `data-x={object}`     | Object/array/function values become live refData tokens                  |

Component props are the exception to signal unwrapping: a Signal passed as a
component prop stays wrapped, so the child can subscribe to it directly
(fine-grained cross-view updates without parent re-renders).

Give loop items a stable `key` (or `id`) to get keyed reordering instead of
in-place rewrites — ids are document-global, so keep them unique.

#### Event Binding

Events use React-style camelCase props with **inline function values only**;
the type is the lowercased remainder (`onClick` → `click`, `onDblclick` →
`dblclick`). Handlers are auto-registered per render — closures capture loop
variables directly:

```tsx
{
  items.value.map((item) => (
    <button key={`del-${item.id}`} onClick={() => deleteItem(item.id)}>
      Delete
    </button>
  ));
}
```

Multi-event bindings are just the same function on several props; keyboard
modifiers are ordinary checks inside the handler:

```tsx
const validate = (e: LarkEvent) => {
  /* fires for input AND change */
};

<input
  onInput={validate}
  onChange={validate}
  onClick={(e) => {
    if (!(e as MouseEvent).ctrlKey) return; // Ctrl-only action
    specialAction();
  }}
/>;
```

Notes:

- Handlers run inside `batch()` — multiple signal writes in one handler
  produce ONE render pass per affected view.
- DOM event types are lowercase (HTML lowercases attribute names) — a
  `CustomEvent("myEvent")` cannot be delegated; use lowercase DOM types.
  Frame events (`ctx.owner.fire`) are case-sensitive and support camelCase.
- Lowercase `onclick`-style props and string handler values are rejected
  (native inline handlers would execute attribute text as JavaScript).
- Inline handlers are delegated — a single capture-phase listener per event
  type on `document.body`; the extended event exposes `e.eventTarget`
  (the original hit element).
- Window/document listeners: use `useEffect` + `addEventListener`.

#### Functional components

Components are pure template partials — props in, JSX out. They are invoked
during serialization and have no lifecycle; use `defineView` components for
stateful composition.

```tsx
function Badge(props: { label: string; children?: JSXNode }) {
  return (
    <span class="badge">
      {props.label}: {props.children}
    </span>
  );
}

const template = jsxTemplate(() => <Badge label="count">{count.value}</Badge>);
```

#### Render pipeline

```
signal write  (or ctx.render() / HMR)
    |
per-view render effect re-runs (sync; batched inside batch())
    |
jsxTemplate closure: renderFn() -> VNode tree     -- TRACKED signal reads
    |
serialize(vnode, { viewId, refData })  -- escape text/attrs, encode events,
    |                                     unwrap Signals, tokenize object props
inline handlers wired into the view's handler map (per render)
    |
HTML string -> domGetNode() -> domSetChildNodes() keyed diff -> applyDomOps()
    |
mountZone (untracked): mount new child frames / batch-write props signals /
                       re-sync child->parent event trampolines
```

## Bundler Integration

### Vite Plugin

```ts
import { larkMvcPlugin } from "@lark.js/mvc/vite";

export default defineConfig({
  plugins: [larkMvcPlugin()],
});
```

The Vite plugin:

- Defaults `oxc.jsx = { runtime: "automatic", importSource: "@lark.js/mvc" }`
  (user-provided oxc settings always win; `oxc: false` / `jsx: "preserve"` respected)
- Auto-injects state-preserving view HMR into every `defineView` module
  (`.ts` / `.tsx` / `.js` / `.jsx`)

### Webpack Plugin + Loader

```ts
// Plugin form (recommended) — auto-registers the view-HMR injection rule
// (enforce: "pre", runs before ts-loader/SWC/babel).
import { LarkMvcPlugin } from "@lark.js/mvc/webpack";

export default {
  plugins: [new LarkMvcPlugin()],
};
```

```ts
// Manual loader form:
export default {
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        enforce: "pre",
        loader: "@lark.js/mvc/webpack",
      },
    ],
  },
};
```

Plugin options: `{ test? (default /\.[jt]sx?$/), exclude? (default /node_modules/) }`.
Configure the JSX transform in your TS/SWC/Babel loader via tsconfig
(`"jsx": "react-jsx"`, `"jsxImportSource": "@lark.js/mvc"`).

### Rspack Plugin + Loader

```ts
// Plugin form (recommended):
import { LarkMvcPlugin } from "@lark.js/mvc/rspack";

export default {
  plugins: [new LarkMvcPlugin()],
};
```

```ts
// Manual loader form:
export default {
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        enforce: "pre",
        loader: "@lark.js/mvc/rspack",
      },
    ],
  },
};
```

## Hot Module Replacement

HMR hot-swaps view code without a full page reload, preserving view-local state.

A view module contains both the setup function and its `jsxTemplate` closure,
so a single swap layer covers everything: on module update,
`hotSwapByView(old, new)` updates the view-registry and runs `hotSwapView` on
every matching frame — template edits included.

### State Preservation

`hotSwapView` preserves the entire `ViewCtx`: `signals` (keyed `useSignal`
state), `refData`, `resources`, `emitter`, `signature`, `id`, and `owner` all
stay the same. The sequence:

1. Run old `useEffect` cleanups — this disposes the old render effect and
   unbinds delegated event types
2. Destroy `destroyOnRender` resources
3. Re-run `newSetup(ctx)` against the same ctx (inside `untracked()`) —
   `useSignal(key, ...)` calls find and reuse the preserved signals
4. Update the template from the new descriptor
5. Create a fresh render effect — its first run re-renders with the new
   template and re-wires inline handlers

Plain `signal()` closures are recreated on swap; use `useSignal(key, initial)`
for state that must survive hot updates.

### Auto-Injection

The bundler plugins auto-inject HMR boilerplate at compile time into every
module whose default export is a `defineView(...)` setup. Users never need to
write `import.meta.hot` (Vite) or `import.meta.webpackHot` (Webpack/Rspack)
themselves.

## Micro-Frontend Support

lark-mvc supports Module Federation and cross-project view loading via `FrameworkConfig.require`.

```ts
Framework.boot({
  rootId: "root",
  require(names, params) {
    // Integrate with Webpack Module Federation or dynamic import
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

## Event Delegation

All DOM events are delegated to `document.body` in the capture phase. The
EventDelegator walks from `event.target` up to `document.body`; at each
element it reads the `@<type>` attribute the serializer emitted
(`"<viewId>\x1e__jsxN"`), resolves the owning Frame by id, and calls the
matching inline handler from the view's handler map — inside `batch()`, so
multi-signal writes render once.

There is no handler-key grammar: inline JSX functions are the only DOM event
mechanism. Frame (child→parent) events are wired separately by `mountZone`
through per-frame trampolines. Window/document listeners belong in
`useEffect`.

### Reference Counting

`bind`/`unbind` use reference counting per event type so multiple views listening to the same event type do not attach duplicate listeners. Binding is managed automatically by the JSX wiring layer — one bind per (view, type), released on unmount/hot-swap.

## API Reference

### Exports

| Category  | Exports                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Reactive  | `signal`, `computed`, `effect`, `batch`, `untracked`, `Signal`, `ReadonlySignal` (type)                 |
| Framework | `Framework`, `defineView`, `EventDelegator`                                                             |
| JSX       | `jsxTemplate`, `raw`, `Fragment`, `isLarkView`, `JSXNode` / `VNode` / `Component` / `LarkEvent` (types) |
| State     | `State`, `createStore`, `useUrlState`                                                                   |
| Router    | `Router`                                                                                                |
| View      | `defineView`, `ViewCtx` / `ViewSetup` / `LarkView` / `LarkHostProps` / `ViewParams` (types)             |
| Hooks     | `useSignal`, `useSignalEffect`, `useEffect`, `useInterval`, `useTimeout`, `useResource`, `useEvent`     |
| Frame     | `Frame`, `createFrame`, `registerViewClass`, `invalidateViewClass`, `ensureViewName`, `resolveSetup`    |
| Service   | `createService`, `ServiceApi`, `ServiceInstance` (types)                                                |
| Types     | All types from `./types` via `export *`                                                                 |

### Package Entry Points

| Import                         | Description                                                         |
| ------------------------------ | ------------------------------------------------------------------- |
| `@lark.js/mvc`                 | Main runtime API (including `jsxTemplate`, `raw`, `Fragment`)       |
| `@lark.js/mvc/jsx-runtime`     | JSX automatic runtime (`jsx`, `jsxs`, `Fragment`, `raw`, JSX types) |
| `@lark.js/mvc/jsx-dev-runtime` | JSX automatic dev runtime (`jsxDEV`)                                |
| `@lark.js/mvc/vite`            | Vite plugin (`larkMvcPlugin`)                                       |
| `@lark.js/mvc/webpack`         | Webpack integration (`LarkMvcPlugin`, `larkMvcLoader`)              |
| `@lark.js/mvc/rspack`          | Rspack integration (`LarkMvcPlugin`, `larkMvcLoader`)               |
| `@lark.js/mvc/client`          | Client-side type declarations (DOM augmentations, `*.css` modules)  |

## Migration from the digest era

The manual-dispatch reactivity was removed completely. Old API → new pattern:

| Removed                                   | Replacement                                                       |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `ctx.updater.set({x}).digest()`           | `x.value = next` (a signal read by the template)                  |
| `ctx.updater.get("x")`                    | `x.value` / `x.peek()`                                            |
| setup returns `assign()`                  | derive inline in the template, or `computed()`                    |
| `ctx.renderMethod`                        | `useSignalEffect(...)`                                            |
| `ctx.observeState("k")`                   | read `State.get("k")` in the template                             |
| `ctx.observeLocation(...)`                | read `Router.parse()` in the template / `useSignalEffect`         |
| `State.digest()` / `State.diff()`         | gone — `State.set` notifies tracked readers                       |
| `useState("k", v)` (getter/setter pair)   | `useSignal("k", v)` / `signal(v)`                                 |
| `useStore(store, sel)` / `bindStore(...)` | read `store.getState().key` in the template                       |
| `computed(["deps"], fn)` (store)          | `computed(fn)` — dependencies tracked automatically               |
| `useUrlState(ctx, init)` → `[state, set]` | `useUrlState(init)` → `[read, write]` (call `read()` in template) |
| `jsxTemplate<Data>((data) => ...)`        | `jsxTemplate(() => ...)` — read signals via closures              |
| `Framework.task(fn)` (chunked scheduler)  | `batch(fn)` from the reactive core                                |

## Configuration

### FrameworkConfig

| Key             | Type                                                    | Default     | Description                                   |
| --------------- | ------------------------------------------------------- | ----------- | --------------------------------------------- |
| `rootId`        | `string`                                                | `"root"`    | DOM root element ID                           |
| `routeMode`     | `"history" or "hash"`                                   | `"history"` | Routing mode                                  |
| `defaultView`   | `string or LarkView`                                    | -           | Default view when URL matches no route        |
| `defaultPath`   | `string`                                                | `"/"`       | Default path when URL hash/query is empty     |
| `routes`        | `Record<string, string or LarkView or RouteViewConfig>` | -           | Path-to-view mapping                          |
| `hashbang`      | `string`                                                | `"#!"`      | Hash prefix (hash mode only)                  |
| `error`         | `(error: Error) => void`                                | throws      | Global error handler (render errors included) |
| `rewrite`       | `(path, params, routes) => string`                      | -           | Route rewriting function                      |
| `unmatchedView` | `string or LarkView`                                    | -           | View for 404 pages                            |
| `require`       | `(names, params?) => Promise<unknown[]>`                | -           | Async module loader (Module Federation)       |

`boot()` normalizes `LarkView` entries to internal registry-name strings, so
Router internals stay string-based.

### RouteViewConfig

```ts
interface RouteViewConfig {
  view: string | LarkView; // View path or imported component
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
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage
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
    common.ts             -- constants, encoding helpers
    utils.ts              -- utility functions
    framework.ts          -- Framework.boot, route-view mount
    view.ts               -- defineView, ViewCtx, render effect, lifecycle
    view-registry.ts      -- view setup function registry
    frame.ts              -- Frame tree, reactive params store, mountZone
    router.ts             -- Router with two-phase change + location signal
    state.ts              -- State singleton (per-key signals)
    store.ts              -- createStore (per-key signals, tracked proxy)
    service.ts            -- createService, API management
    hooks.ts              -- useSignal, useSignalEffect, useEffect, etc.
    dom.ts                -- real-DOM diff engine
    event-emitter.ts      -- multi-cast event system
    event-delegator.ts    -- DOM event delegation (batched dispatch)
    cache.ts              -- LFU-style bounded cache
    url-state.ts          -- useUrlState hook
    module-loader.ts      -- async module loading
    mark.ts               -- async callback validity tracking
    hmr.ts                -- HMR hot-swap logic
    hmr-inject.ts         -- HMR code generation for bundlers
    client.d.ts           -- ambient type declarations
    vite.ts               -- Vite plugin
    webpack.ts            -- Webpack loader/plugin
    rspack.ts             -- Rspack loader/plugin
    jsx-runtime.ts        -- JSX automatic runtime entry (jsx/jsxs + JSX types)
    jsx-dev-runtime.ts    -- JSX automatic dev runtime entry (jsxDEV)
    jsx/
      vnode.ts            -- pure VNode model (Symbol.for markers, raw())
      serialize.ts        -- VNode -> HTML string serializer (Signal unwrap)
      template.ts         -- jsxTemplate adapter + inline-handler wiring
  tests/                  -- vitest test suite
  dist/                   -- built output
```

### Key Design Decisions

1. Functional over OOP: All APIs use factory functions and closures. No class, this, or prototype anywhere in the framework.

2. Signals as the single reactivity mechanism: one render effect per view; State/store/router/props are per-key signals behind tracked reads. The effect IS the dirty check — no digest, no dispatcher walk, no observer declarations. Shallow (reference) comparison, documented and deliberate.

3. Real-DOM diff as default: the template output is parsed into a temporary DOM tree and keyed-compared against the live DOM. This avoids the overhead of maintaining a virtual DOM for most use cases.

4. Runtime JSX templates: JSX compiles to plain `jsx()` calls via the standard automatic runtime; the VNode tree is serialized to an HTML string per render pass and applied through the keyed real-DOM diff. No template compiler, no build-time AST analysis — templates are ordinary JavaScript with real scoping.

5. Two-phase routing: The Router fires a `change` event before navigation (allowing rejection) and a `changed` event after; a location version signal makes `Router.parse()` a tracked read. Navigation guards run asynchronously between the two phases.

6. Reference-counted events: The EventDelegator uses reference counting per event type on `document.body`, ensuring a single capture-phase listener per event type regardless of how many views register handlers. Dispatch runs inside `batch()`.

7. LFU cache with frequency eviction: The bounded cache uses single-pass partial selection (O(n\*k)) instead of full sorting, making eviction efficient for the typical buffer size of 5.

8. Async callback validity: The `mark`/`unmark` system and `wrapAsync` prevent stale callbacks from executing after a view is re-rendered or destroyed — note that every reactive re-render bumps the signature.
