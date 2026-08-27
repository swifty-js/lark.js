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

import { useRef } from "@lark.js/mvc";
import { enablePlugin } from "@swifty.js/sentry";
import { ExposurePlugin } from "@swifty.js/sentry/plugins";

/** Options for {@link useExposure} (captured on the FIRST render). */
export interface UseExposureOptions {
  /** Intersection ratio threshold (0-1). Plugin default: `0.5`. */
  readonly threshold?: number;
  /** Custom parameters included in the reported `Exposure` event. */
  readonly params?: Record<string, unknown>;
}

/** Shared plugin instance backing every `useExposure` call site. */
let sharedPlugin: ExposurePlugin | null = null;

function getExposurePlugin(): ExposurePlugin {
  if (!sharedPlugin) {
    sharedPlugin = new ExposurePlugin();
    enablePlugin(sharedPlugin);
  }
  return sharedPlugin;
}

/**
 * Track element exposure duration declaratively — a lark-mvc hook over the
 * SDK's `ExposurePlugin` (one shared instance, lazily registered via
 * `enablePlugin`).
 *
 * Returns a slot-stable `ref` callback: the element is observed after
 * commit and unobserved on unmount (or when the element identity changes).
 * The `Exposure` event is reported by the plugin when a visible element
 * leaves the viewport, carrying `threshold`/`duration`/`params`.
 *
 * Options are captured on the first render (lark closure-capture
 * semantics). Telemetry never crashes rendering — failures are logged and
 * swallowed.
 *
 * @example
 * ```tsx
 * function Banner() {
 *   const exposureRef = useExposure({ threshold: 0.75, params: { bannerId: "b1" } });
 *   return <div ref={exposureRef}>...</div>;
 * }
 * ```
 *
 * @param options - Threshold and custom params for the exposure report.
 * @returns A `ref` callback to attach to the observed element.
 */
export function useExposure(options: UseExposureOptions = {}): (el: Element | null) => void {
  const slot = useRef<(el: Element | null) => void>(null);
  if (!slot.current) {
    const { threshold, params } = options;
    let current: Element | null = null;
    slot.current = (el: Element | null): void => {
      if (el === current) return;
      try {
        const plugin = getExposurePlugin();
        if (current) plugin.unobserve(current);
        if (el) plugin.observe({ target: el, threshold, params });
      } catch (error) {
        console.error("[lark-sentry] exposure tracking failed:", error);
      }
      current = el;
    };
  }
  return slot.current;
}
