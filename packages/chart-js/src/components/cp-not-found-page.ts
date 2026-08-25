import { customElement, property } from "lit/decorators.js";
import type { TemplateResult } from "lit";
import { CpElement, html } from "@/components/base";
import { icon } from "@/lib/icons";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { animateIn } from "@/lib/anim";

@customElement("cp-not-found-page")
export class CpNotFoundPage extends CpElement {
  @property() activePath = "";

  protected override firstUpdated(): void {
    animateIn(this, "[data-anim]", { y: 16, stagger: 0.08 });
  }

  protected override render(): TemplateResult {
    return html`
      <div
        class="relative flex min-h-[70vh] flex-col items-center justify-center px-6 text-center"
      >
        <div
          class="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black_30%,transparent_75%)] bg-[size:32px_32px] opacity-50"
        ></div>
        <p data-anim class="text-brand text-8xl font-bold tracking-tighter">
          404
        </p>
        <h1 data-anim class="text-text-primary mt-4 text-xl font-medium">
          Page not found
        </h1>
        <p data-anim class="text-text-secondary mt-2 text-sm">
          The page you are looking for does not exist.
        </p>
        <button
          data-anim
          class="hover:shadow-glow mt-6 flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-95"
          @click=${() =>
            this.dispatchEvent(
              new CustomEvent("nav-request", {
                detail: "/plaza",
                bubbles: true,
                composed: true,
              }),
            )}
        >
          ${unsafeHTML(icon("arrowRight", 14))} Back to Chart Plaza
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cp-not-found-page": CpNotFoundPage;
  }
}
