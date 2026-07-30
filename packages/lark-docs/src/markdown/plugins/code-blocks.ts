/**
 * Custom markdown-it plugin: code block chrome.
 *
 * Overrides the default fence renderer to:
 * - Delegate to Shiki for syntax highlighting when configured
 * - Wrap output in a `.codeblock` container with a data-lang chip
 * - Fall back to escaped plain text on error
 */
import type MarkdownIt from "markdown-it";

export function codeBlockPlugin(md: MarkdownIt): void {
  md.renderer.rules.fence = (tokens, idx, mdOptions) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0] || "";
    const code = token.content;
    const displayLang = lang || "text";

    if (mdOptions.highlight) {
      const highlighted = mdOptions.highlight(code, lang, "");
      if (highlighted) {
        return `<div class="codeblock" data-lang="${escapeHtml(displayLang)}">${highlighted}</div>\n`;
      }
    }

    return `<div class="codeblock" data-lang="${escapeHtml(displayLang)}"><pre class="codeblock-plain"><code>${escapeHtml(code)}</code></pre></div>\n`;
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
