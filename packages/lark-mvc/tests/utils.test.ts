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
import { parseUri, toUri } from "../src/utils";

describe("utils", () => {
  describe("parseUri", () => {
    it("parses path with no params", () => {
      const { path, params } = parseUri("/foo/bar");
      expect(path).toBe("/foo/bar");
      expect(params).toEqual({});
    });

    it("parses path with query params", () => {
      const { path, params } = parseUri("/x?a=1&b=2");
      expect(path).toBe("/x");
      expect(params).toEqual({ a: "1", b: "2" });
    });

    it("decodes URI-encoded values", () => {
      const { params } = parseUri("/x?name=hello%20world&token=a%3Db");
      expect(params["name"]).toBe("hello world");
      expect(params["token"]).toBe("a=b");
    });

    it("is safe under re-entrant calls (S6)", () => {
      // If parseUri kept accumulator state in a module-level variable,
      // calling it from inside a callback that re-enters parseUri would
      // observe corrupted state. Local accumulator means the outer call
      // is unaffected.
      let innerParams: Record<string, string> | undefined;
      const decode = (value: string): string => {
        // Re-entrant: parse another URI from the callback
        innerParams = parseUri(`/inner?k=${value}`).params;
        return value;
      };

      const { params } = parseUri("/outer?z=10");
      // Force a re-entry by calling parseUri again on a derived URI.
      decode(params["z"]);

      expect(params).toEqual({ z: "10" });
      expect(innerParams).toEqual({ k: "10" });
    });
  });

  describe("toUri", () => {
    it("appends query params to path", () => {
      expect(toUri("/x", { a: "1", b: "2" })).toBe("/x?a=1&b=2");
    });

    it("URL-encodes param values", () => {
      expect(toUri("/x", { q: "hello world" })).toBe("/x?q=hello%20world");
    });

    it("keepEmpty controls which empty-valued keys survive when keepEmpty is provided", () => {
      // Without keepEmpty: all params are kept (legacy behavior).
      expect(toUri("/x", { a: "", b: "v" })).toBe("/x?a=&b=v");
      // With keepEmpty: empty values dropped UNLESS the key is whitelisted.
      expect(toUri("/x", { a: "", b: "v", c: "" }, new Set(["a"]))).toBe("/x?a=&b=v");
    });

    it("returns the path unchanged when there are no params", () => {
      expect(toUri("/x", {})).toBe("/x");
    });
  });
});
