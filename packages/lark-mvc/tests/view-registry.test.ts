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
} from "../src/view-registry";
import { defineView } from "../src/view";

describe("view-registry", () => {
  beforeEach(() => {
    // Wipe registry between tests
    const reg = getViewClassRegistry();
    for (const key of Object.keys(reg)) {
      invalidateViewClass(key);
    }
  });

  it("registers and looks up a view class by path", () => {
    const A = defineView(() => ({ template: () => "" }));
    registerViewClass("foo/a", A);
    expect(getViewClass("foo/a")).toBe(A);
  });

  it("strips query parameters from the view path", () => {
    const B = defineView(() => ({ template: () => "" }));
    registerViewClass("bar/b?x=1", B);
    // Lookup uses path only — the query was stripped on register.
    expect(getViewClass("bar/b")).toBe(B);
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
    expect(reg["zzz/e"]).toBe(E);
  });
});
