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
  signal,
  effect,
  nextTick,
  flushSync,
  untracked,
  useSignal,
  type Signal,
} from "@lark.js/larky";
import { createContainer } from "./helpers";

describe("scheduling (automatic batching)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  afterEach(() => {
    unmount(container);
    container.remove();
  });

  it("multiple writes in one handler produce exactly one re-render", async () => {
    let renders = 0;
    let a!: Signal<number>;
    let b!: Signal<number>;
    function App() {
      renders++;
      a = useSignal(0);
      b = useSignal(0);
      return (
        <p>
          {a.value}-{b.value}
        </p>
      );
    }
    render(<App />, container);
    expect(renders).toBe(1);

    a.value = 1;
    a.value = 2;
    b.value = 1;
    expect(renders).toBe(1); // nothing synchronous
    await nextTick();
    expect(renders).toBe(2); // ONE batched re-render
    expect(container.querySelector("p")!.textContent).toBe("2-1");
  });

  it("flushSync commits pending renders synchronously", () => {
    let count!: Signal<number>;
    function App() {
      count = useSignal(0);
      return <p>{count.value}</p>;
    }
    render(<App />, container);
    flushSync(() => {
      count.value = 7;
    });
    expect(container.querySelector("p")!.textContent).toBe("7");
  });

  it("nextTick resolves immediately when nothing is pending", async () => {
    await expect(nextTick()).resolves.toBeUndefined();
  });

  it("standalone effect(): tracked, batched, disposable", async () => {
    const s = signal(0);
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(s.value);
    });
    expect(seen).toEqual([0]);

    s.value = 1;
    s.value = 2;
    await nextTick();
    expect(seen).toEqual([0, 2]); // intermediate value coalesced

    dispose();
    s.value = 3;
    await nextTick();
    expect(seen).toEqual([0, 2]);
  });

  it("untracked() reads do not subscribe", async () => {
    const dep = signal(0);
    const runs: number[] = [];
    effect(() => {
      runs.push(untracked(() => dep.value));
    });
    dep.value = 1;
    await nextTick();
    expect(runs).toEqual([0]); // never re-ran
  });

  it("cross-effect write cycles throw Cycle detected", async () => {
    const a = signal(0);
    const b = signal(0);
    const disposeA = effect(() => {
      b.value = a.value + 1;
    });
    const disposeB = effect(() => {
      a.value = b.value + 1;
    });
    await expect(nextTick()).rejects.toThrow(/Cycle detected/);
    disposeA();
    disposeB();
    // The queue must stay usable after a throwing flush.
    const c = signal(0);
    const seen: number[] = [];
    const disposeC = effect(() => {
      seen.push(c.value);
    });
    c.value = 1;
    await nextTick();
    expect(seen).toEqual([0, 1]);
    disposeC();
  });

  it("parent and child updates in one tick render each instance once", async () => {
    const renders = { parent: 0, child: 0 };
    let flag!: Signal<number>;
    function Child(props: { n: number }) {
      renders.child++;
      return <i>{props.n}</i>;
    }
    function Parent() {
      renders.parent++;
      flag = useSignal(0);
      return (
        <div>
          <Child n={flag.value} />
        </div>
      );
    }
    render(<Parent />, container);
    expect(renders).toEqual({ parent: 1, child: 1 });

    flag.value = 1; // parent re-renders, pushes new prop → child re-renders
    await nextTick();
    expect(renders).toEqual({ parent: 2, child: 2 });
    expect(container.querySelector("i")!.textContent).toBe("1");
  });
});
