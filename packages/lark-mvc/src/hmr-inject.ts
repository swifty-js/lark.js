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
 * themselves. Lark's bundler integrations do the same for component modules:
 * any `.tsx` / `.jsx` file with a line-leading `export default` self-accepts,
 * and on update calls `hotSwapByComponent(old, new)` to swap the function on
 * every live instance — preserving `useSignal`/`useRef` state.
 *
 * There is no compile-time "is this a component?" marker (components are
 * plain functions), so the gate is intentionally broad and the RUNTIME is
 * the guard: the snippet checks `typeof === "function"`, and
 * `hotSwapByComponent` no-ops when the old value has no live instances and
 * no registry entry. A `.tsx` file default-exporting a config object simply
 * self-accepts and does nothing.
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
// Component HMR injection
// ============================================================

/**
 * Generate the HMR snippet for a component module.
 *
 * The snippet references `__lark_component__`, a named const holding the
 * module's default export. `injectComponentHmrSnippet` (below) rewrites
 * `export default <expr>` into
 * `const __lark_component__ = <expr>; export default __lark_component__;`
 * so the HMR callback can capture the old reference.
 */
function getComponentHmrSnippet(bundler: Bundler): string {
  if (bundler === "vite") {
    return `
// Auto-injected by larkMvcPlugin
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldComponent = __lark_component__;
  });
  import.meta.hot.accept((newMod) => {
    const newComponent = newMod?.default;
    const oldComponent = import.meta.hot.data?.oldComponent;
    if (
      typeof oldComponent === "function" &&
      typeof newComponent === "function" &&
      oldComponent !== newComponent
    ) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByComponent) hmr.hotSwapByComponent(oldComponent, newComponent);
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
  const oldComponent = import.meta.webpackHot.data?.oldComponent;
  if (oldComponent) {
    const newComponent = __lark_component__;
    if (
      typeof oldComponent === "function" &&
      typeof newComponent === "function" &&
      oldComponent !== newComponent
    ) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByComponent) hmr.hotSwapByComponent(oldComponent, newComponent);
    }
  }
  import.meta.webpackHot.dispose((data) => {
    data.oldComponent = __lark_component__;
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

/**
 * Line-leading `export default` — avoids matches inside block comments
 * (`* export default ...`) and line comments (`// export ...`).
 */
const EXPORT_DEFAULT_REGEXP = /^[ \t]*export\s+default\s+/m;

/**
 * Quick check: is this source eligible for component HMR injection?
 *
 * Any module with a line-leading `export default` qualifies — components
 * are plain functions with no compile-time marker, so the runtime snippet's
 * `typeof` guard and `hotSwapByComponent`'s no-live-instance no-op carry the
 * real filtering. Bundler integrations additionally restrict by file
 * extension (`.tsx` / `.jsx`).
 */
export function isLarkComponentSource(source: string): boolean {
  return EXPORT_DEFAULT_REGEXP.test(source);
}

/**
 * Transform a component module source to add component HMR.
 *
 * Strategy (no expression scanning — works for any legal statement,
 * including `as` casts, ternaries, and JSX text containing apostrophes):
 *
 * 1. Replace the `export default ` keywords (at a line start, top level by
 *    convention) with `const __lark_component__ = ` — the rest of the
 *    original statement, whatever it is, now initializes the const.
 * 2. Append `export default __lark_component__;` and the HMR snippet at the
 *    end of the file (the const is initialized by then; nothing else in a
 *    module can reference its own default export, so moving the export is
 *    safe).
 *
 * `export default function Name() {}` also works: the rewrite turns it into
 * `const __lark_component__ = function Name() {}` — a named function
 * expression, still hoist-free but initialized before the appended export.
 *
 * Idempotent: sources already containing `__lark_component__` are returned
 * unchanged, so double-registration (plugin + manual loader rule) cannot
 * produce `const __lark_component__ = __lark_component__;`.
 *
 * If the source has no line-leading `export default`, it is returned
 * unchanged — factory modules that export named helpers hot-swap through
 * their importers instead.
 *
 * @param source - The component module source code (TSX/JSX)
 * @param bundler - Which bundler's HMR API to use
 * @returns The transformed source with HMR code, or the original if ineligible
 */
export function injectComponentHmrSnippet(source: string, bundler: Bundler): string {
  // Idempotency guard — already transformed (or user-reserved identifier).
  if (source.includes("__lark_component__")) return source;

  const match = EXPORT_DEFAULT_REGEXP.exec(source);
  if (!match) return source;

  return (
    source.slice(0, match.index) +
    "const __lark_component__ = " +
    source.slice(match.index + match[0].length) +
    "\nexport default __lark_component__;\n" +
    getComponentHmrSnippet(bundler)
  );
}
