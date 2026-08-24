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
 * - Route dispatch: every confirmed navigation renders the matched component
 *   into the root container via `render()` (React-DOM style) — the diff keeps
 *   the same component's instance (state survives param-only changes) and
 *   pushes fresh URL params as props
 * - Module loading (require/use) for lazily registered route components
 * - Utility methods: toUri, parseUri, assign, keys, nodeInside, ensureNodeId,
 *   generateId, dispatchEvent, delay
 * - Factory access: createEmitter, createCache
 * - Module access: Router, State
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
import { createCache } from "./cache";
import { createEmitter } from "./event-emitter";
import { Router, markRouterBooted } from "./router";
import { State } from "./state";
import { render } from "./jsx/reconcile";
import { createVNode, type Component } from "./jsx/vnode";
import { hotSwapByComponent } from "./hmr";
import { getComponent, registerComponent, ensureComponentName } from "./component-registry";
import type { FrameworkConfig, FrameworkApi } from "./types";

// ============================================================
// Internal state
// ============================================================

// config and use are imported from module-loader.ts to avoid circular deps.
import { config, use } from "./module-loader";

/** Whether framework has booted */
let booted = false;

/** Root container the route components render into. */
let rootContainer: Element | undefined;

/** Monotonic navigation token — guards async route-component loads. */
let navSeq = 0;

// ============================================================
// Route dispatch: render the matched component into the root
// ============================================================

/** Resolve (and lazily create) the root container element. */
function resolveRootContainer(): Element {
  const id = config.rootId || "root";
  let el = document.getElementById(id);
  if (!el) {
    el = document.body;
    el.id = id;
  }
  return el;
}

/**
 * Render the route component for `viewPath` into the root container.
 *
 * Synchronous when the component is registered; otherwise loads it through
 * `config.require` (Module Federation / dynamic import), guarded by a
 * navigation token so a stale load never overwrites a newer route.
 *
 * The current URL params are passed as props (refreshed on every navigation
 * since each CHANGED re-renders). Components can also read `Router.parse()`
 * directly for tracked URL access.
 */
function mountRoute(viewPath: string): void {
  const container = rootContainer;
  if (!container) return;
  const token = ++navSeq;
  const parsed = parseUri(viewPath);
  const name = parsed.path;
  if (!name) return;

  const renderRoute = (fn: Component): void => {
    const params: Record<string, unknown> = { ...Router.parse().params, ...parsed.params };
    render(createVNode(fn, params), container);
  };

  const registered = getComponent(name);
  if (registered) {
    renderRoute(registered);
    return;
  }

  use(name, (loadedModule: unknown) => {
    // Guard: a newer navigation may have started during the async load.
    if (token !== navSeq) return;
    if (typeof loadedModule === "function") {
      registerComponent(name, loadedModule as Component);
      renderRoute(loadedModule as Component);
    } else {
      const errorHandler = config.error;
      if (errorHandler) {
        errorHandler(new Error(`Cannot load view: ${name}`));
      }
    }
  });
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
    // snippets (in component modules) can call it WITHOUT importing
    // @lark.js/mvc (which would create MF shared-consumer side effects and
    // trigger ChunkLoadError). Done in boot() rather than at hmr.ts module
    // load to guarantee execution — webpack tree-shaking can drop hmr.ts's
    // top-level side-effect when its exports are unused by the app.
    if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
      globalThis["__lark_hmr__"] = { hotSwapByComponent };
    }
    // Merge configuration
    if (cfg && typeof cfg === "object") {
      assign(config, cfg);
    }

    // Normalize imported components to internal registry names — the Router
    // operates on string view paths only.
    if (typeof config.defaultView === "function") {
      config.defaultView = ensureComponentName(config.defaultView);
    }
    if (typeof config.unmatchedView === "function") {
      config.unmatchedView = ensureComponentName(config.unmatchedView);
    }
    if (config.routes) {
      for (const routePath of Object.keys(config.routes)) {
        const entry = config.routes[routePath];
        if (typeof entry === "function") {
          config.routes[routePath] = ensureComponentName(entry);
        } else if (entry && typeof entry === "object" && typeof entry.view === "function") {
          entry.view = ensureComponentName(entry.view);
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

    // Every confirmed navigation re-renders the root: route-view changes
    // swap the component; param-only changes diff into fresh props on the
    // SAME instance (state survives). Reactive URL reads (Router.parse())
    // keep working independently of this dispatch.
    Router.on(RouterEvents.CHANGED, () => {
      const view = Router.parse().view;
      if (view) mountRoute(view);
    });

    // Mark as booted
    booted = true;
    markRouterBooted();

    // Resolve the root container BEFORE Router._bind(), so that when the
    // initial diff() fires CHANGED → mountRoute, the container exists with
    // the configured rootId.
    rootContainer = resolveRootContainer();

    // Bind hashchange/popstate
    Router._bind();

    // Mount the default view only if the router didn't already initiate a
    // mount (navSeq is bumped synchronously at the top of mountRoute, before
    // any async load — so it reliably indicates "a mount has started").
    const defaultView = (config.defaultView as string) || "";
    if (defaultView && navSeq === 0) {
      mountRoute(defaultView);
    }
  },

  /** Whether framework has booted */
  isBooted(): boolean {
    return booted;
  },

  // ============================================================
  // Utility proxies
  // ============================================================

  /** Fire a custom DOM event on a target */
  dispatchEvent,

  /** Promise-based setTimeout */
  delay(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time));
  },

  /** Load modules via configured require */
  use,

  /**
   * Convert path + params to URL string.
   */
  toUri,

  /**
   * Parse URI string into path and params.
   */
  parseUri,

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
   * Emitter factory (functional).
   */
  createEmitter,

  // ============================================================
  // Module access
  // ============================================================

  /** Router module */
  Router,

  /** State module */
  State,
};
