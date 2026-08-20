# Build Integration, Config, HMR & Devtool

Source of truth: `src/vite.ts`, `src/webpack.ts`, `src/rspack.ts`,
`src/hmr-inject.ts`, `src/hmr.md`, `src/framework.ts`, `src/module-loader.ts`,
`src/devtool.ts`, plus `packages/lark-demo` for the reference setup.

## Bundler plugins

### Vite

```ts
// vite.config.ts
import { larkMvcPlugin } from "@lark.js/lark-mvc/vite";
export default defineConfig({
  plugins: [larkMvcPlugin()],
});
```

Plugin name `"lark-template"`, `enforce: "pre"`. It resolves `.html` imports
(suffix `?lark-template`), compiles via `compileTemplate` with auto
`extractGlobalVars`, appends the template HMR snippet, and a `transform` hook
injects view HMR into any `.ts/.js` file that imports a `.html`.

### Webpack / Rspack — plugin form (recommended, zero config)

```ts
import { LarkMvcPlugin } from "@lark.js/lark-mvc/webpack"; // or /rspack
export default {
  plugins: [new LarkMvcPlugin()],
};
// Options: { test? (default /\.html$/), exclude? (default /node_modules/) }
```

The plugin auto-registers two rules: `.html` → loader with
`type: "javascript/auto"` (required for `import.meta.webpackHot`), and a
`enforce: "pre"` rule on `.ts/.js` that injects view HMR before SWC/ts-loader.

### Loader form (manual)

```ts
module.exports = {
  module: {
    rules: [
      {
        test: /\.html$/,
        loader: "@lark.js/lark-mvc/webpack", // or "@lark.js/lark-mvc/rspack"
      },
    ],
  },
};
```

TypeScript: add `"@lark.js/lark-mvc/client"` to `types` (or a triple-slash
reference) so `*.html` / `*.css` imports type-check.

## FrameworkConfig (complete)

| Key                | Type                                        | Default                     | Description                                                     |
| ------------------ | ------------------------------------------- | --------------------------- | --------------------------------------------------------------- |
| `rootId`           | `string`                                    | `"root"`                    | Root DOM element id; root view renders inside it                |
| `routeMode`        | `"history" \| "hash"`                       | `"history"`                 | Routing mode                                                    |
| `defaultView`      | `string`                                    | —                           | View mounted when URL matches no route                          |
| `defaultPath`      | `string`                                    | `"/"`                       | Path assumed when URL is empty; also root-"/" fallback          |
| `routes`           | `Record<string, string \| RouteViewConfig>` | —                           | `{"/home": "home"}` or `{view, ...extras merged into Location}` |
| `unmatchedView`    | `string`                                    | —                           | 404 view path                                                   |
| `hashbang`         | `string`                                    | `"#!"`                      | Hash prefix (hash mode)                                         |
| `rewrite`          | `(path, params, routes) => string`          | —                           | Path rewriting before route lookup                              |
| `error`            | `(e: Error) => void`                        | rethrow                     | Global error hook (do not rethrow inside)                       |
| `require`          | `(names, params?) => Promise<unknown[]>`    | dynamic `import()` fallback | Async view loader — the Module Federation / chunk-split hook    |
| `extensions`       | `string[]`                                  | —                           | Extension view paths loaded at startup                          |
| `initModule`       | `string`                                    | —                           | Init module loaded at startup                                   |
| `projectName`      | `string`                                    | —                           | Micro-frontend bridge: local vs remote view paths               |
| `devtool`          | `boolean`                                   | `false`                     | Install Frame Devtool Bridge (postMessage)                      |
| `skipViewRendered` | `boolean`                                   | —                           | Skip rendered checks                                            |

`Framework.getConfig()` / `getConfig(key)` reads, `setConfig(patch)` merges.
Other `Framework` utilities: `toUri(path, params, keepEmpty?)`,
`parseUri(url)`, `use(names, cb?)`, `delay(ms)`, `task(fn, args?, ctx?)`
(chunked background execution), `mark(host, key)` / `unmark(host)` (async
validity tokens), `generateId(prefix?)`, `ensureNodeId(el)`,
`nodeInside(a, b)`, `dispatchEvent(target, type, init?)`,
`waitZoneViewsRendered(viewId, timeout?)`, `isBooted()`.

## Lazy view loading (chunk-split pattern from lark-demo)

When `mountView` hits an unregistered path it calls `use(path)` →
`config.require`. Without `require`, a raw dynamic `import()` fallback is
used. The demo pattern — explicit loader map + child-view preloading:

```ts
const VIEW_MODULES: Record<string, () => Promise<unknown>> = {
  home: () => import("./views/home").then((m) => m.default),
  "components/counter-store": () =>
    import("./components/counter-store").then((m) => m.default),
  // ...
};
// Children referenced by v-lark must be registered BEFORE mountZone runs:
const VIEW_DEPS: Record<string, string[]> = {
  counter: ["components/counter-store", "components/counter-updater"],
};

Framework.boot({
  // ...,
  require: async (names) => {
    const preload = names
      .flatMap((n) => VIEW_DEPS[n] ?? [])
      .filter((d, i, a) => !names.includes(d) && a.indexOf(d) === i);
    const all = await Promise.all(
      [...names, ...preload].map(async (name) => {
        const mod = await VIEW_MODULES[name]?.();
        if (preload.includes(name) && typeof mod === "function") {
          registerViewClass(name, mod as ViewSetup); // preloaded deps: register now
        }
        return { name, mod };
      }),
    );
    return all.filter((r) => names.includes(r.name)).map((r) => r.mod);
  },
});
```

For Module Federation, `require` branches on the path prefix and imports
from the remote (`import("remote_app/" + rest)`). Share `@lark.js/lark-mvc` as a
singleton in the MF `shared` config.

## HMR (auto-injected — never hand-write it)

Two layers, both preserving `updater.data`, resources, emitter, id, owner:

1. **Template layer** (`.html` change): compiled module self-accepts →
   `globalThis.__lark_hmr__.hotSwapByTemplate(old, new)` replaces the
   template on every mounted view using it and `forceDigest()`s.
2. **View layer** (`.ts` change): `export default defineView(...)` is
   rewritten to `const __lark_view__ = ...` → self-accept →
   `hotSwapByView(old, new)` updates the registry and re-runs the new setup
   against each existing ctx (old cleanups run, events re-registered).

Bundler differences (`src/hmr-inject.ts` — important when debugging HMR):

- Vite: `import.meta.hot.accept(cb)` — cb gets the new module.
- Webpack/Rspack: `import.meta.webpackHot.accept(cb)`'s cb is an **error**
  handler, so the snippet uses self-accept + a top-level
  `import.meta.webpackHot.data.oldTemplate/oldView` check on re-execution.
- Swap functions are reached via `globalThis.__lark_hmr__` (registered in
  `Framework.boot`) instead of importing `@lark.js/lark-mvc` — importing would
  register the module as an MF shared consumer and cause ChunkLoadError.

## Devtool bridge

`Framework.boot({ devtool: true })` installs a `postMessage` listener
(`installFrameDevtoolBridge` from `@lark.js/lark-mvc/devtool`). Protocol:
`LARK_DEVTOOL_PING` → `PONG`; `REQUEST_TREE` → `TREE` (serialized frame tree
with per-view info: rendered flag, signature, observed keys, event keys,
resource keys, updater snapshot); `TREE_DELTA` pushed on frame add/remove
(deduped via JSON compare, only when embedded in an iframe). The
`packages/lark-devtool` panel loads the target app in an iframe and consumes
this protocol.

## Project scaffolding conventions

```
src/
  boot.ts                     Framework.boot + require loader
  views/{name}.ts             view logic (default export = defineView(...))
  views/{name}.html           paired template
  views/{name}.module.css     CSS module → exposed via ctx.updater.set({ styles })
  components/{name}.{ts,html,module.css}   child views for v-lark
  store/{name}.ts             createStore definitions
index.html                    <div id="app"></div> + module script for boot.ts
```

View paths are extension-less, source-root-relative (`"home"`,
`"components/counter-store"`) — the same string is used in `routes`,
`v-lark`, `registerViewClass`, and the `require` loader map.
