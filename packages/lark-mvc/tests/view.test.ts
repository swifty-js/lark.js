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
import { defineView, createCtx, mountCtx, unmountCtx } from "../src/view";
import { signal } from "../src/reactive";
import { Frame, createFrame } from "../src/frame";
import { isLarkView } from "../src/jsx/vnode";
import type { AnyFunc, FrameObj, ViewCtx, ViewSetup } from "../src/types";

/**
 * Creates Frame with DOM for testing
 */
function createTestFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

/**
 * Cleans up test Frame
 */
function cleanupFrame(frame: FrameObj): void {
  const el = document.getElementById(frame.id);
  if (el) el.remove();
  (Frame.getAll() as Map<string, FrameObj>).delete(frame.id);
}

describe("View (functional)", () => {
  describe("defineView", () => {
    it("returns a branded component carrying the setup", () => {
      const setup: ViewSetup = () => ({ template: () => "" });
      const result = defineView(setup);
      expect(result.setup).toBe(setup);
      expect(isLarkView(result)).toBe(true);
      expect(typeof result).toBe("function");
    });

    it("setup function receives ctx and returns descriptor", () => {
      const frame = createTestFrame("test-frame-1");
      const templateFn = () => "hello";
      let receivedCtx: ViewCtx | undefined;

      const setup = defineView((ctx) => {
        receivedCtx = ctx;
        return { template: templateFn };
      });

      const ctx = mountCtx(frame, setup);
      expect(receivedCtx).toBe(ctx);
      expect(ctx.id).toBe("test-frame-1");
      expect(ctx.owner).toBe(frame);
      expect(ctx.refData).toBeDefined();
      expect(typeof ctx.translate).toBe("function");
      expect(ctx.signals).toBeInstanceOf(Map);
      expect(typeof ctx.render).toBe("function");
      expect(ctx.getTemplate()).toBe(templateFn);

      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("getEvents starts undefined — handlers are wired by the JSX layer only", () => {
      const frame = createTestFrame("test-frame-2");
      const setup = defineView(() => ({ template: () => "" }));

      const ctx = mountCtx(frame, setup);
      expect(ctx.getEvents()).toBeUndefined();

      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("on / off / fire", () => {
    it("binds and triggers events", () => {
      const frame = createTestFrame("evt-frame-1");
      const ctx = createCtx(frame);
      const handler = vi.fn();

      ctx.on("testEvent", handler);
      ctx.fire("testEvent", { data: 1 });

      expect(handler).toHaveBeenCalledTimes(1);

      ctx.off("testEvent", handler);
      ctx.fire("testEvent", { data: 2 });

      expect(handler).toHaveBeenCalledTimes(1);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("wrapAsync", () => {
    it("executes callback when current signature is valid", () => {
      const frame = createTestFrame("wa-frame-1");
      const ctx = createCtx(frame);
      ctx.signature.value = 1;

      const callback = vi.fn();
      const wrapped = ctx.wrapAsync(callback);

      wrapped();
      expect(callback).toHaveBeenCalledTimes(1);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("does not execute callback after signature change", () => {
      const frame = createTestFrame("wa-frame-2");
      const ctx = createCtx(frame);
      ctx.signature.value = 1;

      const callback = vi.fn();
      const wrapped = ctx.wrapAsync(callback);

      ctx.signature.value = 2;
      wrapped();
      expect(callback).not.toHaveBeenCalled();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("does not execute callback when signature is 0", () => {
      const frame = createTestFrame("wa-frame-3");
      const ctx = createCtx(frame);
      ctx.signature.value = 1;

      const callback = vi.fn();
      const wrapped = ctx.wrapAsync(callback);

      ctx.signature.value = 0;
      wrapped();
      expect(callback).not.toHaveBeenCalled();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("reactive rendering", () => {
    it("signal writes re-render the template synchronously", () => {
      const frame = createTestFrame("rr-frame-1");
      const count = signal(0);
      const setup = defineView(() => ({
        template: () => `<span>n=${count.value}</span>`,
      }));

      const ctx = mountCtx(frame, setup);
      const el = document.getElementById("rr-frame-1")!;
      expect(el.innerHTML).toContain("n=0");

      count.value = 5;
      expect(el.innerHTML).toContain("n=5");

      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("ctx.render() forces a re-render through the effect", () => {
      const frame = createTestFrame("rr-frame-2");
      let external = "a";
      const setup = defineView(() => ({
        template: () => `<span>${external}</span>`,
      }));

      const ctx = mountCtx(frame, setup);
      const el = document.getElementById("rr-frame-2")!;
      expect(el.innerHTML).toContain("a");

      external = "b";
      ctx.render();
      expect(el.innerHTML).toContain("b");

      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("unmount disposes the render effect — later writes do not render", () => {
      const frame = createTestFrame("rr-frame-3");
      const count = signal(0);
      let renders = 0;
      const setup = defineView(() => ({
        template: () => {
          renders++;
          return `<span>${count.value}</span>`;
        },
      }));

      const ctx = mountCtx(frame, setup);
      expect(renders).toBe(1);

      unmountCtx(ctx);
      count.value = 99;
      expect(renders).toBe(1);
      cleanupFrame(frame);
    });

    it("each render pass bumps signature and fires 'render'", () => {
      const frame = createTestFrame("rr-frame-4");
      const count = signal(0);
      const setup = defineView(() => ({
        template: () => `<span>${count.value}</span>`,
      }));

      const ctx = mountCtx(frame, setup);
      const sigAfterMount = ctx.signature.value;
      const onRender = vi.fn();
      ctx.on("render", onRender);

      count.value = 1;
      expect(ctx.signature.value).toBe(sigAfterMount + 1);
      expect(onRender).toHaveBeenCalledTimes(1);

      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("capture / release", () => {
    it("capture registers resource", () => {
      const frame = createTestFrame("cr-frame-1");
      const ctx = createCtx(frame);
      const resource = { destroy: vi.fn() };

      ctx.capture("test1", resource, true);

      expect(ctx.resources["test1"]).toEqual({
        entity: resource,
        destroyOnRender: true,
      });
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("capture returns existing entity when no resource provided", () => {
      const frame = createTestFrame("cr-frame-2");
      const ctx = createCtx(frame);
      const resource = { id: 1 };

      ctx.capture("test1", resource, true);
      const result = ctx.capture("test1");

      expect(result).toBe(resource);
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("release destroys resource", () => {
      const frame = createTestFrame("cr-frame-3");
      const ctx = createCtx(frame);
      const resource = { destroy: vi.fn() };

      ctx.capture("test1", resource, true);
      ctx.release("test1", true);

      expect(resource.destroy).toHaveBeenCalled();
      expect(ctx.resources["test1"]).toBeUndefined();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });

    it("release does not call destroy", () => {
      const frame = createTestFrame("cr-frame-4");
      const ctx = createCtx(frame);
      const resource = { destroy: vi.fn() };

      ctx.capture("test1", resource, true);
      ctx.release("test1", false);

      expect(resource.destroy).not.toHaveBeenCalled();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });

  describe("defineView (D1)", () => {
    it("returns a setup function", () => {
      const setup = defineView((ctx) => {
        void ctx;
        return { template: () => "hello" };
      });
      expect(typeof setup).toBe("function");
    });

    it("mountCtx runs setup and exposes template via ctx", () => {
      const frame = createTestFrame("define-view-1");
      const setup = defineView(() => ({
        template: () => "count=5",
      }));
      const ctx = mountCtx(frame, setup);
      expect(typeof ctx.getTemplate).toBe("function");
      expect(ctx.getTemplate()).toBeDefined();
      unmountCtx(ctx);
      cleanupFrame(frame);
    });
  });
});

// Keep type references for compile-time validation
export type { AnyFunc };
