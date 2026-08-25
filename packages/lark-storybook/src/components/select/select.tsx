/**
 * Select — wraps the `<lk-select>` web component as a controlled field.
 *
 * `options` is a real array arg; the web component's Lit Array converter
 * expects a JSON attribute, so the body serialises it (`JSON.stringify`) —
 * the lark runtime only writes plain attributes to custom elements.
 *
 * The selection lives in a `useSignal` slot seeded from `initialValue`
 * (same pattern as Counter's `initialCount`): the composed `change`
 * CustomEvent writes the signal, and the signal is pushed back down as the
 * `value` attribute — control tweaks re-render without resetting it.
 */
import { useSignal } from "@lark.js/mvc";

export interface SelectProps {
  label?: string;
  placeholder?: string;
  options?: string[];
  initialValue?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  /** Child → parent callback (wired to the Actions panel by larkRender). */
  onChange?: (data: { value: string }) => void;
}

export default function Select(props: SelectProps) {
  const value = useSignal(props.initialValue ?? "");

  const change = (event: Event): void => {
    const next = (event as CustomEvent<{ value: string }>).detail.value;
    value.value = next;
    props.onChange?.({ value: next });
  };

  const options = Array.isArray(props.options) ? props.options : [];
  return (
    <div class="flex w-64 flex-col gap-1.5">
      <span class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {props.label ?? "Select"}
      </span>
      <lk-select
        class="w-full"
        options={JSON.stringify(options)}
        value={value.value}
        placeholder={props.placeholder ?? "Pick one…"}
        disabled={props.disabled ?? false}
        size={props.size === "sm" ? "sm" : "default"}
        onChange={change}
      ></lk-select>
      <span class="font-mono text-xs text-muted-foreground">
        selected: {value.value === "" ? "—" : value.value}
      </span>
    </div>
  );
}
