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

import type { RouteObject } from "@lark.js/mvc";
import { EventType, reportFrameworkError, tracePerformance } from "@swifty.js/sentry";

/** Routes already wrapped by {@link instrumentRoutes} (re-instrumenting is a no-op). */
const instrumented = new WeakSet<RouteObject>();

/**
 * Instrument a lark-mvc route table for `@swifty.js/sentry` — the analog of
 * Sentry's `wrapCreateBrowserRouter`.
 *
 * Routes with a `lazy` loader are wrapped so that:
 *
 * - a successful load reports a `Performance` event
 *   `{ name: "LarkLazyRoute", message: route.path, value: elapsedMs }` —
 *   code-splitting / Module Federation load time per route pattern;
 * - a failed load reports an `OtherFrameworks` framework error with
 *   `context: { framework: "lark-mvc", route, phase: "lazy-load" }` and then
 *   RETHROWS, preserving the framework's unhandled-rejection semantics (the
 *   SDK's native `unhandledrejection` capture still fires; this report adds
 *   the route context the raw rejection lacks).
 *
 * Non-lazy routes pass through unchanged. The returned array contains new
 * route objects for wrapped entries, so `RouterView`'s resolved-component
 * caching works on them; pass the RETURNED array to `createRouter`.
 * Instrumenting an already-instrumented table is a no-op.
 *
 * @example
 * ```ts
 * const router = createRouter(
 *   instrumentRoutes([
 *     { path: "/", component: Home },
 *     { path: "/admin", lazy: () => import("./views/admin") },
 *   ]),
 * );
 * ```
 *
 * @param routes - The route table to instrument.
 * @returns A new route table with lazy loaders wrapped.
 */
export function instrumentRoutes(routes: RouteObject[]): RouteObject[] {
  return routes.map((route) => {
    const load = route.lazy;
    if (!load || instrumented.has(route)) return route;
    const wrapped: RouteObject = {
      ...route,
      lazy: async () => {
        const start = performance.now();
        try {
          const mod = await load();
          try {
            tracePerformance({
              name: "LarkLazyRoute",
              message: route.path,
              value: performance.now() - start,
            });
          } catch {
            // Reporting must never disturb route loading.
          }
          return mod;
        } catch (error) {
          try {
            reportFrameworkError({
              type: EventType.OtherFrameworks,
              error,
              context: { framework: "lark-mvc", route: route.path, phase: "lazy-load" },
            });
          } catch {
            // Reporting must never disturb route loading.
          }
          throw error;
        }
      },
    };
    instrumented.add(wrapped);
    return wrapped;
  });
}
