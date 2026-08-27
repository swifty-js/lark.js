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

import { createStore } from "@lark.js/mvc";
import { EventType } from "@swifty.js/sentry";
import type { IReportData, ReportDataHook } from "@swifty.js/sentry";
import { describe, expect, it } from "vitest";
import { createStoreStateHook } from "../src/store-state.js";

function makeReport(type: EventType): IReportData {
  return { type, payload: { existing: true } } as unknown as IReportData;
}

function storeStateOf(result: IReportData | false): Record<string, unknown> {
  return (result as IReportData & { payload: { storeState: Record<string, unknown> } }).payload
    .storeState;
}

describe("createStoreStateHook", () => {
  it("attaches snapshots of getState sources and selector sources under payload.storeState", async () => {
    const cart = createStore(() => ({ items: ["a", "b"], total: 42 }));
    const hook = createStoreStateHook({
      cart,
      user: () => ({ id: "u1" }),
    });

    const result = await hook(makeReport(EventType.Error));

    expect(result).toEqual(
      expect.objectContaining({
        type: EventType.Error,
        payload: expect.objectContaining({
          existing: true, // original payload fields preserved
          storeState: {
            cart: { items: ["a", "b"], total: 42 },
            user: { id: "u1" },
          },
        }),
      }),
    );
  });

  it("attaches for every error-class type and skips everything else", async () => {
    const hook = createStoreStateHook({ s: () => 1 });

    for (const type of [
      EventType.Error,
      EventType.UnhandledRejection,
      EventType.Resource,
      EventType.Vue,
      EventType.React,
      EventType.OtherFrameworks,
    ]) {
      const result = await hook(makeReport(type));
      expect(storeStateOf(result)).toEqual({ s: 1 });
    }

    for (const type of [EventType.Click, EventType.PV, EventType.Performance, EventType.Custom]) {
      const report = makeReport(type);
      const result = await hook(report);
      expect(result).toBe(report); // untouched, same reference
    }
  });

  it("runs the user hook FIRST and attaches based on its transform", async () => {
    const next: ReportDataHook = (data) => ({ ...data, type: EventType.Error });
    const hook = createStoreStateHook({ s: () => "x" }, next);

    // Click would be skipped, but the user hook reclassifies it as Error.
    const result = await hook(makeReport(EventType.Click));

    expect(result).toEqual(expect.objectContaining({ type: EventType.Error }));
    expect(storeStateOf(result)).toEqual({ s: "x" });
  });

  it("honors a user hook dropping the event (false) — sync and async", async () => {
    const syncHook = createStoreStateHook({ s: () => 1 }, () => false);
    await expect(syncHook(makeReport(EventType.Error))).resolves.toBe(false);

    const asyncHook = createStoreStateHook({ s: () => 1 }, async () => false as const);
    await expect(asyncHook(makeReport(EventType.Error))).resolves.toBe(false);
  });

  it("drops store actions (functions) from snapshots via the JSON round-trip", async () => {
    interface CounterStore {
      count: number;
      increment: () => void;
    }
    const store = createStore<CounterStore>((set, get) => ({
      count: 1,
      increment: () => set({ count: get().count + 1 }),
    }));
    const hook = createStoreStateHook({ store });

    const result = await hook(makeReport(EventType.Error));

    expect(storeStateOf(result)["store"]).toEqual({ count: 1 });
  });

  it("collapses unserializable (circular) state to a marker", async () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const hook = createStoreStateHook({ bad: () => circular, good: () => ({ ok: true }) });

    const result = await hook(makeReport(EventType.Error));

    expect(storeStateOf(result)["bad"]).toEqual({ $unserializable: true });
    expect(storeStateOf(result)["good"]).toEqual({ ok: true });
  });

  it("maps an undefined selector result to null", async () => {
    const hook = createStoreStateHook({ empty: () => undefined });

    const result = await hook(makeReport(EventType.Error));

    expect(storeStateOf(result)["empty"]).toBeNull();
  });
});
