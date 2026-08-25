# HMR, Vite Plugin, Build and Tooling

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
   every non-node_modules `.tsx`/`.jsx` module with a line-leading
   `export default` is rewritten so the old and new default exports can be
   captured, then self-accepts:
   - `export default function App() {…}` keeps its declaration (module-scope
     references like `App.displayName` keep working); the export moves to a
     `const __lark_react_component__ = App; export default __lark_react_component__;`
     tail.
   - Any other default export (`export default App`, arrows, calls) becomes
     `const __lark_react_component__ = <expr>;` with the export appended.
   - The snippet stores the old component in `import.meta.hot.dispose` data
     and, in `accept`, calls
     `globalThis.__lark_react_hmr__?.hotSwapByComponent(old, new)` — through
     the global handle registered once by the package entry, NEVER by
     importing `"@lark.js/react"` (under Module Federation an import inside
     an HMR callback registers a shared consumer → ChunkLoadError).
   - Idempotent (sources already containing `__lark_react_component__` pass
     through), returns `{ code, map: null }`.

   `injectComponentHmrSnippet(source)` is exported for direct testing.

There is no compile-time "is this a component?" marker — the runtime is the
guard: `hotSwapByComponent` no-ops on non-functions, so a `.tsx` file
default-exporting a config object simply self-accepts and does nothing.

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
├── lib/                 index.ts  element.ts  hooks.ts  dom.ts  diff.ts
│                        hmr.ts  jsx-runtime.ts  jsx-dev-runtime.ts  vite.ts
├── tests/               *.test.tsx / *.test.ts + types.test-d.tsx + helpers.ts
├── tsup.config.ts       3 parallel builds → dist (ESM+CJS+d.ts each):
│                        ① lib/index.ts  ② lib/vite.ts (splitting:false)
│                        ③ lib/jsx-runtime.ts + lib/jsx-dev-runtime.ts
├── tsconfig.json        editor/typecheck: jsx react-jsx, self paths → lib/*.ts
├── tsconfig.build.json  tsup dts config (rootDir lib)
└── vitest.config.ts     jsdom + esbuild automatic JSX + package-name aliases
```

- **Exports map**: `.`, `./vite`, `./jsx-runtime`, `./jsx-dev-runtime`,
  `./package.json` — each with import/require + types conditions matching
  the tsup output exactly. There is no `./webpack` entry.
- **`sideEffects: ["./dist/index.js", "./dist/index.cjs"]`** — the entry
  registers `globalThis.__lark_react_hmr__` at import time; listing only the
  entry keeps jsx-runtime/vite tree-shakable while protecting the handle.
- **Dependencies**: `@types/react` (regular dependency, types-only — the
  published d.ts imports `"react"` types; consumers never install React).
  `vite` is an optional peer. Zero runtime dependencies.
- Scripts: `pnpm build` (tsup), `pnpm test` (vitest), `pnpm typecheck`
  (both tsconfigs; `tests/types.test-d.tsx` asserts the type layer via
  `@ts-expect-error` — an unused directive fails the build), `pnpm format`.

## Wiring a new consumer app (checklist)

1. `pnpm add @lark.js/react` (+ `vite` for dev).
2. vite.config.ts: `plugins: [larkReactPlugin()]`.
3. tsconfig: `"jsx": "react-jsx"`, `"jsxImportSource": "@lark.js/react"`,
   `"moduleResolution": "bundler"`.
4. Entry: `createRoot(document.getElementById("root")!).render(<App/>)`.
5. One default-exported component per `.tsx` file for state-preserving HMR.
6. For vitest: copy the `esbuild` + `test.environment: "jsdom"` shape from
   `packages/react/vitest.config.ts` (aliases are only needed when testing
   against workspace sources instead of the installed package).
