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
 * Ambient type declarations for Lark Mvc's DOM and module augmentations.
 *
 * Lark attaches metadata to DOM elements (frame references, compare-key
 * caches) and relies on the `import.meta.hot` HMR context. This file declares
 * those augmentations so application TypeScript code can access them without
 * `as any` casts.
 *
 * Also declares module types for `*.css` imports so bundlers resolve them
 * correctly. Templates are written in JSX/TSX (`jsxTemplate` +
 * `@lark.js/mvc/jsx-runtime`) — there is no separate template file format.
 */
import type { FrameApi, ViewSetup } from "./index";
declare global {
  /** Scheduler API (Chrome 94+) — used by `Framework.task` for time-slicing. */
  var scheduler: Scheduler;
  var __lark_hmr__: {
    hotSwapByView: (oldSetup: ViewSetup, newSetup: ViewSetup) => boolean;
  };

  interface ImportMeta {
    /** HMR context provided by Vite / webpack dev server. Undefined in production. */
    hot?: {
      accept(cb?: (mod: { default?: unknown } | undefined) => void): void;
      dispose(cb: (data: Record<string, unknown>) => void): void;
      invalidate(): void;
      data?: Record<string, unknown>;
    };
  }
  interface HTMLElement {
    /** Bound frame instance (set by `createFrame` when the element hosts a Frame) */
    frame?: FrameApi | undefined;
    /** Whether a frame is bound to this element (1 = bound, 0 = unbound) */
    frameBound?: number;
    /** Whether an auto-generated ID was assigned by `ensureElementId` */
    autoId?: number;
  }

  interface Element {
    /** DOM diff cache flag — 1 when `cachedCompareKey` is valid */
    compareKeyCached?: number | undefined;
    /** Cached compare key (from `id` or `v-lark` path) for keyed diff */
    cachedCompareKey?: string | undefined;
    /** `v-lark` attribute — declares a child view embedding point */
    "v-lark"?: string | undefined;
  }
}

// CSS module type declarations
declare module "*.css" {
  const content: string;
  export default content;
}
