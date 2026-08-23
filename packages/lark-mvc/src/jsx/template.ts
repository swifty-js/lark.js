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
 * `jsxTemplate()` — adapts a JSX render function into a framework
 * `ViewTemplate` and wires inline event handlers into the view lifecycle.
 *
 * This module lives in the MAIN package entry only (it imports `Frame` and
 * `EventDelegator`). The `jsx-runtime` entry stays pure — tsup bundles each
 * entry separately, so module-level state here is never duplicated into the
 * runtime bundles.
 *
 * ## Inline-handler lifecycle
 *
 * Inline functions (`onClick={() => ...}`) are collected during serialization
 * under per-render generated names (`__jsx1`, `__jsx2`, ... — the counter
 * resets every render, and the events map swap + DOM diff complete
 * synchronously inside the same digest, so names never go stale):
 *
 * 1. Each render, stale `__jsx*` keys are removed from the view's events map
 *    and the fresh handlers are merged in (the delegator reads the map lazily
 *    per dispatch, so this is safe).
 * 2. Each event type used by an inline handler is bound ONCE per view via
 *    `EventDelegator.bind` (bind-for-life, mirroring `registerEvents`).
 * 3. A single cleanup pushed into `ctx.cleanups` unbinds those types and
 *    strips `__jsx*` keys. Cleanups run BEFORE `unregisterEvents` in both
 *    `unmountCtx` (src/view.ts) and `hotSwapView` (src/hmr.ts), so
 *    `unregisterEvents` never double-unbinds generated keys, and HMR re-wires
 *    from scratch on the post-swap `forceDigest`.
 */

import { Frame } from "../frame";
import { EventDelegator } from "../event-delegator";
import { isRefToken } from "../common";
import { serialize, createSerializeCtx, type SerializeCtx } from "./serialize";
import type { JSXNode } from "./vnode";
import type { ViewCtx, ViewTemplate } from "../types";

/** Prefix of generated inline-handler names / events-map keys. */
const JSX_HANDLER_PREFIX = "__jsx";

/** Per-view inline-handler wiring state (event types bound for the view). */
const jsxWiring = new WeakMap<ViewCtx, { boundTypes: Set<string> }>();

/**
 * Adapt a JSX render function into a `ViewTemplate`.
 *
 * The render function receives the view's `updater.data` object and returns
 * JSX content. Return it as the `template` from a view setup:
 *
 * @example
 * ```tsx
 * type Data = { count: number };
 * const template = jsxTemplate<Data>(({ count }) => (
 *   <div>
 *     <p>Count: {count}</p>
 *     <button onClick="increment">+1</button>
 *     <button onClick={() => console.log(count)}>log</button>
 *   </div>
 * ));
 * export default defineView((ctx) => {
 *   ctx.updater.set({ count: 0 });
 *   return { template, events: { "increment<click>": () => ... } };
 * });
 * ```
 */
export function jsxTemplate<T = Record<string, unknown>>(
  render: (data: T & { vId: string }) => JSXNode,
): ViewTemplate {
  return function template(data, viewId, refData): string {
    const sctx = createSerializeCtx(viewId, (refData || {}) as Record<string, unknown>);
    const html = serialize(render((data || {}) as T & { vId: string }), sctx);
    pruneRefData(sctx);
    wireInlineHandlers(viewId, sctx);
    return html;
  };
}

/**
 * Generational refData sweep — delete tokens that were not re-emitted by the
 * render that just completed. JSX props routinely tokenize fresh object
 * identities every render; without the sweep refData grows for the view's
 * lifetime and refFn's identity scan slows every subsequent render. The
 * counter key survives (it is not a ref token) and stays monotonic, so a
 * stale token string held by outside code can never alias a new value.
 */
function pruneRefData(sctx: SerializeCtx): void {
  const { refData, usedTokens } = sctx;
  for (const key of Object.keys(refData)) {
    if (isRefToken(key) && !usedTokens.has(key)) {
      Reflect.deleteProperty(refData, key);
    }
  }
}

/**
 * Merge this render's inline handlers into the view's events map and keep
 * the EventDelegator bindings balanced. No-op when the template is called
 * outside a mounted frame (bare calls in tests).
 */
function wireInlineHandlers(viewId: string, sctx: SerializeCtx): void {
  const view = Frame.get(viewId)?.view;
  if (!view) return;

  let events = view.getEvents();
  if (!events) {
    events = {};
    view.setEvents(events);
  }

  // Replace the previous generation of inline handlers (in place — the map
  // object identity is preserved for the delegator's lazy reads).
  for (const key of Object.keys(events)) {
    if (key.startsWith(JSX_HANDLER_PREFIX)) {
      Reflect.deleteProperty(events, key);
    }
  }
  for (const [key, fn] of sctx.handlers) {
    events[key] = fn;
  }

  let state = jsxWiring.get(view);
  if (!state) {
    // Nothing bound yet and nothing to bind — skip creating lifecycle state.
    if (sctx.eventTypes.size === 0) return;

    const tracked = { boundTypes: new Set<string>() };
    state = tracked;
    jsxWiring.set(view, tracked);

    // Runs before unregisterEvents in both unmountCtx and hotSwapView:
    // strip generated keys (so unregisterEvents only sees static keys) and
    // release exactly the types this view bound. Deleting the WeakMap entry
    // lets a post-HMR render re-wire with a fresh cleanup.
    view.cleanups.push(() => {
      const ev = view.getEvents();
      if (ev) {
        for (const key of Object.keys(ev)) {
          if (key.startsWith(JSX_HANDLER_PREFIX)) {
            Reflect.deleteProperty(ev, key);
          }
        }
      }
      for (const type of tracked.boundTypes) {
        EventDelegator.unbind(type, false);
      }
      tracked.boundTypes.clear();
      jsxWiring.delete(view);
    });
  }

  // Bind newly seen event types once per view (bind-for-life; a type that a
  // later render stops using stays bound until destroy, matching the
  // registerEvents semantics).
  for (const type of sctx.eventTypes) {
    if (!state.boundTypes.has(type)) {
      EventDelegator.bind(type, false);
      state.boundTypes.add(type);
    }
  }
}
