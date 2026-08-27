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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installRouteTracking } from "../src/route-tracking.js";

vi.mock("@swifty.js/sentry", () => ({
  tracePageView: vi.fn(),
}));

const { tracePageView } = await import("@swifty.js/sentry");
const traceMock = vi.mocked(tracePageView);

const Home = (): string => "home";
const User = (): string => "user";

let router: RouterApi | undefined;
let uninstallers: Array<() => void> = [];

beforeEach(() => {
  globalThis.history.replaceState(null, "", "/");
});

afterEach(() => {
  for (const uninstall of uninstallers) uninstall();
  uninstallers = [];
  router?.dispose();
  router = undefined;
  traceMock.mockReset();
});

function makeRouter(): RouterApi {
  router = createRouter([
    { path: "/", component: Home },
    { path: "/users/:id", component: User },
  ]);
  return router;
}

describe("installRouteTracking", () => {
  it("reports the initial location as a LarkRoute page view", () => {
    const r = makeRouter();
    uninstallers.push(installRouteTracking(r));

    expect(traceMock).toHaveBeenCalledTimes(1);
    expect(traceMock).toHaveBeenCalledWith({
      name: "LarkRoute",
      message: "/",
      extra: {
        pattern: "/",
        params: {},
        href: globalThis.location.href,
      },
    });
  });

  it("reports the matched route PATTERN and decoded params per navigation", async () => {
    const r = makeRouter();
    uninstallers.push(installRouteTracking(r));
    traceMock.mockClear();

    await r.navigate("/users/42?tab=posts");

    expect(traceMock).toHaveBeenCalledTimes(1);
    expect(traceMock).toHaveBeenCalledWith({
      name: "LarkRoute",
      message: "/users/42?tab=posts",
      extra: {
        pattern: "/users/:id",
        params: { id: "42" },
        href: globalThis.location.href,
      },
    });
  });

  it("reports pattern null for unmatched locations", async () => {
    const r = makeRouter();
    uninstallers.push(installRouteTracking(r));
    traceMock.mockClear();

    await r.navigate("/nowhere");

    expect(traceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "/nowhere",
        extra: expect.objectContaining({ pattern: null, params: {} }),
      }),
    );
  });

  it("uninstall stops the tracking", async () => {
    const r = makeRouter();
    const uninstall = installRouteTracking(r);
    traceMock.mockClear();

    uninstall();
    await r.navigate("/users/1");
    expect(traceMock).not.toHaveBeenCalled();
  });

  it("swallows tracePageView failures (reporting never breaks navigation)", async () => {
    traceMock.mockImplementation(() => {
      throw new Error("report exploded");
    });
    const r = makeRouter();
    uninstallers.push(installRouteTracking(r));

    await expect(r.navigate("/users/1")).resolves.toBe(true);
    expect(r.location.value.pathname).toBe("/users/1");
  });
});
