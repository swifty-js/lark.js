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

import { effect, untracked, useRouter } from "@lark.js/mvc";
import type { RouterApi } from "@lark.js/mvc";
import { tracePageView } from "@swifty.js/sentry";

/**
 * Subscribe route-pattern page views to `@swifty.js/sentry` — the lark-mvc
 * analog of Sentry's react-router browser-tracing integration.
 *
 * What the SDK cannot infer on its own is the MATCHED ROUTE PATTERN
 * (`/users/:id` instead of `/users/42`) — the key for grouping page views.
 * This installs a signals `effect` over the router's `location`/`match`
 * signals and reports one `PV` event named `"LarkRoute"` per committed
 * navigation (including the initial location), with:
 *
 * - `message` — `pathname + search` (logical, basename-stripped)
 * - `extra.pattern` — the matched `RouteObject.path` (`"/users/:id"`), or
 *   `null` when no route matched
 * - `extra.params` — decoded `:param` / `*` captures
 * - `extra.href` — the full `location.href`
 *
 * The SDK's native `HistoryChange` / `PageDwell` PV events (from its
 * `pushState`/`popstate` decoration) continue independently — `"LarkRoute"`
 * supplements them with the pattern, it does not replace them.
 *
 * Reporting never disturbs rendering: the effect body runs the report
 * inside `untracked()` and swallows reporter exceptions.
 *
 * @param router - The router to observe. Defaults to the ACTIVE router
 *   (the last `createRouter(...)` result); throws when neither is available.
 * @returns An uninstall function disposing the tracking effect.
 */
export function installRouteTracking(router?: RouterApi): () => void {
  const target = router ?? useRouter();
  let lastKey: string | undefined;

  return effect(() => {
    const loc = target.location.value; // tracked — re-runs per navigation
    const match = target.match.value; // tracked (same commit)
    untracked(() => {
      if (loc.key === lastKey) return; // same-entry re-commit → skip
      lastKey = loc.key;
      try {
        tracePageView({
          name: "LarkRoute",
          message: `${loc.pathname}${loc.search}`,
          extra: {
            pattern: match?.route.path ?? null,
            params: match?.params ?? {},
            href: globalThis.location.href,
          },
        });
      } catch {
        // Reporting must never disturb framework control flow.
      }
    });
  });
}
