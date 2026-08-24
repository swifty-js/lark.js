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
 * Hot Module Replacement (HMR) for function components.
 *
 * `hotSwapByComponent(oldFn, newFn)` hot-swaps component code without a full
 * page reload, preserving instance state across updates:
 *
 * 1. `aliasComponent(old, new)` — parents holding the STALE import keep
 *    matching live instances (the reconciler compares canonical identities),
 *    and string routes keep resolving.
 * 2. Registry entries pointing at the old function are swapped.
 * 3. Every live instance of the old function is swapped in place
 *    (`swapInstanceFn`): plain state slots (`useSignal` / `useRef`) survive;
 *    closure-bound slots (effects, computeds, memos, queries) are disposed
 *    and recreated by the next render so no stale closures linger. The
 *    instance then re-renders via its `invalidate` signal.
 *
 * The swap function is exposed on `globalThis.__lark_hmr__` so auto-injected
 * HMR snippets (see ./hmr-inject.ts) can call it WITHOUT importing
 * "@lark.js/mvc" — under Module Federation any import of the shared singleton
 * inside an HMR callback registers the module as a shared consumer, which
 * makes webpack expect a main-chunk hot-update it never emits
 * (ChunkLoadError). The global sidesteps module resolution entirely.
 */
import { batch } from "./reactive";
import { aliasComponent, getComponentRegistry } from "./component-registry";
import { getInstances, swapInstanceFn } from "./component";
import type { Component } from "./jsx/vnode";

/**
 * Component HMR: alias + registry swap + in-place instance swap.
 *
 * Runtime-guarded: non-function arguments and functions with no live
 * instances/registry entries no-op safely, so the broad injection gate
 * (any `.tsx`/`.jsx` default export) cannot break non-component modules.
 *
 * @returns whether any live instance was swapped
 */
export function hotSwapByComponent(oldFn: unknown, newFn: unknown): boolean {
  if (typeof oldFn !== "function" || typeof newFn !== "function" || oldFn === newFn) {
    return false;
  }
  const oldC = oldFn as Component;
  const newC = newFn as Component;
  aliasComponent(oldC, newC);
  const registry = getComponentRegistry();
  for (const path in registry) {
    if (registry[path] === oldC) registry[path] = newC;
  }
  const instances = Array.from(getInstances(oldC));
  batch(() => {
    for (const inst of instances) {
      swapInstanceFn(inst, newC);
      inst.invalidate.value++; // re-render with the new function
    }
  });
  return instances.length > 0;
}

// ─── Global HMR handle ────────────────────────────────────────────────
// Set once when this module loads. Framework.boot() also registers it to
// guard against tree-shaken module side effects.
if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
  globalThis.__lark_hmr__ = {
    hotSwapByComponent,
  };
}
