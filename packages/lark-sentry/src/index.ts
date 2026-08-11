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
 * `@lark.js/sentry` — `@swifty.js/sentry` integration for Lark Mvc.
 *
 * Lark Mvc routes every framework-internal error (event handlers, emitter
 * listeners, render, cleanups, etc.) through `FrameworkConfig.error` via
 * `funcWithTry`. This package hooks that single seam to report errors as
 * `OtherFrameworks` events to `@swifty.js/sentry`.
 */

import { Framework } from "@lark.js/mvc";
import { EventType, init, reportFrameworkError } from "@swifty.js/sentry";
import type { InitOptions } from "@swifty.js/sentry";

export * from "@swifty.js/sentry";

/**
 * Install the `FrameworkConfig.error` hook that reports framework errors to
 * `@swifty.js/sentry`.
 *
 * Call this after `Framework.boot(...)`. Any previously configured `error`
 * handler is preserved and still runs after the report.
 *
 * @returns An uninstall function restoring the previous `error` handler.
 */
export function installLarkSentry(): () => void {
  const config = Framework.getConfig();
  const oldError = config.error;

  Framework.setConfig({
    error(error: Error): void {
      try {
        reportFrameworkError({
          type: EventType.OtherFrameworks,
          error,
          context: { framework: "lark-mvc" },
        });
      } catch {
        // Reporting must never disturb framework control flow.
      }
      if (oldError) {
        try {
          oldError(error);
        } catch {
          // Suppress rethrows from the previous handler to avoid
          // double-reporting via unhandledrejection.
        }
      }
    },
  });

  return (): void => {
    Framework.setConfig({ error: oldError });
  };
}

/**
 * One-call integration: initialize `@swifty.js/sentry` and install the Lark
 * Mvc error hook.
 *
 * @example
 * ```ts
 * import { Framework } from "@lark.js/mvc";
 * import { initLarkSentry } from "@lark.js/sentry";
 *
 * Framework.boot({ rootId: "app", defaultPath: "/home", routes: { ... } });
 *
 * initLarkSentry({ dsn: "/api/log", projectId: "lark-app" });
 * ```
 *
 * @param options - SDK init options (dsn, projectId, plugins, etc.).
 * @returns An uninstall function; the SDK itself is torn down via `destroy()`
 *   from `@swifty.js/sentry`.
 */
export function initLarkSentry(options: InitOptions): () => void {
  init(options);
  return installLarkSentry();
}
