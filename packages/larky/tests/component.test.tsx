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
  useSignal,
  useRef,
  useComputed,
  useSignalEffect,
  useEffect,
  onCleanup,
  type Signal,
} from "@lark.js/larky";
import { createContainer, stripAnchors } from "./helpers";

describe("function components", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  afterEach(() => {
    unmount(container);
    container.remove();
  });

  it("mounts a component and updates state via useSignal (microtask-batched)", async () => {
    function Counter() {
      const count = useSignal(0);
      return <button onClick={() => count.value++}>{count.value}</button>;
    }
    render(<Counter />, container);
    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("0");

    button.click();
    // Writes are batched — the DOM has not changed synchronously.
    expect(button.textContent).toBe("0");
    await nextTick();
    expect(button.textContent).toBe("1");
  });

  it("deep reactivity: mutating an array inside a signal re-renders", async () => {
    let list!: Signal<string[]>;
    function List() {
      list = useSignal<string[]>(["a"]);
      return <p>{list.value.join(",")}</p>;
    }
    render(<List />, container);
    expect(container.querySelector("p")!.textContent).toBe("a");

    list.value.push("b"); // no immutable-update dance needed
    await nextTick();
    expect(container.querySelector("p")!.textContent).toBe("a,b");
  });

  it("useComputed derives lazily and re-renders readers", async () => {
    let count!: Signal<number>;
    function Doubler() {
      count = useSignal(2);
      const doubled = useComputed(() => count.value * 2);
      return <span>{doubled.value}</span>;
    }
    render(<Doubler />, container);
    expect(container.querySelector("span")!.textContent).toBe("4");
    count.value = 5;
    await nextTick();
    expect(container.querySelector("span")!.textContent).toBe("10");
  });

  it("useSignalEffect tracks dependencies and runs cleanup between runs", async () => {
    const log: string[] = [];
    let count!: Signal<number>;
    function Effects() {
      count = useSignal(0);
      useSignalEffect(() => {
        const v = count.value;
        log.push(`run:${v}`);
        return () => log.push(`cleanup:${v}`);
      });
      return <i />;
    }
    render(<Effects />, container);
    expect(log).toEqual(["run:0"]);

    count.value = 1;
    await nextTick();
    expect(log).toEqual(["run:0", "cleanup:0", "run:1"]);

    unmount(container);
    expect(log).toEqual(["run:0", "cleanup:0", "run:1", "cleanup:1"]);
  });

  it("useEffect is mount-only, runs post-commit, cleans up on unmount", async () => {
    const log: string[] = [];
    let count!: Signal<number>;
    function Mounted() {
      count = useSignal(0);
      useEffect(() => {
        log.push(`mounted, dom exists: ${container.querySelector("em") !== null}`);
        return () => log.push("unmounted");
      });
      return <em>{count.value}</em>;
    }
    render(<Mounted />, container);
    expect(log).toEqual(["mounted, dom exists: true"]);

    count.value = 1; // re-render must NOT re-run useEffect
    await nextTick();
    expect(log).toEqual(["mounted, dom exists: true"]);

    unmount(container);
    expect(log).toEqual(["mounted, dom exists: true", "unmounted"]);
  });

  it("onCleanup runs on teardown", () => {
    const log: string[] = [];
    function WithCleanup() {
      onCleanup(() => log.push("cleaned"));
      return <i />;
    }
    render(<WithCleanup />, container);
    expect(log).toEqual([]);
    unmount(container);
    expect(log).toEqual(["cleaned"]);
  });

  it("useRef receives the DOM element and is not reactive", async () => {
    let renders = 0;
    let ref!: { current: HTMLInputElement | null };
    function WithRef() {
      renders++;
      ref = useRef<HTMLInputElement>();
      useEffect(() => {
        ref.current?.focus();
      });
      return <input ref={ref} />;
    }
    render(<WithRef />, container);
    expect(ref.current).toBe(container.querySelector("input"));
    expect(document.activeElement).toBe(ref.current);

    ref.current = null; // plain mutation — no re-render
    await nextTick();
    expect(renders).toBe(1);
  });

  it("props are fine-grained: only readers of a changed key re-render", async () => {
    const renders = { a: 0, b: 0 };
    function A(props: { x: number }) {
      renders.a++;
      return <i>{props.x}</i>;
    }
    function B(props: { y: number }) {
      renders.b++;
      return <b>{props.y}</b>;
    }
    const x = { x: 1, y: 1 };
    render(
      <div>
        <A x={x.x} />
        <B y={x.y} />
      </div>,
      container,
    );
    expect(renders).toEqual({ a: 1, b: 1 });

    render(
      <div>
        <A x={2} />
        <B y={1} />
      </div>,
      container,
    );
    await nextTick();
    expect(renders).toEqual({ a: 2, b: 1 }); // B's prop was identical — no re-render
    expect(stripAnchors(container.innerHTML)).toBe("<div><i>2</i><b>1</b></div>");
  });

  it("children pass through props.children; callbacks are plain props", async () => {
    const picked: string[] = [];
    function Item(props: { id: string; onPick?: (id: string) => void; children?: unknown }) {
      return (
        <li onClick={() => props.onPick?.(props.id)}>{props.children as string | undefined}</li>
      );
    }
    function App() {
      return (
        <ul>
          <Item id="a" onPick={(id) => picked.push(id)}>
            Alpha
          </Item>
        </ul>
      );
    }
    render(<App />, container);
    expect(stripAnchors(container.innerHTML)).toBe("<ul><li>Alpha</li></ul>");
    container.querySelector("li")!.click();
    await nextTick();
    expect(picked).toEqual(["a"]);
  });

  it("component output is hostless — no wrapper element, multi-root supported", () => {
    function Multi() {
      return (
        <>
          <i>1</i>
          <i>2</i>
        </>
      );
    }
    render(
      <div>
        <Multi />
      </div>,
      container,
    );
    expect(stripAnchors(container.innerHTML)).toBe("<div><i>1</i><i>2</i></div>");
  });

  it("unmount() tears down instances and clears the container", () => {
    function App() {
      return <p>hello</p>;
    }
    render(<App />, container);
    expect(container.innerHTML).not.toBe("");
    expect(unmount(container)).toBe(true);
    expect(container.innerHTML).toBe("");
    expect(unmount(container)).toBe(false);
  });
});
