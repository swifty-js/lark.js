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

import { render, unmount } from "@lark.js/mvc";
import { jsx } from "@lark.js/mvc/jsx-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetExposurePlugin, useExposure } from "../src/exposure.js";

const { observe, unobserve, destroy } = vi.hoisted(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("@swifty.js/sentry/plugins", () => ({
  ExposurePlugin: class MockExposurePlugin {
    observe = observe;
    unobserve = unobserve;
    destroy = destroy;
  },
}));

vi.mock("@swifty.js/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@swifty.js/sentry")>();
  return { ...actual, enablePlugin: vi.fn() };
});

const { enablePlugin } = await import("@swifty.js/sentry");
const enableMock = vi.mocked(enablePlugin);

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  unmount(container);
  container.remove();
  resetExposurePlugin(); // isolate the module singleton between tests
  observe.mockReset();
  unobserve.mockReset();
  destroy.mockReset();
  enableMock.mockClear();
  vi.restoreAllMocks();
});

describe("useExposure", () => {
  it("observes the element after commit, forwarding threshold and params", () => {
    function Banner() {
      const exposureRef = useExposure({ threshold: 0.75, params: { bannerId: "b1" } });
      return jsx("div", { ref: exposureRef, children: "banner" });
    }

    render(jsx(Banner, {}), container);

    const el = container.querySelector("div");
    expect(el).not.toBeNull();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith({
      target: el,
      threshold: 0.75,
      params: { bannerId: "b1" },
    });
    expect(enableMock).toHaveBeenCalledTimes(1); // shared plugin registered once
  });

  it("unobserves the element on unmount", () => {
    function Banner() {
      const exposureRef = useExposure();
      return jsx("div", { ref: exposureRef });
    }

    render(jsx(Banner, {}), container);
    const el = container.querySelector("div");
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ target: el }));

    unmount(container);

    expect(unobserve).toHaveBeenCalledTimes(1);
    expect(unobserve).toHaveBeenCalledWith(el);
  });

  it("shares ONE plugin instance across call sites (no re-registration)", () => {
    function A() {
      return jsx("div", { ref: useExposure() });
    }
    function B() {
      return jsx("span", { ref: useExposure() });
    }

    render(jsx("div", { children: [jsx(A, {}), jsx(B, {})] }), container);

    expect(observe).toHaveBeenCalledTimes(2);
    expect(enableMock).toHaveBeenCalledTimes(1); // module-level singleton
  });

  it("logs and swallows plugin failures — telemetry never crashes rendering", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    observe.mockImplementation(() => {
      throw new Error("observer exploded");
    });

    function Banner() {
      return jsx("div", { ref: useExposure(), children: "ok" });
    }

    expect(() => render(jsx(Banner, {}), container)).not.toThrow();
    expect(container.textContent).toBe("ok");
    expect(errorSpy).toHaveBeenCalledWith(
      "[lark-sentry] exposure tracking failed:",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});

describe("resetExposurePlugin", () => {
  it("destroys the shared plugin; the next use re-creates and re-registers it", () => {
    function Banner() {
      return jsx("div", { ref: useExposure() });
    }

    render(jsx(Banner, {}), container);
    expect(enableMock).toHaveBeenCalledTimes(1);

    resetExposurePlugin();
    expect(destroy).toHaveBeenCalledTimes(1);

    unmount(container); // no plugin re-created just to unobserve
    expect(unobserve).not.toHaveBeenCalled();
    expect(enableMock).toHaveBeenCalledTimes(1);

    render(jsx(Banner, {}), container); // fresh mount re-creates the plugin
    expect(enableMock).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — resetting with no plugin is a no-op", () => {
    resetExposurePlugin();
    resetExposurePlugin();
    expect(destroy).not.toHaveBeenCalled();
  });
});
