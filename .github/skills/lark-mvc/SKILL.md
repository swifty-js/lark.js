---
name: lark-mvc
description: >-
  Authoritative reference for @lark.js/lark-mvc (v0.0.19), the functional-first
  TypeScript frontend framework located at packages/lark-mvc — views via
  defineView() + ViewCtx + hooks, Frame tree, two-phase Router, State
  singleton, zustand-aligned createStore/computed/bindStore, createService
  request layer, compile-time .html templates ({{=}}/{{!}}/{{@}}/{{forOf}}),
  v-lark child views with *prop/@event bindings, string-mode real-DOM diff
  and opt-in VDOM (LIS) rendering, Vite/Webpack/Rspack plugins with
  auto-injected HMR, and the Frame Devtool Bridge. Use this skill whenever the
  user reads, writes, debugs, reviews, or extends code that imports from
  "@lark.js/lark-mvc" (or any sub-path like /vite, /webpack, /rspack, /runtime,
  /compiler, /devtool, /client), works under packages/lark-mvc,
  packages/lark-demo, or packages/lark-docs, or mentions any of these
  symbols and concepts — Framework.boot, defineView, ViewCtx, ViewSetup,
  useState, useEffect, useStore, useUrlState, useInterval, useTimeout,
  useResource, useEvent, createStore, computed, bindStore, State, Router,
  Router.to, Router.beforeEach, Frame, createFrame, registerViewClass,
  createService, PayloadApi, updater.set().digest(), ctx.owner.fire,
  mountZone, mountView, v-lark, p-lark-, e-lark-, larkMvcPlugin,
  LarkMvcPlugin, larkMvcLoader, hotSwapByTemplate, hotSwapByView,
  vdomCreate, EventDelegator, compileTemplate, extractGlobalVars,
  "handler<click>" event maps, or Lark template syntax in .html files. Even
  if the user just says "add a page/view/component to the Lark app", consult
  this skill first. Do NOT use for the legacy class-based Lark (View.extend)
  or for unrelated React/Vue projects.
---

# Lark Mvc Framework (`@lark.js/lark-mvc`)

A lightweight, functional-first TypeScript framework for SPAs and
micro-frontends. Source: `packages/lark-mvc` (v0.0.19, ESM+CJS dual build,
zero runtime dependencies — Babel/htmlparser2 are build-time only).

Core philosophy: **no `class`, no `this`, no `prototype`, no mixin**. Every
API is a factory function + closures. Templates are `.html` files compiled at
build time into render functions. Data changes are **explicit**: nothing
re-renders until you call `.digest()` (or a hook/store does it for you).

## Package entry points

| Import                       | Provides                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lark.js/lark-mvc`          | Runtime: `Framework`, `defineView`, hooks, `State`, `Router`, `Frame`, `createStore`, `computed`, `bindStore`, `createService`, `useUrlState`, `EventDelegator`, `vdomCreate`, `registerViewClass`, all types |
| `@lark.js/lark-mvc/vite`     | `larkMvcPlugin({ debug?, vdom? })`                                                                                                                                                                            |
| `@lark.js/lark-mvc/webpack`  | `larkMvcLoader`, `LarkMvcPlugin` (auto-registers loader)                                                                                                                                                      |
| `@lark.js/lark-mvc/rspack`   | `larkMvcLoader`, `LarkMvcPlugin`                                                                                                                                                                              |
| `@lark.js/lark-mvc/runtime`  | Template helpers (`encHtml`, `strSafe`, `encUri`, `encQuote`, `refFn`) — imported by compiled templates, not by app code                                                                                      |
| `@lark.js/lark-mvc/compiler` | Build-time `compileTemplate`, `extractGlobalVars`                                                                                                                                                             |
| `@lark.js/lark-mvc/devtool`  | `installFrameDevtoolBridge`, frame-tree serialization types                                                                                                                                                   |
| `@lark.js/lark-mvc/client`   | Ambient types: `*.html` / `*.css` module declarations, DOM augmentations                                                                                                                                      |

## The 60-second mental model

```
Framework.boot(config)          // creates root Frame, binds Router + State
        │
Router/State "changed" ──> dispatcher walks Frame tree ──> re-render observers
        │
frame.mountView(path) ──> setup runs ONCE ──> { template, events, assign? }
        │
ctx.updater.set(data).digest() ──> template(data) ──> DOM diff ──> endUpdate
        │                                                       │
        │                                    mountZone scans [v-lark] elements
        │                                    ──> mounts child views with props
events: delegated once to document.body (capture phase, ref-counted)
```

A **view** is `defineView((ctx, params) => ({ template, events, assign? }))`.
The setup runs **once per mount** (unlike React). `useState` returns a
`[getter, setter]` pair so event handlers never see stale closures. The
compiled template reads from `ctx.updater.data` independently of setup
closures — template variables are auto-extracted at build time (zero config).

## Quick start (canonical shape)

```ts
// src/views/home.ts
import { defineView, useState, Router } from "@lark.js/lark-mvc";
import template from "./home.html"; // compiled by the bundler plugin
import styles from "./home.module.css"; // CSS modules via updater data

export default defineView((ctx, params) => {
  ctx.updater.set({ styles });
  const [getCount, setCount] = useState("count", 0);
  return {
    template,
    events: {
      "increment<click>": () => setCount(getCount() + 1),
      "goAbout<click>": () => Router.to("/about", { from: "home" }),
    },
  };
});
```

```html
<!-- src/views/home.html -->
<div class="{{=styles['home']}}">
  <p>Count: {{=count}}</p>
  <button @click="increment()">+1</button>
  <button @click="goAbout()">About</button>
</div>
```

```ts
// src/boot.ts
import { Framework } from "@lark.js/lark-mvc";
Framework.boot({
  rootId: "app",
  routeMode: "history", // or "hash" (#! prefix)
  defaultPath: "/home",
  defaultView: "home",
  routes: { "/home": "home", "/about": "about" },
  unmatchedView: "404",
  vdom: false, // true = VDOM/LIS mode (must match plugin option)
  require: async (
    names, // lazy view loading (chunk-split / MF)
  ) =>
    Promise.all(
      names.map((n) => import(`./views/${n}`).then((m) => m.default)),
    ),
});
```

```ts
// vite.config.ts
import { larkMvcPlugin } from "@lark.js/lark-mvc/vite";
export default defineConfig({ plugins: [larkMvcPlugin({ vdom: false })] });
```

HTML entry needs `<div id="app"></div>` matching `rootId`. HMR for both
`.html` and `.ts` view files is auto-injected — never write `import.meta.hot`
boilerplate by hand.

## Critical rules (violating these causes the classic bugs)

1. **Explicit digest** — `ctx.updater.set(data)` alone does NOT re-render.
   Chain `.digest()`: `ctx.updater.set({ count }).digest()` (or
   `ctx.updater.digest({ count })`). `useState` setters and `bindStore` call
   digest for you.
2. **Event map keys carry the DOM event type**: `"handler<click>"`, multi
   `"handler<click,mousedown>"`, selector `"$mySelector<click>"`, global
   `"$window<resize>"` / `"$document<keydown>"`, modifier
   `"name<click><ctrl>"`. Template side uses `@click="handler()"` — parens
   required for view-event handlers; `@event="name"` (no parens) on a
   `v-lark` element is a child→parent event binding instead.
3. **Dynamic event-handler arguments MUST be interpolated with `{{=expr}}`** —
   the compiler's `@event` rewrite (`processViewEvents` → `jsObjectToUrlParams`)
   is a purely **textual** transform that never evaluates identifiers. A bare
   expression such as `@click="pick({index: cell.index})"` compiles to the
   literal `pick(index=cell.index)`, so at runtime `e.params.index` is the
   string `"cell.index"` (`Number(...)` → `NaN`) and the handler silently
   misbehaves — no compile error, no console error. Write
   `@click="pick({index: {{=cell.index}}})"` instead: art-syntax conversion
   (Phase 2) runs **before** event processing (Phase 3), so the value is
   rendered into the attribute (e.g. `pick(index=112)`) and delivered via
   `e.params` (stringified). Only static literals (`{mode: 'soft'}`) may be
   written without interpolation.
4. **`vdom` must match in two places**: `FrameworkConfig.vdom` and the bundler
   plugin option (`larkMvcPlugin({ vdom })`). Mismatch = broken rendering.
5. **Hooks only inside setup** — they read a module-level `currentCtx`; calling
   them in event handlers or async callbacks throws.
6. **Setup runs once** — no re-execution on render. Put per-render data logic
   in the optional `assign()` (pattern: `updater.snapshot()` → `set(...)` →
   `return updater.altered()`), and call it once manually for the first render.
7. **Pass objects to children with `{{@expr}}`** (ref token), strings with
   `{{=expr}}`. Child receives them in `params`; later parent renders push
   updated props via `mountZone` automatically.
8. **Guard async work** with `ctx.wrapAsync(fn)` (signature-guarded; stale
   callbacks after re-render/destroy are dropped) or check inside `useEffect`
   cleanup flags. `useEffect` runs synchronously during setup — the DOM does
   not exist yet; defer DOM access with `setTimeout(..., 0)`.
9. **State needs digest too**: `State.set({...}); State.digest();` and views
   only react if they declared `ctx.observeState("key1,key2")`. Use
   `State.clean("keys")(ctx)` for reference-counted cleanup.
10. View paths are extension-less and relative to the app source root
    (`"components/counter-store"`), used consistently in `routes`, `v-lark`,
    `registerViewClass`, and the `require` loader.

## Reference files — read on demand

| File                                                                   | Read when working on                                                                                                                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [references/views.md](references/views.md)                             | `defineView`, full `ViewCtx` API, lifecycle, all hooks, child views (`v-lark` / `*prop` / `@event`), Frame tree, event delegation & handler naming                |
| [references/templates.md](references/templates.md)                     | Template syntax (`{{=}} {{!}} {{@}} {{:}}`, `if/forOf/forIn/for/set`), event attributes, compilation pipeline, compiler options                                   |
| [references/state-routing.md](references/state-routing.md)             | `State`, `createStore`/`computed`/`bindStore`/`useStore`, `Router` (parse/to/diff/beforeEach, history vs hash), `useUrlState`                                     |
| [references/services.md](references/services.md)                       | `createService`, endpoint metadata, caching/dedup/queueing, `PayloadApi`, `createCache`, `createEmitter`                                                          |
| [references/build-and-hmr.md](references/build-and-hmr.md)             | Vite/Webpack/Rspack integration, `FrameworkConfig` (full table), lazy loading & Module Federation, HMR internals, Devtool Bridge, project scaffolding conventions |
| [references/rendering-internals.md](references/rendering-internals.md) | Updater/digest semantics, string-mode real-DOM diff vs VDOM LIS diff, keyed diff (`id`/`#` compare keys), task scheduler — read when debugging rendering/perf     |

Real-world example code lives in `packages/lark-demo` (chunk-split app with
nested components, stores, Module Federation) and `packages/lark-docs/app`
(docs site built on the framework). `packages/lark-vscode` provides editor
support (syntax highlighting, go-to-definition for `v-lark`/`@event`).
