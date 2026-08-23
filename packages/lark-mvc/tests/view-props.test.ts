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
 * Child-view props & events over the component wire format:
 *
 *   <div v-lark="<registry name>" p-lark="<refData token>"></div>
 *
 * The single `p-lark` token resolves (via the parent ctx's refData) to the
 * WHOLE props object. `on[A-Z]*` function values become child→parent event
 * subscriptions through per-frame trampolines; everything else lands in the
 * child's reactive `params` proxy (one signal per key). Reading `params.key`
 * inside the child TEMPLATE subscribes the child — parent re-renders push
 * fresh values through the signals and only readers re-render (shallow:
 * reference comparison).
 *
 * Templates here are hand-written strings mimicking exactly what the JSX
 * serializer emits for `<Child .../>` tags.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineView } from "../src/view";
import { signal } from "../src/reactive";
import { Frame, createFrame, registerViewClass, invalidateViewClass } from "../src/frame";
import { getViewClassRegistry } from "../src/view-registry";
import { refFn } from "../src/common";
import type { FrameObj, ViewTemplate } from "../src/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function makeFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

function cleanup(): void {
  for (const [id] of Frame.getAll()) {
    const el = document.getElementById(id);
    if (el) el.remove();
    Frame.getAll().delete(id);
  }
}

function findChild(parentFrame: FrameObj): FrameObj | undefined {
  return Array.from(Frame.getAll().values()).find(
    (f) => f.parentId === parentFrame.id && f.getViewPath(),
  );
}

/**
 * Create a parent template that packs the given props object into ONE
 * refData token — exactly what `serializeViewTag` does for `<Child .../>`.
 * The build callback runs inside the parent's render effect, so signal
 * reads inside it subscribe the parent.
 */
function makePropsTemplate(build: () => Record<string, unknown>): ViewTemplate {
  return (_viewId, refData) => {
    const token = refFn(refData, build(), "");
    return `<div v-lark="test/child" p-lark="${token}"></div>`;
  };
}

type P = Record<string, unknown>;

// ─── Tests ────────────────────────────────────────────────────────────────

describe("component host Props & Events", () => {
  beforeEach(() => {
    const reg = getViewClassRegistry();
    for (const key of Object.keys(reg)) invalidateViewClass(key);
  });

  afterEach(() => cleanup());

  // ============================================================
  // 1. Primitive Props
  // ============================================================
  describe("primitive props", () => {
    it("passes string prop to child setup params", async () => {
      let received = "";
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => {
          received = String((params as P)["msg"] ?? "");
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView(() => ({ template: makePropsTemplate(() => ({ msg: "hello" })) })),
      );

      const frame = makeFrame("s1");
      frame.mountView("test/parent");
      await flush();

      expect(received).toBe("hello");
    });

    it("updates child reactively when parent re-renders with new props", async () => {
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => ({
          template: () => `<div data-msg="${String((params as P)["msg"] ?? "")}">child</div>`,
        })),
      );

      const greeting = signal("first");
      registerViewClass(
        "test/parent",
        defineView(() => ({ template: makePropsTemplate(() => ({ msg: greeting.value })) })),
      );

      const frame = makeFrame("s2");
      frame.mountView("test/parent");
      await flush();

      const el = () => document.getElementById("s2")!.querySelector("[data-msg]");
      expect(el()?.getAttribute("data-msg")).toBe("first");

      // Parent signal write → parent re-renders → mountZone pushes the new
      // props → child's params signal notifies its render effect.
      greeting.value = "second";
      await flush();

      expect(el()?.getAttribute("data-msg")).toBe("second");
    });

    it("preserves primitive types through the props token (no stringification)", async () => {
      let received: P = {};
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => {
          received = { ...(params as P) };
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => ({
            count: 42,
            enabled: false,
            empty: "",
            nothing: null,
          })),
        })),
      );

      const frame = makeFrame("s3");
      frame.mountView("test/parent");
      await flush();

      expect(received["count"]).toBe(42);
      expect(received["enabled"]).toBe(false);
      expect(received["empty"]).toBe("");
      expect(received["nothing"]).toBeNull();
    });

    it("delivers camelCase prop names exactly (never lowercased)", async () => {
      let received: P = {};
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => {
          received = { ...(params as P) };
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => ({ userName: "ada", maxRetryCount: 3 })),
        })),
      );

      const frame = makeFrame("s4");
      frame.mountView("test/parent");
      await flush();

      expect(received["userName"]).toBe("ada");
      expect(received["maxRetryCount"]).toBe(3);
      expect("username" in received).toBe(false);
    });
  });

  // ============================================================
  // 2. Object/Array Props (live references, shallow comparison)
  // ============================================================
  describe("object/array props", () => {
    it("passes array and object references to the child (same identity)", async () => {
      let receivedArr: unknown = null;
      let receivedObj: unknown = null;
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => {
          const p = params as P;
          receivedArr = p["history"];
          receivedObj = p["config"];
          return { template: () => "<div>child</div>" };
        }),
      );

      const history = ["a", "b", "c"];
      const config = { theme: "dark", timeout: 5000 };
      registerViewClass(
        "test/parent",
        defineView(() => ({ template: makePropsTemplate(() => ({ history, config })) })),
      );

      const frame = makeFrame("o1");
      frame.mountView("test/parent");
      await flush();

      expect(receivedArr).toBe(history);
      expect(receivedObj).toBe(config);
    });

    it("re-renders the child when the parent pushes a NEW array reference", async () => {
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => ({
          template: () => {
            const arr = ((params as P)["items"] as unknown[]) ?? [];
            return `<div data-len="${arr.length}">${arr.length}</div>`;
          },
        })),
      );

      const items = signal<number[]>([1]);
      registerViewClass(
        "test/parent",
        defineView(() => ({ template: makePropsTemplate(() => ({ items: items.value })) })),
      );

      const frame = makeFrame("o2");
      frame.mountView("test/parent");
      await flush();

      const el = () => document.getElementById("o2")!.querySelector("[data-len]");
      expect(el()?.getAttribute("data-len")).toBe("1");

      items.value = [...items.value, 2, 3]; // replace the reference
      await flush();
      expect(el()?.getAttribute("data-len")).toBe("3");
    });

    it("does NOT re-render the child on in-place mutation (shallow semantics)", async () => {
      let childRenders = 0;
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => ({
          template: () => {
            childRenders++;
            const arr = ((params as P)["items"] as unknown[]) ?? [];
            return `<div data-len="${arr.length}">${arr.length}</div>`;
          },
        })),
      );

      const items = [1, 2];
      const parentTick = signal(0);
      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => ({ items, tick: parentTick.value })),
        })),
      );

      const frame = makeFrame("o3");
      frame.mountView("test/parent");
      await flush();
      const initial = childRenders;

      items.push(3); // mutate in place — same reference
      parentTick.value++; // parent re-renders, pushes the SAME array reference
      await flush();

      // Child read only `items` (same ref) → no notification. `tick` changed
      // but is unread by the child template.
      expect(childRenders).toBe(initial);
    });
  });

  // ============================================================
  // 3. Fine-grained reactivity (per-key subscriptions)
  // ============================================================
  describe("fine-grained prop reactivity", () => {
    it("only re-renders children that READ the changed key", async () => {
      let childRenders = 0;
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => ({
          template: () => {
            childRenders++;
            return `<div>a=${String((params as P)["a"])}</div>`;
          },
        })),
      );

      const a = signal("a1");
      const b = signal("b1");
      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => ({ a: a.value, b: b.value })),
        })),
      );

      const frame = makeFrame("f1");
      frame.mountView("test/parent");
      await flush();
      const initial = childRenders;

      b.value = "b2"; // parent re-renders; child reads only `a`
      await flush();
      expect(childRenders).toBe(initial);

      a.value = "a2";
      await flush();
      expect(childRenders).toBe(initial + 1);
    });

    it("removed props read as undefined (React prop-removal semantics)", async () => {
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => ({
          template: () => `<div data-flag="${String((params as P)["flag"])}">child</div>`,
        })),
      );

      const armed = signal(true);
      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => (armed.value ? { flag: "on" } : {})),
        })),
      );

      const frame = makeFrame("f2");
      frame.mountView("test/parent");
      await flush();

      const el = () => document.getElementById("f2")!.querySelector("[data-flag]");
      expect(el()?.getAttribute("data-flag")).toBe("on");

      armed.value = false;
      await flush();
      expect(el()?.getAttribute("data-flag")).toBe("undefined");
    });

    it("a Signal passed as a prop updates the child WITHOUT a parent re-render", async () => {
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => ({
          template: () => {
            const sig = (params as P)["count"] as { value: number };
            return `<div data-count="${sig.value}">child</div>`;
          },
        })),
      );

      let parentRenders = 0;
      const count = signal(1);
      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: (_viewId, refData) => {
            parentRenders++;
            const token = refFn(refData as Record<string, unknown>, { count }, "");
            return `<div v-lark="test/child" p-lark="${token}"></div>`;
          },
        })),
      );

      const frame = makeFrame("f3");
      frame.mountView("test/parent");
      await flush();
      const initialParent = parentRenders;

      const el = () => document.getElementById("f3")!.querySelector("[data-count]");
      expect(el()?.getAttribute("data-count")).toBe("1");

      count.value = 2; // child template reads count.value → re-renders
      await flush();
      expect(el()?.getAttribute("data-count")).toBe("2");
      expect(parentRenders).toBe(initialParent); // parent never re-rendered
    });
  });

  // ============================================================
  // 4. Event Binding (child → parent via function props)
  // ============================================================
  describe("event binding", () => {
    it("calls parent handler when child fires event", async () => {
      const handler = vi.fn();
      registerViewClass(
        "test/child",
        defineView(() => ({ template: () => "<div>child</div>" })),
      );

      registerViewClass(
        "test/parent",
        defineView(() => ({ template: makePropsTemplate(() => ({ onCustomEvent: handler })) })),
      );

      const frame = makeFrame("e1");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("customEvent");
      await flush();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("passes data from child to parent handler", async () => {
      let received: unknown;
      registerViewClass(
        "test/child",
        defineView(() => ({ template: () => "<div>child</div>" })),
      );

      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => ({
            onDataEvent: (data: Record<string, unknown>) => {
              received = data;
            },
          })),
        })),
      );

      const frame = makeFrame("e2");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("dataEvent", { value: 42 });
      await flush();

      expect((received as P)["value"]).toBe(42);
    });

    it("supports async parent handler", async () => {
      const results: string[] = [];
      registerViewClass(
        "test/child",
        defineView(() => ({ template: () => "<div>child</div>" })),
      );

      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => ({
            onAsyncEvent: () => {
              return new Promise<void>((resolve) => {
                setTimeout(() => {
                  results.push("done");
                  resolve();
                }, 10);
              });
            },
          })),
        })),
      );

      const frame = makeFrame("e3");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("asyncEvent");
      await new Promise((r) => setTimeout(r, 50));

      expect(results).toContain("done");
    });

    it("matches camelCase event names exactly (case-sensitive)", async () => {
      const handler = vi.fn();
      registerViewClass(
        "test/child",
        defineView(() => ({ template: () => "<div>child</div>" })),
      );

      registerViewClass(
        "test/parent",
        defineView(() => ({
          // onClearHistory → subscribes the frame event "clearHistory";
          // prop names travel inside the token, never through HTML.
          template: makePropsTemplate(() => ({ onClearHistory: handler })),
        })),
      );

      const frame = makeFrame("e4");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("clearhistory");
      await flush();
      expect(handler).not.toHaveBeenCalled();

      findChild(frame)?.view?.owner.fire("clearHistory");
      await flush();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("re-syncs handlers on parent re-render (trampoline swaps closures)", async () => {
      const calls: string[] = [];
      registerViewClass(
        "test/child",
        defineView(() => ({ template: () => "<div>child</div>" })),
      );

      const generation = signal("g1");
      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => {
            const g = generation.value;
            return { tick: g, onPing: () => calls.push(g) };
          }),
        })),
      );

      const frame = makeFrame("e5");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("ping");
      expect(calls).toEqual(["g1"]);

      generation.value = "g2";
      await flush();

      // The SAME frame-emitter subscription now reaches the new closure.
      findChild(frame)?.view?.owner.fire("ping");
      expect(calls).toEqual(["g1", "g2"]);
    });

    it("parks removed handler props without unsubscribing", async () => {
      const handler = vi.fn();
      registerViewClass(
        "test/child",
        defineView(() => ({ template: () => "<div>child</div>" })),
      );

      const armed = signal(true);
      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() =>
            armed.value ? { flag: 1, onPing: handler } : { flag: 0 },
          ),
        })),
      );

      const frame = makeFrame("e6");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("ping");
      expect(handler).toHaveBeenCalledTimes(1);

      armed.value = false;
      await flush();

      // Handler prop removed → trampoline parked, no call, no crash.
      expect(() => findChild(frame)?.view?.owner.fire("ping")).not.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not crash when child fires an unbound event", async () => {
      registerViewClass(
        "test/child",
        defineView(() => ({ template: () => "<div>child</div>" })),
      );

      registerViewClass(
        "test/parent",
        defineView(() => ({ template: () => `<div v-lark="test/child"></div>` })),
      );

      const frame = makeFrame("e7");
      frame.mountView("test/parent");
      await flush();

      expect(() => findChild(frame)?.view?.owner.fire("noHandler")).not.toThrow();
    });
  });

  // ============================================================
  // 5. Multiple Props & Edge Cases
  // ============================================================
  describe("multiple props & edge cases", () => {
    it("passes multiple props simultaneously", async () => {
      let received: P = {};
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => {
          received = { ...(params as P) };
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => ({ a: "valA", b: "valB", c: "valC" })),
        })),
      );

      const frame = makeFrame("m1");
      frame.mountView("test/parent");
      await flush();

      expect(received["a"]).toBe("valA");
      expect(received["b"]).toBe("valB");
      expect(received["c"]).toBe("valC");
    });

    it("does not re-render a prop-less child when the parent re-renders", async () => {
      let childRenders = 0;
      registerViewClass(
        "test/child",
        defineView(() => ({
          template: () => {
            childRenders++;
            return "<div>child</div>";
          },
        })),
      );

      const tick = signal(0);
      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: () => `<i>${tick.value}</i><div v-lark="test/child"></div>`,
        })),
      );

      const frame = makeFrame("m2");
      frame.mountView("test/parent");
      await flush();
      const initial = childRenders;

      tick.value++;
      await flush();

      expect(childRenders).toBe(initial);
    });

    it("preserves child-local signal state across prop pushes", async () => {
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => {
          const local = signal("child-own");
          return {
            template: () =>
              `<div data-count="${String((params as P)["count"])}" data-local="${local.value}">child</div>`,
          };
        }),
      );

      const count = signal(5);
      registerViewClass(
        "test/parent",
        defineView(() => ({ template: makePropsTemplate(() => ({ count: count.value })) })),
      );

      const frame = makeFrame("m3");
      frame.mountView("test/parent");
      await flush();

      count.value = 10;
      await flush();

      const el = document.getElementById("m3")!.querySelector("[data-count]");
      expect(el?.getAttribute("data-count")).toBe("10");
      expect(el?.getAttribute("data-local")).toBe("child-own");
    });

    it("multiple prop changes in one parent render pass render the child once", async () => {
      let childRenders = 0;
      registerViewClass(
        "test/child",
        defineView((_ctx, params) => ({
          template: () => {
            childRenders++;
            const p = params as P;
            return `<div data-sum="${Number(p["a"]) + Number(p["b"])}">child</div>`;
          },
        })),
      );

      const a = signal(1);
      const b = signal(2);
      registerViewClass(
        "test/parent",
        defineView(() => ({
          template: makePropsTemplate(() => ({ a: a.value, b: b.value })),
        })),
      );

      const frame = makeFrame("m4");
      frame.mountView("test/parent");
      await flush();
      const initial = childRenders;

      a.value = 10; // one parent render → mountZone batch-writes BOTH keys
      await flush();

      expect(childRenders).toBe(initial + 1);
      const el = document.getElementById("m4")!.querySelector("[data-sum]");
      expect(el?.getAttribute("data-sum")).toBe("12");
    });
  });
});
