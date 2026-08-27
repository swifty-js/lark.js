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

import type { RouteObject } from "@lark.js/mvc";
import { EventType } from "@swifty.js/sentry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instrumentRoutes } from "../src/instrument-routes.js";

vi.mock("@swifty.js/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@swifty.js/sentry")>();
  return { ...actual, tracePerformance: vi.fn(), reportFrameworkError: vi.fn() };
});

const { tracePerformance, reportFrameworkError } = await import("@swifty.js/sentry");
const perfMock = vi.mocked(tracePerformance);
const errorMock = vi.mocked(reportFrameworkError);

const Admin = (): string => "admin";

afterEach(() => {
  perfMock.mockReset();
  errorMock.mockReset();
});

describe("instrumentRoutes", () => {
  it("returns a new array and passes non-lazy routes through by reference", () => {
    const home: RouteObject = { path: "/", component: Admin };
    const routes = [home];

    const result = instrumentRoutes(routes);

    expect(result).not.toBe(routes);
    expect(result[0]).toBe(home);
  });

  it("reports load time on lazy success and returns the module untouched", async () => {
    const mod = { default: Admin };
    const load = vi.fn(async () => mod);
    const [route] = instrumentRoutes([{ path: "/admin", lazy: load }]);

    await expect(route!.lazy!()).resolves.toBe(mod);
    expect(load).toHaveBeenCalledTimes(1);
    expect(perfMock).toHaveBeenCalledTimes(1);
    expect(perfMock).toHaveBeenCalledWith({
      name: "LarkLazyRoute",
      message: "/admin",
      value: expect.any(Number),
    });
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("reports an OtherFrameworks error with route context on lazy failure and rethrows", async () => {
    const boom = new Error("chunk load failed");
    const [route] = instrumentRoutes([{ path: "/admin", lazy: async () => Promise.reject(boom) }]);

    await expect(route!.lazy!()).rejects.toBe(boom);
    expect(perfMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith({
      type: EventType.OtherFrameworks,
      error: boom,
      context: { framework: "lark-mvc", route: "/admin", phase: "lazy-load" },
    });
  });

  it("does not mutate the input route objects", () => {
    const load = async (): Promise<typeof Admin> => Admin;
    const original: RouteObject = { path: "/admin", lazy: load };

    const [wrapped] = instrumentRoutes([original]);

    expect(original.lazy).toBe(load);
    expect(wrapped).not.toBe(original);
    expect(wrapped!.lazy).not.toBe(load);
    expect(wrapped!.path).toBe("/admin");
  });

  it("is idempotent — instrumenting an instrumented table is a no-op", async () => {
    const once = instrumentRoutes([{ path: "/admin", lazy: async () => Admin }]);
    const twice = instrumentRoutes(once);

    expect(twice[0]).toBe(once[0]);
    await twice[0]!.lazy!();
    expect(perfMock).toHaveBeenCalledTimes(1); // single wrap → single report
  });

  it("never lets reporting failures disturb route loading", async () => {
    perfMock.mockImplementation(() => {
      throw new Error("reporter exploded");
    });
    errorMock.mockImplementation(() => {
      throw new Error("reporter exploded");
    });

    const okRoute = instrumentRoutes([{ path: "/ok", lazy: async () => Admin }])[0]!;
    await expect(okRoute.lazy!()).resolves.toBe(Admin);

    const boom = new Error("chunk load failed");
    const badRoute = instrumentRoutes([
      { path: "/bad", lazy: async () => Promise.reject(boom) },
    ])[0]!;
    await expect(badRoute.lazy!()).rejects.toBe(boom); // the ORIGINAL error, not the reporter's
  });
});
