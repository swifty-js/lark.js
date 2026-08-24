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
 * Component registry: path string -> function component.
 *
 * String paths are the routing / lazy-loading currency (`routes: { "/home":
 * "home" }` + `config.require`). Components used directly as JSX tags never
 * need registration — the reconciler mounts the function itself.
 *
 * The registry also owns the **HMR alias map**: `aliasComponent(old, new)`
 * records that `new` replaces `old`, and `canonicalComponent(fn)` resolves a
 * (possibly stale) component reference through the alias chain to the latest
 * version. The reconciler matches component tags by canonical identity, so
 * parents holding a stale import keep matching hot-swapped instances.
 */
import { parseUri } from "./utils";
import type { Component } from "./jsx/vnode";

/** Registry of function components keyed by path. */
const componentRegistry: Record<string, Component> = {};

/** Auto-assigned registry names for components used in route configs. */
const componentNames = new WeakMap<object, string>();

/** Monotonic counter for auto-generated component names. */
let componentNameSeq = 0;

/** HMR replacement links: old component -> its replacement. */
const aliasMap = new WeakMap<Component, Component>();

/**
 * Resolve a component reference through the HMR alias chain to its latest
 * version. Non-aliased components resolve to themselves.
 */
export function canonicalComponent(fn: Component): Component {
  let current = fn;
  for (let i = 0; i < 100; i++) {
    const next = aliasMap.get(current);
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Record that `newFn` replaces `oldFn` (HMR). The replacement inherits the
 * old component's registry name so string routes keep resolving.
 */
export function aliasComponent(oldFn: Component, newFn: Component): void {
  if (oldFn === newFn) return;
  aliasMap.set(oldFn, newFn);
  const name = componentNames.get(oldFn);
  if (name && !componentNames.has(newFn)) {
    componentNames.set(newFn, name);
  }
}

/**
 * Get (or lazily create) the registry name for a component used in a route
 * config position. First call assigns `__cN` (suffixed with the function's
 * name when it has one, e.g. `__c1_Home`) and registers the component under
 * that name. Explicitly registered components reuse their explicit name.
 */
export function ensureComponentName(fn: Component): string {
  let name = componentNames.get(fn);
  if (!name) {
    const fnName = (fn as { name?: string }).name;
    name = `__c${++componentNameSeq}` + (fnName ? `_${fnName.replace(/\W/g, "")}` : "");
    componentNames.set(fn, name);
    registerComponent(name, fn);
  }
  return name;
}

/**
 * Look up a registered component by path (HMR-canonicalized).
 * Returns `undefined` if no component is registered for `path`.
 */
export function getComponent(path: string): Component | undefined {
  const fn = componentRegistry[path];
  return fn ? canonicalComponent(fn) : undefined;
}

/**
 * Register a function component for a path. Called after module loading
 * completes (or up front during boot). Registering also seeds the
 * component's name, so subsequent route-config usage reuses the explicit path.
 */
export function registerComponent(path: string, fn: Component): void {
  const parsed = parseUri(path);
  if (parsed.path && typeof fn === "function") {
    componentRegistry[parsed.path] = fn;
    if (!componentNames.has(fn)) {
      componentNames.set(fn, parsed.path);
    }
  }
}

/**
 * Remove a component from the registry (forces re-loading on next route hit).
 */
export function invalidateComponent(path: string): void {
  const parsed = parseUri(path);
  if (parsed.path) {
    Reflect.deleteProperty(componentRegistry, parsed.path);
  }
}

/** Get the full component registry (HMR entry swapping). */
export function getComponentRegistry(): Record<string, Component> {
  return componentRegistry;
}
