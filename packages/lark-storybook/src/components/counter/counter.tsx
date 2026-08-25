/**
 * Counter — internal signal state next to Storybook-controlled props.
 *
 * The `<lk-counter>` web component is CONTROLLED here: its `value` attribute
 * is pushed from the `count` signal, and its composed `change` CustomEvent
 * writes back. Tweaking the `step` control does NOT reset `count`: larkRender
 * re-renders the same component instance (the reconciler pushes changed props
 * through per-key signals), exactly like a parent component re-rendering.
 *
 * Note the arg is called `initialCount`, not `count` — `count` lives in a
 * `useSignal` slot and only its initial value comes from the args.
 */
import { useSignal } from "@lark.js/mvc";

export interface CounterProps {
  label?: string;
  step?: number;
  initialCount?: number;
  /** Child → parent callback (wired to the Actions panel by larkRender). */
  onChange?: (data: { count: number }) => void;
}

export default function Counter(props: CounterProps) {
  const count = useSignal(props.initialCount ?? 0);

  const change = (event: Event): void => {
    const next = (event as CustomEvent<{ count: number }>).detail.count;
    count.value = next;
    props.onChange?.({ count: next });
  };

  return (
    <lk-counter
      class="inline-flex"
      label={props.label ?? "Counter"}
      value={count.value}
      step={props.step ?? 1}
      initial={props.initialCount ?? 0}
      onChange={change}
    ></lk-counter>
  );
}
