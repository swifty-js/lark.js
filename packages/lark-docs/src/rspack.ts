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
 * Rspack loader and plugin for @lark.js/docs.
 *
 * Mirrors the Webpack integration but returns a Promise directly
 * (Rspack async loaders must return the result, not call this.callback()).
 * Only .md files are handled — configure the @lark.js/mvc rspack
 * integration separately for view HMR.
 *
 * Usage:
 * ```ts
 * import { LarkDocsPlugin } from "@lark.js/docs/rspack";
 *
 * export default {
 *   plugins: [new LarkDocsPlugin({ config: docsConfig })],
 * };
 * ```
 */
import type { DocsConfig } from "./types";
import { compileMarkdown } from "./compile-markdown";

// Re-export build-time utilities for use in rspack.config
// (avoids importing from main entry which pulls in lucide-static SVG ?raw imports)
export { scanDocsDir } from "./scanner";
export { generateSidebar } from "./sidebar-generator";
export type { DocsConfig, SidebarConfig } from "./types";

export interface LarkDocsRspackOptions {
  /** Full docs config. */
  config: DocsConfig;
  /** Test regex. Default: /\.md$/ */
  test?: RegExp;
  /** Exclude regex. Default: /node_modules/ */
  exclude?: RegExp;
}

interface RspackLoaderContext {
  getOptions: () => LarkDocsRspackOptions;
  resourcePath: string;
}

/**
 * Rspack loader function.
 * Returns a Promise directly (Rspack async loaders must return the result).
 */
export async function larkDocsLoader(
  this: RspackLoaderContext,
  source: string,
): Promise<string> {
  const options = this.getOptions();
  return await compileMarkdown(source, {
    config: options.config,
    filePath: this.resourcePath,
  });
}

/**
 * Rspack plugin that auto-registers the .md loader rule.
 */
export class LarkDocsPlugin {
  private options: LarkDocsRspackOptions;

  constructor(options: LarkDocsRspackOptions) {
    this.options = options;
  }

  apply(compiler: {
    options: { module: { rules: Array<Record<string, unknown>> } };
  }): void {
    const test = this.options.test || /\.md$/;
    const exclude = this.options.exclude || /node_modules/;

    // __filename is injected by the CJS_SHIMS banner (see vite.config.ts)
    // for chunks that reference __filename/__dirname. Rspack resolves the
    // loader via this absolute path to the compiled .cjs output.
    compiler.options.module.rules.push({
      test,
      exclude,
      use: [
        {
          loader: __filename,
          options: this.options,
        },
      ],
    });
  }
}
