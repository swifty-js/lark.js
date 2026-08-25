/**
 * `<lk-button>` — Lit button styled with Tailwind utilities (see README.md
 * for the reference recipe).
 *
 * Host handling: Tailwind classes live on the INNER <button>/<a> — the host
 * only gets `display`/`pointer-events` rules, because utilities in the
 * adopted sheet cannot style the host's outside. The inner element is
 * `w-full` so a width applied to the host from the light DOM flows through.
 * Native `click` events are composed, so they cross the shadow boundary and
 * retarget to the host — `onClick` in lark JSX just works.
 */
import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { tailwindStyles } from "./tailwind-styles";

export type LkButtonVariant =
  "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";

export type LkButtonSize = "sm" | "default" | "lg";

const BASE =
  "inline-flex w-full shrink-0 items-center justify-center border border-transparent text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const VARIANTS: Record<LkButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
  outline: "border-border bg-background text-foreground hover:bg-muted",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
  ghost: "text-foreground hover:bg-muted",
  destructive:
    "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
  link: "text-primary underline-offset-4 hover:underline",
};

const SIZES: Record<LkButtonSize, string> = {
  sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8rem]",
  default: "h-8 gap-1.5 rounded-lg px-2.5",
  lg: "h-9 gap-1.5 rounded-lg px-3",
};

@customElement("lk-button")
export class LkButton extends LitElement {
  static override shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static override styles = [
    tailwindStyles,
    css`
      :host {
        display: inline-flex;
      }
      :host([hidden]) {
        display: none;
      }
      :host([disabled]) {
        pointer-events: none;
      }
    `,
  ];

  @property() variant: LkButtonVariant = "default";

  @property() size: LkButtonSize = "default";

  @property({ type: Boolean, reflect: true }) disabled = false;

  @property() type: "button" | "submit" | "reset" = "button";

  /** Renders an <a> instead of a <button>. */
  @property() href = "";

  override render() {
    const classes = [
      BASE,
      VARIANTS[this.variant] ?? VARIANTS.default,
      SIZES[this.size] ?? SIZES.default,
    ].join(" ");

    return this.href
      ? html`
          <a
            part="base"
            class=${classes}
            href=${ifDefined(this.disabled ? undefined : this.href)}
            aria-disabled=${ifDefined(this.disabled ? "true" : undefined)}
          >
            <slot></slot>
          </a>
        `
      : html`
          <button
            part="base"
            class=${classes}
            type=${this.type}
            ?disabled=${this.disabled}
          >
            <slot></slot>
          </button>
        `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "lk-button": LkButton;
  }
}
