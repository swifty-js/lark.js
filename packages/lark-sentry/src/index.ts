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
 * lark-mvc (`@lark.js/mvc`, signals-only):
 *
 * - {@link initLarkSentry} — the one-call entry: SDK init + route-pattern
 *   PVs + store snapshots on error reports; returns a full teardown.
 * - {@link instrumentRoutes} — lazy-route load metrics + route-context errors.
 * - {@link useProfiler} — component mount / lifespan / render-count metrics.
 * - {@link useExposure} / {@link resetExposurePlugin} — element exposure hook.
 *
 * There is deliberately NO ErrorBoundary: lark-mvc has no error sink, so
 * errors thrown in bodies, effects, and handlers BUBBLE to `window.onerror`
 * / `unhandledrejection`, which the SDK captures natively.
 *
 * The full `@swifty.js/sentry` core API is re-exported — this package is a
 * drop-in superset.
 */

export * from "@swifty.js/sentry";

export { initLarkSentry } from "./init.js";
export type { LarkSentryOptions } from "./init.js";
export { instrumentRoutes } from "./instrument-routes.js";
export { useProfiler } from "./profiler.js";
export { resetExposurePlugin, useExposure } from "./exposure.js";
export type { UseExposureOptions } from "./exposure.js";
export type { StoreStateSource } from "./store-state.js";
