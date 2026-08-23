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
 * Integration tests for JSX views: mounting, inline-event delegation,
 * re-render, keyed diff, imported component tags (child views), and
 * bind/unbind balance on unmount.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineView } from "../src/view";
import { Frame, createFrame, registerViewClass, invalidateViewClass } from "../src/frame";
import { getViewClassRegistry } from "../src/view-registry";
import { EventDelegator } from "../src/event-delegator";
import { jsxTemplate } from "../src/jsx/template";
import { SPLITTER } from "../src/common";
import type { FrameObj } from "../src/types";

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function makeFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

function cleanupFrames(): void {
  for (const [id, frame] of Frame.getAll()) {
    frame.unmountView();
    const el = document.getElementById(id);
    if (el) el.remove();
    Frame.getAll().delete(id);
  }
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("JSX views (integration)", () => {
  beforeEach(() => {
    // Other suites may install a dummy frame getter — restore the real one.
    EventDelegator.setFrameGetter((id) => Frame.get(id));
    const reg = getViewClassRegistry();
    for (const key of Object.keys(reg)) invalidateViewClass(key);
  });

  afterEach(() => cleanupFrames());

  it("mounts a JSX view and renders escaped data", async () => {
    type Data = { title: string };
    registerViewClass(
      "jsx/basic",
      defineView((ctx) => {
        ctx.updater.digest({ title: "a<b & c" });
        return {
          template: jsxTemplate<Data>(({ title }) => (
            <div class="wrap">
              <h1 data-role="title">{title}</h1>
            </div>
          )),
        };
      }),
    );

    const frame = makeFrame("jsx-basic");
    frame.mountView("jsx/basic");
    await flush();

    const h1 = document.querySelector("#jsx-basic [data-role='title']")!;
    expect(h1.textContent).toBe("a<b & c");
    expect(document.querySelector("#jsx-basic .wrap")).toBeTruthy();
  });

  it("dispatches clicks to inline handlers under generated plain keys", async () => {
    const first = vi.fn();
    const second = vi.fn();

    registerViewClass(
      "jsx/events",
      defineView((ctx) => {
        ctx.updater.digest({});
        return {
          template: jsxTemplate(() => (
            <div>
              <button data-role="first" onClick={first}>
                first
              </button>
              <button data-role="second" onClick={second}>
                second
              </button>
            </div>
          )),
        };
      }),
    );

    const frame = makeFrame("jsx-events");
    frame.mountView("jsx/events");
    await flush();

    click(document.querySelector("#jsx-events [data-role='first']")!);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    click(document.querySelector("#jsx-events [data-role='second']")!);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);

    // Inline handlers are stored under generated plain names
    const keys = Object.keys(frame.view!.getEvents()!);
    expect(keys).toEqual(["__jsx1", "__jsx2"]);
  });

  it("re-renders on digest and swaps inline closures to the new generation", async () => {
    const seen: number[] = [];

    registerViewClass(
      "jsx/rerender",
      defineView((ctx) => {
        ctx.updater.digest({ count: 1 });
        return {
          template: jsxTemplate<{ count: number }>(({ count }) => (
            <div>
              <p data-role="count">{count}</p>
              <button data-role="btn" onClick={() => seen.push(count)}>
                push
              </button>
            </div>
          )),
        };
      }),
    );

    const frame = makeFrame("jsx-rerender");
    frame.mountView("jsx/rerender");
    await flush();

    click(document.querySelector("#jsx-rerender [data-role='btn']")!);
    expect(seen).toEqual([1]);

    frame.view!.updater.set({ count: 42 }).digest();
    await flush();

    expect(document.querySelector("#jsx-rerender [data-role='count']")!.textContent).toBe("42");
    click(document.querySelector("#jsx-rerender [data-role='btn']")!);
    expect(seen).toEqual([1, 42]); // new closure captured the new value
  });

  it("filters modifier keys inside the handler (e.ctrlKey)", async () => {
    const ctrlOnly = vi.fn();

    registerViewClass(
      "jsx/modifier",
      defineView((ctx) => {
        ctx.updater.digest({});
        return {
          template: jsxTemplate(() => (
            <button
              data-role="c"
              onClick={(e) => {
                if (!(e as MouseEvent).ctrlKey) return;
                ctrlOnly();
              }}
            >
              c
            </button>
          )),
        };
      }),
    );

    const frame = makeFrame("jsx-modifier");
    frame.mountView("jsx/modifier");
    await flush();

    const c = document.querySelector("#jsx-modifier [data-role='c']")!;
    c.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ctrlOnly).not.toHaveBeenCalled();
    c.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(ctrlOnly).toHaveBeenCalledTimes(1);
  });

  it("reuses keyed DOM nodes across list reorders", async () => {
    type Data = { items: string[] };
    registerViewClass(
      "jsx/list",
      defineView((ctx) => {
        ctx.updater.digest({ items: ["a", "b", "c"] });
        return {
          template: jsxTemplate<Data>(({ items }) => (
            <ul>
              {items.map((item) => (
                <li key={`item-${item}`}>{item}</li>
              ))}
            </ul>
          )),
        };
      }),
    );

    const frame = makeFrame("jsx-list");
    frame.mountView("jsx/list");
    await flush();

    const nodeB = document.getElementById("item-b") as HTMLElement & { __marker?: number };
    nodeB.__marker = 7;

    frame.view!.updater.set({ items: ["c", "b", "a"] }).digest();
    await flush();

    const items = Array.from(document.querySelectorAll("#jsx-list li")).map((li) => li.textContent);
    expect(items).toEqual(["c", "b", "a"]);
    const nodeBAfter = document.getElementById("item-b") as HTMLElement & { __marker?: number };
    expect(nodeBAfter.__marker).toBe(7); // same node instance, moved not rebuilt
  });

  it("mounts component tags with typed props and wires child events", async () => {
    const onNotify = vi.fn();
    const onCleared = vi.fn();
    let receivedRows: unknown;

    interface ChildProps {
      rows: object;
      label: string;
      onNotify: (d?: Record<string, unknown>) => void;
      onHistoryCleared: () => void;
    }

    const Child = defineView<ChildProps>((ctx, params) => {
      receivedRows = params?.rows;
      ctx.updater.digest({ label: String(params?.label ?? "") });
      return {
        template: jsxTemplate<{ label: string }>(({ label }) => (
          <span data-role="child-label">{label}</span>
        )),
      };
    });

    const rows = [{ id: 1 }, { id: 2 }];
    registerViewClass(
      "jsx/parent",
      defineView((ctx) => {
        ctx.updater.digest({ rows, label: "first" });
        return {
          template: jsxTemplate<{ rows: object; label: string }>((d) => (
            <section>
              <Child
                id="jsx-child-host"
                rows={d.rows}
                label={d.label}
                onNotify={onNotify}
                onHistoryCleared={onCleared}
              />
            </section>
          )),
        };
      }),
    );

    const frame = makeFrame("jsx-parent");
    frame.mountView("jsx/parent");
    await flush();

    // Object prop delivered by reference; camelCase keys exact
    expect(receivedRows).toBe(rows);
    expect(document.querySelector("[data-role='child-label']")!.textContent).toBe("first");

    // Parent re-render pushes updated props into the child (full render)
    frame.view!.updater.set({ label: "second" }).digest();
    await flush();
    const child = Frame.get("jsx-child-host");
    expect(child?.view?.updater.get<string>("label")).toBe("second");
    expect(document.querySelector("[data-role='child-label']")!.textContent).toBe("second");

    // Child custom event reaches the parent's inline handler (trampoline)
    child?.view?.owner.fire("notify", { x: 1 });
    await flush();
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify.mock.calls[0][0]).toMatchObject({ x: 1 });

    // camelCase event names match exactly — no HTML round-trip
    child?.view?.owner.fire("historyCleared");
    await flush();
    expect(onCleared).toHaveBeenCalledTimes(1);
    child?.view?.owner.fire("historycleared");
    await flush();
    expect(onCleared).toHaveBeenCalledTimes(1);
  });

  it("preserves child frames and state across keyed component-list reorders", async () => {
    const Item = defineView<{ tag: string }>((ctx, params) => {
      ctx.updater.digest({ tag: String(params?.tag ?? "") });
      return {
        template: jsxTemplate<{ tag: string }>(({ tag }) => <b data-tag={tag}>{tag}</b>),
      };
    });

    registerViewClass(
      "jsx/klist",
      defineView((ctx) => {
        ctx.updater.digest({ order: ["a", "b", "c"] });
        return {
          template: jsxTemplate<{ order: string[] }>(({ order }) => (
            <div>
              {order.map((t) => (
                <Item key={`it-${t}`} tag={t} />
              ))}
            </div>
          )),
        };
      }),
    );

    const frame = makeFrame("jsx-klist");
    frame.mountView("jsx/klist");
    await flush();

    // Stamp private state on the middle child
    const childB = Frame.get("it-b");
    expect(childB?.view).toBeTruthy();
    childB!.view!.updater.set({ stamp: 7 });

    frame.view!.updater.set({ order: ["c", "b", "a"] }).digest();
    await flush();

    const tags = Array.from(document.querySelectorAll("#jsx-klist [data-tag]")).map((el) =>
      el.getAttribute("data-tag"),
    );
    expect(tags).toEqual(["c", "b", "a"]);
    // Same frame instance — private state survived the reorder
    expect(Frame.get("it-b")).toBe(childB);
    expect(childB!.view!.updater.get<number>("stamp")).toBe(7);
  });

  it("balances EventDelegator bind/unbind across the view lifecycle", async () => {
    const bindSpy = vi.spyOn(EventDelegator, "bind");
    const unbindSpy = vi.spyOn(EventDelegator, "unbind");

    registerViewClass(
      "jsx/balance",
      defineView((ctx) => {
        ctx.updater.digest({ n: 0 });
        return {
          template: jsxTemplate<{ n: number }>(({ n }) => (
            <div>
              <button data-role="b1" onClick={() => n}>
                one
              </button>
              <input data-role="b2" onInput={() => n} />
              <button onClick={() => n + 1}>two</button>
            </div>
          )),
        };
      }),
    );

    const frame = makeFrame("jsx-balance");
    frame.mountView("jsx/balance");
    await flush();

    // Several re-renders must not re-bind already-bound types
    frame.view!.updater.set({ n: 1 }).digest();
    frame.view!.updater.set({ n: 2 }).digest();
    await flush();

    const view = frame.view!;
    frame.unmountView();
    await flush();

    const countCalls = (spy: { mock: { calls: unknown[][] } }, type: string): number =>
      spy.mock.calls.filter((c) => c[0] === type).length;

    // One bind per type per view (jsx wiring is the sole binder)
    expect(countCalls(bindSpy, "click")).toBe(1);
    expect(countCalls(unbindSpy, "click")).toBe(1);
    expect(countCalls(bindSpy, "input")).toBe(1);
    expect(countCalls(unbindSpy, "input")).toBe(1);

    // Generated keys removed on destroy
    expect(Object.keys(view.getEvents() || {}).some((k) => k.startsWith("__jsx"))).toBe(false);

    bindSpy.mockRestore();
    unbindSpy.mockRestore();
  });

  it("supports Fragment roots (multi-root templates)", async () => {
    registerViewClass(
      "jsx/fragment",
      defineView((ctx) => {
        ctx.updater.digest({});
        return {
          template: jsxTemplate(() => (
            <>
              <header data-role="h">H</header>
              <footer data-role="f">F</footer>
            </>
          )),
        };
      }),
    );

    const frame = makeFrame("jsx-fragment");
    frame.mountView("jsx/fragment");
    await flush();

    expect(document.querySelector("#jsx-fragment [data-role='h']")).toBeTruthy();
    expect(document.querySelector("#jsx-fragment [data-role='f']")).toBeTruthy();
  });

  it("a bare template call outside any frame does not throw", () => {
    const template = jsxTemplate<{ x: number }>(({ x }) => <div onClick={() => x}>{x}</div>);
    const refData: Record<string, unknown> = {};
    refData[SPLITTER] = 1;
    const html = template({ x: 1, vId: "nope" }, "nope", refData);
    expect(html).toContain("<div");
    expect(html).toContain("__jsx1");
  });

  it("sweeps stale refData tokens across renders (fresh identities do not leak)", () => {
    const template = jsxTemplate<{ n: number }>(({ n }) => <div data-x={{ n }}>{n}</div>);
    const refData: Record<string, unknown> = {};
    refData[SPLITTER] = 1;
    for (let i = 0; i < 5; i++) {
      template({ n: i, vId: "x" }, "x", refData);
    }
    const tokenCount = Object.keys(refData).filter((k) => k !== SPLITTER).length;
    expect(tokenCount).toBe(1); // only the latest render's token survives
  });
});
