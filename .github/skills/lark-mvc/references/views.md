# Views, ViewCtx, Hooks, Component Props/Events & the Frame Tree

Source of truth: `src/view.ts`, `src/hooks.ts`, `src/frame.ts`,
`src/view-registry.ts`, `src/event-delegator.ts`, `src/types.ts` in
`packages/lark-mvc`.

## defineView → LarkView

```ts
export function defineView<P extends object = object>(
  setup: (ctx: ViewCtx, params?: ViewParams<P> & Record<string, unknown>) => ViewSetupResult,
): LarkView<P>;

type ViewSetupResult = { template?: ViewTemplate }; // nothing else — no events, no assign

// LarkView<P> is a branded callable used ONLY as a JSX tag:
//   <MyView x={1} onSave={fn} key="k" class="mx-2"/>
// Calling it as a function dev-warns and renders nothing.
// ViewParams<P> strips `on${Capitalize}` keys (those become events).
// LarkHostProps adds id/key/class/className/style (routed to the host div).
```

`P` types the JSX props: `defineView<{ rows: Row[]; onSelect: (d?: object) => void }>`.
Components auto-register an internal name on first serialization
(`ensureViewName` → `__vN_FnName`); `registerViewClass(path, view)` gives an
explicit path (needed for `routes` strings, raw `v-lark` HTML, lazy loaders).

Lifecycle (from `mountCtx`):

1. `createCtx(frame)` builds the ViewCtx (refData, emitter, signals map, resources).
2. `setCurrentCtx(ctx)`; `setup(ctx, params)` runs ONCE **inside
   `untracked()`** — setup-body signal reads never subscribe anything.
3. Template wired; `signature.value = 1`; `frame.view = ctx`.
4. `createRenderEffect(ctx)` — one `@preact/signals-core` effect; its first
   run is the initial render. Each pass: `signature.value++` →
   `fire("render")` → destroy `destroyOnRender` resources → `template()`
   (TRACKED) → DOM diff → `untracked(endUpdate)` → `mountZone` mounts
   children (each child owns its own effect).

On unmount (`unmountCtx`): `useEffect` cleanups run in reverse order — this
includes the render-effect dispose and the delegated-event unbinding — then
all resources destroyed → `fire("destroy")` → `signature = 0`.

## ViewCtx API (complete)

| Member                                      | Signature                                       | Notes                                                                 |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `id`                                         | `string`                                         | Same as owner frame ID (= DOM element id)                             |
| `owner`                                      | `FrameObj`                                       | The hosting frame — `ctx.owner.fire(...)` sends events to parent      |
| `refData`                                    | `Record<string, unknown>`                        | Ref-token store the template writes (JSX object/function values)      |
| `translate(v)`                               | resolve a refData token to its live value        | Internal; `mountZone` uses it for the `p-lark` props token            |
| `signals`                                    | `Map<string, Signal<unknown>>`                   | Keyed `useSignal` storage — preserved across HMR re-setup             |
| `signature`                                  | `{ value: number }`                              | `>0` alive, incremented EVERY render pass, `0` destroyed              |
| `rendered`                                   | `{ value: boolean }`                             | True after first render completes                                    |
| `render()`                                   | `() => void`                                     | Force a pass through the render effect (rare — writes auto-render)    |
| `capture(key, resource?, destroyOnRender?)`  | store/read a resource with a `destroy()` method  | Omit `resource` to read back                                          |
| `release(key, destroy = true)`               | remove a resource, optionally calling `destroy()`|                                                                        |
| `wrapAsync(fn, context?)`                    | signature-guard a callback                       | Drops after ANY re-render/destroy — see SKILL.md critical rule 7      |
| `fire / on / off`                            | view-level emitter                               | `on` returns an unsubscribe function                                  |
| `endUpdate(zoneId?, inner?)`                 | remount children in a zone                       | Rarely needed — the render effect calls it                            |
| `getTemplate()/setTemplate`, `getEvents()/setEvents` | accessor pairs                          | Used by HMR / the JSX wiring layer, seldom by apps                    |
| `cleanups`                                   | `Array<() => void>`                              | Populated by `useEffect`/`useSignalEffect`/render effect              |
| `resources`                                  | `Record<string, {entity, destroyOnRender}>`      | Backing store for capture/release                                     |

Removed (do not use): `ctx.updater`, `observeState`, `observeLocation`,
`renderMethod`, `setAssign`.

## Hooks (only callable inside setup)

Hooks read a module-level `currentCtx` set during `mountCtx` — calling one
outside setup throws `"Hooks can only be called inside a view setup function"`.

```ts
useSignal<T>(key: string, initial: T): Signal<T>
// signal(initial) stored on ctx.signals by key — REUSED when HMR re-runs
// setup on the same ctx, so state survives hot swaps.

useSignalEffect(fn: () => void | (() => void)): void
// effect(fn) with dispose pushed into ctx.cleanups. Runs now, re-runs when
// any signal it read changes. THE replacement for observeState/Location +
// renderMethod. Async bodies: read signals first, then untracked(() => ...).

useEffect(fn: () => (() => void) | void, _deps?): void
// Runs SYNCHRONOUSLY during setup (DOM not yet rendered!). Never re-runs.
// Cleanup runs on destroy (and before HMR re-setup).

useInterval(fn, delayMs)   // setInterval + auto clearInterval on destroy
useTimeout(fn, delayMs)    // setTimeout + auto clearTimeout on destroy
useResource(key, resource, destroyOnRender = false)  // ctx.capture wrapper
useEvent(event, handler)   // ctx.on(...) + auto-off on destroy
useUrlState(defaults)      // [read, write] — see state-routing.md
```

Removed hooks: `useState` (→ `useSignal`/`signal`), `useStore` (→ read
`store.getState().key` in the template).

Because `useEffect` runs before the DOM exists, defer DOM queries:

```ts
useEffect(() => {
  let destroyed = false;
  setTimeout(() => {
    if (destroyed) return;
    const el = document.querySelector(`#${ctx.id} [data-role="mount"]`);
  }, 0);
  return () => {
    destroyed = true;
  };
});
```

## DOM events — inline functions + delegation

Events are camelCase props with **inline function values only**
(`onClick={fn}` → delegated `click`). Per render the serializer collects
handlers under generated `__jsxN` names and emits
`@click="<viewId>\x1e__jsxN"`; a single capture-phase listener per event
type on `document.body` (reference-counted) dispatches by walking up from
`event.target`. Dispatch runs inside `batch()`.

The handler receives the DOM event extended with `e.eventTarget` (the
original hit element). There is no `e.params` — closures capture loop
variables directly:

```tsx
{items.value.map((item) => (
  <button key={`del-${item.id}`} onClick={() => del(item.id)}>×</button>
))}
```

Multi-event = same fn on several props; modifiers = ordinary checks
(`if (!(e as MouseEvent).ctrlKey) return;`). Lowercase `onclick` props and
string handler values are rejected. `stopPropagation()` is respected.

## Component props & events (child views)

Embed children by using the imported component as a JSX tag. The serializer
emits a host `<div v-lark="<name>" p-lark="<one refData token>">`; `mountZone`
scans hosts, mounts child frames, and wires props/events.

```tsx
import Child from "./child";

const rows = signal<Row[]>([]);
const template = jsxTemplate(() => (
  <Child key="c1" class="panel" rows={rows.value} onSelect={(d) => pick(d)} />
));
```

| Prop                              | Behavior                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `id` / `key` / `class` / `style`   | Routed to the host element (`key` becomes the host `id` / compare key)   |
| `on` + Capitalized, function value | Child→parent event (`onClearHistory` → child fires `"clearHistory"`)     |
| everything else                    | Child's reactive `params` — objects/functions by live reference          |

**Props flow (reactive):** the child's `params` is a proxy over per-frame
per-key signals. Reading `params.key` inside the child **template**
subscribes it to that key; parent re-renders batch-write fresh values
(`mountZone` → `writeParams`) and the child re-renders only if a key it read
changed (reference comparison). Props read once in the setup body are a
frozen snapshot. A prop the parent stops passing reads as `undefined`.

**Signal-as-prop (fine-grained):** pass the signal itself (`<Child count={count}/>`)
— the child reads `.value` in its own template and updates **without the
parent re-rendering** (component props are the one place the serializer does
NOT auto-unwrap signals).

**Events flow:** child calls `ctx.owner.fire("select", data?)` → the frame
emitter hits a stable trampoline that always points at the parent's LATEST
handler prop (`.current` swapped every parent render — closures never go
stale; removed handler props park the trampoline). Calls run inside
`batch()`. Names are **case-sensitive** and never pass through HTML.

Child receiving props:

```tsx
export default defineView<{ rows?: Row[]; onSelect?: (d?: object) => void }>(
  (ctx, params) => {
    const template = jsxTemplate(() => (
      <ul>
        {(params?.rows ?? []).map((r) => (
          <li key={`r-${r.id}`} onClick={() => ctx.owner.fire("select", { id: r.id })}>
            {r.name}
          </li>
        ))}
      </ul>
    ));
    return { template };
  },
);
```

Raw registered-path HTML still mounts (markdown pipelines, router strings):
`registerViewClass("views/detail", Detail)` + `<div v-lark="views/detail"></div>`
(prop-less; URI params in the path arrive in `params`).

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
frame.mountZone(zoneId?)          // (re)scan v-lark hosts in a zone
frame.unmountZone(zoneId?)
frame.parent(level = 1)           // walk up
frame.children()                  // child frame ids
frame.invoke(name, args?)         // call method on view; queued until rendered
frame.paramsStore                 // { signals, proxy } — reactive props store
frame.on/off/fire                 // frame-level events (child→parent channel)
```

Frames fire `created` (all children mounted) and `alter` (a child is
changing) events that bubble up. `Framework.waitZoneViewsRendered(viewId, timeout?)`
awaits `created` (resolves `Framework.WAIT_OK` / `WAIT_TIMEOUT_OR_NOT_FOUND`).

## Shared logic without inheritance

Compose setups with higher-order functions instead of base classes:

```ts
export function withLogging<P extends object>(
  setup: (ctx: ViewCtx, params?: ViewParams<P>) => ViewSetupResult,
) {
  return defineView<P>((ctx, params) => {
    ctx.on("destroy", () => console.log(`destroyed: ${ctx.id}`));
    return setup(ctx, params);
  });
}
```
