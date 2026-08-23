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
 * HMR tests for JSX views: hotSwapByView must preserve updater data, render
 * the new JSX markup, re-wire inline handlers, and keep the EventDelegator
 * bind/unbind refcount balanced across consecutive swaps.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hotSwapByView } from "../src/hmr";
import { defineView } from "../src/view";
import { Frame, createFrame, registerViewClass, invalidateViewClass } from "../src/frame";
import { getViewClassRegistry } from "../src/view-registry";
import { EventDelegator } from "../src/event-delegator";
import { jsxTemplate } from "../src/jsx/template";
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

/** Build a JSX view setup whose markup carries `label` and an inline handler. */
function makeJsxSetup(label: string, onHit: (label: string) => void) {
  return defineView((ctx) => {
    // Initialize once — hotSwapView re-runs setup against the preserved ctx
    if (ctx.updater.get("count") === undefined) {
      ctx.updater.set({ count: 0 });
    }
    return {
      template: jsxTemplate<{ count: number }>(({ count }) => (
        <div class={label}>
          <span data-role="count">{count}</span>
          <button data-role="hit" onClick={() => onHit(label)}>
            hit
          </button>
        </div>
      )),
    };
  });
}

describe("JSX views + HMR", () => {
  beforeEach(() => {
    EventDelegator.setFrameGetter((id) => Frame.get(id));
    const reg = getViewClassRegistry();
    for (const key of Object.keys(reg)) invalidateViewClass(key);
  });

  afterEach(() => cleanupFrames());

  it("hotSwapByView preserves data, renders new markup, re-wires inline handlers", async () => {
    const hits: string[] = [];
    const OldView = makeJsxSetup("gen-old", (l) => hits.push(l));
    registerViewClass("jsx/hmr", OldView);

    const frame = makeFrame("jsx-hmr");
    frame.mountView("jsx/hmr");
    await flush();

    frame.view!.updater.set({ count: 9 }).digest();
    await flush();
    expect(document.querySelector("#jsx-hmr [data-role='count']")!.textContent).toBe("9");

    const NewView = makeJsxSetup("gen-new", (l) => hits.push(l));
    hotSwapByView(OldView, NewView);
    await flush();

    // Data preserved, new markup rendered
    expect(frame.view!.updater.get<number>("count")).toBe(9);
    expect(document.querySelector("#jsx-hmr .gen-new")).toBeTruthy();
    expect(document.querySelector("#jsx-hmr .gen-old")).toBeNull();
    expect(getViewClassRegistry()["jsx/hmr"]).toBe(NewView);

    // Inline handler re-wired to the new generation
    click(document.querySelector("#jsx-hmr [data-role='hit']")!);
    expect(hits).toEqual(["gen-new"]);
  });

  it("keeps bind/unbind balanced across two consecutive swaps and unmount", async () => {
    const bindSpy = vi.spyOn(EventDelegator, "bind");
    const unbindSpy = vi.spyOn(EventDelegator, "unbind");
    const countCalls = (spy: { mock: { calls: unknown[][] } }, type: string): number =>
      spy.mock.calls.filter((c) => c[0] === type).length;

    const V1 = makeJsxSetup("v1", () => undefined);
    registerViewClass("jsx/hmr-balance", V1);

    const frame = makeFrame("jsx-hmr-balance");
    frame.mountView("jsx/hmr-balance");
    await flush();
    // Mount: jsx wiring binds click once
    expect(countCalls(bindSpy, "click")).toBe(1);

    const V2 = makeJsxSetup("v2", () => undefined);
    hotSwapByView(V1, V2);
    await flush();
    // Swap 1: cleanup unbinds, re-render re-binds
    expect(countCalls(unbindSpy, "click")).toBe(1);
    expect(countCalls(bindSpy, "click")).toBe(2);

    const V3 = makeJsxSetup("v3", () => undefined);
    hotSwapByView(V2, V3);
    await flush();
    // Swap 2 (regression: WeakMap state must reset per swap)
    expect(countCalls(unbindSpy, "click")).toBe(2);
    expect(countCalls(bindSpy, "click")).toBe(3);

    frame.unmountView();
    await flush();
    // Final unmount releases the last bind — perfectly balanced
    expect(countCalls(unbindSpy, "click")).toBe(3);
    expect(countCalls(bindSpy, "click")).toBe(3);

    // Inline handler still works between swaps proves attribute/name coherence
    bindSpy.mockRestore();
    unbindSpy.mockRestore();
  });

  it("swapped-in view can change its inline event types safely", async () => {
    const V1 = defineView((ctx) => {
      ctx.updater.set({});
      return {
        template: jsxTemplate(() => (
          <button data-role="a" onClick={() => undefined}>
            a
          </button>
        )),
      };
    });
    registerViewClass("jsx/hmr-types", V1);

    const frame = makeFrame("jsx-hmr-types");
    frame.mountView("jsx/hmr-types");
    await flush();

    const seen: string[] = [];
    const V2 = defineView((ctx) => {
      ctx.updater.set({});
      return {
        template: jsxTemplate(() => <input data-role="b" onInput={() => seen.push("input")} />),
      };
    });
    hotSwapByView(V1, V2);
    await flush();

    const input = document.querySelector("#jsx-hmr-types [data-role='b']")!;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(seen).toEqual(["input"]);

    // Old generation's key must be gone from the events map
    const keys = Object.keys(frame.view!.getEvents() || {});
    expect(keys.filter((k) => k.startsWith("__jsx"))).toEqual(["__jsx1<input>"]);
  });
});
