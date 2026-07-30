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

import { describe, it } from "vitest";
import { compileTemplate, extractGlobalVars } from "../src/compiler";

describe("Comment placeholder spoofing investigation", () => {
  it("shows what happens with __lark_comment_0__ in template", async () => {
    const source = "before __lark_comment_0__ after";
    const result = await compileTemplate(source, { globalVars: [] });
    console.log("\n=== Source with __lark_comment_0__ ===");
    console.log(result);
  });

  it("shows what happens with real comment", async () => {
    const source = "before <!-- real comment --> after";
    const result = await compileTemplate(source, { globalVars: [] });
    console.log("\n=== Source with real comment ===");
    console.log(result);
  });

  it("shows what happens with both", async () => {
    const source = "before <!-- real comment --> __lark_comment_0__ after";
    const result = await compileTemplate(source, { globalVars: [] });
    console.log("\n=== Source with both ===");
    console.log(result);
  });

  it("shows extractGlobalVars result for destructuring", async () => {
    const source1 = "{{set {a, b} = obj}}{{=a}}{{=b}}";
    const vars1 = await extractGlobalVars(source1);
    console.log("\n=== Destructuring test 1: {a, b} = obj ===");
    console.log("Extracted vars:", vars1);

    const source2 = "{{set [a, b] = arr}}{{=a}}";
    const vars2 = await extractGlobalVars(source2);
    console.log("\n=== Destructuring test 2: [a, b] = arr ===");
    console.log("Extracted vars:", vars2);

    const source3 = "{{set fn = ({a, b}) => a + b}}{{=fn(obj)}}";
    const vars3 = await extractGlobalVars(source3);
    console.log("\n=== Destructuring test 3: arrow function params ===");
    console.log("Extracted vars:", vars3);
  });
});
