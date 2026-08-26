# HMR, Bundler Integrations, Build and Tooling

## larkReactPlugin (Vite)

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { larkReactPlugin } from "@lark.js/react/vite";

export default defineConfig({ plugins: [larkReactPlugin()] });
```

The plugin (`enforce: "pre"`) does two things:

1. **JSX defaults** — patches `esbuild.jsx = "automatic"` and
   `esbuild.jsxImportSource = "@lark.js/react"` unless the user already set
   them (`esbuild: false` and `jsx: "preserve"` are respected). No tsconfig
   or vite tweaking needed for compilation; keep `jsx: "react-jsx"` +
   `jsxImportSource` in tsconfig for editor/tsc type checking.
2. **Component HMR injection** (dev server only; builds skip the rewrite) —
   every non-node_modules `.tsx`/`.jsx` module (query-suffixed ids stripped
   first) goes through the shared injector below; unchanged sources return
   `undefined` (no sourcemap breakage), changed ones `{ code, map: null }`.

`injectComponentHmrSnippet(source)` — the 1-arg Vite flavor — is exported for
direct testing.

## Webpack integration (`@lark.js/react/webpack`)

The JSX transform is the responsibility of your TS/JS loader (babel-loader /
swc-loader / ts-loader) — configure the automatic runtime with
`jsxImportSource: "@lark.js/react"` (tsconfig `"jsx": "react-jsx"`). The
package only adds HMR.

```js
// Plugin (recommended — auto-registers the loader rule):
import { LarkReactPlugin } from "@lark.js/react/webpack";
export default { plugins: [new LarkReactPlugin()] };

// Loader (manual):
export default {
  module: { rules: [{
    test: /\.[jt]sx$/, exclude: /node_modules/, enforce: "pre",
    loader: "@lark.js/react/webpack",
  }]},
};
```

- `new LarkReactPlugin({ test?, exclude? })` — defaults `/\.[jt]sx$/` and
  `/node_modules/`; pushes ONE `enforce: "pre"` rule (so the loader runs
  before ts-loader/SWC/babel, on raw TSX/JSX — the injected snippet is plain
  `import.meta.webpackHot` JS, valid in TS and TSX). `mode: "production"`
  skips the rule entirely; the loader itself also no-ops in production and
  passes sources through on any injection error.
- The plugin resolves the loader path via `__filename` (tsup ESM shim) and
  points at the `.cjs` sibling from ESM output — webpack's loader-runner
  `require()`s loaders.
- `larkReactLoader` is the module's default export.

## The shared injector (`src/hmr-inject.ts`)

Both bundler entries delegate to `injectComponentHmrSnippet(source, bundler)`
(`bundler: "vite" | "webpack"`). Any module with a **line-leading**
`export default` (comment-safe regex; `isLarkComponentSource` is the check)
is rewritten so the old and new default exports can be captured:

- `export default function App() {…}` (or class, incl. `async function`,
  generators) KEEPS its declaration — module-scope references like
  `App.displayName` keep working — and
  `const __lark_react_component__ = App; export default __lark_react_component__;`
  is appended at EOF.
- Any other default export (`export default App`, arrows, calls, `as` casts,
  ternaries) becomes `const __lark_react_component__ = <expr>;` with the
  export appended. No expression scanning — works for any legal statement,
  including JSX text with apostrophes.
- Idempotent: sources already containing `__lark_react_component__` pass
  through (plugin + manual loader rule double-registration is safe). Modules
  without a line-leading default export are untouched — they hot-swap through
  their importers instead.

The appended snippet differs per bundler because the HMR APIs disagree:

| Bundler | Context                  | Pattern                                                                                                                                                                                     |
| ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite    | `import.meta.hot`        | `dispose` stashes the old component; `accept(cb)` — cb IS the success callback — reads `newMod.default` and swaps                                                                           |
| Webpack | `import.meta.webpackHot` | SELF-ACCEPT: `accept()` + `dispose(data)` + a TOP-LEVEL `data.oldComponent` check that runs when the module re-executes; `accept(cb)`'s cb is an ERROR handler (logs + `location.reload()`) |

Putting swap logic inside webpack's `accept(cb)` is the historic bug — it
never runs on success.

Both snippets call
`globalThis.__lark_react_hmr__?.hotSwapByComponent(old, new)` — the global
handle registered ONCE by the package entry (`src/index.ts`), NEVER by
importing `"@lark.js/react"`: under Module Federation any import of a shared
singleton inside an HMR callback registers a shared consumer → ChunkLoadError.

There is no compile-time "is this a component?" marker — the runtime is the
guard: the snippet checks `typeof === "function"` and `hotSwapByComponent`
no-ops on non-functions, so a `.tsx` file default-exporting a config object
simply self-accepts and does nothing.

## How the hot swap preserves state

`hotSwapByComponent(oldFn, newFn)` records `old → new` in a WeakMap alias
chain, latches `hmrActive`, and schedules a re-render of every live root.
That alone preserves state because:

1. the reconciler compares component tags by CANONICAL identity (alias-chain
   resolution), so instances created from stale descriptors — the
   `root.element` captured at boot, a `useMemo`-cached element, a parent
   module still holding the old import — keep matching, and their hooks
   array survives;
2. `renderComponent` always CALLS the canonical (latest) function, so the
   reused instance executes the NEW body against its OLD hook slots.

Properties and limits:

- Ping-pong safe: aliasing `A→B` then `B→A` drops the stale forward edge, so
  chains never cycle.
- Production pays nothing: until the first swap, comparisons are plain `===`.
- Hook-order edits are handled destructively per slot (see
  components-and-hooks.md); same-slot same-tag state survives.
- **Only DEFAULT exports hot-swap.** Named-export or module-internal
  components get fresh function objects on re-eval with no alias, so their
  instances remount (state resets). Keep one component per file, default
  exported, when HMR state retention matters.
- Manual use (custom tooling/tests): `hotSwapByComponent` is a public export
  of `@lark.js/react`; returns `true` when a swap was recorded.

## Package layout and build

```
packages/react/
├── src/                 index.ts  element.ts  hooks.ts  dom.ts  diff.ts
│                        store.ts  router.ts  url-state.ts
│                        hmr.ts  hmr-inject.ts  vite.ts  webpack.ts
│                        jsx-runtime.ts  jsx-dev-runtime.ts
├── tests/               *.test.tsx / *.test.ts + types.test-d.tsx + helpers.ts
├── tsup.config.ts       3 parallel builds → dist (ESM+CJS+d.ts each):
│                        ① src/index.ts
│                        ② src/vite.ts + src/webpack.ts (splitting:false,
│                          shims:true — __filename for the loader path)
│                        ③ src/jsx-runtime.ts + src/jsx-dev-runtime.ts
├── tsconfig.json        editor/typecheck: jsx react-jsx, types [], self
│                        paths → src/*.ts (incl. /webpack), "@/*" → src/*
├── tsconfig.build.json  tsup dts config (rootDir src, types ["node"])
└── vitest.config.ts     jsdom + esbuild automatic JSX + package-name aliases
```

- **Exports map**: `.`, `./vite`, `./webpack`, `./jsx-runtime`,
  `./jsx-dev-runtime`, `./package.json` — each with import/require + types
  conditions matching the tsup output exactly.
- **`sideEffects: ["./dist/index.js", "./dist/index.cjs"]`** — the entry
  registers `globalThis.__lark_react_hmr__` at import time; listing only the
  entry keeps jsx-runtime/vite/webpack tree-shakable while protecting the
  handle.
- **Dependencies**: `@types/react` (regular dependency, types-only — the
  published d.ts imports `"react"` types; consumers never install React).
  `vite` is an optional peer (`^7 || ^8`). Zero runtime dependencies.
- Scripts: `pnpm build` (tsup), `pnpm test` (vitest), `pnpm typecheck`
  (both tsconfigs; `tests/types.test-d.tsx` asserts the type layer via
  `@ts-expect-error` — an unused directive fails the build), `pnpm format`.

## Wiring a new consumer app (checklist)

1. `pnpm add @lark.js/react` (+ `vite` for dev, or your webpack toolchain).
2. Vite: `plugins: [larkReactPlugin()]`. Webpack:
   `plugins: [new LarkReactPlugin()]` + automatic-JSX in the TS/babel loader.
3. tsconfig: `"jsx": "react-jsx"`, `"jsxImportSource": "@lark.js/react"`,
   `"moduleResolution": "bundler"`.
4. Entry: `createRoot(document.getElementById("root")!).render(<App/>)` —
   or, with routing, `createRouter(routes)` first and render
   `<RouterView router={router}/>`.
5. One default-exported component per `.tsx` file for state-preserving HMR.
6. For vitest: copy the `esbuild` + `test.environment: "jsdom"` shape from
   `packages/react/vitest.config.ts` (aliases are only needed when testing
   against workspace sources instead of the installed package).
