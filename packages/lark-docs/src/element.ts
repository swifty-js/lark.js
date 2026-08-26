import {
  html,
  LitElement,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

const TAG = "wc-mermaid";

let instanceSeq = 0;
let renderSeq = 0;

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export class MermaidElement extends LitElement {
  static override properties = {
    graph: { type: String },
    svg: { state: true },
    error: { state: true },
  };

  declare graph: string;
  declare svg: string;
  declare error: string;

  private readonly instanceId = `${TAG}-${++instanceSeq}`;
  private renderToken = 0;
  private renderedDark: boolean | undefined;
  private observer: MutationObserver | undefined;

  constructor() {
    super();
    this.graph = "";
    this.svg = "";
    this.error = "";
  }

  // Render into light DOM so the site's Tailwind utilities apply.
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add("block", "my-4");
    this.observer = new MutationObserver(() => {
      if (this.renderedDark !== undefined && isDark() !== this.renderedDark) {
        void this.renderGraph();
      }
    });
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.observer?.disconnect();
    this.observer = undefined;
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has("graph")) void this.renderGraph();
  }

  private async renderGraph(): Promise<void> {
    const code = this.graph ? decodeURIComponent(this.graph) : "";
    if (!code.trim()) return;
    const token = ++this.renderToken;
    const dark = isDark();
    try {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? "dark" : "default",
      });
      const { svg } = await mermaid.render(
        `${this.instanceId}-${++renderSeq}`,
        code,
      );
      if (token !== this.renderToken) return;
      this.renderedDark = dark;
      this.svg = svg;
      this.error = "";
    } catch (err) {
      if (token !== this.renderToken) return;
      this.renderedDark = dark;
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  protected override render(): TemplateResult {
    if (this.error) {
      return html`<pre
        class="overflow-x-auto text-sm text-[var(--vp-c-danger-1)]"
      >${this.error}</pre>`;
    }
    if (!this.svg) {
      return html`<p class="text-sm text-[var(--vp-c-text-2)]">
        Mermaid loading...
      </p>`;
    }
    return html`<div class="flex justify-center overflow-x-auto">
      ${unsafeHTML(this.svg)}
    </div>`;
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, MermaidElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "wc-mermaid": MermaidElement;
  }
}
