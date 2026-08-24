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

import { describe, it, expect } from "vitest";
import { strSafe, nextCounter } from "../src/common";

describe("common", () => {
  describe("strSafe", () => {
    it("returns '' for null", () => {
      expect(strSafe(null)).toBe("");
    });
    it("returns '' for undefined", () => {
      expect(strSafe(undefined)).toBe("");
    });
    it("converts number to string", () => {
      expect(strSafe(42)).toBe("42");
    });
    it("converts boolean true to 'true'", () => {
      expect(strSafe(true)).toBe("true");
    });
    it("converts boolean false to 'false'", () => {
      expect(strSafe(false)).toBe("false");
    });
    it("returns string as-is", () => {
      expect(strSafe("hello")).toBe("hello");
    });
    it("converts 0 to '0'", () => {
      expect(strSafe(0)).toBe("0");
    });
    it("converts empty string to empty string", () => {
      expect(strSafe("")).toBe("");
    });
    it("converts object to string via toString", () => {
      expect(strSafe({ toString: () => "custom" })).toBe("custom");
    });
  });

  describe("nextCounter", () => {
    it("returns incrementing numbers", () => {
      const c1 = nextCounter();
      const c2 = nextCounter();
      expect(c2).toBe(c1 + 1);
    });
    it("returns a number", () => {
      expect(typeof nextCounter()).toBe("number");
    });
  });
});
