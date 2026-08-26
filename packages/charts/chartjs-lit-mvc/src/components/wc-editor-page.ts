import { customElement, property, state } from "lit/decorators.js";
import type { TemplateResult } from "lit";
import { WcElement, html, nothing } from "@/components/base";
import { ref, createRef } from "lit/directives/ref.js";
import { icon, chartTypeIcons } from "@/lib/icons";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import * as monaco from "monaco-editor";
import { Chart, registerables, type ChartConfiguration } from "chart.js/auto";
import gsap from "gsap";
import { saveChartApi, getProjectDetailApi, type ChartItem } from "@/lib/api";
import {
  getAllChartTypes,
  getChartType as getChartTypeConfig,
  generateCode,
  CHART_THEMES,
} from "@/lib/chart-builder";

Chart.register(...registerables);

const DEFAULT_DATA: (string | number)[][] = [
  ["x", "y", "y2"],
  ["Jan", 120, 80],
  ["Feb", 180, 95],
  ["Mar", 150, 110],
  ["Apr", 220, 130],
  ["May", 190, 145],
  ["Jun", 260, 160],
  ["Jul", 240, 170],
  ["Aug", 280, 185],
  ["Sep", 210, 150],
  ["Oct", 250, 175],
  ["Nov", 300, 200],
  ["Dec", 270, 190],
];

function isDarkMode(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function evalChartCode(
  code: string,
  data: unknown,
): { options: ChartConfiguration | null; error: string } {
  try {
    const fn = new Function(
      "data",
      code + "\n;return typeof options !== 'undefined' ? options : null;",
    );
    const options = fn(data) as ChartConfiguration | null;
    if (!options) {
      return { options: null, error: "No 'options' variable found in code" };
    }
    return { options, error: "" };
  } catch (e) {
    return {
      options: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Visual chart editor: left panel (visual config / Monaco code / data
 * grid), right side live chart.js preview. Navigation back to projects
 * dispatches `nav-request`.
 */
@customElement("wc-editor-page")
export class WcEditorPage extends WcElement {
  @property() activePath = "/editor";

  @state() private activeTab: "visual" | "code" | "data" = "visual";
  @state() private chartName = "Untitled Chart";
  @state() private saving = false;
  @state() private status: "idle" | "saved" | "error" = "idle";
  @state() private tableData: (string | number)[][] = DEFAULT_DATA.map((r) => [...r]);
  @state() private leftExpand = true;
  @state() private rightExpand = false;
  @state() private chartWidth = 600;
  @state() private chartHeight = 400;
  @state() private copied = false;
  @state() private chartType = "line";
  @state() private datasource: Record<string, string[]> = {
    x: [],
    y0: [],
  };
  @state() private themeColors: string[] = CHART_THEMES.slice(0, 8);
  @state() private dimensions: string[] = [];
  @state() private metrics: string[] = [];
  @state() private previewError = "";

  private monacoHost = createRef<HTMLDivElement>();
  private previewHost = createRef<HTMLDivElement>();
  private codeEditor: monaco.editor.IStandaloneCodeEditor | null = null;
  private code = "";
  private chart: Chart | null = null;
  private autoRunTimer: ReturnType<typeof setTimeout> | null = null;
  private chartId = "";
  private projectId = "";
  private destroyed = false;

  private get chartTypes() {
    return getAllChartTypes();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const params = new URLSearchParams(window.location.search);
    this.projectId = params.get("projectId") || "";
    this.chartId = params.get("chartId") || "";

    const headers = DEFAULT_DATA[0] as string[];
    const dims = headers.slice(0, 1);
    const mets = headers.slice(1);
    this.dimensions = dims;
    this.metrics = mets;
    this.datasource = {
      x: dims,
      y0: mets.length > 0 ? [mets[0]] : [],
      y1: [],
    };

    const defaultW = Math.min(600, window.innerWidth - 500 - 220 - 80);
    this.chartWidth = Math.max(200, defaultW);

    this.code = generateCode("line", {
      x: dims,
      y0: mets.length > 0 ? [mets[0]] : [],
      y1: [],
    });

    if (this.chartId && this.projectId) {
      getProjectDetailApi(Number(this.projectId)).then((res) => {
        if (this.destroyed || !res.ok || !res.data) return;
        const chart = res.data.charts.find((c: ChartItem) => String(c.id) === this.chartId);
        if (chart) {
          this.chartName = chart.name || "Untitled Chart";
          if (chart.chartOptions) {
            this.code = chart.chartOptions;
            if (this.codeEditor) this.codeEditor.setValue(chart.chartOptions);
          }
          if (chart.chartData && Array.isArray(chart.chartData)) {
            const d = chart.chartData as (string | number)[][];
            this.tableData = d;
            this.updateDimensionsFromData(d);
          }
          this.renderPreview();
        }
      });
    }
  }

  override disconnectedCallback(): void {
    this.destroyed = true;
    if (this.autoRunTimer) clearTimeout(this.autoRunTimer);
    this.chart?.destroy();
    this.chart = null;
    this.codeEditor?.dispose();
    this.codeEditor = null;
    super.disconnectedCallback();
  }

  protected override updated(): void {
    if (this.activeTab === "code" && !this.codeEditor) {
      queueMicrotask(() => this.ensureMonaco());
    }
  }

  private updateDimensionsFromData(data: (string | number)[][]): void {
    const headers = (data[0] || []) as string[];
    this.dimensions = headers.slice(0, 1);
    this.metrics = headers.slice(1);
  }

  private renderPreview(): void {
    const container = this.previewHost.value;
    if (!container) return;
    const { options, error } = evalChartCode(this.code, this.tableData);

    this.chart?.destroy();
    this.chart = null;

    if (error || !options) {
      this.previewError = error;
      container.innerHTML = "";
      return;
    }
    this.previewError = "";
    container.innerHTML = "";
    try {
      const canvas = document.createElement("canvas");
      container.appendChild(canvas);
      this.chart = new Chart(canvas, options);
      gsap.fromTo(
        container,
        { opacity: 0, scale: 0.97 },
        { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" },
      );
    } catch (e) {
      this.previewError = e instanceof Error ? e.message : String(e);
    }
  }

  private scheduleAutoRun(): void {
    if (this.autoRunTimer) clearTimeout(this.autoRunTimer);
    this.autoRunTimer = setTimeout(() => this.renderPreview(), 800);
  }

  private applyVisualConfig(): void {
    const ds: Record<string, string[]> = { ...this.datasource };
    if (this.themeColors.length > 0) ds.theme = this.themeColors;
    this.code = generateCode(this.chartType, ds);
    if (this.codeEditor) this.codeEditor.setValue(this.code);
    this.scheduleAutoRun();
  }

  private ensureMonaco(): void {
    if (this.codeEditor || !this.monacoHost.value) return;
    const ed = monaco.editor.create(this.monacoHost.value, {
      value: this.code,
      language: "javascript",
      theme: isDarkMode() ? "vs-dark" : "vs",
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      padding: { top: 12 },
      fontFamily: "'Geist Mono', ui-monospace, monospace",
    });
    ed.onDidChangeModelContent(() => {
      this.code = ed.getValue();
      this.scheduleAutoRun();
    });
    this.codeEditor = ed;
  }

  private saveChart(): void {
    if (!this.projectId || this.saving) return;
    this.saving = true;
    this.status = "idle";
    saveChartApi({
      projectId: Number(this.projectId),
      chartId: this.chartId ? Number(this.chartId) : undefined,
      chartOptions: this.code,
      chartData: JSON.stringify(this.tableData),
      name: this.chartName,
      mode: "develop",
    })
      .then((res) => {
        this.saving = false;
        if (res.ok && res.data) {
          this.status = "saved";
          if (!this.chartId && res.data.chartId) {
            this.chartId = String(res.data.chartId);
          }
        } else {
          this.status = "error";
        }
      })
      .catch(() => {
        this.saving = false;
        this.status = "error";
      });
  }

  private copyCode(): void {
    navigator.clipboard.writeText(this.code).then(() => {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    });
  }

  private addRow(): void {
    const cols = this.tableData[0] ? this.tableData[0].length : 1;
    this.tableData = [...this.tableData, new Array(cols).fill("")];
  }

  private addCol(): void {
    const name = "col" + ((this.tableData[0]?.length || 0) + 1);
    const updated = this.tableData.map((row, i) => [...row, i === 0 ? name : ""]);
    this.tableData = updated;
    this.updateDimensionsFromData(updated);
  }

  private removeRow(rowIndex: number): void {
    if (this.tableData.length <= 2) return;
    this.tableData = this.tableData.filter((_, i) => i !== rowIndex);
  }

  private removeCol(colIndex: number): void {
    if (!this.tableData[0] || this.tableData[0].length <= 1) return;
    const updated = this.tableData.map((row) => row.filter((_, i) => i !== colIndex));
    this.tableData = updated;
    this.updateDimensionsFromData(updated);
  }

  private nav(path: string): void {
    this.dispatchEvent(
      new CustomEvent("nav-request", {
        detail: path,
        bubbles: true,
        composed: true,
      }),
    );
  }

  // ---- render helpers ----

  private renderToolbar(): TemplateResult {
    return html`
      <header
        class="bg-surface/75 border-border flex h-12 shrink-0 items-center justify-between border-b px-4 backdrop-blur-xl backdrop-saturate-150"
      >
        <div class="flex items-center gap-3">
          <button
            class="text-text-secondary hover:bg-surface-alt hover:text-text-primary flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors"
            @click=${() =>
              this.nav(this.projectId ? `/projects?projectId=${this.projectId}` : "/projects")}
          >
            ${unsafeHTML(icon("chevronLeft", 14))} Back
          </button>
          <div class="bg-border h-4 w-px"></div>
          <input
            type="text"
            .value=${this.chartName}
            class="text-text-primary hover:border-border focus:border-brand focus:ring-brand/20 rounded-md border border-transparent bg-transparent px-2 py-0.5 text-sm font-medium transition-colors outline-none focus:ring-2"
            @input=${(e: InputEvent) => (this.chartName = (e.target as HTMLInputElement).value)}
          />
          ${this.status === "saved"
            ? html`<span
                class="bg-success-light text-success flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              >
                ${unsafeHTML(icon("check", 10))} Saved
              </span>`
            : nothing}
          ${this.status === "error"
            ? html`<span
                class="bg-danger-light text-danger flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              >
                ${unsafeHTML(icon("x", 10))} Failed
              </span>`
            : nothing}
        </div>

        <div class="flex items-center gap-2">
          <button
            class="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors"
            title="Copy code"
            @click=${() => this.copyCode()}
          >
            ${this.copied
              ? html`${unsafeHTML(icon("check", 12))} Copied`
              : html`${unsafeHTML(icon("copy", 12))} Copy`}
          </button>
          <button
            class="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors"
            @click=${() => this.renderPreview()}
          >
            ${unsafeHTML(icon("play", 10))} Run
          </button>
          <button
            class="hover:shadow-glow rounded-md px-3 py-1 text-xs font-medium text-white shadow-sm transition-all disabled:opacity-50"
            ?disabled=${this.saving}
            @click=${() => this.saveChart()}
          >
            ${this.saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>
    `;
  }

  private fieldChips(
    title: string,
    selected: string[] | undefined,
    candidates: string[],
    accent: "brand" | "success",
    onAdd: (field: string) => void,
    onRemove: (field: string) => void,
  ): TemplateResult {
    const selCls = accent === "brand" ? "bg-brand/10 text-brand" : "bg-success/10 text-success";
    return html`
      <div class="mb-5">
        <h4 class="text-text-tertiary mb-2.5 text-xs font-semibold tracking-widest uppercase">
          ${title}
        </h4>
        <div class="mb-2 flex flex-wrap gap-1.5">
          ${selected && selected.length > 0
            ? selected.map(
                (f) => html`
                  <span
                    class="${selCls} inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                  >
                    ${f}
                    <button class="opacity-60 hover:opacity-100" @click=${() => onRemove(f)}>
                      ${unsafeHTML(icon("x", 8))}
                    </button>
                  </span>
                `,
              )
            : html`<span class="text-text-tertiary text-xs italic"> No selection </span>`}
        </div>
        <div class="flex flex-wrap gap-1">
          ${candidates.map(
            (c) => html`
              <button
                class="border-border text-text-secondary hover:border-brand/50 hover:text-brand rounded border px-1.5 py-0.5 text-[10px] transition-colors"
                @click=${() => onAdd(c)}
              >
                + ${c}
              </button>
            `,
          )}
        </div>
      </div>
    `;
  }

  private renderVisualTab(): TemplateResult {
    return html`
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <div class="mb-5">
          <h4 class="text-text-tertiary mb-2.5 text-xs font-semibold tracking-widest uppercase">
            Chart Type
          </h4>
          <div class="grid grid-cols-4 gap-2">
            ${this.chartTypes.map(
              (ct) => html`
                <button
                  class="${this.chartType === ct.type
                    ? "border-brand bg-brand/5 text-brand shadow-sm"
                    : "border-border text-text-secondary hover:border-brand/30 hover:text-text-primary"} flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-all duration-200"
                  @click=${() => {
                    if (ct.type === this.chartType) return;
                    this.chartType = ct.type;
                    const config = getChartTypeConfig(ct.type);
                    const headers = (this.tableData[0] || []) as string[];
                    const dims = headers.slice(0, 1);
                    const mets = headers.slice(1);
                    const ds: Record<string, string[]> = { x: [], y0: [] };
                    if (config) {
                      if ("x" in config.datasource)
                        ds.x = dims.slice(0, config.editorConfig.x?.limit || 1);
                      ds.y0 = mets.slice(0, config.editorConfig.y0?.limit || 1);
                      if ("y1" in config.datasource) ds.y1 = [];
                    }
                    this.datasource = ds;
                    this.applyVisualConfig();
                  }}
                >
                  ${unsafeHTML(chartTypeIcons[ct.icon] || "")}
                  <span class="text-[10px] leading-tight">${ct.name}</span>
                </button>
              `,
            )}
          </div>
        </div>

        ${this.fieldChips(
          "Dimensions (X Axis)",
          this.datasource.x,
          this.dimensions,
          "brand",
          (d) => {
            const ds = { ...this.datasource };
            const config = getChartTypeConfig(this.chartType);
            const limit = config?.editorConfig.x?.limit || 1;
            if (!ds.x) ds.x = [];
            if (ds.x.includes(d)) return;
            if (ds.x.length >= limit) ds.x = ds.x.slice(0, limit - 1);
            ds.x = [...ds.x, d];
            this.datasource = ds;
            this.applyVisualConfig();
          },
          (d) => {
            const ds = { ...this.datasource };
            ds.x = (ds.x || []).filter((f) => f !== d);
            this.datasource = ds;
            this.applyVisualConfig();
          },
        )}
        ${this.fieldChips(
          "Metrics (Y Axis)",
          this.datasource.y0,
          this.metrics,
          "success",
          (m) => {
            const ds = { ...this.datasource };
            if (!ds.y0) ds.y0 = [];
            if (ds.y0.includes(m)) return;
            ds.y0 = [...ds.y0, m];
            this.datasource = ds;
            this.applyVisualConfig();
          },
          (m) => {
            const ds = { ...this.datasource };
            ds.y0 = (ds.y0 || []).filter((f) => f !== m);
            this.datasource = ds;
            this.applyVisualConfig();
          },
        )}
        ${this.datasource.y1 !== undefined
          ? this.fieldChips(
              "Secondary Axis",
              this.datasource.y1,
              this.metrics,
              "brand",
              (m) => {
                const ds = { ...this.datasource };
                if (!ds.y1) ds.y1 = [];
                if (ds.y1.includes(m)) return;
                ds.y1 = [...ds.y1, m];
                this.datasource = ds;
                this.applyVisualConfig();
              },
              (m) => {
                const ds = { ...this.datasource };
                ds.y1 = (ds.y1 || []).filter((f) => f !== m);
                this.datasource = ds;
                this.applyVisualConfig();
              },
            )
          : nothing}

        <div>
          <h4 class="text-text-tertiary mb-2.5 text-xs font-semibold tracking-widest uppercase">
            Theme Colors
          </h4>
          <div class="flex flex-wrap items-center gap-1.5">
            ${this.themeColors.map(
              (color, ci) => html`
                <span
                  class="group border-border/50 relative inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-transform hover:scale-110"
                  style="background-color: ${color}"
                >
                  <button
                    class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    @click=${() => {
                      const colors = [...this.themeColors];
                      colors.splice(ci, 1);
                      this.themeColors = colors;
                      this.applyVisualConfig();
                    }}
                  >
                    ${unsafeHTML(icon("x", 8))}
                  </button>
                </span>
              `,
            )}
            <button
              class="border-border text-text-tertiary hover:border-brand hover:text-brand flex h-6 w-6 items-center justify-center rounded-full border border-dashed transition-colors"
              @click=${() => {
                const colors = [...this.themeColors];
                const available = CHART_THEMES.find((c) => !colors.includes(c));
                if (available) {
                  colors.push(available);
                  this.themeColors = colors;
                  this.applyVisualConfig();
                }
              }}
            >
              ${unsafeHTML(icon("plus", 10))}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderDataTab(): TemplateResult {
    const headers = this.tableData[0] || [];
    return html`
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <button
            class="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
            @click=${() => this.addRow()}
          >
            ${unsafeHTML(icon("plus", 10))} Row
          </button>
          <button
            class="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
            @click=${() => this.addCol()}
          >
            ${unsafeHTML(icon("plus", 10))} Col
          </button>
          <span class="text-text-tertiary ml-auto text-xs tabular-nums">
            ${this.tableData.length} rows × ${headers.length} cols
          </span>
        </div>
        <div class="min-h-0 flex-1 overflow-auto">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  class="border-border bg-surface-alt text-text-tertiary sticky left-0 z-10 w-8 border-r border-b px-1 py-2 text-center text-xs"
                >
                  #
                </th>
                ${headers.map(
                  (col, ci) => html`
                    <th
                      class="group border-border bg-surface-alt relative border-r border-b px-2 py-1.5"
                    >
                      <input
                        type="text"
                        .value=${String(col)}
                        class="text-text-primary focus:text-brand w-full min-w-15 bg-transparent text-center text-xs font-medium transition-colors outline-none"
                        @change=${(e: Event) => {
                          const value = (e.target as HTMLInputElement).value;
                          const data = this.tableData.map((r) => [...r]);
                          data[0][ci] = value;
                          this.tableData = data;
                          this.updateDimensionsFromData(data);
                          this.scheduleAutoRun();
                        }}
                      />
                      <button
                        class="bg-danger/10 text-danger absolute top-0.5 -right-1 hidden h-4 w-4 items-center justify-center rounded-full group-hover:flex"
                        title="Remove column"
                        @click=${() => this.removeCol(ci)}
                      >
                        ${unsafeHTML(icon("x", 8))}
                      </button>
                    </th>
                  `,
                )}
              </tr>
            </thead>
            <tbody>
              ${this.tableData.map((row, ri) =>
                ri > 0
                  ? html`
                      <tr class="group/row hover:bg-surface-alt/60 transition-colors">
                        <td
                          class="border-border bg-surface text-text-tertiary group-hover/row:bg-surface-alt/60 sticky left-0 z-10 border-r border-b px-1 py-1 text-center text-xs"
                        >
                          <div class="flex items-center justify-center gap-0.5">
                            <span>${ri}</span>
                            <button
                              class="text-danger/60 hover:text-danger hidden h-3.5 w-3.5 items-center justify-center rounded group-hover/row:flex"
                              title="Remove row"
                              @click=${() => this.removeRow(ri)}
                            >
                              ${unsafeHTML(icon("x", 8))}
                            </button>
                          </div>
                        </td>
                        ${row.map(
                          (cell, ci) => html`
                            <td class="border-border border-r border-b px-1 py-0.5">
                              <input
                                type="text"
                                .value=${String(cell)}
                                class="text-text-primary focus:bg-brand/5 focus:ring-brand/30 w-full min-w-15 rounded bg-transparent px-1.5 py-1 text-xs transition-colors outline-none focus:ring-1"
                                @change=${(e: Event) => {
                                  const value = (e.target as HTMLInputElement).value;
                                  const data = this.tableData.map((r) => [...r]);
                                  const num = Number(value);
                                  data[ri][ci] = value !== "" && !isNaN(num) ? num : value;
                                  this.tableData = data;
                                  this.scheduleAutoRun();
                                }}
                              />
                            </td>
                          `,
                        )}
                      </tr>
                    `
                  : nothing,
              )}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private renderLeftPanel(): TemplateResult | typeof nothing {
    if (!this.leftExpand) return nothing;
    return html`
      <div class="border-border bg-surface flex w-[50vw] shrink-0 flex-col border-r">
        <div class="border-border bg-surface-alt/50 flex shrink-0 items-center border-b">
          ${(["visual", "code", "data"] as const).map(
            (tab) => html`
              <button
                class="${this.activeTab === tab
                  ? "text-brand font-medium"
                  : "text-text-secondary hover:text-text-primary"} relative h-10 flex-1 text-center text-xs transition-colors"
                @click=${() => {
                  if (tab !== "code" && this.codeEditor) {
                    this.codeEditor.dispose();
                    this.codeEditor = null;
                  }
                  this.activeTab = tab;
                }}
              >
                ${tab.charAt(0).toUpperCase() + tab.slice(1)}
                ${this.activeTab === tab
                  ? html`<span class="absolute inset-x-4 bottom-0 h-0.5 rounded-full"></span>`
                  : nothing}
              </button>
            `,
          )}
        </div>

        ${this.activeTab === "visual" ? this.renderVisualTab() : nothing}
        ${this.activeTab === "code"
          ? html`<div class="min-h-0 flex-1">
              <div id="monaco-host" class="h-full w-full" ${ref(this.monacoHost)}></div>
            </div>`
          : nothing}
        ${this.activeTab === "data" ? this.renderDataTab() : nothing}
      </div>
    `;
  }

  private renderPreviewPane(): TemplateResult {
    return html`
      <div class="bg-surface-alt/30 relative min-h-0 flex-1 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center py-8">
          <div
            class="border-border bg-surface shadow-card rounded-xl border transition-all duration-200"
            style="width: ${String(this.chartWidth)}px; height: ${String(this.chartHeight)}px;"
          >
            ${this.previewError
              ? html`<div class="flex h-full flex-col items-center justify-center gap-2 p-6">
                  ${unsafeHTML(
                    `<span class="text-danger/50 inline-flex">${icon("alertCircle", 28)}</span>`,
                  )}
                  <p class="text-danger max-w-md text-center text-xs leading-relaxed">
                    ${this.previewError}
                  </p>
                </div>`
              : html`<div id="preview-host" class="h-full w-full" ${ref(this.previewHost)}></div>`}
          </div>
        </div>
      </div>
    `;
  }

  private renderRightPanel(): TemplateResult {
    const slider = (
      label: string,
      value: number,
      min: number,
      max: number,
      onInput: (v: number) => void,
    ) => html`
      <div class="mb-4">
        <div class="mb-1.5 flex items-center justify-between">
          <label class="text-text-secondary text-xs">${label}</label>
          <span class="text-text-tertiary text-[10px] tabular-nums">${value}px</span>
        </div>
        <input
          type="range"
          min=${String(min)}
          max=${String(max)}
          .value=${String(value)}
          class="accent-brand w-full"
          @input=${(e: InputEvent) => onInput(Number((e.target as HTMLInputElement).value))}
        />
      </div>
    `;
    if (!this.rightExpand) {
      return html`
        <button
          class="border-border bg-surface text-text-tertiary hover:text-brand absolute top-1/2 right-0 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 shadow-sm transition-colors"
          title="Expand panel"
          @click=${() => (this.rightExpand = true)}
        >
          ${unsafeHTML(icon("chevronLeft", 10))}
        </button>
      `;
    }
    return html`
      <button
        class="border-border bg-surface text-text-tertiary hover:text-brand absolute top-1/2 right-50 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 shadow-sm transition-colors"
        title="Collapse panel"
        @click=${() => (this.rightExpand = false)}
      >
        ${unsafeHTML(icon("chevronRight", 10))}
      </button>
      <div class="border-border bg-surface w-50 shrink-0 overflow-y-auto border-l p-4">
        <h3 class="text-text-tertiary mb-3 text-xs font-semibold tracking-widest uppercase">
          Preview Settings
        </h3>
        ${slider("Width", this.chartWidth, 100, 1200, (v) => {
          this.chartWidth = v;
          setTimeout(() => this.chart?.resize(), 200);
        })}
        ${slider("Height", this.chartHeight, 100, 800, (v) => {
          this.chartHeight = v;
          setTimeout(() => this.chart?.resize(), 200);
        })}
      </div>
    `;
  }

  protected override render(): TemplateResult | typeof nothing {
    return html`
      <div class="bg-surface flex min-h-0 flex-1 flex-col">
        ${this.renderToolbar()}
        <div class="relative flex min-h-0 flex-1 overflow-hidden">
          ${this.renderLeftPanel()}
          <button
            class="border-border bg-surface text-text-tertiary hover:text-brand ${this.leftExpand
              ? "left-[50vw]"
              : "left-0"} absolute top-1/2 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 shadow-sm transition-colors"
            title="Toggle panel"
            @click=${() => {
              this.leftExpand = !this.leftExpand;
              if (this.leftExpand && this.codeEditor) {
                setTimeout(() => this.codeEditor?.layout(), 300);
              }
            }}
          >
            ${this.leftExpand
              ? unsafeHTML(icon("chevronLeft", 10))
              : unsafeHTML(icon("chevronRight", 10))}
          </button>
          ${this.renderPreviewPane()} ${this.renderRightPanel()}
        </div>
      </div>
    `;
  }

  protected override firstUpdated(): void {
    setTimeout(() => this.renderPreview(), 100);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wc-editor-page": WcEditorPage;
  }
}
