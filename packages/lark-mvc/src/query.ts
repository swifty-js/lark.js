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
 * TanStack-Query-style async state, built on signals.
 *
 * `createQuery(key, fetcher)` returns `{ data, error, isLoading, isFetching,
 * refetch }` — all readable signals. Reading them inside a template /
 * `computed` / `useSignalEffect` subscribes the reader; the view re-renders
 * automatically as the fetch progresses. Entries are shared per key in a
 * module-level cache:
 *
 * - **in-flight dedup** — concurrent queries with the same key share one
 *   fetch (and one entry, so they share results)
 * - **staleTime** — a fresh entry (fetched within `staleTime` ms) is served
 *   from cache without refetching
 * - **reactive keys** — pass `() => key` reading signals (e.g.
 *   `Router.parse().path`); when the key changes the query switches entries
 *   and fetches as needed
 * - **invalidateQueries(prefix)** — mark matching entries stale and refetch
 *   the ones still referenced by a live query
 *
 * Inside a component body use `useQuery` (slot-cached, disposed on unmount);
 * `createQuery` is the standalone form — the caller owns `dispose()`.
 * `createMutation(fn)` is the write-side counterpart: `{ mutate, data,
 * error, isPending, reset }`.
 */

import { signal, computed, effect, batch, untracked, type ReadonlySignal } from "./reactive";
import type { Signal } from "./reactive";
import { getCurrentInstance, useValueSlot } from "./component";

// ============================================================
// Query cache
// ============================================================

interface QueryEntry {
  data: Signal<unknown>;
  error: Signal<unknown>;
  fetching: Signal<boolean>;
  /** Epoch ms of the last successful fetch; 0 = never / invalidated. */
  updatedAt: number;
  /** In-flight fetch (dedup marker). */
  promise: Promise<unknown> | null;
  /** Live QueryResult handles referencing this entry. */
  refs: number;
  /** Last fetcher seen for this key — used by invalidateQueries refetch. */
  fetcher: ((key: string) => Promise<unknown>) | null;
}

const queryCache = new Map<string, QueryEntry>();

function entryFor(key: string): QueryEntry {
  let entry = queryCache.get(key);
  if (!entry) {
    entry = {
      data: signal<unknown>(undefined),
      error: signal<unknown>(undefined),
      fetching: signal(false),
      updatedAt: 0,
      promise: null,
      refs: 0,
      fetcher: null,
    };
    queryCache.set(key, entry);
  }
  return entry;
}

/** Drop every cached entry (primarily for tests). */
export function clearQueryCache(): void {
  queryCache.clear();
}

function runFetch(key: string, entry: QueryEntry, force: boolean): Promise<unknown> {
  // In-flight dedup: piggyback on the running fetch.
  if (entry.promise && !force) return entry.promise;
  const fetcher = entry.fetcher;
  if (!fetcher) return Promise.resolve(entry.data.peek());

  entry.fetching.value = true;
  const p: Promise<unknown> = fetcher(key).then(
    (result) => {
      if (queryCache.get(key) === entry && entry.promise === p) {
        entry.promise = null;
        entry.updatedAt = Date.now();
        batch(() => {
          entry.data.value = result;
          entry.error.value = undefined;
          entry.fetching.value = false;
        });
      }
      return result;
    },
    (err: unknown) => {
      if (queryCache.get(key) === entry && entry.promise === p) {
        entry.promise = null;
        batch(() => {
          entry.error.value = err;
          entry.fetching.value = false;
        });
      }
      return undefined;
    },
  );
  entry.promise = p;
  return p;
}

/** Fetch unless the entry is still fresh (within staleTime). */
function ensureFetch(key: string, entry: QueryEntry, staleTime: number): void {
  if (entry.promise) return;
  if (entry.updatedAt > 0 && Date.now() - entry.updatedAt < staleTime) return;
  void runFetch(key, entry, false);
}

// ============================================================
// createQuery
// ============================================================

export interface QueryOptions<T> {
  /** Cache freshness window in ms (default 0 — always refetch on mount). */
  staleTime?: number;
  /** When false, the query never fetches (reads still work). Default true. */
  enabled?: boolean;
  /** Seed value shown until the first fetch resolves. */
  initialData?: T;
}

export interface QueryResult<T> {
  /** Latest data for the current key (undefined until first success). */
  data: ReadonlySignal<T | undefined>;
  /** Latest error (undefined after a success). */
  error: ReadonlySignal<unknown>;
  /** True while fetching with no data yet (first load). */
  isLoading: ReadonlySignal<boolean>;
  /** True while any fetch for the current key is in flight. */
  isFetching: ReadonlySignal<boolean>;
  /** Force a refetch of the current key, bypassing staleTime. */
  refetch(): Promise<T | undefined>;
  /** Release this handle (auto-registered on ctx.cleanups inside setup). */
  dispose(): void;
}

/**
 * Create a signals-backed async query.
 *
 * @param key - Cache key, or a reactive `() => key` (signal reads tracked)
 * @param fetcher - `(key) => Promise<data>` — the async data source
 * @param options - `staleTime` / `enabled` / `initialData`
 *
 * @example
 * ```tsx
 * export default function UserCard() {
 *   const user = useQuery(
 *     () => `user/${Router.parse().get("id")}`,
 *     (key) => fetch(`/api/${key}`).then((r) => r.json()),
 *     { staleTime: 30_000 },
 *   );
 *   return (
 *     <div>
 *       {user.isLoading.value && <p>Loading…</p>}
 *       {user.error.value != null && <p>Failed to load.</p>}
 *       {user.data.value && <p>{user.data.value.name}</p>}
 *       <button onClick={() => user.refetch()}>Reload</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function createQuery<T>(
  key: string | (() => string),
  fetcher: (key: string) => Promise<T>,
  options: QueryOptions<T> = {},
): QueryResult<T> {
  const staleTime = options.staleTime ?? 0;
  const enabled = options.enabled ?? true;

  const attach = (k: string): QueryEntry => {
    const entry = entryFor(k);
    entry.fetcher = fetcher as (key: string) => Promise<unknown>;
    if (options.initialData !== undefined && entry.updatedAt === 0) {
      const dataSignal = entry.data;
      if (dataSignal.peek() === undefined) dataSignal.value = options.initialData;
    }
    return entry;
  };

  const currentKey = signal(typeof key === "function" ? "" : key);
  let disposed = false;
  let disposeKeyEffect: (() => void) | undefined;

  if (typeof key === "function") {
    // Reactive key: re-resolve when its signal reads change; each new key
    // attaches (and fetches, if enabled and stale) untracked.
    disposeKeyEffect = effect(() => {
      const k = key();
      untracked(() => {
        const prev = currentKey.peek();
        const entry = attach(k);
        if (prev !== k) {
          const prevEntry = prev ? queryCache.get(prev) : undefined;
          if (prevEntry) prevEntry.refs--;
          entry.refs++;
          currentKey.value = k;
        }
        if (enabled) ensureFetch(k, entry, staleTime);
      });
    });
  } else {
    const entry = attach(key);
    entry.refs++;
    if (enabled) ensureFetch(key, entry, staleTime);
  }

  const data = computed(() => entryFor(currentKey.value).data.value as T | undefined);
  const error = computed(() => entryFor(currentKey.value).error.value);
  const isFetching = computed(() => entryFor(currentKey.value).fetching.value);
  const isLoading = computed(() => isFetching.value && data.value === undefined);

  const refetch = (): Promise<T | undefined> => {
    const k = currentKey.peek();
    if (!k) return Promise.resolve(undefined);
    return runFetch(k, attach(k), true) as Promise<T | undefined>;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    disposeKeyEffect?.();
    const entry = queryCache.get(currentKey.peek());
    if (entry) entry.refs--;
  };

  return { data, error, isLoading, isFetching, refetch, dispose };
}

/**
 * Hook form of `createQuery` for component bodies: the handle is created
 * once per instance (slot-cached across re-renders) and disposed on unmount.
 * Outside a component it behaves exactly like `createQuery` (caller owns
 * `dispose()`).
 */
export function useQuery<T>(
  key: string | (() => string),
  fetcher: (key: string) => Promise<T>,
  options: QueryOptions<T> = {},
): QueryResult<T> {
  if (!getCurrentInstance()) return createQuery(key, fetcher, options);
  return useValueSlot(
    () => createQuery(key, fetcher, options),
    (query) => (query as QueryResult<T>).dispose(),
  );
}

/**
 * Mark cached queries stale and refetch the ones still referenced.
 *
 * @param prefix - Only keys starting with this prefix are invalidated;
 *   omit to invalidate everything.
 */
export function invalidateQueries(prefix?: string): void {
  for (const [key, entry] of queryCache) {
    if (prefix && !key.startsWith(prefix)) continue;
    entry.updatedAt = 0;
    if (entry.refs > 0 && entry.fetcher) {
      void runFetch(key, entry, true);
    }
  }
}

// ============================================================
// createMutation
// ============================================================

export interface MutationResult<TVars, TData> {
  /** Run the mutation; resolves with the data (or undefined on error). */
  mutate(vars: TVars): Promise<TData | undefined>;
  /** Result of the last successful mutation. */
  data: ReadonlySignal<TData | undefined>;
  /** Error of the last failed mutation. */
  error: ReadonlySignal<unknown>;
  /** True while a mutation is in flight. */
  isPending: ReadonlySignal<boolean>;
  /** Clear data/error/isPending back to idle. */
  reset(): void;
}

/**
 * Create a signals-backed mutation (TanStack `useMutation` shape).
 *
 * @example
 * const save = createMutation((body: Todo) =>
 *   fetch("/api/todos", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
 * );
 * // template: <button disabled={save.isPending.value} onClick={() => save.mutate(todo)}>
 */
export function createMutation<TVars, TData>(
  mutationFn: (vars: TVars) => Promise<TData>,
): MutationResult<TVars, TData> {
  const data = signal<TData | undefined>(undefined);
  const error = signal<unknown>(undefined);
  const isPending = signal(false);

  const mutate = (vars: TVars): Promise<TData | undefined> => {
    isPending.value = true;
    return mutationFn(vars).then(
      (result) => {
        batch(() => {
          data.value = result;
          error.value = undefined;
          isPending.value = false;
        });
        return result;
      },
      (err: unknown) => {
        batch(() => {
          error.value = err;
          isPending.value = false;
        });
        return undefined;
      },
    );
  };

  const reset = (): void => {
    batch(() => {
      data.value = undefined;
      error.value = undefined;
      isPending.value = false;
    });
  };

  return { mutate, data, error, isPending, reset };
}
