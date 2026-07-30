/**
 * Custom markdown-it plugin: admonition containers.
 *
 * Supports the `::: type` syntax for tip, warning, danger, and details blocks.
 * Uses markdown-it-container under the hood for parsing, with custom render
 * functions that produce callout-styled markup with inline lucide icons.
 */
import type MarkdownIt from "markdown-it";
import container from "markdown-it-container";
import type { Token } from "markdown-it/index.js";

// Inlined lucide SVGs (MIT license) — this module runs at build time in
// plain Node, where Vite's ?raw import suffix is unavailable.
const ICON_INFO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
const ICON_TRIANGLE_ALERT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
const ICON_OCTAGON_ALERT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/></svg>';
const ICON_CHEVRON_RIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

const CONTAINER_TYPES = ["tip", "warning", "danger", "details"] as const;

const CALLOUT_ICON: Record<string, string> = {
  tip: ICON_INFO,
  warning: ICON_TRIANGLE_ALERT,
  danger: ICON_OCTAGON_ALERT,
  details: ICON_CHEVRON_RIGHT,
};

export interface ContainerOptions {
  [type: string]: { label: string };
}

export function containerPlugin(
  md: MarkdownIt,
  options?: ContainerOptions,
): void {
  for (const type of CONTAINER_TYPES) {
    const label = options?.[type]?.label ?? type.toUpperCase();
    const icon = CALLOUT_ICON[type] ?? "";

    md.use(container, type, {
      render(tokens: Token[], idx: number): string {
        if (tokens[idx].nesting === 1) {
          const customTitle = tokens[idx].info.trim().slice(type.length).trim();
          const title = customTitle || label;
          const escapedTitle = escapeHtml(title);

          if (type === "details") {
            return `<details class="callout callout-details"><summary class="callout-title">${icon}${escapedTitle}</summary>`;
          }
          return `<div class="callout callout-${type}"><p class="callout-title">${icon}${escapedTitle}</p>`;
        }
        return type === "details" ? "</details>" : "</div>";
      },
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
