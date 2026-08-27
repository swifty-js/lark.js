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

import { createRouter } from "@lark.js/mvc";
import type { RouterApi } from "@lark.js/mvc";
import { EventType } from "@swifty.js/sentry";
import type { IReportData, ReportDataHook } from "@swifty.js/sentry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initLarkSentry } from "../src/init.js";

vi.mock("@swifty.js/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@swifty.js/sentry")>();
  return { ...actual, init: vi.fn(), tracePageView: vi.fn() };
});

const { init, tracePageView } = await import("@swifty.js/sentry");
const initMock = vi.mocked(init);
const traceMock = vi.mocked(tracePageView);

const Home = (): string => "home";

let router: RouterApi | undefined;
let uninstallers: Array<() => void> = [];

beforeEach(() => {
  globalThis.history.replaceState(null, "", "/");
});

afterEach(() => {
  for (const uninstall of uninstallers) uninstall();
  uninstallers = [];
  router?.dispose(); // also clears the ACTIVE router pointer
  router = undefined;
  initMock.mockClear();
  traceMock.mockReset();
  vi.restoreAllMocks();
});

function makeRouter(): RouterApi {
  router = createRouter([{ path: "/", component: Home }]);
  return router;
}

function makeReport(type: EventType): IReportData {
  return { type } as unknown as IReportData;
}

describe("initLarkSentry", () => {
  it("passes SDK options through and strips the lark-only keys", () => {
    const r = makeRouter();
    uninstallers.push(
      initLarkSentry({
        dsn: "/api/log",
        projectId: "app",
        router: r,
        trackRoutes: true,
        attachStores: { cart: () => ({}) },
      }),
    );

    expect(initMock).toHaveBeenCalledTimes(1);
    const arg = initMock.mock.calls[0]![0];
    expect(arg).toEqual(
      expect.objectContaining({
        dsn: "/api/log",
        projectId: "app",
        onBeforeReportData: expect.any(Function),
      }),
    );
    expect(arg).not.toHaveProperty("router");
    expect(arg).not.toHaveProperty("trackRoutes");
    expect(arg).not.toHaveProperty("attachStores");
  });

  it("installs route tracking on the explicit router", async () => {
    const r = makeRouter();
    uninstallers.push(initLarkSentry({ dsn: "/api/log", router: r }));
    traceMock.mockClear();

    await r.navigate("/somewhere");
    expect(traceMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the ACTIVE router when none is passed", async () => {
    const r = makeRouter();
    uninstallers.push(initLarkSentry({ dsn: "/api/log" }));
    traceMock.mockClear();

    await r.navigate("/somewhere");
    expect(traceMock).toHaveBeenCalledTimes(1);
  });

  it("warns and skips route tracking when no router is resolvable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const uninstall = initLarkSentry({ dsn: "/api/log" });
    uninstallers.push(uninstall);

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("route tracking skipped"));
    expect(traceMock).not.toHaveBeenCalled();
    expect(() => uninstall()).not.toThrow();
  });

  it("skips route tracking silently when trackRoutes is false", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    makeRouter();

    uninstallers.push(initLarkSentry({ dsn: "/api/log", trackRoutes: false }));

    expect(warn).not.toHaveBeenCalled();
    expect(traceMock).not.toHaveBeenCalled();
  });

  it("does not install onBeforeReportData when attachStores is absent", () => {
    makeRouter();
    uninstallers.push(initLarkSentry({ dsn: "/api/log" }));

    expect(initMock.mock.calls[0]![0]).not.toHaveProperty("onBeforeReportData");
  });

  it("attachStores composes the user hook (user hook runs first)", async () => {
    const r = makeRouter();
    const seen: string[] = [];
    const userHook: ReportDataHook = (data) => {
      seen.push("user");
      return data;
    };

    uninstallers.push(
      initLarkSentry({
        dsn: "/api/log",
        router: r,
        attachStores: { cart: { getState: () => ({ items: 2 }) } },
        onBeforeReportData: userHook,
      }),
    );

    const hook = initMock.mock.calls[0]![0].onBeforeReportData!;
    const result = await hook(makeReport(EventType.Error));

    expect(seen).toEqual(["user"]);
    expect(result).toEqual(
      expect.objectContaining({
        type: EventType.Error,
        storeState: { cart: { items: 2 } },
      }),
    );
  });
});
