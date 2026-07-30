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
 * @lark.js/docs barrel exports.
 *
 * Main entry point — browser-safe exports only.
 * Includes re-exports from @lark.js/mvc so consumers only need
 * to install @lark.js/docs — no separate @lark.js/mvc dependency required.
 *
 * Build-time utilities (defineConfig, scanDocsDir, generateSidebar, etc.)
 * are available from sub-path exports:
 *   - "@lark.js/docs/vite"     (Vite plugin + build-time helpers)
 *   - "@lark.js/docs/webpack"  (Webpack loader + build-time helpers)
 *   - "@lark.js/docs/rspack"   (Rspack loader + build-time helpers)
 *   - "@lark.js/docs/compiler" (compileMarkdown)
 */

import type { FrameworkConfig as LarkNextFrameworkConfig } from "@lark.js/mvc";

// ============================================================
// Re-exports from @lark.js/mvc (so consumers don't need it directly)
// ============================================================

export {
  Framework,
  defineView,
  State,
  Router,
  registerViewClass,
} from "@lark.js/mvc";

export type FrameworkConfig = Omit<LarkNextFrameworkConfig, "routeMode"> & {
  routeMode: "history";
};

export type { ViewCtx, ViewSetup } from "@lark.js/mvc";

// ============================================================
// @lark.js/docs types (browser-safe)
// ============================================================

export type {
  DocsConfig,
  NavItem,
  SidebarConfig,
  SidebarItem,
  MarkdownOptions,
  HighlightOptions,
  PageData,
  HeadingInfo,
  DocsRoute,
  SearchEntry,
  FrontmatterResult,
  CompileMarkdownOptions,
} from "./types";

// ============================================================
// Runtime utilities (browser-safe)
// ============================================================

// Browser-safe runtime utility (also available at @lark.js/docs/runtime)
export { slugify } from "./runtime";

// Theme view factories
export {
  createDocsLayoutView,
  createSidebarView,
  createTocView,
  createSearchView,
  registerThemeViews,
} from "./theme";

// Theme icons (lucide-static raw SVG strings)
export { icons } from "./theme/icons";
