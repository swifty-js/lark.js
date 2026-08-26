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
 * `@lark.js/sentry` — `@swifty.js/sentry` integration for lark-mvc
 * (v0.0.32+, signals-only).
 *
 * ## Error capture — automatic, no hook needed
 *
 * lark-mvc has no error sink and no try-catch wrappers: errors thrown in
 * component bodies, effects, and event handlers BUBBLE to
 * `window.onerror` / `unhandledrejection`, which `@swifty.js/sentry`
 * captures natively (`enableError` / `enableUnhandledRejection`, both on by
 * default). Calling `init()` is all that error reporting requires.
 *
 * ## Route tracking — the Lark-specific seam
 *
 * What the SDK cannot infer on its own is the MATCHED ROUTE PATTERN
 * (`/users/:id` instead of `/users/42`) — the key for grouping page views.
 * `installLarkSentry(router)` subscribes a signals `effect` to the router's
 * `location`/`match` signals and reports one `PV` event named `"LarkRoute"`
 * per committed navigation, carrying the pattern and the decoded params.
 */

import { effect, untracked, useRouter } from "@lark.js/mvc";
import type { RouterApi } from "@lark.js/mvc";
import { init, tracePageView } from "@swifty.js/sentry";
import type { InitOptions } from "@swifty.js/sentry";

export * from "@swifty.js/sentry";

/**
 * Subscribe route-pattern page views to `@swifty.js/sentry`.
 *
 * One `PV` event named `"LarkRoute"` is reported per committed navigation
 * (including the initial location), with:
 *
 * - `message` — `pathname + search` (logical, basename-stripped)
 * - `extra.pattern` — the matched `RouteObject.path` (`"/users/:id"`), or
 *   `null` when no route matched
 * - `extra.params` — decoded `:param` / `*` captures
 * - `extra.href` — the full `location.href`
 *
 * Reporting never disturbs rendering: the effect body runs the report
 * inside `untracked()` and swallows reporter exceptions.
 *
 * @param router - The router to observe. Defaults to the ACTIVE router
 *   (the last `createRouter(...)` result); throws when neither is available.
 * @returns An uninstall function disposing the tracking effect.
 */
export function installLarkSentry(router?: RouterApi): () => void {
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

/**
 * One-call integration: initialize `@swifty.js/sentry` and install the
 * lark-mvc route-pattern tracking.
 *
 * @example
 * ```tsx
 * import { render, createRouter, RouterView } from "@lark.js/mvc";
 * import { initLarkSentry } from "@lark.js/sentry";
 *
 * const router = createRouter([
 *   { path: "/", component: Home },
 *   { path: "/users/:id", component: UserDetail },
 * ]);
 *
 * initLarkSentry({ dsn: "/api/log", projectId: "lark-app" }, router);
 *
 * render(<RouterView router={router} />, document.getElementById("root")!);
 * ```
 *
 * @param options - SDK init options (dsn, projectId, ...).
 * @param router - The router to observe (defaults to the active router).
 * @returns An uninstall function for the route tracking; the SDK itself is
 *   torn down via `destroy()` from `@swifty.js/sentry`.
 */
export function initLarkSentry(options: InitOptions, router?: RouterApi): () => void {
  init(options);
  return installLarkSentry(router);
}
