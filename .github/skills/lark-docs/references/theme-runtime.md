# Theme System, Runtime Views, Search & Dark Mode

Source of truth: `src/theme/*` (5 view factories + .html templates),
`src/runtime.ts`, `src/client.css`, `src/client.d.ts`, `src/utils/dom.ts`.

## registerThemeViews

```ts
import { registerThemeViews } from "@lark.js/lark-docs"; // or /theme

registerThemeViews(options?: { vdom?: boolean }): void
// vdom resolution: explicit option > Framework config (if booted) > false
```

Registers five views via `registerViewClass`:

| View path            | Factory                      | Role                                                                           |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `theme/docs-layout`  | `createDocsLayoutView(tpl)`  | Persistent root layout: navbar, 3-column grid, content, pager, drawer, 404     |
| `theme/sidebar`      | `createSidebarView(tpl)`     | Collapsible nav tree with active tracking                                      |
| `theme/toc`          | `createTocView(tpl)`         | Heading outline, scroll-spy, animated marker; inline mode via `*inline="true"` |
| `theme/search`       | `createSearchView(tpl)`      | MiniSearch command palette                                                     |
| `theme/theme-toggle` | `createThemeToggleView(tpl)` | Dark-mode button                                                               |

Templates are pre-compiled in **both** string and VDOM modes at lib-build
time (via `virtual:lark-docs/*` modules exporting `__str`/`__vdom`);
`registerThemeViews` merely picks the version matching `vdom`. Call it
**before `Framework.boot()`** so `theme/docs-layout` is registered when the
default view mounts.

## The State contract (runtime data bus)

All cross-view communication goes through Lark `State` (values validated
with zod at read time — bad shapes degrade gracefully):

| Key                   | Written by                                       | Read by                     |
| --------------------- | ------------------------------------------------ | --------------------------- |
| `docsConfig`          | boot.ts                                          | layout, sidebar             |
| `loadContent`         | boot.ts                                          | layout                      |
| `getSearchIndex`      | boot.ts                                          | search                      |
| `searchOpen`          | layout (⌘K / `/` / button), search (Esc/overlay) | search (observes)           |
| `drawerOpen`          | layout, sidebar (closes on navigate)             | layout (observes)           |
| `currentPageHeadings` | layout (after loadContent)                       | toc (observes)              |
| `currentPageTitle`    | layout                                           | (available to custom views) |

## docs-layout behavior (the interesting one)

- `ctx.observeLocation([], true)` + `observeState("drawerOpen")`; navigation
  triggers an async `ctx.renderMethod`:
  1. `/index(.md|.html)` URLs redirect to the clean path (`Router.to(clean, {}, true)`).
  2. Same path + only drawer changed → cheap digest, skip reload.
  3. Else: show skeleton (`loading: true`) → `await loadContent(path)` →
     signature-guarded → set `currentPageHeadings`/`currentPageTitle` in
     State, `document.title = "{page} · {site}"` → compute prev/next by
     flattening the sidebar map → digest with
     `{ contentHtml, notFound: !content, navItems (prefix-matched active), … }`.
  4. Post-render (setTimeout 0): replay page-in animation, **mount copy
     buttons** on `.codeblock`s, scroll to `location.hash` element or top.
- Keyboard: ⌘K/Ctrl+K toggles `searchOpen`; `/` opens it (unless typing in an
  input); drawer gets Escape-close + Tab focus trap + body scroll lock.
- Navbar scroll styling toggles classes directly on `#docs-navbar`
  (bypasses updater for scroll performance).
- Links in templates use `data-href` + `@click="navigateTo()"`; handlers walk
  up from `e.target` via `findDataHref` (clicks may hit `<svg>`/`<span>`).

## sidebar / toc details

- **sidebar**: reads `docsConfig.sidebar`, flattens nested items into
  depth-annotated rows (padding = `14 + depth*14`px). Collapse state lives in
  closures keyed by group path, so it survives re-renders; a group
  auto-expands only on the _transition_ to containing the active route
  (users can re-collapse it). Clicking a link `Router.to(href)` and closes
  the mobile drawer.
- **toc**: observes `currentPageHeadings`; IntersectionObserver scroll-spy
  marks the last heading whose top ≤ 96px; an animated `--primary` marker is
  positioned beside the active item; clicking pushes `#slug` history state
  and smooth-scrolls. Inline mode (`[[toc]]`) adds a bordered card wrapper.

## Search (MiniSearch)

- Lazy: first keystroke calls `State.get("getSearchIndex")()` and builds a
  `MiniSearch({ fields: ["title","headings","excerpt"], searchOptions:
{ prefix: true, fuzzy: 0.2, boost: { title: 2, headings: 1.5 } } })`.
- Max 12 results; matched terms wrapped in `<mark>` (all text HTML-escaped
  first — safe for the `{{!}}` raw output the template uses).
- Keyboard: ↑/↓ wrap-around, Enter opens (IME-composing Enter ignored),
  Esc closes from anywhere; results are race-safe via a sequence counter.
- Open/close purely via `State.searchOpen`. `search: false` in DocsConfig
  removes the button and the `v-lark="theme/search"` mount.

## Dark mode & theming

- Toggle mechanism: `.dark` class on `document.documentElement` +
  `localStorage["lark-docs-theme"]` (`"dark"`/`"light"`; absent = system
  preference). The toggle view syncs across instances with a
  MutationObserver. Put the no-FOUC snippet in `index.html`.
- `client.css` (Tailwind CSS v4, CSS-first config): shadcn-style semantic
  tokens (`--background --foreground --card --primary --secondary --muted
--accent --destructive --border --input --ring --sidebar --code
--callout-warning --callout-danger --radius`) declared on `:root` and
  flipped under `.dark`, mapped into Tailwind via `@theme inline` so
  `bg-background` / `text-primary` utilities work. Includes typography-plugin
  prose overrides, `.codeblock`/`.callout` chrome, `docs-grid` /
  `sidebar-scroll` / `skeleton` utilities, entry animations, and a
  `prefers-reduced-motion` guard.
- **Customize colors** by overriding the CSS variables on `:root` / `.dark`
  after importing `client.css` — no Tailwind config needed.
- Consumer Tailwind setup must `@source` the theme bundle so utility classes
  used in theme templates are generated:
  `@source "../node_modules/@lark.js/lark-docs/dist/theme.js";`

## Icons

`icons` (exported from the main entry / `theme`) is a map of raw lucide SVG
strings (`search menu x sun moon chevronDown chevronRight copy check list
arrowUpRight arrowLeft arrowRight compass info triangleAlert octagonAlert`),
plus `clockIcons[12]` (the hour-aware navbar logo). Render with `{{!icons.x}}`;
size/color via the wrapper span (`[&>svg]:size-full`, `text-primary`).

## Overriding theme views

Two levels:

1. **CSS only** — override token variables and/or prose rules.
2. **Replace a view** — after `registerThemeViews()`, re-register any path
   with your own setup (last registration wins), reusing a factory with a
   custom template or writing a fresh `defineView`:

```ts
import { registerThemeViews, createSidebarView } from "@lark.js/lark-docs";
import { registerViewClass } from "@lark.js/lark-mvc";
import mySidebarTpl from "./my-sidebar.html";

registerThemeViews({ vdom: false });
registerViewClass("theme/sidebar", createSidebarView(mySidebarTpl));
```

Keep the State contract (read `docsConfig`, honor `searchOpen`/`drawerOpen`,
navigate via `data-href` + `Router.to`) so the other stock views keep
working. `@lark.js/lark-docs/runtime` exports the browser-safe `slugify` for
custom TOC/anchor logic.
