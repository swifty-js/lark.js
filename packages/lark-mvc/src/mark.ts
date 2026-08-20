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
 * Mark/Unmark: signature-based lifecycle tracking for async callbacks.
 *
 * `mark(host, key)` returns a validity checker. The checker returns `false`
 * once the host is unmarked (e.g. when a view re-renders or is destroyed),
 * so stale async callbacks can short-circuit and skip work.
 *
 * State is stored in a module-level WeakMap, not on the host object, so
 * `mark/unmark` never pollutes user objects with magic keys, never breaks
 * on `Object.freeze`-ed inputs.
 */

interface HostRecord {
  /** Per-key sign counter; bumped each time mark() is called for that key. */
  signs: Map<string, number>;
  /** Once true, every existing checker for this host returns false forever. */
  deleted: boolean;
}

const hostStore = new WeakMap<object, HostRecord>();

function getOrCreate(host: object): HostRecord {
  let record = hostStore.get(host);
  if (!record) {
    record = { signs: new Map(), deleted: false };
    hostStore.set(host, record);
  }
  return record;
}

/**
 * Create a mark for tracking async callback validity.
 * Returns a function that returns true while the mark is still valid.
 *
 * @param host - Object to associate the mark with (typically a view)
 * @param key  - Key to track (typically "render" or a specific async-op identifier)
 */
export function mark(host: object, key: string): () => boolean {
  const record = getOrCreate(host);
  if (record.deleted) {
    return () => false;
  }
  const sign = (record.signs.get(key) ?? 0) + 1;
  record.signs.set(key, sign);
  return () => {
    const current = hostStore.get(host);
    return !!current && !current.deleted && current.signs.get(key) === sign;
  };
}

/**
 * Clear all marks for a host object, invalidating every existing checker.
 * Called when a view re-renders or is destroyed.
 *
 * @param host - Object whose marks should be invalidated
 */
export function unmark(host: object): void {
  const record = hostStore.get(host);
  if (record) {
    record.deleted = true;
    record.signs.clear();
  } else {
    hostStore.set(host, { signs: new Map(), deleted: true });
  }
}
