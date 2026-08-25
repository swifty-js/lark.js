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

import { render, unmount, raw, signal, nextTick, useSignal, type Signal } from "@lark.js/larky";
import { createContainer, stripAnchors } from "./helpers";

describe("reconciler", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  afterEach(() => {
    unmount(container);
    container.remove();
  });

  it("keyed reorder preserves component instances (hook state)", async () => {
    const bumpMap = new Map<string, () => void>();
    function Item(props: { id: string }) {
      const clicks = useSignal(0);
      bumpMap.set(props.id, () => clicks.value++);
      return (
        <li>
          {props.id}:{clicks.value}
        </li>
      );
    }

    let order!: Signal<string[]>;
    function App() {
      order = useSignal(["a", "b"]);
      return (
        <ul>
          {order.value.map((id) => (
            <Item key={id} id={id} />
          ))}
        </ul>
      );
    }
    render(<App />, container);
    bumpMap.get("a")!();
    await nextTick();
    expect(stripAnchors(container.innerHTML)).toBe("<ul><li>a:1</li><li>b:0</li></ul>");

    order.value = ["b", "a"]; // reorder — instance (and its count) must move
    await nextTick();
    expect(stripAnchors(container.innerHTML)).toBe("<ul><li>b:0</li><li>a:1</li></ul>");
  });

  it("renders raw() html blocks and signal children", async () => {
    const html = signal("<b>bold</b>");
    const text = signal("t1");
    render(
      <div>
        {raw(html.value)}
        <span>{text}</span>
      </div>,
      container,
    );
    expect(stripAnchors(container.innerHTML)).toBe("<div><b>bold</b><span>t1</span></div>");

    text.value = "t2"; // signal child — tracked by the root effect
    await nextTick();
    expect(container.querySelector("span")!.textContent).toBe("t2");
  });

  it("strings are text — markup is escaped unless raw() is used", () => {
    render(<div>{"<img src=x onerror=alert(1)>"}</div>, container);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("div")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("normalizes class arrays/objects and style objects (camelCase → kebab)", () => {
    render(
      <div
        class={["a", false, ["b"], { c: true, d: false }]}
        style={{ backgroundColor: "red", "--x": 1, marginTop: null }}
      />,
      container,
    );
    const el = container.querySelector("div")!;
    expect(el.getAttribute("class")).toBe("a b c");
    expect(el.getAttribute("style")).toBe("background-color:red;--x:1");
  });

  it("merges class and className", () => {
    render(<div class="a" className="b" />, container);
    expect(container.querySelector("div")!.getAttribute("class")).toBe("a b");
  });

  it("signal-valued attributes update in place", async () => {
    const cls = signal("on");
    render(<p class={cls} />, container);
    const el = container.querySelector("p")!;
    expect(el.getAttribute("class")).toBe("on");
    cls.value = "off";
    await nextTick();
    expect(el.getAttribute("class")).toBe("off");
  });

  it('boolean attributes: true → "", false → removed, enumerated serialize', () => {
    render(<input disabled={true} draggable={false} aria-hidden={false} />, container);
    const el = container.querySelector("input")!;
    expect(el.getAttribute("disabled")).toBe("");
    expect(el.getAttribute("draggable")).toBe("false");
    expect(el.getAttribute("aria-hidden")).toBe("false");
  });

  it("form value syncs as a DOM property and re-syncs after user drift", async () => {
    let text!: Signal<string>;
    function Input() {
      text = useSignal("a");
      return (
        <input
          value={text.value}
          onInput={(e) => (text.value = (e.currentTarget as HTMLInputElement).value)}
        />
      );
    }
    render(<Input />, container);
    const el = container.querySelector("input")!;
    expect(el.value).toBe("a");

    el.value = "ab"; // user typing drift
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(text.value).toBe("ab");
    expect(el.value).toBe("ab");
  });

  it("swaps event handlers per render without stale closures", async () => {
    const calls: number[] = [];
    let gen!: Signal<number>;
    function App() {
      gen = useSignal(0);
      const g = gen.value;
      return <button onClick={() => calls.push(g)}>go</button>;
    }
    render(<App />, container);
    const button = container.querySelector("button")!;
    button.click();
    gen.value = 1;
    await nextTick();
    button.click();
    expect(calls).toEqual([0, 1]);
  });

  it("conditional rendering adds/removes ranges", async () => {
    let show!: Signal<boolean>;
    function App() {
      show = useSignal(false);
      return <div>{show.value && <span>shown</span>}</div>;
    }
    render(<App />, container);
    expect(container.querySelector("span")).toBeNull();
    show.value = true;
    await nextTick();
    expect(container.querySelector("span")!.textContent).toBe("shown");
    show.value = false;
    await nextTick();
    expect(container.querySelector("span")).toBeNull();
  });

  it("renders SVG with the correct namespace", () => {
    render(
      <svg viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" />
      </svg>,
      container,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.querySelector("circle")!.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  it("re-render via render() commits synchronously", () => {
    render(<p>one</p>, container);
    render(<p>two</p>, container);
    expect(stripAnchors(container.innerHTML)).toBe("<p>two</p>");
  });
});
