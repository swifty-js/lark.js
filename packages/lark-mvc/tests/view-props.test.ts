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
 * The single `p-lark` token resolves (via the parent updater's refData) to
 * the WHOLE props object. `on[A-Z]*` function values become child→parent
 * event subscriptions through per-frame trampolines; everything else is
 * pushed into the child as data (full `view.render()` on updates).
 *
 * Templates here are hand-written strings mimicking exactly what the JSX
 * serializer emits for `<Child .../>` tags.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineView } from "../src/view";
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
 */
function makePropsTemplate(
  build: (d: Record<string, unknown>) => Record<string, unknown>,
): ViewTemplate {
  return (data: unknown, _viewId: string, refData: unknown) => {
    const d = (data || {}) as Record<string, unknown>;
    const ref = refData as Record<string, unknown>;
    const token = refFn(ref, build(d), "");
    return `<div v-lark="test/child" p-lark="${token}"></div>`;
  };
}

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
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          received = String(p["msg"] ?? "");
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ greeting: "hello" });
          return { template: makePropsTemplate((d) => ({ msg: d["greeting"] })) };
        }),
      );

      const frame = makeFrame("s1");
      frame.mountView("test/parent");
      await flush();

      expect(received).toBe("hello");
    });

    it("updates child props when parent re-renders", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          ctx.updater.digest({ msg: String(p["msg"] ?? "") });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              return `<div data-msg="${d["msg"] ?? ""}">child</div>`;
            },
          };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ greeting: "first" });
          return { template: makePropsTemplate((d) => ({ msg: d["greeting"] })) };
        }),
      );

      const frame = makeFrame("s2");
      frame.mountView("test/parent");
      await flush();

      // Natural update: set + digest → re-render → mountZone pushes new props
      frame.view!.updater.set({ greeting: "second" }).digest();
      await flush();

      const childView = findChild(frame)?.view;
      expect(childView?.updater.get<string>("msg")).toBe("second");
    });

    it("preserves primitive types through the props token (no stringification)", async () => {
      let received: Record<string, unknown> = {};
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          received = { ...(params || {}) } as Record<string, unknown>;
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: makePropsTemplate(() => ({
              count: 42,
              enabled: false,
              empty: "",
              nothing: null,
            })),
          };
        }),
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
      let received: Record<string, unknown> = {};
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          received = { ...(params || {}) } as Record<string, unknown>;
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return { template: makePropsTemplate(() => ({ userName: "ada", maxRetryCount: 3 })) };
        }),
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
  // 2. Object/Array Props (live references)
  // ============================================================
  describe("object/array props", () => {
    it("passes array reference to child", async () => {
      let received: unknown = null;
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          received = p["history"];
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      const history = ["a", "b", "c"];
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ history });
          return { template: makePropsTemplate((d) => ({ history: d["history"] })) };
        }),
      );

      const frame = makeFrame("o1");
      frame.mountView("test/parent");
      await flush();

      expect(received).toBe(history);
      expect(received).toEqual(["a", "b", "c"]);
    });

    it("passes object reference to child", async () => {
      let received: unknown = null;
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          received = p["config"];
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      const config = { theme: "dark", timeout: 5000 };
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ config });
          return { template: makePropsTemplate((d) => ({ config: d["config"] })) };
        }),
      );

      const frame = makeFrame("o2");
      frame.mountView("test/parent");
      await flush();

      expect(received).toBe(config);
      expect(received).toEqual({ theme: "dark", timeout: 5000 });
    });

    it("updates child when parent pushes to array", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const h = Array.isArray(p["history"]) ? p["history"] : [];
          ctx.updater.digest({ history: h });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const arr = (d["history"] as unknown[]) || [];
              return `<div data-len="${arr.length}">${arr.length}</div>`;
            },
          };
        }),
      );

      const arr: string[] = ["a"];
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ history: arr });
          return { template: makePropsTemplate((d) => ({ history: d["history"] })) };
        }),
      );

      const frame = makeFrame("o3");
      frame.mountView("test/parent");
      await flush();

      const childEl3 = document.getElementById("o3")!.querySelector("[data-len]");
      expect(childEl3?.getAttribute("data-len")).toBe("1");

      arr.push("b", "c");
      frame.view!.updater.set({ history: arr }).digest();
      await flush();

      const childEl3b = document.getElementById("o3")!.querySelector("[data-len]");
      expect(childEl3b?.getAttribute("data-len")).toBe("3");
    });

    it("updates child when parent pops from array", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const h = Array.isArray(p["history"]) ? p["history"] : [];
          ctx.updater.digest({ history: h });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const arr = (d["history"] as unknown[]) || [];
              return `<div data-len="${arr.length}">${arr.length}</div>`;
            },
          };
        }),
      );

      const arr = ["x", "y", "z"];
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ history: arr });
          return { template: makePropsTemplate((d) => ({ history: d["history"] })) };
        }),
      );

      const frame = makeFrame("o4");
      frame.mountView("test/parent");
      await flush();

      const el4 = document.getElementById("o4")!.querySelector("[data-len]");
      expect(el4?.getAttribute("data-len")).toBe("3");

      arr.pop();
      frame.view!.updater.set({ history: arr }).digest();
      await flush();

      const el4b = document.getElementById("o4")!.querySelector("[data-len]");
      expect(el4b?.getAttribute("data-len")).toBe("2");
    });

    it("updates child when array length changes", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const h = Array.isArray(p["items"]) ? p["items"] : [];
          ctx.updater.digest({ items: h });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const arr = (d["items"] as unknown[]) || [];
              return `<div data-len="${arr.length}">${arr.length}</div>`;
            },
          };
        }),
      );

      const items = [1, 2, 3];
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ items });
          return { template: makePropsTemplate((d) => ({ items: d["items"] })) };
        }),
      );

      const frame = makeFrame("o5");
      frame.mountView("test/parent");
      await flush();

      const el5 = document.getElementById("o5")!.querySelector("[data-len]");
      expect(el5?.getAttribute("data-len")).toBe("3");

      items.length = 1;
      frame.view!.updater.set({ items }).digest();
      await flush();

      const el5b = document.getElementById("o5")!.querySelector("[data-len]");
      expect(el5b?.getAttribute("data-len")).toBe("1");
    });

    it("updates child when object property is added", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const c = (p["config"] as Record<string, unknown>) || {};
          ctx.updater.digest({ config: c });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const c = (d["config"] as Record<string, unknown>) || {};
              const keys = Object.keys(c).join(",");
              return `<div data-keys="${keys}">${keys}</div>`;
            },
          };
        }),
      );

      const config: Record<string, unknown> = { theme: "dark" };
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ config });
          return { template: makePropsTemplate((d) => ({ config: d["config"] })) };
        }),
      );

      const frame = makeFrame("o6");
      frame.mountView("test/parent");
      await flush();

      const el6 = document.getElementById("o6")!.querySelector("[data-keys]");
      expect(el6?.getAttribute("data-keys")).toBe("theme");

      config["timeout"] = 5000;
      frame.view!.updater.set({ config }).digest();
      await flush();

      const el6b = document.getElementById("o6")!.querySelector("[data-keys]");
      expect(el6b?.getAttribute("data-keys")).toBe("theme,timeout");
    });

    it("updates child when object property is deleted", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          const c = (p["config"] as Record<string, unknown>) || {};
          ctx.updater.digest({ config: c });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              const c = (d["config"] as Record<string, unknown>) || {};
              const keys = Object.keys(c).join(",");
              return `<div data-keys="${keys}">${keys}</div>`;
            },
          };
        }),
      );

      const config: Record<string, unknown> = { theme: "dark", timeout: 5000 };
      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ config });
          return { template: makePropsTemplate((d) => ({ config: d["config"] })) };
        }),
      );

      const frame = makeFrame("o7");
      frame.mountView("test/parent");
      await flush();

      const el7 = document.getElementById("o7")!.querySelector("[data-keys]");
      expect(el7?.getAttribute("data-keys")).toBe("theme,timeout");

      delete config["timeout"];
      frame.view!.updater.set({ config }).digest();
      await flush();

      const el7b = document.getElementById("o7")!.querySelector("[data-keys]");
      expect(el7b?.getAttribute("data-keys")).toBe("theme");
    });
  });

  // ============================================================
  // 3. Event Binding (child → parent via function props)
  // ============================================================
  describe("event binding", () => {
    it("calls parent handler when child fires event", async () => {
      const handler = vi.fn();
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          void ctx;
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return { template: makePropsTemplate(() => ({ onCustomEvent: handler })) };
        }),
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
        defineView((ctx) => {
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
            template: makePropsTemplate(() => ({
              onDataEvent: (data: Record<string, unknown>) => {
                received = data;
              },
            })),
          };
        }),
      );

      const frame = makeFrame("e2");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("dataEvent", { value: 42 });
      await flush();

      expect((received as Record<string, unknown>)["value"]).toBe(42);
    });

    it("supports async parent handler", async () => {
      const results: string[] = [];
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return {
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
          };
        }),
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
        defineView((ctx) => {
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          // onClearHistory → subscribes the frame event "clearHistory";
          // prop names travel inside the token, never through HTML.
          return { template: makePropsTemplate(() => ({ onClearHistory: handler })) };
        }),
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
        defineView((ctx) => {
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ generation: "g1" });
          return {
            template: makePropsTemplate((d) => ({
              tick: d["generation"],
              onPing: () => calls.push(String(d["generation"])),
            })),
          };
        }),
      );

      const frame = makeFrame("e5");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("ping");
      expect(calls).toEqual(["g1"]);

      frame.view!.updater.set({ generation: "g2" }).digest();
      await flush();

      // The SAME frame-emitter subscription now reaches the new closure.
      findChild(frame)?.view?.owner.fire("ping");
      expect(calls).toEqual(["g1", "g2"]);
    });

    it("parks removed handler props without unsubscribing", async () => {
      const handler = vi.fn();
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ armed: 1 });
          return {
            template: makePropsTemplate((d) =>
              d["armed"] ? { flag: 1, onPing: handler } : { flag: 0 },
            ),
          };
        }),
      );

      const frame = makeFrame("e6");
      frame.mountView("test/parent");
      await flush();

      findChild(frame)?.view?.owner.fire("ping");
      expect(handler).toHaveBeenCalledTimes(1);

      frame.view!.updater.set({ armed: 0 }).digest();
      await flush();

      // Handler prop removed → trampoline parked, no call, no crash.
      expect(() => findChild(frame)?.view?.owner.fire("ping")).not.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not crash when child fires an unbound event", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({});
          return { template: () => `<div v-lark="test/child"></div>` };
        }),
      );

      const frame = makeFrame("e7");
      frame.mountView("test/parent");
      await flush();

      expect(() => findChild(frame)?.view?.owner.fire("noHandler")).not.toThrow();
    });
  });

  // ============================================================
  // 4. Multiple Props & Edge Cases
  // ============================================================
  describe("multiple props & edge cases", () => {
    it("passes multiple props simultaneously", async () => {
      let received: Record<string, unknown> = {};
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          received = { ...(params || {}) } as Record<string, unknown>;
          ctx.updater.digest({});
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ a: "valA", b: "valB", c: "valC" });
          return {
            template: makePropsTemplate((d) => ({ a: d["a"], b: d["b"], c: d["c"] })),
          };
        }),
      );

      const frame = makeFrame("m1");
      frame.mountView("test/parent");
      await flush();

      expect(received["a"]).toBe("valA");
      expect(received["b"]).toBe("valB");
      expect(received["c"]).toBe("valC");
    });

    it("does not touch the child when the host has no props token", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx) => {
          ctx.updater.digest({ msg: "child" });
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ msg: "parent" });
          return { template: () => `<div v-lark="test/child"></div>` };
        }),
      );

      const frame = makeFrame("m2");
      frame.mountView("test/parent");
      await flush();

      const childView = findChild(frame)?.view;
      const spy = vi.spyOn(childView!.updater, "digest");
      frame.view!.updater.set({ msg: "updated" }).digest();
      await flush();

      expect(spy).not.toHaveBeenCalled();
    });

    it("preserves child's own data when updating props", async () => {
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          ctx.updater.digest({
            count: Number(p["count"]) || 0,
            styles: { color: "red" },
            msg: "child",
          });
          return { template: () => "<div>child</div>" };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ count: 5 });
          return { template: makePropsTemplate((d) => ({ count: d["count"] })) };
        }),
      );

      const frame = makeFrame("m3");
      frame.mountView("test/parent");
      await flush();

      frame.view!.updater.set({ count: 10 }).digest();
      await flush();

      const childView = findChild(frame)?.view;
      expect(childView?.updater.get<unknown>("styles")).toEqual({
        color: "red",
      });
      expect(childView?.updater.get<string>("msg")).toBe("child");
    });

    it("prop pushes run the child's full render (assign re-runs)", async () => {
      const assignCalls: number[] = [];
      registerViewClass(
        "test/child",
        defineView((ctx, params) => {
          const p = (params || {}) as Record<string, unknown>;
          ctx.updater.set({ count: Number(p["count"]) || 0 });
          return {
            template: (data: unknown) => {
              const d = (data || {}) as Record<string, unknown>;
              return `<div data-doubled="${d["doubled"] ?? ""}">child</div>`;
            },
            assign: () => {
              const count = ctx.updater.get<number>("count") ?? 0;
              assignCalls.push(count);
              ctx.updater.set({ doubled: count * 2 });
              return true;
            },
          };
        }),
      );

      registerViewClass(
        "test/parent",
        defineView((ctx) => {
          ctx.updater.digest({ count: 3 });
          return { template: makePropsTemplate((d) => ({ count: d["count"] })) };
        }),
      );

      const frame = makeFrame("m4");
      frame.mountView("test/parent");
      await flush();
      // First render: assign ran once during the child's initial render
      const initialAssigns = assignCalls.length;

      frame.view!.updater.set({ count: 7 }).digest();
      await flush();

      expect(assignCalls.length).toBeGreaterThan(initialAssigns);
      const childEl = document.getElementById("m4")!.querySelector("[data-doubled]");
      expect(childEl?.getAttribute("data-doubled")).toBe("14");
    });
  });
});
