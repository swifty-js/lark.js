# Reactive Core, Store & Router (`@lark.js/larky`)

## Reactive primitives (backed by `@vue/reactivity`)

| Export             | Semantics                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal(v)`        | Vue `ref(v)` — DEEP: nested mutations (`obj.value.a.push(x)`) notify readers. `Signal<T>` = Vue `Ref<T>`. Plain objects are stored as reactive PROXIES (`sig.value !== v`).   |
| `shallowSignal(v)` | Vue `shallowRef(v)` — only `.value` ASSIGNMENT notifies; value stored AS-IS (identity preserved). REQUIRED for third-party class instances (Monaco etc.). `ShallowSignal<T>`. |
| `computed(fn)`     | Lazy auto-tracked derived value (`ReadonlySignal<T>` = `ComputedRef<T>`). Read `.value` to subscribe.                                                                         |
| `effect(fn)`       | Runs `fn` immediately (tracked); re-runs microtask-batched on dependency change. `fn` may return a cleanup (runs between runs and on dispose). Returns a dispose function.    |
| `untracked(fn)`    | Runs `fn` with tracking paused — reads inside do NOT subscribe the enclosing effect.                                                                                          |
| `isSignal(v)`      | `isRef` — the reconciler's unwrap check; also detects computeds. There is NO `Signal` class / `instanceof`.                                                                   |
| `markRaw(obj)`     | Marks an object so deep signals/stores never proxy it — per-object escape hatch for library instances kept in deep state.                                                     |
| `toRaw(v)`         | Unwraps a reactive proxy back to the original object (identity repairs at interop boundaries).                                                                                |
| `nextTick()`       | Promise resolving after the pending flush commits (rejects if a job threw). Resolves immediately when idle.                                                                   |
| `flushSync(fn?)`   | Runs `fn`, then drains the job queue synchronously — the DOM is committed on return.                                                                                          |

There is deliberately NO `batch()` (batching is automatic), NO `reactive()`
export (signals are the single primitive), NO event emitters.

**Deep-proxy hazard**: a class instance stored in a DEEP signal comes back
as a proxy that fails the library's internal `===` checks — Monaco's
sentinel-node `while` loop then never terminates (silent page freeze).
Instance handles belong in `useRef`; reactive references in
`useShallowSignal`/`shallowSignal` or `markRaw`.

## Scheduling (React-18-style automatic batching)

- A signal write enqueues every subscribed effect's job on a microtask
  queue (deduplicated). The queue flushes once per tick; jobs appended
  DURING a flush (parent renders push child props) run in the same flush.
- Initial mounts are synchronous (`render()`, and each child instance's
  first render inside the post-commit flush). `render()` re-calls also
  commit synchronously (internally `flushSync`).
- **Cycle handling**: a job re-queued more than 100 times in one flush is
  SKIPPED from then on (this halts write ping-pong so the queue can drain
  — Vue scheduler semantics), and a single `Cycle detected` error is
  thrown after the drain, rejecting `nextTick()` awaiters. Self-writes
  inside a job's own run are suppressed by `@vue/reactivity` (no
  allowRecurse) — which is why mount `useEffect`s run as SEPARATE queued
  jobs after the commit, not inside the render effect.
- Errors bubble: a throwing job rejects the flush promise; surviving
  queued jobs are rescheduled.

Testing idiom:

```ts
count.value = 5;
await nextTick(); // or: flushSync(() => (count.value = 5));
expect(el.textContent).toBe("5");
await expect(nextTick()).rejects.toThrow(/Cycle detected/); // cycle tests
```

## Store — anonymous, zustand-aligned `createStore(creator)`

```ts
import { computed, createStore } from "@lark.js/larky";

const store = createStore((set, get) => ({
  count: 0,
  label: "counter",
  doubled: computed(() => get().count * 2), // derived slot (auto-tracked)
  increment: () => set({ count: get().count + 1 }), // action
}));
```

The creator runs ONCE; its return value is classified per key: functions →
actions, `computed()` refs → derived slots, everything else → per-key
SHALLOW signal state.

| API                                              | Semantics                                                                                                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getState()`                                     | Stable tracked proxy — reading a key inside a tracked region subscribes to THAT key only. Direct writes THROW (`read-only — use setState()`).                                                                  |
| `setState(partial \| prev => partial, replace?)` | Merge write; `Object.is` no-ops skipped; unknown keys create slots; `replace: true` resets missing plain keys to `undefined`. Listeners fire SYNCHRONOUSLY; component re-renders batch on the microtask queue. |
| `subscribe(listener)`                            | `(state, prevState)` on every change.                                                                                                                                                                          |
| `subscribe(selector, listener)`                  | Fires only when the selected slice changes (`Object.is`), with `(slice, prevSlice)`.                                                                                                                           |
| `destroy()`                                      | Clears listeners; further `setState` calls no-op.                                                                                                                                                              |

**Shallow keys (unlike `useSignal`)**: store values compare by reference —
zustand's immutable-update model. `set({ list: [...get().list, item] })`,
never `get().list.push(item)`.

Component usage — fine-grained per-key subscription:

```tsx
function CountView() {
  return <i>{store.getState().count}</i>; // re-renders ONLY on count writes
}
```

## Router — factory, react-router DATA MODE, history only

```ts
const router = createRouter(
  [
    { path: "/", component: Home },
    { path: "/users/:id", component: UserDetail },
    { path: "/admin", lazy: () => import("./views/admin") },
    { path: "*", component: NotFound },
  ],
  { basename: "/app" },
);
render(<RouterView router={router} />, container);
```

No module singleton — all state lives on the instance; `createRouter` also
records it as the ACTIVE router for `useRouter()` / prop-less
`<RouterView/>`.

| Member                              | Semantics                                                                                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `location`                          | `ReadonlySignal<Location>` — `{ pathname, search, hash, state, key }`, basename-stripped. `.value` reads are tracked.                                                                                    |
| `match` / `params` / `searchParams` | Computeds over the current match (`params.value["id"]`), `URLSearchParams` from `search`.                                                                                                                |
| `navigate(to, {replace, state})`    | react-router semantics; `to` may be a href string, partial path object, or history delta (`navigate(-1)`). Navigating to the current href converts to replace. Resolves `false` when a blocker rejected. |
| `block(fn)` / `useBlocker(fn)`      | Async blockers `(next, current) => boolean \| Promise<boolean>`; run for pushes, replaces AND history pops (blocked pops revert via `history.go(delta)`). Returns/auto-manages unregister.               |
| `dispose()`                         | Detach popstate listener, clear blockers, clear active pointer.                                                                                                                                          |

- Matching: `:param` dynamic segments (decoded), trailing `*` splat
  (`params["*"]`), react-router ranking (static > dynamic > splat; ties by
  registration order). `matchPath(pattern, pathname)` /
  `matchRoutes(routes, pathname)` are exported pure helpers.
- `RouterView`: route change swaps the component (old instance unmounts);
  param-only change keeps the SAME instance (re-renders only tracked
  readers); `lazy()` loads dedupe in flight, cache on the route, and
  propagate failures as unhandled rejections.
- There is NO hash routing and NO `useLocation`/`useParams` alias hooks.

## `useUrlState(defaults?)` — URL search params as component state

```tsx
function Pager() {
  const [params, setParams] = useUrlState({ page: "1", size: "20" });
  return (
    <button
      onClick={() => setParams((p) => ({ page: String(Number(p.page) + 1) }))}
    >
      Page {params.page}
    </button>
  );
}
```

A REAL hook (component-only, uses a hook slot) on the ACTIVE router:
`value` is a TRACKED read of `searchParams` merged over `defaults` (fresh
every render — the component re-renders on URL changes; omit `defaults` to
read every current param). `setValue(patch | updater, {replace?})` is
SLOT-STABLE (created once per instance) and navigates with the patched
params, preserving pathname, hash, and unrelated search params —
`undefined`/`null` deletes a key. `defaults` and the router are captured
on the FIRST render. The re-render commits like any write — microtask-
batched (`await nextTick()` in tests).
