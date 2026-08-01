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
import { cjkTokenize, makeSnippet } from "../src/utils/search-text";

describe("cjkTokenize", () => {
  it("splits latin text into word tokens", () => {
    expect(cjkTokenize("Hello world-foo bar42")).toEqual([
      "Hello",
      "world",
      "foo",
      "bar42",
    ]);
  });

  it("emits per-character tokens for CJK runs (plus the run itself)", () => {
    expect(cjkTokenize("块级格式")).toEqual([
      "块级格式",
      "块",
      "级",
      "格",
      "式",
    ]);
  });

  it("handles mixed CJK/latin content", () => {
    const tokens = cjkTokenize("BFC 块级格式 context");
    expect(tokens).toContain("BFC");
    expect(tokens).toContain("context");
    expect(tokens).toContain("格");
    expect(tokens).toContain("块级格式");
  });

  it("returns empty for punctuation-only input", () => {
    expect(cjkTokenize("!?…—。")).toEqual([]);
  });
});

describe("makeSnippet", () => {
  const text =
    "The quick brown fox jumps over the lazy dog while the sleepy cat watches from a warm windowsill nearby in the afternoon sun of a long summer day".repeat(
      1,
    );

  it("returns the head when no term matches", () => {
    const s = makeSnippet(text, "zebra", 40);
    expect(s.startsWith("The quick")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });

  it("centers on the earliest matching term with edge ellipses", () => {
    const s = makeSnippet(text, "windowsill", 60);
    expect(s.startsWith("…")).toBe(true);
    expect(s).toContain("windowsill");
  });

  it("omits ellipses when the whole text fits", () => {
    expect(makeSnippet("short text", "short", 90)).toBe("short text");
  });

  it("returns empty string for empty text", () => {
    expect(makeSnippet("", "x")).toBe("");
  });
});
