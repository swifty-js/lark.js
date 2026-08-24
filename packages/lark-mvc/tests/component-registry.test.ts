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
  getComponent,
  registerComponent,
  invalidateComponent,
  getComponentRegistry,
  ensureComponentName,
  aliasComponent,
  canonicalComponent,
} from "../src/component-registry";
import type { Component } from "../src/jsx/vnode";

const makeComponent = (): Component => () => null;

describe("component-registry", () => {
  beforeEach(() => {
    // Wipe registry between tests
    const reg = getComponentRegistry();
    for (const key of Object.keys(reg)) {
      invalidateComponent(key);
    }
  });

  it("registers a function component under a path", () => {
    const A = makeComponent();
    registerComponent("foo/a", A);
    expect(getComponent("foo/a")).toBe(A);
  });

  it("strips query parameters from the path", () => {
    const B = makeComponent();
    registerComponent("bar/b?x=1", B);
    // Lookup uses path only — the query was stripped on register.
    expect(getComponent("bar/b")).toBe(B);
    expect(getComponent("bar/b?x=1")).toBeUndefined();
  });

  it("ignores empty path and non-function registrations", () => {
    registerComponent("", makeComponent());
    expect(getComponent("")).toBeUndefined();
    registerComponent("weird/value", "not-a-fn" as unknown as Component);
    expect(getComponent("weird/value")).toBeUndefined();
  });

  it("invalidate removes a previously registered component", () => {
    const D = makeComponent();
    registerComponent("baz/d", D);
    invalidateComponent("baz/d");
    expect(getComponent("baz/d")).toBeUndefined();
  });

  it("getComponentRegistry returns the live registry map", () => {
    const E = makeComponent();
    registerComponent("zzz/e", E);
    const reg = getComponentRegistry();
    expect(reg["zzz/e"]).toBe(E);
  });

  it("ensureComponentName assigns a stable auto name and registers the fn", () => {
    function Fancy(): null {
      return null;
    }
    const name = ensureComponentName(Fancy);
    expect(name).toMatch(/^__c\d+_Fancy$/);
    expect(ensureComponentName(Fancy)).toBe(name);
    expect(getComponent(name)).toBe(Fancy);
  });

  it("ensureComponentName reuses an explicit registerComponent name", () => {
    const V = makeComponent();
    registerComponent("named/view", V);
    expect(ensureComponentName(V)).toBe("named/view");
  });

  it("aliasComponent maps a replacement to the original name (HMR)", () => {
    const Old = makeComponent();
    const name = ensureComponentName(Old);
    const New = makeComponent();
    aliasComponent(Old, New);
    expect(ensureComponentName(New)).toBe(name);
  });

  it("canonicalComponent resolves stale references through alias chains", () => {
    const v1 = makeComponent();
    const v2 = makeComponent();
    const v3 = makeComponent();
    expect(canonicalComponent(v1)).toBe(v1);
    aliasComponent(v1, v2);
    aliasComponent(v2, v3);
    expect(canonicalComponent(v1)).toBe(v3); // chain: v1 → v2 → v3
    expect(canonicalComponent(v2)).toBe(v3);
    expect(canonicalComponent(v3)).toBe(v3);
  });

  it("getComponent resolves registry entries through the alias map", () => {
    const Old = makeComponent();
    const New = makeComponent();
    registerComponent("app/home", Old);
    aliasComponent(Old, New);
    expect(getComponent("app/home")).toBe(New);
  });
});
