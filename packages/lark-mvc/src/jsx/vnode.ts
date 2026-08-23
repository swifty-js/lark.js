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
 * JSX VNode model — the pure data layer of Lark's JSX support.
 *
 * This module has ZERO framework imports so it can be bundled into the
 * `jsx-runtime` / `jsx-dev-runtime` entries without dragging the framework in.
 *
 * tsup bundles this module into more than one dist entry (the runtime
 * entries may share a chunk, while `index` carries its own copy), so module
 * instances are NOT shared across entries. All brand markers therefore use
 * `Symbol.for` (the global symbol registry) so that VNodes created by one
 * bundle instance are recognized by another — plain module-level symbols or
 * `instanceof` checks would fail across copies.
 */

// NOTE: marker types are `symbol`, NOT `unique symbol` — tsup emits an
// independent .d.ts per package entry, and two `unique symbol` declarations
// (dist/index.d.ts vs dist/jsx-runtime.d.ts) would be nominally unrelated
// types, breaking cross-entry assignability of VNode/RawHTML. Runtime
// identity comes from the global Symbol.for registry either way.

/** Brand marker for VNode objects (global symbol registry — cross-bundle safe). */
export const VNODE_MARK: symbol = Symbol.for("lark.mvc.vnode");

/** Brand marker for raw-HTML wrappers (global symbol registry — cross-bundle safe). */
export const RAW_MARK: symbol = Symbol.for("lark.mvc.raw");

/** Brand marker for `defineView` results used as JSX component tags. */
export const VIEW_MARK: symbol = Symbol.for("lark.mvc.view");

/**
 * Structural shape of a branded view component (see `LarkView<P>` in the
 * framework's types for the full generic form). Kept minimal here so this
 * module stays free of framework imports.
 */
export interface LarkViewBrand {
  (...args: unknown[]): unknown;
  $$: symbol;
  setup: unknown;
}

/**
 * Check whether a value is a `defineView` result (a mountable view component).
 * Cross-bundle safe via `Symbol.for`.
 */
export function isLarkView(value: unknown): value is LarkViewBrand {
  return typeof value === "function" && (value as { $$?: unknown }).$$ === VIEW_MARK;
}

/**
 * Fragment component — groups children without a wrapper element.
 *
 * `<>...</>` compiles to `jsx(Fragment, { children })`. The serializer emits
 * the children directly; multi-root view templates are supported by the DOM
 * diff, so a Fragment is valid at the template root.
 */
export const Fragment: symbol = Symbol.for("lark.mvc.fragment");

/**
 * A functional JSX component: receives the props object (children included
 * under `props.children`) and returns renderable JSX content.
 *
 * Components are invoked lazily by the serializer during render — they are
 * pure template partials, NOT stateful views. Stateful views are created
 * with `defineView` and used directly as JSX tags (`<MyView prop={x}/>`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Component<P = any> = (props: P) => JSXNode;

/** A JSX element produced by `jsx()` / `jsxs()` / `jsxDEV()`. */
export interface VNode {
  /** Brand marker — `Symbol.for("lark.mvc.vnode")`. */
  $$: symbol;
  /** Tag name, functional component, or `Fragment`. */
  type: string | Component | symbol;
  /** Props object including `children`. */
  props: Record<string, unknown>;
  /** Normalized `key` (from the jsx() third argument), used as `id` fallback. */
  key: string | undefined;
}

/** Wrapper marking a string as trusted raw HTML (created via `raw()`). */
export interface RawHTML {
  /** Brand marker — `Symbol.for("lark.mvc.raw")`. */
  $$: symbol;
  /** The raw HTML string (rendered without escaping). */
  html: string;
}

/**
 * Structural shape of a readable signal (`@preact/signals-core` `Signal` /
 * `ReadonlySignal`). Signals used as children or attribute values are
 * auto-unwrapped by the serializer — the `.value` read happens inside the
 * view's render effect and subscribes the view.
 */
export interface SignalNode {
  readonly value: JSXNode;
  peek(): JSXNode;
}

/**
 * Anything renderable as JSX content: elements, raw HTML, text-ish primitives
 * (`string` / `number`), readable signals (auto-unwrapped), skipped values
 * (`boolean` / `null` / `undefined` — enables `{cond && <div/>}`), or arrays
 * thereof.
 */
export type JSXNode =
  | VNode
  | RawHTML
  | SignalNode
  | string
  | number
  | boolean
  | null
  | undefined
  | JSXNode[];

/**
 * Create a VNode. Shared by `jsx` / `jsxs` / `jsxDEV`.
 *
 * @param type - Tag name, functional component, or `Fragment`
 * @param props - Props object (children under `props.children`), may be null
 * @param key - The JSX `key` (passed as the automatic-runtime third argument)
 */
export function createVNode(
  type: string | Component | symbol,
  props: Record<string, unknown> | null | undefined,
  key?: unknown,
): VNode {
  return {
    $$: VNODE_MARK,
    type,
    props: props || {},
    key: key == null ? undefined : String(key),
  };
}

/**
 * Mark a string as trusted raw HTML. The content is rendered WITHOUT
 * escaping; never pass untrusted input.
 *
 * @example
 * <div>{raw(renderedMarkdown)}</div>
 */
export function raw(html: unknown): RawHTML {
  return { $$: RAW_MARK, html: html == null ? "" : String(html) };
}

/** Check whether a value is a VNode (cross-bundle safe via `Symbol.for`). */
export function isVNode(value: unknown): value is VNode {
  return (
    typeof value === "object" && value !== null && (value as { $$?: unknown }).$$ === VNODE_MARK
  );
}

/** Check whether a value is a `raw()` HTML wrapper. */
export function isRawHTML(value: unknown): value is RawHTML {
  return typeof value === "object" && value !== null && (value as { $$?: unknown }).$$ === RAW_MARK;
}
