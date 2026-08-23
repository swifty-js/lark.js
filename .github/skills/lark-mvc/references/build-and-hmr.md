# Build Integration, Config, HMR

Source of truth: `src/vite.ts`, `src/webpack.ts`, `src/rspack.ts`,
`src/hmr-inject.ts`, `src/hmr.ts`, `src/framework.ts`, `src/module-loader.ts`.

## TypeScript setup (required)

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@lark.js/mvc",
  },
}
```

Add `"@lark.js/mvc/client"` to `types` (or a triple-slash reference) so
`*.css` module imports type-check.

## Bundler plugins

There is no template compilation — JSX goes through the standard automatic
runtime. The plugins do two things: JSX transform defaults (Vite only) and
auto-injected view HMR.

### Vite (8+)

```ts
// vite.config.ts
import { larkMvcPlugin } from "@lark.js/mvc/vite";
export default defineConfig({
  plugins: [larkMvcPlugin()],
});
```

- Defaults `oxc.jsx = { runtime: "automatic", importSource: "@lark.js/mvc" }`
  (user-provided oxc settings win; `oxc: false` / `jsx: "preserve"` respected).
- Injects view HMR into every `.ts/.tsx/.js/.jsx` module whose default
  export is a `defineView(...)`.

> `file:`-linked lark-mvc? Vite's dep pre-bundle cache is keyed by the
> lockfile, not dep contents — after rebuilding lark-mvc run `vite --force`
> (or delete `node_modules/.vite`).

### Webpack / Rspack — plugin form (recommended, zero config)

```ts
import { LarkMvcPlugin } from "@lark.js/mvc/webpack"; // or /rspack
export default {
  plugins: [new LarkMvcPlugin()],
};
// Options: { test? (default /\.[jt]sx?$/), exclude? (default /node_modules/) }
```

The plugin registers one `enforce: "pre"` rule that injects view HMR before
SWC/ts-loader/babel. The JSX transform itself comes from your existing
TS/SWC/Babel loader reading the tsconfig above. Manual loader form:
`{ test: /\.[jt]sx?$/, exclude: /node_modules/, enforce: "pre", loader: "@lark.js/mvc/webpack" }`.

## FrameworkConfig (complete)

| Key             | Type                                                     | Default                     | Description                                                     |
| ---------------- | --------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `rootId`        | `string`                                                  | `"root"`                    | Root DOM element id; root view renders inside it                |
| `routeMode`     | `"history" \| "hash"`                                     | `"history"`                 | Routing mode                                                    |
| `defaultView`   | `string \| LarkView`                                      | —                           | View mounted when URL matches no route                          |
| `defaultPath`   | `string`                                                  | `"/"`                       | Path assumed when URL is empty                                  |
| `routes`        | `Record<string, string \| LarkView \| RouteViewConfig>`   | —                           | `{"/home": HomeView}` or `{view, ...extras merged into Location}` |
| `unmatchedView` | `string \| LarkView`                                      | —                           | 404 view                                                        |
| `hashbang`      | `string`                                                  | `"#!"`                      | Hash prefix (hash mode)                                         |
| `rewrite`       | `(path, params, routes) => string`                        | —                           | Path rewriting before route lookup                              |
| `error`         | `(e: Error) => void`                                      | rethrow                     | Global error hook — render-pass errors route here too           |
| `require`       | `(names, params?) => Promise<unknown[]>`                  | dynamic `import()` fallback | Async view loader — the Module Federation / chunk-split hook    |

`boot()` normalizes `LarkView` entries to internal registry-name strings
(`ensureViewName`), so Router internals stay string-based.

`Framework.getConfig()` / `getConfig(key)` reads, `setConfig(patch)` merges.
Other `Framework` utilities: `toUri(path, params, keepEmpty?)`,
`parseUri(url)`, `use(names, cb?)`, `delay(ms)`, `mark(host, key)` /
`unmark(host)` (async validity tokens), `generateId(prefix?)`,
`ensureNodeId(el)`, `nodeInside(a, b)`, `dispatchEvent(target, type, init?)`,
`waitZoneViewsRendered(viewId, timeout?)`, `isBooted()`.
Removed: `Framework.task` (chunked scheduler) — use `batch()`.

## Lazy view loading

When `mountView` hits an unregistered path it calls `use(path)` →
`config.require`. Without `require`, a raw dynamic `import()` fallback is
used. Components embedded as **imported JSX tags need no registration** —
they auto-register at serialization time. Registration only matters for
string paths (routes, raw `v-lark` HTML):

```ts
import { registerViewClass } from "@lark.js/mvc";
import type { ViewSetup } from "@lark.js/mvc";

const VIEW_MODULES: Record<string, () => Promise<unknown>> = {
  home: () => import("./views/home").then((m) => m.default),
  admin: () => import("./views/admin").then((m) => m.default),
};

Framework.boot({
  routes: { "/home": "home", "/admin": "admin" },
  require: async (names) =>
    Promise.all(names.map((name) => VIEW_MODULES[name]?.())),
});
```

For Module Federation, `require` branches on the path prefix and imports
from the remote (`import("remote_app/" + rest)`). Share `@lark.js/mvc` as a
singleton in the MF `shared` config.

## HMR (auto-injected — never hand-write it)

One layer: a view module contains both the setup and its `jsxTemplate`
closure, so swapping the view covers template edits too. On module update,
`export default defineView(...)` (rewritten to `const __lark_view__ = ...`)
self-accepts → `globalThis.__lark_hmr__.hotSwapByView(old, new)`:

1. Alias the new component to the old auto-registered name
   (`aliasViewName`) — parents holding the stale import keep resolving to
   the same internal path/frame identity.
2. Registry entries pointing at the old setup are swapped.
3. Per matching frame, `hotSwapView`: run old cleanups (disposes the old
   render effect + unbinds delegated events) → re-run the new setup on the
   **same ctx** inside `untracked()` — `useSignal(key, ...)` reuses the
   preserved signals on `ctx.signals`, so keyed state survives → create a
   fresh render effect (first run re-renders + re-wires handlers).

Plain `signal()` closures are recreated on swap; use `useSignal(key, init)`
for state that must survive hot updates.

Bundler differences (`src/hmr-inject.ts` — important when debugging HMR):

- Vite: `import.meta.hot.accept(cb)` — cb gets the new module.
- Webpack/Rspack: `import.meta.webpackHot.accept(cb)`'s cb is an **error**
  handler, so the snippet uses self-accept + a top-level
  `import.meta.webpackHot.data.oldView` check on re-execution.
- Swap functions are reached via `globalThis.__lark_hmr__` (registered in
  `Framework.boot`) instead of importing `@lark.js/mvc` — importing would
  register the module as an MF shared consumer and cause ChunkLoadError.

## Project scaffolding conventions

```
src/
  boot.ts                     Framework.boot (+ require loader if lazy)
  views/{name}.tsx            view component (default export = defineView(...))
  views/{name}.module.css     CSS module imported by the view
  components/{name}.tsx       child components (imported as JSX tags)
  store/{name}.ts             createStore definitions
index.html                    <div id="app"></div> + module script for boot.ts
```

Route/`registerViewClass` path strings are extension-less and
source-root-relative (`"home"`, `"components/counter"`); imported components
need no path at all.
