/**
 * Unit and integration tests for `instrumentView`.
 *
 * The unit tests drive the wrappers through a minimal fake `ViewCtx` that
 * implements only the surface `instrumentView` touches (`id`, `on`, `off`,
 * `cleanups`). The integration tests mount a real view through the actual
 * `@lark.js/mvc` runtime (`createFrame` + `registerViewClass` + `mountView`)
 * to prove that listener and cleanup errors swallowed by the framework are
 * still reported, and that instrumented views behave identically otherwise.
 */

import { createFrame, registerViewClass, useEffect, useEvent } from "@lark.js/mvc";
import type { AnyFunc, ViewCtx, ViewSetup } from "@lark.js/mvc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instrumentView } from "../src/instrument-view.js";
import { setLarkErrorSink } from "../src/report.js";
import type { LarkErrorContext } from "../src/types.js";

interface FakeListenerEntry {
  event: string;
  handler: AnyFunc;
}

/** Minimal fake ViewCtx: only the members instrumentView reads or patches. */
function createFakeCtx(id = "view-1"): {
  ctx: ViewCtx;
  listeners: FakeListenerEntry[];
  offCalls: Array<{ event: string; handler: AnyFunc | undefined }>;
  fire: (event: string, data?: Record<string, unknown>) => unknown[];
} {
  const listeners: FakeListenerEntry[] = [];
  const offCalls: Array<{ event: string; handler: AnyFunc | undefined }> = [];
  const ctx = {
    id,
    cleanups: [] as Array<() => void>,
    on(event: string, handler: AnyFunc): () => void {
      listeners.push({ event, handler });
      return () => {
        const index = listeners.findIndex((l) => l.event === event && l.handler === handler);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    off(event: string, handler?: AnyFunc): void {
      offCalls.push({ event, handler });
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i].event === event && (!handler || listeners[i].handler === handler)) {
          listeners.splice(i, 1);
        }
      }
    },
  } as unknown as ViewCtx;

  // Mimic the real emitter: swallow listener exceptions (funcWithTry) and
  // deliver an event-data object whose `type` field is the event name.
  const fire = (event: string, data?: Record<string, unknown>): unknown[] => {
    const eventData = { ...data, type: event };
    const results: unknown[] = [];
    for (const entry of [...listeners]) {
      if (entry.event !== event) continue;
      try {
        results.push(entry.handler(eventData));
      } catch {
        // swallowed, like funcWithTry(..., noop)
      }
    }
    return results;
  };

  return { ctx, listeners, offCalls, fire };
}

function collectReports(): { reports: Array<{ error: unknown; context: LarkErrorContext }> } {
  const reports: Array<{ error: unknown; context: LarkErrorContext }> = [];
  setLarkErrorSink((error, context) => {
    reports.push({ error, context });
  });
  return { reports };
}

afterEach(() => {
  setLarkErrorSink(undefined);
});

describe("instrumentView (unit)", () => {
  it("reports setup errors with phase 'setup' and rethrows the same error", () => {
    const { reports } = collectReports();
    const boom = new Error("setup failed");
    const setup: ViewSetup = () => {
      throw boom;
    };
    const wrapped = instrumentView(setup, { viewPath: "views/home" });
    const { ctx } = createFakeCtx("v-setup");

    expect(() => wrapped(ctx, undefined)).toThrow(boom);
    expect(reports).toHaveLength(1);
    expect(reports[0].error).toBe(boom);
    expect(reports[0].context).toEqual({
      phase: "setup",
      viewId: "v-setup",
      viewPath: "views/home",
    });
  });

  it("omits viewPath from context when not provided", () => {
    const { reports } = collectReports();
    const setup: ViewSetup = () => {
      throw new Error("x");
    };
    const { ctx } = createFakeCtx("v-nopath");

    expect(() => instrumentView(setup)(ctx, undefined)).toThrow("x");
    expect(reports[0].context).toEqual({ phase: "setup", viewId: "v-nopath" });
  });

  it("reports event handler errors with phase 'event' and the event map key, then rethrows", () => {
    const { reports } = collectReports();
    const boom = new Error("handler failed");
    const setup: ViewSetup = () => ({
      template: undefined,
      events: {
        "increment<click>": () => {
          throw boom;
        },
      },
    });
    const { ctx } = createFakeCtx();
    const descriptor = instrumentView(setup, { viewPath: "views/counter" })(ctx, undefined);

    expect(() => descriptor.events!["increment<click>"]()).toThrow(boom);
    expect(reports).toHaveLength(1);
    expect(reports[0].context.phase).toBe("event");
    expect(reports[0].context.eventKey).toBe("increment<click>");
    expect(reports[0].context.viewPath).toBe("views/counter");
  });

  it("forwards this, arguments, and return value of event handlers unchanged", () => {
    const setup: ViewSetup = () => ({
      template: undefined,
      events: {
        "sum<click>": function (this: unknown, a: number, b: number) {
          return [this, a + b];
        },
      },
    });
    const { ctx } = createFakeCtx();
    const descriptor = instrumentView(setup)(ctx, undefined);
    const self = { marker: true };

    const result = descriptor.events!["sum<click>"].call(self, 2, 3);
    expect(result).toEqual([self, 5]);
  });

  it("reports template render errors with phase 'template' and rethrows", () => {
    const { reports } = collectReports();
    const boom = new Error("render failed");
    const template = (): string => {
      throw boom;
    };
    const setup: ViewSetup = () => ({ template, events: {} });
    const { ctx } = createFakeCtx();
    const descriptor = instrumentView(setup)(ctx, undefined);

    expect(descriptor.template).not.toBe(template);
    expect(() => descriptor.template!({}, "v1", {})).toThrow(boom);
    expect(reports).toHaveLength(1);
    expect(reports[0].context.phase).toBe("template");
  });

  it("returns template output unchanged when the template does not throw", () => {
    const template = (data: unknown): string => `<p>${(data as { n: number }).n}</p>`;
    const setup: ViewSetup = () => ({ template, events: {} });
    const { ctx } = createFakeCtx();
    const descriptor = instrumentView(setup)(ctx, undefined);

    expect(descriptor.template!({ n: 7 }, "v1", {})).toBe("<p>7</p>");
  });

  it("preserves template reference identity with wrapTemplate: false (HMR compatibility)", () => {
    const template = (): string => "<p>ok</p>";
    const setup: ViewSetup = () => ({ template, events: {} });
    const { ctx } = createFakeCtx();
    const descriptor = instrumentView(setup, { wrapTemplate: false })(ctx, undefined);

    expect(descriptor.template).toBe(template);
  });

  it("reports assign errors with phase 'assign', rethrows, and forwards return values", () => {
    const { reports } = collectReports();
    const boom = new Error("assign failed");
    let shouldThrow = true;
    const setup: ViewSetup = () => ({
      template: undefined,
      events: {},
      assign: () => {
        if (shouldThrow) throw boom;
        return true;
      },
    });
    const { ctx } = createFakeCtx();
    const descriptor = instrumentView(setup)(ctx, undefined);

    expect(() => descriptor.assign!()).toThrow(boom);
    expect(reports[0].context.phase).toBe("assign");

    shouldThrow = false;
    expect(descriptor.assign!()).toBe(true);
  });

  it("reports listener errors with phase 'listener' and the fired event name", () => {
    const { reports } = collectReports();
    const boom = new Error("listener failed");
    const setup: ViewSetup = (ctx) => {
      ctx.on("refresh", () => {
        throw boom;
      });
      return { template: undefined, events: {} };
    };
    const { ctx, fire } = createFakeCtx("v-listener");
    instrumentView(setup, { viewPath: "views/list" })(ctx, undefined);

    fire("refresh");
    expect(reports).toHaveLength(1);
    expect(reports[0].error).toBe(boom);
    expect(reports[0].context).toEqual({
      phase: "listener",
      viewId: "v-listener",
      viewPath: "views/list",
      eventName: "refresh",
    });
  });

  it("delivers event data to listeners unchanged and reuses one wrapper per handler", () => {
    const received: unknown[] = [];
    const handler = (e?: unknown): void => {
      received.push(e);
    };
    const setup: ViewSetup = (ctx) => {
      ctx.on("a", handler);
      ctx.on("b", handler);
      return { template: undefined, events: {} };
    };
    const { ctx, listeners, fire } = createFakeCtx();
    instrumentView(setup)(ctx, undefined);

    expect(listeners).toHaveLength(2);
    // Same original handler => same wrapper (WeakMap reuse).
    expect(listeners[0].handler).toBe(listeners[1].handler);

    fire("a", { n: 1 });
    expect(received).toEqual([{ n: 1, type: "a" }]);
  });

  it("supports ctx.off with the original handler reference after wrapping", () => {
    const handler = (): void => {};
    const setup: ViewSetup = (ctx) => {
      ctx.on("tick", handler);
      return { template: undefined, events: {} };
    };
    const { ctx, listeners, offCalls } = createFakeCtx();
    instrumentView(setup)(ctx, undefined);
    const registeredWrapper = listeners[0].handler;

    ctx.off("tick", handler);
    // The patched off must translate the original reference to the wrapper.
    expect(offCalls).toEqual([{ event: "tick", handler: registeredWrapper }]);
    expect(listeners).toHaveLength(0);
  });

  it("unregisters via the off function returned by ctx.on", () => {
    const setup: ViewSetup = (ctx) => {
      const off = ctx.on("once", () => {});
      off();
      return { template: undefined, events: {} };
    };
    const { ctx, listeners } = createFakeCtx();
    instrumentView(setup)(ctx, undefined);

    expect(listeners).toHaveLength(0);
  });

  it("reports cleanup errors with phase 'cleanup' and rethrows", () => {
    const { reports } = collectReports();
    const boom = new Error("cleanup failed");
    const setup: ViewSetup = (ctx) => {
      ctx.cleanups.push(() => {
        throw boom;
      });
      return { template: undefined, events: {} };
    };
    const { ctx } = createFakeCtx("v-clean");
    instrumentView(setup)(ctx, undefined);

    expect(ctx.cleanups).toHaveLength(1);
    expect(() => ctx.cleanups[0]()).toThrow(boom);
    expect(reports).toHaveLength(1);
    expect(reports[0].context.phase).toBe("cleanup");
    expect(reports[0].context.viewId).toBe("v-clean");
  });

  it("uses the per-view onError sink instead of the active sink", () => {
    const { reports } = collectReports();
    const perView = vi.fn();
    const setup: ViewSetup = () => {
      throw new Error("x");
    };
    const { ctx } = createFakeCtx();

    expect(() => instrumentView(setup, { onError: perView })(ctx, undefined)).toThrow("x");
    expect(perView).toHaveBeenCalledTimes(1);
    expect(reports).toHaveLength(0);
  });

  it("passes params through to the original setup and preserves the descriptor shape", () => {
    const setup = vi.fn((_ctx: ViewCtx, params?: unknown) => ({
      template: undefined,
      events: {},
      params,
    }));
    const { ctx } = createFakeCtx();
    const params = { from: "parent" };
    const descriptor = instrumentView(setup as unknown as ViewSetup)(ctx, params);

    expect(setup).toHaveBeenCalledWith(ctx, params);
    expect((descriptor as { params?: unknown }).params).toBe(params);
  });
});

describe("instrumentView (real @lark.js/mvc runtime)", () => {
  let frameCounter = 0;

  function mountInstrumented(setup: ViewSetup, viewPath: string): ReturnType<typeof createFrame> {
    const frameId = `test-frame-${++frameCounter}`;
    const node = document.createElement("div");
    node.id = frameId;
    document.body.appendChild(node);

    registerViewClass(viewPath, instrumentView(setup, { viewPath }));
    const frame = createFrame(frameId);
    frame.mountView(viewPath);
    return frame;
  }

  it("reports useEvent listener errors that the framework swallows", () => {
    const { reports } = collectReports();
    const boom = new Error("real listener failed");
    const frame = mountInstrumented(() => {
      useEvent("boom", () => {
        throw boom;
      });
      return { template: undefined, events: {} };
    }, "it/listener-view");

    expect(frame.view).toBeDefined();
    // The real emitter swallows the rethrow — firing must not throw.
    expect(() => frame.view!.fire("boom")).not.toThrow();

    const listenerReports = reports.filter((r) => r.context.phase === "listener");
    expect(listenerReports).toHaveLength(1);
    expect(listenerReports[0].error).toBe(boom);
    expect(listenerReports[0].context.eventName).toBe("boom");
    expect(listenerReports[0].context.viewPath).toBe("it/listener-view");
  });

  it("keeps non-throwing useEvent listeners fully functional", () => {
    const { reports } = collectReports();
    const received: unknown[] = [];
    const frame = mountInstrumented(() => {
      useEvent("ping", (e?: { n?: number }) => {
        received.push(e?.n);
      });
      return { template: undefined, events: {} };
    }, "it/listener-ok-view");

    frame.view!.fire("ping", { n: 42 });
    expect(received).toEqual([42]);
    expect(reports.filter((r) => r.context.phase === "listener")).toHaveLength(0);
  });

  it("reports useEffect cleanup errors during unmountView that the framework swallows", () => {
    const { reports } = collectReports();
    const boom = new Error("real cleanup failed");
    const frame = mountInstrumented(() => {
      useEffect(() => () => {
        throw boom;
      });
      return { template: undefined, events: {} };
    }, "it/cleanup-view");

    expect(frame.view).toBeDefined();
    // unmountCtx runs cleanups via funcWithTry — must not throw.
    expect(() => frame.unmountView()).not.toThrow();

    const cleanupReports = reports.filter((r) => r.context.phase === "cleanup");
    expect(cleanupReports).toHaveLength(1);
    expect(cleanupReports[0].error).toBe(boom);
    expect(cleanupReports[0].context.viewPath).toBe("it/cleanup-view");
  });

  it("runs non-throwing cleanups exactly once on unmount", () => {
    const { reports } = collectReports();
    const cleanup = vi.fn();
    const frame = mountInstrumented(() => {
      useEffect(() => cleanup);
      return { template: undefined, events: {} };
    }, "it/cleanup-ok-view");

    frame.unmountView();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(reports.filter((r) => r.context.phase === "cleanup")).toHaveLength(0);
  });
});
