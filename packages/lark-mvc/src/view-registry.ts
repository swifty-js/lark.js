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
 * View setup registry: viewPath -> ViewSetup function.
 *
 * The registry ALWAYS stores plain `ViewSetup` functions — branded
 * `LarkView` components are unwrapped on write (`resolveSetup`). String
 * paths remain the routing / lazy-loading / raw-HTML mounting currency;
 * components used as JSX tags get an auto-generated internal name via
 * `ensureViewName` on first serialization.
 */
import { parseUri } from "./utils";
import { isLarkView } from "./jsx/vnode";
import type { ViewSetup } from "./types";

/** Registry of view setup functions keyed by path. */
const viewSetupRegistry: Record<string, ViewSetup> = {};

/**
 * Auto-assigned internal names for view components used as JSX tags.
 * Keyed by the branded `LarkView` object (and aliased to its HMR
 * replacements), so the name — and therefore the frame's view path and the
 * DOM diff compare key — stays stable across renders and hot swaps.
 */
const viewNames = new WeakMap<object, string>();

/** Monotonic counter for auto-generated view names. */
let viewNameSeq = 0;

/**
 * Unwrap a branded `LarkView` component to its plain setup function.
 * Non-branded values are returned as-is (already a `ViewSetup`).
 */
export function resolveSetup(view: unknown): ViewSetup {
  return isLarkView(view) ? (view.setup as ViewSetup) : (view as ViewSetup);
}

/**
 * Get (or lazily create) the internal registry name for a view component.
 *
 * First call assigns `__vN` (suffixed with the setup function's name when it
 * has one, e.g. `__v1_ResumeHeader`) and registers the unwrapped setup under
 * that name. Explicitly registered views reuse their explicit name (see
 * `registerViewClass`).
 */
export function ensureViewName(view: object): string {
  let name = viewNames.get(view);
  if (!name) {
    const fnName =
      (view as { setup?: { name?: string } }).setup?.name || (view as { name?: string }).name;
    name = `__v${++viewNameSeq}` + (fnName ? `_${fnName.replace(/\W/g, "")}` : "");
    viewNames.set(view, name);
    registerViewClass(name, resolveSetup(view));
  }
  return name;
}

/**
 * Alias a replacement view component to the name of the one it replaces
 * (HMR): parents holding the stale import keep resolving to the same
 * internal name, so mounted child frames match across hot swaps.
 */
export function aliasViewName(oldView: object, newView: object): void {
  const name = viewNames.get(oldView);
  if (name) {
    viewNames.set(newView, name);
  }
}

/**
 * Look up a previously registered View setup function by path.
 * Returns `undefined` if no setup is registered for `path`.
 */
export function getViewClass(path: string): ViewSetup | undefined {
  return viewSetupRegistry[path];
}

/**
 * Register a View setup function (or a `LarkView` component, unwrapped on
 * write) for a given view path. Called after module loading completes (or
 * up front during boot). Registering a component also seeds its internal
 * name, so subsequent JSX-tag usage reuses the explicit path.
 */
export function registerViewClass(viewPath: string, setup: ViewSetup | object): void {
  const parsed = parseUri(viewPath);
  const path = parsed.path;
  if (path) {
    viewSetupRegistry[path] = resolveSetup(setup);
    if (setup && (typeof setup === "function" || typeof setup === "object")) {
      if (!viewNames.has(setup)) {
        viewNames.set(setup, path);
      }
    }
  }
}

/**
 * Invalidate a View setup from the registry.
 * Used by HMR to force re-loading of a view module.
 */
export function invalidateViewClass(viewPath: string): void {
  const parsed = parseUri(viewPath);
  const path = parsed.path;
  if (path) {
    Reflect.deleteProperty(viewSetupRegistry, path);
  }
}

/**
 * Get the full view setup registry (for HMR).
 */
export function getViewClassRegistry(): Record<string, ViewSetup> {
  return viewSetupRegistry;
}
