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
 * Public types for the `@lark.js/sentry` integration package.
 *
 * The integration reports Lark Mvc framework errors to `@swifty.js/sentry`
 * with structured context describing where in the framework lifecycle the
 * error occurred.
 */

/**
 * The framework lifecycle phase in which an error was captured.
 *
 * - `"setup"`   — thrown while running a view setup function (`defineView`).
 * - `"template"`— thrown while rendering a compiled template during digest.
 * - `"event"`   — thrown by a delegated DOM event handler from the view
 *                 `events` map (Lark Mvc silently swallows these by default).
 * - `"assign"`  — thrown by the optional `assign()` function of a view.
 * - `"framework"`— routed through `FrameworkConfig.error` (for example a
 *                 lazy view-loading failure).
 */
export type LarkErrorPhase = "setup" | "template" | "event" | "assign" | "framework";

/**
 * Structured context attached to every reported Lark Mvc error.
 */
export interface LarkErrorContext {
  /** Lifecycle phase in which the error was captured. */
  readonly phase: LarkErrorPhase;
  /** View (frame) id, when the error originated from a mounted view. */
  readonly viewId?: string;
  /** Extension-less view path (e.g. `"views/home"`), when known. */
  readonly viewPath?: string;
  /** Event map key (e.g. `"increment<click>"`) for `"event"` phase errors. */
  readonly eventKey?: string;
}

/**
 * Error consumer invoked for every captured Lark Mvc error.
 *
 * The default sink reports the error to `@swifty.js/sentry` as an
 * `OtherFrameworks` event. Provide a custom sink to redirect or enrich
 * reports.
 */
export type LarkErrorSink = (error: unknown, context: LarkErrorContext) => void;

/**
 * Options for {@link instrumentView}.
 */
export interface InstrumentViewOptions {
  /** Extension-less view path included in error context, when known. */
  readonly viewPath?: string;
  /** Overrides the active error sink for this view only. */
  readonly onError?: LarkErrorSink;
}

/**
 * Options controlling the global Lark Mvc instrumentation installed by
 * {@link installLarkInstrumentation} / {@link initLarkSentry}.
 */
export interface LarkIntegrationOptions {
  /** Replaces the default error sink for all captured framework errors. */
  readonly onError?: LarkErrorSink;
}
