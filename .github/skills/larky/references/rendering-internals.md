# Rendering Internals (`@lark.js/larky`)

Read this when debugging renders, timing, or performance — the concepts
here explain WHY the critical rules exist.

## One render effect per instance

Mounting a function tag creates an `Instance` (hook slots, per-key prop
signals, props proxy) and ONE `effect()` whose body:

1. reads `invalidate` (the manual/HMR re-render channel),
2. re-runs the component function with the props proxy (TRACKED — every
   signal/prop/store/router read subscribes THIS instance),
3. normalizes the output to a flat item list and diffs the instance's
   slice in place,
4. flushes deferred ops + pending `useEffect`s inside `untracked()`.

Parents and children re-render independently — there is no top-down
cascade unless data actually flows.

## The microtask job queue

- Effect re-runs go through a scheduler: triggered effects enqueue a JOB
  (deduplicated by identity) and the queue flushes on `Promise.resolve()`.
  The first run of every effect is synchronous (mounts commit eagerly).
- Flush loop is index-based: jobs appended mid-flush (a parent render
  pushing child props invalidates the child) run in the SAME flush —
  parent-then-child, each exactly once per tick.
- `flushSync(fn?)` drains the queue immediately (no-op if already
  flushing — the outer loop picks the new jobs up). `nextTick()` returns
  the current flush promise (rejects on a thrown job).
- Cycle guard: per-flush execution counts; a job exceeding 100 runs is
  skipped for the rest of the flush (halts ping-pong so the queue drains)
  and ONE `Cycle detected` error is thrown after the drain.
- Dispose guard: a stopped effect's queued job no-ops (a stopped Vue
  runner would otherwise run untracked).

## Anchor-slice reconciliation (hostless)

- An instance's rendered children are direct occupants of the parent HOST
  element, terminated by a persistent comment `end` anchor. The DOM range
  is `collectDoms(nodes) ++ [end]`, contiguous in the host.
- Ordering uses a REVERSE insertion pass anchored at `end` (component
  slices don't own the host, so there is no forward cursor); element
  children use the same pass with a `null` anchor (append). Only nodes
  whose next sibling isn't already correct are moved.
- Parents treat a child component's range as an opaque atomic unit when
  moving/removing keyed siblings.
- Teardown order: render effect disposed FIRST (no re-entry), children
  destroyed bottom-up, then the instance's own hook slots in reverse.

## Keyed diff

- Old children are indexed: explicit keys → map (first wins, duplicate
  keys dev-warn); the rest → a positional pool matched by compatibility
  (same kind; elements by tag; components by canonicalized function
  identity — HMR aliases are resolved at normalize time so the hot path
  compares plain identity).
- Matched nodes are patched in place (component match = deferred prop
  push); unmatched old nodes are destroyed; new items are created.

## Attribute snapshots & events

- Attribute diffing uses a RESOLVED snapshot: signals unwrapped,
  `class`/`className` merged, `style` normalized to a string — so
  signal-valued attributes update correctly without re-running normalize
  logic per comparison.
- Form-state props (`value`/`checked`/`selected`) sync as DOM properties
  and re-sync unconditionally (user input drifts the DOM).
- Events: one listener per (node, type) with a stable proxy whose
  `.current` handler is swapped each render; a removed handler parks the
  binding (listener stays, no-ops). Handler calls are plain — writes
  batch via the scheduler, not a wrapper.

## Deferred ops (re-entrancy discipline)

New-instance mounts, prop pushes, and ref calls are DEFERRED ops flushed
after the slice's DOM commit inside `untracked()`:

- Child mounts create the child's render effect there (its own tracking
  scope — child reads subscribe the child, not the parent).
- Prop pushes write per-key shallow signals; an invalidated child's job
  lands in the same microtask flush, after the parent's pass.
- `untracked()` guarantees none of this subscribes the parent's effect.
- The props-proxy `keysVersion` bump uses a plain counter mirror so the
  seed path (inside the parent's tracked pass) never READS a signal it
  writes.

## Timing summary

| Action                         | When the DOM reflects it                    |
| ------------------------------ | ------------------------------------------- |
| `render(vnode, el)` (first/re) | Synchronously, before return                |
| Child mounts during a pass     | Same synchronous commit (post-commit flush) |
| `sig.value = x` (any write)    | Next microtask flush (`await nextTick()`)   |
| `flushSync(() => write)`       | Synchronously, before `flushSync` returns   |
| `useEffect` callbacks          | After the instance's FIRST commit           |
| `unmount(el)`                  | Synchronously                               |

Perf notes: prefer many small subscribed readers over one mega-component
(fine-grained re-renders are the design); keys on lists avoid positional
churn; `useComputed` memoizes derivations (lazy, version-based); deep
signals track per-property — reading only `list.value.length` subscribes
narrowly.
