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

import { defineConfig } from "vite";
import { larkMvcPlugin } from "@lark.js/mvc/vite";
import { sentryPlugin } from "@swifty.js/sentry/vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/lark.js/" : "/",
  root: resolve(dirname(fileURLToPath(import.meta.url)), "src"),
  plugins: [
    larkMvcPlugin({ vdom: false, debug: true }),
    tailwindcss(),
    // Dev-only mock report endpoint: intercepts POST /api/log (the dsn used
    // in boot.ts) and writes reported events to logs/ instead of a server.
    sentryPlugin({ dsn: "/api/log" }),
  ],
  resolve: {
    alias: {
      "@": resolve(dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
  build: {
    outDir: resolve(dirname(fileURLToPath(import.meta.url)), "dist"),
    emptyOutDir: true,
  },
}));
