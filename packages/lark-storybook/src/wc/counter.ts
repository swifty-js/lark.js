/**
 * `<wc-counter>` — Lit counter card composing `<wc-button>`, styled with
 * Tailwind utilities.
 *
 * Controlled-friendly: `value` is a plain attribute/property; every button
 * press updates it locally AND dispatches a composed
 * `CustomEvent("change", { detail: { count } })`. A parent that owns the
 * state (the lark Counter component) can push `value` back — Lit's changed
 * check makes the echo a no-op — while standalone usage in plain HTML still
 * works.
 *
 * Host handling: `:host { display: inline-flex }`; utilities live on the
 * inner container.
 */
import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { tailwindStyles } from "./tailwind-styles";
import "./button";

@customElement("wc-counter")
export class LkCounter extends LitElement {
  static override styles = [
    tailwindStyles,
    css`
      :host {
        display: inline-flex;
      }
      :host([hidden]) {
        display: none;
      }
    `,
  ];

  @property() label = "Counter";

  @property({ type: Number }) value = 0;

  @property({ type: Number }) step = 1;

  /** The value the Reset button returns to. */
  @property({ type: Number }) initial = 0;

  #set(next: number): void {
    this.value = next;
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { count: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div
        part="base"
        class="flex min-w-55 flex-col items-center gap-3 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 shadow-elegant"
      >
        <div class="text-xs tracking-wider text-muted-foreground uppercase">
          ${this.label}
        </div>

        <div class="font-mono text-4xl leading-none font-semibold">
          ${this.value}
        </div>

        <div class="flex gap-1.5" role="group" aria-label="Counter actions">
          <wc-button
            variant="outline"
            size="sm"
            @click=${() => this.#set(this.value - this.step)}
          >
            &minus;&nbsp;${this.step}
          </wc-button>
          <wc-button
            variant="ghost"
            size="sm"
            @click=${() => this.#set(this.initial)}
          >
            Reset
          </wc-button>
          <wc-button
            variant="default"
            size="sm"
            @click=${() => this.#set(this.value + this.step)}
          >
            +&nbsp;${this.step}
          </wc-button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wc-counter": LkCounter;
  }
}
