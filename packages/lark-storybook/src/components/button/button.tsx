import { useSignal } from "@lark.js/mvc";
import styles from "./button.module.css";

export interface ButtonProps {
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Child → parent callback (wired to the Actions panel by larkRender). */
  onClick?: (data: { clicks: number }) => void;
}

const variantMap = {
  primary: { waVariant: "brand", waAppearance: "filled" },
  secondary: { waVariant: "neutral", waAppearance: "outlined" },
  ghost: { waVariant: "neutral", waAppearance: "plain" },
} as const;

const sizeMap = {
  sm: "s",
  md: "m",
  lg: "l",
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
  const { waVariant, waAppearance } = variantMap[props.variant ?? "primary"];
  const waSize = sizeMap[props.size ?? "md"];
  return (
    <wa-button
      class={styles["button"]}
      type="button"
      variant={waVariant}
      appearance={waAppearance}
      size={waSize}
      disabled={props.disabled ?? false}
      onClick={press}
    >
      {props.label ?? "Button"}
    </wa-button>
  );
}
