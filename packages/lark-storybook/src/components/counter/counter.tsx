/**
 * Counter — internal signal state next to Storybook-controlled props.
 *
 * Tweaking the `step` control does NOT reset `count`: larkRender re-renders
 * the same component instance (the reconciler pushes changed props through
 * per-key signals), exactly like a parent component re-rendering. The body
 * reads `props.step` / `props.label` (tracked), so control changes re-render.
 *
 * Note the arg is called `initialCount`, not `count` — `count` lives in a
 * `useSignal` slot and only its initial value comes from the args.
 */
import { useSignal } from "@lark.js/mvc";
import styles from "./counter.module.css";

export interface CounterProps {
  label?: string;
  step?: number;
  initialCount?: number;
  /** Child → parent callback (wired to the Actions panel by larkRender). */
  onChange?: (data: { count: number }) => void;
}

export default function Counter(props: CounterProps) {
  const count = useSignal(props.initialCount ?? 0);

  const step = props.step ?? 1;

  const change = (next: number): void => {
    count.value = next;
    props.onChange?.({ count: next });
  };

  return (
    <div class={styles["counter"]}>
      <div class={styles["counter__label"]}>{props.label ?? "Counter"}</div>

      <div class={styles["counter__value"]}>{count.value}</div>

      <wa-button-group class={styles["counter__actions"]} label="Counter actions">
        <wa-button
          type="button"
          variant="neutral"
          appearance="outlined"
          size="s"
          onClick={() => change(count.value - step)}
        >
          - {step}
        </wa-button>
        <wa-button
          type="button"
          variant="neutral"
          appearance="plain"
          size="s"
          onClick={() => change(props.initialCount ?? 0)}
        >
          Reset
        </wa-button>
        <wa-button
          type="button"
          variant="brand"
          appearance="filled"
          size="s"
          onClick={() => change(count.value + step)}
        >
          + {step}
        </wa-button>
      </wa-button-group>
    </div>
  );
}
