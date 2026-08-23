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
 * JSX VNode → HTML string serializer.
 *
 * Runs at render time inside the `ViewTemplate` produced by `jsxTemplate()`.
 * The output string flows into the framework's rendering pipeline
 * (`domGetNode` → `domSetChildNodes` keyed diff), using the runtime's
 * attribute conventions:
 *
 * - text / attribute values      → `encodeHTML` (escaped)
 * - `raw()` children             → `strSafe`, unescaped (trusted HTML)
 * - object / function values     → `refFn` token (live reference in refData)
 * - `onXxx` inline function      → generated `__jsxN` name, collected into
 *                                  `SerializeCtx.handlers`, emitted as
 *                                  `@type="<viewId>\x1e__jsxN"`
 * - view component tags          → host `<div v-lark="__vN" p-lark="token">`
 *                                  (single refData token carrying ALL props;
 *                                  consumed by `mountZone`)
 *
 * Aside from the view-name auto-registration (`ensureViewName`), everything
 * flows through the caller-provided `SerializeCtx`.
 */

import { encodeHTML, strSafe, refFn, SPLITTER, LARK_VIEW, LARK_PROP } from "../common";
import { Signal } from "../reactive";
import { ensureViewName } from "../view-registry";
import {
  Fragment,
  isLarkView,
  isRawHTML,
  isVNode,
  type Component,
  type JSXNode,
  type LarkViewBrand,
  type VNode,
} from "./vnode";
import type { AnyFunc } from "../types";

/** Per-render serialization context (built fresh by `jsxTemplate` each render). */
export interface SerializeCtx {
  /** Owning view (frame) id — prefixes event attributes. */
  viewId: string;
  /** The view's refData store for `refFn` tokens. */
  refData: Record<string, unknown>;
  /** Collected inline handlers: `"__jsxN<type>"` → fn. */
  handlers: Map<string, AnyFunc>;
  /** Per-render dedupe of inline handlers by function identity. */
  fnNames: Map<AnyFunc, string>;
  /** Generated-name counter — MUST start at 0 each render (deterministic names). */
  counter: number;
  /** Event types referenced by inline handlers this render. */
  eventTypes: Set<string>;
  /** Ref tokens emitted this render — the survivors of the refData sweep. */
  usedTokens: Set<string>;
}

/** Create a fresh SerializeCtx for one render pass. */
export function createSerializeCtx(viewId: string, refData: Record<string, unknown>): SerializeCtx {
  return {
    viewId,
    refData,
    handlers: new Map(),
    fnNames: new Map(),
    counter: 0,
    eventTypes: new Set(),
    usedTokens: new Set(),
  };
}

/** Tokenize a live value via refFn, recording the token as used this render. */
function refToken(ctx: SerializeCtx, value: unknown): string {
  const token = refFn(ctx.refData, value, "");
  ctx.usedTokens.add(token);
  return token;
}

/** Unwrap a Signal to its current value (tracked read); pass anything else through. */
function unwrapSignal(value: unknown): unknown {
  return value instanceof Signal ? value.value : value;
}

/** HTML void elements — serialized without a closing tag. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Valid attribute-name pattern. HTML attribute names may not contain
 * whitespace, quotes, `>`, `/`, `=`; backslash is rejected defensively.
 * Guards against attribute injection from dynamic prop spreads.
 */
const ATTR_NAME_REGEXP = /^[^\s"'>/=\\]+$/;

/** Event props are camelCase `on` + Capitalized type (`onClick` → `click`). */
const EVENT_PROP_REGEXP = /^on[A-Z]/;

/** Native inline-handler names (`onclick`) — rejected to avoid an XSS channel. */
const NATIVE_EVENT_PROP_REGEXP = /^on[a-z]/;

/** camelCase → kebab-case for style object keys. */
const STYLE_KEY_REGEXP = /[A-Z]/g;

/** Deduped dev warnings (serializer runs every render — warn once per message). */
const warned = new Set<string>();

function devWarn(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  // eslint-disable-next-line no-console
  console.warn(`[lark-mvc/jsx] ${message}`);
}

/** Normalize a `class` / `className` value to a class string. */
function classToString(value: unknown): string {
  if (value == null || value === false) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => classToString(item))
      .filter((s) => s !== "")
      .join(" ");
  }
  if (typeof value === "object") {
    const names: string[] = [];
    for (const name of Object.keys(value)) {
      if ((value as Record<string, unknown>)[name]) names.push(name);
    }
    return names.join(" ");
  }
  return strSafe(value);
}

/** Normalize a `style` value to an inline style string. */
function styleToString(value: unknown): string {
  if (value == null || value === false) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const decls: string[] = [];
    for (const key of Object.keys(value)) {
      const v = (value as Record<string, unknown>)[key];
      if (v == null || v === "") continue;
      // CSS custom properties (--x) pass through; camelCase → kebab-case
      const cssKey = key.startsWith("--")
        ? key
        : key.replace(STYLE_KEY_REGEXP, (m) => "-" + m.toLowerCase());
      decls.push(`${cssKey}:${strSafe(v)}`);
    }
    return decls.join(";");
  }
  return strSafe(value);
}

/**
 * Serialize a JSX node tree to an HTML string.
 *
 * @param node - Any renderable JSX content
 * @param ctx - The per-render serialization context
 */
export function serialize(node: JSXNode, ctx: SerializeCtx): string {
  // Bare template calls may hand in a refData object without the refFn
  // counter (createCtx normally initializes it) — repair defensively.
  if (typeof ctx.refData[SPLITTER] !== "number") {
    ctx.refData[SPLITTER] = 1;
  }
  return serializeNode(node, ctx);
}

function serializeNode(node: JSXNode, ctx: SerializeCtx): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") {
    return encodeHTML(node);
  }
  if (Array.isArray(node)) {
    let out = "";
    for (const child of node) {
      out += serializeNode(child, ctx);
    }
    return out;
  }
  if (isRawHTML(node)) {
    return strSafe(node.html);
  }
  // Signal child ({count} without .value) — unwrap and recurse. The tracked
  // read happens inside the render effect, subscribing the view.
  if (node instanceof Signal) {
    return serializeNode(node.value as JSXNode, ctx);
  }
  if (isVNode(node)) {
    return serializeVNode(node, ctx);
  }
  // Unknown object (not VNode/RawHTML) — most likely a mistake; render nothing.
  devWarn(`Skipped non-renderable child of type "${typeof node}".`);
  return "";
}

function serializeVNode(vnode: VNode, ctx: SerializeCtx): string {
  const { type, props } = vnode;

  // Fragment — serialize children directly (multi-root supported by the diff)
  if (type === Fragment) {
    return serializeNode(props["children"] as JSXNode, ctx);
  }

  // View component (defineView result) — mounted through the Frame tree,
  // never invoked: serialize a host element for mountZone to pick up.
  if (isLarkView(type)) {
    return serializeViewTag(type, vnode, ctx);
  }

  // Functional component — invoked lazily; forward key to a keyless single root
  if (typeof type === "function") {
    let result = (type as Component)(props);
    if (vnode.key !== undefined && isVNode(result) && result.key === undefined) {
      result = { ...result, key: vnode.key };
    }
    return serializeNode(result, ctx);
  }

  if (typeof type === "string") {
    return serializeElement(type, vnode, ctx);
  }

  // A symbol tag that is not Fragment — nothing sensible to render.
  devWarn("Skipped VNode with an unsupported symbol tag.");
  return "";
}

/**
 * Serialize a view component tag (`<MyView .../>`) into its mount-zone host:
 *
 * ```html
 * <div [id] [class] [style] v-lark="__vN[_name]" p-lark="\x1eK"></div>
 * ```
 *
 * - `id` / `key` / `class` / `className` / `style` go to the host element
 *   (`key` becomes the id via the shared `serializeElement` fallback).
 * - Every other prop is packed into ONE props object stored as a refData
 *   token (`p-lark`); `mountZone` translates it — prop names never pass
 *   through HTML, so camelCase survives exactly. Omitted when empty.
 * - `children` are not supported on view tags.
 */
function serializeViewTag(view: LarkViewBrand, vnode: VNode, ctx: SerializeCtx): string {
  const props = vnode.props;
  const host: Record<string, unknown> = { [LARK_VIEW]: ensureViewName(view) };
  const child: Record<string, unknown> = {};

  for (const name of Object.keys(props)) {
    const value = props[name];
    if (name === "children") {
      if (value != null && !(Array.isArray(value) && value.length === 0)) {
        devWarn("Ignored children on a view component tag — views render their own template.");
      }
      continue;
    }
    if (name === "id" || name === "class" || name === "className" || name === "style") {
      host[name] = value;
      continue;
    }
    child[name] = value;
  }

  if (Object.keys(child).length > 0) {
    host[LARK_PROP] = refToken(ctx, child);
  }

  return serializeElement("div", { ...vnode, type: "div", props: host }, ctx);
}

function serializeElement(tag: string, vnode: VNode, ctx: SerializeCtx): string {
  const props = vnode.props;

  // id precedence: explicit `id` prop, else `key` (keyed-diff compare key)
  const rawId = unwrapSignal(props["id"]);
  const idValue = rawId != null ? strSafe(rawId) : vnode.key;

  let attrs = "";
  let classValue = "";

  for (const name of Object.keys(props)) {
    // Signal attribute values unwrap here (tracked read); component props
    // are packed by serializeViewTag and deliberately stay wrapped.
    const value = unwrapSignal(props[name]);
    if (name === "children" || name === "key" || name === "id") continue;

    if (!ATTR_NAME_REGEXP.test(name)) {
      devWarn(`Skipped invalid attribute name "${name}" on <${tag}>.`);
      continue;
    }

    // class / className — merged, emitted once after the loop
    if (name === "class" || name === "className") {
      const cls = classToString(value);
      if (cls) classValue = classValue ? `${classValue} ${cls}` : cls;
      continue;
    }

    if (name === "style") {
      const style = styleToString(value);
      if (style) attrs += ` style="${encodeHTML(style)}"`;
      continue;
    }

    // Events: on + Capitalized type (onClick → click)
    if (EVENT_PROP_REGEXP.test(name)) {
      attrs += serializeEvent(name, value, ctx, tag);
      continue;
    }

    // Native inline handlers (onclick="...") would execute attribute text as
    // JavaScript — refuse handler-shaped values. Non-handler values (e.g.
    // `once={true}`) fall through as regular attributes.
    if (
      NATIVE_EVENT_PROP_REGEXP.test(name) &&
      (typeof value === "string" || typeof value === "function")
    ) {
      devWarn(
        `Skipped "${name}" on <${tag}> — use camelCase (e.g. "onClick") for Lark events; ` +
          `native inline handlers are not allowed.`,
      );
      continue;
    }

    // Regular attributes
    if (value === true) {
      attrs += ` ${name}=""`;
      continue;
    }
    if (value === false || value == null) continue;
    if (typeof value === "object" || typeof value === "function") {
      // Live-reference token — resolvable via ctx.translate
      attrs += ` ${name}="${encodeHTML(refToken(ctx, value))}"`;
      continue;
    }
    attrs += ` ${name}="${encodeHTML(strSafe(value))}"`;
  }

  let head = `<${tag}`;
  if (idValue != null && idValue !== "") {
    head += ` id="${encodeHTML(idValue)}"`;
  }
  if (classValue) {
    head += ` class="${encodeHTML(classValue)}"`;
  }
  head += attrs;

  if (VOID_TAGS.has(tag.toLowerCase())) {
    const children = props["children"];
    if (children != null && !(Array.isArray(children) && children.length === 0)) {
      devWarn(`Ignored children of void element <${tag}>.`);
    }
    return head + ">";
  }

  return `${head}>${serializeNode(props["children"] as JSXNode, ctx)}</${tag}>`;
}

/**
 * Serialize an `onXxx` event prop into a delegated `@type` attribute.
 *
 * Only inline functions are supported. The handler is deduped by identity,
 * assigned a generated per-render name (`__jsxN`), collected into
 * `SerializeCtx.handlers` (plain-name key) and emitted as
 * `@type="<viewId>\x1e__jsxN"` for the capture-phase delegator.
 */
function serializeEvent(name: string, value: unknown, ctx: SerializeCtx, tag: string): string {
  // onClick → click (DOM event types are lowercase; HTML lowercases attributes)
  const eventType = name.slice(2).toLowerCase();

  if (typeof value === "function") {
    const fn = value as AnyFunc;
    let generated = ctx.fnNames.get(fn);
    if (!generated) {
      generated = `__jsx${++ctx.counter}`;
      ctx.fnNames.set(fn, generated);
    }
    ctx.handlers.set(generated, fn);
    ctx.eventTypes.add(eventType);
    return ` @${eventType}="${encodeHTML(`${ctx.viewId}${SPLITTER}${generated}`)}"`;
  }

  if (value != null) {
    devWarn(
      `Skipped event "${name}" on <${tag}> — events accept inline functions only ` +
        `(onClick={() => ...}), got ${typeof value}.`,
    );
  }
  return "";
}
