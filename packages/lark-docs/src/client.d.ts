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

/// <reference types="vite/client" />
// HTML template module declarations
// Lark's Vite/Webpack/Rspack plugin compiles .html files into template
// functions at build time. The default export is a function, not a string.

declare module "*.html" {
  import type { ViewTemplate } from "@lark.js/mvc";

  const template: ViewTemplate;
  export default template;
}

/**
 * Type declarations for theme template virtual modules.
 *
 * These modules are resolved at build time by the themeTemplates Vite plugin
 * (see vite.config.ts). Each virtual module reads the corresponding .html
 * file from src/theme/ and compiles it via compileTemplate().
 */

declare module "virtual:lark-docs/docs-layout" {
  import type { ViewTemplate } from "@lark.js/mvc";
  const template: ViewTemplate;
  export default template;
}

declare module "virtual:lark-docs/sidebar" {
  import type { ViewTemplate } from "@lark.js/mvc";
  const template: ViewTemplate;
  export default template;
}

declare module "virtual:lark-docs/toc" {
  import type { ViewTemplate } from "@lark.js/mvc";
  const template: ViewTemplate;
  export default template;
}

declare module "virtual:lark-docs/search" {
  import type { ViewTemplate } from "@lark.js/mvc";
  const template: ViewTemplate;
  export default template;
}

declare module "virtual:lark-docs/theme-toggle" {
  import type { ViewTemplate } from "@lark.js/mvc";
  const template: ViewTemplate;
  export default template;
}

declare module "@lark-docs/generated" {
  import type { DocsConfig, PageData } from "@lark.js/docs";

  export function loadContent(
    path: string,
  ): Promise<{ pageData: PageData; contentHtml: string } | null>;

  export const routes: Record<string, string>;

  export const docsConfig: DocsConfig;

  export interface SearchEntry {
    title: string;
    link: string;
    headings: string[];
    excerpt: string;
    /** Compiled page HTML — split into per-section search entries at runtime. */
    contentHtml: string;
  }

  export function getSearchIndex(): Promise<SearchEntry[]>;

  /**
   * Subscribe to dev-mode markdown hot updates. The callback receives the
   * route paths whose content changed. Returns an unsubscribe function.
   * No-op in production builds.
   */
  export function onContentUpdate(cb: (routes: string[]) => void): () => void;
}
