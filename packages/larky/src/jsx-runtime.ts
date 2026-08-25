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
 * JSX automatic runtime for `@lark.js/larky`.
 *
 * Configure TypeScript / your bundler with:
 *
 * ```jsonc
 * // tsconfig.json
 * { "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@lark.js/larky" } }
 * ```
 *
 * `<div/>` then compiles to `jsx("div", {})` importing from
 * `@lark.js/larky/jsx-runtime`. The produced `VNode` tree is PURE DATA — at
 * render time it is reconciled directly into the live DOM by the framework's
 * VNode reconciler (`@lark.js/larky` main entry): keyed diff, per-node event
 * listeners, and hostless component instances for function tags.
 *
 * This entry is intentionally tiny and framework-free — safe to import from
 * any module without pulling the framework in.
 */

import type { IntrinsicElements as IntrinsicElementsInternal } from "./jsx/dom-types";
import { createVNode, Fragment, raw, type Component, type JSXNode, type VNode } from "./jsx/vnode";

export { Fragment, raw };
export type { Component, JSXNode, VNode };

// Typed DOM attribute layer (strict tags, typed globals/events, Signalish
// values; the full per-tag strict attribute layer is the next milestone).
export type * from "./jsx/dom-types";

/**
 * Create a JSX element (automatic runtime entry, static children).
 *
 * `key` arrives as the third argument (NOT inside props) per the React 17+
 * automatic-runtime convention. It is the sibling compare key for the
 * reconciler's keyed diff (never written to the DOM).
 */
export function jsx(
  type: string | Component | symbol,
  props: Record<string, unknown> | null | undefined,
  key?: unknown,
): VNode {
  return createVNode(type, props, key);
}

/**
 * Create a JSX element with multiple static children — identical to `jsx`
 * for this runtime (children are serialized uniformly).
 */
export const jsxs = jsx;

// ============================================================
// JSX type namespace (resolved by TypeScript via jsxImportSource)
// ============================================================

// The `declare` modifier keeps the namespace fully type-only (erasable) so it
// compiles identically under both tsconfig.json (verbatimModuleSyntax: true)
// and tsconfig.build.json (verbatimModuleSyntax: false).
export declare namespace JSX {
  /** The type of a rendered JSX expression. */
  type Element = VNode;
  /** Valid element types: tag names, functional components, Fragment. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ElementType = string | Component<any> | symbol;
  interface ElementChildrenAttribute {
    // Marker interface consumed by TypeScript — the property TYPE is unused.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    children: {};
  }
  interface IntrinsicAttributes {
    key?: string | number;
  }
  /**
   * Per-tag intrinsic elements (HTML + SVG + MathML) — strict: unknown tags
   * are compile errors. Register custom elements via module augmentation
   * (declaration merging):
   *
   * ```ts
   * import type { HTMLAttributes } from "@lark.js/larky";
   *
   * declare module "@lark.js/larky/jsx-runtime" {
   *   namespace JSX {
   *     interface IntrinsicElements {
   *       "my-widget": HTMLAttributes<HTMLElement> & { variant?: string };
   *     }
   *   }
   * }
   * ```
   */
  interface IntrinsicElements extends IntrinsicElementsInternal {
    /** noop */
  }
}
