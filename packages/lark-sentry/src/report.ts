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

import { EventType, reportFrameworkError } from "@swifty.js/sentry";
import type { LarkErrorContext, LarkErrorSink } from "./types.js";

/**
 * Default sink: reports the error to `@swifty.js/sentry` as an
 * `OtherFrameworks` event, tagging the payload with the framework name and
 * the structured Lark Mvc error context.
 */
function defaultSink(error: unknown, context: LarkErrorContext): void {
  reportFrameworkError({
    type: EventType.OtherFrameworks,
    error,
    context: {
      framework: "lark-mvc",
      ...context,
    },
  });
}

/** The sink currently receiving captured Lark Mvc errors. */
let activeSink: LarkErrorSink = defaultSink;

/**
 * Replace the active error sink.
 *
 * @param sink - The new sink, or `undefined` to restore the default sink.
 * @returns The previously active sink, so callers can restore it later.
 */
export function setLarkErrorSink(sink: LarkErrorSink | undefined): LarkErrorSink {
  const previous = activeSink;
  activeSink = sink ?? defaultSink;
  return previous;
}

/**
 * Report a Lark Mvc framework error through the active sink.
 *
 * A throwing sink must never disturb framework control flow (the caller is
 * usually inside a render or event dispatch path and rethrows the original
 * error afterwards), so sink failures are intentionally suppressed here.
 *
 * @param error - The captured error value.
 * @param context - Structured context describing where the error occurred.
 * @param sink - Optional per-call sink override (used by `instrumentView`).
 */
export function reportLarkError(
  error: unknown,
  context: LarkErrorContext,
  sink?: LarkErrorSink,
): void {
  try {
    (sink ?? activeSink)(error, context);
  } catch {
    // Sink failures are swallowed to preserve the original control flow.
  }
}
