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
 * Ambient type declarations for Lark Mvc's global and module augmentations.
 *
 * Declares the `globalThis.__lark_hmr__` handle used by auto-injected HMR
 * snippets, the `import.meta.hot` HMR context, and module types for `*.css`
 * imports so bundlers resolve them correctly.
 */
declare global {
  var __lark_hmr__: {
    hotSwapByComponent: (oldFn: unknown, newFn: unknown) => boolean;
  };

  interface ImportMeta {
    /** HMR context provided by Vite / webpack dev server. Undefined in production. */
    hot?: {
      accept(cb?: (mod: { default?: unknown } | undefined) => void): void;
      dispose(cb: (data: Record<string, unknown>) => void): void;
      data?: Record<string, unknown>;
    };
  }
}

// CSS module type declarations
declare module "*.css" {
  const content: string;
  export default content;
}

export {};
