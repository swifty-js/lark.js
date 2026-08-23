# Signals, State, Store, Router & useUrlState

Source of truth: `src/reactive.ts`, `src/state.ts`, `src/store.ts`,
`src/router.ts`, `src/url-state.ts`.

## The reactive core (re-exported @preact/signals-core)

```ts
import { signal, computed, effect, batch, untracked } from "@lark.js/mvc";
import type { Signal, ReadonlySignal } from "@lark.js/mvc";

const count = signal(1);                        // count.value read/write
const doubled = computed(() => count.value * 2); // derived, auto-tracked, lazy
const dispose = effect(() => log(count.value));  // runs now + on change
batch(() => { count.value = 2; count.value = 3; }); // one notification
untracked(() => count.value);                    // read without subscribing
count.peek();                                    // same, signal-method form
```

Tracked regions (reads subscribe): **template body**, **computed(fn)**,
**effect / useSignalEffect(fn)**. Everything else (setup body — it runs
inside `untracked()` —, event handlers, async callbacks) reads snapshots.

**Shallow semantics everywhere**: comparison is by reference (`===` /
`Object.is`). In-place mutation is invisible — replace the reference
(`sig.value = [...sig.value, x]`). Same-value writes are no-ops. Writing a
signal that the same tracked region reads throws `Cycle detected`.

Two state layers, choose deliberately:

- **`State`** — singleton for SIMPLE cross-view values (page title, session
  info, toggles, injected app config). No actions, no computed.
- **`createStore`** — zustand-aligned stores for COMPLEX reactive state:
  actions, `computed`, manual subscriptions, multiple instances.

## State (singleton, per-key signals)

```ts
import { State } from "@lark.js/mvc";

State.set({ count: 1, title: "Hello" }); // batched per-key signal writes — DONE.
State.get("count");                       // tracked read (subscribes to "count")
State.get<Record<string, unknown>>();     // snapshot; subscribes to EVERY change
State.on / State.off / State.fire;        // general-purpose pub/sub (non-reactive)
```

There is **no `State.digest()` and no `State.diff()`** — writes notify
tracked readers directly. Views react by reading in the template:

```tsx
export default defineView((ctx) => {
  State.clean("count,title")(ctx); // ref-counted: keys dropped when last reader dies
  const template = jsxTemplate(() => (
    <p>{String(State.get("title"))}: {Number(State.get("count"))}</p>
  ));
  return { template };
});
```

## createStore / computed

```ts
import { createStore, computed } from "@lark.js/mvc";

interface CountStore {
  count: number; step: number; doubled: number;
  increment: () => void;
}

const useCountStore = createStore<CountStore>("count", (set, get) => ({
  count: 0,
  step: 1,
  doubled: computed(() => get().count * 2), // deps AUTO-tracked — no deps array
  increment() { set({ count: get().count + get().step }); },
}));

useCountStore.getState();              // STABLE tracked proxy (see below)
useCountStore.setState({ count: 5 });  // batched; Object.is-equal values skipped
useCountStore.setState((prev) => ({ count: prev.count + 1 }));
const off = useCountStore.subscribe((state, prevState) => { /* manual */ });
useCountStore.destroy();               // clears listeners, removes from registry
```

Semantics (from `src/store.ts`):

- Creator runs once. Functions become **actions** (immune to setState);
  `computed(fn)` return values (ReadonlySignals) become derived slots —
  dependencies are tracked automatically through `get()` proxy reads.
- `getState()` returns ONE stable proxy: reading a key inside a template
  subscribes that view to THAT key only. Spreading it
  (`{ ...getState() }`) yields a plain snapshot including actions.
- Writes to computed/action keys via `setState` are silently ignored;
  unknown keys create new state slots (zustand semantics).
- Store names must be unique (global registry).

In views: **no hook needed** — read `getState()` in the template:

```tsx
const template = jsxTemplate(() => {
  const { count, doubled, increment } = useCountStore.getState();
  return <button onClick={increment}>{count} ×2={doubled}</button>;
});
```

Removed: `bindStore`, `useStore`, and the `computed(deps[], fn)` deps-array
form.

## Router

Configured via `Framework.boot({ routeMode, routes, defaultPath, defaultView,
unmatchedView, rewrite, hashbang })`. Two modes:

- `"history"` (default): `pushState`/`popstate`, clean URLs.
- `"hash"`: `location.hash` with `#!` prefix (configurable via `hashbang`).

```ts
import { Router } from "@lark.js/mvc";

Router.to("/list", { page: 2 }); // navigate with params
Router.to({ page: 3 }); // params only — keeps current path, merges params
Router.to("/detail", { id: "1" }, true); // replace history entry
Router.to("/x", undefined, false, true); // silent (no changed event, no reactive bump)

const loc = Router.parse(); // TRACKED read — location-version signal
loc.path;                   // resolved route path
loc.params;                 // merged query+hash params (hash wins)
loc.get("page", "1");       // param with default
loc.view;                   // resolved view path (after boot)

Router.diff(); // LocationDiff | undefined
Router.join("/a", "b", "../c"); // path normalization (dot segments, doubles)
```

### Reactive navigation (replaces observeLocation)

`Router.parse()` reads an internal location-version signal, bumped on every
non-silent route change. Views that read the URL in a tracked region
re-render automatically:

```tsx
const template = jsxTemplate(() => <p>page {Router.parse().get("page", "1")}</p>);

// Async work driven by navigation (docs-layout pattern):
useSignalEffect(() => {
  const path = Router.parse().path;          // subscribe
  untracked(() => void loadContent(path));   // async body untracked
});
```

Route-VIEW changes still mount through the framework: `Router` fires
`changed` → `Framework` mounts the new root view. Param-only changes are
purely reactive (no dispatcher, no frame-tree walk).

### Two-phase navigation + guards

Phase 1 `change` (preventable) → beforeEach guards → Phase 2 `changed`
(location signal bump + route-view mount).

```ts
Router.on("change", (e) => {
  // e.prevent() = suspend; e.reject() = revert URL; e.resolve() = commit
});
Router.on("changed", (e) => {
  /* LocationDiff fields */
});

const unGuard = Router.beforeEach(async (to, from) => {
  if (to.path === "/admin") return await checkAuth(); // false/throw aborts + reverts
  return true;
});
unGuard(); // remove
```

Guards run sequentially in registration order; the first `false`
short-circuits. `Router.on("page_unload", (data) => { data.msg = "..." })`
hooks `beforeunload`.

## useUrlState

```tsx
import { useUrlState } from "@lark.js/mvc";

export default defineView(() => {
  const [readPage, writePage] = useUrlState({ page: "1", size: "20" });
  // readPage(): URL params merged over defaults (all strings) — a TRACKED
  //   read via Router.parse(); call it IN THE TEMPLATE, not once in setup.
  // writePage(patch | prevFn): Router.to(patch) — other URL params preserved.
  const template = jsxTemplate(() => (
    <button onClick={() => writePage((p) => ({ page: String(Number(p.page) + 1) }))}>
      Page {readPage().page}
    </button>
  ));
  return { template };
});
```

The old signature `useUrlState(ctx, defaults)` → `[state, setState]` is
removed (no ctx arg; returns a tracked getter, not a snapshot).
