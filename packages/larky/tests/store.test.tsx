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

import { render, unmount, computed, createStore, nextTick } from "@lark.js/larky";
import { createContainer } from "./helpers";

interface CounterState {
  count: number;
  label: string;
  doubled: number;
  increment: () => void;
}

function makeCounterStore() {
  return createStore<CounterState>((set, get) => ({
    count: 0,
    label: "counter",
    doubled: computed(() => get().count * 2),
    increment: () => set({ count: get().count + 1 }),
  }));
}

describe("createStore", () => {
  it("exposes state, actions, and computed slots through getState()", () => {
    const store = makeCounterStore();
    expect(store.getState().count).toBe(0);
    expect(store.getState().doubled).toBe(0);
    store.getState().increment();
    expect(store.getState().count).toBe(1);
    expect(store.getState().doubled).toBe(2);
  });

  it("setState merges partials, supports updaters, skips no-op writes", () => {
    const store = makeCounterStore();
    const seen: Array<[number, number]> = [];
    store.subscribe((state, prev) => seen.push([state.count, (prev as CounterState).count]));

    store.setState({ count: 5 });
    store.setState((prev) => ({ count: prev.count + 1 }));
    store.setState({ count: 6 }); // Object.is no-op — must NOT notify
    expect(seen).toEqual([
      [5, 0],
      [6, 5],
    ]);
  });

  it("replace: true resets missing plain keys to undefined (actions/computed untouched)", () => {
    const store = makeCounterStore();
    store.setState({ count: 3 });
    store.setState({ count: 9 }, true);
    expect(store.getState().count).toBe(9);
    expect(store.getState().label).toBeUndefined();
    expect(typeof store.getState().increment).toBe("function");
    expect(store.getState().doubled).toBe(18);
  });

  it("selector subscriptions fire only when the slice changes", () => {
    const store = makeCounterStore();
    const slices: number[] = [];
    const unsub = store.subscribe(
      (s) => s.count,
      (slice) => slices.push(slice),
    );
    store.setState({ label: "renamed" }); // different key — selector unchanged
    store.setState({ count: 1 });
    store.setState({ count: 2 });
    unsub();
    store.setState({ count: 3 });
    expect(slices).toEqual([1, 2]);
  });

  it("state proxy is read-only (writes must go through setState)", () => {
    const store = makeCounterStore();
    expect(() => {
      (store.getState() as { count: number }).count = 99;
    }).toThrow(/read-only/);
  });

  it("destroy() clears listeners and makes setState a no-op", () => {
    const store = makeCounterStore();
    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.count));
    store.destroy();
    store.setState({ count: 42 });
    expect(seen).toEqual([]);
    expect(store.getState().count).toBe(0);
  });

  it("components subscribe per-key: only readers of a written key re-render", async () => {
    const container = createContainer();
    const store = makeCounterStore();
    const renders = { count: 0, label: 0 };

    function CountView() {
      renders.count++;
      return <i>{store.getState().count}</i>;
    }
    function LabelView() {
      renders.label++;
      return <b>{store.getState().label}</b>;
    }
    render(
      <div>
        <CountView />
        <LabelView />
      </div>,
      container,
    );
    expect(renders).toEqual({ count: 1, label: 1 });

    store.getState().increment();
    await nextTick();
    expect(renders).toEqual({ count: 2, label: 1 }); // LabelView untouched
    expect(container.querySelector("i")!.textContent).toBe("1");

    unmount(container);
    container.remove();
  });

  it("computed slots track their dependencies inside components", async () => {
    const container = createContainer();
    const store = makeCounterStore();

    function Doubled() {
      return <p>{store.getState().doubled}</p>;
    }
    render(<Doubled />, container);
    expect(container.querySelector("p")!.textContent).toBe("0");

    store.setState({ count: 4 });
    await nextTick();
    expect(container.querySelector("p")!.textContent).toBe("8");

    unmount(container);
    container.remove();
  });
});
