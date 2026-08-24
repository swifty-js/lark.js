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

/**
 * Lark Framework — public API barrel export.
 *
 * Re-exports the complete public surface of `@lark.js/mvc` from a single
 * entry point. Consumers can `import { render, useSignal, State, ... }`
 * from `"@lark.js/mvc"` without knowing the internal module layout.
 *
 * ## API surface
 *
 * | Category | Exports |
 * | -------- | ------- |
 * | Reactive | `signal`, `computed`, `effect`, `batch`, `untracked`, `Signal` |
 * | Rendering | `render`, `unmount`, `raw`, `Fragment` |
 * | Components | `FC` type, `registerComponent`, `invalidateComponent` |
 * | Hooks | `useSignal`, `useRef`, `useComputed`, `useMemo`, `useEffect`, `useSignalEffect`, `onCleanup` |
 * | State | `State`, `createStore`, `useUrlState` |
 * | Query | `createQuery`, `useQuery`, `createMutation`, `invalidateQueries` |
 * | Router | `Router` |
 * | Service | `createService`, `ServiceApi`, `PayloadApi` |
 * | Framework | `Framework` (boot/config/utilities) |
 * | Types | All types from `./types` via `export *` |
 *
 * Internal-only utilities (`createCache`, `createEmitter`, HMR swap
 * functions, etc.) are accessible via the `Framework` object or `globalThis`
 * rather than re-exported here — they are implementation details that bloat
 * the public API surface without serving external consumers.
 */

// Reactive core (@preact/signals-core) — the framework's single reactivity
// primitive set. Reads inside component bodies/computed/effects subscribe;
// writes re-render synchronously (batched inside `batch()`).
export { signal, computed, effect, batch, untracked, Signal } from "./reactive";
export type { ReadonlySignal } from "./reactive";

// Rendering (React-DOM style root API + JSX helpers)
export { render, unmount } from "./jsx/reconcile";
export { raw, Fragment } from "./jsx/vnode";
export type { JSXNode, VNode, RawHTML, Component } from "./jsx/vnode";
export type { LarkEvent, JsxEventValue, LarkAttributes } from "./jsx-runtime";

// Component registry (string routes / lazy loading only — JSX tags never
// need registration)
export { registerComponent, invalidateComponent } from "./component-registry";

// Hooks (call-order-indexed slots — React rules of hooks)
export {
  useSignal,
  useRef,
  useComputed,
  useMemo,
  useEffect,
  useSignalEffect,
  onCleanup,
} from "./hooks";

// State (cross-view observable data — per-key signals)
export { State } from "./state";

// Router (history/hash with two-phase change; `parse()` is a tracked read)
export { Router } from "./router";

// Store (zustand-aligned state management — per-key signals)
export { createStore } from "./store";
export type { StoreApi } from "./store";

// Query (TanStack-style async state on signals)
export { createQuery, useQuery, createMutation, invalidateQueries, clearQueryCache } from "./query";
export type { QueryOptions, QueryResult, MutationResult } from "./query";

// URL state hook (sync component state with URL params — tracked reads)
export { useUrlState } from "./url-state";

// Service (API request management)
export { createService } from "./service";
export type { ServiceApi, ServiceInstance } from "./service";

// Framework (boot / config / routing dispatch / utilities)
export { Framework } from "./framework";

// Types (re-exported for consumer convenience)
export * from "./types";
