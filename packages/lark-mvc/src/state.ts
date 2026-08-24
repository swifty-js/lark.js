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
 * Observable in-memory data object for cross-view data sharing, backed by
 * per-key signals.
 *
 * `State` is the recommended choice for **simple** cross-view data:
 * lightweight shared values (counters, toggles, page title, session info, etc.).
 * For **complex** reactive state — handlers, derived data, multi-instance
 * isolation — prefer `createStore` from `./store`.
 *
 * ## Reactivity (shallow)
 *
 * Every key is backed by its own signal:
 * - `State.get("key")` inside a tracked region (template / `computed` /
 *   `useSignalEffect`) subscribes the reader to THAT key.
 * - `State.get()` (whole object) subscribes the reader to ALL State changes
 *   (it reads a global version signal) and returns a plain snapshot.
 * - `State.set(data)` batch-writes the key signals — subscribed views
 *   re-render automatically. No digest call exists.
 *
 * Comparison is by reference (`===`): mutate-in-place does NOT notify —
 * replace the reference (`State.set({ list: [...list, item] })`).
 *
 * ## Cleanup
 *
 * `State.clean("keys")` is reference-counted per key and returns a dispose
 * function; when the last observer disposes, the key's data and signal are
 * dropped. In a component: `useEffect(() => State.clean("a,b"), [])`.
 */
import { hasOwnProperty } from "./utils";
import { signal, batch, type Signal } from "./reactive";
import { createEmitter } from "./event-emitter";
import type { AnyFunc, ChangeEvent, StateApi } from "./types";

/** Plain snapshot mirror of the state (kept in sync with the key signals). */
const appData: Record<string, unknown> = {};

/** Per-key signals, created lazily on first get/set of a key. */
const keySignals = new Map<string, Signal<unknown>>();

/** Bumped on every write — whole-object `State.get()` reads subscribe here. */
const version = signal(0);

/** Key reference counts: how many views observe each key */
const keyRefCounts: Record<string, number> = {};

/** Event emitter for user-level pub/sub (`State.on/off/fire`). */
const emitter = createEmitter();

function ensureKeySignal(key: string): Signal<unknown> {
  let sig = keySignals.get(key);
  if (!sig) {
    sig = signal(appData[key]);
    keySignals.set(key, sig);
  }
  return sig;
}

/**
 * Increment the reference count for each observed key.
 *
 * Called by `State.clean(keys)(ctx)` during view setup. The reference count
 * prevents premature cleanup when multiple views observe the same key.
 */
function setupKeysRef(keys: string): string[] {
  const keyList = keys.split(",");
  for (const key of keyList) {
    if (hasOwnProperty(keyRefCounts, key)) {
      keyRefCounts[key]++;
    } else {
      keyRefCounts[key] = 1;
    }
  }
  return keyList;
}

/**
 * Decrement the reference count for each key, deleting data when it reaches 0.
 *
 * Called on view destroy (registered by `State.clean`). When the last observer
 * of a key is destroyed (count goes 1→0), the key's data and signal are
 * dropped to prevent memory leaks.
 */
function teardownKeysRef(keyList: string[]): void {
  for (const key of keyList) {
    if (hasOwnProperty(keyRefCounts, key)) {
      const count = --keyRefCounts[key];
      if (count <= 0) {
        Reflect.deleteProperty(keyRefCounts, key);
        Reflect.deleteProperty(appData, key);
        keySignals.delete(key);
      }
    }
  }
}

/**
 * Observable in-memory data object.
 * Provides get/set/clean methods for cross-view data sharing.
 */
export const State: StateApi = {
  /**
   * Get data from state. Reading a key inside a tracked region subscribes
   * the reader to that key; the whole-object read subscribes to all changes.
   */
  get<T = unknown>(key?: string): T {
    if (key) {
      return ensureKeySignal(key).value as T;
    }
    version.value; // whole-object read → subscribe to every write
    return appData as T;
  },

  /**
   * Set data to state. Writes are batched — subscribed readers re-render
   * once, synchronously, after all keys are written.
   */
  set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): typeof State {
    batch(() => {
      let changed = false;
      for (const key of Object.keys(data)) {
        if (excludes?.has(key)) continue;
        const value = data[key];
        if (appData[key] !== value || !hasOwnProperty(appData, key)) {
          changed = true;
        }
        appData[key] = value;
        ensureKeySignal(key).value = value;
      }
      if (changed) {
        version.value++;
      }
    });
    return State;
  },

  /**
   * Observe state keys with ref-counted cleanup: increments each key's
   * observer count immediately and returns a dispose function that
   * decrements it — when the last observer disposes, the key's data and
   * signal are dropped.
   *
   * In a component: `useEffect(() => State.clean("a,b"), [])` — the returned
   * dispose doubles as the effect cleanup.
   */
  clean(keys: string): () => void {
    const keyList = setupKeysRef(keys);
    return () => {
      teardownKeysRef(keyList);
    };
  },

  /**
   * Bind event listener.
   */
  on(event: string, handler: (e?: ChangeEvent) => void): typeof State {
    emitter.on(event, handler);
    return State;
  },

  /**
   * Unbind event listener.
   */
  off(event: string, handler?: AnyFunc): typeof State {
    emitter.off(event, handler);
    return State;
  },

  /**
   * Fire event.
   */
  fire(event: string, data?: Record<string, unknown>, remove?: boolean): typeof State {
    emitter.fire(event, data, remove);
    return State;
  },
};
