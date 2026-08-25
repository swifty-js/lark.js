import { customElement } from "lit/decorators.js";
import type { TemplateResult } from "lit";
import { WcElement, html } from "@/components/base";
import { icon } from "@/lib/icons";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

@customElement("wc-footer")
export class WcFooter extends WcElement {
  protected override render(): TemplateResult {
    return html`
      <footer class="border-border bg-surface-alt/40 border-t">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div class="flex items-center gap-2">
            ${unsafeHTML(`<span class="text-brand/60 inline-flex">${icon("chartBar", 16)}</span>`)}
            <p class="text-text-tertiary text-sm">chart.js</p>
          </div>
          <p class="text-text-tertiary text-xs">Crafted with larky · Lit · chart.js · GSAP</p>
        </div>
      </footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wc-footer": WcFooter;
  }
}
