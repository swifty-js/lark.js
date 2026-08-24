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
 * Lark framework utility functions.
 */

import { URL_QUERY_HASH_REGEXP, URL_PARAM_REGEXP, IS_URL_PARAMS } from "./common";
import type { AnyFunc, ParsedUri } from "./types";

// ============================================================
// Type guards
// ============================================================

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  return {};
}

// ============================================================
// ID generation
// ============================================================

/** Generate a unique ID with optional prefix */
let _localCounter = 0;
export function generateId(prefix?: string): string {
  return (prefix || "lark_") + _localCounter++;
}

export function noop(): void {
  /** noop */
}

// ============================================================
// Object utilities
// ============================================================

/** Safe hasOwnProperty check */
export function hasOwnProperty<T extends object>(
  owner: T | undefined | null,
  prop: PropertyKey,
): boolean {
  return owner != null && Object.prototype.hasOwnProperty.call(owner, prop);
}

/** Get object keys (own enumerable) */
export function keys<T extends object>(obj: T): string[] {
  const result: string[] = [];
  for (const p in obj) {
    if (hasOwnProperty(obj, p)) {
      result.push(p);
    }
  }
  return result;
}

/** Assign properties from sources to target (like Object.assign but safer) */
export function assign<T extends object>(target: T, ...sources: Partial<T>[]): T {
  for (const source of sources) {
    if (source) {
      for (const p in source) {
        if (hasOwnProperty(source, p)) {
          Reflect.set(target, p, source[p]);
        }
      }
    }
  }
  return target;
}

// ============================================================
// Try-execute utilities
// ============================================================

/** Module-level error sink invoked by `funcWithTry` on every caught error. */
let frameworkErrorSink: ((e: unknown) => void) | undefined;

/**
 * Set (or clear) the global error sink that `funcWithTry` invokes when a
 * wrapped function throws. Called once by `Framework.boot()` to wire
 * `FrameworkConfig.error` into every try-catch seam in the framework.
 */
export function setFrameworkErrorSink(sink: ((e: unknown) => void) | undefined): void {
  frameworkErrorSink = sink;
}

/**
 * Execute functions in try-catch.
 * Caught errors are forwarded to the per-call handler (if provided) and to
 * the global framework error sink (if set via `setFrameworkErrorSink`).
 * Returns the result of the last successfully executed function.
 */
export function funcWithTry(
  fns: AnyFunc | AnyFunc[],
  args: unknown[],
  context: unknown,
  configError?: (e: unknown) => void,
): unknown {
  const fnArray = Array.isArray(fns) ? fns : [fns];
  let ret: unknown;
  for (const fn of fnArray) {
    try {
      ret = fn.apply(context, args);
    } catch (e) {
      configError?.(e);
      frameworkErrorSink?.(e);
    }
  }
  return ret;
}

// ============================================================
// Dev warnings (deduped — render paths run every pass)
// ============================================================

const warnedMessages = new Set<string>();

/** Warn once per unique message (render-path safe). */
export function devWarn(message: string): void {
  if (warnedMessages.has(message)) return;
  warnedMessages.add(message);
  // eslint-disable-next-line no-console
  console.warn(`[lark-mvc] ${message}`);
}

// ============================================================
// DOM utilities
// ============================================================

/**
 * Check if node A is inside node B (or is the same node).
 * Uses compareDocumentPosition for efficiency.
 */
export function nodeInside(a: string | HTMLElement, b: string | HTMLElement): boolean {
  const aNode = typeof a === "string" ? document.getElementById(a) : a;
  const bNode = typeof b === "string" ? document.getElementById(b) : b;
  if (!aNode || !bNode) return false;
  if (aNode === bNode) return true;
  try {
    return (bNode.compareDocumentPosition(aNode) & 16) === 16;
  } catch {
    return false;
  }
}

// ============================================================
// URI utilities
// ============================================================

/**
 * Parse URI string into path and params object.
 * e.g. "/xxx/?a=b&c=d" => { path: "/xxx/", params: { a: "b", c: "d" } }
 *
 * The accumulator is function-local, so nested / re-entrant calls
 * (e.g. invoking `parseUri` again inside a replace callback) are safe.
 */
export function parseUri(uri: string): ParsedUri {
  const params: Record<string, string> = {};
  const path = uri.replace(URL_QUERY_HASH_REGEXP, "");
  const pathname = path;
  // Check if the original URI looks like it has params (e.g. YT3O0sPH1No= base64)
  const actualPath = uri === pathname && IS_URL_PARAMS.test(pathname) ? "" : pathname;
  uri.replace(actualPath, "").replace(URL_PARAM_REGEXP, (_match, name: string, value: string) => {
    try {
      params[name] = decodeURIComponent(value || "");
    } catch {
      params[name] = value || "";
    }
    return "";
  });
  return { path: actualPath, params };
}

/**
 * Convert path and params to URI string.
 * e.g. toUri("/xxx/", { a: "b", c: "d" }) => "/xxx/?a=b&c=d"
 */
export function toUri(
  path: string,
  params: Record<string, unknown>,
  keepEmpty?: ReadonlySet<string>,
): string {
  const pairs: string[] = [];
  let hasParams = false;

  for (const p in params) {
    if (hasOwnProperty(params, p)) {
      const v = String(params[p] ?? "");
      if (!keepEmpty || v || keepEmpty.has(p)) {
        pairs.push(`${p}=${encodeURIComponent(v)}`);
        hasParams = true;
      }
    }
  }

  if (hasParams) {
    path += (path && (~path.indexOf("?") ? "&" : "?")) + pairs.join("&");
  }
  return path;
}
