# @lark.js/sentry

Framework-level [`@swifty.js/sentry`](https://www.npmjs.com/package/@swifty.js/sentry) integration for the [lark-mvc](https://github.com/tianchenghang/lark.js) frontend framework (`@lark.js/mvc`, signals-only) — modeled on Sentry's React and React Router integrations:

| Sentry reference                                         | lark equivalent                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| react-router browser tracing (parameterized route names) | `installRouteTracking` — `PV` events with the matched route pattern        |
| `wrapCreateBrowserRouter`                                | `instrumentRoutes` — lazy-route load failures + load-time metrics          |
| `useProfiler` / `withProfiler`                           | `useProfiler` / `withProfiler` — mount, lifespan, render-count metrics     |
| Redux enhancer state attachment                          | `attachStores` / `createStoreStateHook` — store snapshots on error reports |
| `ErrorBoundary`                                          | **none, by design** — see below                                            |
| (swifty `ExposurePlugin`)                                | `useExposure` — `ref`-callback hook for element exposure tracking          |

The full `@swifty.js/sentry` core API is re-exported, so this package is a drop-in superset: `import { initLarkSentry, traceError, destroy } from "@lark.js/sentry"`.

## Why there is no ErrorBoundary

lark-mvc has no error sink and no try-catch wrappers: errors thrown in component bodies, effects, and event handlers **bubble** to `window.onerror` / `unhandledrejection`, which `@swifty.js/sentry` captures natively (`enableError` / `enableUnhandledRejection`, both on by default). An ErrorBoundary equivalent is neither possible nor necessary — initializing the SDK is all that error reporting requires.

## Installation

```bash
npm install @lark.js/sentry @swifty.js/sentry @lark.js/mvc
```

`@lark.js/mvc` and `@swifty.js/sentry` (>= 0.0.5) are peer dependencies.

## Quick Start

```tsx
import { render, createRouter, RouterView } from "@lark.js/mvc";
import { initLarkSentry, instrumentRoutes } from "@lark.js/sentry";

const router = createRouter(
  instrumentRoutes([
    { path: "/", component: Home },
    { path: "/users/:id", component: UserDetail },
    { path: "/admin", lazy: () => import("./views/admin") },
    { path: "*", component: NotFound },
  ]),
);

initLarkSentry({ dsn: "/api/log", projectId: "lark-app", router });

render(<RouterView router={router} />, document.getElementById("root")!);
```

## API

### `initLarkSentry(options: LarkSentryOptions): () => void`

One-call integration: `init(options)` from `@swifty.js/sentry` plus the lark-mvc instrumentation. Accepts every SDK `init` option, plus:

| Option         | Type                               | Default           | Description                                                    |
| -------------- | ---------------------------------- | ----------------- | -------------------------------------------------------------- |
| `router`       | `RouterApi`                        | the ACTIVE router | The router to observe for route-pattern page views.            |
| `trackRoutes`  | `boolean`                          | `true`            | Install route-pattern tracking.                                |
| `attachStores` | `Record<string, StoreStateSource>` | `undefined`       | Named state sources snapshotted onto every error-class report. |

Create the router **before** calling `initLarkSentry` (or pass `router` explicitly). When no router is resolvable, route tracking is skipped with a `console.warn` instead of throwing, so non-routed apps can still use the one-call form.

Returns an uninstall function for the route tracking; the SDK itself is torn down separately via `destroy()`.

```ts
initLarkSentry({
  dsn: "/api/log",
  projectId: "lark-app",
  router,
  attachStores: {
    cart: cartStore, // anything with getState()
    user: () => ({ id: userStore.getState().id }), // or a selector, to trim large stores
  },
});
```

### `installRouteTracking(router?: RouterApi): () => void`

Installs route-pattern tracking only (use when the app calls the SDK's `init` itself). `router` defaults to the **active** router (the last `createRouter(...)` result) and throws when neither is available. Returns the disposer of the tracking effect.

One `PV` event named `"LarkRoute"` is reported per committed navigation (including the initial location), via a signals `effect` over `router.location` / `router.match`:

| Field           | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| `message`       | `pathname + search` (logical, basename-stripped)                    |
| `extra.pattern` | Matched `RouteObject.path` (`"/users/:id"`), or `null` if unmatched |
| `extra.params`  | Decoded `:param` / `*` captures                                     |
| `extra.href`    | Full `location.href`                                                |

The SDK's native `HistoryChange` / `PageDwell` PV events continue independently; `"LarkRoute"` supplements them with the pattern — the key for grouping page views. Reporting never disturbs rendering: reports run inside `untracked()` and reporter exceptions are swallowed.

### `instrumentRoutes(routes: RouteObject[]): RouteObject[]`

Wraps every `lazy` loader in the table (non-lazy routes pass through unchanged; instrumenting twice is a no-op):

- **success** → `Performance` event `{ name: "LarkLazyRoute", message: route.path, value: elapsedMs }` — code-splitting / Module Federation load time per route pattern;
- **failure** → `OtherFrameworks` framework error with `context: { framework: "lark-mvc", route, phase: "lazy-load" }`, then **rethrows** — the SDK's native `unhandledrejection` capture still fires; this report adds the route context the raw rejection lacks.

Pass the **returned** array to `createRouter` so the router's resolved-component caching works on the wrapped route objects.

### `useProfiler(name: string): void`

Profile the calling component. Reports `Performance` events with `message` = `name`:

| Reported `name`         | When    | `value`                                                                            |
| ----------------------- | ------- | ---------------------------------------------------------------------------------- |
| `LarkComponentMount`    | mount   | ms from the first body run to the mount effect                                     |
| `LarkComponentLifespan` | unmount | ms the instance lived                                                              |
| `LarkComponentRenders`  | unmount | total body runs — an outsized count flags over-subscription in a signals framework |

Rules of hooks apply (call unconditionally at the top level); `name` is captured on the first render.

```tsx
function Dashboard() {
  useProfiler("Dashboard");
  return <main>...</main>;
}
```

### `withProfiler(component, name?): FC`

Wraps a component with `useProfiler` — props (including `children`) pass through unchanged. `name` defaults to the component's function name.

```ts
const ProfiledChart = withProfiler(ThirdPartyChart, "Chart");
```

### `useExposure(options?): (el: Element | null) => void`

Declarative element exposure tracking over the SDK's `ExposurePlugin` (one shared instance, lazily registered via `enablePlugin`). Returns a slot-stable `ref` callback: the element is observed after commit and unobserved on unmount. The `Exposure` event is reported when a visible element leaves the viewport.

| Option      | Type                      | Default | Description                              |
| ----------- | ------------------------- | ------- | ---------------------------------------- |
| `threshold` | `number` (0-1)            | `0.5`   | Intersection ratio threshold.            |
| `params`    | `Record<string, unknown>` | `{}`    | Custom parameters included in the event. |

Options are captured on the first render. Telemetry failures are logged and swallowed — they never crash rendering.

```tsx
function Banner() {
  const exposureRef = useExposure({ threshold: 0.75, params: { bannerId: "b1" } });
  return <div ref={exposureRef}>...</div>;
}
```

### `createStoreStateHook(stores, next?): ReportDataHook`

Builds an `onBeforeReportData` hook that attaches store snapshots — as a top-level `storeState` field — to error-class reports only (`Error`, `UnhandledRejection`, `Resource`, `Vue`, `React`, `OtherFrameworks`; the same set that carries breadcrumbs). Your own `next` hook runs **first**, and its transform / `false` drop / Promise result is honored.

`StoreStateSource` is anything with a zustand-style `getState()` (a lark `createStore` store) or a selector function. Snapshots are JSON-round-tripped (store actions dropped, circular state collapses to `{ $unserializable: true }`) so the reporter's transport can never throw, and are taken inside `untracked()` so reading a store proxy never subscribes a component.

Prefer the `attachStores` option of `initLarkSentry`, which wires this up for you.

## What Gets Captured

### By the SDK core, automatically (no framework hook needed)

- Runtime errors and unhandled rejections — lark errors bubble here by design
- XHR/fetch requests, declarative clicks, hash/history navigation
- PageLoad / dwell-time PV, white screen, performance plugins

### By this package

- `"LarkRoute"` PV per navigation, with the matched route pattern and params
- `"LarkLazyRoute"` load-time metric and route-context errors for lazy routes
- `"LarkComponent*"` metrics for profiled components
- `Exposure` events for `useExposure`-observed elements
- `storeState` snapshots on error-class reports (`attachStores`)

## Other Entry Points

`@lark.js/sentry/plugins`, `@lark.js/sentry/vite`, and `@lark.js/sentry/webpack` re-export the matching `@swifty.js/sentry` subpaths, so one dependency serves the whole toolchain (SDK plugins, dev-server mock endpoint with source-map resolution).

## License

MIT
