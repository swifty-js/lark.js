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
 * Lark framework shared constants and helpers.
 *
 * This module is the single source of truth for:
 * - Router event name constants
 * - Regex patterns for URL parsing
 * - SVG/MathML namespaces and `strSafe`
 */

/** Global counter for generating unique IDs */
let globalCounter = 0;

/**
 * Router event name constants.
 *
 * - `CHANGE` — pre-change phase (preventable/rejectable)
 * - `CHANGED` — post-change phase (final notification, framework re-mounts views)
 * - `PAGE_UNLOAD` — `beforeunload` lifecycle
 */
export const RouterEvents = {
  CHANGE: "change",
  CHANGED: "changed",
  PAGE_UNLOAD: "page_unload",
};

/** URL query/hash trim regexp */
export const URL_TRIM_HASH_REGEXP = /(?:^.*\/\/[^/]+|#.*$)/gi;

/** URL trim query regexp (before hash) */
export const URL_TRIM_QUERY_REGEXP = /^[^#]*#?!?/;

/** URL param key-value regexp */
export const URL_PARAM_REGEXP = /([^=&?/#]+)=?([^&#?]*)/g;

/** URL params test regexp */
export const IS_URL_PARAMS = /(?!^)=|&/;

/** URL query/hash trim regexp for path extraction */
export const URL_QUERY_HASH_REGEXP = /[#?].*$/;

/** SVG namespace */
export const SVG_NS = "http://www.w3.org/2000/svg";

/** MathML namespace */
export const MATH_NS = "http://www.w3.org/1998/Math/MathML";

/** Increment global counter and return new value */
export function nextCounter(): number {
  return ++globalCounter;
}

/**
 * Null-safe `String(v)` — `null` / `undefined` become `""`.
 */
export function strSafe(v: unknown): string {
  return String(v == null ? "" : v);
}
