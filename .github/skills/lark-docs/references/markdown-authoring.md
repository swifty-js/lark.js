# Markdown Authoring Guide

Source of truth: `src/markdown/*` (parser, frontmatter, highlighter, plugins),
`src/compile-markdown.ts`, `src/utils/slugify.ts`,
`src/utils/heading-extraction.ts`, tests, and the real docs under
`packages/lark-docs/docs/`.

Parser base: `markdown-it` with `{ html: true, linkify: true, typographer: false }`
— inline HTML passes through, bare URLs auto-link.

## Frontmatter

YAML delimited by `---` at the very top (parsed with js-yaml; a bad YAML
block degrades gracefully to "no frontmatter"):

```markdown
---
title: Getting Started
description: Learn how to use the framework
sidebar_position: 1
sidebar_label: Get Started
draft: false
---
```

| Field              | Type    | Effect                                                                                              |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------- |
| `title`            | string  | Page title (else first h1, else filename-derived)                                                   |
| `description`      | string  | Meta/search description (else derived title)                                                        |
| `sidebar_position` | number  | 0-based sort key. **All-or-nothing per group**: any sibling missing it ⇒ everyone sorts by filename |
| `sidebar_label`    | string  | Sidebar display text override                                                                       |
| `draft`            | boolean | Excluded when scanner runs with `excludeDrafts`                                                     |

## Recommended page shape

```markdown
---
title: Page Title
description: One-line summary
sidebar_position: 0
---

# Page Title

Short intro paragraph.

## Main Section

## Another Section
```

Conventions from this repo's docs: one h1 per page; h2/h3 form the TOC
(deeper levels are not collected); numeric filename prefixes (`01-intro.md`,
`02-quick-start.md`) for ordering when not using `sidebar_position`; images
in `public/` referenced by absolute path.

## Headings & anchors

Every h1–h3 gets `id={slugify(text)}`, a `scroll-mt-20` class (sticky navbar
offset), and — unless `markdown.anchor.permalink: false` — a trailing
`<a class="header-anchor" href="#slug">#</a>`.

slugify rules (Unicode-aware): lowercase → non letter/number/space/dash → `-`
→ whitespace → `-` → collapse dashes → trim dashes → leading digit gets `_`
prefix (valid CSS selector). CJK is preserved.

| Heading         | Slug          |
| --------------- | ------------- |
| `Hello World`   | `hello-world` |
| `安装指南`      | `安装指南`    |
| `API 参考 (v2)` | `api-参考-v2` |
| `3.0 新特性`    | `_3-0-新特性` |

Duplicate heading texts dedupe as `foo`, `foo-1`, `foo-2`. Headings inside
fenced code blocks are ignored for the title chain, TOC, and anchors.

## Containers (admonitions)

```markdown
::: tip
Useful advice.
:::

::: warning Custom Title
Custom title after the type keyword.
:::

::: danger
Critical warning.
:::

::: details Click to expand
Collapsed content (renders as <details>/<summary>).
:::
```

Rendered as `.callout .callout-{type}` divs (`details` → `<details>`), each
with an inlined lucide icon and a label (default = TYPE uppercased,
overridable via `markdown.containers: { tip: { label: "提示" } }` or a custom
title after the type). Styled by `client.css` — tip and warning accents use
the `--primary` token, danger uses `--destructive`, details uses muted.

## [[toc]]

`[[toc]]` anywhere in a page compiles to
`<div v-lark="theme/toc" *inline="true"></div>` — an inline TOC child view
reading `State.currentPageHeadings`. The right rail already shows a TOC on
`xl+` screens, so inline `[[toc]]` is only for in-content tables of contents.

## Code fences

````markdown
```typescript
const x: number = 42;
```
````

- Output: `<div class="codeblock" data-lang="typescript">…` — the language
  chip renders from `data-lang`; a copy button is mounted at runtime by the
  layout view.
- With `highlight` configured, Shiki highlights at **build time**. Dual-theme
  mode (`darkTheme` set) emits `--shiki-light/--shiki-dark` per token with
  `defaultColor: false`; `.dark` on `<html>` switches schemes with zero
  runtime cost.
- Unloaded languages fall back to `text` grammar; no `highlight` config →
  escaped plain `<pre class="codeblock-plain">`.
- The default Shiki language set covers ~45 common languages; extend via
  `highlight.languages` (Shiki bundled-language ids).
- `${...}` inside content is emitted literally (contentHtml is a JSON string
  literal — never template-interpolated).

## Links

| Form                          | Behavior                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `[Guide](/lark/guide/config)` | Internal (starts with `/`): `lark-docs-nav="true"`, SPA navigation via Router. **Use the full path including baseUrl.** |
| `[Section](#安装)`            | Hash link — also internal                                                                                               |
| `[GitHub](https://…)`         | External: `target="_blank" rel="noopener noreferrer"`                                                                   |
| bare `https://example.com`    | Auto-linked (linkify)                                                                                                   |

## Compiled output

Each `.md` becomes a JS module:

```js
export const pageData = {
  title,
  description,
  excerpt,
  sidebarPosition,
  sidebarLabel,
  draft,
  headings,
  relativePath,
};
export const contentHtml = "…"; // pre-rendered HTML (JSON string literal)
```

`compileMarkdown(source, { config, filePath, debug?, projectRoot? })` is the
programmatic entry (`@lark.js/lark-docs/compiler`) — async because Shiki's WASM
init is lazy (per theme+languages cache key; `resetHighlighter()` for tests).
