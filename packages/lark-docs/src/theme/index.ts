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
 *
 * Templates are pre-compiled in BOTH string and VDOM modes during the
 * lib build. registerThemeViews selects the correct version based on
 * the consumer's FrameworkConfig.vdom setting.
 */
import { Framework } from "@lark.js/mvc";
import { registerViewClass } from "@lark.js/mvc";

// Dual-mode template imports — each virtual module exports __str (string-mode)
// and __vdom (VDOM-mode) compiled functions. The lib build's themeDualMode
// Vite plugin resolves virtual:lark-docs/* IDs and compiles each .html in
// both modes. Virtual modules are used instead of direct .html imports to
// avoid conflicts with larkMvcPlugin7 which intercepts all .html via resolveId.
import {
  __str as docLayoutStr,
  __vdom as docLayoutVdom,
} from "virtual:lark-docs/docs-layout";
import {
  __str as sidebarStr,
  __vdom as sidebarVdom,
} from "virtual:lark-docs/sidebar";
import { __str as tocStr, __vdom as tocVdom } from "virtual:lark-docs/toc";
import {
  __str as searchStr,
  __vdom as searchVdom,
} from "virtual:lark-docs/search";
import {
  __str as themeToggleStr,
  __vdom as themeToggleVdom,
} from "virtual:lark-docs/theme-toggle";

import { createDocsLayoutView } from "./docs-layout";
import { createSidebarView } from "./sidebar";
import { createTocView } from "./toc";
import { createSearchView } from "./search";
import { createThemeToggleView } from "./theme-toggle";

/**
 * Options for registerThemeViews.
 *
 * Pass `{ vdom }` explicitly when calling before `Framework.boot()` — which
 * is the required order, since the default view is mounted during boot.
 */
interface RegisterThemeViewsOptions {
  /**
   * Register VDOM-mode templates instead of string-mode ones.
   * Resolution order: this option → booted FrameworkConfig.vdom → false.
   */
  vdom?: boolean;
}

/**
 * Register all five built-in theme views (docs-layout, sidebar, toc, search,
 * theme-toggle) with the lark-mvc view registry.
 *
 * Must be called BEFORE `Framework.boot()` so the views exist when the
 * default view is mounted during boot:
 *
 * ```ts
 * const config: FrameworkConfig = { ..., vdom: true };
 * registerThemeViews({ vdom: config.vdom });
 * Framework.boot(config);
 * ```
 *
 * Templates are pre-compiled in both string and VDOM modes during the
 * lib build, so this function simply selects the correct version.
 */
export function registerThemeViews(options?: RegisterThemeViewsOptions): void {
  // Determine rendering mode: explicit option > Framework config > default
  const vdom =
    options?.vdom ??
    (Framework.isBooted()
      ? Framework.getConfig<boolean | undefined>("vdom")
      : undefined) ??
    false;

  const docLayout = vdom ? docLayoutVdom : docLayoutStr;
  const sidebar = vdom ? sidebarVdom : sidebarStr;
  const toc = vdom ? tocVdom : tocStr;
  const search = vdom ? searchVdom : searchStr;
  const themeToggle = vdom ? themeToggleVdom : themeToggleStr;

  registerViewClass("theme/docs-layout", createDocsLayoutView(docLayout));
  registerViewClass("theme/sidebar", createSidebarView(sidebar));
  registerViewClass("theme/toc", createTocView(toc));
  registerViewClass("theme/search", createSearchView(search));
  registerViewClass("theme/theme-toggle", createThemeToggleView(themeToggle));
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
