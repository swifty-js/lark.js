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
 * In the functional system, the registry stores `ViewSetup` functions (not
 * View classes). `defineView(setupFn)` returns the setup function, which is
 * registered here and later called by `mountCtx` to create a `ViewCtx`.
 */
import { parseUri } from "./utils";
import type { ViewSetup } from "./types";

/** Registry of view setup functions keyed by path. */
const viewSetupRegistry: Record<string, ViewSetup> = {};

/**
 * Look up a previously registered View setup function by path.
 * Returns `undefined` if no setup is registered for `path`.
 */
export function getViewClass(path: string): ViewSetup | undefined {
  return viewSetupRegistry[path];
}

/**
 * Register a View setup function for a given view path.
 * Called after module loading completes (or up front during boot).
 */
export function registerViewClass(viewPath: string, setup: ViewSetup): void {
  const parsed = parseUri(viewPath);
  const path = parsed.path;
  if (path) {
    viewSetupRegistry[path] = setup;
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
 * Get the full view setup registry (for HMR / debugging).
 */
export function getViewClassRegistry(): Record<string, ViewSetup> {
  return viewSetupRegistry;
}
