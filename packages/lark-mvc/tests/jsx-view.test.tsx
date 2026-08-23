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
 * signal-driven re-render, keyed diff, imported component tags (child
 * views), and bind/unbind balance on unmount.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineView } from "../src/view";
import { signal } from "../src/reactive";
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
    registerViewClass(
      "jsx/basic",
      defineView(() => {
        const title = "a<b & c";
        return {
          template: jsxTemplate(() => (
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
      defineView(() => ({
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
      })),
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

  it("re-renders on signal write and swaps inline closures to the new generation", async () => {
    const seen: number[] = [];
    const count = signal(1);

    registerViewClass(
      "jsx/rerender",
      defineView(() => ({
        template: jsxTemplate(() => {
          const current = count.value;
          return (
            <div>
              <p data-role="count">{current}</p>
              <button data-role="btn" onClick={() => seen.push(current)}>
                push
              </button>
            </div>
          );
        }),
      })),
    );

    const frame = makeFrame("jsx-rerender");
    frame.mountView("jsx/rerender");
    await flush();

    click(document.querySelector("#jsx-rerender [data-role='btn']")!);
    expect(seen).toEqual([1]);

    count.value = 42; // reactive re-render, no digest call anywhere
    await flush();

    expect(document.querySelector("#jsx-rerender [data-role='count']")!.textContent).toBe("42");
    click(document.querySelector("#jsx-rerender [data-role='btn']")!);
    expect(seen).toEqual([1, 42]); // new closure captured the new value
  });

  it("batches multiple signal writes in one DOM event handler into one render", async () => {
    const a = signal(0);
    const b = signal(0);
    let renders = 0;

    registerViewClass(
      "jsx/batch",
      defineView(() => ({
        template: jsxTemplate(() => {
          renders++;
          return (
            <button
              data-role="both"
              onClick={() => {
                a.value++;
                b.value++;
              }}
            >
              {a.value + b.value}
            </button>
          );
        }),
      })),
    );

    const frame = makeFrame("jsx-batch");
    frame.mountView("jsx/batch");
    await flush();
    expect(renders).toBe(1);

    click(document.querySelector("#jsx-batch [data-role='both']")!);
    // Delegator wraps handlers in batch(): two writes → ONE render pass.
    expect(renders).toBe(2);
    expect(document.querySelector("#jsx-batch [data-role='both']")!.textContent).toBe("2");
    void frame;
  });

  it("filters modifier keys inside the handler (e.ctrlKey)", async () => {
    const ctrlOnly = vi.fn();

    registerViewClass(
      "jsx/modifier",
      defineView(() => ({
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
      })),
    );

    const frame = makeFrame("jsx-modifier");
    frame.mountView("jsx/modifier");
    await flush();

    const c = document.querySelector("#jsx-modifier [data-role='c']")!;
    c.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ctrlOnly).not.toHaveBeenCalled();
    c.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(ctrlOnly).toHaveBeenCalledTimes(1);
    void frame;
  });

  it("reuses keyed DOM nodes across list reorders", async () => {
    const items = signal(["a", "b", "c"]);
    registerViewClass(
      "jsx/list",
      defineView(() => ({
        template: jsxTemplate(() => (
          <ul>
            {items.value.map((item) => (
              <li key={`item-${item}`}>{item}</li>
            ))}
          </ul>
        )),
      })),
    );

    const frame = makeFrame("jsx-list");
    frame.mountView("jsx/list");
    await flush();

    const nodeB = document.getElementById("item-b") as HTMLElement & { __marker?: number };
    nodeB.__marker = 7;

    items.value = ["c", "b", "a"];
    await flush();

    const listItems = Array.from(document.querySelectorAll("#jsx-list li")).map(
      (li) => li.textContent,
    );
    expect(listItems).toEqual(["c", "b", "a"]);
    const nodeBAfter = document.getElementById("item-b") as HTMLElement & { __marker?: number };
    expect(nodeBAfter.__marker).toBe(7); // same node instance, moved not rebuilt
    void frame;
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

    const Child = defineView<ChildProps>((_ctx, params) => {
      receivedRows = params?.rows;
      return {
        template: jsxTemplate(() => (
          <span data-role="child-label">{String(params?.label ?? "")}</span>
        )),
      };
    });

    const rows = [{ id: 1 }, { id: 2 }];
    const label = signal("first");
    registerViewClass(
      "jsx/parent",
      defineView(() => ({
        template: jsxTemplate(() => (
          <section>
            <Child
              id="jsx-child-host"
              rows={rows}
              label={label.value}
              onNotify={onNotify}
              onHistoryCleared={onCleared}
            />
          </section>
        )),
      })),
    );

    const frame = makeFrame("jsx-parent");
    frame.mountView("jsx/parent");
    await flush();

    // Object prop delivered by reference; camelCase keys exact
    expect(receivedRows).toBe(rows);
    expect(document.querySelector("[data-role='child-label']")!.textContent).toBe("first");

    // Parent re-render pushes updated props — the child re-renders reactively
    // because its template reads `params.label`.
    label.value = "second";
    await flush();
    const child = Frame.get("jsx-child-host");
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
    let setupRuns = 0;
    const Item = defineView<{ tag: string }>((_ctx, params) => {
      setupRuns++;
      const local = signal(`local-${String(params?.tag)}`);
      return {
        template: jsxTemplate(() => (
          <b data-tag={String(params?.tag)} data-local={local.value}>
            {String(params?.tag)}
          </b>
        )),
      };
    });

    const order = signal(["a", "b", "c"]);
    registerViewClass(
      "jsx/klist",
      defineView(() => ({
        template: jsxTemplate(() => (
          <div>
            {order.value.map((t) => (
              <Item key={`it-${t}`} tag={t} />
            ))}
          </div>
        )),
      })),
    );

    const frame = makeFrame("jsx-klist");
    frame.mountView("jsx/klist");
    await flush();
    expect(setupRuns).toBe(3);

    const childB = Frame.get("it-b");
    expect(childB?.view).toBeTruthy();

    order.value = ["c", "b", "a"];
    await flush();

    const tags = Array.from(document.querySelectorAll("#jsx-klist [data-tag]")).map((el) =>
      el.getAttribute("data-tag"),
    );
    expect(tags).toEqual(["c", "b", "a"]);
    // Same frame instances — setups did NOT re-run, closure state survived
    expect(Frame.get("it-b")).toBe(childB);
    expect(setupRuns).toBe(3);
    expect(document.querySelector("#jsx-klist [data-tag='b']")!.getAttribute("data-local")).toBe(
      "local-b",
    );
    void frame;
  });

  it("balances EventDelegator bind/unbind across the view lifecycle", async () => {
    const bindSpy = vi.spyOn(EventDelegator, "bind");
    const unbindSpy = vi.spyOn(EventDelegator, "unbind");

    const n = signal(0);
    registerViewClass(
      "jsx/balance",
      defineView(() => ({
        template: jsxTemplate(() => (
          <div>
            <button data-role="b1" onClick={() => n.peek()}>
              one
            </button>
            <input data-role="b2" onInput={() => n.peek()} />
            <button onClick={() => n.peek() + 1}>two</button>
            <i>{n.value}</i>
          </div>
        )),
      })),
    );

    const frame = makeFrame("jsx-balance");
    frame.mountView("jsx/balance");
    await flush();

    // Several re-renders must not re-bind already-bound types
    n.value = 1;
    n.value = 2;
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
      defineView(() => ({
        template: jsxTemplate(() => (
          <>
            <header data-role="h">H</header>
            <footer data-role="f">F</footer>
          </>
        )),
      })),
    );

    const frame = makeFrame("jsx-fragment");
    frame.mountView("jsx/fragment");
    await flush();

    expect(document.querySelector("#jsx-fragment [data-role='h']")).toBeTruthy();
    expect(document.querySelector("#jsx-fragment [data-role='f']")).toBeTruthy();
    void frame;
  });

  it("unwraps Signal children and attribute values in the template", async () => {
    const label = signal("hello");
    registerViewClass(
      "jsx/signal-unwrap",
      defineView(() => ({
        template: jsxTemplate(() => (
          <p data-role="p" title={label}>
            {label}
          </p>
        )),
      })),
    );

    const frame = makeFrame("jsx-signal-unwrap");
    frame.mountView("jsx/signal-unwrap");
    await flush();

    const p = document.querySelector("#jsx-signal-unwrap [data-role='p']")!;
    expect(p.textContent).toBe("hello");
    expect(p.getAttribute("title")).toBe("hello");

    label.value = "world"; // unwrap read subscribed the view
    expect(p.textContent).toBe("world");
    expect(p.getAttribute("title")).toBe("world");
    void frame;
  });

  it("a bare template call outside any frame does not throw", () => {
    const x = 1;
    const template = jsxTemplate(() => <div onClick={() => x}>{x}</div>);
    const refData: Record<string, unknown> = {};
    refData[SPLITTER] = 1;
    const html = template("nope", refData);
    expect(html).toContain("<div");
    expect(html).toContain("__jsx1");
  });

  it("sweeps stale refData tokens across renders (fresh identities do not leak)", () => {
    let n = 0;
    const template = jsxTemplate(() => <div data-x={{ n }}>{n}</div>);
    const refData: Record<string, unknown> = {};
    refData[SPLITTER] = 1;
    for (let i = 0; i < 5; i++) {
      n = i;
      template("x", refData);
    }
    const tokenCount = Object.keys(refData).filter((k) => k !== SPLITTER).length;
    expect(tokenCount).toBe(1); // only the latest render's token survives
  });
});
