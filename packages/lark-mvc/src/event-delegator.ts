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
 * DOM event delegation system.
 *
 * All DOM events are delegated to `document.body` in the **capture phase**,
 * rather than attaching listeners to individual elements. When an event
 * fires, the delegator walks from `event.target` up to `document.body`; at
 * each element it reads the `@<type>` attribute emitted by the JSX
 * serializer — `"<viewId>\x1e<handlerName>"` — resolves the owning Frame by
 * id, and calls `view.getEvents()[handlerName]`.
 *
 * Handlers are exclusively the inline JSX functions collected per render by
 * `jsxTemplate` (generated `__jsxN` names, wired via `wireInlineHandlers`).
 * There is no events-map key grammar: one plain name, one handler.
 *
 * ## Reference counting
 *
 * `bind` / `unbind` use reference counting per event type so that multiple
 * views listening to the same event type on `document.body` don't attach
 * duplicate listeners, and a single `unbind` doesn't remove a listener still
 * needed by another view.
 */
import { SPLITTER } from "./common";
import { funcWithTry, noop } from "./utils";
import { batch } from "./reactive";
import type { FrameObj, AnyFunc } from "./types";

// ============================================================
// Internal state
// ============================================================

/** Root events counter: eventType -> count */
const rootEvents: Record<string, number> = {};

/** Reference to Frame.get (set during initialization) */
let frameGetter: ((id: string) => FrameObj | undefined) | undefined;

// ============================================================
// Event info parsing
// ============================================================

/** Parsed event info from an `@event` attribute. */
interface EventInfo {
  /** Owning view/frame ID (before SPLITTER). */
  id: string;
  /** Event handler name (after SPLITTER). */
  name: string;
}

/**
 * Read and parse the `@<type>` attribute on an element.
 * Wire format: `"<viewId>\x1e<handlerName>"` (always emitted with the
 * viewId by the serializer). Returns undefined when absent or malformed.
 */
function readEventInfo(el: HTMLElement, eventType: string): EventInfo | undefined {
  const raw = el.getAttribute(`@${eventType}`);
  if (!raw) return undefined;
  const i = raw.indexOf(SPLITTER);
  if (i <= 0 || i === raw.length - 1) return undefined;
  return { id: raw.slice(0, i), name: raw.slice(i + 1) };
}

// ============================================================
// DOMEventProcessor: main event handler
// ============================================================

/**
 * Main capture-phase handler for all delegated DOM events.
 *
 * Attached to `document.body` via `addEventListener(type, handler, true)`.
 * When an event fires, walks from `event.target` up to `document.body`,
 * dispatching at every element carrying a matching `@event` attribute.
 * Respects `isPropagationStopped()` (if a consumer patched the event).
 *
 * The extended event object carries `eventTarget` (the original hit element)
 * for consumer access.
 */
function domEventProcessor(domEvent: Event): void {
  const target = domEvent.target as HTMLElement;
  const eventType = domEvent.type;

  let current: HTMLElement | null = target;
  while (current && current !== document.body) {
    const info = readEventInfo(current, eventType);
    if (info) {
      const frame = frameGetter?.(info.id);
      const view = frame?.view;
      if (view) {
        const events =
          typeof (view as { getEvents?: () => Record<string, AnyFunc> | undefined }).getEvents ===
          "function"
            ? (view as { getEvents: () => Record<string, AnyFunc> | undefined }).getEvents()
            : undefined;
        const fn = events?.[info.name];
        if (fn) {
          const extendedEvent = domEvent as Event & { eventTarget?: EventTarget | null };
          extendedEvent.eventTarget = target;
          // batch(): multi-signal writes in one handler → one re-render.
          batch(() => funcWithTry(fn, [extendedEvent], view, noop));
        }
      }
    }

    if ((domEvent as Event & { isPropagationStopped?: () => boolean }).isPropagationStopped?.()) {
      break;
    }

    current = current.parentElement;
  }
}

// ============================================================
// EventDelegator object
// ============================================================

/**
 * DOM event delegation singleton.
 *
 * Manages capture-phase listeners on `document.body` via reference counting.
 * Called by the JSX inline-handler wiring layer (`jsx/template.ts`).
 */
export const EventDelegator = {
  /**
   * Register interest in an event type on `document.body`.
   *
   * Uses reference counting — the first registration attaches the capture-phase
   * listener; subsequent registrations just increment the counter. The
   * listener is only removed when the counter returns to zero via `unbind`.
   *
   * @param eventType - DOM event type (e.g. `"click"`, `"input"`)
   */
  bind(eventType: string): void {
    const counter = rootEvents[eventType] || 0;

    if (counter === 0) {
      // First binding, attach to document body
      document.body.addEventListener(eventType, domEventProcessor, true);
    }

    rootEvents[eventType] = counter + 1;
  },

  /**
   * Deregister interest in an event type from `document.body`.
   *
   * Decrements the reference counter; the capture-phase listener is only
   * removed when the counter reaches zero.
   *
   * @param eventType - DOM event type
   */
  unbind(eventType: string): void {
    const counter = rootEvents[eventType] || 0;

    if (counter <= 1) {
      // Last unbinding, remove from document body
      document.body.removeEventListener(eventType, domEventProcessor, true);
      Reflect.deleteProperty(rootEvents, eventType);
    } else {
      rootEvents[eventType] = counter - 1;
    }
  },

  /**
   * Inject the Frame lookup function.
   *
   * Called by `Framework.boot` so the delegator can resolve DOM element IDs
   * to `FrameObj` instances without importing `frame.ts` directly (avoiding
   * a circular dependency).
   */
  setFrameGetter(getter: (id: string) => FrameObj | undefined): void {
    frameGetter = getter;
  },
};
