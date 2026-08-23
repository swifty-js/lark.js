/**
 * Copyright (c) 2026 hangtiancheng
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Theme view barrel exports.
 *
 * Exports factory functions that create lark-mvc view setups for each
 * theme component. Templates live inline in each view module as JSX
 * (`jsxTemplate`) — no separate template files or virtual modules.
 */
import { registerViewClass } from "@lark.js/mvc";

import { createDocsLayoutView } from "./docs-layout";
import { createSidebarView } from "./sidebar";
import { createTocView } from "./toc";
import { createSearchView } from "./search";
import { createThemeToggleView } from "./theme-toggle";

/**
 * Register all five built-in theme views (docs-layout, sidebar, toc, search,
 * theme-toggle) with the lark-mvc view registry.
 *
 * Must be called BEFORE `Framework.boot()` so the views exist when the
 * default view is mounted during boot:
 *
 * ```ts
 * registerThemeViews();
 * Framework.boot(config);
 * ```
 */
export function registerThemeViews(): void {
  registerViewClass("theme/docs-layout", createDocsLayoutView());
  registerViewClass("theme/sidebar", createSidebarView());
  registerViewClass("theme/toc", createTocView());
  registerViewClass("theme/search", createSearchView());
  registerViewClass("theme/theme-toggle", createThemeToggleView());
}

// Re-export factories and helpers for advanced users who want custom
// registration or to override individual theme views.
export { createDocsLayoutView } from "./docs-layout";
export { createSidebarView } from "./sidebar";
export { createTocView } from "./toc";
export { createSearchView } from "./search";
export { createThemeToggleView } from "./theme-toggle";
export { icons } from "./icons";
export { renderMermaidBlocks } from "./mermaid";
