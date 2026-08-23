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
 * Reactive render pipeline — the per-view render effect, batching semantics,
 * ref-token resolution, and error routing.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { defineView, createCtx, mountCtx, unmountCtx } from "../src/view";
import { signal, computed, batch } from "../src/reactive";
import { Frame, createFrame } from "../src/frame";
import { setFrameworkErrorSink } from "../src/utils";
import type { FrameObj, ViewCtx } from "../src/types";

const SPLITTER = "\x1e";

function createTestFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

function cleanupFrame(frame: FrameObj): void {
  const el = document.getElementById(frame.id);
  if (el) el.remove();
  (Frame.getAll() as Map<string, FrameObj>).delete(frame.id);
}

function mountCounting(
  id: string,
  render: () => string,
): { frame: FrameObj; ctx: ViewCtx; renders: () => number } {
  const frame = createTestFrame(id);
  let count = 0;
  const setup = defineView(() => ({
    template: () => {
      count++;
      return render();
    },
  }));
  const ctx = mountCtx(frame, setup);
  return { frame, ctx, renders: () => count };
}

describe("reactive render pipeline", () => {
  describe("signal-driven rendering", () => {
    it("writes outside batch re-render once per write, synchronously", () => {
      const s = signal(0);
      const { frame, ctx, renders } = mountCounting("vr-1", () => `<i>${s.value}</i>`);
      expect(renders()).toBe(1);

      s.value = 1;
      s.value = 2;
      expect(renders()).toBe(3);
      expect(document.getElementById("vr-1")!.innerHTML).toContain("2");

      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("batch() coalesces multiple writes into one render pass", () => {
      const a = signal(0);
      const b = signal(0);
      const { frame, ctx, renders } = mountCounting("vr-2", () => `<i>${a.value + b.value}</i>`);
      expect(renders()).toBe(1);

      batch(() => {
        a.value = 1;
        b.value = 2;
      });
      expect(renders()).toBe(2);
      expect(document.getElementById("vr-2")!.innerHTML).toContain("3");

      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("same-value writes do not re-render (shallow reference comparison)", () => {
      const obj = { n: 1 };
      const s = signal(obj);
      const { frame, ctx, renders } = mountCounting("vr-3", () => `<i>${s.value.n}</i>`);
      expect(renders()).toBe(1);

      obj.n = 2; // in-place mutation — NOT reactive
      s.value = obj; // same reference — no notification
      expect(renders()).toBe(1);

      s.value = { n: 3 }; // new reference → re-render
      expect(renders()).toBe(2);

      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("unread signals do not subscribe the view", () => {
      const read = signal(0);
      const unread = signal(0);
      const { frame, ctx, renders } = mountCounting("vr-4", () => `<i>${read.value}</i>`);

      unread.value = 42;
      expect(renders()).toBe(1);
      read.value = 1;
      expect(renders()).toBe(2);

      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("computed chains re-render the view when their roots change", () => {
      const base = signal(2);
      const doubled = computed(() => base.value * 2);
      const { frame, ctx } = mountCounting("vr-5", () => `<i>${doubled.value}</i>`);
      expect(document.getElementById("vr-5")!.innerHTML).toContain("4");

      base.value = 5;
      expect(document.getElementById("vr-5")!.innerHTML).toContain("10");

      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("dependencies re-track every pass — branch switches update subscriptions", () => {
      const flag = signal(true);
      const a = signal("A");
      const b = signal("B");
      const { frame, ctx, renders } = mountCounting("vr-6", () =>
        flag.value ? `<i>${a.value}</i>` : `<i>${b.value}</i>`,
      );
      expect(renders()).toBe(1);

      b.value = "B2"; // not read on the flag=true branch
      expect(renders()).toBe(1);

      flag.value = false;
      expect(renders()).toBe(2);

      a.value = "A2"; // no longer read
      expect(renders()).toBe(2);
      b.value = "B3";
      expect(renders()).toBe(3);

      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("render errors", () => {
    afterEach(() => {
      setFrameworkErrorSink(undefined);
    });

    it("template errors route to the framework error sink instead of throwing at the write site", () => {
      const onError = vi.fn();
      setFrameworkErrorSink(onError); // what Framework.boot wires to config.error

      const s = signal(0);
      const frame = createTestFrame("vr-err");
      const setup = defineView(() => ({
        template: () => {
          if (s.value > 0) throw new Error("boom");
          return "<i>ok</i>";
        },
      }));
      const ctx = mountCtx(frame, setup);

      expect(() => {
        s.value = 1; // triggers the failing render pass
      }).not.toThrow();
      expect(onError).toHaveBeenCalledTimes(1);

      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("refData / translate", () => {
    it("ctx starts with the refFn counter key initialized", () => {
      const frame = createTestFrame("vr-ref-1");
      const ctx = createCtx(frame);
      expect(ctx.refData[SPLITTER]).toBe(1);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("translate resolves SPLITTER+digits ref tokens", () => {
      const frame = createTestFrame("vr-ref-2");
      const ctx = createCtx(frame);
      const target = { hello: "world" };
      ctx.refData[`${SPLITTER}9`] = target;
      expect(ctx.translate(`${SPLITTER}9`)).toBe(target);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("translate passes non-token values through", () => {
      const frame = createTestFrame("vr-ref-3");
      const ctx = createCtx(frame);
      expect(ctx.translate("normalString")).toBe("normalString");
      expect(ctx.translate(123)).toBe(123);
      // not all-digits after SPLITTER → not a ref, returned as-is
      expect(ctx.translate(`${SPLITTER}user-input`)).toBe(`${SPLITTER}user-input`);
      expect(ctx.translate(SPLITTER)).toBe(SPLITTER);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });
});
