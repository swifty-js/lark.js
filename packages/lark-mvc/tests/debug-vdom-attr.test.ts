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
import { compileTemplate, extractGlobalVars } from "../src/compiler";
import { vdomCreate } from "../src/vdom";
import * as runtime from "../src/runtime";

describe("VDOM Attribute XSS Investigation", () => {
  it("check what vdomCreate does with attributes", async () => {
    const source = '<div class="{{=xss}}">x</div>';
    const globalVars = await extractGlobalVars(source);
    const moduleCode = await compileTemplate(source, {
      vdom: true,
      globalVars,
    });

    console.log("\n=== Compiled module code ===");
    console.log(moduleCode);

    // Transform and execute
    const transformed = moduleCode
      .replace(
        /import\s*\{[^}]*\}\s*from\s*["']@lark.js\/mvc["'];?\n?/,
        "const __lark_vdom_create__ = __lark.vdomCreate;\n",
      )
      .replace(
        /import\s*\{[^}]*\}\s*from\s*["']@lark.js\/mvc\/runtime["'];?\n?/,
        "const { strSafe: __lark_str_safe__, refFn: __lark_ref_fn__ } = __runtime;\n",
      )
      .replace("function __lark_template__(", "return function(")
      .replace("\nexport default __lark_template__;", "");

    console.log("\n=== Transformed code ===");
    console.log(transformed);

    const factory = new Function("__lark", "__runtime", transformed);
    const templateFn = factory({ vdomCreate }, runtime);
    const result = templateFn({ xss: '"><script>alert(1)</script>' }, "test-view", null);

    console.log("\n=== Result ===");
    console.log("Full result:", JSON.stringify(result, null, 2));

    const div = result.children[0];
    console.log("\n=== Div details ===");
    console.log("Div tag:", div.tag);
    console.log("Div attrsMap:", div.attrsMap);
    console.log("Div html:", div.html);
    console.log("Div attrs:", div.attrs);

    // Check if the attribute value is escaped
    const classValue = div.attrsMap.class;
    console.log("\n=== Class attribute value ===");
    console.log("Type:", typeof classValue);
    console.log("Value:", classValue);
    console.log("Contains <script>?", classValue.includes("<script>"));
    console.log("Contains &lt;script&gt;?", classValue.includes("&lt;script&gt;"));

    expect(div).toBeDefined();
  });
});
