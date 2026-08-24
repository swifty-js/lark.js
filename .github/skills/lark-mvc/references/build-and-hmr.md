# Build Integration, Config, HMR

Source of truth: `src/vite.ts`, `src/webpack.ts`, `src/rspack.ts`,
`src/hmr-inject.ts`, `src/hmr.ts`, `src/framework.ts`, `src/module-loader.ts`,
`src/component-registry.ts`.

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
`*.css` module imports and the HMR globals type-check.

## Bundler plugins

There is no template compilation — JSX goes through the standard automatic
runtime. The plugins do two things: JSX transform defaults (Vite only) and
auto-injected component HMR.

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
- Injects component HMR into every `.tsx`/`.jsx` module with a line-leading
  `export default` (runtime guards make non-component exports a no-op).

> `file:`-linked lark-mvc? Vite's dep pre-bundle cache is keyed by the
> lockfile, not dep contents — after rebuilding lark-mvc run `vite --force`
> (or delete `node_modules/.vite`).

### Webpack / Rspack — plugin form (recommended, zero config)

```ts
import { LarkMvcPlugin } from "@lark.js/mvc/webpack"; // or /rspack
export default {
  plugins: [new LarkMvcPlugin()],
};
// Options: { test? (default /\.[jt]sx$/), exclude? (default /node_modules/) }
```

The plugin registers one `enforce: "pre"` rule that injects component HMR
before SWC/ts-loader/babel. The JSX transform itself comes from your
existing TS/SWC/Babel loader reading the tsconfig above. Manual loader form:
`{ test: /\.[jt]sx$/, exclude: /node_modules/, enforce: "pre", loader: "@lark.js/mvc/webpack" }`.

## FrameworkConfig (complete)

| Key             | Type                                                      | Default                     | Description                                                       |
| ---------------- | ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `rootId`        | `string`                                                   | `"root"`                    | Root container id; route components render inside it              |
| `routeMode`     | `"history" \| "hash"`                                      | `"history"`                 | Routing mode                                                      |
| `defaultView`   | `string \| Component`                                      | —                           | Component rendered when URL matches no route                      |
| `defaultPath`   | `string`                                                   | `"/"`                       | Path assumed when URL is empty                                    |
| `routes`        | `Record<string, string \| Component \| RouteViewConfig>`   | —                           | `{"/home": HomeView}` or `{view, ...extras merged into Location}` |
| `unmatchedView` | `string \| Component`                                      | —                           | 404 component                                                     |
| `hashbang`      | `string`                                                   | `"#!"`                      | Hash prefix (hash mode)                                           |
| `rewrite`       | `(path, params, routes) => string`                         | —                           | Path rewriting before route lookup                                |
| `error`         | `(e: Error) => void`                                       | —                           | Global error sink — render-pass errors route here too             |
| `require`       | `(names, params?) => Promise<unknown[]>`                   | dynamic `import()` fallback | Async component loader — the Module Federation hook               |

`boot()` normalizes function-component entries to internal registry-name
strings (`ensureComponentName`), so Router internals stay string-based.

Route dispatch: every confirmed navigation resolves `Router.parse().view`
and `render()`s the matched component into the root container with the
current URL params as props. Same component → same instance (state
survives); async loads are guarded by a navigation token so a stale load
never overwrites a newer route.

`Framework.getConfig()` / `getConfig(key)` reads, `setConfig(patch)` merges.
Other `Framework` utilities: `toUri(path, params, keepEmpty?)`,
`parseUri(url)`, `use(names, cb?)`, `delay(ms)`, `generateId(prefix?)`,
`ensureNodeId(el)`, `nodeInside(a, b)`, `dispatchEvent(target, type, init?)`,
`createCache`, `createEmitter`, `isBooted()`.
Removed: `Framework.mark/unmark`, `waitZoneViewsRendered`, `Framework.task`,
`Framework.defineView`, `Framework.Frame`.

## Lazy component loading

When route dispatch hits an unregistered path it calls `use(path)` →
`config.require`. Without `require`, a raw dynamic `import()` fallback is
used. Components used as **imported JSX tags need no registration** —
registration only matters for string paths (routes, lazy loaders):

```ts
import { registerComponent } from "@lark.js/mvc";

const COMPONENT_MODULES: Record<string, () => Promise<unknown>> = {
  home: () => import("./views/home").then((m) => m.default),
  admin: () => import("./views/admin").then((m) => m.default),
};

Framework.boot({
  routes: { "/home": "home", "/admin": "admin" },
  require: async (names) =>
    Promise.all(names.map((name) => COMPONENT_MODULES[name]?.())),
});
```

For Module Federation, `require` branches on the path prefix and imports
from the remote (`import("remote_app/" + rest)`). Share `@lark.js/mvc` as a
singleton in the MF `shared` config.

## HMR (auto-injected — never hand-write it)

On module update, the module's default export (rewritten to
`const __lark_component__ = ...`) self-accepts →
`globalThis.__lark_hmr__.hotSwapByComponent(old, new)`:

1. `aliasComponent(old, new)` — parents holding the stale import keep
   matching live instances (the reconciler compares CANONICAL identities
   through the alias chain), and string routes keep resolving.
2. Registry entries pointing at the old function are swapped.
3. Every live instance of the old function swaps in place
   (`swapInstanceFn`): **`useSignal`/`useRef` slots survive**; closure-bound
   slots (useEffect/useSignalEffect/useComputed/useMemo/useQuery) are
   disposed and recreated by the next render — old effects clean up, new
   effects run against the swapped DOM. The instance re-renders via its
   invalidate signal.

Because the gate is broad (any `.tsx`/`.jsx` default export), the runtime
guards carry the filtering: the snippet checks `typeof === "function"`, and
`hotSwapByComponent` no-ops for values with no live instances — a `.tsx`
file default-exporting a config object self-accepts harmlessly.

Bundler differences (`src/hmr-inject.ts` — important when debugging HMR):

- Vite: `import.meta.hot.accept(cb)` — cb gets the new module.
- Webpack/Rspack: `import.meta.webpackHot.accept(cb)`'s cb is an **error**
  handler, so the snippet uses self-accept + a top-level
  `import.meta.webpackHot.data.oldComponent` check on re-execution.
- Swap functions are reached via `globalThis.__lark_hmr__` (registered by
  `src/hmr.ts` module load and again in `Framework.boot`) instead of
  importing `@lark.js/mvc` — importing would register the module as an MF
  shared consumer and cause ChunkLoadError.

## Project scaffolding conventions

```
src/
  boot.ts                     Framework.boot (+ require loader if lazy)
                              — or main.ts with render(<App/>, el) for
                              router-less apps
  views/{name}.tsx            route components (default export = function)
  views/{name}.module.css     CSS module imported by the component
  components/{name}.tsx       child components (imported as JSX tags)
  store/{name}.ts             createStore definitions
index.html                    <div id="app"></div> + module script for boot.ts
```

Route/`registerComponent` path strings are extension-less and
source-root-relative (`"home"`, `"views/admin"`); imported components need
no path at all.
