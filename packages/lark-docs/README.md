# @lark.js/docs

Documentation site generator for `@lark.js/mvc`.

If `@lark.js/mvc` is to React or Vue, then `@lark.js/docs` is to Docusaurus or VitePress -- providing an out-of-the-box documentation site experience built on top of the Lark framework.

## Features

- File-based routing: recursively scans a `docs/` directory and generates SPA routes (history mode, clean URLs)
- Markdown compilation pipeline: `markdown-it` with four custom plugins (anchors, TOC, containers, code blocks)
- YAML frontmatter: metadata extraction via `js-yaml` for page titles, descriptions, and sidebar positioning
- Code syntax highlighting: Shiki-powered highlighting with lazy WASM initialization, singleton caching, and dual light/dark theme output
- Admonition containers: `::: tip`, `::: warning`, `::: danger`, `::: details` rendered as styled callout components with lucide icons
- Auto-generated sidebar: directory-structure-based navigation with `sidebarPosition` and `sidebarLabel` frontmatter overrides
- Built-in search: MiniSearch-powered command palette (same engine as VitePress) with prefix/fuzzy matching and a `⌘K` shortcut, or disabled via `search: false`
- Table of contents: per-page heading outline with scroll-spy and smooth-scroll navigation
- Three-column responsive layout: Tailwind CSS v4 with shadcn-style semantic tokens, dark mode, sticky navbar, and a mobile navigation drawer
- Three bundler integrations: Vite, Webpack, and Rspack / Rsbuild
- Zero-config boot: `defineConfig()` auto-generates routes, sidebars, and search index into `.lark-docs/generated/`
- Single-call theme registration: `registerThemeViews()` registers all theme components at once
- Dual-format library build: ships ESM + CJS with full TypeScript declarations

## Architecture

`@lark.js/docs` operates in three phases:

**Phase 1 -- Configuration (build startup).** `defineConfig()` scans the docs directory, extracts frontmatter and headings from every `.md` file, auto-generates sidebar trees per path prefix, and writes a generated module to `.lark-docs/generated/index.js`. This module provides dynamic content loaders, a route map, runtime site configuration, and a lazy search index builder.

**Phase 2 -- Compilation (bundler plugin).** Each `.md` import is intercepted by the bundler plugin (`larkDocsPlugin` for Vite, `LarkDocsPlugin` for Webpack/Rspack) and compiled through `compileMarkdown()`. The pipeline extracts YAML frontmatter, initializes the Shiki highlighter on first call (async singleton), parses the markdown body with `markdown-it` plus four custom plugins, renders to HTML, builds page metadata, and emits a JS module that exports `pageData` and `contentHtml`.

**Phase 3 -- Runtime (browser).** The `@lark.js/mvc` Framework boots with the generated routes. The layout view stays mounted across navigation and asynchronously loads page content via `loadContent()`. Five theme Views (layout, sidebar, TOC, search, theme toggle) render the documentation UI. Search is lazily initialized on first query.

```
lark-docs.config.ts          Bundler Plugin              Browser Runtime
       |                            |                          |
  defineConfig()              compileMarkdown()          Framework.boot()
       |                            |                          |
  scanDocsDir()               extractFrontmatter         registerThemeViews()
  generateSidebar()           createParser()             routes + loadContent
       |                      getHighlighter()           from generated module
       |                            |                          |
  .lark-docs/generated/        JS module string          5 theme Views
  index.js                   ({pageData,                 render the docs UI
                               contentHtml})
```

## Quick Start

### 1. Install

```bash
pnpm add @lark.js/docs tailwindcss @tailwindcss/typography
```

`@lark.js/mvc` is a dependency of `@lark.js/docs` and its core APIs (`Framework`, `State`, `Router`, `defineView`, `registerViewClass`) are re-exported — no separate install is required.

The theme templates use Tailwind CSS v4 utility classes and the Typography plugin for `prose` styling (both peer dependencies). Configure your CSS entry to import the bundled theme stylesheet and let Tailwind scan the theme bundle for class names:

```css
@import "tailwindcss";
@import "@lark.js/docs/client.css";
@source "../node_modules/@lark.js/docs/dist/theme.js";
@plugin "@tailwindcss/typography";
```

### 2. Configure

Create `lark-docs.config.ts`:

```ts
import { defineConfig } from "@lark.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Library",
  nav: [
    { text: "Guide", link: "/guide/" },
    { text: "API", link: "/api/" },
  ],
  sidebar: {
    "/guide/": "auto",
    "/api/": "auto",
  },
  highlight: {
    theme: "github-light",
    darkTheme: "github-dark",
    languages: ["typescript", "javascript", "html", "css", "bash", "json"],
  },
  search: true,
});
```

`defineConfig()` is an identity function that also triggers route generation. It scans the docs directory, generates sidebar trees, and writes the generated module -- all at configuration load time.

### 3. Configure Your Bundler

**Vite:**

```ts
import { defineConfig } from "vite";
import { larkDocsPlugin } from "@lark.js/docs/vite";
import tailwindcss from "@tailwindcss/vite";
import docsConfig from "./lark-docs.config";
import { resolve } from "node:path";

const PKG_DIR = import.meta.dirname;

export default defineConfig({
  root: resolve(PKG_DIR, "app"),
  plugins: [
    // larkDocsPlugin returns a plugin array that handles BOTH .md
    // compilation and .html template compilation (the lark-mvc template
    // plugin is embedded) — no separate larkNextPlugin is needed.
    ...larkDocsPlugin({ config: docsConfig, vdom: false }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@lark-docs/generated": resolve(PKG_DIR, ".lark-docs/generated"),
    },
  },
});
```

**Webpack:**

```ts
import { LarkDocsPlugin } from "@lark.js/docs/webpack";
import docsConfig from "./lark-docs.config";

export default {
  plugins: [new LarkDocsPlugin({ config: docsConfig })],
};
```

**Rspack:**

```ts
import { LarkDocsPlugin } from "@lark.js/docs/rspack";
import docsConfig from "./lark-docs.config";

export default {
  plugins: [new LarkDocsPlugin({ config: docsConfig })],
};
```

### 4. Boot

Create `app/boot.ts`:

```ts
import {
  Framework,
  State,
  registerThemeViews,
  type FrameworkConfig,
} from "@lark.js/docs";

// Auto-generated by defineConfig()
import {
  routes,
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@lark-docs/generated";

import "./main.css";

// === Config ===

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "history",
  routes,
  vdom: false,
  defaultPath: "/docs/",
  // All docs routes map to "theme/docs-layout" (see generated routes).
  // The layout stays mounted across navigation; observeLocation triggers
  // an async render that loads the matching .md content via loadContent.
  defaultView: "theme/docs-layout",
  unmatchedView: "theme/docs-layout",
};

// === Register theme views ===
// Must run BEFORE Framework.boot() so the views are registered when the
// default view mounts. Pass the same vdom flag as the config — templates
// are pre-compiled in both string and VDOM modes, and this selects one.

registerThemeViews({ vdom: config.vdom });

// === Inject site data + content loader into State ===

State.set({ docsConfig, loadContent, getSearchIndex });

// === Boot ===

Framework.boot(config);
```

### 5. TypeScript Setup

Create `shims.d.ts` in your project root:

```ts
/// <reference types="@lark.js/docs/client" />
/// <reference types="vite/client" />
```

The `/// <reference types="@lark.js/docs/client" />` directive loads ambient module declarations for `@lark-docs/generated` (routes, docsConfig, loadContent, getSearchIndex, SearchEntry) and `*.html` template imports.

Add a `paths` mapping in `tsconfig.json` to help the IDE resolve the generated module:

```json
{
  "compilerOptions": {
    "paths": {
      "@lark-docs/generated/*": ["./.lark-docs/generated/*"]
    }
  }
}
```

> **Important:** Use `/// <reference types="..." />` (not `/// <reference path="..." />`) for referencing type declarations inside `node_modules`. The `types` directive uses TypeScript's full module resolution algorithm, which correctly resolves pnpm workspace symlinks and package `exports` fields. The `path` directive performs raw filesystem path lookup and does not understand package structure or symlink resolution.

### 6. Write Markdown

````markdown
---
title: Getting Started
description: Learn how to use the framework
sidebar_position: 1
---

# Getting Started

Welcome to the documentation.

## Installation

Install via npm:

```bash
pnpm add @lark.js/mvc
```

::: tip
Always call `registerThemeViews` before `Framework.boot()`.
:::
````

## Configuration Reference

The `DocsConfig` interface defines all configuration options:

| Field       | Type                            | Default     | Description                                               |
| ----------- | ------------------------------- | ----------- | --------------------------------------------------------- |
| `docs`      | `string`                        | `"docs"`    | Docs source directory, relative to project root           |
| `baseUrl`   | `string`                        | `"/docs/"`  | Base URL prefix for all generated routes                  |
| `title`     | `string`                        | (required)  | Site title displayed in the navbar                        |
| `nav`       | `NavItem[]`                     | `[]`        | Top navigation items (links auto-prefixed with `baseUrl`) |
| `sidebar`   | `Record<string, SidebarConfig>` | `{}`        | Sidebar config per path prefix                            |
| `markdown`  | `MarkdownOptions`               | `{}`        | Markdown processing options                               |
| `highlight` | `HighlightOptions`              | `undefined` | Shiki code highlighting options                           |
| `search`    | `boolean`                       | `true`      | Enable the built-in MiniSearch command palette            |

Routing mode is not part of `DocsConfig` — it belongs to the lark-mvc `FrameworkConfig` in `boot.ts` (the `FrameworkConfig` type re-exported by `@lark.js/docs` pins it to `"history"`).

### NavItem

```ts
interface NavItem {
  text: string; // Display text
  link: string; // Link URL (internal or external)
}
```

### Sidebar Configuration

Each sidebar prefix maps to either `"auto"` (filesystem-based generation) or an explicit `SidebarItem[]` array.

```ts
sidebar: {
  "/docs/guide/": "auto",        // auto-generate from directory structure
  "/docs/api/": [                 // explicit items
    { text: "Overview", link: "/docs/api/" },
    { text: "Classes", link: "/docs/api/classes" },
  ],
}
```

Auto-generated sidebars group routes by subdirectory, sort by `sidebarPosition` frontmatter (then alphabetically), and use `sidebarLabel` frontmatter for display text when provided.

### MarkdownOptions

| Field              | Type                                | Default    | Description                    |
| ------------------ | ----------------------------------- | ---------- | ------------------------------ |
| `anchor.permalink` | `boolean`                           | `true`     | Add permalink anchors to h1-h3 |
| `containers`       | `Record<string, { label: string }>` | (built-in) | Custom container labels        |

### HighlightOptions

| Field       | Type       | Default            | Description                                         |
| ----------- | ---------- | ------------------ | --------------------------------------------------- |
| `theme`     | `string`   | `"github-dark"`    | Shiki theme name                                    |
| `darkTheme` | `string`   | `undefined`        | Optional dark-mode theme; enables dual-theme output |
| `languages` | `string[]` | (common web langs) | Languages to load                                   |

When `highlight` is configured, the Shiki highlighter is initialized as a lazy singleton on the first `.md` compilation. The WASM and TextMate grammars are loaded once and cached for all subsequent files. Languages not in the loaded list fall back to the `"text"` grammar.

When `darkTheme` is set, tokens are emitted with `--shiki-light`/`--shiki-dark` CSS variables (no inline color); the active scheme switches purely via the `.dark` class on `<html>` — no re-highlighting at runtime.

### Search

`search` is a boolean (default `true`). When enabled, the theme renders a MiniSearch-powered command palette (`⌘K` / `Ctrl+K`, or `/`). Set `search: false` to remove the search button and modal entirely.

## Frontmatter

Each `.md` file can include YAML frontmatter delimited by `---`:

```yaml
---
title: Page Title
description: Page description for SEO and search
sidebar_position: 1
sidebar_label: Custom Label
---
```

| Field              | Type     | Description                                                                                                                                               |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`            | `string` | Page title. Falls back to first `# heading`, then filename-derived title                                                                                  |
| `description`      | `string` | Page description for meta tags and search index. Falls back to filename-derived title                                                                     |
| `sidebar_position` | `number` | Sort order in auto-generated sidebar (lower = higher). Uses all-or-nothing rule: if any page in a group lacks this field, all pages sort by filename only |
| `sidebar_label`    | `string` | Override sidebar display text                                                                                                                             |

### Title Resolution Chain

The page title is resolved in this priority order:

1. `title` field in frontmatter
2. First `# heading` in the markdown body (excluding headings inside fenced code blocks)
3. Filename-derived title: `index.md` uses the parent directory name (title-cased), other files use the stem with dashes replaced by spaces

The root `index.md` (at the docs directory root) falls back to `"Home"`.

## Markdown Extensions

### Heading Anchors

All h1, h2, and h3 headings automatically receive:

- An `id` attribute derived from the heading text via `slugify()` (lowercase, strip non-word chars, dashes for spaces)
- A `#` permalink link injected as a child anchor element (when `markdown.anchor.permalink` is not `false`)
- A `scroll-mt-20` CSS class to offset the sticky navbar height during scroll-to-anchor
- Slug deduplication: if two headings produce the same slug, the second gets a `-1` suffix, the third `-2`, etc.

### Internal Links

Links starting with `/` or `#` are rendered as-is and use the browser's default navigation. External links receive `target="_blank"` and `rel="noopener noreferrer"`.

### Table of Contents

Insert `[[toc]]` anywhere in your markdown to render a table of contents inline. The `[[toc]]` marker is compiled to `<div v-lark="theme/toc" p-lark-inline="true"></div>`, which mounts the TOC theme View in inline mode at that position. The default theme already shows a TOC in the right rail on `xl+` screens, so inline `[[toc]]` is only needed for in-content tables of contents.

### Admonition Containers

Four container types are supported via the `:::` fenced syntax:

```markdown
::: tip
Useful advice displayed in an info-styled alert.
:::

::: warning
Cautionary note displayed in a warning-styled alert.
:::

::: danger
Critical warning displayed in an error-styled alert.
:::

::: details Click to expand
Hidden content revealed on click.
:::
```

Containers are rendered as styled callout blocks with inline lucide icons:

- `tip` → `<div class="callout callout-tip">` (primary-tinted)
- `warning` → `<div class="callout callout-warning">`
- `danger` → `<div class="callout callout-danger">`
- `details` → a `<details class="callout callout-details">` element with a `<summary>` title

The default label is the type name uppercased. Override it per type via `markdown.containers` config (e.g. `{ tip: { label: "提示" } }`), or per instance with a custom title after the type keyword: `::: warning Custom Title`.

### Code Blocks

Fenced code blocks with a language identifier are syntax-highlighted when Shiki is configured:

````markdown
```typescript
const x: number = 42;
```
````

Every code block is wrapped in `<div class="codeblock" data-lang="...">` — the language chip renders from `data-lang`, and the layout view mounts a copy button at runtime. Without Shiki configured, the code falls back to an escaped `<pre class="codeblock-plain">`.

Template-literal syntax (`${...}`) inside code is preserved as-is — `contentHtml` is emitted as a JSON string literal, never interpolated.

## Theme System

The theme consists of five View factories, each paired with an HTML template. The `registerThemeViews()` convenience function registers all of them in a single call.

### View Factories

| Factory                           | View ID              | Purpose                                                                         |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| `createDocsLayoutView(template)`  | `theme/docs-layout`  | Root layout: navbar, three-column body, prev/next nav, mobile drawer, 404 state |
| `createSidebarView(template)`     | `theme/sidebar`      | Left sidebar navigation tree with collapsible groups                            |
| `createTocView(template)`         | `theme/toc`          | Heading outline with scroll-spy and animated marker                             |
| `createSearchView(template)`      | `theme/search`       | MiniSearch command palette                                                      |
| `createThemeToggleView(template)` | `theme/theme-toggle` | Dark-mode toggle button                                                         |

### registerThemeViews

The recommended way to set up the theme:

```ts
import { registerThemeViews } from "@lark.js/docs"; // also exported from /theme

// Call BEFORE Framework.boot(), passing the same vdom flag as your config:
registerThemeViews({ vdom: false });
```

Signature: `registerThemeViews(options?: { vdom?: boolean })`. The theme templates are pre-compiled in BOTH string and VDOM modes during the library build; this call selects the version matching the rendering mode (explicit option > booted Framework config > `false`). Consumers never need to import `.html` files or call `registerViewClass` manually.

### Layout Structure

```
docs-layout (root)
+-- Navbar (fixed top, scroll-aware backdrop-blur)
|   +-- Mobile menu button (opens drawer, below lg)
|   +-- Site title (hour-aware clock logo)
|   +-- Nav items (hidden below md)
|   +-- Search trigger (⌘K) + theme toggle (v-lark="theme/theme-toggle")
+-- Three-column grid (max-w-360, centered)
|   +-- Sidebar (236px, left, visible on lg+; v-lark="theme/sidebar")
|   +-- Content (prose max-w-none; skeleton while loading; 404 state)
|   +-- TOC (224px, right, visible on xl+; v-lark="theme/toc")
+-- Prev/Next pager (bottom of content, flattened from sidebar order)
+-- Mobile navigation drawer (focus trap, Escape to close)
+-- Search dialog (v-lark="theme/search", when search enabled)
```

The layout view stays mounted across all `/docs/*` routes. When the user navigates, `observeLocation` triggers an async `render()` that calls `loadContent(path)` to fetch the new page's compiled markdown, then updates the view data. The compiled markdown HTML is rendered inline via `contentHtml`.

### Responsive Behavior

- Below `lg` breakpoint (1024px): sidebar is hidden (mobile drawer takes over)
- Below `xl` breakpoint (1280px): TOC is hidden
- Nav items hidden on small screens, visible from `md` breakpoint
- Search: `⌘K` / `Ctrl+K` toggles the palette, `/` opens it (unless typing in an input)

### Icons

Theme views use `lucide-static` for SVG icons, imported as raw strings via Vite's `?raw` suffix. Icons are centralized in `src/theme/icons.ts` (exported as `icons`, plus a `clockIcons` array for the hour-aware navbar logo) and set into updater data once during setup since they are static. Templates render icons with the raw output operator:

```html
<span class="h-5 w-5 [&>svg]:h-full [&>svg]:w-full"> {{!icons.search}} </span>
```

The wrapper `<span>` controls sizing. Tailwind utilities `[&>svg]:w-full [&>svg]:h-full` force the child `<svg>` to fill the container. Icons inherit `currentColor` from their parent, so color is controlled via standard CSS utilities (e.g., `text-primary`).

## Search System

### Local Search (MiniSearch)

The built-in search is powered by [MiniSearch](https://github.com/lucaong/minisearch) (the same engine used by VitePress). It provides a command-palette dialog with:

- Prefix matching: typing "conf" matches "configuration"
- Fuzzy matching: tolerates typos (fuzzy factor 0.2)
- Field-weighted scoring: title matches boosted 2x, headings 1.5x, excerpt 1x
- Highlighted results: matched terms wrapped in `<mark>` in both title and excerpt (all text HTML-escaped first)
- Keyboard navigation: `↑`/`↓` with wrap-around, `Enter` to open (IME-composing Enter ignored), `Esc` to close from anywhere
- Lazy index construction: the MiniSearch instance is built on the first query from `getSearchIndex()` (which loads all non-virtual `.md` modules in parallel), then reused for subsequent searches
- Race-safe async results (a sequence counter drops stale responses), max 12 results
- Open/close state driven by `State.searchOpen` so the navbar button and keyboard shortcuts can toggle the modal without a direct view reference

## Password-Protected Pages

Mark a page with `protected: true` frontmatter, register `docsGuardPlugin()`, and build with a `DOCS_PASSWORD` environment variable — the page's HTML is then AES-256-GCM encrypted at build time (PBKDF2-SHA256, 100k iterations):

```ts
// vite.config.ts
import { larkDocsPlugin, docsGuardPlugin } from "@lark.js/docs/vite";

export default defineConfig({
  plugins: [...larkDocsPlugin({ config: docsConfig }), docsGuardPlugin()],
});
```

On the client, wrap the generated `loadContent` with the built-in guard before injecting it into `State` — it shows a password dialog for protected pages, caches the password for the session, and renders an access-denied notice when dismissed:

```ts
import { createContentGuard, State } from "@lark.js/docs";
import { docsConfig, loadContent, getSearchIndex } from "@lark-docs/generated";

const guard = createContentGuard(loadContent);
State.set({ docsConfig, loadContent: guard.loadContent, getSearchIndex });
```

Protected pages are excluded from the search index, and their `excerpt`/`headings` are scrubbed from the plaintext `pageData` (headings are encrypted alongside the HTML so the TOC is restored after unlock). Without `DOCS_PASSWORD` set, `docsGuardPlugin()` is a warn-only no-op and protected pages build as plain HTML (useful for local dev).

## Bundler Plugins

### Vite Plugin

```ts
import { larkDocsPlugin } from "@lark.js/docs/vite";

export default defineConfig({
  plugins: [larkDocsPlugin({ config: docsConfig, debug: false })],
});
```

The plugin runs in the `pre` enforcement phase. Its `resolveId` hook appends a `?lark-docs` suffix to `.md` imports so Vite does not treat them as static assets. Its `load` hook reads the raw markdown, compiles it through `compileMarkdown()`, and returns the JS module string.

`larkDocsPlugin()` returns a plugin array: the `.md` compiler, a `base-sync` plugin (sets Vite's `base` from `config.baseUrl` unless you set `base` yourself), a `spa-fallback` plugin (copies `index.html` to `404.html` after build so GitHub-Pages-style hosts serve deep links), and the embedded lark-mvc `.html` template plugin.

Options: `{ config: DocsConfig, debug?: boolean }`.

### Webpack Plugin + Loader

```ts
import { LarkDocsPlugin } from "@lark.js/docs/webpack";

export default {
  plugins: [new LarkDocsPlugin({ config: docsConfig })],
};
```

`LarkDocsPlugin` pushes a loader rule onto `compiler.options.module.rules` synchronously in `apply()`. The loader (`larkDocsLoader`) uses Webpack 5's `this.callback()` pattern for async result delivery. It self-references via `__filename` to resolve the loader path.

Options: `{ config: DocsConfig, test?: RegExp, exclude?: RegExp }`. Defaults: `test: /\.md$/`, `exclude: /node_modules/`.

### Rspack Plugin + Loader

```ts
import { LarkDocsPlugin } from "@lark.js/docs/rspack";

export default {
  plugins: [new LarkDocsPlugin({ config: docsConfig })],
};
```

Same API as Webpack, but the loader returns `Promise<string>` directly (Rspack async loader convention, no `this.callback()`).

## Package Exports

| Sub-path                   | Description                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@lark.js/docs`            | Main barrel: all types, scanner, sidebar, markdown, compiler, runtime, theme factories                        |
| `@lark.js/docs/compiler`   | `compileMarkdown()` + `CompileMarkdownOptions` type                                                           |
| `@lark.js/docs/vite`       | `larkDocsPlugin()` + `docsGuardPlugin()` Vite plugins + build-time utility re-exports                         |
| `@lark.js/docs/webpack`    | `LarkDocsPlugin` class + `larkDocsLoader()` function                                                          |
| `@lark.js/docs/rspack`     | `LarkDocsPlugin` class + `larkDocsLoader()` async function                                                    |
| `@lark.js/docs/runtime`    | `slugify()` + `createSlugger()` (browser-safe, no build deps)                                                 |
| `@lark.js/docs/theme`      | `registerThemeViews()` + 5 view factories + `icons`                                                           |
| `@lark.js/docs/client`     | Types-only: ambient module declarations for `@lark-docs/generated` and `*.html` (for `/// <reference types>`) |
| `@lark.js/docs/client.css` | The bundled theme stylesheet (`dist/client.css`)                                                              |

The `/vite`, `/webpack`, and `/rspack` sub-paths re-export build-time utilities (`scanDocsDir`, `generateSidebar`, `defineConfig`) to avoid pulling in the main entry's `lucide-static` SVG `?raw` imports, which are not valid in Node.js contexts.

The `/client` sub-path is types-only (no runtime code). It ships `client.d.ts` which provides `declare module "@lark-docs/generated"` and `declare module "*.html"` ambient declarations. Consumer projects reference it via `/// <reference types="@lark.js/docs/client" />` in their `shims.d.ts`.

## API Reference

### `defineConfig(config: DocsConfig, projectRoot?: string): DocsConfig`

Type-safe configuration helper. Returns the config unchanged while triggering route generation. The optional `projectRoot` parameter controls path resolution for the `docs` directory and the generated output. Defaults to `process.cwd()`.

### `registerThemeViews(options?: RegisterThemeViewsOptions): void`

Registers all five theme views (layout, sidebar, TOC, search, theme toggle) with the lark-mvc view registry. Templates are pre-compiled in both string and VDOM modes; pass `{ vdom }` (before boot) to select the rendering mode.

### `scanDocsDir(docsDir: string, baseUrl: string): DocsRoute[]`

Recursively scans a docs directory and returns route entries. Skips entries whose names start with `_` or `.`, plus `node_modules` and `dist`. `index.md` maps to the directory root without trailing `/`.

### `generateSidebar(routes: DocsRoute[], prefix: string): SidebarItem[]`

Auto-generates sidebar items for routes under a given prefix. Groups by subdirectory, sorts by `sidebarPosition` then title, produces a `SidebarItem[]` tree.

### `compileMarkdown(source: string, options: CompileMarkdownOptions): Promise<string>`

Compiles a `.md` source string into a JS module string that exports `pageData` and `contentHtml`. The pipeline: extract frontmatter, create parser, optionally initialize Shiki, parse and render to HTML, build page metadata, emit JS module.

### `slugify(text: string): string`

Converts text to a URL-safe slug: lowercase, strip non-word chars (except spaces and dashes), replace whitespace with dashes, collapse consecutive dashes.

### `createSlugger(): (text: string) => string`

Returns a per-document slugify with deduplication: repeated headings get `-1`, `-2`, ... suffixes so TOC slugs always match rendered `id`s.

### Theme View Factories

```ts
createDocsLayoutView(template); // root layout
createSidebarView(template); // sidebar navigation
createTocView(template); // heading outline
createSearchView(template); // search palette
createThemeToggleView(template); // dark-mode toggle
```

The main entry re-exports `registerThemeViews` plus the first four factories.
`createThemeToggleView` is available from the `@lark.js/docs/theme` sub-path.

## Type Definitions

All types are exported from the main entry and available for import:

```ts
import type {
  DocsConfig,
  NavItem,
  SidebarConfig,
  SidebarItem,
  MarkdownOptions,
  HighlightOptions,
  PageData,
  HeadingInfo,
  DocsRoute,
  FrontmatterResult,
  CompileMarkdownOptions,
} from "@lark.js/docs";
```

`SearchEntry` is not a main-entry export — it is declared ambiently on the `@lark-docs/generated` module by `@lark.js/docs/client`.

## Generated Output

`defineConfig()` writes a generated module to `.lark-docs/generated/index.js` (a dot directory at project root, similar to VitePress's `.vitepress/` and Docusaurus's `.docusaurus/`). This directory should be added to `.gitignore`.

The generated module exports:

- `loadContent(path)` -- dynamically imports the compiled `.md` module for a given route path, returns `{ pageData, contentHtml }` or `null`
- `routes: Record<string, string>` -- maps every docs path to the layout view `"theme/docs-layout"`
- `docsConfig` -- the runtime site configuration (title, baseUrl, nav with baseUrl-prefixed links, resolved sidebar, search flag)
- `getSearchIndex()` -- lazily builds the search index by loading all non-virtual `.md` modules on first call (filtering through `_searchablePaths` to exclude virtual index routes), returns `SearchEntry[]`

```ts
// vite.config.ts
resolve: {
  alias: {
    "@lark-docs/generated": resolve(PKG_DIR, ".lark-docs/generated"),
  },
}

// boot.ts
import { routes, docsConfig, loadContent, getSearchIndex } from "@lark-docs/generated";
```

Type declarations for `@lark-docs/generated` are provided by the `@lark.js/docs/client` package export via `/// <reference types>` directive -- no generated `.d.ts` file is needed.

## Dependencies

**Runtime:**

- `@lark.js/mvc` (workspace) -- Lark framework (re-exported by `@lark.js/docs` so consumers do not need to install it separately)
- `ejs` ^3.1.10 -- Template engine for generated module output
- `js-yaml` ^5.2.2 -- YAML frontmatter parsing
- `lucide-static` ^1.27.0 -- SVG icons via `?raw` import
- `markdown-it` ^14.3.0 -- Markdown parser
- `markdown-it-container` ^4.0.0 -- Admonition container syntax
- `minisearch` ^7.2.0 -- Full-text search engine (same as VitePress)
- `shiki` ^4.3.1 -- Code syntax highlighting (dynamic import, lazy singleton)
- `zod` ^4.4.3 -- Runtime schema validation for State-injected values

**Peer:**

- `@tailwindcss/typography` ^0.5.0 -- `prose` class for markdown content
- `tailwindcss` ^4.0.0 -- Utility-first CSS

## Development

```bash
# Dev server for the bundled documentation site (app/)
pnpm dev

# Build the library (7 entries, ESM + CJS + d.ts)
pnpm build

# Build the documentation site into dist-docs/
pnpm build:docs

# Preview the built docs site
pnpm preview

# Tests / type check / format
pnpm test
pnpm typecheck
pnpm format
```

The repository's own `vite.config.ts` is a dual-mode config: `--mode lib`
builds the library (and copies `file-content.ejs`, `client.css`, `client.d.ts`
into `dist/`), while `--mode docs` builds the documentation site. It also
hosts the `themeDualMode` plugin that compiles each theme `.html` in both
string and VDOM modes into `virtual:lark-docs/*` modules.

Deployment: the output is a `history`-mode SPA. Serve `dist-docs/` with a
fallback rewrite of all paths to `index.html` (on GitHub-Pages-style hosts
the build already emits a `404.html` copy via the `spa-fallback` plugin).
`baseUrl` is a route prefix _inside_ the SPA — Vite's `base` defaults to
`baseUrl` via the `base-sync` plugin unless you set `base` yourself.

## License

MIT
