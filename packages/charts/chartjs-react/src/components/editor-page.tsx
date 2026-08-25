import { useEffect, useMemo, useRef, useState } from "@lark.js/react";
import { Icon } from "@/components/Icon";
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
import { chartTypeIcons } from "@/lib/icons";

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
 * grid), right side live chart.js preview. Navigation back to projects is
 * a `navigate` call.
 */
export default function EditorPage({ navigate }: { navigate: (to: string) => void }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const projectId = params.get("projectId") || "";
  const chartIdParam = params.get("chartId") || "";

  const [activeTab, setActiveTab] = useState<"visual" | "code" | "data">("visual");
  const [chartName, setChartName] = useState("Untitled Chart");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [tableData, setTableData] = useState<(string | number)[][]>(() =>
    DEFAULT_DATA.map((r) => [...r]),
  );
  const [leftExpand, setLeftExpand] = useState(true);
  const [rightExpand, setRightExpand] = useState(false);
  const [chartWidth, setChartWidth] = useState(() =>
    Math.max(200, Math.min(600, window.innerWidth - 500 - 220 - 80)),
  );
  const [chartHeight, setChartHeight] = useState(400);
  const [copied, setCopied] = useState(false);
  const [chartType, setChartType] = useState("line");
  const [themeColors, setThemeColors] = useState<string[]>(() => CHART_THEMES.slice(0, 8));
  const [previewError, setPreviewError] = useState("");
  const [runToken, setRunToken] = useState(1);

  const headers = (tableData[0] || []) as string[];
  const dimensions = headers.slice(0, 1);
  const metrics = headers.slice(1);

  // datasource derives from chart type + current headers.
  const [datasource, setDatasource] = useState<Record<string, string[]>>(() => ({
    x: dimensions,
    y0: metrics.length > 0 ? [metrics[0]] : [],
    y1: [],
  }));

  const [code, setCode] = useState(() =>
    generateCode("line", {
      x: dimensions,
      y0: metrics.length > 0 ? [metrics[0]] : [],
      y1: [],
    }),
  );
  const [chartId, setChartId] = useState(chartIdParam);

  const monacoHostRef = useRef<HTMLDivElement | null>(null);
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chartTypes = getAllChartTypes();

  const scheduleAutoRun = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setRunToken((t) => t + 1), 800);
  };

  // Debounce timer teardown on unmount.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // Load an existing chart once on mount.
  useEffect(() => {
    let destroyed = false;
    if (chartIdParam && projectId) {
      getProjectDetailApi(Number(projectId)).then((res) => {
        if (destroyed || !res.ok || !res.data) return;
        const chart = res.data.charts.find((c: ChartItem) => String(c.id) === chartIdParam);
        if (chart) {
          setChartName(chart.name || "Untitled Chart");
          if (chart.chartOptions) setCode(chart.chartOptions);
          if (chart.chartData && Array.isArray(chart.chartData)) {
            setTableData(chart.chartData as (string | number)[][]);
          }
          scheduleAutoRun();
        }
      });
    }
    return () => {
      destroyed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the chart.js preview whenever a run is triggered.
  useEffect(() => {
    const container = previewHostRef.current;
    if (!container) return;
    const { options, error } = evalChartCode(code, tableData);

    chartRef.current?.destroy();
    chartRef.current = null;

    if (error || !options) {
      setPreviewError(error);
      container.innerHTML = "";
      return;
    }
    setPreviewError("");
    container.innerHTML = "";
    try {
      const canvas = document.createElement("canvas");
      container.appendChild(canvas);
      chartRef.current = new Chart(canvas, options);
      gsap.fromTo(
        container,
        { opacity: 0, scale: 0.97 },
        { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" },
      );
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  // Resize the live chart when the preview dimensions change.
  useEffect(() => {
    const t = setTimeout(() => chartRef.current?.resize(), 200);
    return () => clearTimeout(t);
  }, [chartWidth, chartHeight]);

  // Create/tear down Monaco with the code tab.
  useEffect(() => {
    if (activeTab !== "code") return;
    const host = monacoHostRef.current;
    if (!host || editorRef.current) return;
    const ed = monaco.editor.create(host, {
      value: code,
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
      setCode(ed.getValue());
      scheduleAutoRun();
    });
    editorRef.current = ed;
    return () => {
      ed.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Keep Monaco in sync when `code` changes elsewhere (visual tab, load).
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && ed.getValue() !== code) ed.setValue(code);
  }, [code]);

  const applyVisualConfig = (type: string, ds: Record<string, string[]>, colors: string[]) => {
    const next: Record<string, string[]> = { ...ds };
    if (colors.length > 0) next.theme = colors;
    setCode(generateCode(type, next));
    scheduleAutoRun();
  };

  const saveChart = () => {
    if (!projectId || saving) return;
    setSaving(true);
    setStatus("idle");
    saveChartApi({
      projectId: Number(projectId),
      chartId: chartId ? Number(chartId) : undefined,
      chartOptions: code,
      chartData: JSON.stringify(tableData),
      name: chartName,
      mode: "develop",
    })
      .then((res) => {
        setSaving(false);
        if (res.ok && res.data) {
          setStatus("saved");
          if (!chartId && res.data.chartId) setChartId(String(res.data.chartId));
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        setSaving(false);
        setStatus("error");
      });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const addRow = () => {
    const cols = tableData[0] ? tableData[0].length : 1;
    setTableData([...tableData, new Array(cols).fill("")]);
    scheduleAutoRun();
  };

  const addCol = () => {
    const name = "col" + ((tableData[0]?.length || 0) + 1);
    setTableData(tableData.map((row, i) => [...row, i === 0 ? name : ""]));
    scheduleAutoRun();
  };

  const removeRow = (rowIndex: number) => {
    if (tableData.length <= 2) return;
    setTableData(tableData.filter((_, i) => i !== rowIndex));
    scheduleAutoRun();
  };

  const removeCol = (colIndex: number) => {
    if (!tableData[0] || tableData[0].length <= 1) return;
    setTableData(tableData.map((row) => row.filter((_, i) => i !== colIndex)));
    scheduleAutoRun();
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
      <div className="mb-5">
        <h4 className="text-text-tertiary mb-2.5 text-xs font-semibold tracking-widest uppercase">
          {title}
        </h4>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected && selected.length > 0 ? (
            selected.map((f) => (
              <span
                key={f}
                className={`${selCls} inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs`}
              >
                {f}
                <button className="opacity-60 hover:opacity-100" onClick={() => onRemove(f)}>
                  <Icon name="x" size={8} />
                </button>
              </span>
            ))
          ) : (
            <span className="text-text-tertiary text-xs italic">No selection</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {candidates.map((c) => (
            <button
              key={c}
              className="border-border text-text-secondary hover:border-brand/50 hover:text-brand rounded border px-1.5 py-0.5 text-[10px] transition-colors"
              onClick={() => onAdd(c)}
            >
              + {c}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderVisualTab = () => (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-5">
        <h4 className="text-text-tertiary mb-2.5 text-xs font-semibold tracking-widest uppercase">
          Chart Type
        </h4>
        <div className="grid grid-cols-4 gap-2">
          {chartTypes.map((ct) => (
            <button
              key={ct.type}
              className={`${
                chartType === ct.type
                  ? "border-brand bg-brand/5 text-brand shadow-sm"
                  : "border-border text-text-secondary hover:border-brand/30 hover:text-text-primary"
              } flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-all duration-200`}
              onClick={() => {
                if (ct.type === chartType) return;
                setChartType(ct.type);
                const config = getChartTypeConfig(ct.type);
                const dims = dimensions;
                const mets = metrics;
                const ds: Record<string, string[]> = { x: [], y0: [] };
                if (config) {
                  if ("x" in config.datasource) {
                    ds.x = dims.slice(0, config.editorConfig.x?.limit || 1);
                  }
                  ds.y0 = mets.slice(0, config.editorConfig.y0?.limit || 1);
                  if ("y1" in config.datasource) ds.y1 = [];
                }
                setDatasource(ds);
                applyVisualConfig(ct.type, ds, themeColors);
              }}
            >
              <span
                className="inline-flex"
                dangerouslySetInnerHTML={{
                  __html: chartTypeIcons[ct.icon] || "",
                }}
              />
              <span className="text-[10px] leading-tight">{ct.name}</span>
            </button>
          ))}
        </div>
      </div>

      {fieldChips(
        "Dimensions (X Axis)",
        datasource.x,
        dimensions,
        "brand",
        (d) => {
          const ds = { ...datasource };
          const config = getChartTypeConfig(chartType);
          const limit = config?.editorConfig.x?.limit || 1;
          if (!ds.x) ds.x = [];
          if (ds.x.includes(d)) return;
          if (ds.x.length >= limit) ds.x = ds.x.slice(0, limit - 1);
          ds.x = [...ds.x, d];
          setDatasource(ds);
          applyVisualConfig(chartType, ds, themeColors);
        },
        (d) => {
          const ds = { ...datasource };
          ds.x = (ds.x || []).filter((f) => f !== d);
          setDatasource(ds);
          applyVisualConfig(chartType, ds, themeColors);
        },
      )}
      {fieldChips(
        "Metrics (Y Axis)",
        datasource.y0,
        metrics,
        "success",
        (m) => {
          const ds = { ...datasource };
          if (!ds.y0) ds.y0 = [];
          if (ds.y0.includes(m)) return;
          ds.y0 = [...ds.y0, m];
          setDatasource(ds);
          applyVisualConfig(chartType, ds, themeColors);
        },
        (m) => {
          const ds = { ...datasource };
          ds.y0 = (ds.y0 || []).filter((f) => f !== m);
          setDatasource(ds);
          applyVisualConfig(chartType, ds, themeColors);
        },
      )}
      {datasource.y1 !== undefined &&
        fieldChips(
          "Secondary Axis",
          datasource.y1,
          metrics,
          "brand",
          (m) => {
            const ds = { ...datasource };
            if (!ds.y1) ds.y1 = [];
            if (ds.y1.includes(m)) return;
            ds.y1 = [...ds.y1, m];
            setDatasource(ds);
            applyVisualConfig(chartType, ds, themeColors);
          },
          (m) => {
            const ds = { ...datasource };
            ds.y1 = (ds.y1 || []).filter((f) => f !== m);
            setDatasource(ds);
            applyVisualConfig(chartType, ds, themeColors);
          },
        )}

      <div>
        <h4 className="text-text-tertiary mb-2.5 text-xs font-semibold tracking-widest uppercase">
          Theme Colors
        </h4>
        <div className="flex flex-wrap items-center gap-1.5">
          {themeColors.map((color, ci) => (
            <span
              key={`${color}-${ci}`}
              className="group border-border/50 relative inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-transform hover:scale-110"
              style={{ backgroundColor: color }}
            >
              <button
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => {
                  const colors = [...themeColors];
                  colors.splice(ci, 1);
                  setThemeColors(colors);
                  applyVisualConfig(chartType, datasource, colors);
                }}
              >
                <Icon name="x" size={8} />
              </button>
            </span>
          ))}
          <button
            className="border-border text-text-tertiary hover:border-brand hover:text-brand flex h-6 w-6 items-center justify-center rounded-full border border-dashed transition-colors"
            onClick={() => {
              const colors = [...themeColors];
              const available = CHART_THEMES.find((c) => !colors.includes(c));
              if (available) {
                colors.push(available);
                setThemeColors(colors);
                applyVisualConfig(chartType, datasource, colors);
              }
            }}
          >
            <Icon name="plus" size={10} />
          </button>
        </div>
      </div>
    </div>
  );

  const renderDataTab = () => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <button
          className="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
          onClick={addRow}
        >
          <Icon name="plus" size={10} /> Row
        </button>
        <button
          className="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
          onClick={addCol}
        >
          <Icon name="plus" size={10} /> Col
        </button>
        <span className="text-text-tertiary ml-auto text-xs tabular-nums">
          {tableData.length} rows × {headers.length} cols
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-border bg-surface-alt text-text-tertiary sticky left-0 z-10 w-8 border-r border-b px-1 py-2 text-center text-xs">
                #
              </th>
              {headers.map((col, ci) => (
                <th
                  key={ci}
                  className="group border-border bg-surface-alt relative border-r border-b px-2 py-1.5"
                >
                  <input
                    type="text"
                    value={String(col)}
                    className="text-text-primary focus:text-brand w-full min-w-15 bg-transparent text-center text-xs font-medium transition-colors outline-none"
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      const data = tableData.map((r) => [...r]);
                      data[0][ci] = value;
                      setTableData(data);
                      scheduleAutoRun();
                    }}
                  />
                  <button
                    className="bg-danger/10 text-danger absolute top-0.5 -right-1 hidden h-4 w-4 items-center justify-center rounded-full group-hover:flex"
                    title="Remove column"
                    onClick={() => removeCol(ci)}
                  >
                    <Icon name="x" size={8} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, ri) =>
              ri > 0 ? (
                <tr key={ri} className="group/row hover:bg-surface-alt/60 transition-colors">
                  <td className="border-border bg-surface text-text-tertiary group-hover/row:bg-surface-alt/60 sticky left-0 z-10 border-r border-b px-1 py-1 text-center text-xs">
                    <div className="flex items-center justify-center gap-0.5">
                      <span>{ri}</span>
                      <button
                        className="text-danger/60 hover:text-danger hidden h-3.5 w-3.5 items-center justify-center rounded group-hover/row:flex"
                        title="Remove row"
                        onClick={() => removeRow(ri)}
                      >
                        <Icon name="x" size={8} />
                      </button>
                    </div>
                  </td>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border-border border-r border-b px-1 py-0.5">
                      <input
                        type="text"
                        value={String(cell)}
                        className="text-text-primary focus:bg-brand/5 focus:ring-brand/30 w-full min-w-15 rounded bg-transparent px-1.5 py-1 text-xs transition-colors outline-none focus:ring-1"
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          const data = tableData.map((r) => [...r]);
                          const num = Number(value);
                          data[ri][ci] = value !== "" && !isNaN(num) ? num : value;
                          setTableData(data);
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
  );

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    onInput: (v: number) => void,
  ) => (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-text-secondary text-xs">{label}</label>
        <span className="text-text-tertiary text-[10px] tabular-nums">{value}px</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={String(value)}
        className="accent-brand w-full"
        onInput={(e) => onInput(Number(e.currentTarget.value))}
      />
    </div>
  );

  return (
    <div className="bg-surface flex min-h-0 flex-1 flex-col">
      {/* toolbar */}
      <header className="bg-surface/75 border-border flex h-12 shrink-0 items-center justify-between border-b px-4 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex items-center gap-3">
          <button
            className="text-text-secondary hover:bg-surface-alt hover:text-text-primary flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors"
            onClick={() => navigate(projectId ? `/projects?projectId=${projectId}` : "/projects")}
          >
            <Icon name="chevronLeft" size={14} /> Back
          </button>
          <div className="bg-border h-4 w-px"></div>
          <input
            type="text"
            value={chartName}
            className="text-text-primary hover:border-border focus:border-brand focus:ring-brand/20 rounded-md border border-transparent bg-transparent px-2 py-0.5 text-sm font-medium transition-colors outline-none focus:ring-2"
            onInput={(e) => setChartName(e.currentTarget.value)}
          />
          {status === "saved" && (
            <span className="bg-success-light text-success flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              <Icon name="check" size={10} /> Saved
            </span>
          )}
          {status === "error" && (
            <span className="bg-danger-light text-danger flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              <Icon name="x" size={10} /> Failed
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors"
            title="Copy code"
            onClick={copyCode}
          >
            {copied ? (
              <>
                <Icon name="check" size={12} /> Copied
              </>
            ) : (
              <>
                <Icon name="copy" size={12} /> Copy
              </>
            )}
          </button>
          <button
            className="border-border text-text-secondary hover:border-brand/50 hover:text-brand flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors"
            onClick={() => setRunToken((t) => t + 1)}
          >
            <Icon name="play" size={10} /> Run
          </button>
          <button
            className="hover:shadow-glow rounded-md px-3 py-1 text-xs font-medium text-white shadow-sm transition-all disabled:opacity-50"
            disabled={saving}
            onClick={saveChart}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* left panel */}
        {leftExpand && (
          <div className="border-border bg-surface flex w-[50vw] shrink-0 flex-col border-r">
            <div className="border-border bg-surface-alt/50 flex shrink-0 items-center border-b">
              {(["visual", "code", "data"] as const).map((tab) => (
                <button
                  key={tab}
                  className={`${
                    activeTab === tab
                      ? "text-brand font-medium"
                      : "text-text-secondary hover:text-text-primary"
                  } relative h-10 flex-1 text-center text-xs transition-colors`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {activeTab === tab && (
                    <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full"></span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "visual" && renderVisualTab()}
            {activeTab === "code" && (
              <div className="min-h-0 flex-1">
                <div ref={monacoHostRef} className="h-full w-full"></div>
              </div>
            )}
            {activeTab === "data" && renderDataTab()}
          </div>
        )}

        <button
          className={`border-border bg-surface text-text-tertiary hover:text-brand ${leftExpand ? "left-[50vw]" : "left-0"} absolute top-1/2 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 shadow-sm transition-colors`}
          title="Toggle panel"
          onClick={() => setLeftExpand((v) => !v)}
        >
          <Icon name={leftExpand ? "chevronLeft" : "chevronRight"} size={10} />
        </button>

        {/* preview pane */}
        <div className="bg-surface-alt/30 relative min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center py-8">
            <div
              className="border-border bg-surface shadow-card rounded-xl border transition-all duration-200"
              style={{ width: `${chartWidth}px`, height: `${chartHeight}px` }}
            >
              {previewError ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
                  <Icon name="alertCircle" size={28} className="text-danger/50" />
                  <p className="text-danger max-w-md text-center text-xs leading-relaxed">
                    {previewError}
                  </p>
                </div>
              ) : (
                <div ref={previewHostRef} className="h-full w-full"></div>
              )}
            </div>
          </div>
        </div>

        {/* right panel */}
        {!rightExpand ? (
          <button
            className="border-border bg-surface text-text-tertiary hover:text-brand absolute top-1/2 right-0 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 shadow-sm transition-colors"
            title="Expand panel"
            onClick={() => setRightExpand(true)}
          >
            <Icon name="chevronLeft" size={10} />
          </button>
        ) : (
          <>
            <button
              className="border-border bg-surface text-text-tertiary hover:text-brand absolute top-1/2 right-50 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 shadow-sm transition-colors"
              title="Collapse panel"
              onClick={() => setRightExpand(false)}
            >
              <Icon name="chevronRight" size={10} />
            </button>
            <div className="border-border bg-surface w-50 shrink-0 overflow-y-auto border-l p-4">
              <h3 className="text-text-tertiary mb-3 text-xs font-semibold tracking-widest uppercase">
                Preview Settings
              </h3>
              {slider("Width", chartWidth, 100, 1200, setChartWidth)}
              {slider("Height", chartHeight, 100, 800, setChartHeight)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
