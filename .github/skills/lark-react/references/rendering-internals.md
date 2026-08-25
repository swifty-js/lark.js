# Rendering Internals

Read this when debugging reconciliation, ordering, or performance — the
implementation lives in `packages/react/lib/diff.ts` (reconciler),
`lib/hooks.ts` (slots + effects), `lib/dom.ts` (host writes).

## renderRoot pipeline (synchronous, non-interruptible)

```
renderRoot(root)
  setActiveRoot(root)                     // useState slot creation binds here
  root.children = diffChildren(container, oldChildren,
                               toChildArray(root.element), null)
  setActiveRoot(null)
  flushEffects(root.children)             // cleanups pass, then creates pass
```

`toChildArray` normalizes descriptors first (text wrapping, null/boolean
dropping, array flattening), so the diff only ever sees `VNode[]`.

## Instances vs descriptors

`instantiate(desc, previous)` builds a fresh instance object every render,
carrying over the renderer-owned fields from the matched previous instance:
`dom`, `children`, `hooks` (THE state array), `refCleanup`. Descriptors
(`type`/`key`/`props`) are never mutated — element immutability, same as
React.

Hostless nodes: function components and Fragments own no DOM (`dom: null`);
their rendered children mount directly into the nearest host parent, and
subtree operations (move/remove/first-node lookup) recurse through
`children` until they hit real `dom` nodes.

## Two-pass keyed diff (same-level only, O(n))

React's three assumptions apply: cross-level moves are unmount+create; a
changed type discards the subtree; `key` identifies "the same node" within a
level (keyless falls back to index).

- **Pass 1 — positional**: walk left to right while `oldChild.key ===
newChild.key`; matching types are reused in place (`lastPlacedIndex`
  watermark rises), same-key/different-type olds are queued for removal.
  Appends, tail truncations, and pure prop updates finish here without
  building a Map.
- **Pass 2 — keyed lookup**: index the remaining olds into a
  `key → oldIndex` Map (old index when keyless), consume in new-list order.
  A reused node whose old index falls BEHIND the watermark must move;
  otherwise it stays and raises the watermark. Leftover olds unmount.
- **Unmounts run before the commit loop** so dying nodes don't pollute
  anchor calculations.
- **Commit runs right to left**: when index `i` commits, everything to its
  right is final, so the insertion anchor is simply the first host node of
  the right neighbor (`firstDom`), which naturally handles the one-to-many
  DOM of components/Fragments. Moves reuse `insertBefore` (relocating an
  attached node IS the move).

Per-node commit: `mount` creates DOM bottom-up (children inserted into their
parent before the parent enters the document — one real mount), `patch`
diffs props (`updateProps`), recurses into children, and swaps refs when the
`ref` prop identity changed. Elements with `dangerouslySetInnerHTML` skip
child reconciliation entirely.

## Unmount teardown

`unmount(vnode)` = one children-first walk running every effect cleanup and
detaching every host ref, then `removeDoms` detaches only the TOPMOST host
nodes (descendants leave with their subtree).

## Update scheduling

`setState` → `root.schedule()` → dirty-set + one `queueMicrotask` flush for
all roots. The flush snapshots and clears the dirty set, then runs
`renderRoot` per root. A `render(element, container)` call commits
synchronously and removes the root from the dirty set first (no double
render). Effects run inside `renderRoot`, so a setState from an effect lands
in the NEXT microtask wave.

## HMR canonical identity (why swaps are cheap)

`lib/hmr.ts` keeps a `WeakMap` alias chain plus an `hmrActive` latch:

- `sameType(a, b)` in the diff is `a === b` until the first swap; afterwards
  function tags also match when `canonical(a) === canonical(b)` (bounded
  chain resolution, ping-pong-proof because aliasing deletes the new
  function's stale forward edge).
- `renderComponent` executes `canonical(vnode.type)` — stale descriptors run
  the newest body against the preserved hook slots.
- `hotSwapByComponent` = record alias + re-render all live roots (a `Set`
  maintained by `render`). No instance-tree walking exists or is needed:
  whole-root re-rendering makes the alias visible everywhere at once.

## Performance characteristics

- Every update re-runs every component body in the root — there is no
  bailout/memoization tier. The diff keeps DOM writes minimal
  (`Object.is`-skipped props, keyed reuse), so cost scales with tree SIZE,
  not with change size. For hot paths, keep bodies lean and lists keyed.
- Listener swaps are add/removeEventListener pairs only when identity
  changes; inline handlers change identity every render, which is fine
  (cheap) but means avoid attaching hundreds of listeners per node.
- `Text` nodes patch by `nodeValue` comparison; string children reuse their
  text node across renders (keyless index match).
