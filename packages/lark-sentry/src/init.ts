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

import { useRouter } from "@lark.js/mvc";
import type { RouterApi } from "@lark.js/mvc";
import { init } from "@swifty.js/sentry";
import type { InitOptions } from "@swifty.js/sentry";
import { installRouteTracking } from "./route-tracking.js";
import { createStoreStateHook } from "./store-state.js";
import type { StoreStateSource } from "./store-state.js";

/**
 * Options for {@link initLarkSentry}: every `@swifty.js/sentry` `init`
 * option, plus the lark-mvc integration switches.
 */
export interface LarkSentryOptions extends InitOptions {
  /**
   * The router to observe for route-pattern page views. Defaults to the
   * ACTIVE router (the last `createRouter(...)` result).
   */
  readonly router?: RouterApi;
  /**
   * Install route-pattern tracking (see `installRouteTracking`).
   * @defaultValue true
   */
  readonly trackRoutes?: boolean;
  /**
   * Named state sources whose snapshots are attached (as a top-level
   * `storeState` field) to every error-class report — see
   * `createStoreStateHook`. Composes with your own `onBeforeReportData`,
   * which keeps running first.
   */
  readonly attachStores?: Readonly<Record<string, StoreStateSource>>;
}

const noop = (): void => {};

/**
 * One-call lark-mvc integration: initialize `@swifty.js/sentry` and install
 * the framework-level instrumentation.
 *
 * lark-mvc has no error sink and no try-catch wrappers — errors thrown in
 * component bodies, effects, and event handlers BUBBLE to `window.onerror` /
 * `unhandledrejection`, which the SDK captures natively (`enableError` /
 * `enableUnhandledRejection`, both on by default). Calling this is all that
 * error reporting requires; what it adds on top:
 *
 * - route-pattern page views (`trackRoutes`, default on);
 * - store snapshots on error reports (`attachStores`, opt-in).
 *
 * Create the router BEFORE calling this (or pass `router` explicitly) —
 * when no router is resolvable, route tracking is skipped with a
 * `console.warn` instead of throwing, so non-routed apps can still use the
 * one-call form.
 *
 * @example
 * ```tsx
 * import { render, createRouter, RouterView } from "@lark.js/mvc";
 * import { initLarkSentry, instrumentRoutes } from "@lark.js/sentry";
 *
 * const router = createRouter(
 *   instrumentRoutes([
 *     { path: "/", component: Home },
 *     { path: "/users/:id", component: UserDetail },
 *   ]),
 * );
 *
 * initLarkSentry({ dsn: "/api/log", projectId: "lark-app", router });
 *
 * render(<RouterView router={router} />, document.getElementById("root")!);
 * ```
 *
 * @param options - SDK init options plus lark integration switches.
 * @returns An uninstall function for the route tracking (a no-op when
 *   tracking was not installed); the SDK itself is torn down via
 *   `destroy()` from `@swifty.js/sentry`.
 */
export function initLarkSentry(options: LarkSentryOptions): () => void {
  const { router, trackRoutes = true, attachStores, ...sdkOptions } = options;

  const initOptions: InitOptions = attachStores
    ? {
        ...sdkOptions,
        onBeforeReportData: createStoreStateHook(attachStores, sdkOptions.onBeforeReportData),
      }
    : sdkOptions;
  init(initOptions);

  if (!trackRoutes) return noop;
  const target = router ?? resolveActiveRouter();
  if (!target) {
    console.warn(
      "[lark-sentry] no active router — route tracking skipped. Create the router before initLarkSentry, or pass { router }.",
    );
    return noop;
  }
  return installRouteTracking(target);
}

function resolveActiveRouter(): RouterApi | null {
  try {
    return useRouter();
  } catch {
    return null;
  }
}
