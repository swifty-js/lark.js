# Configuration, Scanner, Routing & the Generated Module

Source of truth: `src/define-config.ts`, `src/types.ts`, `src/scanner.ts`,
`src/sidebar-generator.ts`, `src/utils/route-sorting.ts`,
`src/utils/derive-title.ts`, `src/file-content.ejs`.

## DocsConfig (complete)

```ts
import { defineConfig } from "@lark.js/lark-docs/vite"; // or "@lark.js/lark-docs" (Node context)

defineConfig(config: DocsConfig, projectRoot = process.cwd()): DocsConfig
```

| Field         | Type                                                                                    | Default        | Description                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `docs`        | `string`                                                                                | `"docs"`       | Markdown source dir, relative to `projectRoot` (absolute paths allowed)                                                      |
| `baseUrl`     | `string`                                                                                | `"/docs/"`     | Route prefix for every generated path; also auto-prefixed onto nav/sidebar links                                             |
| `title`       | `string`                                                                                | required       | Navbar site title (also used in `document.title` suffix)                                                                     |
| `description` | `string?`                                                                               | `""`           | Meta description                                                                                                             |
| `nav`         | `NavItem[]?`                                                                            | `[]`           | `{ text, link, items? }` — external links (`https://…`) pass through unprefixed                                              |
| `sidebar`     | `Record<string, "auto" \| SidebarItem[]>?`                                              | —              | Keyed by path prefix (relative to baseUrl, e.g. `"/guide/"`)                                                                 |
| `markdown`    | `{ anchor?: { permalink?: boolean }, containers?: Record<string, { label: string }> }?` | permalink true | Container types: tip/warning/danger/details                                                                                  |
| `highlight`   | `{ theme?, darkTheme?, languages? }?`                                                   | off            | Shiki. `darkTheme` set ⇒ dual-theme CSS-variable output (`--shiki-light/--shiki-dark`, toggled by `.dark` — no re-highlight) |
| `search`      | `boolean?`                                                                              | `true`         | MiniSearch command palette                                                                                                   |

`SidebarItem`: `{ text, link?, collapsed?, items? }` (plus runtime-only
`isActive`/`itemClass`). `NavItem`: `{ text, link, items? }`.

**There is no `routeMode`/`lang`/`search.provider` in DocsConfig** — routing
mode belongs to `FrameworkConfig` (pinned to `"history"` by the re-exported
type), and search is local-only.

## What defineConfig does (side effects!)

1. `scanDocsDir(docsDir, baseUrl)` → `DocsRoute[]`.
2. For each `sidebar` prefix: `"auto"` → `generateSidebar(routes, baseUrl+prefix)`;
   manual arrays → links get baseUrl-prefixed.
3. Renders `src/file-content.ejs` → writes
   `{projectRoot}/.lark-docs/generated/index.js` (gitignore `.lark-docs/`).
4. Returns the config unchanged.

It runs whenever the config module is evaluated (bundler config load). Adding
or renaming `.md` files requires re-running it — restart the dev server.

## Scanner rules (`scanDocsDir(docsDir, baseUrl, { excludeDrafts? })`)

- Skips names starting with `_` or `.`; skips `node_modules`, `__tests__`,
  `__fixtures__`, `.git`, `.vitepress`, `.lark-docs`, `dist`.
- Only `.md` files. Non-existent dir → `[]`.
- Route derivation (**no trailing slashes anywhere**):
  - root `index.md` → `/docs`
  - `guide/index.md` → `/docs/guide`
  - `guide/config.md` → `/docs/guide/config`
- **Virtual index routes**: a directory without `index.md` gets a route at
  the directory path pointing to its _first page_ (`isDirectoryIndex: true`).
  First page = lowest `sidebar_position` if ALL children have one, else first
  by filename. Virtual indexes are excluded from sidebar + search.
- Per file, frontmatter + content are parsed into `PageData`:
  `{ title, description, excerpt (≤200 chars, body text, headings/code excluded),
sidebarPosition, sidebarLabel, draft, headings (h2/h3 {level,text,slug}),
relativePath }`.
- `draft: true` files are dropped only when `excludeDrafts` is passed.

Title chain: frontmatter `title` → first h1 (fenced code ignored) →
`deriveTitleFromPath` (`getting-started.md` → "Getting Started";
`guide/index.md` → "Guide"; root `index.md` → "Home"). Description defaults
to the derived title.

## Sidebar generation (`generateSidebar(routes, prefix)`)

- Filters routes under the prefix, excluding virtual indexes.
- Routes directly under the prefix become top-level items; deeper routes
  group by their first subdirectory into a collapsible group
  (`text: "Api"` — dashes/underscores → spaces, Title Case; `collapsed: false`).
- Item text = `sidebarLabel || title`.
- **Sorting (all-or-nothing)**: within a group, if every route has
  `sidebarPosition` → sort by position (0-based) then filename; if ANY is
  missing → filename order only. Same rule picks virtual-index targets.

## The generated module (`@lark-docs/generated`)

`.lark-docs/generated/index.js`, consumed via a bundler alias. Exact API:

```ts
loadContent(path: string): Promise<{ pageData, contentHtml } | null>
// Normalizes: strips trailing slashes and /index(.md|.html) suffixes,
// then dynamic-imports the compiled .md module. null → layout shows 404.

routes: Record<string, string>
// every docs path → "theme/docs-layout" (single persistent layout view)

docsConfig  // runtime config: title, description, baseUrl,
            // nav (baseUrl-prefixed), sidebar (resolved), search

getSearchIndex(): Promise<SearchEntry[]>
// Lazy: on first call loads ALL searchable .md modules in parallel and maps
// to { title, link, headings: string[], excerpt }. Virtual index routes and
// alias paths are excluded via an internal _searchablePaths set. Cached.
```

Types for this module come from `@lark.js/lark-docs/client`
(`declare module "@lark-docs/generated"`), referenced via
`/// <reference types="@lark.js/lark-docs/client" />`. Add a tsconfig `paths`
entry `"@lark-docs/generated/*": ["./.lark-docs/generated/*"]` for IDE
resolution.

## Multi-product sites

One baseUrl, multiple top-level docs subdirectories — this repo's own config:

```ts
defineConfig({
  docs: "docs",
  baseUrl: "/lark/",
  nav: [
    { text: "Lark Mvc", link: "/lark-mvc/" },
    { text: "Lark Docs", link: "/lark-docs/" },
  ],
  sidebar: {
    "/lark-mvc/": "auto", // docs/lark-mvc/**
    "/lark-docs/": "auto", // docs/lark-docs/**
  },
});
```

Each prefix gets an independent auto sidebar; nav active state is a prefix
match on the current path; prev/next paging flattens across the sidebar map.
