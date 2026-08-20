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
 * @lark.js/mvc Webpack Integration for Template Compilation
 *
 * Provides two integration modes:
 *
 * 1. **Loader** (larkMvcLoader) — Direct file transformation
 *    - Transforms .html files into JS function modules
 *    - Requires manual webpack.config.mjs setup
 *
 * 2. **Plugin** (LarkMvcPlugin) — Auto-registers the loader
 *    - Automatically configures the loader rule for .html files
 *    - Zero-config: just add the plugin to your webpack config
 *    - Recommended approach for most use cases
 *
 * Features:
 * - All template operators: = (escape), ! (raw), @ (ref lookup), : (binding)
 * - @event attribute processing with \x1f prefix + \x1e separator
 * - __lark_enc_html__ (HTML entity encode), __lark_str_safe__ (null-safe toString), __lark_ref_fn__ (reference lookup)
 * - View ID injection
 * - Auto variable extraction via AST analysis (Babel)
 *
 * Usage with Plugin (recommended):
 * ```js
 * import { LarkMvcPlugin } from '@lark.js/mvc/webpack';
 *
 * export default {
 *   plugins: [
 *     new LarkMvcPlugin(),
 *   ],
 * };
 * ```
 *
 * Usage with Loader (manual):
 * ```js
 * export default {
 *   module: {
 *     rules: [{
 *       test: /\.html$/,
 *       loader: '@lark.js/mvc/webpack',
 *     }],
 *   },
 * };
 * ```
 */
import { compileTemplate, extractGlobalVars } from "./compiler";
import { injectTemplateHmrSnippet, injectViewHmrSnippet } from "./hmr-inject";
export type LarkMvcWebpackLoaderOptions = {
  hmr?: "view";
};

/** Webpack loader context */
interface LoaderContext {
  /** Whether in development mode */
  dev?: boolean;
  /** Loader options */
  getOptions: () => LarkMvcWebpackLoaderOptions;
}

/** Plugin options */
export interface LarkMvcWebpackPluginOptions extends LarkMvcWebpackLoaderOptions {
  /** File extension to match (default: /\.html$/) */
  test?: RegExp;
  /** Exclude pattern (default: /node_modules/) */
  exclude?: RegExp;
}

/**
 * Webpack loader entry point.
 * Compiles .html template files into JS function modules.
 *
 * Uses this.callback() for async result delivery — this is the standard
 * webpack pattern for async loaders. Unlike rspack, webpack 5 does not
 * reliably support returning a Promise from the loader function; the
 * callback approach works across all webpack 5.x versions.
 */
async function larkMvcLoader(this: LoaderContext, source: string): Promise<string> {
  try {
    const options = this.getOptions() || {};
    const { hmr } = options;

    // View HMR mode: inject view-class HMR into .ts files that import .html.
    // This is the webpack equivalent of Vite's `transform` hook — ensures .ts
    // view file changes self-accept and hot-swap in place, preserving state.
    if (hmr === "view") {
      return injectViewHmrSnippet(source, "webpack");
    }

    const globalVars = await extractGlobalVars(source);
    const compiled = await compileTemplate(source, {
      globalVars,
    });
    // Auto-inject HMR: the compiled template module self-accepts, so
    // .html changes hot-swap the template on all mounted views without
    // a full page reload — no user-side code required (like React/Vue).

    return injectTemplateHmrSnippet(compiled, "webpack");
  } catch (err) {
    console.error(err);
    return "";
  }
}

/**
 * Webpack plugin that auto-registers the @lark.js/mvc loader.
 *
 * This is the recommended integration approach. The plugin:
 * 1. Automatically adds a loader rule for .html files
 * 2. Passes through all configuration options
 * 3. Handles edge cases (e.g., excluding node_modules)
 *
 * Usage:
 * ```js
 * import { LarkMvcPlugin } from '@lark.js/mvc/webpack';
 *
 * export default {
 *   plugins: [
 *     new LarkMvcPlugin(),
 *   ],
 * };
 * ```
 */
class LarkMvcPlugin {
  private options: LarkMvcWebpackPluginOptions;

  constructor(options: LarkMvcWebpackPluginOptions = {}) {
    this.options = {
      test: /\.html$/,
      exclude: /node_modules/,
      ...options,
    };
  }

  /**
   * Webpack plugin entry point.
   * Called by webpack when the plugin is applied.
   */
  apply(compiler: {
    options: {
      module: {
        rules: unknown[];
      };
    };
  }): void {
    const { test, exclude } = this.options;

    // Push the loader rule into webpack's module.rules
    compiler.options.module = compiler.options.module || {};
    compiler.options.module.rules = compiler.options.module.rules || [];

    // Rule 1: .html template compilation + HMR injection.
    // `type: "javascript/auto"` ensures webpack treats the loader output as a
    // JavaScript module (not an asset), which is required for
    // `import.meta.webpackHot` to be available at runtime.
    compiler.options.module.rules.push({
      test,
      exclude,
      type: "javascript/auto",
      use: [
        {
          // Resolve the loader path (this file).
          // __filename is provided by tsup's ESM shim (shims: true) in ESM output,
          // and is a native CJS global in CJS output.
          loader: __filename,
        },
      ],
    });

    // Rule 2: .ts/.js view file HMR injection.
    // This is the webpack equivalent of Vite's `transform` hook. When a .ts
    // view file (one that imports a .html template) changes, the injected
    // HMR code makes the module self-accept and hot-swap the view setup
    // function in place — preserving view-local state.
    //
    // `enforce: "pre"` ensures this loader runs BEFORE ts-loader/SWC,
    // receiving the raw TypeScript source. The injected code is TypeScript-
    // compatible (uses `import.meta.webpackHot` which TS recognizes).
    compiler.options.module.rules.push({
      test: /\.[jt]s$/,
      exclude: /node_modules/,
      enforce: "pre",
      use: [
        {
          loader: __filename,
          options: { hmr: "view" },
        },
      ],
    });
  }
}

export { larkMvcLoader, LarkMvcPlugin };
export { larkMvcLoader as default };
