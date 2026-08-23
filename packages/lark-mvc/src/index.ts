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
 * entry point. Consumers can `import { defineView, signal, State, ... }`
 * from `"@lark.js/mvc"` without knowing the internal module layout.
 *
 * ## API surface
 *
 * | Category | Exports |
 * | -------- | ------- |
 * | Reactive | `signal`, `computed`, `effect`, `batch`, `untracked`, `Signal` |
 * | Framework | `Framework`, `defineView`, `EventDelegator` |
 * | State | `State`, `createStore`, `useUrlState` |
 * | Router | `Router` |
 * | View | `defineView`, `ViewCtx`, `useSignal`, `useSignalEffect`, `useEffect`, ... |
 * | Frame | `Frame`, `createFrame`, `registerViewClass`, `invalidateViewClass` |
 * | Service | `createService`, `ServiceApi`, `PayloadApi` |
 * | Types | All types from `./types` via `export *` |
 *
 * Internal-only utilities (`mark`, `createCache`, `createEmitter`, HMR swap
 * functions, etc.) are accessible via the `Framework` object or `globalThis`
 * rather than re-exported here — they are implementation details that bloat
 * the public API surface without serving external consumers.
 */

// Reactive core (@preact/signals-core) — the framework's single reactivity
// primitive set. Reads inside templates/computed/effects subscribe; writes
// re-render synchronously (batched inside `batch()`).
export { signal, computed, effect, batch, untracked, Signal } from "./reactive";
export type { ReadonlySignal } from "./reactive";

// State (cross-view observable data — per-key signals)
export { State } from "./state";

// Router (history/hash with two-phase change; `parse()` is a tracked read)
export { Router } from "./router";

// Frame (view lifecycle management — functional factory + singleton)
export { Frame, createFrame } from "./frame";
export type { FrameApi } from "./frame";
export { registerViewClass, invalidateViewClass } from "./frame";
export { ensureViewName, resolveSetup } from "./view-registry";

// View (functional — defineView factory)
export { defineView } from "./view";

// Hooks runtime
export {
  useSignal,
  useSignalEffect,
  useEffect,
  useInterval,
  useTimeout,
  useResource,
  useEvent,
} from "./hooks";

// Service (API request management)
export { createService } from "./service";
export type { ServiceApi, ServiceInstance } from "./service";

// EventDelegator (DOM event delegation)
export { EventDelegator } from "./event-delegator";

// Framework (main entry point)
export { Framework } from "./framework";

// URL state hook (sync view state with URL params — tracked reads)
export { useUrlState } from "./url-state";

// Store (zustand-aligned state management — per-key signals)
export { createStore } from "./store";
export type { StoreApi } from "./store";

// JSX (template adapter + helpers; jsx/jsxs live in "@lark.js/mvc/jsx-runtime")
export { jsxTemplate } from "./jsx/template";
export { raw, Fragment, isLarkView } from "./jsx/vnode";
export type { JSXNode, VNode, RawHTML, Component } from "./jsx/vnode";
export type { LarkEvent, JsxEventValue, LarkAttributes } from "./jsx-runtime";

// Types (re-exported for consumer convenience)
export * from "./types";
