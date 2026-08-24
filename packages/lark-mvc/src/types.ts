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
 * Lark framework type definitions.
 *
 * This module is the **single source of truth** for all shared types across
 * the framework. Defining them here (rather than inline in each module)
 * enforces a consistent interface contract and prevents circular type imports.
 *
 * ## Framework architecture
 *
 * Lark is a lightweight frontend framework for single-page applications
 * and micro-frontend scenarios:
 *
 * - **Component** — plain function components `(props) => JSXNode` (`FC<P>`),
 *   mounted hostless by the VNode reconciler; state via hooks
 * - **Router** — history/hash two-phase route confirmation with async guards
 * - **State** — simple cross-view observable singleton (for lightweight data)
 * - **Store** — zustand-aligned state management with `createStore` /
 *   `getState` / `setState` / `subscribe` / `computed` (for complex reactive state)
 * - **Query** — TanStack-style async state on signals (`createQuery`/`useQuery`)
 * - **Service** — API request management with LFU caching, deduplication,
 *   serial queuing, and lifecycle events
 *
 * ## Design principles
 *
 * - Functional API — no `class`, no `this`, no `prototype`, no `mixin`
 * - Signals-based reactivity (`@preact/signals-core`) — read = subscribe,
 *   write = re-render; shallow (reference) comparison
 * - Direct VNode → DOM reconciliation (hostless component instances, keyed
 *   diff, per-node event listeners)
 * - Module Federation support for micro-frontends
 */

import type { Component } from "./jsx/vnode";

// ============================================================
// Function types
// ============================================================

/** Generic function type for event handlers and callbacks.
 *  Uses any[] to accept callbacks with specific parameter types
 *  (TypeScript function parameters are contravariant).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunc = (...args: any[]) => unknown;

// ============================================================
// Cache types
// ============================================================

export interface CacheEntry<T> {
  /** Original key without prefix */
  originalKey: string;
  /** Cached value */
  value: T | undefined;
  /** Access frequency count */
  frequency: number;
  /** Last access timestamp */
  lastTimestamp: number;
}

export interface CacheOptions<T> {
  /** Maximum cache size before eviction triggers (default: 20) */
  maxSize?: number;
  /** Buffer size for eviction (default: 5) */
  bufferSize?: number;
  /** Callback when entry is removed */
  onRemove?: (key: string) => void;
  /** Comparator for sorting entries */
  sortComparator?: (a: CacheEntry<T>, b: CacheEntry<T>) => number;
}

// ============================================================
// Event types
// ============================================================

export interface EventListenerEntry {
  /** Handler function */
  handler: AnyFunc;
}

// ============================================================
// URI / Location types
// ============================================================

/**
 * Parsed URL result containing path and parameters.
 * Returned by `Router.parse()`, includes the path string and parsed key-value parameter pairs.
 */
export interface ParsedUri {
  /** Path portion (before ? or #), excluding query parameters */
  path: string;
  /** Key-value params parsed from the URL */
  params: Record<string, string>;
}

/**
 * Current URL parsing result interface.
 * Returned by `Router.parse()`, includes both query (after ?) and hash (after #) sections.
 */
export interface Location {
  /** Full href, original href string */
  href: string;
  /** Query string (before #), raw query string (after ?, before #) */
  srcQuery: string;
  /** Hash string (after #), raw hash string (after #) */
  srcHash: string;
  /** Parsed query object, path and params parsed from srcQuery */
  query: ParsedUri;
  /** Parsed hash object, path and params parsed from srcHash */
  hash: ParsedUri;
  /**
   * Merged params from query and hash,
   * hash values take precedence when keys conflict.
   */
  params: Record<string, string>;
  /**
   * Resolved view path for the current URL.
   * May be undefined before framework boot.
   */
  view?: string;
  /**
   * Resolved path computed from hash path and query path based on routing rules.
   * May be undefined before framework boot.
   */
  path?: string;
  /**
   * Get param by key with optional default value.
   * Returns default value or empty string if key does not exist.
   * @param key Parameter key name
   * @param defaultValue Default value when key is missing, defaults to empty string
   */
  get: (key: string, defaultValue?: string) => string;
}

/**
 * URL parameter change representing a parameter value transition from old to new.
 * Used in `Router.diff()` return value to describe parameter changes.
 */
export interface ParamDiff {
  /** Value before the change */
  from: string;
  /** Value after the change */
  to: string;
}

/**
 * URL route change object interface describing changes between two routing states.
 * Returned by `Router.diff()`, includes changes in path, view, and other parameters.
 */
export interface LocationDiff {
  /**
   * Changed params (key -> {from, to}),
   * diff for all changed parameters
   */
  params: Record<string, ParamDiff>;
  /** Path diff when path has changed */
  path?: ParamDiff;
  /** View diff when rendered view has changed */
  view?: ParamDiff;
  /** Whether any content has changed */
  changed: boolean;
}

/**
 * Route pre-change event interface (change phase).
 * Provides two-phase confirmation: triggers change (can be rejected), then changed.
 * Can prevent, reject, or accept route changes through this event object.
 */
export interface RouteChangeEvent extends ChangeEvent {
  /**
   * Reject the URL change, revert to previous URL.
   */
  reject: () => void;
  /**
   * Accept the URL change, continue navigation.
   */
  resolve: () => void;
  /**
   * Prevent the URL change, pause subsequent route processing.
   */
  prevent: () => void;
}

/**
 * Route post-change event interface (changed phase).
 * Carries route diff information. Triggered after route change is confirmed and URL is updated.
 */
export type RouteChangedEvent = LocationDiff & ChangeEvent;

// ============================================================
// DOM types
// ============================================================

/**
 * Value for the JSX `ref` prop: a callback receiving the element (and `null`
 * on unmount), or a mutable `{ current }` cell (see `useRef`).
 */
export type RefValue = ((el: Element | null) => void) | { current: Element | null };

// ============================================================
// Component types
// ============================================================

/**
 * A function component (React-FC style): receives the reactive props proxy
 * and returns JSX. The function re-runs per render inside the instance's
 * render effect; state lives in hooks (`useSignal`, `useEffect`, ...).
 *
 * Alias of `Component<P>` for React muscle memory.
 */
export type FC<P = Record<string, unknown>> = Component<P>;

/**
 * Router interface providing URL parsing, navigation, diff, and event listening capabilities.
 * Supports two-phase route confirmation mechanism: change (can reject) → changed.
 * Hash-based implementation using #! as default hash prefix.
 */
export interface RouterApi {
  /** Bind event listener */
  on(event: string, handler: (e?: ChangeEvent) => void): this;
  /** Unbind event listener */
  off(event: string, handler?: AnyFunc): this;
  /** Fire event */
  fire(event: string, data?: Record<string, unknown>, remove?: boolean): this;
  /**
   * Parse href into Location object.
   * Parses query and hash sections of href, returns structured routing information.
   * Defaults to parsing current page `location.href`.
   * @param href URL to parse, uses `location.href` if not specified
   */
  parse(href?: string): Location;
  /**
   * Compute diff between current and previous location.
   * Returns undefined if no routing changes have occurred yet.
   */
  diff(): LocationDiff | undefined;
  /**
   * Navigate to new URL.
   * Supports two calling modes:
   * - `Router.to("/list", { page: 2 })` specify path and params
   * - `Router.to({ page: 2 })` update params only, keep current path
   * @param pathOrParams Path string or params object
   * @param params Query params object (only used when first arg is path string)
   * @param replace Whether to replace current history entry instead of adding new one
   * @param silent Whether to silently update without triggering change event
   */
  to(
    pathOrParams: string | Record<string, unknown>,
    params?: Record<string, unknown>,
    replace?: boolean,
    silent?: boolean,
  ): void;
  /** Join path segments */
  join(...paths: string[]): string;
  /**
   * Register an async-friendly navigation guard.
   *
   * Each guard is invoked with the parsed `(to, from)` Locations. Guards
   * may return a Promise; the router awaits all guards in registration
   * order. If any guard:
   *
   * - returns / resolves to `false`,
   * - throws or rejects,
   *
   * the navigation is aborted and the URL is reverted. Returning `true`,
   * `undefined`, or any non-false value permits the navigation.
   *
   * Returns an unsubscribe function so the guard can be torn down (e.g.
   * inside a view's `destroy` handler).
   */
  beforeEach(guard: (to: Location, from: Location) => boolean | Promise<boolean>): () => void;
  /** Internal: bind hashchange (called by Framework.boot) */
  _bind(): void;
  /** Internal: set framework config */
  _setConfig(cfg: FrameworkConfig): void;
  /** Internal: notify hash change (for programmatic trigger) */
  notify?(e?: Event): void;
  /**
   * Triggered when URL is about to change (change phase), can reject or prevent navigation via event object.
   */
  onChange?: (e?: RouteChangeEvent) => void;
  /**
   * Triggered after URL has changed (changed phase), carries route diff information.
   */
  onChanged?: (e?: RouteChangedEvent) => void;
}

// ============================================================
// Functional API interfaces (replace class-based interfaces above)
// ============================================================

/**
 * Functional emitter API.
 *
 * Returned by `createEmitter()`. No `this` binding — handlers are called
 * with `null` context. Methods return the API object for chaining.
 */
export interface EmitterApi<T = unknown> {
  on(name: string, fn: (e?: ChangeEvent) => void): EmitterApi<T>;
  off(name: string, fn?: AnyFunc): EmitterApi<T>;
  fire(
    name: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): EmitterApi<T>;
}

/**
 * Functional cache API.
 *
 * Returned by `createCache()`.
 */
export interface CacheApi<T = unknown> {
  set(key: string, resource: T): void;
  get(key: string): T | undefined;
  del(key: string): void;
  has(key: string): boolean;
  clear(): void;
  forEach(callback: (value: T | undefined) => void): void;
  getSize(): number;
}

// ============================================================
// Service types
// ============================================================

/**
 * Data payload interface wrapping API request response data, providing read/write methods.
 * Payload instances are created internally by Service, developers access via all/one/save callbacks.
 */
export interface PayloadApi {
  /**
   * Get data from Payload by key.
   * @param key Data key name
   */
  get<T = unknown>(key: string): T;
  /**
   * Set data to Payload, supports three calling modes:
   * - Key-value pair: `payload.set("name", "value")`
   * - Data object: `payload.set({ name: "value" })`
   * - Endpoint metadata object (for internal framework use)
   * Returns this for chaining.
   * @param keyOrData Key/value string, data object, or endpoint metadata object
   * @param value Value when first parameter is a key
   */
  set(keyOrData: string | Record<string, unknown> | ServiceMetaEntry, value?: unknown): PayloadApi;
  data: Record<string, unknown>;
  cacheInfo?: ServiceCacheInfo;
}

/**
 * Change event object.
 */
export interface ChangeEvent {
  /**
   * Event type.
   */
  readonly type: string;
  /**
   * Set of changed data keys. Use `keys.has(name)` to check membership.
   */
  readonly keys?: ReadonlySet<string>;
}

/**
 * Global state interface providing cross-view data sharing backed by per-key
 * signals: reads in tracked regions subscribe, `set()` notifies directly.
 * Supports `clean()` for ref-counted key cleanup.
 *
 * Use State for SIMPLE cross-view data (lightweight shared values: counters,
 * toggles, page title, session info, etc.). For COMPLEX reactive state —
 * handlers, derived data, or fine-grained subscriptions — use `createStore` instead.
 */
export interface StateApi {
  /** Bind event listener */
  on(event: string, handler: (e?: ChangeEvent) => void): this;
  /** Unbind event listener */
  off(event: string, handler?: AnyFunc): this;
  /** Fire event */
  fire(event: string, data?: Record<string, unknown>, remove?: boolean): this;
  /**
   * Get data from global state, returns complete state object if key is omitted.
   * @param key Data key name, omitted returns complete state object
   */
  get<T = unknown>(key?: string): T;
  /**
   * Set global state data. Writes are batched per-key signal writes —
   * subscribed readers re-render automatically (no digest call exists).
   * @param data Data object, e.g., `{ a: 1, b: 2 }`
   * @param excludes Set of keys to exclude from change tracking
   */
  set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): this;
  /**
   * Observe state keys with ref-counted cleanup. Returns a dispose function;
   * when the last observer disposes, the key's data and signal are dropped.
   * In a component: `useEffect(() => State.clean("a,b"), [])`.
   * @param keys Comma-separated key string
   */
  clean(keys: string): () => void;
  onChanged?: (e?: ChangeEvent) => void;
}

/** Pending cache entry for deduplication (internal to Service) */
export interface PendingCacheEntry extends Array<unknown> {
  /** Reference to the pending Payload entity */
  entity?: unknown;
}

/**
 * Endpoint metadata configuration for registering an API endpoint with Service.
 * Each meta describes endpoint's URL, cache strategy, before/after interceptors, etc.
 */
export interface ServiceMetaEntry {
  /**
   * Endpoint name,
   * Unique name for endpoint metadata, must be unique within same Service.
   */
  name: string;
  /** Request URL, required. */
  url: string;
  /**
   * Cache TTL in ms, 0 = no cache.
   * Cache validity time in milliseconds.
   * 0 means no caching.
   * Greater than 0 means cache TTL, reuse cached data within this time range.
   */
  cache?: number;
  /**
   * Before-fetch hook.
   * Hook function called before request is sent, can process request data.
   * @param payload Data carrier for current request
   */
  before?: (payload: PayloadApi) => void;
  /** Additional properties */
  [k: string]: unknown;
}

/** Cache info attached to Payload entity */
export interface ServiceCacheInfo {
  /** Endpoint name */
  name: string;
  /** Cache key */
  key: string;
  /** Timestamp when cached */
  time: number;
}

export interface FrameworkApi {
  /**
   * Read framework configuration.
   * - Without arguments: returns the complete config object.
   * - With a key: returns just `config[key]` (untyped — use a generic to
   *   constrain the return type if you know the key's shape).
   *
   * `getConfig` is a pure read — call `setConfig(patch)` to mutate.
   */
  getConfig(): FrameworkConfig;
  getConfig<T = unknown>(key: string): T | undefined;

  /**
   * Merge a patch into the framework configuration and return the merged
   * config object.
   */
  setConfig<T extends object = Partial<FrameworkConfig>>(
    patch: Partial<FrameworkConfig> & T,
  ): FrameworkConfig & T;
  /**
   * App initialization entry point, starts framework and renders root view.
   * After invocation: merge config → bind route events → create root Frame → mount default view.
   * @param cfg Config object
   */
  boot(cfg: FrameworkConfig): void;
  /**
   * Convert path and params to URL string.
   * Example: `Framework.toUri('/xxx/', {a:'b',c:'d'})` => `/xxx/?a=b&c=d`
   * @param path Path string
   * @param params Params object
   * @param keepEmpty Set of keys whose empty values should be preserved
   */
  toUri(path: string, params?: Record<string, unknown>, keepEmpty?: Set<string>): string;
  /**
   * Parse URL string to path and params object.
   * Example: `Framework.parseUri('/xxx/?a=b&c=d')` => `{path:'/xxx/', params:{a:'b',c:'d'}}`
   * @param url URL string
   */
  parseUri(url: string): ParsedUri;
  /**
   * Merge source object properties into target object.
   * @param target Target object
   * @param sources One or more source objects
   */
  assign<T extends object>(target: T, ...sources: Record<string, unknown>[]): T;

  /**
   * Get enumerable property keys of object as array.
   * @param src Source object
   */
  keys<T extends object>(src: T): string[];
  /**
   * Check if one DOM node is contained within another.
   * Returns true if both nodes are the same.
   * @param node Node or node ID
   * @param container Container node or node ID
   */
  nodeInside(node: HTMLElement | string, container: HTMLElement | string): boolean;
  /**
   * Ensure DOM element has an ID, auto-generates one if missing.
   * Returns element's ID.
   * @param node DOM element object
   */
  ensureNodeId(node: HTMLElement): string;
  /**
   * Load modules using configured module loader.
   * @param names Module names, supports string or string array
   * @param callback Callback after modules are loaded
   */
  use(names: string | string[], callback?: (...modules: unknown[]) => void): void;
  /**
   * Generate globally unique identifier (GUID).
   * @param prefix GUID prefix, defaults to "lark_"
   */
  generateId(prefix?: string): string;
  /**
   * Delay wait, Promise-based setTimeout wrapper.
   * @param time Delay time in milliseconds
   */
  delay(time: number): Promise<void>;
  /**
   * Whether framework has booted
   */
  isBooted(): boolean;
  /**
   * Fire a custom DOM event on a target element.
   * @param target Target element or EventTarget
   * @param eventType Event type string
   * @param eventInit CustomEvent init options
   */
  dispatchEvent(target: EventTarget, eventType: string, eventInit?: CustomEventInit): void;
  /**
   * Emitter factory function.
   * Use `createEmitter()` to create emitter instances.
   */
  createEmitter: typeof import("./event-emitter").createEmitter;
  /**
   * Cache factory function.
   * Use `createCache()` to create cache instances.
   */
  createCache: typeof import("./cache").createCache;
  /**
   * Global state object.
   */
  State: StateApi;
  /**
   * Router object.
   */
  Router: RouterApi;
}

// ============================================================
// Framework config types
// ============================================================

/**
 * Framework configuration interface, global config passed to app during `Framework.boot()`.
 * All config items can be accessed at runtime via `Framework.getConfig('key')`.
 */
export interface FrameworkConfig {
  /**
   * Root element ID.
   * DOM root node ID where root view resides, framework renders root view within this node.
   * This field is required, defaults to "root".
   */
  rootId: string;
  /**
   * Routing mode.
   * - `"history"` (default): uses `history.pushState` / `popstate`, clean URLs like `/home`
   * - `"hash"`: uses URL hash fragment with `#!` prefix, e.g. `#!/home`
   */
  routeMode?: "history" | "hash";
  /**
   * Default view: registered view path or an imported function component.
   * Root view to load when the URL doesn't match any route.
   */
  defaultView?: string | Component;
  /**
   * Default path when no hash present,
   * Path used when URL hash is empty, defaults to "/".
   */
  defaultPath?: string;
  /**
   * Route mapping: path -> view.
   * Mapping relationship between paths and views.
   * - Simple mapping: `{ "/home": "app/views/home" }` or `{ "/home": HomeView }`
   * - Config mapping: `{ "/detail": { view: DetailView, title: "Detail" } }`
   * Use rewrite config item for path rewriting logic.
   */
  routes?: Record<string, string | Component | RouteViewConfig>;
  /** Hashbang prefix (only used in hash mode) */
  hashbang?: string;
  /**
   * Error handler.
   * Global error handling function, framework uses try-catch to execute some core logic.
   * When errors are thrown, allows developers to catch them via this config item.
   * Note: Do not re-throw any errors in this method.
   */
  error?: (error: Error) => void;
  /** Rewrite function for routes */
  rewrite?: (
    path: string,
    params: Record<string, string>,
    routes: Record<string, string>,
  ) => string;
  /**
   * Unmatched view (404).
   * View to use when no matching view is found in routes, e.g., 404 page.
   */
  unmatchedView?: string | Component;
  /**
   * Module require function for asynchronous view loading.
   * Called by `Framework.use()` when a view setup is not found in the registry.
   * Integrate with Webpack Module Federation or other dynamic loading strategies.
   *
   * @param names - Array of module names to load (e.g., `["remote-app/views/home"]`)
   * @param params - Optional parameters passed to the module initializer
   * @returns Promise resolving to an array of loaded modules, or undefined if not available
   */
  require?: (names: string[], params?: Record<string, unknown>) => Promise<unknown[]> | undefined;
}

export interface RouteViewConfig {
  /** View path or imported function component */
  view: string | Component;
  /** Additional properties merged into location */
  [k: string]: unknown;
}
