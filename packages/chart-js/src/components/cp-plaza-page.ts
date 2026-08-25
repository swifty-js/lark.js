import { customElement, property, state } from "lit/decorators.js";
import type { TemplateResult } from "lit";
import { CpElement, html, nothing } from "@/components/base";
import { homeChartsApi, type ChartItem } from "@/lib/api";
import { icon } from "@/lib/icons";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { animateIn, animatePop } from "@/lib/anim";
import { ref, createRef } from "lit/directives/ref.js";

interface ChartGroup {
  name: string;
  count: number;
  list: ChartItem[];
}

const CATEGORIES: { name: string; pattern: RegExp }[] = [
  { name: "Bar", pattern: /bar$/i },
  { name: "Line", pattern: /line$/i },
  { name: "Area", pattern: /area$/i },
  { name: "Scatter", pattern: /scatter$/i },
  { name: "Pie", pattern: /pie$/i },
  { name: "Doughnut", pattern: /doughnut$/i },
  { name: "Radar", pattern: /radar$/i },
  { name: "Polar", pattern: /polar$/i },
  { name: "Bubble", pattern: /bubble$/i },
];

function categorize(chartType: string): string {
  for (const cat of CATEGORIES) {
    if (cat.pattern.test(chartType)) return cat.name;
  }
  return "Other";
}

function buildGroups(charts: ChartItem[]): ChartGroup[] {
  const groupMap = new Map<string, ChartGroup>();
  for (const c of charts) {
    const catName = categorize(c.chartType || "other");
    if (!groupMap.has(catName)) {
      groupMap.set(catName, { name: catName, count: 0, list: [] });
    }
    const g = groupMap.get(catName)!;
    g.list.push(c);
    g.count++;
  }
  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => b.count - a.count);
  return groups;
}

/**
 * Chart Plaza — community chart gallery with type filter chips, category
 * sections, and a preview dialog. Data loads from `/api/charts/home`.
 */
@customElement("cp-plaza-page")
export class CpPlazaPage extends CpElement {
  @property() activePath = "";

  @state() private charts: ChartItem[] = [];
  @state() private groups: ChartGroup[] = [];
  @state() private loading = true;
  @state() private types: { type: string; count: number }[] = [];
  @state() private activeType = "";
  @state() private searchText = "";
  @state() private preview: ChartItem | null = null;

  private dialogRef = createRef<HTMLElement>();
  private popAnimated = false;

  override connectedCallback(): void {
    super.connectedCallback();
    homeChartsApi()
      .then((res) => {
        if (res.ok && res.data) {
          const charts = res.data.charts;
          this.charts = charts;
          const countMap = new Map<string, number>();
          for (const c of charts) {
            const t = c.chartType || "other";
            countMap.set(t, (countMap.get(t) || 0) + 1);
          }
          const types = Array.from(countMap.entries()).map(([type, count]) => ({
            type,
            count,
          }));
          types.sort((a, b) => b.count - a.count);
          this.types = types;
          this.groups = buildGroups(charts);
        }
        this.loading = false;
        this.requestUpdate();
        queueMicrotask(() => {
          if (this.isConnected) animateIn(this, "[data-anim]");
        });
      })
      .catch(() => {
        this.loading = false;
      });
  }

  private applyFilter(type: string): void {
    this.activeType = type;
    const q = this.searchText.trim().toLowerCase();
    const filtered = this.charts.filter((c) => {
      const byType = !type || c.chartType === type;
      const bySearch = !q || (c.name || "").toLowerCase().includes(q);
      return byType && bySearch;
    });
    this.groups = buildGroups(filtered);
    this.requestUpdate();
    queueMicrotask(() => {
      if (this.isConnected)
        animateIn(this, "[data-anim-card]", { y: 24, stagger: 0.03 });
    });
  }

  private scrollToGroup(index: number): void {
    const sections = this.querySelectorAll<HTMLElement>("[data-group-section]");
    sections[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  private renderFilterBar(): TemplateResult | typeof nothing {
    if (!this.types.length) return nothing;
    const chip = (type: string, label: string, active: boolean) => html`
      <button
        data-anim
        class="${
          active
            ? " bg-brand text-white shadow-sm"
            : "border-border text-text-secondary hover:border-brand/50 hover:text-brand border hover:shadow-sm"
        } rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200"
        @click=${() => this.applyFilter(type)}
      >
        ${label}
      </button>
    `;
    return html`
      <div
        class="bg-surface/75 border-border sticky top-14 z-20 -mx-6 mb-8 border-y px-6 py-3 backdrop-blur-xl backdrop-saturate-150"
      >
        <div class="flex flex-wrap items-center gap-2">
          ${chip("", "All", !this.activeType)}
          ${this.types.map((t) =>
            chip(t.type, `${t.type} (${t.count})`, this.activeType === t.type),
          )}
          <div
            class="border-border ml-auto flex items-center gap-2 rounded-full border px-3 py-1"
          >
            ${unsafeHTML(
              `<span class="text-text-tertiary inline-flex">${icon("search", 13)}</span>`,
            )}
            <input
              type="text"
              placeholder="Search charts..."
              .value=${this.searchText}
              class="placeholder:text-text-tertiary/70 bg-transparent text-xs outline-none"
              @input=${(e: InputEvent) => {
                this.searchText = (e.target as HTMLInputElement).value;
                this.applyFilter(this.activeType);
              }}
            />
          </div>
        </div>
      </div>
    `;
  }

  private renderCard(item: ChartItem): TemplateResult {
    return html`
      <div
        data-anim-card
        class="group border-border bg-surface hover:border-brand/40 hover:shadow-card-hover relative cursor-pointer overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5"
        @click=${() => (this.preview = item)}
      >
        <div
          class="bg-surface-alt relative flex h-40 items-center justify-center overflow-hidden p-3"
        >
          <div
            class="bg-brand/5 pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          ></div>
          <img
            src=${item.previewUrl || ""}
            alt=${item.name || ""}
            class="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        <div class="border-border border-t px-4 py-3">
          <p class="text-text-primary truncate text-sm font-medium">
            ${item.name}
          </p>
          <div class="mt-1 flex items-center justify-between">
            ${
              item.chartType
                ? html`<span
                    class="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-[10px] font-medium"
                  >
                    ${item.chartType}
                  </span>`
                : nothing
            }
            <span class="text-text-tertiary text-[10px]">
              ${new Date(item.gmtModified).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  private renderPreviewDialog(): TemplateResult | typeof nothing {
    if (!this.preview) return nothing;
    const p = this.preview;
    return html`
      <div
        class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        @click=${() => (this.preview = null)}
      >
        <div
          class="border-border bg-surface shadow-modal animate-scale-in relative max-h-[85vh] max-w-4xl overflow-auto rounded-2xl border"
          @click=${(e: Event) => e.stopPropagation()}
          ${ref(this.dialogRef)}
        >
          <button
            class="text-text-secondary hover:bg-surface-alt hover:text-text-primary absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            @click=${() => (this.preview = null)}
          >
            ${unsafeHTML(icon("x", 16))}
          </button>
          <div class="p-6">
            <h3 class="text-text-primary mb-1 text-lg font-medium">
              ${p.name}
            </h3>
            ${
              p.chartType
                ? html`<p class="text-text-secondary mb-4 text-xs">
                    ${p.chartType}
                  </p>`
                : nothing
            }
            <div
              class="bg-surface-alt flex items-center justify-center rounded-lg p-4"
            >
              <img
                src=${p.previewUrl || ""}
                alt=${p.name || ""}
                class="max-h-[60vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected override updated(): void {
    // Animate once per preview-open, not on every subsequent state update.
    if (this.preview && !this.popAnimated && this.dialogRef.value) {
      this.popAnimated = true;
      animatePop(this.dialogRef.value);
    }
    if (!this.preview) this.popAnimated = false;
  }

  protected override render(): TemplateResult | typeof nothing {
    return html`
      <div class="relative mx-auto max-w-7xl px-6 py-8">
        <div class="mb-8">
          <div class="flex items-end justify-between">
            <div>
              <div class="mb-2 flex items-center gap-2">
                ${unsafeHTML(
                  `<span class="text-brand inline-flex">${icon("sparkles", 16)}</span>`,
                )}
                <span
                  class="text-brand text-xs font-semibold tracking-widest uppercase"
                  >Community Gallery</span
                >
              </div>
              <h1 class="text-text-primary text-3xl font-bold tracking-tight">
                Chart<span class="text-brand">Plaza</span>
              </h1>
              <p class="text-text-secondary mt-1.5 text-sm">
                Browse and discover community charts
              </p>
            </div>
            <div class="hidden items-center gap-2 sm:flex">
              <span class="text-text-tertiary text-xs">Total</span>
              <span
                class="bg-brand/10 text-brand rounded-full px-3 py-1 text-sm font-semibold tabular-nums"
              >
                ${this.charts.length}
              </span>
            </div>
          </div>
        </div>

        ${this.renderFilterBar()}
        ${
          this.loading
            ? html`<div
                class="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4"
              >
                ${[1, 2, 3, 4, 5, 6, 7, 8].map(
                  () => html`
                    <div
                      class="bg-surface-alt h-56 animate-pulse rounded-xl"
                    ></div>
                  `,
                )}
              </div>`
            : html`
                ${
                  this.groups.length > 1 && !this.activeType
                    ? html`<div class="mb-4 flex flex-wrap gap-1.5">
                        ${this.groups.map(
                          (g, gi) => html`
                            <button
                              data-anim
                              class="text-text-secondary hover:bg-surface-alt hover:text-brand rounded-md px-2.5 py-1 text-xs transition-colors"
                              @click=${() => this.scrollToGroup(gi)}
                            >
                              ${g.name} (${g.count})
                            </button>
                          `,
                        )}
                      </div>`
                    : nothing
                }
                ${this.groups.map(
                  (group) => html`
                    <div data-group-section class="mb-10 scroll-mt-32">
                      ${
                        this.groups.length > 1 && !this.activeType
                          ? html`<div class="mb-4 flex items-center gap-3">
                              <h2
                                class="text-text-primary text-base font-semibold"
                              >
                                ${group.name}
                              </h2>
                              <span
                                class="bg-surface-alt text-text-secondary rounded-full px-2 py-0.5 text-xs tabular-nums"
                              >
                                ${group.count}
                              </span>
                              <div class="bg-border h-px flex-1"></div>
                            </div>`
                          : nothing
                      }
                      <div
                        class="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4"
                      >
                        ${group.list.map((item) => this.renderCard(item))}
                      </div>
                    </div>
                  `,
                )}
                ${
                  !this.loading && this.groups.length === 0
                    ? html`<div
                        class="text-text-secondary flex h-64 flex-col items-center justify-center"
                      >
                        ${unsafeHTML(
                          `<span class="text-text-tertiary/40 inline-flex">${icon("search", 40)}</span>`,
                        )}
                        <p class="mt-4 text-lg">No charts found</p>
                        <p class="mt-1 text-sm">
                          Try selecting a different chart type or search term
                        </p>
                      </div>`
                    : nothing
                }
              `
        }
      </div>
      ${this.renderPreviewDialog()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cp-plaza-page": CpPlazaPage;
  }
}
