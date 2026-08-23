# Service Layer, Cache & Emitter

Source of truth: `src/service.ts`, `src/cache.ts`, `src/event-emitter.ts`.

## createService

A Service manages API requests with **TTL caching (LFU-backed)**,
**in-flight deduplication**, **serial task queueing**, and lifecycle events.
It is transport-agnostic — you supply a `syncFn`.

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
    // pre-request transform
    payload.set("url", `/api/user/${payload.get("id")}`);
  },
  after(payload) {
    // post-response transform
    payload.set("userName", payload.get<any>("result").name);
  },
  cleanKeys: "listUsers", // comma-separated endpoint names whose cache to clear
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
apiService.instance()              // per-view ServiceInstance
```

### ServiceInstance (per view)

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
svc.enqueue(task); // serial queue; runs when idle
svc.dequeue(...args); // process next queued task
svc.destroy(); // mark destroyed, drop queue, ignore in-flight results
svc.on / off / fire; // instance-level emitter
svc.busy;
svc.destroyed; // live flags (numbers 0/1)
```

`attrs` accepts a string (`"getUser"`), an object (`{ name, ...params }`), or
an array of either. Per-call `cache` in attrs overrides the meta TTL.

### Caching & deduplication semantics

- Cache key = `JSON.stringify(attrs) + SPLITTER + JSON.stringify(meta)` —
  different params ⇒ different entries.
- If an identical request is **in flight**, later callers chain onto the
  pending entry (single network call fans out to all waiters).
- On completion the payload is cached with a timestamp; a later hit older
  than the TTL is evicted and refetched.
- If a service instance is busy, new `all/one/save` calls are auto-enqueued.

### Recommended view integration

```tsx
export default defineView((ctx) => {
  const svc = apiService.instance();
  ctx.capture("api", svc); // auto svc.destroy() on view destroy
  // or: useResource("api", svc)
  const user = signal("");

  const load = (): void => {
    svc.all({ name: "getUser", id: "123" }, (errors, p) => {
      user.value = String(p.get("userName") ?? ""); // signal write → re-render
    });
  };

  const template = jsxTemplate(() => (
    <button onClick={load}>{user.value || "Load user"}</button>
  ));
  return { template };
});
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
  `on("clearHistory")` — component event names travel through refData
  tokens, never through HTML attributes, so camelCase survives exactly).
- **Re-entrant safe**: `off()` during `fire()` defers list compaction until
  the outermost fire completes — siblings are never skipped.
- **`on{EventName}` convention**: assigning `emitter.onDestroy = fn` makes
  `fire("destroy")` also call `fn` (how framework lifecycle callbacks work).
