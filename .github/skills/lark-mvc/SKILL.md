---
name: lark-mvc
description: >-
  Authoritative reference for @lark.js/mvc (v0.0.31+, React-FC rewrite), the
  functional-first TypeScript frontend framework located at packages/lark-mvc
  — plain function components ((props) => JSX, body re-runs per render,
  hostless instances with NO wrapper elements), call-order-indexed hooks
  (useSignal, useRef, useComputed, useMemo, useEffect with React deps
  semantics, useSignalEffect, onCleanup, useQuery), signals reactivity via
  @preact/signals-core (one render effect per instance, shallow reference
  comparison), per-key reactive props with plain callback props and
  props.children, React-DOM-style render(vnode, container) / unmount, direct
  VNode → DOM reconciliation (keyed diff, comment end-anchors, key never
  becomes a DOM id), two-phase Router with tracked Router.parse() and
  route-dispatch-by-render, per-key-signal State singleton, zustand-aligned
  createStore with auto-tracked computed, TanStack-style
  createQuery/useQuery/createMutation on signals, createService request
  layer, and Vite/Webpack/Rspack plugins with auto-injected state-preserving
  component HMR (hotSwapByComponent). Use this skill whenever the user
  reads, writes, debugs, reviews, or extends code that imports from
  "@lark.js/mvc" (or any sub-path like /vite, /webpack, /rspack,
  /jsx-runtime, /client), works under packages/lark-mvc or
  packages/lark-storybook, or mentions any of these symbols and concepts —
  render, unmount, Framework.boot, FC, useSignal, useRef, useComputed,
  useMemo, useEffect, useSignalEffect, onCleanup, useUrlState, createStore,
  createQuery, useQuery, createMutation, invalidateQueries, State, Router,
  Router.to, Router.beforeEach, registerComponent, createService,
  PayloadApi, raw, larkMvcPlugin, LarkMvcPlugin, hotSwapByComponent, or "why
  doesn't my component re-render". Even if the user just says "add a
  page/view/component to the Lark app", consult this skill first. Do NOT
  use for the removed legacy designs (defineView, jsxTemplate, ViewCtx,
  Frame/mountView/mountZone, params proxy argument pairs, ctx.owner.fire
  event trampolines, EventDelegator, HTML-string serializer,
  SPLITTER/v-lark/p-lark/refData, digest/observe APIs) except to migrate
  them away — if code still uses them it predates the FC rewrite and must
  be migrated.
---

# Lark Mvc Framework (`@lark.js/mvc`)

A lightweight, functional-first TypeScript framework for SPAs and
micro-frontends. Source: `packages/lark-mvc` (v0.0.31+, ESM+CJS dual build,
one runtime dependency: `@preact/signals-core`).

Core philosophy: **no `class`, no `this`, no `prototype`, no mixin**.
Components are **React-style plain functions** `(props) => JSX` — the body
re-runs per render inside the instance's render effect; state lives in
call-order-indexed hooks. Rendering is a **hostless VNode → DOM reconciler**
(Preact-fiber-like instances, comment end-anchors, NO wrapper elements — the
output DOM is identical to React's). There is **no defineView, no
jsxTemplate, no ViewCtx, no Frame tree, no event emitter between components,
no HTML-string serializer, no digest** — all removed; if you see them in
code, that code predates the FC rewrite and must be migrated.

## Package entry points

| Import                         | Provides                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@lark.js/mvc`                 | Runtime: `render`, `unmount`, `signal`, `computed`, `effect`, `batch`, `untracked`, `Signal`, hooks (`useSignal`, `useRef`, `useComputed`, `useMemo`, `useEffect`, `useSignalEffect`, `onCleanup`), `createQuery`/`useQuery`/`createMutation`/`invalidateQueries`, `State`, `Router`, `createStore`, `createService`, `useUrlState`, `registerComponent`, `Framework`, all types (`FC`, ...) |
| `@lark.js/mvc/jsx-runtime`     | JSX automatic runtime (`jsx`/`jsxs`, `Fragment`, `raw`, JSX types) — referenced by `jsxImportSource`, not imported by hand                                                                                                                                                    |
| `@lark.js/mvc/jsx-dev-runtime` | `jsxDEV` dev runtime                                                                                                                                                                                                                                                          |
| `@lark.js/mvc/vite`            | `larkMvcPlugin()` — oxc JSX defaults + auto component HMR                                                                                                                                                                                                                     |
| `@lark.js/mvc/webpack`         | `LarkMvcPlugin` (recommended), `larkMvcLoader`                                                                                                                                                                                                                                |
| `@lark.js/mvc/rspack`          | `LarkMvcPlugin`, `larkMvcLoader`                                                                                                                                                                                                                                              |
| `@lark.js/mvc/client`          | Ambient types: `*.css` module declarations, HMR globals                                                                                                                                                                                                                       |

tsconfig: `"jsx": "react-jsx"`, `"jsxImportSource": "@lark.js/mvc"`.

## The 60-second mental model

```
render(<App/>, container)      // or Framework.boot: Router CHANGED → render
        │
every FUNCTION TAG mounts an INSTANCE (hostless — children splice directly
into the parent element, terminated by a comment end-anchor)
        │
ONE @preact/signals-core effect per instance
        │
effect run:  fn(props)  ── TRACKED: every signal read subscribes the
        │                   instance (useSignal state, props.key,
        │                   State.get(key), store.getState().key,
        │                   Router.parse(), query signals)
   slice diff (keyed)     — per-node listeners, form-state props, refs
        │
   post-commit flush ───── UNTRACKED: child instance mounts, batched
        │                  per-key prop pushes, ref calls
   flushInstanceEffects ── pending useEffect callbacks run (DOM exists)
        │
signal / prop write ──> only SUBSCRIBED instances re-render (batch() coalesces)
```

A **component** is `function MyComp(props: P) { return <div/>; }` — used
directly as a JSX tag (`<MyComp x={1} onSave={fn}/>`). The body re-runs per
render; hooks are call-order slots (React rules of hooks). Instances are
matched across renders by function identity + `key`.

## Quick start (canonical shape)

```tsx
// src/views/home.tsx
import { useSignal, Router } from "@lark.js/mvc";
import styles from "./home.module.css";

export default function Home() {
  const count = useSignal(0);
  return (
    <div class={styles["home"]}>
      <p>Count: {count.value}</p>
      <button onClick={() => count.value++}>+1</button>
      <button onClick={() => Router.to("/about", { from: "home" })}>About</button>
    </div>
  );
}
```

```ts
// src/boot.ts — routing app; plain apps just call render(<Home/>, el)
import { Framework } from "@lark.js/mvc";
import HomeView from "./views/home";
import AboutView from "./views/about";
Framework.boot({
  rootId: "app",
  routeMode: "history", // or "hash" (#! prefix)
  defaultPath: "/home",
  defaultView: HomeView, // imported components OR registered path strings
  routes: { "/home": HomeView, "/about": AboutView },
});
```

```ts
// vite.config.ts
import { larkMvcPlugin } from "@lark.js/mvc/vite";
export default defineConfig({ plugins: [larkMvcPlugin()] });
```

HTML entry needs `<div id="app"></div>` matching `rootId`. Component HMR is
auto-injected — never write `import.meta.hot` boilerplate by hand.

## Critical rules (violating these causes the classic bugs)

1. **The component body IS the tracked region** — it re-runs per render;
   reading a signal, `props.key`, `State.get(key)`, store state, or
   `Router.parse()` in it subscribes the instance. Event handlers and async
   callbacks read snapshots (no subscription).
2. **Rules of hooks (React)** — the body re-runs, so hooks must run
   unconditionally, in the same order, at the top level. `useSignal(initial)`
   returns the SAME signal every render; a plain `signal()` in the body
   would be recreated per render (footgun — always use `useSignal` for
   instance state). Hook-count changes between renders dev-warn and reset
   trailing slots.
3. **Shallow reactivity** — signals compare by reference (`===`).
   `list.value.push(x)` renders nothing; write `list.value = [...list.value, x]`.
   Same rule for `State.set`, `store.setState`, and props.
4. **Never write a signal the same body/computed reads** — that is a cycle
   (`Cycle detected`). Derive with `useComputed`; write from event handlers
   or `useSignalEffect` with disjoint reads.
5. **Callbacks are plain props** (React semantics) — child calls
   `props.onSelect?.(data)` directly; there is no emitter, no fire(), no
   trampoline. Reading a callback prop inside a HANDLER is a call-time
   snapshot (always fresh, no subscription); reading it in the BODY
   subscribes — new closure identity per parent render would re-render the
   child, so call callbacks from handlers.
6. **`children` arrive as `props.children`**; `key` is a vnode-level sibling
   compare key (never a DOM id) — on component tags it preserves the
   INSTANCE (and its hook state) across reorders. `class`/`style`/`id`/`ref`
   on a component tag are ordinary props the component must apply itself
   (hostless — there is no host element to route them to).
7. **`useEffect` runs AFTER the DOM commit** with React deps semantics: no
   deps → every render, `[]` → mount only, deps → on change; cleanup before
   re-run and on unmount. DOM access = `ref={cell}` + `useEffect(..., [])`.
   `useSignalEffect` is the signals-native alternative (created once,
   re-runs on signal changes, no deps array).
8. **Every function tag is a stateful instance** — there are no "stateless
   template partials" anymore. Stateless helpers that return JSX but are
   CALLED as functions (`{renderRow(item)}`) stay inline in the caller's
   body; used as tags (`<Row/>`) they get their own instance.
9. **Keyed lists**: give loop items a stable `key` (elements AND
   components). Without keys, matching is positional per kind.
10. **Strings are TEXT** everywhere — a component returning a string renders
    escaped text; `raw(html)` is the only trusted-HTML path. Route strings
    are extension-less registry paths (`registerComponent("views/home", Home)`);
    imported components used as tags never need registration.

## Reference files — read on demand

| File                                                                    | Read when working on                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [references/components.md](references/components.md)                   | Function components: props/callbacks/children/key/ref, all hooks in depth, instance lifecycle, `render`/`unmount`, DOM events, composition patterns          |
| [references/templates.md](references/templates.md)                     | JSX semantics: children/attribute tables, Signal unwrapping, `raw()`, key semantics, namespaces, security guards                                             |
| [references/state-routing.md](references/state-routing.md)             | Signals API, `State` (per-key signals + `clean()`), `createStore`/auto-tracked `computed`, `Router` (tracked parse/to/diff/beforeEach), `useUrlState`         |
| [references/services.md](references/services.md)                       | `useQuery`/`createQuery`/`createMutation`/`invalidateQueries` (TanStack-style), `createService`, `PayloadApi`, `createCache`, `createEmitter`                |
| [references/build-and-hmr.md](references/build-and-hmr.md)             | Vite/Webpack/Rspack integration, `FrameworkConfig` (full table), route dispatch, lazy loading & Module Federation, HMR internals, scaffolding conventions     |
| [references/rendering-internals.md](references/rendering-internals.md) | Instance render effects, anchor-slice reconciliation, keyed diff, attribute snapshots, batching/timing — read when debugging renders/perf                    |
