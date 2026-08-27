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

import { untracked } from "@lark.js/mvc";
import { EventType } from "@swifty.js/sentry";
import type { IReportData, ReportDataHook } from "@swifty.js/sentry";

/**
 * A source of state to snapshot: anything with a zustand-style `getState()`
 * (a lark `createStore` store), or a selector function returning the slice
 * to attach (use a selector to trim large stores).
 */
export type StoreStateSource = { getState(): object } | (() => unknown);

/** Event types that carry diagnostics (the same set the SDK gives breadcrumbs). */
const errorEventTypes: ReadonlySet<EventType> = new Set([
  EventType.Error,
  EventType.UnhandledRejection,
  EventType.Resource,
  EventType.Vue,
  EventType.React,
  EventType.OtherFrameworks,
]);

/**
 * Snapshot one source into a JSON-safe value. The JSON round-trip drops
 * functions (store actions) and guarantees the reporter's transport
 * `JSON.stringify` can never throw on what we attach; circular state
 * collapses to an `{ $unserializable: true }` marker.
 */
function snapshot(source: StoreStateSource): unknown {
  try {
    const state = typeof source === "function" ? source() : { ...source.getState() };
    if (state === undefined) return null;
    return JSON.parse(JSON.stringify(state));
  } catch {
    return { $unserializable: true };
  }
}

/**
 * Build an `onBeforeReportData` hook that attaches store snapshots to
 * error-class reports — the lark-mvc analog of `@sentry/react`'s Redux
 * enhancer state attachment.
 *
 * The returned hook:
 *
 * 1. runs `next` (your own hook) FIRST, honoring its transform / `false`
 *    drop / Promise result;
 * 2. for error-class events only (`Error`, `UnhandledRejection`,
 *    `Resource`, `Vue`, `React`, `OtherFrameworks`) returns the report
 *    enriched with a top-level `storeState` field —
 *    `{ [name]: snapshot }` per configured source.
 *
 * Snapshots are taken at report time inside `untracked()` (reading a store
 * proxy never subscribes a component, even when the report originates from
 * a tracked region).
 *
 * Prefer the `attachStores` option of `initLarkSentry`, which wires this
 * hook up for you; use this directly only when calling the SDK's `init`
 * yourself.
 *
 * @param stores - Named state sources to snapshot per error report.
 * @param next - An existing hook to compose (runs before attachment).
 * @returns A hook for `init({ onBeforeReportData })` / `beforeSendData`.
 */
export function createStoreStateHook(
  stores: Readonly<Record<string, StoreStateSource>>,
  next?: ReportDataHook,
): ReportDataHook {
  return async (data) => {
    const result = next ? await next(data) : data;
    if (result === false || !errorEventTypes.has(result.type)) return result;
    const storeState = untracked(() => {
      const snapshots: Record<string, unknown> = {};
      for (const [name, source] of Object.entries(stores)) {
        snapshots[name] = snapshot(source);
      }
      return snapshots;
    });
    return { ...result, storeState } as IReportData;
  };
}
