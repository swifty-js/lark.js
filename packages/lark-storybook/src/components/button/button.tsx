import { defineView, jsxTemplate } from "@lark.js/mvc";
import styles from "./button.module.css";

export interface ButtonProps {
  label: string;
  variant: "primary" | "secondary" | "ghost";
  size: "sm" | "md" | "lg";
  disabled: boolean;
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

export default defineView<ButtonProps>((ctx, params) => {
  const props = (params ?? {}) as Partial<ButtonProps>;

  let clicks = 0;

  const press = (): void => {
    if (props.disabled) return;
    clicks += 1;
    ctx.owner.fire("click", { clicks });
  };

  // Derived data is computed inline — the template re-runs whenever the
  // `variant` / `size` / `label` / `disabled` params signals change.
  const template = jsxTemplate(() => {
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
  });

  return { template };
});
