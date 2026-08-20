# State, Store, Router & useUrlState

Source of truth: `src/state.ts`, `src/store.ts`, `src/router.ts`,
`src/url-state.ts`.

Two state layers, choose deliberately:

- **`State`** — singleton for SIMPLE cross-view values (page title, session
  info, toggles, injected app config). No actions, no computed.
- **`createStore`** — zustand-aligned stores for COMPLEX reactive state:
  actions, `computed`, fine-grained subscriptions, multiple instances.

## State (singleton)

```ts
import { State } from "@lark.js/mvc";

State.set({ count: 1, title: "Hello" }); // accumulates changed keys, does NOT notify
State.digest(); // fires one "changed" event with all keys
State.digest({ count: 2 }); // set + digest in one call
State.get("count"); // one key
State.get<Record<string, unknown>>(); // whole object
State.diff(); // ReadonlySet<string> of last digest's keys
State.on("changed", (e) => e?.keys?.has("count"));
```

Views react only if they observe:

```ts
export default defineView((ctx) => {
  ctx.observeState("count,title"); // re-render when these keys digest
  State.clean("count,title")(ctx); // ref-counted: deletes keys when last observer destroyed
  return { template };
});
```

`State.digest()` → framework dispatcher walks the frame tree → renders every
view whose observed keys intersect the changed set.

## createStore / computed / bindStore / useStore

```ts
import { createStore, computed, bindStore } from "@lark.js/mvc";

interface CountStore {
  count: number; step: number; doubled: number;
  increment: () => void;
}

const useCountStore = createStore<CountStore>("count", (set, get) => ({
  count: 0,
  step: 1,
  doubled: computed(["count"], () => get().count * 2),  // recomputes when deps change
  increment() { set({ count: get().count + get().step }); },
}));

useCountStore.getState();                       // snapshot (actions attached)
useCountStore.setState({ count: 5 });           // shallow merge, Object.is equality
useCountStore.setState((prev) => ({ count: prev.count + 1 }));
const off = useCountStore.subscribe((state, prevState) => { ... });
useCountStore.destroy();                        // clears listeners, removes from registry
```

Semantics (from `src/store.ts`):

- Creator runs once. Functions become **actions** (immune to setState);
  `computed(deps, fn)` markers become derived slots evaluated initially and
  re-evaluated (before listeners fire) whenever a dep changed.
- Writes to computed/action keys via `setState` are silently ignored.
- If nothing changed (`Object.is` per key), `setState` is a no-op — listeners
  are NOT notified.
- Store names must be unique (global registry).

Bind to a view (inside setup):

```ts
bindStore(ctx, useCountStore); // sync all non-function keys
bindStore(ctx, useCountStore, (s) => ({ count: s.count })); // selector
// → initial updater.set + digest, re-syncs on every store change,
//   auto-unsubscribes on view "destroy". Returns the unsubscribe fn.

// or the hook form (also returns a state getter):
const getSel = useStore(useCountStore, (s) => ({ count: s.count }));
```

In event handlers call actions directly:
`useCountStore.getState().increment()`.

## Router

Configured via `Framework.boot({ routeMode, routes, defaultPath, defaultView,
unmatchedView, rewrite, hashbang })`. Two modes:

- `"history"` (default): `pushState`/`popstate`, clean URLs. `Router.to`
  triggers change detection manually via `Router.notify()`.
- `"hash"`: `location.hash` with `#!` prefix (configurable via `hashbang`).

```ts
import { Router } from "@lark.js/mvc";

Router.to("/list", { page: 2 }); // navigate with params
Router.to({ page: 3 }); // params only — keeps current path, merges params
Router.to("/detail", { id: "1" }, true); // replace history entry
Router.to("/x", undefined, false, true); // silent (no changed event)

const loc = Router.parse(); // Location (cached per href)
loc.path; // resolved route path
loc.params; // merged query+hash params (hash wins)
loc.get("page", "1"); // param with default
loc.view; // resolved view path (after boot)

Router.diff(); // LocationDiff | undefined
// { params: {page: {from,to}}, path?: {from,to}, view?: {from,to}, changed, force }

Router.join("/a", "b", "../c"); // path normalization (./ ../ //)
```

### Two-phase navigation + guards

Phase 1 `change` (preventable) → beforeEach guards → Phase 2 `changed`
(framework mounts the new view or notifies param observers).

```ts
Router.on("change", (e) => {
  // e.prevent() = suspend; e.reject() = revert URL; e.resolve() = commit
});
Router.on("changed", (e) => {
  /* LocationDiff fields */
});

const unGuard = Router.beforeEach(async (to, from) => {
  if (to.path === "/admin") return await checkAuth(); // false/throw/reject aborts + reverts URL
  return true;
});
unGuard(); // remove
```

Guards run sequentially in registration order; the first `false` short-
circuits. `Router.on("page_unload", (data) => { data.msg = "..." })` hooks
`beforeunload`.

### Views reacting to URL params

```ts
ctx.observeLocation(["page", "size"]); // or "page,size"
ctx.observeLocation({ params: ["id"], path: true }); // also react to path change
```

When observed params change (via `Router.to` or back/forward), the dispatcher
calls the view's `render()` (which reruns `assign()` via `renderMethod` if
present, else digests).

## useUrlState

```ts
import { useUrlState } from "@lark.js/mvc";

export default defineView((ctx) => {
  const [state, setState] = useUrlState(ctx, { page: "1", size: "20" });
  // state: URL params merged over defaults (all strings)
  // auto-calls ctx.observeLocation(["page","size"])
  ctx.updater.set({ page: state.page, size: state.size });
  return {
    template,
    events: {
      "nextPage<click>"() {
        setState((prev) => ({ page: String(Number(prev.page) + 1) })); // → Router.to(patch)
      },
    },
  };
});
```

`setState` only touches the given keys; other URL params are preserved by
`Router.to`'s param-merge behavior. Values are always strings.
