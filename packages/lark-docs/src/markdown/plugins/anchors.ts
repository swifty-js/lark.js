/**
 * Custom markdown-it plugin: heading anchor IDs and permalink symbols.
 *
 * Adds `id="slug"` to heading tokens and optionally injects a `#` permalink
 * anchor link for h1-h3 headings. Uses the shared createSlugger so IDs
 * always match the slugs in pageData.headings (TOC).
 */
import type MarkdownIt from "markdown-it";
import { createSlugger } from "../../utils/slugify";
import type { StateCore } from "markdown-it/index.js";

export interface AnchorOptions {
  /** Add a permalink `#` symbol after headings. Default: true */
  permalink?: boolean;
}

export function anchorPlugin(md: MarkdownIt, options?: AnchorOptions): void {
  const addPermalink = options?.permalink ?? true;

  md.core.ruler.push("heading_anchors", (state: StateCore) => {
    const slugger = createSlugger();

    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type !== "heading_open") continue;

      const level = parseInt(token.tag.slice(1), 10);
      const nextToken = state.tokens[i + 1];
      const text =
        nextToken?.children
          ?.filter((t) => t.type === "text" || t.type === "code_inline")
          .map((t) => t.content)
          .join("") ?? "";

      const slug = slugger(text);
      token.attrSet("id", slug);

      if (addPermalink && level <= 3 && nextToken?.children) {
        const anchorToken = new state.Token("html_inline", "", 0);
        anchorToken.content = ` <a class="header-anchor" href="#${slug}" aria-label="Link to this section">#</a>`;
        nextToken.children.push(anchorToken);
      }
    }
  });
}
