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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useUrlState } from "../src/url-state";
import { Router } from "../src/router";
import { effect } from "../src/reactive";
import type { FrameworkConfig, Location } from "../src/types";

function mockLocation(params: Record<string, string>): Location {
  return {
    href: "https://example.com/",
    srcQuery: "/",
    srcHash: "",
    query: { path: "/", params },
    hash: { path: "", params: {} },
    params,
    get(key: string, defaultValue?: string) {
      return params[key] || defaultValue || "";
    },
  };
}

describe("useUrlState", () => {
  beforeEach(() => {
    Router._setConfig({
      rootId: "app",
      routeMode: "history",
    } as FrameworkConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("read() returns initial state when URL has no params", () => {
    const [read] = useUrlState({ page: "1", size: "20" });
    const state = read();
    expect(state.page).toBe("1");
    expect(state.size).toBe("20");
  });

  it("read() reads URL params fresh on every call, overriding defaults", () => {
    const spy = vi.spyOn(Router, "parse").mockReturnValue(mockLocation({}));
    const [read] = useUrlState({ page: "1", size: "20" });
    expect(read().page).toBe("1");

    spy.mockReturnValue(mockLocation({ page: "3", size: "50" }));
    expect(read().page).toBe("3");
    expect(read().size).toBe("50");
  });

  it("read() is tracked — effects re-run after a real navigation", () => {
    Router.diff(); // sync lastLocation with the current test URL
    const [read] = useUrlState({ page: "1" });
    const seen: string[] = [];
    const dispose = effect(() => {
      seen.push(read().page);
    });
    expect(seen).toEqual(["1"]);

    // Real history-mode navigation. Without Framework.boot there is no
    // _bind()/notify wiring, so run change detection manually — diff()
    // bumps the location version signal that read() subscribes to.
    Router.to({ page: "7" });
    Router.diff();
    expect(seen[seen.length - 1]).toBe("7");

    dispose();
    Router.to({ page: "" }, undefined, true); // restore URL for other tests
    Router.diff();
  });

  it("write() calls Router.to with the patch", () => {
    const toSpy = vi.spyOn(Router, "to").mockImplementation(() => {});

    const [, write] = useUrlState({ page: "1", size: "20" });
    write({ page: "2" });

    expect(toSpy).toHaveBeenCalledWith({ page: "2" });
  });

  it("write() supports updater function", () => {
    const toSpy = vi.spyOn(Router, "to").mockImplementation(() => {});

    const [, write] = useUrlState({ page: "1", size: "20" });
    write((prev) => ({ page: String(Number(prev.page) + 1) }));

    expect(toSpy).toHaveBeenCalledWith({ page: "2" });
  });

  it("works without initial state", () => {
    const [read] = useUrlState();
    expect(read()).toEqual({});
  });
});
