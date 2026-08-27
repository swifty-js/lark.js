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
 * `@lark.js/sentry` — framework-level `@swifty.js/sentry` integration for
 * lark-mvc (`@lark.js/mvc`, signals-only), modeled on Sentry's React and
 * React Router integrations:
 *
 * | Sentry reference                      | lark equivalent                                  |
 * | ------------------------------------- | ------------------------------------------------ |
 * | react-router browser tracing          | {@link installRouteTracking} — route-pattern PVs |
 * | `wrapCreateBrowserRouter`             | {@link instrumentRoutes} — lazy-route errors + load time |
 * | `useProfiler` / `withProfiler`        | {@link useProfiler} / {@link withProfiler}       |
 * | Redux enhancer state attachment       | `attachStores` / {@link createStoreStateHook}    |
 * | `ErrorBoundary`                       | none BY DESIGN — see below                       |
 * | (swifty `ExposurePlugin`)             | {@link useExposure} — `ref`-callback hook        |
 *
 * ## Error capture — automatic, no boundary needed
 *
 * lark-mvc has no error sink and no try-catch wrappers: errors thrown in
 * component bodies, effects, and event handlers BUBBLE to `window.onerror` /
 * `unhandledrejection`, which `@swifty.js/sentry` captures natively
 * (`enableError` / `enableUnhandledRejection`, both on by default). An
 * ErrorBoundary equivalent is therefore neither possible nor necessary —
 * calling {@link initLarkSentry} (or the SDK's `init`) is all that error
 * reporting requires.
 *
 * The full `@swifty.js/sentry` core API is re-exported, so this package is
 * a drop-in superset: `import { initLarkSentry, traceError } from "@lark.js/sentry"`.
 */

export * from "@swifty.js/sentry";

export { initLarkSentry } from "./init.js";
export type { LarkSentryOptions } from "./init.js";
export { installRouteTracking } from "./route-tracking.js";
export { instrumentRoutes } from "./instrument-routes.js";
export { useProfiler, withProfiler } from "./profiler.js";
export { useExposure } from "./exposure.js";
export type { UseExposureOptions } from "./exposure.js";
export { createStoreStateHook } from "./store-state.js";
export type { StoreStateSource } from "./store-state.js";
