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
 * Hot Module Replacement (HMR) for Lark Mvc views.
 *
 * HMR hot-swaps view code without a full page reload, preserving view-local
 * state (counter values, form input, scroll-derived data) across updates.
 *
 * A view module (`.tsx` / `.ts` with a `defineView` default export) contains
 * both the setup function and its `jsxTemplate` closure, so a single swap
 * layer suffices: `hotSwapByView(old, new)` updates the view-registry and
 * runs `hotSwapView` on every matching frame.
 *
 * ## State preservation strategy
 *
 * `hotSwapView` preserves the entire `ViewCtx` — `signals` (keyed
 * `useSignal` state), `refData`, `resources`, `emitter`, `signature`, `id`,
 * and `owner` all stay the same. It:
 * 1. Runs old `useEffect` cleanups — this disposes the old render effect
 *    and the JSX event wiring cleanup (unbinds delegated event types and
 *    strips `__jsx*` handlers)
 * 2. Destroys `destroyOnRender` resources
 * 3. Re-runs `newSetup(ctx)` — the same ctx instance, inside `untracked()`;
 *    `useSignal(key, ...)` calls find and reuse the preserved signals
 * 4. Updates the template from the new descriptor
 * 5. Creates a fresh render effect — its first run re-renders with the new
 *    template and re-wires inline handlers from scratch
 */
import { parseUri } from "./utils";
import { untracked } from "./reactive";
import { getViewClassRegistry, resolveSetup, aliasViewName } from "./view-registry";
import { destroyAllResources, createRenderEffect } from "./view";
import { setCurrentCtx } from "./hooks";
import type { ViewSetup, ViewSetupResult, FrameObj, LarkView } from "./types";
import { Frame } from "./frame";

/**
 * Hot-swap a single frame's view setup in place, preserving the `ViewCtx`.
 *
 * This is the building block for state-preserving HMR. The existing ctx is
 * reused — only the setup function and template are replaced. See the
 * module-level docs for the full step-by-step sequence.
 *
 * @param frame - The frame whose view should be hot-swapped
 * @param newSetup - The new view setup (or branded component) from the updated module
 */
export function hotSwapView(frame: FrameObj, newSetup: ViewSetup | LarkView<never>): void {
  const setupFn = resolveSetup(newSetup);
  const oldView = frame.view;
  if (!oldView) {
    const vp = frame.getViewPath();
    if (vp) frame.mountView(vp);
    return;
  }
  // Cleanups include the old render-effect dispose and the JSX event wiring
  // teardown — after this, no stale effect can re-run the old template.
  for (let i = oldView.cleanups.length - 1; i >= 0; i--) {
    oldView.cleanups[i]();
  }
  oldView.cleanups.length = 0;
  destroyAllResources(oldView, false);
  // Set currentCtx so hooks inside the new setup can access the ctx.
  // untracked(): setup-body signal reads must not subscribe anything.
  setCurrentCtx(oldView);
  let descriptor: ViewSetupResult;
  try {
    descriptor = untracked(() => setupFn(oldView, undefined));
  } finally {
    setCurrentCtx(null);
  }
  oldView.setTemplate(descriptor.template);
  if (oldView.signature.value > 0) {
    if (oldView.getTemplate()) {
      // Fresh render effect — first run renders the new template.
      createRenderEffect(oldView);
    } else {
      oldView.endUpdate();
    }
  }
}

/**
 * View setup HMR: update the view-registry and hot-swap every frame using
 * `oldSetup` with `newSetup`.
 *
 * 1. Alias the new component to the old component's auto-registered name,
 *    so parents still holding the stale import keep resolving to the same
 *    internal view path across re-renders
 * 2. Walk the registry, replacing any entry equal to `oldSetup` with `newSetup`
 * 3. Walk all frames, hot-swapping any whose registry entry now points to
 *    `newSetup`
 *
 * @param oldSetup - The previous setup/component reference
 * @param newSetup - The new setup/component reference
 */
export function hotSwapByView(
  oldSetup: ViewSetup | LarkView<never>,
  newSetup: ViewSetup | LarkView<never>,
): boolean {
  if (!oldSetup || !newSetup || oldSetup === newSetup) return false;
  aliasViewName(oldSetup, newSetup);
  const oldFn = resolveSetup(oldSetup);
  const newFn = resolveSetup(newSetup);
  if (oldFn === newFn) return false;
  const reg = getViewClassRegistry();
  for (const path in reg) {
    if (reg[path] === oldFn) reg[path] = newFn;
  }
  let swapped = false;
  for (const [, frame] of Frame.getAll()) {
    const view = frame.view;
    const vp = frame.getViewPath();
    if (view && vp) {
      const parsed = parseUri(vp);
      if (reg[parsed.path] === newFn) {
        hotSwapView(frame, newFn);
        swapped = true;
      }
    }
  }
  return swapped;
}

// ─── Global HMR handle ────────────────────────────────────────────────
// Expose hotSwapByView on globalThis so that the auto-injected HMR snippets
// (see ./hmr-inject.ts) can call it WITHOUT importing "@lark.js/mvc".
//
// Why a global instead of import/require("@lark.js/mvc"):
// Under Module Federation (@lark.js/mvc shared singleton), ANY reference
// to @lark.js/mvc inside an HMR accept callback registers the calling
// view module as a shared consumer. Webpack then marks the main chunk —
// which initializes the MF shared scope — as needing a hot-update. But
// since main's code didn't actually change, no main.<hash>.hot-update.js
// is emitted, so the HMR runtime request 404s:
//   ChunkLoadError: Loading hot update chunk main failed.
//   (missing: http://localhost:<port>/main.<hash>.hot-update.js)
// The accept callback never runs → UI never updates.
//
// globalThis.__lark_hmr__ sidesteps module resolution entirely: no import,
// no require, no chunk-graph side effect. Set once when this module loads
// (which happens before any HMR callback can fire, since the framework
// boots before views mount). Functions are hoisted (function declarations),
// so they are already defined when this top-level code runs.
if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
  globalThis.__lark_hmr__ = {
    hotSwapByView,
  };
}
