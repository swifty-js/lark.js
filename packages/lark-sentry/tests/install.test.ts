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
 * Tests for `installLarkInstrumentation` / `initLarkSentry`.
 *
 * These tests run against the real `@lark.js/mvc` `Framework` configuration
 * singleton (`getConfig` / `setConfig`) so the patch/restore behavior is the
 * genuine article. Only `@swifty.js/sentry` is mocked, at the SDK boundary.
 */

import { Framework } from "@lark.js/mvc";
import type { AnyFunc, ViewCtx, ViewSetup } from "@lark.js/mvc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initLarkSentry, installLarkInstrumentation } from "../src/install.js";
import { setLarkErrorSink } from "../src/report.js";
import type { LarkErrorContext } from "../src/types.js";

vi.mock("@swifty.js/sentry", () => ({
  EventType: { OtherFrameworks: "OtherFrameworks" },
  reportFrameworkError: vi.fn(),
  init: vi.fn(),
}));

const { init } = await import("@swifty.js/sentry");
const initMock = vi.mocked(init);

function fakeCtx(id = "v1"): ViewCtx {
  return {
    id,
    cleanups: [] as Array<() => void>,
    on: (_event: string, _handler: AnyFunc) => () => {},
    off: (_event: string, _handler?: AnyFunc) => {},
  } as unknown as ViewCtx;
}

/** Uninstallers to run after each test so the singleton state is reset. */
let uninstallers: Array<() => void> = [];

function install(...args: Parameters<typeof installLarkInstrumentation>): () => void {
  const uninstall = installLarkInstrumentation(...args);
  uninstallers.push(uninstall);
  return uninstall;
}

afterEach(() => {
  for (const uninstall of uninstallers) uninstall();
  uninstallers = [];
  setLarkErrorSink(undefined);
  initMock.mockClear();
  // Drop test-injected config entries.
  Framework.setConfig({ error: undefined, require: undefined });
});

describe("installLarkInstrumentation — FrameworkConfig.error", () => {
  it("reports framework errors with phase 'framework' and still calls the previous handler", () => {
    const reports: Array<{ error: unknown; context: LarkErrorContext }> = [];
    const previousError = vi.fn();
    Framework.setConfig({ error: previousError });

    install({ onError: (error, context) => reports.push({ error, context }) });

    const boom = new Error("load failed");
    const patchedError = Framework.getConfig().error;
    expect(patchedError).not.toBe(previousError);
    patchedError!(boom);

    expect(reports).toHaveLength(1);
    expect(reports[0].error).toBe(boom);
    expect(reports[0].context).toEqual({ phase: "framework" });
    expect(previousError).toHaveBeenCalledWith(boom);
  });

  it("suppresses a rethrow from the previous handler (framework default rethrows)", () => {
    Framework.setConfig({
      error: (error: Error) => {
        throw error;
      },
    });
    const sink = vi.fn();
    install({ onError: sink });

    expect(() => Framework.getConfig().error!(new Error("boom"))).not.toThrow();
    expect(sink).toHaveBeenCalledTimes(1);
  });
});

describe("installLarkInstrumentation — FrameworkConfig.require", () => {
  it("instruments view setups resolved by the require loader, tagging the view path", async () => {
    const reports: Array<{ error: unknown; context: LarkErrorContext }> = [];
    const boom = new Error("setup failed");
    const throwingSetup: ViewSetup = () => {
      throw boom;
    };
    const previousRequire = vi.fn(() => Promise.resolve([throwingSetup, 123]));
    Framework.setConfig({ require: previousRequire });

    install({ onError: (error, context) => reports.push({ error, context }) });

    const patchedRequire = Framework.getConfig().require!;
    expect(patchedRequire).not.toBe(previousRequire);

    const modules = await patchedRequire(["views/a", "views/b"]);
    expect(previousRequire).toHaveBeenCalledWith(["views/a", "views/b"], undefined);
    // Non-function modules pass through untouched.
    expect(modules[1]).toBe(123);
    // Function modules are wrapped.
    expect(modules[0]).not.toBe(throwingSetup);

    expect(() => (modules[0] as ViewSetup)(fakeCtx("v-req"), undefined)).toThrow(boom);
    expect(reports).toHaveLength(1);
    expect(reports[0].context).toEqual({
      phase: "setup",
      viewId: "v-req",
      viewPath: "views/a",
    });
  });

  it("propagates wrapTemplate: false to instrumented views (template identity preserved)", async () => {
    const template = (): string => "<p>ok</p>";
    const setup: ViewSetup = () => ({ template, events: {} });
    Framework.setConfig({ require: () => Promise.resolve([setup]) });

    install({ onError: vi.fn(), wrapTemplate: false });

    const modules = await Framework.getConfig().require!(["views/tpl"]);
    const descriptor = (modules[0] as ViewSetup)(fakeCtx(), undefined);
    expect(descriptor.template).toBe(template);
  });

  it("wraps templates by default (wrapTemplate omitted)", async () => {
    const template = (): string => "<p>ok</p>";
    const setup: ViewSetup = () => ({ template, events: {} });
    Framework.setConfig({ require: () => Promise.resolve([setup]) });

    install({ onError: vi.fn() });

    const modules = await Framework.getConfig().require!(["views/tpl"]);
    const descriptor = (modules[0] as ViewSetup)(fakeCtx(), undefined);
    expect(descriptor.template).not.toBe(template);
    expect(descriptor.template!({}, "v1", {})).toBe("<p>ok</p>");
  });

  it("passes through a require loader returning undefined", () => {
    Framework.setConfig({ require: () => undefined });
    install({ onError: vi.fn() });

    expect(Framework.getConfig().require!(["views/x"])).toBeUndefined();
  });

  it("does not add a require wrapper when no loader is configured", () => {
    Framework.setConfig({ require: undefined });
    install({ onError: vi.fn() });

    expect(Framework.getConfig().require).toBeUndefined();
  });
});

describe("installLarkInstrumentation — install/uninstall lifecycle", () => {
  it("restores the previous error and require entries on uninstall", () => {
    const previousError = vi.fn();
    const previousRequire = vi.fn(() => Promise.resolve([]));
    Framework.setConfig({ error: previousError, require: previousRequire });

    const uninstall = install({ onError: vi.fn() });
    expect(Framework.getConfig().error).not.toBe(previousError);
    expect(Framework.getConfig().require).not.toBe(previousRequire);

    uninstall();
    expect(Framework.getConfig().error).toBe(previousError);
    expect(Framework.getConfig().require).toBe(previousRequire);
  });

  it("is idempotent: a second call returns the existing uninstaller", () => {
    const first = install({ onError: vi.fn() });
    const second = install({ onError: vi.fn() });
    expect(second).toBe(first);
  });

  it("updates the error sink when re-called with a new onError while active", () => {
    const firstSink = vi.fn();
    const secondSink = vi.fn();
    Framework.setConfig({ error: undefined });

    install({ onError: firstSink });
    install({ onError: secondSink });

    Framework.getConfig().error!(new Error("boom"));
    expect(secondSink).toHaveBeenCalledTimes(1);
    expect(firstSink).not.toHaveBeenCalled();
  });

  it("allows a fresh installation after uninstall", () => {
    const first = install({ onError: vi.fn() });
    first();
    uninstallers = [];

    const second = install({ onError: vi.fn() });
    expect(second).not.toBe(first);
  });
});

describe("initLarkSentry", () => {
  it("initializes the SDK without integration-only options and installs instrumentation", () => {
    const onError = vi.fn();
    const uninstall = initLarkSentry({
      dsn: "/api/log",
      projectId: "lark-app",
      onError,
      wrapTemplate: false,
    });
    uninstallers.push(uninstall);

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith({ dsn: "/api/log", projectId: "lark-app" });

    // The instrumentation is active and routes to the provided sink.
    Framework.getConfig().error!(new Error("boom"));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toEqual({ phase: "framework" });
  });
});
