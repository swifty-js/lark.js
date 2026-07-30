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

import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

// tsup runs array configs in parallel via Promise.all — a single config's
// onSuccess fires before other configs' DTS generation finishes.
// Defer the copy to process exit so all builds are fully complete.
(() => {
  process.on("exit", () => {
    copyFileSync("src/client.d.ts", "dist/client.d.ts");
    copyFileSync("src/client.d.ts", "dist/client.d.cts");
  });
})();

export default defineConfig([
  {
    entry: ["src/index.ts"],
    clean: true,
    dts: {
      resolve: true,
    },
    format: ["esm", "cjs"],
    minify: false,
    noExternal: [],
    sourcemap: false,
    tsconfig: "./tsconfig.build.json",
  },
  {
    entry: ["src/compiler.ts"],
    dts: true,
    format: ["esm", "cjs"],
    minify: false,
    noExternal: ["@babel/parser", "@babel/types"],
    sourcemap: false,
    tsconfig: "./tsconfig.build.json",
  },
  {
    // Rspack / Webpack / Vite plugin entries — each needs __filename shim to
    // resolve to its own file (not a shared chunk) for the LarkMvcPlugin to
    // locate the loader at runtime. splitting: false ensures each ESM entry
    // is a single self-contained file with no shared chunk extraction.
    entry: ["src/rspack.ts", "src/webpack.ts", "src/vite.ts"],
    dts: true,
    format: ["esm", "cjs"],
    minify: false,
    noExternal: ["@babel/parser", "@babel/types"],
    shims: true,
    splitting: false,
    sourcemap: false,
    tsconfig: "./tsconfig.build.json",
  },
  {
    // Template runtime — imported by compiled `.html` modules. Kept tiny so
    // pulling in `@lark.js/mvc/runtime` doesn't drag the whole framework in.
    entry: ["src/runtime.ts", "src/devtool.ts"],
    dts: true,
    format: ["esm", "cjs"],
    minify: false,
    noExternal: [],
    sourcemap: false,
    tsconfig: "./tsconfig.build.json",
  },
]);
