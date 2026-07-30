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

import { describe, it, expect } from "vitest";
import { createStore, computed } from "../src/store";
import type { StoreApi } from "../src/store";

interface CountState {
  count: number;
  doubled: number;
  countPlusTen: number;
  increment: () => void;
}

let storeCounter = 0;
function nextName(): string {
  return `computed-test-${++storeCounter}`;
}

function makeCountStore(name: string): StoreApi<CountState> {
  return createStore<CountState>(name, (set, get) => ({
    count: 1,
    doubled: computed(["count"], () => get().count * 2),
    countPlusTen: computed(["count"], () => get().count + 10),
    increment() {
      set({ count: get().count + 1 });
    },
  }));
}

describe("createStore - computed", () => {
  it("computes an initial value from its deps", () => {
    const store = makeCountStore(nextName());
    const state = store.getState();
    expect(state.count).toBe(1);
    expect(state.doubled).toBe(2);
    expect(state.countPlusTen).toBe(11);
    store.destroy();
  });

  it("recomputes when a dep changes via setState", () => {
    const store = makeCountStore(nextName());
    store.setState({ count: 5 });
    expect(store.getState().doubled).toBe(10);
    expect(store.getState().countPlusTen).toBe(15);
    store.destroy();
  });

  it("recomputes when a dep changes via action", () => {
    const store = makeCountStore(nextName());
    store.getState().increment();
    expect(store.getState().count).toBe(2);
    expect(store.getState().doubled).toBe(4);
    expect(store.getState().countPlusTen).toBe(12);
    store.destroy();
  });

  it("writes to a computed key via setState are ignored", () => {
    const store = makeCountStore(nextName());
    store.setState({ doubled: 999 } as Partial<CountState>);
    expect(store.getState().doubled).toBe(2);
    store.destroy();
  });

  it("multiple computeds with the same dep all update together", () => {
    const store = makeCountStore(nextName());
    store.getState().increment();
    store.getState().increment();
    expect(store.getState().count).toBe(3);
    expect(store.getState().doubled).toBe(6);
    expect(store.getState().countPlusTen).toBe(13);
    store.destroy();
  });

  it("standalone computed() factory returns a marker object", () => {
    const marker = computed(["x"], () => 42);
    expect(typeof marker).toBe("object");
  });
});
