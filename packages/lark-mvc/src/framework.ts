/**
 * Copyright (c) 2026 hangtiancheng
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Framework: main entry point for booting the application.
 *
 * Features:
 * - boot() with config
 * - Route-view mount on navigation (all other reactivity flows through signals)
 * - Module loading (require/use)
 * - Utility methods: toUri, parseUri, assign, keys, nodeInside, ensureNodeId,
 *   generateId, mark/unmark, dispatchEvent, delay
 * - waitZoneViewsRendered
 * - Factory access: createEmitter, createCache, defineView
 * - Module access: Router, State, Frame
 */
import { RouterEvents } from "./common";
import {
  assign,
  setFrameworkErrorSink,
  parseUri,
  toUri,
  generateId,
  nodeInside,
  keys,
} from "./utils";
import { mark, unmark } from "./mark";
import { createCache } from "./cache";
import { createEmitter } from "./event-emitter";
import { Router, markRouterBooted } from "./router";
import { State } from "./state";
import { Frame } from "./frame";
import { EventDelegator } from "./event-delegator";
import { defineView } from "./view";
import { hotSwapByView } from "./hmr";
import { isLarkView } from "./jsx/vnode";
import { ensureViewName } from "./view-registry";
import type { FrameworkConfig, ChangeEvent, FrameworkApi } from "./types";

// ============================================================
// Internal state
// ============================================================

// config and use are imported from module-loader.ts to avoid circular dependency with frame.ts
import { config, use } from "./module-loader";

/** Whether framework has booted */
let booted = false;

// ============================================================
// Dispatcher: mount the route view on navigation
// ============================================================

/**
 * Handle router CHANGED events.
 *
 * Only the view-mount branch remains: when the matched route VIEW changes,
 * mount it on the root frame. Param-only and state changes propagate through
 * signals — views re-render via their own render effects (reads of
 * `Router.parse()` / `State.get(key)` / store state subscribe them), so no
 * frame-tree walk is needed.
 */
function dispatcherNotifyChange(e: ChangeEvent): void {
  // The dispatcher only runs after boot, so the root frame is guaranteed
  // to exist. If a caller somehow fires a change event before boot, we
  // silently no-op rather than auto-creating a root.
  const rootFrame = Frame.getRoot();
  if (!rootFrame) return;

  // RouteChangedEvent extends ChangeEvent with LocationDiff fields
  // (path, view, params, etc.). Use "view" in e to narrow.
  if ("view" in e && e.view !== undefined) {
    const view = e.view;
    // View changed, mount new view
    const viewPath =
      typeof view === "object" && view !== null
        ? String(Reflect.get(view, "to") || "")
        : String(view);
    rootFrame.mountView(viewPath);
  }
}

// ============================================================
// DispatchEvent: fire a custom DOM event on an element
// ============================================================

/**
 * Fire a custom DOM event on a target element.
 */
function dispatchEvent(target: EventTarget, eventType: string, eventInit?: CustomEventInit): void {
  const event = new CustomEvent(eventType, {
    bubbles: true,
    cancelable: true,
    ...eventInit,
  });
  target.dispatchEvent(event);
}

// use is imported from module-loader.ts (see top of file)

// ============================================================
// waitZoneViewsRendered
// ============================================================

/** Wait result: OK = rendered, TIMEOUT_OR_NOT_FOUND = not rendered */
export const WAIT_OK = 1;
export const WAIT_TIMEOUT_OR_NOT_FOUND = 0;

/**
 * Wait for all views in a zone to be rendered.
 */
function waitZoneViewsRendered(viewId: string, timeout?: number): Promise<number> {
  if (timeout == null) {
    timeout = 30 * 1000;
  }
  const checkFrame = Frame.get(viewId);
  const endTime = Date.now() + timeout;
  return new Promise((resolve) => {
    const check = (): void => {
      const currentTime = Date.now();
      if (currentTime > endTime || !checkFrame) {
        resolve(WAIT_TIMEOUT_OR_NOT_FOUND);
      } else if (checkFrame.childrenCount === checkFrame.readyCount) {
        resolve(WAIT_OK);
      } else {
        setTimeout(check, 9);
      }
    };
    setTimeout(check, 9);
  });
}

// ============================================================
// Framework object
// ============================================================

/**
 * Public `Framework.getConfig` overload set (see `FrameworkApi.getConfig`).
 * Declared as a free function with explicit overloads so it can satisfy the
 * interface's two-overload shape from inside an object literal.
 */
function getConfigImpl(): FrameworkConfig;
function getConfigImpl<T = unknown>(key: string): T | undefined;
function getConfigImpl<T = unknown>(key?: string): FrameworkConfig | T | undefined {
  if (key === undefined) return config;
  // Generic retrieval from config — cast is unavoidable
  return Reflect.get(config, key) as T | undefined;
}

/**
 * Main framework object.
 * Provides boot, config, and all global utility methods.
 */
export const Framework: FrameworkApi = {
  // ============================================================
  // Lifecycle
  // ============================================================

  /** Read framework configuration. See `FrameworkApi.getConfig`. */
  getConfig: getConfigImpl,

  /**
   * Merge a patch into framework configuration. See `FrameworkApi.setConfig`.
   */
  setConfig<T extends object = Partial<FrameworkConfig>>(
    patch: Partial<FrameworkConfig> & T,
  ): FrameworkConfig & T {
    if (patch && typeof patch === "object") {
      assign(config, patch);
    }
    // Generic merge — cast is unavoidable since T is caller-specified
    return config as FrameworkConfig & T;
  },

  /**
   * Boot the framework.
   */
  boot(cfg?: FrameworkConfig): void {
    // Register the HMR swap function on globalThis so that auto-injected HMR
    // snippets (in view modules) can call it WITHOUT importing @lark.js/mvc
    // (which would create MF shared-consumer side effects and trigger
    // ChunkLoadError). Done in boot() rather than at hmr.ts module load to
    // guarantee execution — webpack tree-shaking can drop hmr.ts's top-level
    // side-effect when its exports are unused by the app (e.g. boot.ts only
    // imports Framework + registerViewClass).
    if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
      globalThis["__lark_hmr__"] = { hotSwapByView };
    }
    // Merge configuration
    if (cfg && typeof cfg === "object") {
      assign(config, cfg);
    }

    // Normalize imported view components to internal registry names —
    // Router and Frame operate on string view paths only.
    if (isLarkView(config.defaultView)) {
      config.defaultView = ensureViewName(config.defaultView);
    }
    if (isLarkView(config.unmatchedView)) {
      config.unmatchedView = ensureViewName(config.unmatchedView);
    }
    if (config.routes) {
      for (const routePath of Object.keys(config.routes)) {
        const entry = config.routes[routePath];
        if (isLarkView(entry)) {
          config.routes[routePath] = ensureViewName(entry);
        } else if (entry && typeof entry === "object" && isLarkView(entry.view)) {
          entry.view = ensureViewName(entry.view);
        }
      }
    }

    // Wire the global error sink so every funcWithTry catch forwards to
    // config.error. Reads config.error dynamically so later setConfig()
    // calls (e.g. from @lark.js/sentry) are picked up without re-booting.
    setFrameworkErrorSink((e: unknown) => {
      const handler = config.error;
      if (handler) {
        handler(e instanceof Error ? e : new Error(String(e)));
      }
    });

    // Set config in Router
    Router._setConfig(config);

    // Set frame getter in EventDelegator
    EventDelegator.setFrameGetter((id: string) => Frame.get(id));

    // Bind router events — the only remaining dispatch path (route-view
    // mount). Param/state changes propagate through signals.
    Router.on(RouterEvents.CHANGED, (data?: ChangeEvent) => {
      if (data) dispatcherNotifyChange(data);
    });

    // Mark as booted
    booted = true;
    markRouterBooted();

    // Create root frame BEFORE Router._bind(), so that when Router.diff()
    // fires CHANGED → dispatcherNotifyChange → Frame.getRoot(), the rootFrame
    // already exists with the correct rootId (e.g. "app").
    // Without this, Frame.createRoot() would default to "root" and the view
    // would render into document.body instead of the intended container.
    const rootFrame = Frame.createRoot(config.rootId);

    // Bind hashchange event
    Router._bind();

    // Mount root view: only if the router didn't already initiate a mount.
    //
    // CRITICAL: check `viewPath` (set synchronously at the top of mountView)
    // instead of `view` (the viewInstance, which is only assigned inside
    // doMountView — AFTER the async view setup load completes).
    //
    // When views are loaded asynchronously (via config.require / dynamic
    // import), Router._bind() → diff() → CHANGED → mountView(routeView)
    // starts an async load. At this point viewPath is already set to the
    // route view, but viewInstance is still undefined. Checking viewInstance
    // here would incorrectly fall back to defaultView, launching a SECOND
    // async mountView(defaultView) in parallel. The signature guard in
    // mountView then makes whichever import resolves first win — and since
    // defaultView is usually a single module while the route view may pull
    // in sub-components, defaultView tends to win, leaving the URL pointing
    // at the route view while defaultView is actually rendered. Subsequent
    // Router.to(routeView) is then a no-op because lastLocation.path already
    // equals routeView, so the user is stuck on the wrong view.
    //
    // viewPath is set synchronously in mountView (before the sync/async
    // branch), so it reliably indicates "a mount has been initiated for
    // this frame" — which is exactly the condition we want to guard on.
    // (boot normalization turned any LarkView defaultView into a string.)
    const defaultView = (config.defaultView as string) || "";
    if (defaultView && !rootFrame.getViewPath()) {
      rootFrame.mountView(defaultView);
    }
  },

  /** Whether framework has booted */
  isBooted(): boolean {
    return booted;
  },

  // ============================================================
  // Utility proxies
  // ============================================================

  /** Mark async callback validity tracker */
  mark,

  /** Unmark (invalidate) async callbacks */
  unmark,

  /** Fire a custom DOM event on a target */
  dispatchEvent,

  /** Promise-based setTimeout */
  delay(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time));
  },

  /** Load modules via configured require */
  use,

  /** Wait for zone views to be rendered */
  waitZoneViewsRendered,

  /**
   * Convert path + params to URL string.
   */
  toUri,

  /**
   * Parse URI string into path and params.
   */
  parseUri,

  WAIT_OK,
  WAIT_TIMEOUT_OR_NOT_FOUND,

  /**
   * Mix properties from source to target.
   */
  assign,

  /**
   * Get object keys.
   */
  keys,

  /**
   * Check if node A is inside node B.
   */
  nodeInside,

  /**
   * Generate globally unique ID.
   */
  generateId,

  /**
   * Cache factory (functional).
   */
  createCache,

  /**
   * Ensure element has an ID.
   */
  ensureNodeId(element: HTMLElement): string {
    if (!element.id) {
      element.id = generateId("l_");
    }
    return element.id;
  },

  /**
   * Base class with EventEmitter.
   */
  createEmitter,

  // ============================================================
  // Module access
  // ============================================================

  /** Router module */
  Router,

  /** State module */
  State,

  /** View factory (functional) */
  defineView,

  /** Frame class */
  Frame,
};
