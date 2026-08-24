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
 * JSX automatic runtime for `@lark.js/mvc`.
 *
 * Configure TypeScript / your bundler with:
 *
 * ```jsonc
 * // tsconfig.json
 * { "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@lark.js/mvc" } }
 * ```
 *
 * `<div/>` then compiles to `jsx("div", {})` importing from
 * `@lark.js/mvc/jsx-runtime`. The produced `VNode` tree is PURE DATA — at
 * render time it is reconciled directly into the live DOM by the framework's
 * VNode reconciler (`@lark.js/mvc` main entry): keyed diff, per-node event
 * listeners, and hostless component instances for function tags.
 *
 * This entry is intentionally tiny and framework-free — safe to import from
 * any module without pulling the framework in.
 */

import { createVNode, Fragment, raw, type Component, type JSXNode, type VNode } from "./jsx/vnode";

export { Fragment, raw };
export type { Component, JSXNode, VNode };

/**
 * DOM event delivered to Lark event handlers. Handlers receive the native
 * event from a per-node listener — use `e.target` / `e.currentTarget`.
 */
export type LarkEvent = Event;

/**
 * Value for `onXxx` JSX event props: an inline handler function, wired to a
 * stable per-node listener whose current handler is swapped every render.
 * Closures capture loop variables directly.
 */
export type JsxEventValue = (e: LarkEvent) => unknown;

/**
 * Create a JSX element (automatic runtime entry, static children).
 *
 * `key` arrives as the third argument (NOT inside props) per the React 17+
 * automatic-runtime convention. It is used by the serializer as an `id`
 * fallback for keyed DOM diffing.
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

/** Attributes accepted on any intrinsic (tag-name) JSX element. */
export interface LarkAttributes {
  /** Permissive catch-all — any attribute is serialized (escaped). */
  [attr: string]: unknown;
  /** Stable element id. */
  id?: string | number;
  /** `key` — sibling compare key for the keyed diff (never written to the DOM). */
  key?: string | number;
  /** Element ref: callback (null on unmount) or a `{ current }` cell. */
  ref?: ((el: Element | null) => void) | { current: Element | null };
  /** Class value: string, array (falsy entries dropped), or truthy-key map. */
  class?: string | Array<string | false | null | undefined> | Record<string, unknown>;
  /** Alias of `class` (React muscle memory). */
  className?: string | Array<string | false | null | undefined> | Record<string, unknown>;
  /** Inline style: raw string or camelCase object (no implicit `px`). */
  style?: string | Record<string, string | number>;
  children?: JSXNode;
  // Common DOM events (any `on` + capitalized-type prop works, e.g. onPointerdown)
  onClick?: JsxEventValue;
  onDblclick?: JsxEventValue;
  onInput?: JsxEventValue;
  onChange?: JsxEventValue;
  onSubmit?: JsxEventValue;
  onKeydown?: JsxEventValue;
  onKeyup?: JsxEventValue;
  onFocus?: JsxEventValue;
  onBlur?: JsxEventValue;
  onMousedown?: JsxEventValue;
  onMouseup?: JsxEventValue;
  onMouseenter?: JsxEventValue;
  onMouseleave?: JsxEventValue;
  onScroll?: JsxEventValue;
  onTouchstart?: JsxEventValue;
  onTouchend?: JsxEventValue;
}

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
  interface IntrinsicElements {
    [tag: string]: LarkAttributes;
  }
}
