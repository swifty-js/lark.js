/**
 * `<lk-card>` — Lit card styled with Tailwind utilities (see README.md for
 * the reference recipe).
 *
 * Slots: default (content), `header`, `footer`. Shadow CSS cannot see
 * whether a slot has assigned nodes, so `slotchange` handlers track that in
 * reactive state and hide the empty sections (README's
 * `has-data-[slot=...]` trick does not cross the shadow boundary).
 *
 * Host handling: `:host { display: block }`; all utilities live on inner
 * elements. Card spacing is a CSS custom property set via inline style so
 * `size="sm"` never relies on conflicting utility order.
 */
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { tailwindStyles } from "./tailwind-styles";

export type LkCardSize = "default" | "sm";

@customElement("lk-card")
export class LkCard extends LitElement {
  static override styles = [
    tailwindStyles,
    css`
      :host {
        display: block;
      }
      :host([hidden]) {
        display: none;
      }
    `,
  ];

  @property() size: LkCardSize = "default";

  @state() private hasHeader = false;

  @state() private hasFooter = false;

  #slotChanged(event: Event): void {
    const slot = event.target as HTMLSlotElement;
    const filled = slot.assignedNodes({ flatten: true }).length > 0;
    if (slot.name === "header") this.hasHeader = filled;
    if (slot.name === "footer") this.hasFooter = filled;
  }

  override render() {
    const container = [
      "flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 shadow-elegant transition-all duration-200 hover:shadow-elegant-hover",
      this.hasFooter ? "pb-0" : "",
    ].join(" ");

    return html`
      <div
        part="base"
        class=${container}
        style="--card-spacing: ${this.size === "sm" ? "0.75rem" : "1rem"}"
      >
        <div
          class="grid auto-rows-min items-start gap-1 px-(--card-spacing) ${
            this.hasHeader ? "" : "hidden"
          }"
        >
          <slot name="header" @slotchange=${this.#slotChanged}></slot>
        </div>

        <div class="px-(--card-spacing)">
          <slot></slot>
        </div>

        <div
          class="flex items-center border-t border-border bg-muted/50 p-(--card-spacing) ${
            this.hasFooter ? "" : "hidden"
          }"
        >
          <slot name="footer" @slotchange=${this.#slotChanged}></slot>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "lk-card": LkCard;
  }
}
