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

import { hotSwapByComponent, render, signal, unmount } from "@lark.js/mvc";
import { jsx } from "@lark.js/mvc/jsx-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProfiler } from "../src/profiler.js";

vi.mock("@swifty.js/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@swifty.js/sentry")>();
  return { ...actual, tracePerformance: vi.fn() };
});

const { tracePerformance } = await import("@swifty.js/sentry");
const perfMock = vi.mocked(tracePerformance);

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  unmount(container);
  container.remove();
  perfMock.mockReset();
});

function callsNamed(name: string): Array<{ name: string; message: string; value: number }> {
  return perfMock.mock.calls.map(([arg]) => arg).filter((arg) => arg.name === name);
}

describe("useProfiler", () => {
  it("reports a mount metric after the first commit", () => {
    function Target() {
      useProfiler("Target");
      return jsx("div", { children: "t" });
    }

    render(jsx(Target, {}), container);

    expect(perfMock).toHaveBeenCalledTimes(1);
    expect(perfMock).toHaveBeenCalledWith({
      name: "LarkComponentMount",
      message: "Target",
      value: expect.any(Number),
    });
  });

  it("reports lifespan and body-run count on unmount (re-renders counted, not re-reported)", () => {
    const tick = signal(0);
    function Counter() {
      useProfiler("Counter");
      return jsx("div", { children: tick.value });
    }

    render(jsx(Counter, {}), container);
    tick.value++; // re-render (synchronous)
    tick.value++;

    expect(callsNamed("LarkComponentMount")).toHaveLength(1); // mount is not re-reported
    expect(callsNamed("LarkComponentLifespan")).toHaveLength(0);

    unmount(container);

    expect(callsNamed("LarkComponentLifespan")).toEqual([
      { name: "LarkComponentLifespan", message: "Counter", value: expect.any(Number) },
    ]);
    expect(callsNamed("LarkComponentRenders")).toEqual([
      { name: "LarkComponentRenders", message: "Counter", value: 3 },
    ]);
  });

  it("never lets reporting failures break rendering", () => {
    perfMock.mockImplementation(() => {
      throw new Error("reporter exploded");
    });
    function Target() {
      useProfiler("Target");
      return jsx("div", { children: "ok" });
    }

    expect(() => render(jsx(Target, {}), container)).not.toThrow();
    expect(container.textContent).toBe("ok");
    expect(() => unmount(container)).not.toThrow();
  });

  it("suppresses the mount metric when an HMR swap recreates the effect slot", () => {
    function TargetV1() {
      useProfiler("Target");
      return jsx("div", { children: "v1" });
    }
    function TargetV2() {
      useProfiler("Target");
      return jsx("div", { children: "v2" });
    }

    render(jsx(TargetV1, {}), container);
    expect(callsNamed("LarkComponentMount")).toHaveLength(1);

    hotSwapByComponent(TargetV1, TargetV2);

    expect(container.textContent).toBe("v2");
    expect(callsNamed("LarkComponentMount")).toHaveLength(1); // no garbage re-mount metric
  });
});
