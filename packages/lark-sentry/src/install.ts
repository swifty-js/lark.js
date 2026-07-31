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

import { Framework } from "@lark.js/mvc";
import type { FrameworkConfig, ViewSetup } from "@lark.js/mvc";
import { init } from "@swifty.js/sentry";
import type { InitOptions } from "@swifty.js/sentry";
import { instrumentView } from "./instrument-view.js";
import { reportLarkError, setLarkErrorSink } from "./report.js";
import type { LarkIntegrationOptions } from "./types.js";

/**
 * Narrow an unknown module loaded by the framework's `require` loader.
 *
 * The Lark Mvc lazy-loading contract resolves each requested view name to a
 * view setup function, so any function value returned by the loader is a
 * `ViewSetup` by contract.
 */
function isViewSetup(value: unknown): value is ViewSetup {
  return typeof value === "function";
}

/** Uninstaller of the currently active installation, if any. */
let activeUninstall: (() => void) | undefined;

/**
 * Install global Lark Mvc error instrumentation.
 *
 * Must be called **after** `Framework.boot(...)`: boot merges the user
 * configuration into the live config object, so wrappers installed earlier
 * would be overwritten by the user's own `error` / `require` entries.
 *
 * What gets instrumented:
 *
 * 1. `FrameworkConfig.error` — framework-reported errors (for example lazy
 *    view-loading failures) are captured with phase `"framework"`. Any
 *    previously configured handler still runs afterwards; if that handler
 *    rethrows (the framework default does), the rethrow is suppressed to
 *    avoid double-reporting the same error through `unhandledrejection`.
 * 2. `FrameworkConfig.require` — every lazily loaded view setup function is
 *    transparently wrapped with {@link instrumentView}, capturing setup,
 *    template, event handler, and `assign` errors together with the view
 *    path that was requested.
 *
 * Views registered synchronously through `registerViewClass` bypass the
 * `require` loader; wrap those with {@link instrumentView} manually. The same
 * applies when no `require` loader is configured at all: the framework then
 * falls back to an internal dynamic `import()` that cannot be wrapped from
 * the outside, so lazily loaded views are not instrumented automatically
 * (loading failures are still captured via `FrameworkConfig.error`).
 *
 * Calling this function while a previous installation is active updates the
 * error sink (when `options.onError` is provided) and returns the existing
 * uninstaller without re-patching the configuration.
 *
 * @param options - Optional custom error sink and template wrapping toggle.
 * @returns An uninstall function restoring the previous configuration.
 */
export function installLarkInstrumentation(options: LarkIntegrationOptions = {}): () => void {
  if (activeUninstall) {
    if (options.onError) setLarkErrorSink(options.onError);
    return activeUninstall;
  }

  // Only replace the sink when a custom one is provided, so a sink
  // previously configured via `setLarkErrorSink` survives installation.
  const previousSink = options.onError ? setLarkErrorSink(options.onError) : undefined;

  const config = Framework.getConfig();
  const previousError = config.error;
  const previousRequire = config.require;

  const patch: Partial<FrameworkConfig> = {
    error: (error: Error): void => {
      reportLarkError(error, { phase: "framework" });
      if (previousError) {
        try {
          previousError(error);
        } catch {
          // The framework default handler rethrows purely to surface the
          // error as an unhandled rejection. It has already been reported
          // above, so the rethrow is suppressed to avoid a duplicate event.
        }
      }
    },
  };

  if (previousRequire) {
    patch.require = (names, params) => {
      const loading = previousRequire(names, params);
      if (!loading) return loading;
      return loading.then((modules) =>
        modules.map((module, index) =>
          isViewSetup(module)
            ? instrumentView(module, { viewPath: names[index], wrapTemplate: options.wrapTemplate })
            : module,
        ),
      );
    };
  }

  Framework.setConfig(patch);

  const uninstall = (): void => {
    const restore: Partial<FrameworkConfig> = { error: previousError };
    if (previousRequire) restore.require = previousRequire;
    Framework.setConfig(restore);
    if (previousSink) setLarkErrorSink(previousSink);
    activeUninstall = undefined;
  };
  activeUninstall = uninstall;
  return uninstall;
}

/**
 * Options accepted by {@link initLarkSentry}: the full `@swifty.js/sentry`
 * `init` options plus the Lark Mvc integration options.
 */
export type LarkSentryOptions = InitOptions & LarkIntegrationOptions;

/**
 * One-call integration: initialize `@swifty.js/sentry` and install the Lark
 * Mvc instrumentation.
 *
 * Mirrors the SDK's Vue plugin shape (`app.use(vuePlugin, options)`), adapted
 * to Lark Mvc's functional boot flow. Call it **after** `Framework.boot(...)`
 * so the instrumentation wraps the final framework configuration:
 *
 * @example
 * ```ts
 * import { Framework } from "@lark.js/mvc";
 * import { initLarkSentry } from "@lark.js/sentry";
 *
 * Framework.boot({
 *   rootId: "app",
 *   require: (names) =>
 *     Promise.all(names.map((n) => import(`./views/${n}`).then((m) => m.default))),
 * });
 *
 * initLarkSentry({ dsn: "/api/log", projectId: "lark-app" });
 * ```
 *
 * Browser-level capture (runtime errors, unhandled rejections, HTTP, PV,
 * declarative `s-swifty-*` clicks, white screen) is handled by the SDK core;
 * this integration adds the framework-internal seams that Lark Mvc would
 * otherwise swallow silently.
 *
 * @param options - SDK init options plus integration options.
 * @returns An uninstall function; the SDK itself is torn down separately via
 *   `destroy()` from `@swifty.js/sentry`.
 */
export function initLarkSentry(options: LarkSentryOptions): () => void {
  const { onError, wrapTemplate, ...initOptions } = options;
  init(initOptions);
  const integrationOptions: LarkIntegrationOptions = { onError, wrapTemplate };
  return installLarkInstrumentation(integrationOptions);
}
