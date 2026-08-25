---
name: larky
description: >-
  Authoritative reference for @lark.js/larky (v0.0.1+), the fully
  React-style TypeScript frontend framework located at packages/larky —
  plain function components ((props) => JSX, body re-runs per render,
  hostless instances with NO wrapper elements), call-order-indexed hooks
  with NO deps arrays and NO useState (useSignal, useShallowSignal, useRef,
  useComputed, useSignalEffect, useEffect is MOUNT-ONLY and runs as a
  same-flush job after the whole commit, onCleanup, useBlocker),
  fine-grained reactivity via @vue/reactivity (signal = Vue ref, DEEP —
  list.value.push(x) notifies, but NEVER store third-party class instances
  (Monaco/CodeMirror/chart/map SDKs) in a deep signal: the reactive proxy
  breaks their internal identity checks and hangs the page in a silent
  infinite loop — hold instances in useRef, or useShallowSignal /
  shallowSignal / markRaw / toRaw when the reference must be reactive; one
  render effect per instance; NO event
  emitters; NO error-swallowing wrappers — errors bubble),
  MICROTASK-BATCHED re-renders (writes never render synchronously — await
  nextTick() to observe the DOM, flushSync() to force a commit; there is NO
  batch()), per-key reactive props (shallow — parent objects keep
  identity) with plain callback props and props.children, React-DOM-style
  render(vnode, container) / unmount (both commit synchronously), direct
  VNode → DOM reconciliation (keyed diff, comment end-anchors), a
  FACTORY-based history-only router aligned with react-router's DATA MODE
  (createRouter(routes, {basename}) — no module singleton,
  location/match/params/searchParams signals, ranked "/users/:id" and "*"
  matching, navigate(to, {replace, state}), async block()/useBlocker,
  <RouterView/> outlet with per-route lazy() dedup, useRouter() active
  instance), anonymous zustand-aligned createStore(creator) (per-key
  SHALLOW signals + Object.is — immutable updates, unlike deep useSignal;
  auto-tracked computed slots and selector subscribe), a COMPLETE typed JSX
  layer ported from Preact v10 (strict per-tag IntrinsicElements for
  HTML/SVG/MathML, TargetedEvent with narrowed currentTarget,
  Signalish<T> attribute values, WAI-ARIA, data-* keys, import type { JSX }
  from "@lark.js/larky" for JSX.HTMLAttributes<T> in user type positions,
  JSXInternal namespace architecture that survives d.ts flattening), and
  Vite/Webpack plugins with auto-injected state-preserving component HMR
  (larkyPlugin, LarkyPlugin, hotSwapByComponent via globalThis.__larky_hmr__).
  Use this skill whenever the user reads, writes, debugs, reviews, or
  extends code that imports from "@lark.js/larky" (or any sub-path like
  /vite, /webpack, /jsx-runtime, /client), works under packages/larky or
  any consumer app that installs @lark.js/larky (file: protocol included),
  or mentions any of these symbols and concepts — render, unmount, FC,
  signal, shallowSignal, computed, effect, untracked, isSignal, markRaw,
  toRaw, nextTick, flushSync,
  useSignal, useShallowSignal, useComputed, useSignalEffect, useEffect,
  onCleanup,
  createRouter, RouterView, useRouter, useBlocker, matchRoutes,
  RouteObject, createStore, raw, Signalish, TargetedEvent, HTMLAttributes,
  JSX.IntrinsicElements, larkyPlugin, LarkyPlugin, hotSwapByComponent, or
  "why doesn't my component re-render" / "why is the DOM not updated yet" /
  "the page freezes/hangs after navigating or mounting an editor"
  in a larky app. Even if the user just says "add a page/view/component to
  the larky app", consult this skill first. Do NOT reach for lark-mvc
  (@lark.js/mvc) semantics here: larky has NO batch(), NO useUrlState, NO
  Signal class (use isSignal), NO @preact/signals-core, NO shallow-only
  signals (useSignal is deep), and NO synchronous re-renders (updates are
  microtask-batched) — and code using useState, useMemo, deps arrays,
  class components, SSR, or hash routing is out of scope by design and
  must be rewritten the larky way.
---

# Larky Framework (`@lark.js/larky`)

A fully React-style, lightweight TypeScript framework built on
`@vue/reactivity` fine-grained signals. Source: `packages/larky` (ESM+CJS
dual build, one runtime dependency: `@vue/reactivity`).

Core philosophy: **no `class`, no `this`, no `prototype`, no mixin — and
signals are the ONLY reactive mechanism**: no `useState`, no deps arrays,
no `useMemo`, no event emitters, no second dependency-tracking system, no
error-swallowing wrappers (errors bubble). Components are **React-style
plain functions** `(props) => JSX` — the body re-runs per render inside the
instance's render effect; state lives in call-order-indexed hooks.
Rendering is a **hostless VNode → DOM reconciler** (comment end-anchors, NO
wrapper elements — output DOM identical to React's). Updates are
**microtask-batched** (React-18-style automatic batching): writes never
render synchronously; `await nextTick()` / `flushSync()`. The router is a
**factory** (`createRouter(routes)`, data mode only) mirroring
react-router, with a `<RouterView/>` outlet. Cross-component state has one
answer: anonymous `createStore`. The JSX type layer is **complete and
strict** (per-tag, Preact-v10-ported). Deliberate non-goals: React Fiber,
SSR, hash routing, `batch()`, `useUrlState`, SWR-style server state (future
dedicated package).

## Package entry points

| Import                           | Provides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lark.js/larky`                 | Runtime: `render`, `unmount`, `signal`, `shallowSignal`, `computed`, `effect`, `untracked`, `isSignal`, `markRaw`, `toRaw`, `nextTick`, `flushSync`, hooks (`useSignal`, `useShallowSignal`, `useRef`, `useComputed`, `useSignalEffect`, `useEffect` mount-only, `onCleanup`), `createRouter`/`RouterView`/`useRouter`/`useBlocker`/`matchPath`/`matchRoutes`, `createStore`, `hotSwapByComponent`, `raw`, `Fragment`, all types (`FC`, `JSX`, `Signal`, `ShallowSignal`, `HTMLAttributes`, `RouteObject`, `RouterApi`, ...) |
| `@lark.js/larky/jsx-runtime`     | JSX automatic runtime (`jsx`/`jsxs`, `Fragment`, `raw`, the `JSX` namespace + full DOM type layer) — referenced by `jsxImportSource`, not imported by hand                                                                                                                                                                                                                                                                                                                                                                   |
| `@lark.js/larky/jsx-dev-runtime` | `jsxDEV` dev runtime                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@lark.js/larky/vite`            | `larkyPlugin()` — oxc JSX defaults + auto component HMR                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@lark.js/larky/webpack`         | `LarkyPlugin` (recommended), `larkyLoader`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@lark.js/larky/client`          | Ambient types: `*.css` module declarations, HMR globals                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

tsconfig: `"jsx": "react-jsx"`, `"jsxImportSource": "@lark.js/larky"`.

## The 60-second mental model

```
render(<App/>, container)    // routed apps: render(<RouterView router={r}/>, el)
        │                    // initial mount + render() re-calls commit SYNCHRONOUSLY
every FUNCTION TAG mounts an INSTANCE (hostless — children splice directly
into the parent element, terminated by a comment end-anchor)
        │
ONE @vue/reactivity render effect per instance
        │
effect run:  fn(props)  ── TRACKED: every signal read subscribes the
        │                   instance (useSignal state — DEEP, props.key,
        │                   store.getState().key,
        │                   router.location/params/searchParams .value)
   slice diff (keyed)     — per-node listeners, form-state props, refs
        │
   post-commit flush ───── UNTRACKED: child instance mounts (sync), per-key
        │                  prop pushes, ref calls
   mountEffects job ────── pending useEffect (mount) callbacks run as a
        │                  queued job in the SAME flush, after the whole
        │                  commit (outside the render effect — their writes
        │                  schedule re-renders instead of being suppressed)
        │
signal / prop write ──> subscribed render jobs ENQUEUE on the microtask
                        queue (deduplicated) — ONE flush per tick renders
                        each dirty instance exactly once.
                        await nextTick() → DOM committed
                        flushSync(fn)    → commit right now
```

A **component** is `function MyComp(props: P) { return <div/>; }` — used
directly as a JSX tag (`<MyComp x={1} onSave={fn}/>`). The body re-runs per
render; hooks are call-order slots (React rules of hooks). Instances are
matched across renders by function identity + `key`.

## Quick start (canonical shape)

```tsx
// src/views/user-detail.tsx
import { useSignal, useComputed, useRouter } from "@lark.js/larky";

export default function UserDetail() {
  const router = useRouter();
  const id = router.params.value["id"]; // "/users/:id" → tracked read
  const clicks = useSignal(0);
  const doubled = useComputed(() => clicks.value * 2);
  return (
    <div class="user">
      <p>
        user {id}, clicks {clicks.value} (x2 = {doubled.value})
      </p>
      <button onClick={() => clicks.value++}>+1</button>
      <button onClick={() => router.navigate("/", { state: { from: id } })}>
        Home
      </button>
    </div>
  );
}
```

```tsx
// src/main.tsx — routing app; plain apps just call render(<Home/>, el)
import { render, createRouter, RouterView } from "@lark.js/larky";
import Home from "./views/home";
import UserDetail from "./views/user-detail";
import NotFound from "./views/not-found";

const router = createRouter([
  { path: "/", component: Home },
  { path: "/users/:id", component: UserDetail },
  { path: "/admin", lazy: () => import("./views/admin") }, // code splitting
  { path: "*", component: NotFound },
]);
render(<RouterView router={router} />, document.getElementById("root")!);
```

```ts
// vite.config.ts
import { larkyPlugin } from "@lark.js/larky/vite";
export default defineConfig({ plugins: [larkyPlugin()] });
```

Component HMR is auto-injected — never write `import.meta.hot` boilerplate
by hand.

## Critical rules (violating these causes the classic bugs)

1. **The component body IS the tracked region** — it re-runs per render;
   reading a signal, `props.key`, store state, or
   `router.location.value`/`router.params.value` in it subscribes the
   instance. Event handlers and async callbacks read snapshots (no
   subscription).
2. **Updates are microtask-batched** — a write NEVER updates the DOM
   synchronously. N writes in one handler = ONE re-render per subscribed
   instance. `await nextTick()` before asserting/reading the DOM (tests!);
   `flushSync(fn)` forces a synchronous commit. `render()` itself commits
   synchronously. There is NO `batch()` — batching is automatic.
3. **Rules of hooks (React)** — the body re-runs, so hooks must run
   unconditionally, in the same order, at the top level. `useSignal(initial)`
   returns the SAME signal every render; a plain `signal()` in the body
   would be recreated per render (footgun — always use `useSignal` for
   instance state). Hook-count changes between renders dev-warn and reset
   trailing slots. There is NO `useState`.
4. **NO deps arrays** — there is no `useMemo` and no `useEffect(fn, deps)`.
   Derive with `useComputed(fn)` (auto-tracked, lazy); run reactive side
   effects with `useSignalEffect(fn)` (auto-tracked, batched re-runs,
   returned fn = cleanup); `useEffect(fn)` is MOUNT-ONLY (runs once
   post-commit, returned fn = unmount cleanup).
5. **`useSignal` is DEEP (Vue `ref`)** — `list.value.push(x)` notifies
   readers; no immutable-update dance needed for component state. BUT
   **props and store keys are SHALLOW**: props keep parent-object identity;
   `store.setState` compares by `Object.is` — replace references there
   (`set({ list: [...get().list, item] })`). **NEVER store third-party
   class instances (Monaco/CodeMirror editors, chart/map SDKs, sockets) in
   a deep signal**: `sig.value` returns a reactive PROXY (`!== stored`),
   which breaks the library's internal identity checks and can hang the
   page in a silent synchronous loop (Monaco's sentinel-node `while` is
   the classic case). Hold instances in `useRef` (non-reactive); when the
   reference itself must be reactive, use `useShallowSignal` /
   `shallowSignal` (identity-preserving, `.value`-assignment reactivity)
   or wrap the object with `markRaw` first. DOM elements are exempt (Vue
   never proxies them).
6. **Never create write cycles** — an effect (or body) writing a signal
   that another effect writes back ping-pongs; the flusher SKIPS the guilty
   job after 100 re-runs and throws `Cycle detected` once after the drain
   (`nextTick()` rejects). Derive with `useComputed`; write from event
   handlers or `useSignalEffect` with disjoint reads.
7. **Callbacks are plain props** (React semantics) — child calls
   `props.onSelect?.(data)` directly; there is no emitter. `children`
   arrive as `props.children`; `key` is a vnode-level sibling compare key
   (on component tags it preserves the INSTANCE and its hook state across
   reorders). `class`/`style`/`id`/`ref` on a component tag are ordinary
   props the component must apply itself (hostless).
8. **Routing is a factory, data mode only** —
   `const router = createRouter(routes, {basename?})` (history-only,
   per-instance state); `<RouterView router={router}/>` is the outlet;
   `useRouter()` resolves the ACTIVE (last-created) router; guard with
   `router.block(fn)` / `useBlocker(fn)`. Components read
   `router.params.value["id"]` etc. directly — there are NO
   useLocation/useParams alias hooks and NO `useUrlState`.
9. **Errors bubble** — no try-catch wrappers, no error sink. A throw in a
   body/effect rejects the flush promise (`nextTick()` awaiters see it);
   lazy-route failures are unhandled rejections.
10. **Strings are TEXT everywhere** — `raw(html)` is the only trusted-HTML
    path (there is no `dangerouslySetInnerHTML`; the typed layer rejects
    it). Cross-component state = `createStore(creator)` (anonymous, zustand
    semantics) — no global State singleton. Routes hold component
    REFERENCES or `lazy()` loaders (no string registry). The JSX type layer
    is STRICT: unknown tags/attributes are compile errors; import the `JSX`
    namespace (`import type { JSX } from "@lark.js/larky"`) for
    `JSX.HTMLAttributes<T>`-style user type positions.

## Reference files — read on demand

| File                                                                   | Read when working on                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [references/components.md](references/components.md)                   | Function components: props/callbacks/children/key/ref, all hooks in depth, instance lifecycle, `render`/`unmount`, DOM events, composition patterns                                                           |
| [references/templates.md](references/templates.md)                     | JSX semantics + the COMPLETE type layer: children/attribute tables, signal unwrapping, `raw()`, key semantics, namespaces, `JSX`/`JSXInternal`, `Signalish`, `TargetedEvent`, custom-element augmentation     |
| [references/state-routing.md](references/state-routing.md)             | Reactive core (`signal` deep semantics, `computed`, `effect`, `untracked`, `nextTick`/`flushSync`, scheduler & cycle handling), anonymous `createStore`, `createRouter`/`RouterView`/`useRouter`/`useBlocker` |
| [references/build-and-hmr.md](references/build-and-hmr.md)             | Vite/Webpack integration, lazy loading, HMR internals (`__larky_hmr__`), scaffolding conventions, dist-view typecheck (`typecheck:dist`)                                                                      |
| [references/rendering-internals.md](references/rendering-internals.md) | Instance render effects, the microtask job queue, anchor-slice reconciliation, keyed diff, attribute snapshots, timing — read when debugging renders/perf                                                     |
