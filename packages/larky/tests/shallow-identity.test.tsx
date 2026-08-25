// @vitest-environment jsdom
/**
 * Regression for the Monaco freeze: `useSignal` is a DEEP Vue ref, so a
 * class instance stored in it is wrapped in a reactive proxy. Proxies break
 * internal identity invariants (`node !== SENTINEL` never terminates in
 * Monaco's piece tree) — a synchronous infinite loop with no error.
 *
 * The escape hatches must preserve identity: `useRef` (non-reactive),
 * `useShallowSignal` / `shallowSignal` (reactive on `.value` assignment),
 * and `markRaw` (opt an object out of deep proxying).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  render,
  unmount,
  signal,
  shallowSignal,
  markRaw,
  toRaw,
  useShallowSignal,
  useRef,
  useEffect,
  nextTick,
} from "../src/index";

// Miniature of Monaco's identity-sensitive traversal: walking stops only
// when a node IS the shared sentinel. Through a deep reactive proxy the
// sentinel read back from the tree is a DIFFERENT object, so a bounded
// walk sees the mismatch (the real Monaco loop is unbounded → freeze).
const SENTINEL = { sentinel: true };
class MiniTree {
  root: { next: unknown } = { next: SENTINEL };
  walkTerminates(): boolean {
    let node: unknown = this.root.next;
    for (let i = 0; i < 10; i++) {
      if (node === SENTINEL) return true;
      if (node == null || typeof node !== "object") return false;
      node = (node as { next: unknown }).next;
    }
    return false;
  }
}

describe("deep signal identity hazard (Monaco class)", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("deep signal proxies class instances and breaks identity invariants", () => {
    const tree = new MiniTree();
    expect(tree.walkTerminates()).toBe(true);
    const s = signal<MiniTree>(tree);
    expect(s.value).not.toBe(tree); // reactive proxy
    // `this.root.next` through the proxy is a proxied sentinel — identity
    // comparison against the raw SENTINEL fails (Monaco's freeze mechanism).
    expect(s.value.walkTerminates()).toBe(false);
  });

  it("markRaw opts an instance out of deep proxying", () => {
    const tree = markRaw(new MiniTree());
    const s = signal<MiniTree>(tree);
    expect(s.value).toBe(tree);
    expect(s.value.walkTerminates()).toBe(true);
  });

  it("shallowSignal preserves identity", () => {
    const tree = new MiniTree();
    const s = shallowSignal(tree);
    expect(s.value).toBe(tree);
    expect(s.value.walkTerminates()).toBe(true);
    expect(toRaw(s.value)).toBe(tree);
  });

  it("useShallowSignal preserves identity and re-renders on .value assignment", async () => {
    const container = document.getElementById("root")!;
    const instances: MiniTree[] = [];
    let readBack: MiniTree | null = null;
    let assign: (() => void) | undefined;

    function Editor() {
      const inst = useShallowSignal<MiniTree | null>(null);
      useEffect(() => {
        const tree = new MiniTree();
        instances.push(tree);
        inst.value = tree;
      });
      readBack = inst.value;
      assign = () => {
        const tree = new MiniTree();
        instances.push(tree);
        inst.value = tree;
      };
      return <div>{inst.value ? "ready" : "loading"}</div>;
    }

    render(<Editor />, container);
    await nextTick();
    expect(container.textContent).toBe("ready");
    expect(readBack).toBe(instances[0]); // identity preserved, walk safe
    expect(instances[0].walkTerminates()).toBe(true);

    assign!();
    await nextTick();
    expect(readBack).toBe(instances[1]); // .value assignment re-rendered
    unmount(container);
  });

  it("useRef holds instances without any reactivity or proxying", async () => {
    const container = document.getElementById("root")!;
    let held: MiniTree | null = null;

    function Editor() {
      const el = useRef<HTMLDivElement>();
      const inst = useRef<MiniTree>();
      useEffect(() => {
        inst.current = new MiniTree();
        held = inst.current;
        return () => {
          inst.current = null;
        };
      });
      useEffect(() => {
        expect(el.current).toBeInstanceOf(HTMLDivElement);
        expect(inst.current?.walkTerminates()).toBe(true);
      });
      return <div ref={el}>editor</div>;
    }

    render(<Editor />, container);
    await nextTick();
    expect(held!.walkTerminates()).toBe(true);
    unmount(container);
    expect(held).not.toBeNull(); // cleanup nulls the ref cell, not our capture
  });
});
