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

import {
  render,
  unmount,
  nextTick,
  hotSwapByComponent,
  useSignal,
  onCleanup,
} from "@lark.js/larky";
import { injectComponentHmrSnippet, isLarkyComponentSource } from "../src/hmr-inject";
import { createContainer, stripAnchors } from "./helpers";

describe("hotSwapByComponent", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  afterEach(() => {
    unmount(container);
    container.remove();
  });

  it("swaps live instances in place, preserving useSignal state", async () => {
    function CounterV1() {
      const count = useSignal(0);
      return <button onClick={() => count.value++}>v1:{count.value}</button>;
    }
    function CounterV2() {
      const count = useSignal(0);
      return <button onClick={() => count.value++}>v2:{count.value}</button>;
    }

    render(<CounterV1 />, container);
    const button = container.querySelector("button")!;
    button.click();
    button.click();
    await nextTick();
    expect(button.textContent).toBe("v1:2");

    expect(hotSwapByComponent(CounterV1, CounterV2)).toBe(true);
    await nextTick();
    // New code, OLD state — HMR state preservation.
    expect(container.querySelector("button")!.textContent).toBe("v2:2");
  });

  it("swapped instances keep matching parents that hold the stale reference", async () => {
    function ChildV1() {
      const n = useSignal(1);
      return <i>one:{n.value}</i>;
    }
    function ChildV2() {
      const n = useSignal(1);
      return <i>two:{n.value}</i>;
    }
    function Parent() {
      return (
        <div>
          <ChildV1 />
        </div>
      );
    }
    render(<Parent />, container);
    expect(stripAnchors(container.innerHTML)).toBe("<div><i>one:1</i></div>");

    hotSwapByComponent(ChildV1, ChildV2);
    await nextTick();
    expect(stripAnchors(container.innerHTML)).toBe("<div><i>two:1</i></div>");

    // Parent re-render (stale <ChildV1/> tag) must NOT remount the child —
    // the reconciler canonicalizes through the HMR alias chain.
    render(<Parent />, container);
    await nextTick();
    expect(stripAnchors(container.innerHTML)).toBe("<div><i>two:1</i></div>");
  });

  it("disposes closure-bound slots (onCleanup) on swap", async () => {
    const log: string[] = [];
    function V1() {
      onCleanup(() => log.push("v1-cleanup"));
      return <i>1</i>;
    }
    function V2() {
      onCleanup(() => log.push("v2-cleanup"));
      return <i>2</i>;
    }
    render(<V1 />, container);
    hotSwapByComponent(V1, V2);
    await nextTick();
    expect(log).toEqual(["v1-cleanup"]); // old closure disposed at swap
    unmount(container);
    expect(log).toEqual(["v1-cleanup", "v2-cleanup"]);
  });

  it("no-ops safely for non-functions and functions without instances", () => {
    expect(hotSwapByComponent({}, () => null)).toBe(false);
    expect(hotSwapByComponent(() => null, {})).toBe(false);
    const orphan = () => null;
    expect(hotSwapByComponent(orphan, () => null)).toBe(false);
  });
});

describe("hmr-inject source transform", () => {
  it("detects line-leading default exports only", () => {
    expect(isLarkyComponentSource("export default function App() {}")).toBe(true);
    expect(isLarkyComponentSource("  export default () => null;")).toBe(true);
    expect(isLarkyComponentSource("// export default nope")).toBe(false);
    expect(isLarkyComponentSource("export const x = 1;")).toBe(false);
  });

  it("wraps arrow default exports and appends the vite snippet", () => {
    const out = injectComponentHmrSnippet("export default () => <div/>;\n", "vite");
    expect(out).toContain("const __larky_component__ = () => <div/>;");
    expect(out).toContain("export default __larky_component__;");
    expect(out).toContain("import.meta.hot");
    expect(out).toContain("globalThis.__larky_hmr__");
  });

  it("keeps named function declarations in module scope", () => {
    const src = "export default function App() { return null; }\nApp.displayName = 'App';\n";
    const out = injectComponentHmrSnippet(src, "webpack");
    expect(out).toContain("function App() { return null; }");
    expect(out).toContain("const __larky_component__ = App;");
    expect(out).toContain("import.meta.webpackHot");
  });

  it("is idempotent and passes through non-component modules", () => {
    const once = injectComponentHmrSnippet("export default () => null;", "vite");
    expect(injectComponentHmrSnippet(once, "vite")).toBe(once);
    const plain = "export const a = 1;";
    expect(injectComponentHmrSnippet(plain, "vite")).toBe(plain);
  });
});
