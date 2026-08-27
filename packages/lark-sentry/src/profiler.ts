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

import { useEffect, useRef } from "@lark.js/mvc";
import { tracePerformance } from "@swifty.js/sentry";

interface ProfilerState {
  /** `performance.now()` at the first body run (hook slot creation). */
  readonly bodyStart: number;
  /** Body runs so far (first render counts as 1). */
  renders: number;
}

function report(name: string, message: string, value: number): void {
  try {
    tracePerformance({ name, message, value });
  } catch {
    // Reporting must never disturb rendering.
  }
}

/**
 * Profile the calling component — the lark-mvc analog of `@sentry/react`'s
 * `useProfiler`. Reports `Performance` events (`message` = `name`):
 *
 * - `"LarkComponentMount"` on mount, `value` = ms from the first body run
 *   to the mount effect flush;
 * - `"LarkComponentLifespan"` on unmount, `value` = ms the instance lived;
 * - `"LarkComponentRenders"` on unmount, `value` = total body runs — in a
 *   signals framework an outsized count flags over-subscription.
 *
 * Rules of hooks apply; `name` is captured on the first render. Under HMR
 * (dev only) effect slots are recreated on swap: lifespan/render counts
 * restart at the swap, and the mount metric is suppressed on recreation.
 *
 * @param name - Label reported as the event `message`.
 */
export function useProfiler(name: string): void {
  const slot = useRef<ProfilerState>(null);
  if (!slot.current) slot.current = { bodyStart: performance.now(), renders: 0 };
  const state = slot.current;
  state.renders++;

  useEffect(() => {
    // renders > 1 here means an HMR swap recreated the effect slot while the
    // useRef slot survived — a "mount" duration from bodyStart would be garbage.
    if (state.renders === 1) {
      report("LarkComponentMount", name, performance.now() - state.bodyStart);
    }
    const mountedAt = performance.now();
    return () => {
      report("LarkComponentLifespan", name, performance.now() - mountedAt);
      report("LarkComponentRenders", name, state.renders);
    };
  });
}
