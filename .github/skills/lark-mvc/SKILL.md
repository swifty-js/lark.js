---
name: lark-mvc
description: >-
  Authoritative reference for @lark.js/mvc (v0.0.28+), the functional-first
  TypeScript frontend framework located at packages/lark-mvc — signals
  reactivity via @preact/signals-core (signal/computed/effect/batch/untracked,
  per-view render effects, shallow reference comparison), React-style JSX view
  components (defineView returns a LarkView used as a JSX tag, jsxTemplate,
  inline event closures, reactive params props), Frame tree, two-phase Router
  with tracked Router.parse(), per-key-signal State singleton,
  zustand-aligned createStore with auto-tracked computed, createService
  request layer, real-DOM diff rendering, and Vite/Webpack/Rspack plugins
  with auto-injected state-preserving HMR. Use this skill whenever the user
  reads, writes, debugs, reviews, or extends code that imports from
  "@lark.js/mvc" (or any sub-path like /vite, /webpack, /rspack,
  /jsx-runtime, /client), works under packages/lark-mvc, packages/lark-docs,
  or packages/lark-storybook, or mentions any of these symbols and concepts —
  Framework.boot, defineView, LarkView, ViewCtx, jsxTemplate, signal,
  computed, effect, batch, untracked, useSignal, useSignalEffect, useEffect,
  useUrlState, useInterval, useTimeout, useResource, useEvent, createStore,
  State, Router, Router.to, Router.beforeEach, Frame, createFrame,
  registerViewClass, ensureViewName, createService, PayloadApi,
  ctx.owner.fire, mountZone, mountView, v-lark, p-lark, larkMvcPlugin,
  LarkMvcPlugin, hotSwapByView, EventDelegator, or "why doesn't my view
  re-render". Even if the user just says "add a page/view/component to the
  Lark app", consult this skill first. Do NOT use for the legacy digest-era
  API (updater.set().digest(), events maps like "handler<click>", .html
  templates, observeState/observeLocation — all removed) or for unrelated
  React/Vue projects.
---

# Lark Mvc Framework (`@lark.js/mvc`)

A lightweight, functional-first TypeScript framework for SPAs and
micro-frontends. Source: `packages/lark-mvc` (v0.0.28+, ESM+CJS dual build,
one runtime dependency: `@preact/signals-core`).

Core philosophy: **no `class`, no `this`, no `prototype`, no mixin**. Every
API is a factory function + closures. Views are React-style JSX components;
reactivity is **signals** — reading a signal inside a template subscribes the
view, writing it re-renders synchronously. There is **no digest, no events
map, no observe declarations, no .html templates** (all removed in the
signals/JSX refactors — if you see them in code, that code predates v0.0.28
and must be migrated).

## Package entry points

| Import                         | Provides                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lark.js/mvc`                 | Runtime: `signal`, `computed`, `effect`, `batch`, `untracked`, `Signal`, `Framework`, `defineView`, `jsxTemplate`, `raw`, hooks, `State`, `Router`, `Frame`, `createStore`, `createService`, `useUrlState`, `EventDelegator`, `registerViewClass`, all types |
| `@lark.js/mvc/jsx-runtime`     | JSX automatic runtime (`jsx`/`jsxs`, `Fragment`, `raw`, JSX types) — referenced by `jsxImportSource`, not imported by hand                                                                                                    |
| `@lark.js/mvc/jsx-dev-runtime` | `jsxDEV` dev runtime                                                                                                                                                                                                          |
| `@lark.js/mvc/vite`            | `larkMvcPlugin()` — oxc JSX defaults + auto view HMR                                                                                                                                                                          |
| `@lark.js/mvc/webpack`         | `LarkMvcPlugin` (recommended), `larkMvcLoader`                                                                                                                                                                                |
| `@lark.js/mvc/rspack`          | `LarkMvcPlugin`, `larkMvcLoader`                                                                                                                                                                                              |
| `@lark.js/mvc/client`          | Ambient types: `*.css` module declarations, DOM augmentations                                                                                                                                                                 |

tsconfig: `"jsx": "react-jsx"`, `"jsxImportSource": "@lark.js/mvc"`.

## The 60-second mental model

```
Framework.boot(config)     // root Frame; Router CHANGED → route-view mount
        │
frame.mountView(...) ──> setup runs ONCE (untracked) ──> { template }
        │
createRenderEffect(ctx)    // ONE @preact/signals-core effect per view
        │
effect run:  template()  ── TRACKED: every signal read subscribes the view
        │                    (local signals, params.key, State.get(key),
        │                     store.getState().key, Router.parse())
   real-DOM keyed diff
        │
   endUpdate → mountZone ── UNTRACKED: mounts <Child/> hosts, batch-writes
                             child params signals, re-syncs event trampolines
signal write ──> subscribed render effects re-run synchronously
                 (writes inside batch() coalesce; DOM handlers auto-batch)
```

A **view** is `defineView<P>((ctx, params) => ({ template }))` — the result
is a `LarkView` used directly as a JSX tag (`<MyView x={1} onSave={fn}/>`),
never called as a function. Setup runs **once per mount**; per-render logic
lives in the template body (it re-runs per render) or in `computed()`.

## Quick start (canonical shape)

```tsx
// src/views/home.tsx
import { defineView, jsxTemplate, signal, Router } from "@lark.js/mvc";
import styles from "./home.module.css";

export default defineView(() => {
  const count = signal(0);
  const template = jsxTemplate(() => (
    <div class={styles["home"]}>
      <p>Count: {count.value}</p>
      <button onClick={() => count.value++}>+1</button>
      <button onClick={() => Router.to("/about", { from: "home" })}>About</button>
    </div>
  ));
  return { template };
});
```

```ts
// src/boot.ts
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

HTML entry needs `<div id="app"></div>` matching `rootId`. View HMR is
auto-injected — never write `import.meta.hot` boilerplate by hand.

## Critical rules (violating these causes the classic bugs)

1. **Reads subscribe only inside tracked regions** — the template body,
   `computed(fn)`, and `useSignalEffect(fn)`. Reading a signal in the setup
   body or an event handler is a plain snapshot (setup even runs inside
   `untracked()`). Read props/State/stores **in the template**, React-style.
2. **Shallow reactivity** — signals compare by reference (`===`).
   `list.value.push(x)` renders nothing; write `list.value = [...list.value, x]`.
   Same rule for `State.set`, `store.setState`, and props.
3. **Never write a signal the same template/computed reads** — that is a
   cycle (`@preact/signals-core` throws `Cycle detected`). Derive with
   `computed`; write from event handlers or `useSignalEffect` with disjoint
   reads.
4. **Events are inline JSX functions only** (`onClick={() => ...}`) —
   camelCase `on` + Capitalized DOM type; string values are rejected. DOM
   handlers and child→parent trampolines run inside `batch()` (multi-writes
   render once). Window/document listeners: `useEffect` + `addEventListener`.
5. **Child components are imported and used as JSX tags** —
   `<Child rows={rows} onSelect={fn}/>`. `on[A-Z]`-prefixed function props
   become child→parent events (child fires `ctx.owner.fire("select", data)`;
   names are case-sensitive). Everything else lands in the child's reactive
   `params` proxy. `children` are not supported on component tags.
6. **Hooks only inside setup** — they read a module-level `currentCtx`;
   calling them in event handlers or async callbacks throws. `useEffect` runs
   synchronously during setup — the DOM does not exist yet; defer DOM access
   with `setTimeout(..., 0)`.
7. **Guard async work** with `ctx.wrapAsync(fn)` (signature-guarded) — but
   note EVERY reactive re-render bumps `signature`, so wrapped callbacks die
   on any re-render. For async flows that must survive re-renders, use your
   own sequence counter (see the docs-layout `navSeq` pattern).
8. **`useSignal(key, initial)` vs `signal(initial)`** — both are view-local;
   only `useSignal` survives HMR re-setup (keyed on `ctx.signals`).
9. **Keyed lists**: give loop items a stable `key` (or `id`) — it becomes the
   DOM id / compare key. On component tags, `key` preserves the child frame
   (and its state) across reorders. Ids are document-global; keep them unique.
10. Route/`registerViewClass` path strings are extension-less and
    source-root-relative; imported components auto-register (`ensureViewName`
    → `__vN_Name`). Raw `<div v-lark="path"></div>` HTML still mounts
    registered paths (markdown pipelines).

## Reference files — read on demand

| File                                                                   | Read when working on                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [references/views.md](references/views.md)                             | `defineView`/`LarkView`, full `ViewCtx` API, lifecycle, all hooks, component props & events (reactive params, trampolines), Frame tree, event delegation    |
| [references/templates.md](references/templates.md)                     | JSX template system: `jsxTemplate`, output/attribute semantics, Signal unwrapping, event props, functional components, `raw()`                              |
| [references/state-routing.md](references/state-routing.md)             | Signals API, `State` (per-key signals), `createStore`/auto-tracked `computed`, `Router` (tracked parse/to/diff/beforeEach), `useUrlState`                    |
| [references/services.md](references/services.md)                       | `createService`, endpoint metadata, caching/dedup/queueing, `PayloadApi`, `createCache`, `createEmitter`                                                     |
| [references/build-and-hmr.md](references/build-and-hmr.md)             | Vite/Webpack/Rspack integration, `FrameworkConfig` (full table), lazy loading & Module Federation, HMR internals, project scaffolding conventions            |
| [references/rendering-internals.md](references/rendering-internals.md) | Render-effect pipeline, batching, real-DOM keyed diff (`id`/`v-lark` compare keys), refData tokens — read when debugging renders/perf                        |
