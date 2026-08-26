/**
 * `<wc-select>` — Lit select styled with Tailwind utilities (trigger recipe
 * from README.md, backed by a native <select> for the popup).
 *
 * `options` uses Lit's Array converter, so lark passes it as a JSON string
 * attribute (`options={JSON.stringify([...])}`); entries are strings or
 * `{ label, value }` pairs.
 *
 * Host handling: the native `change` event is NOT composed and would die at
 * the shadow boundary — the handler re-dispatches a composed
 * `CustomEvent("change", { detail: { value } })` from the host so lark's
 * `onChange` receives it. `delegatesFocus` forwards host focus to the
 * control.
 */
import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { tailwindStyles } from "./tailwind-styles";

export type LkSelectOption = string | { label: string; value: string };

export type LkSelectSize = "sm" | "default";

const BASE =
  "flex w-full appearance-none items-center justify-between gap-1.5 border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const SIZES: Record<LkSelectSize, string> = {
  sm: "h-7 rounded-md",
  default: "h-8 rounded-lg",
};

@customElement("wc-select")
export class LkSelect extends LitElement {
  static override shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static override styles = [
    tailwindStyles,
    css`
      :host {
        display: inline-block;
      }
      :host([hidden]) {
        display: none;
      }
    `,
  ];

  @property({ type: Array }) options: LkSelectOption[] = [];

  @property() value = "";

  @property() placeholder = "Select…";

  @property({ type: Boolean, reflect: true }) disabled = false;

  @property() size: LkSelectSize = "default";

  #changed(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.value = select.value;
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const entries = (Array.isArray(this.options) ? this.options : []).map(
      (option) =>
        typeof option === "string" ? { label: option, value: option } : option,
    );
    const classes = [
      BASE,
      SIZES[this.size] ?? SIZES.default,
      this.value === "" ? "text-muted-foreground" : "text-foreground",
    ].join(" ");

    return html`
      <div class="relative w-full">
        <select
          part="base"
          class=${classes}
          ?disabled=${this.disabled}
          @change=${this.#changed}
        >
          <option value="" disabled hidden ?selected=${this.value === ""}>
            ${this.placeholder}
          </option>
          ${entries.map(
            (option) => html`
              <option
                value=${option.value}
                ?selected=${option.value === this.value}
              >
                ${option.label}
              </option>
            `,
          )}
        </select>
        <span
          class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground"
          aria-hidden="true"
        >
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wc-select": LkSelect;
  }
}
