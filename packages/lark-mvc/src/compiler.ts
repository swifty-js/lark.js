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
 * Compiler barrel export — re-exports the public compile-time API.
 *
 * - `compileTemplate(source, options?)` — Compile a `.html` template string
 *   into an ES module exporting a render function `(data, viewId, refData) => string | VDomNode`.
 * - `extractGlobalVars(source)` — AST-based extraction of template data variables
 *   (used for zero-config variable auto-detection).
 *
 * These functions run at **build time** (Node.js) via the Vite / Webpack /
 * Rspack plugins — they are NOT part of the browser runtime bundle.
 */
export { compileTemplate } from "./compiler/compile-template";
export { extractGlobalVars } from "./compiler/extract-global-vars";
