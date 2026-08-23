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

import { describe, it, expect, vi } from "vitest";
import { jsx, jsxs, Fragment, raw } from "../src/jsx-runtime";
import { jsxDEV } from "../src/jsx-dev-runtime";
import { serialize, createSerializeCtx, type SerializeCtx } from "../src/jsx/serialize";
import { isVNode, createVNode, type JSXNode } from "../src/jsx/vnode";
import { SPLITTER } from "../src/common";

/** Build a fresh render context for one serialization pass. */
function ctx(viewId = "v1"): SerializeCtx {
  const refData: Record<string, unknown> = {};
  refData[SPLITTER] = 1;
  return createSerializeCtx(viewId, refData);
}

function render(node: JSXNode, c: SerializeCtx = ctx()): string {
  return serialize(node, c);
}

describe("jsx runtime factories", () => {
  it("jsx/jsxs/jsxDEV produce equivalent VNodes with key as third argument", () => {
    const a = jsx("div", { class: "x" }, "k1");
    const b = jsxs("div", { class: "x" }, "k1");
    const c2 = jsxDEV("div", { class: "x" }, "k1", false, undefined, undefined);
    for (const n of [a, b, c2]) {
      expect(isVNode(n)).toBe(true);
      expect(n.type).toBe("div");
      expect(n.props).toEqual({ class: "x" });
      expect(n.key).toBe("k1");
    }
  });

  it("null props normalize to an empty object; numeric keys stringify", () => {
    const n = jsx("div", null, 5);
    expect(n.props).toEqual({});
    expect(n.key).toBe("5");
  });

  it("recognizes VNodes via Symbol.for across object copies", () => {
    const clone = JSON.parse(JSON.stringify({ type: "div", props: {} }));
    clone.$$ = Symbol.for("lark.mvc.vnode");
    expect(isVNode(clone)).toBe(true);
  });
});

describe("serialize: children", () => {
  it("escapes text children and renders numbers including 0", () => {
    expect(render(jsx("div", { children: "<b>&\"'x" }))).toBe(
      `<div>&lt;b&gt;&amp;&#34;&#39;x</div>`,
    );
    expect(render(jsx("div", { children: 0 }))).toBe("<div>0</div>");
  });

  it("drops boolean/null/undefined children (conditional rendering)", () => {
    expect(render(jsx("div", { children: [true, false, null, undefined, "ok"] }))).toBe(
      "<div>ok</div>",
    );
  });

  it("flattens nested arrays and fragments; supports multi-root output", () => {
    const frag = jsx(Fragment, {
      children: [jsx("i", { children: "a" }), [jsx("i", { children: "b" })]],
    });
    expect(render(frag)).toBe("<i>a</i><i>b</i>");
  });

  it("raw() passes through unescaped next to escaped siblings", () => {
    const node = jsx("div", { children: [raw("<b>hi</b>"), "<b>"] });
    expect(render(node)).toBe("<div><b>hi</b>&lt;b&gt;</div>");
    expect(raw(null).html).toBe("");
  });

  it("void tags self-terminate and ignore children", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(render(jsx("br", {}))).toBe("<br>");
    expect(render(jsx("input", { type: "text", disabled: true }))).toBe(
      `<input type="text" disabled="">`,
    );
    expect(render(jsx("img", { src: "a.png", children: "x" }))).toBe(`<img src="a.png">`);
    spy.mockRestore();
  });
});

describe("serialize: attributes", () => {
  it("class supports string, array, and object forms; className merges into class", () => {
    expect(render(jsx("div", { class: "a b" }))).toBe(`<div class="a b"></div>`);
    expect(render(jsx("div", { class: ["a", false, null, "b"] }))).toBe(`<div class="a b"></div>`);
    expect(render(jsx("div", { class: { on: true, off: false } }))).toBe(`<div class="on"></div>`);
    expect(render(jsx("div", { class: "a", className: "b" }))).toBe(`<div class="a b"></div>`);
  });

  it("style object converts camelCase to kebab-case and keeps custom properties", () => {
    expect(
      render(jsx("div", { style: { backgroundColor: "red", "--gap": "4px", zIndex: 2 } })),
    ).toBe(`<div style="background-color:red;--gap:4px;z-index:2"></div>`);
    expect(render(jsx("div", { style: "color: blue" }))).toBe(`<div style="color: blue"></div>`);
  });

  it("boolean attributes: true renders empty-valued, false/nullish omitted", () => {
    expect(render(jsx("button", { disabled: true, hidden: false, title: undefined }))).toBe(
      `<button disabled=""></button>`,
    );
  });

  it("key emits as id only when id is absent", () => {
    expect(render(jsx("li", {}, "item-1"))).toBe(`<li id="item-1"></li>`);
    expect(render(jsx("li", { id: "explicit" }, "item-1"))).toBe(`<li id="explicit"></li>`);
  });

  it("object attribute values become refData tokens with identity dedupe", () => {
    const c = ctx();
    const obj = { a: 1 };
    const html = serialize([jsx("div", { "data-x": obj }), jsx("div", { "data-y": obj })], c);
    const token = `${SPLITTER}1`;
    expect(html).toBe(`<div data-x="${token}"></div><div data-y="${token}"></div>`);
    expect(c.refData[token]).toBe(obj);
    expect(c.refData[SPLITTER]).toBe(2);
  });

  it("skips invalid attribute names", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(render(jsx("div", { 'bad"name': "x", ok: "1" }))).toBe(`<div ok="1"></div>`);
    spy.mockRestore();
  });
});

describe("serialize: child-view props (prop:)", () => {
  it("primitive prop: values render escaped as p-lark-*", () => {
    expect(render(jsx("div", { "v-lark": "components/panel", "prop:title": "a<b" }))).toBe(
      `<div v-lark="components/panel" p-lark-title="a&lt;b"></div>`,
    );
  });

  it("object prop: values render as refData tokens", () => {
    const c = ctx();
    const rows = [1, 2];
    const html = serialize(jsx("div", { "v-lark": "x/y", "prop:rows": rows }), c);
    expect(html).toBe(`<div v-lark="x/y" p-lark-rows="${SPLITTER}1"></div>`);
    expect(c.refData[`${SPLITTER}1`]).toBe(rows);
  });

  it("uppercase prop: names are lowered (with dev warning)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(render(jsx("div", { "v-lark": "x/y", "prop:userName": "n" }))).toBe(
      `<div v-lark="x/y" p-lark-username="n"></div>`,
    );
    spy.mockRestore();
  });
});

describe("serialize: events", () => {
  it("string handler renders a delegated @type attribute with viewId prefix", () => {
    expect(render(jsx("button", { onClick: "save" }), ctx("view9"))).toBe(
      `<button @click="view9${SPLITTER}save()"></button>`,
    );
  });

  it("camelCase event names lowercase fully (onDblclick → dblclick)", () => {
    expect(render(jsx("button", { onDblclick: "go" }), ctx("v"))).toBe(
      `<button @dblclick="v${SPLITTER}go()"></button>`,
    );
  });

  it("string handler on a v-lark element becomes an e-lark binding", () => {
    expect(render(jsx("div", { "v-lark": "x/y", onSelect: "onSelect" }))).toBe(
      `<div v-lark="x/y" e-lark-select="onSelect"></div>`,
    );
  });

  it("inline function handlers get generated names and are collected", () => {
    const c = ctx("v1");
    const fn = vi.fn();
    const html = serialize(jsx("button", { onClick: fn }), c);
    expect(html).toBe(`<button @click="v1${SPLITTER}__jsx1()"></button>`);
    expect(c.handlers.get("__jsx1<click>")).toBe(fn);
    expect(c.eventTypes.has("click")).toBe(true);
  });

  it("same function reference reuses one generated name", () => {
    const c = ctx("v1");
    const fn = vi.fn();
    const html = serialize([jsx("a", { onClick: fn }), jsx("b", { onMousedown: fn })], c);
    expect(html).toContain(`@click="v1${SPLITTER}__jsx1()"`);
    expect(html).toContain(`@mousedown="v1${SPLITTER}__jsx1()"`);
    expect(c.handlers.size).toBe(2); // one per event type key
    expect(c.counter).toBe(1);
  });

  it("generated names are deterministic across renders (counter resets per ctx)", () => {
    const tree = () => [jsx("a", { onClick: () => 1 }), jsx("b", { onClick: () => 2 })];
    const h1 = serialize(tree(), ctx());
    const h2 = serialize(tree(), ctx());
    expect(h1).toBe(h2);
    expect(h1).toContain("__jsx1()");
    expect(h1).toContain("__jsx2()");
  });

  it("inline functions on v-lark elements stay DOM events (never e-lark)", () => {
    const c = ctx("p1");
    const html = serialize(jsx("div", { "v-lark": "x/y", onClick: vi.fn() }), c);
    expect(html).toBe(`<div v-lark="x/y" @click="p1${SPLITTER}__jsx1()"></div>`);
  });

  it("rejects lowercase native inline handlers and invalid handler references", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(render(jsx("div", { onclick: "alert(1)" }))).toBe(`<div></div>`);
    expect(render(jsx("div", { onClick: "not a name" }))).toBe(`<div></div>`);
    expect(render(jsx("div", { onClick: 42 }))).toBe(`<div></div>`);
    spy.mockRestore();
  });
});

describe("serialize: functional components", () => {
  it("invokes components lazily with props (children included)", () => {
    const Item = (props: { label: string; children?: JSXNode }) =>
      jsx("li", { children: [props.label, ": ", props.children] });
    const node = jsx(Item as (p: Record<string, unknown>) => JSXNode, {
      label: "L",
      children: "c",
    });
    expect(render(node)).toBe("<li>L: c</li>");
  });

  it("forwards key to a keyless single-root result", () => {
    const Row = () => jsx("tr", {});
    expect(render(jsx(Row, {}, "r1"))).toBe(`<tr id="r1"></tr>`);
    const Keyed = () => jsx("tr", { id: "own" });
    expect(render(jsx(Keyed, {}, "r1"))).toBe(`<tr id="own"></tr>`);
  });

  it("components may return primitives, arrays, or nothing", () => {
    expect(render(jsx(() => "text & more", {}))).toBe("text &amp; more");
    expect(render(jsx(() => [createVNode("i", {}), "x"], {}))).toBe("<i></i>x");
    expect(render(jsx(() => null, {}))).toBe("");
  });
});

describe("serialize: robustness", () => {
  it("repairs a refData object missing the counter", () => {
    const c: SerializeCtx = createSerializeCtx("v1", {});
    const obj = {};
    serialize(jsx("div", { "data-x": obj }), c);
    expect(c.refData[SPLITTER]).toBe(2);
    expect(c.refData[`${SPLITTER}1`]).toBe(obj);
  });

  it("skips unknown non-renderable children with a warning", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(render(jsx("div", { children: { not: "a vnode" } as unknown as JSXNode }))).toBe(
      "<div></div>",
    );
    spy.mockRestore();
  });
});
