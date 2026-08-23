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
 * `@lark.js/mvc/jsx-runtime`. The produced `VNode` tree is PURE DATA — it is
 * serialized to an HTML string at render time by `jsxTemplate()` (exported
 * from the main `@lark.js/mvc` entry), and flows through the framework's
 * existing string-based DOM diff, event delegation, and `v-lark` child-view
 * mounting.
 *
 * This entry is intentionally tiny and framework-free — safe to import from
 * any module without pulling the framework in.
 */

import { createVNode, Fragment, raw, type Component, type JSXNode, type VNode } from "./jsx/vnode";

export { Fragment, raw };
export type { Component, JSXNode, VNode };

/**
 * Extended DOM event delivered to Lark event handlers.
 * Mirrors the shape attached by the event delegator (`src/event-delegator.ts`).
 */
export type LarkEvent = Event & {
  /** The original hit element (event delegation target). */
  eventTarget?: EventTarget | null;
  /** Params parsed from the event attribute (always strings). */
  params?: Record<string, string>;
};

/**
 * Accepted values for `onXxx` JSX event props:
 *
 * - `string` — the name of a handler declared in the view's `events` map
 *   (`"save"` → events key `"save<click>"`). On a `v-lark` element this
 *   becomes an `e-lark-*` child→parent event binding instead.
 * - `function` — an inline handler, auto-registered per render by
 *   `jsxTemplate()`. Closures capture loop variables directly — no
 *   `e.params` round-trip needed.
 */
export type JsxEventValue = string | ((e: LarkEvent) => unknown);

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
  /** Child-view props on `v-lark` elements: `prop:rows={rows}` → `p-lark-rows`. */
  [prop: `prop:${string}`]: unknown;
  /** Stable element id — doubles as the keyed-diff compare key. */
  id?: string | number;
  /** `key` — emitted as `id` when no explicit `id` is set (keyed diff). */
  key?: string | number;
  /** Class value: string, array (falsy entries dropped), or truthy-key map. */
  class?: string | Array<string | false | null | undefined> | Record<string, unknown>;
  /** Alias of `class` (React muscle memory). */
  className?: string | Array<string | false | null | undefined> | Record<string, unknown>;
  /** Inline style: raw string or camelCase object (no implicit `px`). */
  style?: string | Record<string, string | number>;
  /** Child-view mount point: extension-less view path (e.g. "components/panel"). */
  "v-lark"?: string;
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
