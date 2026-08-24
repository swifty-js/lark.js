/**
 * @lark.js/docs/vite — build-time entry.
 *
 * Re-exports the @swifty.js/docs Vite plugin suite and adds the
 * @swifty.js/sentry dev-server plugin for local error log collection.
 */

export * from "@swifty.js/docs/vite";

export { sentryPlugin, sentryPlugin7, type ISentryPluginOptions } from "@swifty.js/sentry/vite";
