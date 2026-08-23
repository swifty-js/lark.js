# Theme System, Runtime Views, Search & Dark Mode

Source of truth: `src/theme/*.tsx` (signal-based JSX components),
`src/theme/index.ts`, `src/client.css`, `src/client.d.ts`,
`src/utils/dom.ts`.

## registerThemeViews

```ts
import { registerThemeViews } from "@lark.js/docs"; // or /theme

registerThemeViews(): void
```

Registers exactly **two** string-path views via `registerViewClass` — the
ones the runtime must resolve by path:

| View path           | Factory                          | Why a registered path                                    |
| ------------------- | -------------------------------- | --------------------------------------------------------- |
| `theme/docs-layout` | `createDocsLayoutView()`         | `Framework.boot({ defaultView: "theme/docs-layout" })`   |
| `theme/toc-inline`  | `createTocView({ inline: true })`| `[[toc]]` compiles to raw `<div v-lark="theme/toc-inline"></div>` |

Everything else — `createSidebarView()`, `createTocView()`,
`createSearchView()`, `createThemeToggleView()` — returns a `LarkView`
component that the layout **imports and embeds as JSX tags**
(`<Sidebar />`, `<Toc />`, `<Search />`, `<ThemeToggle />`). They are NOT in
the registry; re-registering `"theme/sidebar"` does nothing (see
"Customizing the theme"). Factories take no template argument.

Call `registerThemeViews()` **before `Framework.boot()`** so
`theme/docs-layout` is registered when the default view mounts.

## The State contract (runtime data bus, per-key signals)

All cross-view communication goes through Lark `State` — reads in templates
are tracked signal reads, writes re-render readers (there is no digest).
Values are validated with zod at read time — bad shapes degrade gracefully.

| Key                   | Written by                                       | Read by (tracked)           |
| --------------------- | ------------------------------------------------ | ---------------------------- |
| `docsConfig`          | boot.ts                                          | layout, sidebar             |
| `loadContent`         | boot.ts                                          | layout                      |
| `getSearchIndex`      | boot.ts                                          | search                      |
| `searchOpen`          | layout (⌘K / `/` / button), search (Esc/overlay) | search template             |
| `drawerOpen`          | layout, sidebar (closes on navigate)             | layout template + effect    |
| `currentPageHeadings` | layout (after loadContent)                       | toc template + effect       |
| `currentPageTitle`    | layout                                           | (available to custom views) |
| `onContentUpdate`     | dev HMR bridge                                   | layout, search (md hot reload) |

## docs-layout behavior (the interesting one)

Content state lives in signals (`loading`, `notFound`, `contentHtml`,
`currentPath`, `prevPage`, `nextPage`, `navItems`, `siteTitle`,
`searchEnabled`); the template reads them plus `State.get("drawerOpen")`.

- **Navigation driver** — a `useSignalEffect` reads `Router.parse().path`
  (the only tracked read) and runs the async `navigate()` inside
  `untracked()` (so drawer/config reads don't re-trigger navigation):
  1. `/index(.md|.html)` URLs redirect to the clean path
     (`Router.to(clean, {}, true)`).
  2. Same path → return (hash-only changes handled by click handlers).
  3. Else: close drawer + `loading.value = true` (skeleton) →
     `await loadContent(path)` — staleness guarded by a **navigation
     sequence counter** (`navSeq`), NOT `ctx.signature` (signature bumps on
     every reactive render) → set `currentPageHeadings`/`currentPageTitle`
     in State, `document.title = "{page} · {site}"` → compute prev/next from
     the sidebar map → one `batch()` writing all content signals.
  4. Post-render (setTimeout 0): replay page-in animation, mount copy
     buttons, render mermaid blocks, scroll to `location.hash` or top.
- **Drawer effect** — a second `useSignalEffect` on `State.get("drawerOpen")`
  syncs `inert`, body scroll lock, focus return, and replays copy-button /
  mermaid enhancements (any layout re-render's DOM diff strips
  runtime-injected nodes).
- Keyboard: ⌘K/Ctrl+K toggles `searchOpen`; `/` opens it (unless typing in
  an input); drawer gets Escape-close + Tab focus trap.
- Navbar scroll styling toggles classes directly on `#docs-navbar`
  (bypasses rendering for scroll performance).
- Links use `data-href` + `onClick={navigateTo}`; handlers walk up from
  `e.target` via `findDataHref` (clicks may hit `<svg>`/`<span>`). In-article
  clicks are delegated on the content root (`onContentClick`): `#hash` →
  smooth scroll + pushState; `/...` same-origin → `Router.to`.

## sidebar / toc details

- **sidebar**: the template calls `buildGroups()` — tracked reads of
  `State.get("docsConfig")`, `Router.parse()` (active route), and a local
  `collapseVersion` signal. Collapse state lives in closure Maps keyed by
  group path (toggle handlers mutate the Map and bump `collapseVersion`); a
  group auto-expands only on the _transition_ to containing the active route
  (users can re-collapse it). Clicking a link `Router.to(href)` and closes
  the mobile drawer (`State.set({ drawerOpen: false })`).
- **toc** (`createTocView(options?: { inline?: boolean })`): the template
  reads `State.get("currentPageHeadings")` + local `activeSlug` /
  `markerTop` / `markerHeight` / `markerShow` signals. Scroll-spy is
  rAF-throttled scroll/resize + ResizeObserver recompute (NOT
  IntersectionObserver): the last heading whose top ≤ 97px is active; at
  page bottom the last heading wins. A `useSignalEffect` re-runs the spy and
  marker when the page's headings change. Clicking pushes `#slug` history
  state and smooth-scrolls. The inline variant (`[[toc]]` →
  `theme/toc-inline`) adds a bordered card wrapper.

## Search (MiniSearch)

- Signal state: `results`, `hasSearched`, `query`, `activeIndex`,
  `indexSize`; open/close is `State.get("searchOpen")` read in the template.
- Lazy: first keystroke calls `State.get("getSearchIndex")()` and builds
  **section-level** docs (`buildSectionDocs` splits each page's compiled
  HTML at h1–h3 boundaries; results deep-link to `/path#slug` with a
  hierarchical crumb). `MiniSearch({ fields: ["title","pageTitle","text"],
  tokenize: cjkTokenize, searchOptions: { prefix: true, fuzzy: 0.2,
  boost: { title: 2, pageTitle: 1.5 } } })`.
- Caps: 3 results per page, 12 total; matched terms wrapped in `<mark>`
  (all text HTML-escaped first — safe for the `raw()` output the template
  uses). Race-safe via a sequence counter; md hot updates invalidate the
  index (generation counter).
- A `useSignalEffect` on `searchOpen` focuses the input on open and resets
  query state on close; Esc closes from anywhere; ↑/↓ wrap around; Enter
  opens (IME-composing Enter ignored).
- `search: false` in DocsConfig removes the button and the `<Search />`
  mount.

## Dark mode & theming

- Toggle mechanism: `.dark` class on `document.documentElement` +
  `localStorage["lark-docs-theme"]` (`"dark"`/`"light"`; absent = system
  preference). The toggle view holds a `dark` signal synced across instances
  with a MutationObserver. Put the no-FOUC snippet in `index.html`. Mermaid
  diagrams re-render on theme flips (another MutationObserver in the layout).
- `client.css` (Tailwind CSS v4, CSS-first config): shadcn-style semantic
  tokens (`--background --foreground --primary --primary-foreground
--secondary --secondary-foreground --muted --muted-foreground --accent
--accent-foreground --destructive --radius`) declared on `:root` and
  flipped under `.dark`, mapped into Tailwind via `@theme inline` so
  `bg-background` / `text-primary` utilities work. Borders and code surfaces
  reuse `--muted`, focus rings use `--primary`, card/drawer/dialog surfaces
  use `--background`, callout danger uses `--destructive` — there are no
  separate `--card`/`--border`/`--ring`/`--sidebar` tokens. Includes
  typography-plugin prose overrides, `.codeblock`/`.callout` chrome,
  `docs-grid`/`sidebar-scroll`/`skeleton` utilities, entry animations, and a
  `prefers-reduced-motion` guard. The packaged `dist/client.css` already
  `@import`s tailwindcss and `@source`-scans `dist/theme-chunk.js`.
- **Customize colors** by overriding the CSS variables on `:root` / `.dark`
  after importing `client.css` — no Tailwind config needed.

## Icons

`icons` (exported from the main entry / `/theme`) is a map of raw lucide SVG
strings (`search menu x sun moon chevronDown chevronRight copy check list
arrowUpRight arrowLeft arrowRight compass info triangleAlert octagonAlert`),
plus `clockIcons[12]` (the hour-aware navbar logo). Render with
`{raw(icons.x)}`; size/color via the wrapper span (`[&>svg]:size-full`,
`text-primary`).

## Customizing the theme

Three levels:

1. **CSS only** — override token variables and/or prose rules.
2. **Replace the layout** — after `registerThemeViews()`, re-register
   `"theme/docs-layout"` with your own `LarkView` (last registration wins).
   Because Sidebar/Toc/Search/ThemeToggle are plain exported factories, a
   custom layout composes them as JSX tags:

```tsx
import { createSidebarView, createSearchView, icons } from "@lark.js/docs";
import { defineView, jsxTemplate, registerViewClass, State, raw } from "@lark.js/mvc";

const Sidebar = createSidebarView();
const Search = createSearchView();

registerViewClass(
  "theme/docs-layout",
  defineView(() => ({
    template: jsxTemplate(() => (
      <div>
        <Sidebar />
        {!!State.get("searchOpen") && <Search />}
        {raw(icons.menu)}
        {/* ... your layout ... */}
      </div>
    )),
  })),
);
```

3. **Fork a component** — the stock components read the State contract
   (`docsConfig`, `searchOpen`, `drawerOpen`, `currentPageHeadings`) via
   tracked `State.get` reads and navigate via `data-href` + `Router.to`;
   keep the same channel so the rest of the theme keeps working.
   `@lark.js/docs/runtime` exports the browser-safe `slugify` for custom
   TOC/anchor logic; `renderMermaidBlocks` is exported for custom layouts.
