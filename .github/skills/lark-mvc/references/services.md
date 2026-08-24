# Data Layer: useQuery, createService, Cache & Emitter

Source of truth: `src/query.ts`, `src/service.ts`, `src/cache.ts`,
`src/event-emitter.ts`.

## useQuery / createQuery (TanStack-style, recommended)

Signals-backed async state. Reading the result signals inside a component
body / `computed` / `useSignalEffect` subscribes the reader — the component
re-renders as the fetch progresses. Entries are shared per key in a
module-level cache.

```tsx
import { useQuery, Router } from "@lark.js/mvc";

export default function UserCard() {
  const user = useQuery(
    () => `user/${Router.parse().get("id")}`,        // reactive key (tracked)
    (key) => fetch(`/api/${key}`).then((r) => r.json()),
    { staleTime: 30_000 },
  );
  return (
    <div>
      {user.isLoading.value && <p>Loading…</p>}
      {user.error.value != null && <p>Failed to load.</p>}
      {user.data.value && <p>{user.data.value.name}</p>}
      <button onClick={() => user.refetch()}>Reload</button>
    </div>
  );
}
```

```ts
useQuery<T>(...)                     // HOOK form: slot-cached per instance,
                                     // disposed automatically on unmount
createQuery<T>(                      // standalone form: caller owns dispose()
  key: string | (() => string),      // reactive keys re-resolve on signal change
  fetcher: (key: string) => Promise<T>,
  options?: { staleTime?: number;    // freshness window ms (default 0)
              enabled?: boolean;     // false = never fetch (reads still work)
              initialData?: T },     // seed shown until first success
): QueryResult<T>

interface QueryResult<T> {
  data: ReadonlySignal<T | undefined>;
  error: ReadonlySignal<unknown>;        // cleared on next success
  isLoading: ReadonlySignal<boolean>;    // fetching AND no data yet
  isFetching: ReadonlySignal<boolean>;   // any in-flight fetch
  refetch(): Promise<T | undefined>;     // bypasses staleTime
  dispose(): void;                       // release this handle
}
```

Semantics:

- **In-flight dedup** — concurrent queries with the same key share ONE fetch
  and one entry (shared data/error/isFetching).
- **staleTime** — an entry fetched within `staleTime` ms is served from
  cache without refetching; `staleTime: 0` (default) refetches per new
  subscriber.
- **Reactive keys** — `() => key` may read signals (e.g. `Router.parse()`);
  when the key changes the query switches entries and fetches as needed.
- **`invalidateQueries(prefix?)`** — mark matching entries stale and refetch
  the ones still referenced by a live query. `clearQueryCache()` drops
  everything (tests).
- `useQuery` is the component-hook form (slot-cached across re-renders,
  disposed on unmount); `createQuery` is the standalone form — call
  `dispose()` yourself. Calling `createQuery` in a component body would
  create a new handle every render — use `useQuery` there.

### createMutation

```ts
const save = createMutation((body: Todo) =>
  fetch("/api/todos", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()),
);
// save.mutate(vars): Promise<TData | undefined>  (undefined on error)
// save.data / save.error / save.isPending  — ReadonlySignals
// save.reset()                             — back to idle
// template: <button disabled={save.isPending.value} onClick={() => save.mutate(todo)}>
```

## createService (callback-based request layer)

A Service manages API requests with **TTL caching (LFU-backed)**,
**in-flight deduplication**, **serial task queueing**, and lifecycle events.
It is transport-agnostic — you supply a `syncFn`. Prefer `useQuery` for new
component code; `createService` remains for imperative multi-request flows.

```ts
import { createService } from "@lark.js/mvc";

const apiService = createService(
  (payload, callback) => {
    // syncFn: the transport
    fetch(payload.get<string>("url"), {
      method: payload.get("method") || "GET",
    })
      .then((r) => r.json())
      .then((result) => {
        payload.set("result", result);
        callback();
      })
      .catch((err) => {
        payload.set("error", err);
        callback();
      });
  },
  20, // cacheMax   (LFU max entries, default 20)
  5, // cacheBuffer (eviction batch, default 5)
);
```

### Endpoint metadata

```ts
apiService.add({
  name: "getUser", // unique per service
  url: "/api/user",
  cache: 30000, // TTL ms; 0 = no cache (truncated to int)
  before(payload) {
    // pre-request transform (the only meta hook)
    payload.set("url", `/api/user/${payload.get("id")}`);
  },
});
apiService.add([
  { name: "a", url: "/a" },
  { name: "b", url: "/b" },
]); // batch
```

### ServiceApi (type-level)

```ts
apiService.meta(nameOrAttrs)       // ServiceMetaEntry lookup/construction
apiService.create(attrs)           // fresh Payload (runs before hook, fires "begin")
apiService.cached(attrs)           // PayloadApi | undefined (pending → cache-with-TTL)
apiService.get(attrs, createNew?)  // { entity, needsUpdate }
apiService.clear("getUser,listUsers")  // drop cached payloads by endpoint name
apiService.on/off/fire             // type-level events: "begin", "done", "fail", "end"
apiService.instance()              // per-component ServiceInstance
```

### ServiceInstance (per component)

```ts
const svc = apiService.instance();

svc.all([{ name: "getUser", id: "123" }, "listUsers"], (errors, p1, p2) => {
  // fires ONCE after all complete; errors is a sparse array indexed per attr
  user.value = p1.get("userName"); // write a signal the template reads
});

svc.one(attrs, (error, payload, isLast, index) => {
  /* per-attribute callback */
});
svc.save(attrs, done); // like all() but ALWAYS bypasses cache
svc.enqueue(task); // serial queue — self-drains, one task per macrotask
svc.dequeue(...args); // manually pump the queue (rarely needed)
svc.destroy(); // mark destroyed, drop queue, ignore in-flight results
svc.on / off / fire; // instance-level emitter
svc.busy;
svc.destroyed; // live flags (numbers 0/1)
```

`attrs` accepts a string (`"getUser"`), an object (`{ name, ...params }`), or
an array of either. Per-call `cache` in attrs overrides the meta TTL.

### Caching & deduplication semantics

- Cache key = `JSON.stringify(attrs) + "\n" + JSON.stringify(meta)` —
  different params ⇒ different entries.
- If an identical request is **in flight**, later callers chain onto the
  pending entry (single network call fans out to all waiters).
- On completion the payload is cached with a timestamp; a later hit older
  than the TTL is evicted and refetched.
- If a service instance is busy, new `all/one/save` calls are auto-enqueued;
  the queue self-drains one task per macrotask once idle.

### Recommended component integration

```tsx
import { useSignal, useMemo, onCleanup } from "@lark.js/mvc";

export default function UserButton() {
  const svc = useMemo(() => apiService.instance(), []); // one instance per mount
  onCleanup(() => svc.destroy());
  const user = useSignal("");

  const load = (): void => {
    svc.all({ name: "getUser", id: "123" }, (errors, p) => {
      user.value = String(p.get("userName") ?? ""); // signal write → re-render
    });
  };

  return <button onClick={load}>{user.value || "Load user"}</button>;
}
```

### PayloadApi

```ts
payload.get<T>(key); // read
payload.set("key", value); // write (chainable)
payload.set({ a: 1, b: 2 }); // batch write
payload.data; // raw data object
payload.cacheInfo; // { name, key, time } | undefined
```

`createPayload(data?)` is exported for tests/custom transports.

## createCache (LFU-style bounded cache)

Used internally by Router/Service; also available via
`Framework.createCache`:

```ts
const cache = Framework.createCache<T>({
  maxSize: 20,      // capacity = maxSize + bufferSize
  bufferSize: 5,    // evicted per overflow (single-pass partial selection)
  onRemove?: (key) => void,
  sortComparator?: (a, b) => number,  // default: freq desc, then recency desc
});
cache.set(k, v); cache.get(k); cache.has(k); cache.del(k);
cache.clear(); cache.forEach(cb); cache.getSize();
// get()/set() bump frequency + recency; has() does not.
```

## createEmitter

The multicast emitter behind View/Frame/Router/State/Service events
(`Framework.createEmitter`):

```ts
const em = createEmitter();
em.on("change", (e) => {
  /* e.type preserves original case */
});
em.fire("change", { key: "v" }); // data gets .type added
em.fire("once", {}, true); // remove=true → auto-off after firing
em.fire("evt", {}, false, true); // lastToFirst reverse iteration
em.off("change", handler); // or off("change") for all
```

Semantics:

- **Case-sensitive** event names (`fire("clearHistory")` only matches
  `on("clearHistory")` — component event names travel as in-memory prop
  keys, never through HTML attributes, so camelCase survives exactly).
- **Re-entrant safe**: `off()` during `fire()` defers list compaction until
  the outermost fire completes — siblings are never skipped.
- **`on{EventName}` convention**: assigning `emitter.onDestroy = fn` makes
  `fire("destroy")` also call `fn` (how framework lifecycle callbacks work).
