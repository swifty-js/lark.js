---
name: lark-docs
description: >-
  Authoritative reference for @lark.js/lark-docs (v0.0.1), the documentation site
  generator built on the Lark Mvc framework, located at packages/lark-docs
  — analogous to VitePress for Vue or Docusaurus for React. Covers
  defineConfig() in lark-docs.config.ts, the generated
  .lark-docs/generated module (@lark-docs/generated alias: routes,
  docsConfig, loadContent, getSearchIndex), the markdown compilation pipeline
  (compileMarkdown, YAML frontmatter, markdown-it plugins, Shiki dual-theme
  highlighting, ::: tip/warning/danger/details containers, [[toc]], heading
  anchors/slugify), file-based routing (scanDocsDir, virtual index routes,
  generateSidebar, sidebar_position all-or-nothing sorting), bundler
  integration (larkDocsPlugin for Vite, LarkDocsPlugin/larkDocsLoader for
  Webpack/Rspack), the theme system (registerThemeViews, theme/docs-layout,
  theme/sidebar, theme/toc, theme/search with MiniSearch ⌘K palette,
  theme/theme-toggle with lark-docs-theme localStorage key), Tailwind CSS v4
  semantic-token theming with .dark mode, and the app boot pattern
  (State.set({docsConfig, loadContent, getSearchIndex}) + Framework.boot).
  Use this skill whenever the user reads, writes, debugs, reviews, or extends
  code under packages/lark-docs, imports from "@lark.js/lark-docs" or any
  sub-path (/vite, /webpack, /rspack, /compiler, /runtime, /theme, /client),
  edits lark-docs.config.ts, works with the @lark-docs/generated virtual
  module, writes or restructures markdown docs under a docs/ directory served
  by this generator (frontmatter fields title/description/sidebar_position/
  sidebar_label/draft), customizes the docs theme/search/dark-mode, or asks to
  "set up a docs site", "add a docs page", "fix the sidebar/TOC/search" in a
  Lark project. Do NOT use for VitePress/Docusaurus/Rspress sites or for
  general Lark Mvc app work unrelated to documentation (use the lark-mvc
  skill for framework APIs).
---

# Lark Docs (`@lark.js/lark-docs`)

Documentation site generator for `@lark.js/lark-mvc` — what VitePress is to Vue,
this is to Lark Mvc. Source: `packages/lark-docs` (v0.0.1, ESM+CJS dual
build via Vite lib mode). It turns a `docs/` directory of markdown into an
SPA: one persistent layout view, per-page compiled `.md` modules loaded on
navigation, auto-generated sidebar, MiniSearch command palette, Shiki
highlighting, dark mode.

> The package README predates some refactors. **Trust the source**: `search`
> is a plain `boolean` (MiniSearch only — no "docsearch" provider), there are
> **five** theme views (including `theme/theme-toggle`), styling is Tailwind
> CSS v4 with shadcn-style CSS variables (no DaisyUI), and `DocsConfig` has no
> `routeMode`/`lang` fields.

## Three-phase architecture

```
Phase 1 · Config (lark-docs.config.ts loads)
  defineConfig(cfg) → scanDocsDir() → generateSidebar()
  → writes .lark-docs/generated/index.js   (gitignore it)
     exports: loadContent(path), routes, docsConfig, getSearchIndex()

Phase 2 · Compile (bundler plugin, per .md import)
  larkDocsPlugin / LarkDocsPlugin → compileMarkdown()
  frontmatter → markdown-it (anchors, [[toc]], containers, code blocks)
  → Shiki highlight → JS module: export { pageData, contentHtml }

Phase 3 · Runtime (browser)
  registerThemeViews() → State.set({docsConfig, loadContent, getSearchIndex})
  → Framework.boot({ routes, defaultView: "theme/docs-layout" })
  docs-layout stays mounted; observeLocation → loadContent(path) → render
```

## Quick start (canonical consumer setup)

```ts
// lark-docs.config.ts
import { defineConfig } from "@lark.js/lark-docs/vite";
export default defineConfig({
  docs: "docs", // source dir, relative to project root
  baseUrl: "/docs/", // route prefix
  title: "My Library",
  description: "Docs for My Library",
  nav: [{ text: "Guide", link: "/guide/" }], // baseUrl auto-prefixed
  sidebar: { "/guide/": "auto" }, // per-prefix: "auto" | SidebarItem[]
  highlight: { theme: "github-light", darkTheme: "github-dark" },
  search: true, // boolean — MiniSearch palette
});
```

```ts
// vite.config.ts — larkDocsPlugin handles BOTH .md and .html compilation
import { larkDocsPlugin } from "@lark.js/lark-docs/vite";
import tailwindcss from "@tailwindcss/vite";
import docsConfig from "./lark-docs.config";
export default defineConfig({
  plugins: [larkDocsPlugin({ config: docsConfig, vdom: false }), tailwindcss()],
  resolve: {
    alias: {
      "@lark-docs/generated": resolve(__dirname, ".lark-docs/generated"),
    },
  },
});
```

```ts
// app/boot.ts — exact order matters
import {
  Framework,
  State,
  registerThemeViews,
  type FrameworkConfig,
} from "@lark.js/lark-docs";
import {
  routes,
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@lark-docs/generated";
import "./main.css";

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "history", // FrameworkConfig type pins this to "history"
  routes,
  vdom: false,
  defaultPath: "/docs/",
  defaultView: "theme/docs-layout",
  unmatchedView: "theme/docs-layout", // layout renders its own 404 state
};
registerThemeViews({ vdom: config.vdom }); // BEFORE boot
State.set({ docsConfig, loadContent, getSearchIndex });
Framework.boot(config);
```

```css
/* app/main.css */
@import "tailwindcss";
/* client.css ships in the package dist but is NOT in the exports map — 
   reference it by file path: */
@import "../node_modules/@lark.js/lark-docs/dist/client.css";
/* let Tailwind see the theme templates' utility classes: */
@source "../node_modules/@lark.js/lark-docs/dist/theme.js";
```

```ts
// shims.d.ts
/// <reference types="@lark.js/lark-docs/client" />
```

`index.html` needs `<div id="app"></div>` plus the no-FOUC dark-mode snippet
(read `localStorage["lark-docs-theme"]`, add `.dark` to `<html>` before
first paint — copy from `packages/lark-docs/app/index.html`).

## Critical rules

1. **`registerThemeViews()` before `Framework.boot()`**, and pass the same
   `vdom` flag — templates are pre-compiled in both string and VDOM modes;
   this call just selects one.
2. **`defineConfig` has side effects**: importing the config scans `docs/`
   and rewrites `.lark-docs/generated/index.js`. New/renamed `.md` files
   need the dev server restarted (config re-evaluated) to appear in routes.
3. **Routes have no trailing slashes** (`/docs/guide`, not `/docs/guide/`);
   `index.md` maps to its directory path; dirs without `index.md` get a
   virtual index route pointing at their first page (excluded from sidebar
   and search).
4. **Sidebar sorting is all-or-nothing**: `sidebar_position` only applies if
   EVERY page in the group has it; otherwise everything sorts by filename —
   hence the `01-`, `02-` filename prefix convention.
5. **The runtime contract is `State`**: theme views read
   `docsConfig`/`loadContent`/`getSearchIndex` and communicate via
   `searchOpen`, `drawerOpen`, `currentPageHeadings`, `currentPageTitle`
   State keys. Custom theme views should use the same channel.
6. **Title chain**: frontmatter `title` → first `# h1` (code fences ignored)
   → filename-derived (`index.md` → parent dir name; root → "Home").
7. Internal markdown links start with `/` (full path incl. baseUrl) or `#` —
   they get `lark-docs-nav` for SPA navigation; anything else opens in a new
   tab. `${...}` in content is preserved literally (JSON-escaped, not
   interpolated).
8. Files/dirs starting with `_` or `.` are never scanned; `draft: true` pages
   are dropped when `excludeDrafts` is enabled.

## Reference files — read on demand

| File                                                                 | Read when working on                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [references/configuration.md](references/configuration.md)           | `DocsConfig` (full field table), `defineConfig` behavior, scanner/routing rules, sidebar generation, the generated module's exact API |
| [references/markdown-authoring.md](references/markdown-authoring.md) | Writing docs: frontmatter fields, containers, `[[toc]]`, code fences/Shiki, links, anchors/slugify rules, page conventions            |
| [references/theme-runtime.md](references/theme-runtime.md)           | The 5 theme views + State contract, search internals (MiniSearch), dark mode/theming (CSS tokens), overriding theme views             |
| [references/build-integration.md](references/build-integration.md)   | Package exports, Vite/Webpack/Rspack plugins, `compileMarkdown` API, project setup (aliases/shims), dev/build/deploy workflow         |

Reference implementation: this repo's own docs site — config at
`packages/lark-docs/lark-docs.config.ts` (multi-product: `/lark-mvc/`,
`/lark-docs/`, each with `"auto"` sidebar), boot at
`packages/lark-docs/app/boot.ts`, real markdown under
`packages/lark-docs/docs/`. Framework-level APIs (defineView, ViewCtx,
Router, State) are covered by the **lark-mvc** skill.
