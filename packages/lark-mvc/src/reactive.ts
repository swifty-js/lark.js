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
 * Reactive core — the framework's single reactivity primitive set, backed by
 * `@preact/signals-core`.
 *
 * Every data source in Lark Mvc is signal-based:
 * - view-local state: `signal()` / `useSignal()` closures read by templates
 * - cross-view `State`: per-key signals (read = subscribe)
 * - stores: per-key signals behind a tracked `getState()` proxy
 * - router: the location signal behind `Router.location`
 * - props: per-frame per-key signals behind the `params` proxy
 *
 * Each mounted view runs its template inside one `effect()` — any signal read
 * during template evaluation subscribes the view, and writes re-render it
 * synchronously (writes inside `batch()` coalesce into a single re-render).
 *
 * ## Shallow reactivity
 *
 * Signals compare by reference (`===`). Mutating a nested field or calling
 * `arr.push()` does NOT notify — replace the reference instead:
 * `sig.value = [...sig.value, item]`. This matches React/Preact semantics.
 */
export { signal, computed, effect, batch, untracked, Signal } from "@preact/signals-core";
export type { ReadonlySignal } from "@preact/signals-core";
