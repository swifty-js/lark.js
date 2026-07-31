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
