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
 * - `onXxx` string handler       → `@type="<viewId>\x1ename()"` attribute
 *                                  (`e-lark-type="name"` on `v-lark` elements)
 * - `onXxx` function handler     → generated `__jsxN` name, collected into
 *                                  `SerializeCtx.handlers` for the wiring layer
 * - `prop:name` child-view props → `p-lark-name` (escaped string or ref token)
 *
 * This module is pure: no framework state, everything flows through the
 * caller-provided `SerializeCtx`.
 */

import {
  encodeHTML,
  strSafe,
  refFn,
  SPLITTER,
  LARK_VIEW,
  LARK_PROP_PREFIX,
  LARK_EVENT_PREFIX,
} from "../common";
import { Fragment, isRawHTML, isVNode, type Component, type JSXNode, type VNode } from "./vnode";
import type { AnyFunc } from "../types";

/** Per-render serialization context (built fresh by `jsxTemplate` each render). */
export interface SerializeCtx {
  /** Owning view (frame) id — prefixes event attributes. */
  viewId: string;
  /** The view updater's refData store for `refFn` tokens. */
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

/** Handler-name references must be plain identifiers (delegator parses `name(`;
 *  `$`-prefixed names carry selector semantics in events-map keys). */
const HANDLER_NAME_REGEXP = /^\w+$/;

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

/** Null-safe primitive check for values embeddable as plain attribute text. */
function isPrimitive(value: unknown): value is string | number | boolean {
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean";
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
  // counter (the updater normally initializes it) — repair defensively.
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

function serializeElement(tag: string, vnode: VNode, ctx: SerializeCtx): string {
  const props = vnode.props;
  const isVLark = props[LARK_VIEW] != null;

  // id precedence: explicit `id` prop, else `key` (keyed-diff compare key)
  const rawId = props["id"];
  const idValue = rawId != null ? strSafe(rawId) : vnode.key;

  let attrs = "";
  let classValue = "";

  for (const name of Object.keys(props)) {
    const value = props[name];
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
      attrs += serializeEvent(name, value, isVLark, ctx, tag);
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

    // Child-view props: prop:name → p-lark-name
    if (name.startsWith("prop:")) {
      const propName = name.slice(5);
      const lower = propName.toLowerCase();
      if (lower !== propName) {
        devWarn(
          `Child-view prop "prop:${propName}" is delivered lowercase as "${lower}" ` +
            `(HTML attribute names are case-insensitive).`,
        );
      }
      if (value == null) continue;
      const attrValue = isPrimitive(value) ? strSafe(value) : refToken(ctx, value);
      attrs += ` ${LARK_PROP_PREFIX}${lower}="${encodeHTML(attrValue)}"`;
      continue;
    }

    // Regular attributes
    if (value === true) {
      attrs += ` ${name}=""`;
      continue;
    }
    if (value === false || value == null) continue;
    if (typeof value === "object" || typeof value === "function") {
      // Live-reference token — resolvable via updater.translate
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
 * Serialize an `onXxx` event prop into the matching attribute.
 *
 * | Value    | On a regular element                  | On a `v-lark` element        |
 * | -------- | ------------------------------------- | ---------------------------- |
 * | string   | `@type="<viewId>\x1ename()"`          | `e-lark-type="name"`         |
 * | function | `@type="<viewId>\x1e__jsxN()"` + collect | same as regular (DOM event) |
 *
 * Inline functions on `v-lark` elements intentionally stay DOM events —
 * `mountZone` captures `e-lark` parent handlers by name ONCE at child mount,
 * which would go stale against per-render generated names.
 */
function serializeEvent(
  name: string,
  value: unknown,
  isVLark: boolean,
  ctx: SerializeCtx,
  tag: string,
): string {
  // onClick → click (DOM event types are lowercase; HTML lowercases attributes)
  const eventType = name.slice(2).toLowerCase();

  if (typeof value === "string") {
    if (!HANDLER_NAME_REGEXP.test(value)) {
      devWarn(
        `Skipped event "${name}" on <${tag}> — handler reference "${value}" must be a ` +
          `plain handler name (declare params via an inline function instead).`,
      );
      return "";
    }
    if (isVLark) {
      // Child→parent custom event binding, consumed by mountZone
      return ` ${LARK_EVENT_PREFIX}${eventType}="${encodeHTML(value)}"`;
    }
    return ` @${eventType}="${encodeHTML(`${ctx.viewId}${SPLITTER}${value}()`)}"`;
  }

  if (typeof value === "function") {
    const fn = value as AnyFunc;
    let generated = ctx.fnNames.get(fn);
    if (!generated) {
      generated = `__jsx${++ctx.counter}`;
      ctx.fnNames.set(fn, generated);
    }
    ctx.handlers.set(`${generated}<${eventType}>`, fn);
    ctx.eventTypes.add(eventType);
    return ` @${eventType}="${encodeHTML(`${ctx.viewId}${SPLITTER}${generated}()`)}"`;
  }

  if (value != null) {
    devWarn(
      `Skipped event "${name}" on <${tag}> — expected a handler name string or an ` +
        `inline function, got ${typeof value}.`,
    );
  }
  return "";
}
