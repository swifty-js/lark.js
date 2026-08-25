# Build Integration & HMR (`@lark.js/larky`)

## Vite (recommended)

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { larkyPlugin } from "@lark.js/larky/vite";

export default defineConfig({ plugins: [larkyPlugin()] });
```

The plugin (name `"larky"`, `enforce: "pre"`) does two things:

1. **JSX defaults** — configures Vite's oxc transform to the automatic
   runtime with `jsxImportSource: "@lark.js/larky"` unless the user already
   set one (`oxc: false` and `jsx: "preserve"` are respected).
2. **Component HMR injection** (dev only) — every `.tsx`/`.jsx` module with
   a line-leading `export default` self-accepts and hot-swaps on edit.

## Webpack

```js
import { LarkyPlugin } from "@lark.js/larky/webpack";
export default { plugins: [new LarkyPlugin()] }; // recommended
// or manual loader rule: { test: /\.[jt]sx$/, exclude: /node_modules/,
//   enforce: "pre", loader: "@lark.js/larky/webpack" }
```

The JSX transform stays with your TS/SWC/babel loader — configure
`"jsx": "react-jsx", "jsxImportSource": "@lark.js/larky"` in tsconfig.
Production mode skips the HMR rule entirely.

tsconfig for non-Vite projects can reference the ambient types:
`/// <reference types="@lark.js/larky/client" />` (`*.css` modules,
`__larky_hmr__`, `import.meta.webpackHot`). Vite projects use
`vite/client` instead — never both.

## HMR internals (state-preserving)

- The injected snippet rewrites `export default <expr>` into
  `const __larky_component__ = <expr>` + re-export, captures the old
  reference on dispose, and on update calls
  `globalThis.__larky_hmr__.hotSwapByComponent(old, next)`.
- The global handle (NOT an import) is deliberate: under Module Federation
  an import of the shared singleton inside an HMR callback registers a
  shared consumer → webpack expects a main-chunk hot-update it never emits
  → ChunkLoadError. `globalThis` sidesteps module resolution. It is
  registered ONCE at the package entry (`src/index.ts`).
- `hotSwapByComponent(old, next)`:
  1. `aliasComponent(old, next)` — parents/route tables holding the STALE
     reference keep matching (the reconciler canonicalizes tags through the
     alias chain at normalize time).
  2. Every live instance swaps its function in place: `useSignal`/`useRef`
     slots (marked `keep`) SURVIVE; closure-bound slots (`useComputed`,
     `useSignalEffect`, `useEffect`, `onCleanup`) are disposed and
     recreated by the next render (no stale closures). Instances re-render
     via their `invalidate` signal — microtask-batched, one flush.
- Runtime-guarded: non-function exports and functions with no live
  instances no-op, so the broad injection gate (any default export) is safe.
- Known limit: keep slots pair by CALL ORDER (no signature hashing) — an
  edit that reorders `useSignal`/`useRef` calls can hand old state to a
  different hook.
- Cross-bundler asymmetry (the reason for two snippets): Vite's
  `accept(cb)` runs cb on SUCCESS with the new module; webpack's
  `accept(cb)` cb is an ERROR handler — webpack uses self-accept +
  `dispose(data)` + a top-level `webpackHot.data` check on re-execution.

## Lazy routes / code splitting

```ts
{ path: "/admin", lazy: () => import("./views/admin") }
```

Resolved on first match (default or module-as-component), deduped while in
flight, cached on the route object; failures propagate as unhandled
rejections. Under Module Federation, share `@lark.js/larky` as a singleton
(the active-router pointer and HMR registry are per-copy).

## Package build & typecheck conventions (packages/larky)

- `pnpm build` = `tsup && tsc -p tsconfig.dist.json` — ESM+CJS dual build,
  6 entries, `client.d.ts` copied on process exit; the trailing step is the
  **consumer-view dist typecheck**.
- `pnpm typecheck` = dev tsconfig (src + tests, `@ts-expect-error`
  assertions enforced) + build tsconfig.
- `pnpm typecheck:dist` = `tests-dist/smoke.tsx` compiled with `paths`
  mapping `@lark.js/larky` → `./dist/*.d.ts`. This catches
  **d.ts-flattening regressions** that src-path checking cannot (e.g. the
  historical `JSX.IntrinsicElements extends JSX.IntrinsicElements`
  self-reference that emptied the tag table for consumers). Keep this step
  green whenever touching `dom-types.ts`, `jsx-runtime.ts`, or tsup config.
- Tests: vitest + jsdom; `await nextTick()` after writes; `stripAnchors()`
  helper removes `<!---->` end-anchors from innerHTML snapshots.

## Scaffolding conventions

```
src/
├── main.tsx          // render(<RouterView router={createRouter(...)}/>, el)
├── views/            // route components (default exports → HMR-swappable)
├── components/       // shared FCs
└── stores/           // createStore modules (anonymous, export the api)
```

Route components should be DEFAULT exports of `.tsx` files — the HMR gate
targets line-leading `export default`. Named-export factory modules
hot-swap through their importers instead.
