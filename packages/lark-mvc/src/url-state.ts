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
 * useUrlState — sync view state with URL query parameters.
 *
 * Returns a `[read, write]` pair. `read()` parses the current URL through
 * `Router.parse()` — a tracked, reactive read: calling it inside a template
 * (or `computed` / `useSignalEffect`) subscribes the caller to navigation,
 * so the view re-renders when the URL changes (back/forward or `Router.to`).
 * `write()` pushes a partial update back to the URL via `Router.to()`.
 *
 * Works with both history and hash routing modes.
 */
import { Router } from "./router";

/**
 * Sync view state with URL query parameters.
 *
 * @param initialState - Default values for each URL param key. Keys not
 *   present in the URL use these defaults; keys present in the URL override.
 * @returns A tuple `[read, write]`:
 *   - `read()`: current values from the URL merged with defaults (tracked —
 *     call it inside the component body each render, not once and cached)
 *   - `write(patch)`: update URL params. Accepts a partial object or an
 *     updater function. Only the specified keys change; other URL params
 *     are preserved.
 *
 * @example
 * ```tsx
 * export default function Pager() {
 *   const [readPage, writePage] = useUrlState({ page: "1", size: "20" });
 *   return (
 *     <button onClick={() => writePage((prev) => ({ page: String(Number(prev.page) + 1) }))}>
 *       Page {readPage().page}
 *     </button>
 *   );
 * }
 * ```
 */
export function useUrlState<S extends Record<string, string>>(
  initialState?: S,
): [() => Readonly<S>, (patch: Partial<S> | ((prev: S) => Partial<S>)) => void] {
  const keys = initialState ? Object.keys(initialState) : [];

  const read = (): S => {
    const loc = Router.parse(); // tracked — subscribes the caller
    const result: Record<string, string> = { ...(initialState || {}) };
    for (const key of keys) {
      const val = loc.get(key);
      if (val) result[key] = val;
    }
    // result is dynamically constructed from defaults + URL params;
    // cast to S is unavoidable since we can't verify the shape at runtime.
    return result as S;
  };

  const write = (patch: Partial<S> | ((prev: S) => Partial<S>)): void => {
    const current = read();
    const resolved = typeof patch === "function" ? patch(current) : patch;
    // Partial<S> where S extends Record<string, string> is assignable to
    // Record<string, unknown> without a cast.
    Router.to(resolved);
  };

  return [read, write];
}
