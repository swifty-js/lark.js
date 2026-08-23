# Build Integration, Package Exports & Workflow

Source of truth: `src/vite.ts`, `src/webpack.ts`, `src/rspack.ts`,
`src/index.ts`, `package.json`, `vite.config.ts` (dual lib/docs mode).

## Package exports

| Sub-path                 | Exports                                                                                                                                                                                                                                                                    | Context      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `@lark.js/docs`          | Re-exports from lark-mvc (`Framework`, `defineView`, `State`, `Router`, `registerViewClass`, `FrameworkConfig` with routeMode pinned to `"history"`, `ViewCtx`, `ViewSetup`), all DocsConfig/PageData/… types, `slugify`, theme factories + `registerThemeViews` + `icons` | Browser-safe |
| `@lark.js/docs/vite`     | `larkDocsPlugin`, plus build-time re-exports: `defineConfig`, `scanDocsDir`, `generateSidebar`, types                                                                                                                                                                      | Node (build) |
| `@lark.js/docs/webpack`  | `larkDocsLoader` (callback style), `LarkDocsPlugin`, + `scanDocsDir`/`generateSidebar`                                                                                                                                                                                     | Node         |
| `@lark.js/docs/rspack`   | `larkDocsLoader` (Promise style), `LarkDocsPlugin`, + same re-exports                                                                                                                                                                                                      | Node         |
| `@lark.js/docs/compiler` | `compileMarkdown`, `CompileMarkdownOptions`                                                                                                                                                                                                                                | Node         |
| `@lark.js/docs/runtime`  | `slugify` only (zero build deps)                                                                                                                                                                                                                                           | Browser-safe |
| `@lark.js/docs/theme`    | `registerThemeViews` (registers `theme/docs-layout` + `theme/toc-inline`), 5 `create*View` factories (LarkView components), `icons`, `renderMermaidBlocks`                                                                                                                 | Browser      |
| `@lark.js/docs/client`   | Types only: `declare module "@lark-docs/generated"`                                                                                                                                                                                                                        | d.ts         |
| `@lark.js/docs/client.css` | Packaged theme stylesheet — `@import`s tailwindcss + typography and `@source`-scans `dist/theme-chunk.js`                                                                                                                                                                | CSS          |

Import `defineConfig` from `/vite` (or `/webpack`, `/rspack`) rather than the
main entry in Node contexts — the main entry pulls in lucide `?raw` SVG
imports that fail outside a bundler.

Deps: markdown-it (+container), js-yaml, shiki, minisearch, ejs,
lucide-static, zod, `@lark.js/mvc` (re-exported — consumers don't install
it separately). Peer: tailwindcss v4, @tailwindcss/typography.

## Vite

```ts
import { larkDocsPlugin } from "@lark.js/docs/vite";
// options: { config: DocsConfig }
plugins: [larkDocsPlugin({ config: docsConfig })];
```

Returns **an array of plugins**: `lark-docs` (enforce pre; `resolveId`
tags `.md` imports with `?lark-docs` — node_modules markdown is skipped;
`load` reads + `compileMarkdown`s) plus the embedded `larkMvcPlugin` (oxc
JSX defaults + auto view HMR). Do **not** add `larkMvcPlugin` separately.
Editing an existing `.md` hot-reloads through the normal Vite pipeline;
adding/renaming files requires re-running `defineConfig` (dev-server
restart).

## Webpack / Rspack

```ts
import { LarkDocsPlugin } from "@lark.js/docs/webpack"; // or /rspack
plugins: [new LarkDocsPlugin({ config: docsConfig })];
// options: { config, test? (default /\.md$/), exclude? (default /node_modules/) }
```

The plugin pushes a `.md` loader rule referencing itself via `__filename`
(ESM shim injected at build). Loader difference: webpack uses
`this.callback()`, rspack returns the Promise. You still need lark-mvc's
`LarkMvcPlugin` (from `@lark.js/mvc/webpack|rspack`) for view HMR in these
bundlers (JSX comes from your TS/SWC loader) — only the Vite plugin bundles
both.

## Required project wiring (any bundler)

```
project/
  lark-docs.config.ts     defineConfig(...) — side-effect generates module
  docs/**/*.md             content
  app/index.html           <div id="app"> + no-FOUC dark-mode script
  app/boot.ts              registerThemeViews → State.set → Framework.boot
  app/main.css             @import "@lark.js/docs/client.css" (self-contained)
  shims.d.ts               /// <reference types="@lark.js/docs/client" />
  .lark-docs/generated/   generated (gitignore)
```

- Bundler alias: `"@lark-docs/generated" → resolve(root, ".lark-docs/generated")`.
- tsconfig `paths`: `"@lark-docs/generated/*": ["./.lark-docs/generated/*"]`.
- Use `/// <reference types="..." />` (module resolution), not
  `/// <reference path="..." />` — the latter breaks with pnpm symlinks.

## compileMarkdown (programmatic)

```ts
import { compileMarkdown } from "@lark.js/docs/compiler";
const js = await compileMarkdown(source, {
  config,               // DocsConfig (markdown/highlight options used)
  filePath,             // absolute or docs-relative path of the .md
  projectRoot?: string, // for resolving config.docs → relativePath
});
// → "export const pageData = {...};\nexport const contentHtml = \"...\";"
```

Async because of lazy Shiki init (WASM + grammars, cached per
theme+darkTheme+languages key). `resetHighlighter()` clears the cache in
tests.

## Dev / build / test workflow (this repo)

| Command           | Effect                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`        | `vite --mode docs` — dev server for the docs app in `app/`                                                                        |
| `pnpm build`      | `vite build --mode lib` — library dist (7 entries, ESM+CJS+dts; copies `file-content.ejs`, `client.css`, `client.d.ts` into dist) |
| `pnpm build:docs` | `vite build --mode docs` — static site into `dist-docs/` (with PWA/workbox)                                                       |
| `pnpm preview`    | preview the built docs site                                                                                                       |
| `pnpm test`       | vitest (compiler/scanner/sidebar/frontmatter/parser/renderer/slugify suites)                                                      |
| `pnpm typecheck`  | `tsc -p tsconfig.build.json --noEmit`                                                                                             |

The repo's own `vite.config.ts` is the reference for advanced setups: dual
lib/docs modes,
CJS `__filename` shims for the self-referencing loaders, and dev aliases
(`@lark.js/docs → src`, `@lark.js/mvc → ../lark-mvc/dist`).

Deployment: `history`-mode SPA — serve `dist-docs/` with a fallback rewrite
of all paths to `index.html`. `baseUrl` is a route prefix inside the SPA;
Vite's `base` stays `/` unless the whole site is hosted under a subpath.
