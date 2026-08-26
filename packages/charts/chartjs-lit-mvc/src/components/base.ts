import { LitElement, html, nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { icon, type IconName } from "@/lib/icons";

type MaybeRender = TemplateResult | typeof nothing;

/**
 * Shared base for chart.js Lit components: light DOM (so the global
 * Tailwind stylesheet applies) + an inline `ic` icon helper wrapping
 * lucide-static SVG strings.
 */
export class WcElement extends LitElement {
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  public override connectedCallback(): void {
    super.connectedCallback();
    // Custom elements default to display: inline — normalize to block.
    this.classList.add("block");
  }

  protected ic(name: IconName, size = 16, cls = ""): TemplateResult {
    return html`${unsafeHTML(
      `<span class="inline-flex items-center justify-center ${cls}" aria-hidden="true">${icon(name, size)}</span>`,
    )}`;
  }

  protected or<T>(v: T | null | undefined, fallback: T): T {
    return v === null || v === undefined ? fallback : v;
  }

  protected nothing = nothing;
}

export { html, unsafeHTML, nothing };
export type { TemplateResult, MaybeRender };
