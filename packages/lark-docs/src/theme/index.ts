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
 * theme component. Each factory takes a single argument: the pre-compiled
 * template to render with.
 */
import { registerViewClass } from "@lark.js/mvc";

import docLayoutTemplate from "virtual:lark-docs/docs-layout";
import sidebarTemplate from "virtual:lark-docs/sidebar";
import tocTemplate from "virtual:lark-docs/toc";
import searchTemplate from "virtual:lark-docs/search";
import themeToggleTemplate from "virtual:lark-docs/theme-toggle";

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
  registerViewClass(
    "theme/docs-layout",
    createDocsLayoutView(docLayoutTemplate),
  );
  registerViewClass("theme/sidebar", createSidebarView(sidebarTemplate));
  registerViewClass("theme/toc", createTocView(tocTemplate));
  registerViewClass("theme/search", createSearchView(searchTemplate));
  registerViewClass(
    "theme/theme-toggle",
    createThemeToggleView(themeToggleTemplate),
  );
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
