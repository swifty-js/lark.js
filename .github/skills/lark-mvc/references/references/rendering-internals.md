# Rendering Internals: Updater, Digest, DOM Diff & Scheduler

Source of truth: `src/updater.ts`, `src/dom.ts`,
`src/framework.ts` (dispatcher/task), `src/utils.ts` (scheduler).
Read this when debugging "why didn't it re-render", flicker, lost focus,
child views unexpectedly remounting, or performance.

## UpdaterApi

Each view owns one updater (`ctx.updater`), created with
`data = { vId: viewId }`.

```ts
updater.get<T>(key?)              // one key, or entire data object
updater.set(data, excludes?)      // shallow merge + change tracking; chainable — NO render
updater.digest(data?, excludes?, callback?)  // set (optional) + render if dirty
updater.forceDigest()             // mark every key changed + digest (HMR uses this)
updater.snapshot()                // record version for altered()
updater.altered()                 // true/false since snapshot; undefined if never snapshotted
updater.getChangedKeys()          // ReadonlySet<string> pending keys
updater.refData                   // {{@}} ref-token store (SPLITTER-keyed)
updater.translate(val)            // resolve a ref token back to the live object
updater.parse("a.b.c")            // safe dotted-path read from refData (no eval)
```

### Change detection

`set()` compares per key: **primitives count as changed whenever the value
differs; objects/arrays/functions are compared by reference**. So mutating an
array in place and `set({ list })` again does NOT mark it changed — create a
new array (`[...list, item]`) or use `forceDigest()`. Any change bumps an
internal `version` (basis of `snapshot()/altered()`).

### Digest cycle

`digest()` is re-entrant: a digest triggered during a digest is queued and
processed after the current one; callbacks run when the whole cycle settles.
Render only happens when: data dirty AND `frame.view` wired AND the DOM node
`#viewId` exists AND `signature > 0`. If conditions are not met the dirty
flag is preserved for the next digest (this is why `ctx.updater.digest(...)`
inside setup works — the actual render happens after mount wiring).

### The assign() pattern

```ts
const assign = (_options?: unknown): boolean | undefined => {
  ctx.updater.snapshot();
  ctx.updater.set({
    /* derived data: url params, store reads, Date, ... */
  });
  return ctx.updater.altered(); // framework re-renders only if true
};
assign(params); // run once for the first render
return { template, assign, events };
```

When a view has `assign`, dispatcher-triggered renders (route/state changes)
re-run it to recompute data before diffing — the Lark equivalent of derived
state.

## String mode (default) — real-DOM diff (`src/dom.ts`)

1. Template returns an HTML string.
2. `domGetNode` parses it in a detached `createHTMLDocument` (with wrapper
   handling for `<tr>/<td>/<option>/<svg>/<math>` etc.).
3. `domSetChildNodes` keyed diff: compare key = element `id` (unless
   auto-generated) or `v-lark` path. Matched nodes are moved/patched in
   place; form state (`input.value/checked`, `textarea.value`,
   `option.selected`) is synced as DOM properties.
4. `id` attribute changes are deferred (`applyIdUpdates`) so frame lookups
   stay valid mid-diff; mutations batched via `applyDomOps`
   (append/remove/replace/insertBefore tuples).
5. An element carrying `v-lark` with an unchanged view path keeps its
   subtree — the child view is NOT remounted; only its props update.

## Dispatcher (route/state → renders)

`Framework.boot` binds Router + State `changed` events to
`dispatcherNotifyChange`:

- view diff present → `rootFrame.mountView(newViewPath)` (full swap).
- params/state keys changed → iterative frame-tree walk; each view whose
  `observeLocation`/`observeState` declaration intersects the change gets
  `render()` (async renders defer their subtree until the promise settles).
  Views with `signature.value <= 1` (never rendered) are skipped.

## Task scheduler

Two cooperative schedulers exist:

- `callFunction` (`src/utils.ts`): FIFO with a 9ms budget per batch, yields
  via `scheduler.yield()` (Chrome 115+) or `setTimeout(0)`. Used for deferred
  render post-processing — tasks are mandatory work.
- `Framework.task(fn, args?, ctx?)` (`src/framework.ts`): background chunked
  execution via `scheduler.postTask('background')` →
  `requestIdleCallback` → `setTimeout`, 48ms slices. Use for low-priority app
  work.

`Framework.mark(host, key)` returns a check function that turns false after
`unmark(host)` (called on re-render/unmount) — the imperative counterpart of
`ctx.wrapAsync`.

## Debugging checklist

- Nothing rendered? Check the digest preconditions: is `#viewId` in the DOM,
  did you call `.digest()`, is `signature > 0`?
- List not reordering / inputs losing state? Add stable `id` keys to loop
  items.
- Object prop change ignored? Reference equality — build a new object/array.
- Child view remounting on every parent render? Its element id or `v-lark`
  path changes between renders; keep both stable.
- Render error mentions a template expression? Rebuild with
  `larkMvcPlugin()` for line-accurate messages.
