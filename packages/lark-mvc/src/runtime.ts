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
 * Template runtime helpers.
 *
 * Compiled templates import these helpers from `@lark.js/mvc/runtime` instead
 * of inlining the implementations. That keeps each compiled `.html` module
 * small — no more ~400 bytes of duplicated helper code per template.
 *
 * The compiler imports `encHtml` / `strSafe` / `refFn` from this module and
 * aliases them as `__lark_enc_html__` / `__lark_str_safe__` / `__lark_ref_fn__`
 * inside the compiled template function — see `compiler/compile-template.ts`.
 *
 * Canonical implementations live in `./common` so that dom.ts, runtime.ts,
 * and updater.ts all share a single copy.
 */

import { strSafe as commonStrSafe, encodeHTML, encodeURIExtra, encodeQuote, refFn } from "./common";

/** Null-safe `String(value)` — `null`/`undefined` become `""`. */
export const strSafe = commonStrSafe;

/** HTML-escape a value for safe embedding in markup. */
export const encHtml = encodeHTML;

/** Percent-encode a value, with extra characters escaped for stricter URIs. */
export const encUri = encodeURIExtra;

/** Backslash-escape quotes and backslashes for attribute string contents. */
export const encQuote = encodeQuote;

/**
 * Look up (or assign) a stable refData token for an object value.
 *
 * Templates use `{{@expr}}` to pass live JS values (objects/functions) through
 * the DOM by writing the token into an attribute, then resolving it back to
 * the original value when the event fires.
 */
export { refFn };
