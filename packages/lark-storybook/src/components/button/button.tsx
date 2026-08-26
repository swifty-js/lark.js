import { useSignal } from "@lark.js/mvc";

export interface ButtonProps {
  label?: string;
  variant?:
    "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Child → parent callback (wired to the Actions panel by larkRender). */
  onClick?: (data: { clicks: number }) => void;
}

/** Lark prop names → `<wc-button>` attribute values. */
const variantMap = {
  primary: "default",
  secondary: "secondary",
  outline: "outline",
  ghost: "ghost",
  destructive: "destructive",
  link: "link",
} as const;

const sizeMap = {
  sm: "sm",
  md: "default",
  lg: "lg",
} as const;

export default function Button(props: ButtonProps) {
  // Slot state — survives re-renders (a plain `let` would reset every render).
  const clicks = useSignal(0);

  const press = (): void => {
    if (props.disabled) return;
    clicks.value += 1;
    props.onClick?.({ clicks: clicks.value });
  };

  // Derived data is computed inline — the body re-runs whenever the
  // `variant` / `size` / `label` / `disabled` prop signals change.
  const variant = variantMap[props.variant ?? "primary"];
  const size = sizeMap[props.size ?? "md"];
  return (
    <wc-button
      class="inline-block"
      type="button"
      variant={variant}
      size={size}
      disabled={props.disabled ?? false}
      onClick={press}
    >
      {props.label ?? "Button"}
    </wc-button>
  );
}
