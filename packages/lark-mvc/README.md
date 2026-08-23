# @lark.js/mvc

A lightweight TypeScript Mvc frontend framework for single-page applications and micro-frontend scenarios.

## Overview

lark-mvc is a functional-first framework that provides a complete application architecture with zero dependencies. Views are written with React-style JSX (automatic runtime, `jsxImportSource: "@lark.js/mvc"`), rendered through a real-DOM diff engine. It features two-phase route confirmation, zustand-aligned state management, and built-in state-preserving HMR across Vite, Webpack, and Rspack.

Design principles:

- Functional API: no class, no this, no prototype, no mixin
- Zero dependencies
- React-style JSX templates — real JS scoping, inline event closures, type checking
- Real DOM diff via innerHTML plus keyed comparison (no virtual DOM)
- Module Federation support for micro-frontends

## Architecture

```
                          Framework.boot(config)
                                |
          +---------------------+---------------------+
          |                     |                     |
       Router               State                Frame Tree
    (history/hash)       (observable)          (mount/unmount)
          |                     |                     |
    two-phase              get/set/digest         createFrame
    confirmation           change tracking       parent-child
          |                     |                     |
          +----------+----------+                     |
                     |                                |
              dispatcherNotifyChange                  |
                     |                                |
              dispatcherUpdate (walk tree)            |
                     |                                |
                   ViewCtx <----+----> mountCtx / unmountCtx
                     |          |
              +------+-------+  |
              |      |       |  |
           updater  events  hooks
              |      |       |
         digest()  delegator  useState/useEffect/...
              |
     real-DOM diff (innerHTML plus keyed comparison)
              |
           dom.ts
```

## Installation

```bash
# pnpm
pnpm add @lark.js/mvc

# npm
npm install @lark.js/mvc

# yarn
yarn add @lark.js/mvc
```

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
import { defineView, jsxTemplate, useState } from "@lark.js/mvc";

type Data = { count: number };

export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);

  const template = jsxTemplate<Data>(({ count }) => (
    <div class="home">
      <h1>Welcome to Lark Mvc</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(getCount() + 1)}>Increment</button>
    </div>
  ));

  return { template };
});
```

Events are inline functions — there is no events map and no handler-name
strings. Define the template inside the setup when handlers need `ctx` or
hook setters; a template without handlers can live at module level.

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

## Core Concepts

### Views

A view component is defined via `defineView<P>()`. The setup function runs
once on mount, receives a `ViewCtx` and the props passed at the JSX usage
site, and returns `{ template, assign? }`. The result is used directly as a
JSX tag — never called as a function.

```tsx
import { defineView, jsxTemplate, useState, useEffect } from "@lark.js/mvc";

export default defineView((ctx, params) => {
  // View-local state
  const [getName, setName] = useState("name", "world");

  // Side effect with cleanup
  useEffect(() => {
    const timer = setInterval(() => console.log("tick"), 1000);
    return () => clearInterval(timer);
  });

  const template = jsxTemplate<{ greeting: string }>(({ greeting }) => (
    <p onClick={() => setName("Lark")}>{greeting}</p>
  ));

  return {
    template,
    // Optional: custom data assignment logic
    assign(options) {
      ctx.updater.set({ greeting: `Hello, ${getName()}!` }).digest();
      return true;
    },
  };
});
```

Window/document-level listeners are plain `useEffect` work:

```tsx
useEffect(() => {
  const onResize = () => ctx.updater.digest({ width: window.innerWidth });
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
});
```

#### ViewCtx

The `ViewCtx` is the first argument to every setup function. It provides all framework APIs:

| Method                        | Description                              |
| ----------------------------- | ---------------------------------------- |
| `ctx.render()`                | Force re-render the view                 |
| `ctx.observeLocation(params)` | Declare URL params this view reacts to   |
| `ctx.observeState(keys)`      | Declare State keys this view reacts to   |
| `ctx.capture(key, resource)`  | Register a destroyable resource          |
| `ctx.release(key)`            | Remove and destroy a resource            |
| `ctx.on(event, handler)`      | Listen to view lifecycle events          |
| `ctx.fire(event, data)`       | Emit a view event                        |
| `ctx.wrapAsync(fn)`           | Wrap async callback with signature guard |
| `ctx.beginUpdate(zoneId)`     | Begin zone update (unmount children)     |
| `ctx.endUpdate(zoneId)`       | End zone update (remount children)       |
| `ctx.updater`                 | Per-view data binding API                |
| `ctx.id`                      | View ID (same as owner frame ID)         |
| `ctx.owner`                   | Owner frame reference                    |

#### View Lifecycle

```
mountView(viewPath)
       |
   createCtx(frame)
       |
   setCurrentCtx(ctx)
       |
   setup(ctx, params)
       |
   +-- hooks: useState, useEffect, useStore, ...
       |
   setCurrentCtx(null)
       |
   wire template / events / assign
       |
   signature.value = 1
       |
   frame.view = ctx
       |
   registerEvents(ctx)
       |
   ctx.render() --> updater.digest() --> DOM diff --> endUpdate()
```

On unmount:

```
unmountView()
       |
   run useEffect cleanups (reverse order)
       |
   unregisterEvents(ctx)
       |
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

const template = jsxTemplate<{ count: number; step: number; history: number[] }>((d) => (
  <CounterUpdater
    key="counter-updater"
    class="mx-2"
    count={d.count}
    step={d.step}
    history={d.history}
    onIncrement={() => bump(+1)}
    onDecrement={() => bump(-1)}
    onClearHistory={(data) => clear(data)}
  />
));
```

| Prop                               | Behavior                                                                |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `id` / `key` / `class` / `style`   | Routed to the auto-generated host element (`key` becomes the host `id`) |
| `on` + Capitalized, function value | Child→parent event subscription (`onClearHistory` → `"clearHistory"`)   |
| everything else                    | Delivered to the child — objects/arrays/functions by live reference     |

All child props travel through ONE refData token (`p-lark` wire attribute),
so names keep their exact camelCase and values keep their types — `count={5}`
arrives as the number `5`. `children` are not supported on component tags.

**Props flow:** Parent `updater.set().digest()` → template re-renders → the
props token updates → `mountZone` translates it and pushes data into the
child with `updater.set(data)` + a full `view.render()` (the child's
`assign` / `renderMethod` re-run).

**Events flow:** Child calls `ctx.owner.fire("eventName", data?)` → the frame
emitter hits a stable trampoline that always points at the parent's LATEST
handler prop (re-synced every parent render — inline closures never go
stale). Event names match exactly (case-sensitive); they never pass through
HTML attributes.

```tsx
// Child component
export default defineView<{ count?: number; onIncrement?: () => void }>((ctx, params) => {
  ctx.updater.digest({ count: params?.count ?? 0 });
  const template = jsxTemplate<{ count: number }>(({ count }) => (
    <button onClick={() => ctx.owner.fire("increment")}>count: {count}</button>
  ));
  return { template };
});
```

Use `key` on components rendered in `map()` loops — it becomes the host `id`
and preserves child frames (and their state) across list reorders.

### Routing

The Router supports two modes with a two-phase change confirmation protocol.

```ts
import { Router } from "@lark.js/mvc";

// Navigate
Router.to("/list", { page: 2 });
Router.to({ page: 3 }); // update params only, keep current path
Router.to("/detail", { id: "123" }, true); // replace history entry

// Parse current URL
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
   dispatcherNotifyChange
       |
   mount new view / update params
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

lark-mvc provides two state management layers:

#### State (Simple Cross-View Data)

`State` is a singleton for lightweight shared values (counters, toggles, session info).

```ts
import { State } from "@lark.js/mvc";

// Write
State.set({ count: 1, title: "Hello" });
State.digest(); // fire changed event, notify views

// Read
const count = State.get("count");
const all = State.get(); // entire state object

// Get changed keys from last digest
const keys = State.diff(); // ReadonlySet<string>

// In view setup: observe specific keys
export default defineView((ctx) => {
  ctx.observeState("count,title");
  // When count or title changes via State.digest(), this view re-renders

  // Auto-cleanup on view destroy (reference-counted)
  State.clean("count,title")(ctx);

  return { template };
});
```

#### createStore (Complex Reactive State)

For complex state with handlers, derived data, or fine-grained subscriptions:

```ts
import { createStore, computed } from "@lark.js/mvc";

const counterStore = createStore("counter", (set, get) => ({
  count: 0,
  step: 1,

  // Computed: auto-recomputes when deps change
  doubled: computed(["count"], () => get().count * 2),

  // Actions: functions attached to state
  increment() {
    set({ count: get().count + get().step });
  },
  decrement() {
    set({ count: get().count - get().step });
  },
  setStep(step: number) {
    set({ step });
  },
}));

// Read state
const state = counterStore.getState();
console.log(state.count); // 0
console.log(state.doubled); // 0

// Update state
counterStore.setState({ count: 5 });

// Subscribe to changes
const unSub = counterStore.subscribe((state, prevState) => {
  console.log("count changed:", prevState.count, "->", state.count);
});

// Use in view
export default defineView((ctx) => {
  const getState = useStore(counterStore, (s) => ({
    count: s.count,
    doubled: s.doubled,
  }));

  const template = jsxTemplate<{ count: number; doubled: number }>(({ count, doubled }) => (
    <button onClick={() => counterStore.getState().increment()}>
      {count} (doubled: {doubled})
    </button>
  ));

  return { template };
});

// Cleanup
unSub();
counterStore.destroy();
```

#### bindStore (View Lifecycle Binding)

```ts
import { bindStore } from "@lark.js/mvc";

export default defineView((ctx) => {
  // Auto-syncs store state to updater.data
  // Auto-unsubscribes on view destroy
  bindStore(ctx, counterStore, (s) => ({
    count: s.count,
    doubled: s.doubled,
  }));

  return { template };
});
```

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

apiService.add({
  name: "listUsers",
  url: "/api/users",
  cache: 60000,
});

// Use in a view
export default defineView((ctx) => {
  const service = apiService.instance();

  // Capture the service instance for auto-destroy
  ctx.capture("api", service);

  const loadUser = (): void => {
    service.all([{ name: "getUser", id: "123" }], (errors, payload) => {
      ctx.updater.set({ userName: payload.get("userName") }).digest();
    });
  };

  const template = jsxTemplate<{ userName: string }>(({ userName }) => (
    <button onClick={loadUser}>{userName || "Load user"}</button>
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

#### useState

View-local state backed by `ctx.updater.data`. Returns a `[getter, setter]` pair.

```ts
const [getCount, setCount] = useState("count", 0);
// getter always reads latest from updater.data (no stale closures)
// setter writes to updater.data and triggers digest
```

#### useEffect

Register a side effect with optional cleanup. Runs synchronously during setup.

```ts
useEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer); // cleanup on destroy
});
```

#### useStore

Bind a zustand-aligned store to the view's updater. Auto-syncs and auto-unsubscribes.

```ts
const getState = useStore(counterStore, (s) => ({ count: s.count }));
```

#### useInterval

Set up an interval that is automatically cleared on view destroy.

```ts
useInterval(() => {
  ctx.updater.set({ time: Date.now() }).digest();
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

Sync view state with URL query parameters.

```ts
const [state, setState] = useUrlState(ctx, { page: "1", size: "20" });
// state.page reads from URL, defaults to "1"
// setState({ page: "2" }) updates URL via Router.to()
```

### JSX Template System

Templates are written in JSX/TSX. `jsxTemplate(renderFn)` adapts a
`(data) => JSX` function into the framework's template contract; at every
digest the JSX tree is serialized to an HTML string and applied through the
real-DOM keyed diff. There is no template compiler — JSX is plain JavaScript
with real scoping, so conditionals, loops, and formatting are ordinary code.

```tsx
import { defineView, jsxTemplate, raw } from "@lark.js/mvc";

type Data = { user: { isAdmin: boolean }; items: { id: number; name: string }[]; md: string };

const template = jsxTemplate<Data>(({ user, items, md }) => (
  <>
    {user.isAdmin ? <div class="admin-panel">Welcome, admin</div> : <div>Welcome</div>}
    <ul>
      {items.map((item) => (
        <li key={`item-${item.id}`}>{item.name}</li>
      ))}
    </ul>
    <article>{raw(md)}</article>
  </>
));
```

#### Output semantics

| JSX                      | Behavior                                                            |
| ------------------------ | ------------------------------------------------------------------- |
| `{expr}` (string/number) | HTML-escaped text (`0` renders; `boolean/null/undefined` render "") |
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
| `data-x={object}`     | Object/array/function values become live refData tokens                  |

Give loop items a stable `key` (or `id`) to get keyed reordering instead of
in-place rewrites — ids are document-global, so keep them unique.

#### Event Binding

Events use React-style camelCase props with **inline function values only**;
the type is the lowercased remainder (`onClick` → `click`, `onDblclick` →
`dblclick`). Handlers are auto-registered per render — closures capture loop
variables directly:

```tsx
{
  items.map((item) => (
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

const template = jsxTemplate<Data>(({ count }) => <Badge label="count">{count}</Badge>);
```

#### Render pipeline

```
updater.digest()
    |
jsxTemplate closure: renderFn(updater.data) -> VNode tree
    |
serialize(vnode, { viewId, refData })  -- escape text/attrs, encode events,
    |                                     tokenize object props via refFn
inline handlers wired into the view's handler map (per render)
    |
HTML string -> domGetNode() -> domSetChildNodes() keyed diff -> applyDomOps()
    |
mountZone: mount/update embedded view components (props push + events re-sync)
```

### Updater

The Updater provides per-view data binding with change detection and DOM diff triggering.

```ts
// Inside a view setup function
ctx.updater.set({ name: "Alice", age: 30 }); // set data
ctx.updater.get("name"); // read data
ctx.updater.get(); // read entire data object
ctx.updater.digest(); // trigger re-render if data changed
ctx.updater.digest({ count: 1 }); // set + digest in one call
ctx.updater.forceDigest(); // force re-render regardless of changes
ctx.updater.snapshot(); // record current version
ctx.updater.altered(); // check if version changed since snapshot
ctx.updater.getChangedKeys(); // keys changed in current digest
```

#### Change Detection

The Updater tracks changes via `setData()`: for each key in the new data, it compares against the old value. Only non-primitive, non-function values trigger comparison; primitives are always considered changed if the reference differs. Changed keys are collected into a `Set<string>` and passed through the diff pipeline.

#### Rendering Pipeline

1. Template function produces an HTML string
2. `domGetNode()` parses HTML into a temporary DOM tree via `document.implementation.createHTMLDocument`
3. `domSetChildNodes()` performs keyed diff against the live DOM
4. `applyDomOps()` applies mutations (appendChild, removeChild, replaceChild, insertBefore)

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

`hotSwapView` preserves the entire `ViewCtx`: `updater.data`, `resources`, `emitter`, `signature`, `id`, and `owner` all stay the same. The sequence:

1. Run old `useEffect` cleanups
2. Unregister old events
3. Destroy `destroyOnRender` resources
4. Re-run `newSetup(ctx)` against the same ctx
5. Update template/events/assign from the new descriptor
6. Register new events
7. Increment signature, fire `render`, force re-render

Because setup re-runs against the preserved ctx, initialize data conditionally
(`useState` does this for you) if it must survive a hot swap.

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
matching inline handler from the view's handler map.

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
| Framework | `Framework`, `defineView`, `EventDelegator`                                                             |
| JSX       | `jsxTemplate`, `raw`, `Fragment`, `isLarkView`, `JSXNode` / `VNode` / `Component` / `LarkEvent` (types) |
| State     | `State`, `createStore`, `computed`, `bindStore`, `useUrlState`                                          |
| Router    | `Router`                                                                                                |
| View      | `defineView`, `ViewCtx` / `ViewSetup` / `LarkView` / `LarkHostProps` / `ViewParams` (types)             |
| Hooks     | `useState`, `useEffect`, `useStore`, `useInterval`, `useTimeout`, `useResource`, `useEvent`             |
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

## Configuration

### FrameworkConfig

| Key             | Type                                                    | Default     | Description                               |
| --------------- | ------------------------------------------------------- | ----------- | ----------------------------------------- |
| `rootId`        | `string`                                                | `"root"`    | DOM root element ID                       |
| `routeMode`     | `"history" or "hash"`                                   | `"history"` | Routing mode                              |
| `defaultView`   | `string or LarkView`                                    | -           | Default view when URL matches no route    |
| `defaultPath`   | `string`                                                | `"/"`       | Default path when URL hash/query is empty |
| `routes`        | `Record<string, string or LarkView or RouteViewConfig>` | -           | Path-to-view mapping                      |
| `hashbang`      | `string`                                                | `"#!"`      | Hash prefix (hash mode only)              |
| `error`         | `(error: Error) => void`                                | throws      | Global error handler                      |
| `rewrite`       | `(path, params, routes) => string`                      | -           | Route rewriting function                  |
| `unmatchedView` | `string or LarkView`                                    | -           | View for 404 pages                        |
| `require`       | `(names, params?) => Promise<unknown[]>`                | -           | Async module loader (Module Federation)   |

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
    common.ts             -- constants, encoding helpers
    utils.ts              -- utility functions, task scheduler
    framework.ts          -- Framework.boot, dispatcher, task queue
    view.ts               -- defineView, ViewCtx, mount/unmount lifecycle
    view-registry.ts      -- view setup function registry
    frame.ts              -- Frame tree, createFrame, mount/unmount
    router.ts             -- Router with two-phase change confirmation
    state.ts              -- State singleton for cross-view data
    store.ts              -- createStore, computed, bindStore
    service.ts            -- createService, API management
    hooks.ts              -- useState, useEffect, useStore, etc.
    updater.ts            -- per-view data binding and digest
    dom.ts                -- real-DOM diff engine
    event-emitter.ts      -- multi-cast event system
    event-delegator.ts    -- DOM event delegation
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
      serialize.ts        -- VNode -> HTML string serializer
      template.ts         -- jsxTemplate adapter + inline-handler wiring
  tests/                  -- vitest test suite
  dist/                   -- built output
```

### Key Design Decisions

1. Functional over OOP: All APIs use factory functions and closures. No class, this, or prototype anywhere in the framework.

2. Real-DOM diff as default: String mode parses HTML into a temporary DOM tree and performs keyed comparison. This avoids the overhead of maintaining a virtual DOM for most use cases.

3. Runtime JSX templates: JSX compiles to plain `jsx()` calls via the standard automatic runtime; the VNode tree is serialized to an HTML string per digest and applied through the keyed real-DOM diff. No template compiler, no build-time AST analysis — templates are ordinary JavaScript with real scoping.

4. Two-phase routing: The Router fires a `change` event before navigation (allowing rejection) and a `changed` event after (triggering view updates). Navigation guards run asynchronously between the two phases.

5. Reference-counted events: The EventDelegator uses reference counting per event type on `document.body`, ensuring a single capture-phase listener per event type regardless of how many views register handlers.

6. LFU cache with frequency eviction: The bounded cache uses single-pass partial selection (O(n\*k)) instead of full sorting, making eviction efficient for the typical buffer size of 5.

7. Async callback validity: The `mark`/`unmark` system and `wrapAsync` prevent stale callbacks from executing after a view is re-rendered or destroyed.

8. Cooperative time-slicing: The task scheduler in `utils.ts` processes tasks in 9ms batches, yielding to the browser via `scheduler.yield()` (Chrome 115+) or `setTimeout(0)` fallback.
