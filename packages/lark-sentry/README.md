# @lark.js/sentry

`@swifty.js/sentry` integration for the [Lark Mvc](https://github.com/tianchenghang/lark.js) frontend framework (`@lark.js/mvc`).

Lark Mvc routes every framework-internal error (delegated DOM event handlers, emitter listeners, dispatcher-triggered renders, `useEffect` cleanups, etc.) through `FrameworkConfig.error` via its `funcWithTry` utility. This package hooks that single seam and reports errors to `@swifty.js/sentry` as `OtherFrameworks` events — no monkey-patching, no per-view wrapping.

## Installation

```bash
npm install @lark.js/sentry @swifty.js/sentry @lark.js/mvc
```

`@lark.js/mvc` (>= 0.0.24) and `@swifty.js/sentry` (>= 0.0.3) are peer dependencies.

## Quick Start

Call `initLarkSentry` after `Framework.boot(...)`:

```ts
import { Framework } from "@lark.js/mvc";
import { initLarkSentry } from "@lark.js/sentry";

Framework.boot({
  rootId: "app",
  routeMode: "history",
  defaultPath: "/home",
  defaultView: "home",
  routes: { "/home": "home" },
  require: (names) => Promise.all(names.map((n) => import(`./views/${n}`).then((m) => m.default))),
});

const uninstall = initLarkSentry({
  dsn: "/api/log",
  projectId: "lark-app",
});
```

`initLarkSentry` accepts the full `@swifty.js/sentry` `init` options, initializes the SDK, and installs the framework error hook. It returns an uninstall function (the SDK itself is torn down separately via `destroy()` from `@swifty.js/sentry`).

## What Gets Captured

Every error that passes through `funcWithTry` inside the framework is reported. This covers:

- Delegated DOM event handlers (the events map in view descriptors)
- Emitter listeners registered via `ctx.on` / `useEvent`
- Dispatcher-triggered renders and template execution
- `useEffect` cleanup functions at unmount
- View `assign()` functions
- Lazy view-loading failures (via module-loader)

Each report carries `context: { framework: "lark-mvc" }` in the event's `extra` field.

Browser-level capture (runtime errors, unhandled rejections, XHR/fetch, PV and dwell time, white screen, performance plugins) is provided by the `@swifty.js/sentry` core and works with Lark Mvc out of the box.

## API

### `initLarkSentry(options: LarkSentryOptions): () => void`

One-call integration: `init(options)` from `@swifty.js/sentry` plus `installLarkSentry()`. `LarkSentryOptions` is a re-export of `InitOptions` from `@swifty.js/sentry`.

### `installLarkSentry(): () => void`

Installs the `FrameworkConfig.error` hook only (use when the app initializes the SDK itself). Any previously configured `error` handler is preserved and still runs after the report. The returned function restores the previous handler.

## License

MIT
