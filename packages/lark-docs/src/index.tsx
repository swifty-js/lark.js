/**
 * @lark.js/docs — main entry.
 *
 * Re-exports the full @swifty.js/docs public API (React theme, types,
 * utilities) and provides a one-stop `bootstrap()` that collapses the
 * entire docs-site app entry into a single call.
 */

// --- @swifty.js/docs full re-export ---
export * from "@swifty.js/docs";

// --- @swifty.js/anti-copy integration ---
export {
  AntiCopy,
  SWIFTY_DOCS_DEFAULT_EXCLUDES,
  isPathExcluded,
  type SwiftyDocsAntiCopyProps,
} from "@swifty.js/anti-copy/swifty-docs";
export {
  createAntiCopy,
  isBrowser,
  DEFAULT_REPLACE_TEXT,
  type AntiCopyOptions,
  type AntiCopyInstance,
  type AntiCopyMode,
  type DevtoolsOptions,
  type ViolationEvent,
  type ViolationType,
} from "@swifty.js/anti-copy";

// --- @swifty.js/sentry integration ---
export { ReactErrorBoundary, type ReactErrorBoundaryProps } from "@swifty.js/sentry/react";
export {
  init,
  destroy,
  isInitialized,
  enablePlugin,
  setUserId,
  setVisitorId,
  getIdentity,
  traceError,
  tracePageView,
  tracePerformance,
  traceCustomEvent,
  sendLocal,
  getBaseInfo,
  getUserId,
  reportFrameworkError,
  type InitOptions,
  type SentryPlugin,
} from "@swifty.js/sentry";

// --- bootstrap ---
import { createRoot } from "react-dom/client";
import {
  createContentGuard,
  DocsProvider,
  DocsLayout,
  LocationProvider,
  type DocsConfig,
  type LoadContentFn,
} from "@swifty.js/docs";
import { AntiCopy, type SwiftyDocsAntiCopyProps } from "@swifty.js/anti-copy/swifty-docs";
import { init, enablePlugin, type InitOptions, type SentryPlugin } from "@swifty.js/sentry";

export interface BootstrapSentryOptions {
  options: InitOptions;
  plugins?: SentryPlugin[];
}

export interface BootstrapOptions {
  /** Docs config from `@swifty-docs/generated`. */
  docsConfig: DocsConfig;
  /** Content loader from `@swifty-docs/generated`. */
  loadContent: LoadContentFn;
  /** Search index loader from `@swifty-docs/generated`. */
  getSearchIndex: () => Promise<unknown[]>;
  /** Dev-mode HMR subscription from `@swifty-docs/generated` (optional). */
  onContentUpdate?: (cb: (routes: string[]) => void) => () => void;

  /**
   * Error monitoring config. Omit to skip sentry integration.
   *
   * ```ts
   * sentry: {
   *   options: { dsn: "/api/log", projectId: "my-docs" },
   *   plugins: [new PerformancePlugin(), new ScreenRecordPlugin()],
   * }
   * ```
   */
  sentry?: BootstrapSentryOptions;

  /**
   * Copy protection config. Omit or `false` to skip.
   * Pass `true` for sensible defaults (mode "replace"), or a full
   * `SwiftyDocsAntiCopyProps` object for fine-grained control.
   */
  antiCopy?: SwiftyDocsAntiCopyProps | boolean;

  /**
   * Render target. Defaults to `document.getElementById("app")`.
   */
  container?: string | HTMLElement;
}

/**
 * One-stop bootstrap for a lark-docs site. Collapses the entire app entry
 * (sentry init, content guard, React render tree) into a single call:
 *
 * ```ts
 * import { bootstrap } from "@lark.js/docs";
 * import { docsConfig, loadContent, getSearchIndex, onContentUpdate } from "@swifty-docs/generated";
 * import "./main.css";
 *
 * bootstrap({
 *   docsConfig,
 *   loadContent,
 *   getSearchIndex,
 *   onContentUpdate,
 *   sentry: import.meta.env.PROD && {
 *     options: { dsn: import.meta.env.VITE_SENTRY_DSN, projectId: "my-docs" },
 *   },
 *   antiCopy: import.meta.env.PROD && { mode: "replace", devtools: true },
 * });
 * ```
 */
export function bootstrap(props: BootstrapOptions): void {
  const { docsConfig, loadContent, getSearchIndex, onContentUpdate, sentry, antiCopy, container } =
    props;

  if (sentry) {
    init(sentry.options);
    if (sentry.plugins?.length) {
      enablePlugin(...sentry.plugins);
    }
  }

  const guard = createContentGuard(loadContent);

  const el =
    typeof container === "string"
      ? document.querySelector(container)
      : (container ?? document.getElementById("app"));

  if (!el) return;

  createRoot(el).render(
    <>
      <guard.ContentGuard />
      <DocsProvider
        config={docsConfig}
        loadContent={guard.loadContent}
        getSearchIndex={getSearchIndex}
        onContentUpdate={onContentUpdate}
      >
        <LocationProvider>
          {antiCopy && (
            <AntiCopy
              {...(typeof antiCopy === "object" ? antiCopy : { mode: "replace" as const })}
            />
          )}
          <DocsLayout />
        </LocationProvider>
      </DocsProvider>
    </>,
  );
}
