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
 * HMR injection code generator — shared across Vite, Webpack, and Rspack.
 *
 * ## Why this file exists
 *
 * React's `@vitejs/plugin-react` and Vue's `@vitejs/plugin-vue` auto-inject
 * HMR boilerplate at compile time so users never write `import.meta.hot`
 * themselves. Lark's bundler integrations do the same for view modules:
 * any `.tsx` / `.jsx` / `.ts` / `.js` file whose default export is a
 * `defineView(...)` setup self-accepts, and on update calls
 * `hotSwapByView(old, new)` to swap the setup function on every mounted
 * instance — preserving view-local state (the `jsxTemplate` closure lives
 * inside the view module, so template edits ride the same swap).
 *
 * ## Cross-bundler HMR API differences
 *
 * | Bundler        | HMR context              | accept(cb) semantics                              |
 * |----------------|--------------------------|---------------------------------------------------|
 * | Vite           | `import.meta.hot`        | cb IS the update-success callback (gets newModule)|
 * | Webpack (ESM)  | `import.meta.webpackHot` | cb is an ERROR handler (never runs on success)     |
 * | Rspack         | `import.meta.webpackHot` | cb is an ERROR handler (never runs on success)     |
 *
 * This asymmetry is the root cause of historic webpack/rspack HMR bugs:
 * swap logic placed inside `accept(cb)` never executed on successful
 * updates. The fix: Vite uses `accept(cb)` with swap inside cb;
 * webpack/rspack use the self-accept pattern — `accept()` (no args) +
 * `dispose()` + a top-level `import.meta.webpackHot.data` check that runs
 * when the module re-executes after an update.
 *
 * Access to the framework's swap function goes through
 * `globalThis.__lark_hmr__` (registered by ./hmr.ts and Framework.boot), NOT
 * via import/require of "@lark.js/mvc". Under Module Federation
 * (`@lark.js/mvc` shared singleton), ANY import of @lark.js/mvc inside an
 * HMR callback registers the module as a shared consumer, which causes
 * webpack to mark the main chunk as needing a hot-update it never emits →
 * ChunkLoadError. globalThis sidesteps all module-resolution side effects.
 */

// ============================================================
// Types
// ============================================================

/** Supported bundler identifiers. */
export type Bundler = "vite" | "webpack" | "rspack";

// ============================================================
// View setup HMR injection
// ============================================================

/**
 * Generate the HMR snippet for a view module.
 *
 * The snippet references `__lark_view__`, a named const holding the view
 * setup function. `injectViewHmrSnippet` (below) rewrites
 * `export default defineView(...)` into
 * `const __lark_view__ = defineView(...); export default __lark_view__;`
 * so the HMR callback can capture the old setup reference.
 */
function getViewHmrSnippet(bundler: Bundler): string {
  if (bundler === "vite") {
    return `
// Auto-injected by larkMvcPlugin
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldView = __lark_view__;
  });
  import.meta.hot.accept((newMod) => {
    const newView = newMod?.default;
    const oldView = import.meta.hot.data?.oldView;
    if (oldView && newView && oldView !== newView) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByView) hmr.hotSwapByView(oldView, newView);
    }
  });
}
`;
  }

  // Webpack / Rspack — self-accept pattern: `accept()` (no args) marks the
  // module self-accepted; on update the runtime disposes the old module and
  // RE-EXECUTES the module in place, with `import.meta.webpackHot.data`
  // already populated by the dispose callback. The top-level data check
  // distinguishes HMR re-execution from first load.
  return `
// Auto-injected by larkMvcPlugin
if (import.meta.webpackHot) {
  const oldView = import.meta.webpackHot.data?.oldView;
  if (oldView) {

    const newView = __lark_view__;
    if (oldView !== newView) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByView) hmr.hotSwapByView(oldView, newView);
    }
  }
  import.meta.webpackHot.dispose((data) => {
    data.oldView = __lark_view__;
  });
  import.meta.webpackHot.accept((err) => {
    if (err) {
      console.error(err);
      globalThis.location?.reload();
    }
  });
}
`;
}

/** Regex to detect a `defineView(` call in a view module source. */
const DEFINE_VIEW_RE = /\bdefineView\s*\(/;

/**
 * Quick check: does this source look like a Lark view module?
 *
 * Used by the bundler integrations to decide whether to inject view HMR.
 * Files without a `defineView(...)` call are left untouched.
 */
export function isLarkViewSource(source: string): boolean {
  return DEFINE_VIEW_RE.test(source);
}

/**
 * Transform a view module source to add view setup HMR.
 *
 * Strategy (no expression scanning — works for any legal statement,
 * including `as` casts, ternaries, and JSX text containing apostrophes):
 *
 * 1. Check the source contains a `defineView(...)` call. If not, return as-is.
 * 2. Replace the `export default ` keywords (at a line start, top level by
 *    convention) with `const __lark_view__ = ` — the rest of the original
 *    statement, whatever it is, now initializes the const.
 * 3. Append `export default __lark_view__;` and the HMR snippet at the end
 *    of the file (the const is initialized by then; nothing else in a module
 *    can reference its own default export, so moving the export is safe).
 *
 * Idempotent: sources already containing `__lark_view__` are returned
 * unchanged, so double-registration (plugin + manual loader rule) cannot
 * produce `const __lark_view__ = __lark_view__;`.
 *
 * If the source has no line-leading `export default`, it is returned
 * unchanged — factory modules that export named `createXxxView()` helpers
 * hot-swap through their importers instead.
 *
 * @param source - The view module source code (TS/TSX/JS/JSX)
 * @param bundler - Which bundler's HMR API to use
 * @returns The transformed source with HMR code, or the original if ineligible
 */
export function injectViewHmrSnippet(source: string, bundler: Bundler): string {
  if (!isLarkViewSource(source)) return source;
  // Idempotency guard — already transformed (or user-reserved identifier).
  if (source.includes("__lark_view__")) return source;

  // Line-leading match only: avoids `export default` text inside block
  // comments (`* export default ...`) and line comments (`// export ...`).
  const exportDefaultRe = /^[ \t]*export\s+default\s+/m;
  const match = exportDefaultRe.exec(source);
  if (!match) return source;

  const transformed =
    source.slice(0, match.index) +
    "const __lark_view__ = " +
    source.slice(match.index + match[0].length) +
    "\nexport default __lark_view__;\n" +
    getViewHmrSnippet(bundler);

  return transformed;
}
