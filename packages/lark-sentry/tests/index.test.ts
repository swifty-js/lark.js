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
import { afterEach, describe, expect, it, vi } from "vitest";
import { initLarkSentry, installLarkSentry } from "../src/index.js";

vi.mock("@swifty.js/sentry", () => ({
  EventType: { OtherFrameworks: "OtherFrameworks" },
  reportFrameworkError: vi.fn(),
  init: vi.fn(),
}));

const { init, reportFrameworkError } = await import("@swifty.js/sentry");
const initMock = vi.mocked(init);
const reportMock = vi.mocked(reportFrameworkError);

let uninstallers: Array<() => void> = [];

afterEach(() => {
  for (const uninstall of uninstallers) uninstall();
  uninstallers = [];
  initMock.mockClear();
  reportMock.mockClear();
  Framework.setConfig({ error: undefined });
});

describe("installLarkSentry", () => {
  it("patches FrameworkConfig.error to report via reportFrameworkError", () => {
    uninstallers.push(installLarkSentry());

    const boom = new Error("boom");
    Framework.getConfig().error!(boom);

    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith({
      type: "OtherFrameworks",
      error: boom,
      context: { framework: "lark-mvc" },
    });
  });

  it("preserves and calls the previous error handler", () => {
    const previous = vi.fn();
    Framework.setConfig({ error: previous });

    uninstallers.push(installLarkSentry());

    const boom = new Error("boom");
    Framework.getConfig().error!(boom);

    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledWith(boom);
  });

  it("suppresses rethrows from the previous handler", () => {
    Framework.setConfig({
      error: (e: Error) => {
        throw e;
      },
    });

    uninstallers.push(installLarkSentry());

    expect(() => Framework.getConfig().error!(new Error("boom"))).not.toThrow();
    expect(reportMock).toHaveBeenCalledTimes(1);
  });

  it("swallows reportFrameworkError failures", () => {
    reportMock.mockImplementation(() => {
      throw new Error("report exploded");
    });

    uninstallers.push(installLarkSentry());

    expect(() => Framework.getConfig().error!(new Error("boom"))).not.toThrow();
  });

  it("restores the previous error handler on uninstall", () => {
    const previous = vi.fn();
    Framework.setConfig({ error: previous });

    const uninstall = installLarkSentry();
    expect(Framework.getConfig().error).not.toBe(previous);

    uninstall();
    expect(Framework.getConfig().error).toBe(previous);
  });

  it("restores undefined when no previous handler existed", () => {
    Framework.setConfig({ error: undefined });

    const uninstall = installLarkSentry();
    expect(Framework.getConfig().error).toBeDefined();

    uninstall();
    expect(Framework.getConfig().error).toBeUndefined();
  });
});

describe("initLarkSentry", () => {
  it("initializes the SDK and installs the error hook", () => {
    const uninstall = initLarkSentry({ dsn: "/api/log", projectId: "app" });
    uninstallers.push(uninstall);

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith({ dsn: "/api/log", projectId: "app" });

    Framework.getConfig().error!(new Error("boom"));
    expect(reportMock).toHaveBeenCalledTimes(1);
  });
});
