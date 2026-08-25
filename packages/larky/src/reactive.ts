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
 * Reactive core — the framework's single reactivity primitive set, backed by
 * `@vue/reactivity`, plus the microtask scheduler that batches re-renders.
 *
 * Every data source in Larky is signal-based:
 * - component state: `useSignal()` hook slots read by component bodies
 * - props: per-key signals behind each instance's props proxy
 * - stores: per-key signals behind a tracked `getState()` proxy
 * - router: `location` / `match` / `params` / `searchParams` signals on the
 *   `createRouter` instance
 *
 * Each mounted component re-runs its function inside one `effect()` — any
 * signal read during the body subscribes the instance.
 *
 * ## Scheduling (React-18-style automatic batching)
 *
 * Signal writes NEVER re-render synchronously. Every triggered effect is
 * enqueued as a job (deduplicated) and the queue flushes on the next
 * microtask — N writes in one event handler produce exactly ONE re-render
 * per subscribed component. `await nextTick()` to observe committed DOM;
 * `flushSync(fn)` forces a synchronous flush for imperative code and tests.
 *
 * Cross-effect write cycles (A writes what B reads, B writes what A reads)
 * re-queue forever — the flusher throws `Cycle detected` after 100 re-runs
 * of the same job in one flush. Errors are never swallowed: a throwing
 * effect rejects the flush promise (and `nextTick()` awaiters).
 *
 * ## Deep reactivity
 *
 * `signal()` is Vue's `ref()` — DEEP and fine-grained: `list.value.push(x)`
 * notifies exactly the effects that read the list. Framework internals
 * (props, store keys, router location) use shallow signals so parent-owned
 * objects keep their identity (React semantics).
 */
import { effect as vueEffect, pauseTracking, resetTracking } from "@vue/reactivity";

export {
  ref as signal,
  shallowRef as shallowSignal,
  computed,
  isRef as isSignal,
  markRaw,
  toRaw,
} from "@vue/reactivity";
export type {
  Ref as Signal,
  ShallowRef as ShallowSignal,
  ComputedRef as ReadonlySignal,
} from "@vue/reactivity";

// ============================================================
// Microtask job queue
// ============================================================

type Job = () => void;

/** A job re-queued more than this many times in one flush is a cycle. */
const MAX_RECURSION = 100;

// A silent synchronous freeze is the worst failure mode: if one flush
// processes an abnormal number of jobs, a hard stop drops the queue and
// throws instead of hanging the page forever.

/** Hard stop: drop the queue and throw instead of freezing the page. */
const HARD_STOP = 10000;

const queue: Job[] = [];
const queued = new Set<Job>();
const flushCounts = new Map<Job, number>();

let flushPending = false;
let isFlushing = false;
let currentFlushPromise: Promise<void> | null = null;

const resolvedPromise: Promise<void> = Promise.resolve();

/**
 * Enqueue a job (deduplicated) on the microtask flush queue. Framework
 * internal — used by the reconciler to defer mount `useEffect`s out of the
 * instance's render-effect run (writes inside a running effect to its own
 * dependencies are suppressed by @vue/reactivity, so effects must run
 * OUTSIDE the effect stack for their writes to schedule re-renders).
 */
export function queueJob(job: Job): void {
  if (queued.has(job)) return;
  queued.add(job);
  queue.push(job);
  if (!flushPending && !isFlushing) {
    flushPending = true;
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}

/**
 * Drain the job queue. Jobs enqueued DURING the flush (parent renders push
 * child props, invalidating child render jobs) are appended and processed in
 * the same flush, in enqueue order.
 *
 * Cycle handling: a job re-queued more than `MAX_RECURSION` times in one
 * flush is SKIPPED from then on (skipping halts the write ping-pong so the
 * queue can drain — Vue scheduler semantics), and the recorded cycle error
 * is thrown once after the drain, rejecting `nextTick()` awaiters.
 */
function flushJobs(): void {
  flushPending = false;
  if (isFlushing) return;
  isFlushing = true;
  let cycleError: Error | null = null;
  let i = 0;
  try {
    for (; i < queue.length; i++) {
      const job = queue[i];
      queued.delete(job);
      const count = (flushCounts.get(job) ?? 0) + 1;
      flushCounts.set(job, count);
      if (count > MAX_RECURSION) {
        cycleError ??= new Error(
          "Cycle detected: an effect was re-queued more than " +
            `${MAX_RECURSION} times in one flush. An effect (or component body) ` +
            "is writing a signal that another effect writes back.",
        );
        continue;
      }
      if (i >= HARD_STOP) {
        const dropped = queue.length - i;
        queue.length = 0;
        queued.clear();
        cycleError = new Error(
          `[larky] HARD STOP: one flush processed ${HARD_STOP}+ jobs — infinite re-render loop. ` +
            `Dropped ${dropped} pending jobs.`,
        );
        break;
      }
      job();
    }
    if (cycleError) throw cycleError;
  } finally {
    queue.splice(0, Math.min(i + 1, queue.length));
    flushCounts.clear();
    isFlushing = false;
    currentFlushPromise = null;
    // Survivors after a throwing job — keep the queue live.
    if (queue.length > 0 && !flushPending) {
      flushPending = true;
      currentFlushPromise = resolvedPromise.then(flushJobs);
    }
  }
}

/**
 * A promise resolving after the pending flush commits (the DOM is updated).
 * Resolves immediately when nothing is pending. A throwing effect REJECTS
 * this promise — errors are never swallowed.
 *
 * @example
 * count.value++;
 * await nextTick();
 * expect(el.textContent).toBe("1");
 */
export function nextTick(): Promise<void> {
  return currentFlushPromise ?? resolvedPromise;
}

/**
 * Run `fn` (optional) and then flush the job queue SYNCHRONOUSLY, committing
 * all pending re-renders before returning. No-op while a flush is already
 * running (the outer flush loop picks up new jobs).
 *
 * @example
 * flushSync(() => (count.value = 5));
 * el.textContent; // already "5"
 */
export function flushSync<T = void>(fn?: () => T): T {
  const result = (fn ? fn() : undefined) as T;
  if (!isFlushing) flushJobs();
  return result;
}

// ============================================================
// Tracked effects (scheduler-batched, cleanup-return semantics)
// ============================================================

/**
 * Run `fn` immediately, tracking every signal read; re-run it (via the
 * microtask queue, deduplicated) whenever a dependency changes. A function
 * returned by `fn` is the between-runs / final cleanup.
 *
 * @returns A dispose function — stops tracking and runs the last cleanup.
 */
export function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | undefined;
  let disposed = false;
  const invoke = (): void => {
    if (cleanup) {
      const prev = cleanup;
      cleanup = undefined;
      prev();
    }
    const result = fn();
    if (typeof result === "function") cleanup = result;
  };
  // A stopped Vue runner would run `fn` untracked if invoked — the disposed
  // guard keeps jobs already sitting in the queue from resurrecting it.
  const job: Job = () => {
    if (!disposed) runner();
  };
  const runner = vueEffect(invoke, { scheduler: () => queueJob(job) });
  return (): void => {
    if (disposed) return;
    disposed = true;
    runner.effect.stop();
    if (cleanup) {
      const prev = cleanup;
      cleanup = undefined;
      prev();
    }
  };
}

/**
 * Run `fn` with dependency tracking paused: signal reads inside do NOT
 * subscribe the enclosing effect.
 */
export function untracked<T>(fn: () => T): T {
  pauseTracking();
  try {
    return fn();
  } finally {
    resetTracking();
  }
}
