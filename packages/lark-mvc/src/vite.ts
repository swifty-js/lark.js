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
 * @lark.js/mvc Vite Plugin.
 *
 * Zero-config integration for JSX views:
 *
 * 1. **JSX transform defaults** — configures the oxc automatic JSX runtime
 *    with `jsxImportSource: "@lark.js/mvc"` (unless the user already set one),
 *    so `.tsx` / `.jsx` files compile against `@lark.js/mvc/jsx-runtime`
 *    without any tsconfig/vite tweaking.
 * 2. **View HMR** — auto-injects state-preserving HMR into every module whose
 *    default export is a `defineView(...)` setup. Editing a view (template
 *    JSX included) hot-swaps all mounted instances in place — no
 *    `import.meta.hot` boilerplate required.
 *
 * Usage in vite.config.ts:
 * ```ts
 * import { larkMvcPlugin } from '@lark.js/mvc/vite';
 *
 * export default defineConfig({
 *   plugins: [larkMvcPlugin()],
 * });
 * ```
 */
import type { Plugin, UserConfig } from "vite";
import { injectViewHmrSnippet, isLarkViewSource } from "./hmr-inject";

/** Module ids eligible for view-HMR injection. */
const VIEW_MODULE_ID_REGEXP = /\.[jt]sx?$/;

/**
 * Create the Lark Mvc Vite plugin.
 *
 * @returns Vite plugin instance
 */
export function larkMvcPlugin(): Plugin {
  return {
    name: "lark-mvc",
    enforce: "pre",

    /**
     * Default the oxc JSX transform to the Lark automatic runtime.
     * User-provided `oxc.jsx` settings always win; `oxc: false` disables
     * the transform entirely and `jsx: "preserve"` is respected.
     */
    config(userConfig): UserConfig | undefined {
      const oxc = userConfig.oxc;
      if (oxc === false) return undefined;
      const jsx = oxc?.jsx;
      if (jsx === "preserve") return undefined;
      const patch: { runtime?: "automatic"; importSource?: string } = {};
      if (!jsx?.runtime) patch.runtime = "automatic";
      if (!jsx?.importSource) patch.importSource = "@lark.js/mvc";
      if (Object.keys(patch).length === 0) return undefined;
      return { oxc: { jsx: patch } };
    },

    /**
     * Transform hook: inject view HMR into `defineView` modules.
     *
     * When a view file changes, the auto-injected snippet captures the old
     * setup function (via dispose) and the new one (via accept), then calls
     * `hotSwapByView(old, new)` to hot-swap all mounted views — preserving
     * state. The `jsxTemplate` closure is recreated by the re-run setup, so
     * template edits are covered by the same swap.
     */
    transform(code, id) {
      // Only process script modules (query-suffixed ids excluded)
      if (!VIEW_MODULE_ID_REGEXP.test(id.split("?")[0])) return undefined;
      if (id.includes("node_modules")) return undefined;
      // Fast-path: skip modules that don't define a view. Returning the
      // unchanged string would be treated as a transformation by Rolldown,
      // triggering [SOURCEMAP_BROKEN] warnings when build.sourcemap is true.
      if (!isLarkViewSource(code)) return undefined;
      const transformed = injectViewHmrSnippet(code, "vite");
      // If no `export default` was found, injectViewHmrSnippet returns the
      // source unchanged — skip to avoid a no-op transformation.
      if (transformed === code) return undefined;
      // Return { code, map: null } so Rolldown knows we don't emit a
      // sourcemap for the HMR injection, suppressing SOURCEMAP_BROKEN.
      return { code: transformed, map: null };
    },
  };
}

export default larkMvcPlugin;
