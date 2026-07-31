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

import type { AnyFunc, VDomNode, VDomTemplate, ViewSetup, ViewTemplate } from "@lark.js/mvc";
import { reportLarkError } from "./report.js";
import type { InstrumentViewOptions, LarkErrorContext, LarkErrorSink } from "./types.js";

/** The descriptor object returned by a view setup function. */
type ViewDescriptor = ReturnType<ViewSetup>;

/**
 * Wrap a compiled template so render errors are reported before rethrowing.
 *
 * Lark Mvc invokes templates inside `updater.digest()` without a try/catch;
 * when the digest is triggered from a delegated event handler the error is
 * then silently swallowed by the framework. Reporting here guarantees the
 * error is captured regardless of which code path triggered the digest.
 *
 * Overloads preserve the caller's concrete template kind (`ViewTemplate` in
 * string mode, `VDomTemplate` in VDOM mode) without unsafe casts.
 */
function wrapTemplate(template: ViewTemplate, onError: (error: unknown) => void): ViewTemplate;
function wrapTemplate(template: VDomTemplate, onError: (error: unknown) => void): VDomTemplate;
function wrapTemplate(
  template: ViewTemplate | VDomTemplate,
  onError: (error: unknown) => void,
): ViewTemplate | VDomTemplate;
function wrapTemplate(
  template: ViewTemplate | VDomTemplate,
  onError: (error: unknown) => void,
): (data: unknown, viewId: string, refData: unknown) => string | VDomNode {
  return (data: unknown, viewId: string, refData: unknown): string | VDomNode => {
    try {
      return template(data, viewId, refData);
    } catch (error) {
      onError(error);
      throw error;
    }
  };
}

/**
 * Wrap a single event handler so exceptions are reported before rethrowing.
 *
 * The framework dispatches delegated DOM event handlers through an internal
 * try/catch that discards the error, so without this wrapper handler
 * exceptions are invisible to both the console and `window.onerror`.
 *
 * The wrapper is a regular function (not an arrow) so the `this` binding
 * applied by the framework's dispatcher is forwarded to the original handler.
 */
function wrapHandler(handler: AnyFunc, onError: (error: unknown) => void): AnyFunc {
  return function wrappedHandler(this: unknown, ...args: unknown[]): unknown {
    try {
      return handler.apply(this, args);
    } catch (error) {
      onError(error);
      throw error;
    }
  };
}

/**
 * Wrap the optional `assign()` function of a view descriptor.
 */
function wrapAssign(
  assign: NonNullable<ViewDescriptor["assign"]>,
  onError: (error: unknown) => void,
): NonNullable<ViewDescriptor["assign"]> {
  return (options?: unknown): boolean | undefined => {
    try {
      return assign(options);
    } catch (error) {
      onError(error);
      throw error;
    }
  };
}

/**
 * Build the reporting callback for one lifecycle phase of a mounted view.
 */
function phaseReporter(
  base: Omit<LarkErrorContext, "phase">,
  phase: LarkErrorContext["phase"],
  sink: LarkErrorSink | undefined,
): (error: unknown) => void {
  return (error: unknown): void => {
    reportLarkError(error, { ...base, phase }, sink);
  };
}

/**
 * Instrument a Lark Mvc view setup function for error monitoring.
 *
 * The returned function is a drop-in `ViewSetup`: pass it to
 * `registerViewClass`, return it from the `require` loader, or wrap the
 * argument of `defineView` directly. It captures and reports:
 *
 * - setup errors (phase `"setup"`), rethrown to preserve framework behavior;
 * - template render errors (phase `"template"`);
 * - delegated DOM event handler errors (phase `"event"`, including the
 *   offending event map key such as `"increment<click>"`);
 * - `assign()` errors (phase `"assign"`).
 *
 * All errors are rethrown after reporting so the framework observes exactly
 * the same control flow as without instrumentation.
 *
 * @example
 * ```ts
 * import { defineView } from "@lark.js/mvc";
 * import { instrumentView } from "@lark.js/sentry";
 *
 * export default instrumentView(
 *   defineView((ctx) => ({ template, events: { "go<click>": () => {} } })),
 *   { viewPath: "views/home" },
 * );
 * ```
 *
 * @param setup - The view setup function to instrument.
 * @param options - Optional view path metadata and a per-view error sink.
 * @returns An instrumented setup function with identical semantics.
 */
export function instrumentView<T>(
  setup: ViewSetup<T>,
  options: InstrumentViewOptions = {},
): ViewSetup<T> {
  const { viewPath, onError } = options;
  return (ctx, params) => {
    const base: Omit<LarkErrorContext, "phase"> =
      viewPath === undefined ? { viewId: ctx.id } : { viewId: ctx.id, viewPath };

    let descriptor: ViewDescriptor;
    try {
      descriptor = setup(ctx, params);
    } catch (error) {
      reportLarkError(error, { ...base, phase: "setup" }, onError);
      throw error;
    }

    const instrumented: ViewDescriptor = { ...descriptor };

    if (descriptor.template) {
      instrumented.template = wrapTemplate(
        descriptor.template,
        phaseReporter(base, "template", onError),
      );
    }

    if (descriptor.events) {
      const wrappedEvents: Record<string, AnyFunc> = {};
      for (const [eventKey, handler] of Object.entries(descriptor.events)) {
        wrappedEvents[eventKey] = wrapHandler(handler, (error: unknown): void => {
          reportLarkError(error, { ...base, phase: "event", eventKey }, onError);
        });
      }
      instrumented.events = wrappedEvents;
    }

    if (descriptor.assign) {
      instrumented.assign = wrapAssign(descriptor.assign, phaseReporter(base, "assign", onError));
    }

    return instrumented;
  };
}
