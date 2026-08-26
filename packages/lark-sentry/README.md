# @lark.js/sentry

`@swifty.js/sentry` integration for the [lark-mvc](https://github.com/tianchenghang/lark.js) frontend framework (`@lark.js/mvc`, v0.0.32+ signals-only).

lark-mvc has no error sink and no try-catch wrappers: errors thrown in component bodies, effects, and event handlers **bubble** to `window.onerror` / `unhandledrejection`, which `@swifty.js/sentry` captures natively (`enableError` / `enableUnhandledRejection`, on by default). What the SDK cannot infer on its own is the **matched route pattern** (`/users/:id` instead of `/users/42`) — the key for grouping page views. This package subscribes to the Lark router's signals and reports one `PV` event per committed navigation, carrying the pattern and the decoded params.

## Installation

```bash
npm install @lark.js/sentry @swifty.js/sentry @lark.js/mvc
```

`@lark.js/mvc` (>= 0.0.32) and `@swifty.js/sentry` (>= 0.0.5) are peer dependencies.

## Quick Start

```tsx
import { render, createRouter, RouterView } from "@lark.js/mvc";
import { initLarkSentry } from "@lark.js/sentry";

const router = createRouter([
  { path: "/", component: Home },
  { path: "/users/:id", component: UserDetail },
  { path: "*", component: NotFound },
]);

const uninstall = initLarkSentry({ dsn: "/api/log", projectId: "lark-app" }, router);

render(<RouterView router={router} />, document.getElementById("root")!);
```

`initLarkSentry` accepts the full `@swifty.js/sentry` `init` options, initializes the SDK, and installs the route tracking. It returns an uninstall function for the tracking (the SDK itself is torn down separately via `destroy()` from `@swifty.js/sentry`).

## What Gets Captured

### By the SDK core, automatically (no framework hook needed)

- Runtime errors and unhandled rejections — Lark errors bubble here by design
- XHR/fetch requests, declarative clicks, hash/history navigation
- PageLoad / dwell-time PV, white screen, performance plugins

### By this package — `"LarkRoute"` page views

One `PV` event named `"LarkRoute"` per committed navigation (including the initial location), reported through a signals `effect` over `router.location` / `router.match`:

| Field           | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| `message`       | `pathname + search` (logical, basename-stripped)                    |
| `extra.pattern` | Matched `RouteObject.path` (`"/users/:id"`), or `null` if unmatched |
| `extra.params`  | Decoded `:param` / `*` captures                                     |
| `extra.href`    | Full `location.href`                                                |

Reporting never disturbs rendering: the report runs inside `untracked()` and reporter exceptions are swallowed.

## API

### `initLarkSentry(options: InitOptions, router?: RouterApi): () => void`

One-call integration: `init(options)` from `@swifty.js/sentry` plus `installLarkSentry(router)`.

### `installLarkSentry(router?: RouterApi): () => void`

Installs the route tracking only (use when the app initializes the SDK itself). `router` defaults to the **active** router (the last `createRouter(...)` result) and throws when neither is available. The returned function disposes the tracking effect.

## License

MIT
