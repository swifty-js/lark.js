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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { State } from "../src/state";
import { effect } from "../src/reactive";

describe("State", () => {
  beforeEach(() => {
    // Clean up State residual event listeners to prevent cross-test pollution
    // State uses module-level singleton emitter internally, off() without handler deletes entire list
    State.off("changed");
    State.off("change");
    State.off("customEvent");
  });

  it("get / set - retrieves and sets data by key", () => {
    const testValue2 = { a: 1 };

    State.set({ testValue1: "abcde" });
    State.set({ testValue2 });

    expect(State.get("testValue1")).toBe("abcde");
    expect(State.get("testValue2")).toEqual(testValue2);
  });

  it("get - returns all data without parameters", () => {
    State.set({ allTestKey: "allTestValue" });

    const result = State.get<Record<string, unknown>>();
    expect(result["allTestKey"]).toBe("allTestValue");
  });

  it("set - returns State for method chaining", () => {
    const result = State.set({ chainTest: 1 });
    expect(result).toBe(State);
  });

  it("get(key) is a tracked read — effects re-run when the key changes", () => {
    const seen: unknown[] = [];
    State.set({ reactiveKey: 1 });
    const dispose = effect(() => {
      seen.push(State.get("reactiveKey"));
    });

    State.set({ reactiveKey: 2 });
    expect(seen).toEqual([1, 2]);

    // Writing an UNRELATED key does not re-run the reader
    State.set({ otherKey: "x" });
    expect(seen).toEqual([1, 2]);

    dispose();
    State.set({ reactiveKey: 3 });
    expect(seen).toEqual([1, 2]);
  });

  it("set() batches — multi-key writes notify a multi-key reader once", () => {
    State.set({ batchA: 0, batchB: 0 });
    let runs = 0;
    const dispose = effect(() => {
      State.get("batchA");
      State.get("batchB");
      runs++;
    });
    expect(runs).toBe(1);

    State.set({ batchA: 1, batchB: 2 });
    expect(runs).toBe(2);
    dispose();
  });

  it("same-value writes do not notify (shallow reference comparison)", () => {
    const obj = { n: 1 };
    State.set({ shallowKey: obj });
    let runs = 0;
    const dispose = effect(() => {
      State.get("shallowKey");
      runs++;
    });
    expect(runs).toBe(1);

    obj.n = 2; // in-place mutation is invisible
    State.set({ shallowKey: obj }); // same reference → no notification
    expect(runs).toBe(1);

    State.set({ shallowKey: { n: 3 } }); // new reference → notify
    expect(runs).toBe(2);
    dispose();
  });

  it("whole-object get() subscribes to every State change", () => {
    let runs = 0;
    const dispose = effect(() => {
      State.get();
      runs++;
    });
    expect(runs).toBe(1);

    State.set({ anyKeyAtAll: Math.random() + 1 });
    expect(runs).toBe(2);
    dispose();
  });

  it("on / off / fire - event delegation", () => {
    const handler = vi.fn();

    State.on("customEvent", handler);
    State.fire("customEvent", { payload: 1 });

    expect(handler).toHaveBeenCalledTimes(1);

    State.off("customEvent", handler);
    State.fire("customEvent", { payload: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clean - returns a dispose function", () => {
    const dispose = State.clean("cleanTest1,cleanTest2");

    expect(typeof dispose).toBe("function");
    dispose();
  });

  it("clean - dispose drops the key data when last observer leaves", () => {
    State.set({ refCounted: "alive" });
    const dispose = State.clean("refCounted");
    expect(State.get("refCounted")).toBe("alive");

    dispose();
    expect(State.get("refCounted")).toBeUndefined();
  });

  it("clean - ref-counted across multiple observers", () => {
    State.set({ shared: "kept" });
    const first = State.clean("shared");
    const second = State.clean("shared");

    first();
    expect(State.get("shared")).toBe("kept"); // second observer still holds it

    second();
    expect(State.get("shared")).toBeUndefined();
  });
});
