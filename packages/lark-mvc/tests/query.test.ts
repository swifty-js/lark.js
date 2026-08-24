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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQuery, createMutation, invalidateQueries, clearQueryCache } from "../src/query";
import { signal, effect } from "../src/reactive";

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("createQuery", () => {
  beforeEach(() => {
    clearQueryCache();
  });

  it("fetches on creation and transitions isLoading → data", async () => {
    const fetcher = vi.fn(() => Promise.resolve("payload"));
    const q = createQuery("q1", fetcher);

    expect(q.isLoading.value).toBe(true);
    expect(q.isFetching.value).toBe(true);
    expect(q.data.value).toBeUndefined();

    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(q.data.value).toBe("payload");
    expect(q.isLoading.value).toBe(false);
    expect(q.isFetching.value).toBe(false);
    expect(q.error.value).toBeUndefined();
    q.dispose();
  });

  it("captures fetch errors into the error signal", async () => {
    const q = createQuery("q-err", () => Promise.reject(new Error("boom")));
    await tick();
    expect(q.data.value).toBeUndefined();
    expect((q.error.value as Error).message).toBe("boom");
    expect(q.isFetching.value).toBe(false);
    q.dispose();
  });

  it("data reads are tracked — effects re-run when the fetch resolves", async () => {
    const seen: unknown[] = [];
    const q = createQuery("q-track", () => Promise.resolve(7));
    const dispose = effect(() => {
      seen.push(q.data.value);
    });
    expect(seen).toEqual([undefined]);
    await tick();
    expect(seen).toEqual([undefined, 7]);
    dispose();
    q.dispose();
  });

  it("dedupes concurrent queries with the same key (one fetch, shared data)", async () => {
    let resolveFetch!: (v: string) => void;
    const fetcher = vi.fn(() => new Promise<string>((r) => (resolveFetch = r)));
    const a = createQuery("q-dedup", fetcher);
    const b = createQuery("q-dedup", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1); // in-flight dedup
    resolveFetch("shared");
    await tick();
    expect(a.data.value).toBe("shared");
    expect(b.data.value).toBe("shared");
    a.dispose();
    b.dispose();
  });

  it("staleTime serves fresh entries from cache without refetching", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Math.max(1, 2)));
    const a = createQuery("q-stale", fetcher, { staleTime: 60_000 });
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    const b = createQuery("q-stale", fetcher, { staleTime: 60_000 });
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1); // still fresh — no refetch
    expect(b.data.value).toBe(2);
    a.dispose();
    b.dispose();
  });

  it("staleTime 0 refetches for each new subscriber", async () => {
    const fetcher = vi.fn(() => Promise.resolve("x"));
    const a = createQuery("q-stale0", fetcher);
    await tick();
    const b = createQuery("q-stale0", fetcher);
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(2);
    a.dispose();
    b.dispose();
  });

  it("refetch() bypasses staleTime and updates data", async () => {
    let n = 0;
    const q = createQuery("q-refetch", () => Promise.resolve(++n), { staleTime: 60_000 });
    await tick();
    expect(q.data.value).toBe(1);
    await q.refetch();
    expect(q.data.value).toBe(2);
    q.dispose();
  });

  it("enabled: false never fetches", async () => {
    const fetcher = vi.fn(() => Promise.resolve(1));
    const q = createQuery("q-disabled", fetcher, { enabled: false });
    await tick();
    expect(fetcher).not.toHaveBeenCalled();
    expect(q.data.value).toBeUndefined();
    q.dispose();
  });

  it("initialData seeds data before the first fetch resolves", async () => {
    const q = createQuery("q-seed", () => Promise.resolve("fresh"), { initialData: "seed" });
    expect(q.data.value).toBe("seed");
    await tick();
    expect(q.data.value).toBe("fresh");
    q.dispose();
  });

  it("reactive keys switch entries and fetch per key", async () => {
    const page = signal("1");
    const fetcher = vi.fn((key: string) => Promise.resolve(`data:${key}`));
    const q = createQuery(() => `page/${page.value}`, fetcher, { staleTime: 60_000 });

    await tick();
    expect(q.data.value).toBe("data:page/1");

    page.value = "2"; // key effect re-runs → new entry → fetch
    await tick();
    expect(q.data.value).toBe("data:page/2");
    expect(fetcher).toHaveBeenCalledTimes(2);

    page.value = "1"; // back to a fresh entry — no refetch (staleTime)
    await tick();
    expect(q.data.value).toBe("data:page/1");
    expect(fetcher).toHaveBeenCalledTimes(2);
    q.dispose();
  });

  it("invalidateQueries(prefix) refetches live queries and marks others stale", async () => {
    let n = 0;
    const q = createQuery("users/list", () => Promise.resolve(++n), { staleTime: 60_000 });
    const other = vi.fn(() => Promise.resolve("other"));
    const q2 = createQuery("posts/list", other, { staleTime: 60_000 });
    await tick();
    expect(q.data.value).toBe(1);
    expect(other).toHaveBeenCalledTimes(1);

    invalidateQueries("users/");
    await tick();
    expect(q.data.value).toBe(2); // refetched
    expect(other).toHaveBeenCalledTimes(1); // untouched prefix
    q.dispose();
    q2.dispose();
  });

  it("a disposed reactive-key query stops following key changes", async () => {
    const page = signal("a");
    const fetcher = vi.fn((key: string) => Promise.resolve(key));
    const q = createQuery(() => `k/${page.value}`, fetcher);
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);

    q.dispose();
    page.value = "b";
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1); // key effect disposed
  });
});

describe("createMutation", () => {
  it("mutate() transitions isPending and stores data", async () => {
    const m = createMutation((n: number) => Promise.resolve(n * 2));
    expect(m.isPending.value).toBe(false);

    const p = m.mutate(21);
    expect(m.isPending.value).toBe(true);
    const result = await p;
    expect(result).toBe(42);
    expect(m.data.value).toBe(42);
    expect(m.error.value).toBeUndefined();
    expect(m.isPending.value).toBe(false);
  });

  it("stores errors and resolves undefined on failure", async () => {
    const m = createMutation(() => Promise.reject(new Error("nope")));
    const result = await m.mutate(undefined);
    expect(result).toBeUndefined();
    expect((m.error.value as Error).message).toBe("nope");
    expect(m.isPending.value).toBe(false);
  });

  it("reset() returns to idle", async () => {
    const m = createMutation((n: number) => Promise.resolve(n));
    await m.mutate(5);
    m.reset();
    expect(m.data.value).toBeUndefined();
    expect(m.error.value).toBeUndefined();
    expect(m.isPending.value).toBe(false);
  });
});
