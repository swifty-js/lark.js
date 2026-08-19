# Views, ViewCtx, Hooks, Child Views & the Frame Tree

Source of truth: `src/view.ts`, `src/hooks.ts`, `src/frame.ts`,
`src/event-delegator.ts`, `src/types.ts` in `packages/lark-mvc`.

## defineView

```ts
export function defineView(setup: ViewSetup): ViewSetup; // identity — for typing/HMR anchoring

type ViewSetup<T = unknown> = (
  ctx: ViewCtx,
  params?: T, // route params + v-lark props + viewInitParams merged
) => {
  template?: ViewTemplate; // default-imported from the .html file
  events?: Record<string, AnyFunc>; // "name<eventType>" keyed handlers
  assign?: (options?: unknown) => boolean | undefined; // optional per-render data fn
};
```

Lifecycle (from `mountCtx`):

1. `createCtx(frame)` builds the ViewCtx (updater, emitter, resources, ...).
2. `setCurrentCtx(ctx)` — hooks become usable; `setup(ctx, params)` runs ONCE.
3. Template/events/assign are wired; `signature.value = 1`; `frame.view = ctx`.
4. `registerEvents(ctx)` — parses event-map keys, ref-counts DOM listeners.
5. `ctx.render()` → `updater.digest()` → DOM diff → `endUpdate()` →
   `mountZone` mounts `v-lark` children.

On unmount (`unmountCtx`): `useEffect` cleanups run in reverse order → events
unregistered → all resources destroyed → `fire("destroy")` → `signature = 0`.

## ViewCtx API (complete)

| Member                                                                        | Signature                                         | Notes                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `id`                                                                          | `string`                                          | Same as owner frame ID (= DOM element id)                        |
| `owner`                                                                       | `FrameObj`                                        | The hosting frame — `ctx.owner.fire(...)` sends events to parent |
| `updater`                                                                     | `UpdaterApi`                                      | Per-view data binding (see rendering-internals.md)               |
| `signature`                                                                   | `{ value: number }`                               | `>0` alive, incremented each render, `0` destroyed               |
| `rendered`                                                                    | `{ value: boolean }`                              | True after first render completes                                |
| `render()`                                                                    | `() => void`                                      | Increment signature, destroy transient resources, digest         |
| `observeLocation(params, observePath?)`                                       | `string \| string[] \| {params, path}`            | Re-render when listed URL params (or path) change                |
| `observeState(keys)`                                                          | `string \| string[]`                              | Re-render when listed `State` keys change (comma string ok)      |
| `capture(key, resource?, destroyOnRender?)`                                   | store/read a resource with a `destroy()` method   | Omit `resource` to read back                                     |
| `release(key, destroy = true)`                                                | remove a resource, optionally calling `destroy()` |                                                                  |
| `wrapAsync(fn, context?)`                                                     | signature-guard a callback                        | Stale calls after re-render/destroy silently drop                |
| `fire / on / off`                                                             | view-level emitter                                | `on` returns an unsubscribe function                             |
| `beginUpdate(zoneId?)` / `endUpdate(zoneId?, inner?)`                         | manual zone update control                        | Rarely needed — digest calls them                                |
| `getTemplate()/setTemplate`, `getEvents()/setEvents`, `getAssign()/setAssign` | accessor pairs                                    | Used by HMR/devtool, seldom by apps                              |
| `cleanups`                                                                    | `Array<() => void>`                               | Populated by `useEffect`/`useInterval`/...                       |
| `resources`                                                                   | `Record<string, {entity, destroyOnRender}>`       | Backing store for capture/release                                |
| `locationObserved`                                                            | `{flag, keys, observePath}`                       | Set by `observeLocation`                                         |

## Hooks (only callable inside setup)

Hooks read a module-level `currentCtx` set during `mountCtx` — calling one
outside setup throws `"Hooks can only be called inside a view setup function"`.

```ts
useState<T>(key: string, initial: T): [() => T, (v: T) => void]
// getter always reads ctx.updater.data[key] → no stale closures.
// setter = ctx.updater.set({ [key]: v }).digest()

useEffect(fn: () => (() => void) | void, _deps?: unknown[]): void
// Runs SYNCHRONOUSLY during setup (DOM not yet rendered!). Cleanup runs on
// destroy. deps are ignored — setup never re-runs.

useStore<T>(store: StoreApi<T>, selector?: (s: T) => Partial<T>): () => Partial<T>
// bindStore + returns a getter. Selector limits which keys sync to updater.

useInterval(fn, delayMs)   // setInterval + auto clearInterval on destroy
useTimeout(fn, delayMs)    // setTimeout + auto clearTimeout on destroy
useResource(key, resource, destroyOnRender = false)  // ctx.capture wrapper
useEvent(event, handler)   // ctx.on(...) + auto-off on destroy
useUrlState(ctx, defaults) // see state-routing.md
```

Because `useEffect` runs before the DOM exists, defer DOM queries:

```ts
useEffect(() => {
  let destroyed = false;
  setTimeout(() => {
    if (destroyed) return;
    const el = document.querySelector(`#${ctx.id} [data-role="mount"]`);
    // ...
  }, 0);
  return () => {
    destroyed = true;
  };
});
```

## DOM events — handler naming and delegation

All DOM events use a single capture-phase listener per event type on
`document.body` (reference-counted). Template attribute → handler key mapping:

| Events-map key            | Meaning                                                 |
| ------------------------- | ------------------------------------------------------- |
| `"save<click>"`           | `@click="save()"` anywhere in this view's template      |
| `"save<click,mousedown>"` | Multi-event binding                                     |
| `"$myRow<click>"`         | Delegated to descendants matching selector              |
| `"$<click>"`              | Fires only at the frame boundary                        |
| `"$window<resize>"`       | Real listener on `window` (auto-removed on destroy)     |
| `"$document<keydown>"`    | Real listener on `document`                             |
| `"save<click><ctrl>"`     | Only fires with Ctrl held (also `shift`, `alt`, `meta`) |

The handler receives the DOM event extended with:

- `e.eventTarget` — the original hit element
- `e.params` — object parsed from the template call, e.g.
  `@click="del({id: {{=item.id}}})"` → `e.params.id` (all values arrive as
  strings). Dynamic values **must** use `{{=expr}}` interpolation — a bare
  `{id: item.id}` is kept as the literal text `"item.id"` (see templates.md,
  "Event attributes").

```ts
"navigateTo<click>": (e: Record<string, unknown>) => {
  const p = e["params"] as Record<string, string> | undefined;
  if (p?.path) Router.to(p.path);
},
```

`stopPropagation()` is respected across frame boundaries.

## Child views: v-lark, props, events

Embed a child view by putting `v-lark="<viewPath>"` on an element. During
`endUpdate` the parent frame's `mountZone` scans `[v-lark]` elements and
mounts/updates children.

```html
<div
  v-lark="components/counter-updater"
  *count="{{=count}}"            <!-- string prop (HTML-escaped) -->
  *step="{{=step}}"
  *history="{{@history}}"        <!-- object/array by reference (ref token) -->
  @increment="increment"         <!-- child event → parent handler (NO parens) -->
  @stepChange="stepChange"
></div>
```

The compiler rewrites `*name` → `p-lark-name` and paren-less `@event` on
these elements → `e-lark-event`. HTML lowercases attribute names, so event
matching is case-insensitive (`fire("clearHistory")` matches
`e-lark-clearhistory`).

**Props flow**: parent `set().digest()` → template re-renders → `p-lark-*`
attributes update → `mountZone` reads them (resolving `{{@}}` ref tokens back
to live objects via parent `refData`) → pushes to
`childView.updater.set(props).digest()`.

**Events flow**: child calls `ctx.owner.fire("increment", { step: 2 })` →
parent handler found by prefix match (`increment<` in parent events map) →
called with the data object.

Child view receiving props:

```ts
export default defineView((ctx, params) => {
  const p = (params || {}) as Record<string, unknown>;
  ctx.updater.digest({ count: p["count"] ?? 0, history: p["history"] ?? [] });
  return {
    template,
    events: {
      "increment<click>": () => ctx.owner.fire("increment"),
      "stepChange<change>": (e: Event) =>
        ctx.owner.fire("stepChange", {
          step: +(e.target as HTMLInputElement).value || 1,
        }),
    },
  };
});
```

Important: child views used in `v-lark` must be **registered before**
`mountZone` runs (via `registerViewClass(path, setup)` or a `require` loader
that preloads dependencies — see build-and-hmr.md for the preload pattern).
The keyed diff preserves a child frame when the element id and view path are
unchanged, so children keep their state across parent renders.

## Frame tree

Each mounted view lives in a `FrameObj` keyed by DOM element id. Apps rarely
create frames directly — `Framework.boot` creates the root, `mountZone`
creates children — but the API matters for imperative control:

```ts
Frame.get(id)                     // FrameObj | undefined
Frame.getAll()                    // Map<string, FrameObj>
Frame.getRoot()                   // root FrameObj
Frame.on/off/fire                 // static "add" / "remove" frame events

frame.mountView(viewPath, initParams?)   // load (sync/async) + mount a view
frame.unmountView()
frame.mountFrame(frameId, viewPath, initParams?) // mount a child frame
frame.unmountFrame(id?)
frame.mountZone(zoneId?)          // (re)scan v-lark elements in a zone
frame.unmountZone(zoneId?)
frame.parent(level = 1)           // walk up
frame.children()                  // child frame ids
frame.invoke(name, args?)         // call method on view; queued until rendered
frame.on/off/fire                 // frame-level events (child→parent channel)
```

Frames fire `created` (all children mounted, `childrenCount === readyCount`)
and `alter` (a child is changing) events that bubble up the tree.
`Framework.waitZoneViewsRendered(viewId, timeout?)` awaits `created`
(resolves `Framework.WAIT_OK` or `WAIT_TIMEOUT_OR_NOT_FOUND`).

## Shared logic without inheritance

Compose setups with higher-order functions instead of base classes:

```ts
export function withBaseView(setup: ViewSetup): ViewSetup {
  return (ctx, params) => {
    ctx.updater.set({ appName: "My App" });
    ctx.on("destroy", () => console.log(`destroyed: ${ctx.id}`));
    return setup(ctx, params);
  };
}
export default defineView(withBaseView((ctx) => ({ template, events: {} })));
```
