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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hotSwapView, hotSwapByView } from "../src/hmr";
import { injectViewHmrSnippet, isLarkViewSource } from "../src/hmr-inject";
import { defineView } from "../src/view";
import { Frame, createFrame, registerViewClass, invalidateViewClass } from "../src/frame";
import { getViewClassRegistry } from "../src/view-registry";
import type { FrameObj } from "../src/types";

/** Simple template factory for testing. */
function makeTemplate(label: string): (data: unknown) => string {
  return (data: unknown) => {
    const d = (data || {}) as Record<string, unknown>;
    return `<div class="${label}">count=${d["count"] ?? 0}</div>`;
  };
}

/** Flush microtasks so deferred renders complete. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createTestFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

function cleanupFrame(frame: FrameObj): void {
  const el = document.getElementById(frame.id);
  if (el) el.remove();
  Frame.getAll().delete(frame.id);
}

describe("HMR", () => {
  beforeEach(() => {
    const reg = getViewClassRegistry();
    for (const key of Object.keys(reg)) invalidateViewClass(key);
  });

  afterEach(() => {
    for (const [id] of Frame.getAll()) {
      const el = document.getElementById(id);
      if (el) el.remove();
      Frame.getAll().delete(id);
    }
  });

  // ============================================================
  // hotSwapView
  // ============================================================
  describe("hotSwapView", () => {
    it("preserves updater.data across hot-swap", async () => {
      const frame = createTestFrame("hot-swap-preserve");
      const OldView = defineView(() => ({ template: makeTemplate("old") }));
      registerViewClass("test/preserve", OldView);
      frame.mountView("test/preserve");
      await flushMicrotasks();

      frame.view!.updater.set({ count: 42 }).digest();
      const NewView = defineView(() => ({ template: makeTemplate("new") }));
      const viewBefore = frame.view;

      hotSwapView(frame, NewView);

      expect(frame.view!.updater.get<number>("count")).toBe(42);
      expect(frame.view).toBe(viewBefore);
      expect(document.getElementById("hot-swap-preserve")!.querySelector(".new")).not.toBeNull();
      cleanupFrame(frame);
    });

    it("falls back to mountView when frame has no existing view", () => {
      const frame = createTestFrame("hot-swap-fallback");
      vi.spyOn(frame, "getViewPath").mockReturnValue("test/fallback");
      const NewView = defineView(() => ({ template: makeTemplate("fb") }));
      registerViewClass("test/fallback", NewView);

      const spy = vi.spyOn(frame, "mountView");
      hotSwapView(frame, NewView);

      expect(spy).toHaveBeenCalledWith("test/fallback");
      spy.mockRestore();
      cleanupFrame(frame);
    });
  });

  // ============================================================
  // hotSwapByView
  // ============================================================
  describe("hotSwapByView", () => {
    it("swaps and updates registry for matching class", async () => {
      const OldView = defineView(() => ({ template: makeTemplate("old") }));
      registerViewClass("test/swap", OldView);
      const frame = createTestFrame("swap");
      frame.mountView("test/swap");
      await flushMicrotasks();
      frame.view!.updater.set({ count: 33 }).digest();

      const NewView = defineView(() => ({ template: makeTemplate("new") }));
      hotSwapByView(OldView, NewView);

      expect(frame.view!.updater.get<number>("count")).toBe(33);
      expect(getViewClassRegistry()["test/swap"]).toBe(NewView.setup);
      cleanupFrame(frame);
    });

    it("does nothing when oldClass === newClass", async () => {
      const V = defineView((ctx) => {
        ctx.updater.set({ count: 1 });
        return { template: makeTemplate("same") };
      });
      registerViewClass("test/same-class", V);
      const frame = createTestFrame("same-class");
      frame.mountView("test/same-class");
      await flushMicrotasks();

      hotSwapByView(V, V);
      expect(frame.view!.updater.get<number>("count")).toBe(1);
      cleanupFrame(frame);
    });
  });

  // ============================================================
  // hmr-inject — snippet generation
  // ============================================================
  describe("hmr-inject", () => {
    it("detects view module sources via defineView", () => {
      expect(isLarkViewSource("export default defineView(() => ({}));")).toBe(true);
      expect(isLarkViewSource('import { x } from "./y";\nconst a = 1;')).toBe(false);
    });

    it("wraps export default and injects view HMR for a defineView module", () => {
      const src = `import { defineView } from "@lark.js/mvc";\nexport default defineView(() => ({}));`;
      const result = injectViewHmrSnippet(src, "vite");
      expect(result).toContain("const __lark_view__ =");
      expect(result).toContain("import.meta.hot");
      expect(result).toContain("hotSwapByView");
    });

    it("injects view HMR into TSX view sources", () => {
      const src = [
        `import { defineView, jsxTemplate } from "@lark.js/mvc";`,
        `const template = jsxTemplate(() => <div class="x">hi</div>);`,
        `export default defineView(() => ({ template }));`,
      ].join("\n");
      const result = injectViewHmrSnippet(src, "vite");
      expect(result).toContain("const __lark_view__ = defineView(() => ({ template }))");
      expect(result).toContain("hotSwapByView");
    });

    it("returns source unchanged when there is no defineView call", () => {
      const src = "export default { not: 'a view' };";
      expect(injectViewHmrSnippet(src, "vite")).toBe(src);
    });

    it("returns source unchanged when there is no export default", () => {
      const src = "export const v = defineView(() => ({}));";
      expect(injectViewHmrSnippet(src, "vite")).toBe(src);
    });

    it("uses import.meta.webpackHot for webpack and rspack", () => {
      const src = "export default defineView(() => ({}));";
      const webpack = injectViewHmrSnippet(src, "webpack");
      expect(webpack).toContain("import.meta.webpackHot");
      expect(webpack).not.toContain("import.meta.hot.accept");
      const rspack = injectViewHmrSnippet(src, "rspack");
      expect(rspack).toContain("import.meta.webpackHot");
    });

    it("keeps `as`-cast default exports syntactically intact", () => {
      const src = "export default defineView(() => ({})) as unknown;";
      const result = injectViewHmrSnippet(src, "vite");
      expect(result).toContain("const __lark_view__ = defineView(() => ({})) as unknown;");
      expect(result).toContain("export default __lark_view__;");
      expect(result).not.toMatch(/__lark_view__;\s*as /);
    });

    it("injects despite apostrophes in JSX text", () => {
      const src = [
        `const template = jsxTemplate(() => <p>It's here — don't worry</p>);`,
        `export default defineView(() => ({ template }));`,
      ].join("\n");
      const result = injectViewHmrSnippet(src, "vite");
      expect(result).toContain("const __lark_view__ = defineView(() => ({ template }));");
      expect(result).toContain("hotSwapByView");
    });

    it("is idempotent — re-running the transform is a no-op", () => {
      const src = "export default defineView(() => ({}));";
      const once = injectViewHmrSnippet(src, "vite");
      expect(injectViewHmrSnippet(once, "vite")).toBe(once);
    });

    it("skips export default inside comments", () => {
      const src = ["// export default defineView(old);", "const v = defineView(() => ({}));"].join(
        "\n",
      );
      expect(injectViewHmrSnippet(src, "vite")).toBe(src);
    });
  });
});
