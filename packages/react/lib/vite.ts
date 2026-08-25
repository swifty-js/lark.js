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
 * @lark.js/react Vite plugin — zero-config JSX + state-preserving HMR.
 *
 * 1. **JSX transform defaults** — configures the esbuild automatic JSX
 *    runtime with `jsxImportSource: "@lark.js/react"` (unless the user
 *    already set one), so `.tsx` / `.jsx` files compile against
 *    `@lark.js/react/jsx-runtime` without tsconfig/vite tweaking.
 * 2. **Component HMR** — auto-injects state-preserving HMR into every
 *    `.tsx` / `.jsx` module with a line-leading default export. Editing a
 *    component hot-swaps all live instances in place (`useState`/`useRef`
 *    state survives) — no `import.meta.hot` boilerplate required.
 *
 * There is no compile-time "is this a component?" marker (components are
 * plain functions), so the gate is intentionally broad and the RUNTIME is the
 * guard: the snippet checks `typeof === "function"`, and `hotSwapByComponent`
 * no-ops on non-functions. A `.tsx` file default-exporting a config object
 * simply self-accepts and does nothing.
 *
 * Usage in vite.config.ts:
 * ```ts
 * import { larkReactPlugin } from "@lark.js/react/vite";
 *
 * export default defineConfig({
 *   plugins: [larkReactPlugin()],
 * });
 * ```
 */
import type { Plugin, UserConfig } from "vite";

/** Module ids eligible for component-HMR injection (JSX modules only) */
const COMPONENT_MODULE_ID_REGEXP = /\.[jt]sx$/;

/**
 * Line-leading `export default` — avoids matches inside block comments
 * (`* export default ...`) and line comments (`// export ...`).
 */
const EXPORT_DEFAULT_REGEXP = /^[ \t]*export\s+default\s+/m;

/**
 * Named function/class declaration following `export default `. These must
 * KEEP their declaration form: const-wrapping them into expressions would
 * remove the module-scope name binding, breaking any other module-scope
 * reference (`App.displayName = ...`).
 */
const NAMED_DECLARATION_REGEXP =
  /^(?:(?:async\s+)?function(?:\s*\*)?|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

/**
 * The injected snippet captures the old default export via dispose and the
 * new one via accept, then calls `hotSwapByComponent(old, new)` through the
 * `globalThis.__lark_react_hmr__` handle (registered by lib/index.ts) —
 * NEVER by importing "@lark.js/react": under Module Federation an import
 * inside an HMR callback registers the module as a shared consumer →
 * ChunkLoadError.
 */
const COMPONENT_HMR_SNIPPET = `
// Auto-injected by larkReactPlugin
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldComponent = __lark_react_component__;
  });
  import.meta.hot.accept((newMod) => {
    const newComponent = newMod?.default;
    const oldComponent = import.meta.hot.data?.oldComponent;
    if (
      typeof oldComponent === "function" &&
      typeof newComponent === "function" &&
      oldComponent !== newComponent
    ) {
      globalThis.__lark_react_hmr__?.hotSwapByComponent(oldComponent, newComponent);
    }
  });
}
`;

/**
 * Transform a component module source to add component HMR.
 *
 * 1. **Named function/class declarations** (`export default function App()`)
 *    keep their declaration: the `export default ` keywords are dropped so
 *    the declaration stays in module scope, and the alias + default export
 *    are appended at EOF (function declarations hoist; classes are declared
 *    before the EOF alias runs either way).
 * 2. **Everything else**: `export default ` is replaced with
 *    `const __lark_react_component__ = ` and the default export is appended
 *    at EOF (nothing else in a module can reference its own default export,
 *    so moving the export is safe).
 *
 * Idempotent: sources already containing `__lark_react_component__` are
 * returned unchanged.
 */
export function injectComponentHmrSnippet(source: string): string {
  if (source.includes("__lark_react_component__")) {
    return source;
  }

  const match = EXPORT_DEFAULT_REGEXP.exec(source);
  if (!match) {
    return source;
  }

  const bodyStart = match.index + match[0].length;
  const named = NAMED_DECLARATION_REGEXP.exec(source.slice(bodyStart));
  if (named) {
    return (
      source.slice(0, match.index) +
      source.slice(bodyStart) +
      `\nconst __lark_react_component__ = ${named[1]};\nexport default __lark_react_component__;\n` +
      COMPONENT_HMR_SNIPPET
    );
  }

  return (
    source.slice(0, match.index) +
    "const __lark_react_component__ = " +
    source.slice(bodyStart) +
    "\nexport default __lark_react_component__;\n" +
    COMPONENT_HMR_SNIPPET
  );
}

/**
 * Create the @lark.js/react Vite plugin.
 *
 * @returns Vite plugin instance
 */
export function larkReactPlugin(): Plugin {
  let isBuild = false;
  return {
    name: "lark-react",
    enforce: "pre",

    /**
     * Default the esbuild JSX transform to the Lark automatic runtime.
     * User-provided settings always win; `esbuild: false` disables the
     * transform entirely and `jsx: "preserve"` is respected.
     */
    config(userConfig): UserConfig | undefined {
      const esbuild = userConfig.esbuild;
      if (esbuild === false) return undefined;
      if (esbuild?.jsx === "preserve") return undefined;
      const patch: { jsx?: "automatic"; jsxImportSource?: string } = {};
      if (!esbuild?.jsx) patch.jsx = "automatic";
      if (!esbuild?.jsxImportSource) patch.jsxImportSource = "@lark.js/react";
      if (Object.keys(patch).length === 0) return undefined;
      return { esbuild: patch };
    },

    configResolved(config): void {
      isBuild = config.command === "build";
    },

    /**
     * Inject component HMR into `.tsx`/`.jsx` modules with a default export.
     * Dev-server only — the snippet would be dead code in production, so
     * builds skip the rewrite entirely.
     */
    transform(code, id) {
      if (isBuild) return undefined;
      // Only process JSX modules (query-suffixed ids excluded)
      if (!COMPONENT_MODULE_ID_REGEXP.test(id.split("?")[0])) return undefined;
      if (id.includes("node_modules")) return undefined;
      const transformed = injectComponentHmrSnippet(code);
      // Skip the no-op: returning an unchanged string counts as a transform
      // and would break sourcemaps.
      if (transformed === code) return undefined;
      // map: null tells the bundler no sourcemap exists for the injection
      return { code: transformed, map: null };
    },
  };
}

export default larkReactPlugin;
