# Router and URL State

History-only router aligned with react-router's data model — **factory-based,
no module-level singleton state** (browser-only: the factory touches
`history`/`location` at creation, so create the router in client boot code).
History mode only; there is no hash routing, no nested routes, no loaders.
Source: `packages/react/src/router.ts` and `src/url-state.ts`.

```tsx
import { createRouter, RouterView, render } from "@lark.js/react";

const router = createRouter(
  [
    { path: "/", component: Home },
    { path: "/users/:id", component: UserDetail },
    { path: "/admin", lazy: () => import("./views/admin") },
    { path: "*", component: NotFound },
  ],
  { basename: "/app" }, // optional
);
render(<RouterView router={router} />, container);
```

`createRouter` also records the instance as the **ACTIVE router** (last
created wins) so `useRouter()` / `<RouterView/>` / `useUrlState()` resolve it
without prop drilling. Under Module Federation share `@lark.js/react` as a
singleton — each copy of the library would otherwise have its own active
pointer.

## Route table and matching

`RouteObject`: `{ path, component?, lazy? }` — a FLAT table.

- `matchPath(pattern, pathname)` supports `:param` dynamic segments (decoded
  via `decodeURIComponent`) and a trailing `*` splat captured as
  `params["*"]`; `*` anywhere else warns and never matches. Static segments
  compare case-insensitively; leading/trailing slashes are ignored.
- `matchRoutes(routes, pathname)` ranks ALL candidates react-router style —
  per segment: static +10, dynamic `:x` +3, splat −2 — and the best score
  wins; ties resolve in registration order. Both helpers are pure exports,
  usable outside the router.

## The RouterApi

```ts
interface RouterApi {
  readonly location: Location; // { pathname, search, hash, state, key }
  readonly match: RouteMatch | null; // { route, params, pathname }
  readonly params: Record<string, string>;
  readonly searchParams: URLSearchParams;
  navigate(
    to: To | number,
    options?: { replace?: boolean; state?: unknown },
  ): Promise<boolean>;
  subscribe(listener: () => void): () => void; // fires per committed navigation
  block(blocker: Blocker): () => void;
  dispose(): void; // detach popstate listener
}
```

- **`location`** has the react-router shape; `pathname` is basename-stripped;
  a FRESH object per committed navigation (its identity is the change marker
  `useRouter` compares). `state` round-trips through `history.state` (stored
  in a history-v5-style wrapper `{usr, key, idx}`); `key` is per-entry.
- **`match` / `params` / `searchParams`** are plain values recomputed at each
  commit (`params` is `{}` when unmatched).
- **`navigate(to, options)`**: `to` is a href string (`"/a?x=1#h"`) or a
  partial `{ pathname?, search?, hash? }` resolved against the current
  location. Navigating to the CURRENT href replaces instead of pushing (no
  duplicate entries); `replace: true` forces replace; `state` lands on
  `location.state`. Resolves `false` when a blocker rejected, `true` on
  commit. `navigate(delta)` (a number) calls `history.go` and resolves `true`
  immediately — the traversal itself commits later via popstate.
- **`block(blocker)`**: `Blocker = (next, current) => boolean | Promise<boolean>`
  — return `false` (or throw) to block; blockers run in registration order,
  first rejection short-circuits. Browser back/forward is consulted AFTER
  the browser already moved (popstate is post-traversal): on rejection the
  router reverts via `history.go(delta)` and swallows the echo popstate.
- **`dispose()`** detaches popstate, clears blockers/listeners, and clears
  the active-router pointer if it points at this instance. Call it in tests.

## Lazy routes

`lazy: () => import("./views/admin")` accepts a module (`{ default }`) or a
bare component. The load starts when an unresolved route first matches;
in-flight loads dedup; the resolved component is CACHED on the route object
(subsequent matches render synchronously). `<RouterView/>` renders `null`
until the load lands, then re-renders; a stale load never overwrites a newer
route (the body re-derives from `router.match`). Load failures PROPAGATE as
unhandled rejections — no swallowing.

## Hooks and RouterView

- **`useRouter(router?)`** — resolves the argument or the active router
  (throws `"no active router"` when neither exists) and subscribes the
  component: it re-renders after every committed navigation. Subscription
  starts in a post-commit effect with an immediate staleness re-check, so a
  navigation between render and subscription is never missed.
- **`useBlocker(blocker)`** — registers for the component's lifetime
  (mount→unmount). The blocker closure is captured on the FIRST render, and
  the hook is non-reactive (holding a blocker does not re-render on
  navigation).
- **`<RouterView router?/>`** — the route outlet. HOSTLESS: the matched
  component's DOM splices directly into the parent. Route change swaps the
  component (old instance unmounted by the diff); **param-only change keeps
  the SAME instance** — hook state survives, so read `useRouter().params`
  fresh each render rather than caching params in `useState`. Renders `null`
  when nothing matches.

## useUrlState — URL search params as state

```tsx
export default function Pager() {
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

`useUrlState(defaults?) → [value, setValue]` (a REAL hook; resolves the
active router via `useRouter`, so URL changes — navigate or back/forward —
re-render the component).

- **`value`**: current params merged over `defaults`, fresh each render.
  With `defaults`, only those keys are read, and an absent or EMPTY (`""`)
  URL value falls back to the default; without `defaults`, every current
  search param is returned. All values are strings — convert numbers
  yourself.
- **`setValue(patch | updater, { replace?, state? })`**: STABLE identity
  (created once per instance; `defaults` and the router are captured on the
  first render). Patches only the given keys; `null`/`undefined` DELETES a
  key; everything else is `String()`-coerced. Pathname, hash, and unrelated
  search params are preserved. Internally it's a `router.navigate` — blockers
  apply, and `replace: true` avoids history spam for things like filters.

## Basename

`{ basename: "/app" }` prefixes all written hrefs and strips before matching
(case-insensitive). `router.location.pathname` is the STRIPPED public path.
A window pathname outside the basename yields `match: null` (and the raw
pathname passes through unstripped).

## Testing patterns (jsdom)

```ts
beforeEach(() => globalThis.history.replaceState(null, "", "/"));
afterEach(() => { render(null, host); router.dispose(); });

render(<RouterView router={router} />, host);
await router.navigate("/about");      // awaiting navigate ALSO flushes the
expect(host.innerHTML).toBe("<p>about</p>"); // subscriber re-render wave
```

Awaiting `navigate()` queues your continuation behind the setState microtask
flush, so the committed DOM is observable without an extra
`await Promise.resolve()`. Lazy-route commits need polling (promise → force →
flush). Worked examples: `packages/react/tests/router.test.ts` (matching,
navigation, blockers, basename) and `tests/router-view.test.tsx` +
`tests/url-state.test.tsx` (outlet, instance preservation, lazy, useUrlState).
