import { defineView, jsxTemplate } from "@lark.js/mvc";
import styles from "./button.module.css";

export interface ButtonProps {
  label: string;
  variant: "primary" | "secondary" | "ghost";
  size: "sm" | "md" | "lg";
  disabled: boolean;
}

interface ButtonData {
  label: string;
  disabled: boolean;
  waVariant: string;
  waAppearance: string;
  waSize: string;
}

const template = jsxTemplate<ButtonData>(
  ({ label, disabled, waVariant, waAppearance, waSize }) => (
    <wa-button
      class={styles["button"]}
      type="button"
      variant={waVariant}
      appearance={waAppearance}
      size={waSize}
      disabled={disabled}
      onClick="press"
    >
      {label}
    </wa-button>
  ),
);

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

export default defineView((ctx, params) => {
  const props = (params ?? {}) as Partial<ButtonProps>;

  ctx.updater.set({
    label: props.label ?? "Button",
    variant: props.variant ?? "primary",
    size: props.size ?? "md",
    disabled: props.disabled ?? false,
  });

  const assign = (): boolean | undefined => {
    ctx.updater.snapshot();
    const variant =
      ctx.updater.get<ButtonProps["variant"]>("variant") ?? "primary";
    const size = ctx.updater.get<ButtonProps["size"]>("size") ?? "md";
    ctx.updater.set({ ...variantMap[variant], waSize: sizeMap[size] });
    return ctx.updater.altered();
  };

  assign();
  ctx.renderMethod = () => {
    assign();
    ctx.updater.digest();
  };

  let clicks = 0;

  return {
    template,
    assign,
    events: {
      "press<click>": () => {
        if (ctx.updater.get<boolean>("disabled")) return;
        clicks += 1;
        ctx.owner.fire("click", { clicks });
      },
    },
  };
});
