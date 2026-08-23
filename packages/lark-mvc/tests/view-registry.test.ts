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

import { describe, it, expect, beforeEach } from "vitest";
import {
  getViewClass,
  registerViewClass,
  invalidateViewClass,
  getViewClassRegistry,
  resolveSetup,
  ensureViewName,
  aliasViewName,
} from "../src/view-registry";
import { defineView } from "../src/view";
import { isLarkView } from "../src/jsx/vnode";

describe("view-registry", () => {
  beforeEach(() => {
    // Wipe registry between tests
    const reg = getViewClassRegistry();
    for (const key of Object.keys(reg)) {
      invalidateViewClass(key);
    }
  });

  it("registers a component and stores the unwrapped setup", () => {
    const A = defineView(() => ({ template: () => "" }));
    registerViewClass("foo/a", A);
    expect(getViewClass("foo/a")).toBe(A.setup);
  });

  it("strips query parameters from the view path", () => {
    const B = defineView(() => ({ template: () => "" }));
    registerViewClass("bar/b?x=1", B);
    // Lookup uses path only — the query was stripped on register.
    expect(getViewClass("bar/b")).toBe(B.setup);
    expect(getViewClass("bar/b?x=1")).toBeUndefined();
  });

  it("ignores empty path on registration", () => {
    const C = defineView(() => ({ template: () => "" }));
    registerViewClass("", C);
    expect(getViewClass("")).toBeUndefined();
  });

  it("invalidate removes a previously registered class", () => {
    const D = defineView(() => ({ template: () => "" }));
    registerViewClass("baz/d", D);
    invalidateViewClass("baz/d");
    expect(getViewClass("baz/d")).toBeUndefined();
  });

  it("getViewClassRegistry returns the live registry map", () => {
    const E = defineView(() => ({ template: () => "" }));
    registerViewClass("zzz/e", E);
    const reg = getViewClassRegistry();
    expect(reg["zzz/e"]).toBe(E.setup);
  });

  it("resolveSetup unwraps branded components and passes plain setups through", () => {
    const V = defineView(() => ({}));
    expect(isLarkView(V)).toBe(true);
    expect(resolveSetup(V)).toBe(V.setup);
    const plain = (): Record<string, never> => ({});
    expect(resolveSetup(plain)).toBe(plain);
  });

  it("ensureViewName assigns a stable auto name and registers the setup", () => {
    const V = defineView(function Fancy() {
      return {};
    });
    const name = ensureViewName(V);
    expect(name).toMatch(/^__v\d+_Fancy$/);
    expect(ensureViewName(V)).toBe(name);
    expect(getViewClass(name)).toBe(V.setup);
  });

  it("ensureViewName reuses an explicit registerViewClass name", () => {
    const V = defineView(() => ({}));
    registerViewClass("named/view", V);
    expect(ensureViewName(V)).toBe("named/view");
  });

  it("aliasViewName maps a replacement to the original name (HMR)", () => {
    const Old = defineView(() => ({}));
    const name = ensureViewName(Old);
    const New = defineView(() => ({}));
    aliasViewName(Old, New);
    expect(ensureViewName(New)).toBe(name);
  });
});
