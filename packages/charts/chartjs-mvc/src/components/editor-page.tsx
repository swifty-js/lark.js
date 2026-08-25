import { useSignal, useRef, useEffect, useRouter } from "@lark.js/mvc";
import { raw } from "@lark.js/mvc/jsx-runtime";
import { icon, chartTypeIcons } from "@/lib/icons";
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

export default function EditorPage() {
  const router = useRouter();
  const params = router.searchParams.value;
  const projectId = params.get("projectId") || "";
  const chartIdParam = params.get("chartId") || "";

  const activeTab = useSignal<"visual" | "code" | "data">("visual");
  const chartName = useSignal("Untitled Chart");
  const saving = useSignal(false);
  const status = useSignal<"idle" | "saved" | "error">("idle");
  const tableData = useSignal<(string | number)[][]>(DEFAULT_DATA.map((r) => [...r]));
  const leftExpand = useSignal(true);
  const rightExpand = useSignal(false);
  const chartWidth = useSignal(600);
  const chartHeight = useSignal(400);
  const copied = useSignal(false);
  const chartType = useSignal("line");
  const datasource = useSignal<Record<string, string[]>>({ x: [], y0: [] });
  const themeColors = useSignal<string[]>(CHART_THEMES.slice(0, 8));
  const dimensions = useSignal<string[]>([]);
  const metrics = useSignal<string[]>([]);
  const previewError = useSignal("");

  const monacoHost = useRef<HTMLDivElement | null>(null);
  const previewHost = useRef<HTMLDivElement | null>(null);
  const codeEditor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const code = useRef("");
  const chart = useRef<Chart | null>(null);
  const autoRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartId = useRef(chartIdParam);

  const chartTypes = getAllChartTypes();

  const updateDimensionsFromData = (data: (string | number)[][]) => {
    const headers = (data[0] || []) as string[];
    dimensions.value = headers.slice(0, 1);
    metrics.value = headers.slice(1);
  };

  const renderPreview = () => {
    const container = previewHost.current;
    if (!container) return;
    const { options, error } = evalChartCode(code.current!, tableData.value);

    chart.current?.destroy();
    chart.current = null;

    if (error || !options) {
      previewError.value = error;
      container.innerHTML = "";
      return;
    }
    previewError.value = "";
    container.innerHTML = "";
    try {
      const canvas = document.createElement("canvas");
      container.appendChild(canvas);
      chart.current = new Chart(canvas, options);
      gsap.fromTo(
        container,
        { opacity: 0, scale: 0.97 },
        { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" },
      );
    } catch (e) {
      previewError.value = e instanceof Error ? e.message : String(e);
    }
  };

  const scheduleAutoRun = () => {
    if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
    autoRunTimer.current = setTimeout(() => renderPreview(), 800);
  };

  const ensureMonaco = () => {
    if (codeEditor.current || !monacoHost.current) return;
    const ed = monaco.editor.create(monacoHost.current, {
      value: code.current!,
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
      code.current = ed.getValue();
      scheduleAutoRun();
    });
    codeEditor.current = ed;
  };

  const applyVisualConfig = () => {
    const ds: Record<string, string[]> = { ...datasource.value };
    if (themeColors.value.length > 0) ds.theme = themeColors.value;
    code.current = generateCode(chartType.value, ds);
    if (codeEditor.current) codeEditor.current.setValue(code.current);
    scheduleAutoRun();
  };

  useEffect(() => {
    const headers = DEFAULT_DATA[0] as string[];
    const dims = headers.slice(0, 1);
    const mets = headers.slice(1);
    dimensions.value = dims;
    metrics.value = mets;
    datasource.value = {
      x: dims,
      y0: mets.length > 0 ? [mets[0]] : [],
      y1: [],
    };

    const defaultW = Math.min(600, window.innerWidth - 500 - 220 - 80);
    chartWidth.value = Math.max(200, defaultW);

    code.current = generateCode("line", {
      x: dims,
      y0: mets.length > 0 ? [mets[0]] : [],
      y1: [],
    });

    if (chartId.current && projectId) {
      getProjectDetailApi(Number(projectId)).then((res) => {
        if (!res.ok || !res.data) return;
        const c = res.data.charts.find((item: ChartItem) => String(item.id) === chartId.current);
        if (c) {
          chartName.value = c.name || "Untitled Chart";
          if (c.chartOptions) {
            code.current = c.chartOptions;
            if (codeEditor.current) codeEditor.current.setValue(c.chartOptions);
          }
          if (c.chartData && Array.isArray(c.chartData)) {
            const d = c.chartData as (string | number)[][];
            tableData.value = d;
            updateDimensionsFromData(d);
          }
          renderPreview();
        }
      });
    }

    setTimeout(() => renderPreview(), 100);

    return () => {
      if (autoRunTimer.current) clearTimeout(autoRunTimer.current);
      chart.current?.destroy();
      chart.current = null;
      codeEditor.current?.dispose();
      codeEditor.current = null;
    };
  });

  useEffect(() => {
    if (activeTab.value === "code" && !codeEditor.current) {
      queueMicrotask(() => ensureMonaco());
    }
  });

  const saveChart = () => {
    if (!projectId || saving.value) return;
    saving.value = true;
    status.value = "idle";
    saveChartApi({
      projectId: Number(projectId),
      chartId: chartId.current ? Number(chartId.current) : undefined,
      chartOptions: code.current!,
      chartData: JSON.stringify(tableData.value),
      name: chartName.value,
      mode: "develop",
    })
      .then((res) => {
        saving.value = false;
        if (res.ok && res.data) {
          status.value = "saved";
          if (!chartId.current && res.data.chartId) {
            chartId.current = String(res.data.chartId);
          }
        } else {
          status.value = "error";
        }
      })
      .catch(() => {
        saving.value = false;
        status.value = "error";
      });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code.current!).then(() => {
      copied.value = true;
      setTimeout(() => (copied.value = false), 2000);
    });
  };

  const addRow = () => {
    const cols = tableData.value[0] ? tableData.value[0].length : 1;
    tableData.value = [...tableData.value, new Array(cols).fill("")];
  };

  const addCol = () => {
    const name = "col" + ((tableData.value[0]?.length || 0) + 1);
    const updated = tableData.value.map((row, i) => [...row, i === 0 ? name : ""]);
    tableData.value = updated;
    updateDimensionsFromData(updated);
  };

  const removeRow = (rowIndex: number) => {
    if (tableData.value.length <= 2) return;
    tableData.value = tableData.value.filter((_, i) => i !== rowIndex);
  };

  const removeCol = (colIndex: number) => {
    if (!tableData.value[0] || tableData.value[0].length <= 1) return;
    const updated = tableData.value.map((row) => row.filter((_, i) => i !== colIndex));
    tableData.value = updated;
    updateDimensionsFromData(updated);
  };

  const fieldChips = (
    title: string,
    selected: string[] | undefined,
    candidates: string[],
    accent: "brand" | "success",
    onAdd: (field: string) => void,
    onRemove: (field: string) => void,
  ) => {
    const selCls = accent === "brand" ? "bg-brand/10 text-brand" : "bg-success/10 text-success";
    return (
      <div class="mb-5">
        <h4 class="text-text-tertiary mb-2.5 text-xs font-semibold tracking-widest uppercase">
          {title}
        </h4>
        <div class="mb-2 flex flex-wrap gap-1.5">
          {selected && selected.length > 0 ? (
            selected.map((f) => (
              <span class={`${selCls} inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs`}>
                {f}
                <button class="opacity-60 hover:opacity-100" onClick={() => onRemove(f)}>
                  {raw(icon("x", 8))}
                </button>
              </span>
            ))
          ) : (
            <span class="text-text-tertiary text-xs italic">No selection</span>
          )}
        </div>
        <div class="flex flex-wrap gap-1">
          {candidates.map((c) => (
            <button
              class="border-border text-text-secondary hover:border-brand/50 hover:text-brand rounded border px-1.5 py-0.5 text-[10px] transition-colors"
              onClick={() => onAdd(c)}
            >
              + {c}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div class="bg-surface flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <header class="bg-surface/75 border-border flex h-12 shrink-0 items-center justify-between border-b px-4 backdrop-blur-xl backdrop-saturate-150">
        <div class="flex items-center gap-3">
          <button
            class="text-text-secondary hover:bg-surface-alt hover:text-text-primary flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors"
            onClick={() =>
              router.navigate(projectId ? `/projects?projectId=${projectId}` : "/projects")
            }
          >
            {raw(icon("chevronLeft", 14))} Back
          </button>
          <div class="bg-border h-4 w-px"></div>
          <input
            type="text"
            value={chartName.value}
            class="text-text-primary hover:border-border focus:border-brand focus:ring-brand/20 rounded-md border border-transparent bg-transparent px-2 py-0.5 text-sm font-medium transition-colors outline-none focus:ring-2"
            onInput={(e: Event) => (chartName.value = (e.target as HTMLInputElement).value)}
          />
          {status.value === "saved" && (
            <span class="bg-success-light text-success flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              {raw(icon("check", 10))} Saved
            </span>
          )}
          {status.value === "error" && (
            <span class="bg-danger-light text-danger flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              {raw(icon("x", 10))} Failed
            </span>
          )}
        </div>

        <div class="flex items-center gap-2">
          <button
            class="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors"
            title="Copy code"
            onClick={copyCode}
          >
            {copied.value ? (
              <>{raw(icon("check", 12))} Copied</>
            ) : (
              <>{raw(icon("copy", 12))} Copy</>
            )}
          </button>
          <button
            class="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors"
            onClick={renderPreview}
          >
            {raw(icon("play", 10))} Run
          </button>
          <button
            class="hover:shadow-glow rounded-md px-3 py-1 text-xs font-medium text-white shadow-sm transition-all disabled:opacity-50"
            disabled={saving.value}
            onClick={saveChart}
          >
            {saving.value ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      {/* Main area */}
      <div class="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel */}
        {leftExpand.value && (
          <div class="border-border bg-surface flex w-[50vw] shrink-0 flex-col border-r">
            <div class="border-border bg-surface-alt/50 flex shrink-0 items-center border-b">
              {(["visual", "code", "data"] as const).map((tab) => (
                <button
                  class={`${
                    activeTab.value === tab
                      ? "text-brand font-medium"
                      : "text-text-secondary hover:text-text-primary"
                  } relative h-10 flex-1 text-center text-xs transition-colors`}
                  onClick={() => {
                    if (tab !== "code" && codeEditor.current) {
                      codeEditor.current.dispose();
                      codeEditor.current = null;
                    }
                    activeTab.value = tab;
                  }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {activeTab.value === tab && (
                    <span class="absolute inset-x-4 bottom-0 h-0.5 rounded-full"></span>
                  )}
                </button>
              ))}
            </div>

            {activeTab.value === "visual" && (
              <div class="min-h-0 flex-1 overflow-y-auto p-4">
                <div class="mb-5">
                  <h4 class="text-text-tertiary mb-2.5 text-xs font-semibold tracking-widest uppercase">
                    Chart Type
                  </h4>
                  <div class="grid grid-cols-4 gap-2">
                    {chartTypes.map((ct) => (
                      <button
                        class={`${
                          chartType.value === ct.type
                            ? "border-brand bg-brand/5 text-brand shadow-sm"
                            : "border-border text-text-secondary hover:border-brand/30 hover:text-text-primary"
                        } flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-all duration-200`}
                        onClick={() => {
                          if (ct.type === chartType.value) return;
                          chartType.value = ct.type;
                          const config = getChartTypeConfig(ct.type);
                          const headers = (tableData.value[0] || []) as string[];
                          const dims = headers.slice(0, 1);
                          const mets = headers.slice(1);
                          const ds: Record<string, string[]> = { x: [], y0: [] };
                          if (config) {
                            if ("x" in config.datasource)
                              ds.x = dims.slice(0, config.editorConfig.x?.limit || 1);
                            ds.y0 = mets.slice(0, config.editorConfig.y0?.limit || 1);
                            if ("y1" in config.datasource) ds.y1 = [];
                          }
                          datasource.value = ds;
                          applyVisualConfig();
                        }}
                      >
                        {raw(chartTypeIcons[ct.icon] || "")}
                        <span class="text-[10px] leading-tight">{ct.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {fieldChips(
                  "Dimensions (X Axis)",
                  datasource.value.x,
                  dimensions.value,
                  "brand",
                  (d) => {
                    const ds = { ...datasource.value };
                    const config = getChartTypeConfig(chartType.value);
                    const limit = config?.editorConfig.x?.limit || 1;
                    if (!ds.x) ds.x = [];
                    if (ds.x.includes(d)) return;
                    if (ds.x.length >= limit) ds.x = ds.x.slice(0, limit - 1);
                    ds.x = [...ds.x, d];
                    datasource.value = ds;
                    applyVisualConfig();
                  },
                  (d) => {
                    const ds = { ...datasource.value };
                    ds.x = (ds.x || []).filter((f) => f !== d);
                    datasource.value = ds;
                    applyVisualConfig();
                  },
                )}
                {fieldChips(
                  "Metrics (Y Axis)",
                  datasource.value.y0,
                  metrics.value,
                  "success",
                  (m) => {
                    const ds = { ...datasource.value };
                    if (!ds.y0) ds.y0 = [];
                    if (ds.y0.includes(m)) return;
                    ds.y0 = [...ds.y0, m];
                    datasource.value = ds;
                    applyVisualConfig();
                  },
                  (m) => {
                    const ds = { ...datasource.value };
                    ds.y0 = (ds.y0 || []).filter((f) => f !== m);
                    datasource.value = ds;
                    applyVisualConfig();
                  },
                )}
                {datasource.value.y1 !== undefined &&
                  fieldChips(
                    "Secondary Axis",
                    datasource.value.y1,
                    metrics.value,
                    "brand",
                    (m) => {
                      const ds = { ...datasource.value };
                      if (!ds.y1) ds.y1 = [];
                      if (ds.y1.includes(m)) return;
                      ds.y1 = [...ds.y1, m];
                      datasource.value = ds;
                      applyVisualConfig();
                    },
                    (m) => {
                      const ds = { ...datasource.value };
                      ds.y1 = (ds.y1 || []).filter((f) => f !== m);
                      datasource.value = ds;
                      applyVisualConfig();
                    },
                  )}

                <div>
                  <h4 class="text-text-tertiary mb-2.5 text-xs font-semibold tracking-widest uppercase">
                    Theme Colors
                  </h4>
                  <div class="flex flex-wrap items-center gap-1.5">
                    {themeColors.value.map((color, ci) => (
                      <span
                        class="group border-border/50 relative inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-transform hover:scale-110"
                        style={`background-color: ${color}`}
                      >
                        <button
                          class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => {
                            const colors = [...themeColors.value];
                            colors.splice(ci, 1);
                            themeColors.value = colors;
                            applyVisualConfig();
                          }}
                        >
                          {raw(icon("x", 8))}
                        </button>
                      </span>
                    ))}
                    <button
                      class="border-border text-text-tertiary hover:border-brand hover:text-brand flex h-6 w-6 items-center justify-center rounded-full border border-dashed transition-colors"
                      onClick={() => {
                        const colors = [...themeColors.value];
                        const available = CHART_THEMES.find((c) => !colors.includes(c));
                        if (available) {
                          colors.push(available);
                          themeColors.value = colors;
                          applyVisualConfig();
                        }
                      }}
                    >
                      {raw(icon("plus", 10))}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab.value === "code" && (
              <div class="min-h-0 flex-1">
                <div id="monaco-host" class="h-full w-full" ref={monacoHost}></div>
              </div>
            )}

            {activeTab.value === "data" && (
              <div class="flex min-h-0 flex-1 flex-col">
                <div class="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
                  <button
                    class="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
                    onClick={addRow}
                  >
                    {raw(icon("plus", 10))} Row
                  </button>
                  <button
                    class="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
                    onClick={addCol}
                  >
                    {raw(icon("plus", 10))} Col
                  </button>
                  <span class="text-text-tertiary ml-auto text-xs tabular-nums">
                    {tableData.value.length} rows × {(tableData.value[0] || []).length} cols
                  </span>
                </div>
                <div class="min-h-0 flex-1 overflow-auto">
                  <table class="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th class="border-border bg-surface-alt text-text-tertiary sticky left-0 z-10 w-8 border-r border-b px-1 py-2 text-center text-xs">
                          #
                        </th>
                        {(tableData.value[0] || []).map((col, ci) => (
                          <th class="group border-border bg-surface-alt relative border-r border-b px-2 py-1.5">
                            <input
                              type="text"
                              value={String(col)}
                              class="text-text-primary focus:text-brand w-full min-w-15 bg-transparent text-center text-xs font-medium transition-colors outline-none"
                              onChange={(e: Event) => {
                                const value = (e.target as HTMLInputElement).value;
                                const data = tableData.value.map((r) => [...r]);
                                data[0][ci] = value;
                                tableData.value = data;
                                updateDimensionsFromData(data);
                                scheduleAutoRun();
                              }}
                            />
                            <button
                              class="bg-danger/10 text-danger absolute top-0.5 -right-1 hidden h-4 w-4 items-center justify-center rounded-full group-hover:flex"
                              title="Remove column"
                              onClick={() => removeCol(ci)}
                            >
                              {raw(icon("x", 8))}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.value.map((row, ri) =>
                        ri > 0 ? (
                          <tr class="group/row hover:bg-surface-alt/60 transition-colors">
                            <td class="border-border bg-surface text-text-tertiary group-hover/row:bg-surface-alt/60 sticky left-0 z-10 border-r border-b px-1 py-1 text-center text-xs">
                              <div class="flex items-center justify-center gap-0.5">
                                <span>{ri}</span>
                                <button
                                  class="text-danger/60 hover:text-danger hidden h-3.5 w-3.5 items-center justify-center rounded group-hover/row:flex"
                                  title="Remove row"
                                  onClick={() => removeRow(ri)}
                                >
                                  {raw(icon("x", 8))}
                                </button>
                              </div>
                            </td>
                            {row.map((cell, ci) => (
                              <td class="border-border border-r border-b px-1 py-0.5">
                                <input
                                  type="text"
                                  value={String(cell)}
                                  class="text-text-primary focus:bg-brand/5 focus:ring-brand/30 w-full min-w-15 rounded bg-transparent px-1.5 py-1 text-xs transition-colors outline-none focus:ring-1"
                                  onChange={(e: Event) => {
                                    const value = (e.target as HTMLInputElement).value;
                                    const data = tableData.value.map((r) => [...r]);
                                    const num = Number(value);
                                    data[ri][ci] = value !== "" && !isNaN(num) ? num : value;
                                    tableData.value = data;
                                    scheduleAutoRun();
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ) : null,
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Left panel toggle */}
        <button
          class={`border-border bg-surface text-text-tertiary hover:text-brand ${
            leftExpand.value ? "left-[50vw]" : "left-0"
          } absolute top-1/2 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 shadow-sm transition-colors`}
          title="Toggle panel"
          onClick={() => {
            leftExpand.value = !leftExpand.value;
            if (leftExpand.value && codeEditor.current) {
              setTimeout(() => codeEditor.current?.layout(), 300);
            }
          }}
        >
          {raw(leftExpand.value ? icon("chevronLeft", 10) : icon("chevronRight", 10))}
        </button>

        {/* Preview pane */}
        <div class="bg-surface-alt/30 relative min-h-0 flex-1 overflow-y-auto">
          <div class="flex min-h-full items-center justify-center py-8">
            <div
              class="border-border bg-surface shadow-card rounded-xl border transition-all duration-200"
              style={`width: ${chartWidth.value}px; height: ${chartHeight.value}px;`}
            >
              {previewError.value ? (
                <div class="flex h-full flex-col items-center justify-center gap-2 p-6">
                  {raw(
                    `<span class="text-danger/50 inline-flex">${icon("alertCircle", 28)}</span>`,
                  )}
                  <p class="text-danger max-w-md text-center text-xs leading-relaxed">
                    {previewError.value}
                  </p>
                </div>
              ) : (
                <div id="preview-host" class="h-full w-full" ref={previewHost}></div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel */}
        {!rightExpand.value ? (
          <button
            class="border-border bg-surface text-text-tertiary hover:text-brand absolute top-1/2 right-0 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 shadow-sm transition-colors"
            title="Expand panel"
            onClick={() => (rightExpand.value = true)}
          >
            {raw(icon("chevronLeft", 10))}
          </button>
        ) : (
          <>
            <button
              class="border-border bg-surface text-text-tertiary hover:text-brand absolute top-1/2 right-50 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 shadow-sm transition-colors"
              title="Collapse panel"
              onClick={() => (rightExpand.value = false)}
            >
              {raw(icon("chevronRight", 10))}
            </button>
            <div class="border-border bg-surface w-50 shrink-0 overflow-y-auto border-l p-4">
              <h3 class="text-text-tertiary mb-3 text-xs font-semibold tracking-widest uppercase">
                Preview Settings
              </h3>
              <div class="mb-4">
                <div class="mb-1.5 flex items-center justify-between">
                  <label class="text-text-secondary text-xs">Width</label>
                  <span class="text-text-tertiary text-[10px] tabular-nums">
                    {chartWidth.value}px
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={1200}
                  value={String(chartWidth.value)}
                  class="accent-brand w-full"
                  onInput={(e: Event) => {
                    chartWidth.value = Number((e.target as HTMLInputElement).value);
                    setTimeout(() => chart.current?.resize(), 200);
                  }}
                />
              </div>
              <div class="mb-4">
                <div class="mb-1.5 flex items-center justify-between">
                  <label class="text-text-secondary text-xs">Height</label>
                  <span class="text-text-tertiary text-[10px] tabular-nums">
                    {chartHeight.value}px
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={800}
                  value={String(chartHeight.value)}
                  class="accent-brand w-full"
                  onInput={(e: Event) => {
                    chartHeight.value = Number((e.target as HTMLInputElement).value);
                    setTimeout(() => chart.current?.resize(), 200);
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
