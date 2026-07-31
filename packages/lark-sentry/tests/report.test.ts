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
 * Tests for the error sink module (`report.ts`).
 *
 * `@swifty.js/sentry` is mocked at the module boundary so the tests can
 * assert exactly what the default sink hands to the SDK without performing
 * real reporting.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { reportLarkError, setLarkErrorSink } from "../src/report.js";
import type { LarkErrorContext } from "../src/types.js";

vi.mock("@swifty.js/sentry", () => ({
  EventType: { OtherFrameworks: "OtherFrameworks" },
  reportFrameworkError: vi.fn(),
  init: vi.fn(),
}));

const { reportFrameworkError } = await import("@swifty.js/sentry");
const reportFrameworkErrorMock = vi.mocked(reportFrameworkError);

const context: LarkErrorContext = { phase: "event", viewId: "v1", eventKey: "go<click>" };

afterEach(() => {
  setLarkErrorSink(undefined);
  reportFrameworkErrorMock.mockClear();
});

describe("reportLarkError / default sink", () => {
  it("reports through @swifty.js/sentry as an OtherFrameworks event with lark-mvc context", () => {
    const boom = new Error("boom");
    reportLarkError(boom, context);

    expect(reportFrameworkErrorMock).toHaveBeenCalledTimes(1);
    expect(reportFrameworkErrorMock).toHaveBeenCalledWith({
      type: "OtherFrameworks",
      error: boom,
      context: {
        framework: "lark-mvc",
        phase: "event",
        viewId: "v1",
        eventKey: "go<click>",
      },
    });
  });

  it("prefers the per-call sink over the active sink", () => {
    const active = vi.fn();
    const perCall = vi.fn();
    setLarkErrorSink(active);

    const boom = new Error("boom");
    reportLarkError(boom, context, perCall);

    expect(perCall).toHaveBeenCalledWith(boom, context);
    expect(active).not.toHaveBeenCalled();
    expect(reportFrameworkErrorMock).not.toHaveBeenCalled();
  });

  it("swallows sink exceptions so reporting never disturbs control flow", () => {
    setLarkErrorSink(() => {
      throw new Error("sink exploded");
    });

    expect(() => reportLarkError(new Error("boom"), context)).not.toThrow();
  });
});

describe("setLarkErrorSink", () => {
  it("replaces the active sink and returns the previous one", () => {
    const first = vi.fn();
    const second = vi.fn();

    const initial = setLarkErrorSink(first);
    expect(typeof initial).toBe("function");

    const previous = setLarkErrorSink(second);
    expect(previous).toBe(first);

    const boom = new Error("boom");
    reportLarkError(boom, context);
    expect(second).toHaveBeenCalledWith(boom, context);
    expect(first).not.toHaveBeenCalled();
  });

  it("restores the default sink when called with undefined", () => {
    const custom = vi.fn();
    setLarkErrorSink(custom);
    setLarkErrorSink(undefined);

    reportLarkError(new Error("boom"), context);
    expect(custom).not.toHaveBeenCalled();
    expect(reportFrameworkErrorMock).toHaveBeenCalledTimes(1);
  });
});
