# Rendering Internals: Render Effects, Batching & the Real-DOM Diff

Source of truth: `src/view.ts` (`createRenderEffect`/`renderCore`),
`src/dom.ts`, `src/frame.ts` (`mountZone`), `src/jsx/serialize.ts`.
Read this when debugging "why didn't it re-render", double renders, flicker,
lost focus, child views unexpectedly remounting, or performance.

## The render effect (one per view)

Every templated view gets exactly one `@preact/signals-core` `effect()`,
created by `mountCtx` → `createRenderEffect(ctx)`. Its dispose lives in
`ctx.cleanups` (run on unmount and before HMR re-setup).

Each pass (`renderCore`):

```
read invalidation signal (ctx.render() bumps it — manual/HMR trigger)
signature.value++            // wrapAsync guards die on EVERY pass
fire("render")
destroy destroyOnRender resources
html = template(viewId, refData)   // TRACKED — dependency set re-collected
                                    // from scratch every pass (branch switches
                                    // update subscriptions automatically)
domGetNode → domSetChildNodes keyed diff → applyIdUpdates → applyDomOps
untracked( endUpdate → mountZone )  // child mounting must not subscribe parent
```

Errors thrown during a pass route through `funcWithTry` to the global error
sink (`config.error`) instead of propagating to the signal write site.

There is **no dirty-checking, no digest queue, no dispatcher walk, no task
scheduler** — the effect IS the dirty check. `Framework.task` is gone; use
`batch()` for write coalescing.

## When do effects run?

- A plain signal write outside `batch()` re-runs subscribed effects
  **synchronously** at the write site.
- Writes inside `batch(fn)` coalesce — subscribers run once at batch end.
  Auto-batched call sites: DOM event dispatch (`EventDelegator`),
  child→parent trampolines (`mountZone`), `State.set`, `store.setState`,
  props pushes (`writeParams`), `seedParams`.
- Same-value writes (`===`) are no-ops.
- `computed` is lazy — it recomputes on read, only if a dependency changed.
- Cycle guard: an effect writing a signal it also reads throws
  `Cycle detected` (after 100 batch iterations).

## refData tokens (object values through HTML)

The serializer cannot put live objects in an HTML string, so object/function
attribute values and the whole component-props object are stored in the
view's `ctx.refData` under `\x1e<N>` tokens (`refFn`); the attribute carries
the token. `ctx.translate(token)` resolves it back. Tokens not re-emitted by
the latest render are swept (`pruneRefData`) — fresh identities every render
do not leak.

## Real-DOM diff (`src/dom.ts`)

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
   subtree — the child view is NOT remounted; only its props signals update.

Runtime-injected DOM (e.g. buttons appended after render) diverges from the
template output, so ANY re-render's diff strips it — replay such
enhancements after each render (`ctx.on("render", ...)` + `setTimeout 0`, or
a `useSignalEffect` keyed to the same data).

## mountZone (child frames, untracked)

After the diff, `endUpdate` → `mountZone` scans `[v-lark]` hosts inside the
zone:

- **New host**: mount a child frame (`mountFrame`), seed its reactive params
  store from the `p-lark` token + URI params, wire `on[A-Z]` handler props to
  stable trampolines.
- **Existing host**: re-sync trampoline `.current` targets and batch-write
  the fresh props into the per-key params signals (`writeParams`) — keys
  absent this round are removed (child reads `undefined`). The child
  re-renders only if its tracked regions read a changed key.

The whole phase runs inside `untracked()` so child setups/renders never
register dependencies on the parent's effect; each child owns its own render
effect.

## Debugging checklist

- Nothing re-rendered? The read was probably not in a tracked region (setup
  body / event handler / async callback are snapshots) — move the read into
  the template, `computed`, or `useSignalEffect`.
- Write "didn't work"? Shallow comparison — in-place mutation is invisible;
  replace the reference (`sig.value = [...sig.value, x]`).
- `Cycle detected`? A template/computed/effect writes a signal it also reads
  — derive with `computed` or move the write to a handler.
- Too many renders? Wrap multi-writes in `batch()` (handlers already are).
- List not reordering / inputs losing state? Add stable `key`/`id` compare
  keys to loop items.
- Child view remounting on every parent render? Its host `id`/`key` or
  `v-lark` path changes between renders; keep both stable.
- Async callback silently skipped? `ctx.wrapAsync` guards die on EVERY
  reactive render pass (signature bump) — use a sequence counter for flows
  that must survive re-renders.
- Injected DOM disappearing? See "Runtime-injected DOM" above.
