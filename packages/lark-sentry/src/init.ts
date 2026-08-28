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
import { destroy, init, isInitialized } from "@swifty.js/sentry";
import type { InitOptions } from "@swifty.js/sentry";
import { resetExposurePlugin } from "./exposure.js";
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
   * Install route-pattern tracking (`"LarkRoute"` PV per navigation).
   * @defaultValue true
   */
  readonly trackRoutes?: boolean;
  /**
   * Named state sources snapshotted into `payload.storeState` of every
   * error-class report. Composes with your own `beforeSend`, which keeps
   * running first.
   */
  readonly attachStores?: Readonly<Record<string, StoreStateSource>>;
}

const noop = (): void => {};

/**
 * One-call lark-mvc integration: initialize `@swifty.js/sentry`, install
 * route-pattern page views (`trackRoutes`, default on), and attach store
 * snapshots to error reports (`attachStores`, opt-in).
 *
 * Error capture needs nothing more — lark-mvc errors BUBBLE to
 * `window.onerror` / `unhandledrejection`, which the SDK captures natively.
 *
 * Create the router BEFORE calling this (or pass `router` explicitly);
 * when no router is resolvable, route tracking is skipped with a
 * `console.warn` so non-routed apps can still use the one-call form.
 *
 * Idempotent like the SDK's `init`: a second call warns and returns a
 * no-op. When the SDK stays inert (`disabled: true` or an empty `dsn`),
 * nothing is installed and a no-op is returned — lark instrumentation
 * never reports around a disabled SDK.
 *
 * @param options - SDK init options plus the lark integration switches.
 * @returns A full teardown: uninstalls route tracking, `destroy()`s the
 *   SDK, and resets the shared exposure plugin.
 */
export function initLarkSentry(options: LarkSentryOptions): () => void {
  const { router, trackRoutes = true, attachStores, ...sdkOptions } = options;

  if (isInitialized()) {
    console.warn(
      "[lark-sentry] already initialized — call the previous teardown (or destroy()) first.",
    );
    return noop;
  }

  init(
    attachStores
      ? {
          ...sdkOptions,
          beforeSend: createStoreStateHook(attachStores, sdkOptions.beforeSend),
        }
      : sdkOptions,
  );
  if (!isInitialized()) return noop; // disabled or empty dsn — the SDK is inert

  let uninstallTracking = noop;
  if (trackRoutes) {
    const target = router ?? resolveActiveRouter();
    if (target) {
      uninstallTracking = installRouteTracking(target);
    } else {
      console.warn(
        "[lark-sentry] no active router — route tracking skipped. Create the router before initLarkSentry, or pass { router }.",
      );
    }
  }

  return () => {
    uninstallTracking();
    destroy();
    resetExposurePlugin();
  };
}

function resolveActiveRouter(): RouterApi | null {
  try {
    return useRouter();
  } catch {
    return null;
  }
}
