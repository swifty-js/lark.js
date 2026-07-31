# @lark.js/sentry

`@swifty.js/sentry` framework-level integration for the [Lark Mvc](https://github.com/tianchenghang/lark.js) frontend framework (`@lark.js/mvc`).

Lark Mvc intentionally swallows most user-code exceptions inside its dispatch pipeline (delegated DOM event handlers, emitter listeners, dispatcher-triggered renders), so the SDK's global `window.onerror` capture never sees them. This package instruments the framework's public seams and reports those errors to `@swifty.js/sentry` as `OtherFrameworks` events with structured lifecycle context — without changing framework behavior (every error is rethrown after reporting).

## Installation

```bash
npm install @lark.js/sentry @swifty.js/sentry @lark.js/mvc
```

`@lark.js/mvc` and `@swifty.js/sentry` are peer dependencies.

## Quick Start

Call `initLarkSentry` **after** `Framework.boot(...)` — boot merges the user configuration into the live config object, so the instrumentation must wrap the final `error` / `require` entries:

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

`initLarkSentry` accepts the full `@swifty.js/sentry` `init` options plus the integration options, initializes the SDK, and installs the framework instrumentation. It returns an uninstall function (the SDK itself is torn down separately via `destroy()` from `@swifty.js/sentry`).

## What Gets Captured

| Seam                         | Phase         | Notes                                                                                                |
| ---------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| View setup functions         | `"setup"`     | Errors thrown while running `defineView` setups.                                                     |
| Compiled template rendering  | `"template"`  | Errors thrown during `updater.digest()`.                                                             |
| Delegated DOM event handlers | `"event"`     | Includes the event map key (e.g. `"increment<click>"`). Lark Mvc swallows these silently by default. |
| View `assign()` functions    | `"assign"`    | Per-render data assignment errors.                                                                   |
| `FrameworkConfig.error`      | `"framework"` | Framework-reported errors such as lazy view-loading failures.                                        |

Every report carries a `LarkErrorContext` (`phase`, `viewId`, `viewPath`, `eventKey`) in the event's `extra.context` field, alongside `framework: "lark-mvc"`.

Browser-level capture (runtime errors, unhandled rejections, XHR/fetch, PV and dwell time, white screen, performance plugins, declarative `s-swifty-*` click tracking in `.html` templates) is provided by the `@swifty.js/sentry` core and works with Lark Mvc out of the box.

## API

### `initLarkSentry(options: LarkSentryOptions): () => void`

One-call integration: `init(options)` from `@swifty.js/sentry` plus `installLarkInstrumentation`. `LarkSentryOptions = InitOptions & LarkIntegrationOptions`.

### `installLarkInstrumentation(options?: LarkIntegrationOptions): () => void`

Installs the framework instrumentation only (use when the app initializes the SDK itself). Wraps `FrameworkConfig.error` and `FrameworkConfig.require` so every lazily loaded view setup is instrumented automatically. Idempotent: a second call returns the existing uninstaller. The returned function restores the previous configuration.

### `instrumentView<T>(setup: ViewSetup<T>, options?: InstrumentViewOptions): ViewSetup<T>`

Wraps a single view setup function. Needed for views registered synchronously via `registerViewClass`, which bypass the `require` loader:

```ts
import { defineView, registerViewClass } from "@lark.js/mvc";
import { instrumentView } from "@lark.js/sentry";

registerViewClass("views/home", instrumentView(homeSetup, { viewPath: "views/home" }));
```

### `setLarkErrorSink(sink: LarkErrorSink | undefined): LarkErrorSink`

Replaces the destination of captured errors (default: report to `@swifty.js/sentry`). Pass `undefined` to restore the default sink. Returns the previous sink.

### `reportLarkError(error: unknown, context: LarkErrorContext, sink?: LarkErrorSink): void`

Manually report an error through the active (or given) sink. Sink failures are suppressed so reporting never disturbs framework control flow.

## Types

```ts
type LarkErrorPhase = "setup" | "template" | "event" | "assign" | "framework";

interface LarkErrorContext {
  readonly phase: LarkErrorPhase;
  readonly viewId?: string;
  readonly viewPath?: string;
  readonly eventKey?: string;
}

type LarkErrorSink = (error: unknown, context: LarkErrorContext) => void;

interface LarkIntegrationOptions {
  readonly onError?: LarkErrorSink;
}

interface InstrumentViewOptions {
  readonly viewPath?: string;
  readonly onError?: LarkErrorSink;
}
```

## License

MIT
