/**
 * chart.js code generation for the visual editor. Each chart type has a
 * translate() that renders a self-contained JS snippet defining
 * `var options = {...}` referencing the `data` 2D array (row 0 = headers).
 */

export interface ChartTypeConfig {
  type: string;
  name: string;
  icon: string;
  order: number;
  datasource: Record<string, unknown>;
  editorConfig: Record<string, { limit: number; empty?: boolean }>;
  translate: (type: string, datasource: Record<string, string[]>) => string;
}

export const CHART_THEMES = [
  "#ff8533",
  "#73ace6",
  "#82d982",
  "#e673ac",
  "#cd6bed",
  "#8282d9",
  "#c0e650",
  "#e6ac73",
  "#6bcded",
  "#73e6ac",
  "#ed6bcd",
  "#9966cc",
];

function jsonFormat(obj: unknown, indent = 4): string {
  const rawStr = JSON.stringify(obj, null, indent);
  return rawStr.replace(/"([^"]+)":/g, "$1:").replace(/"/g, "'");
}

function labelsOf(x: string[]): string {
  return `data.slice(1).map(function(row) { return row[0]; })${x.length ? "" : ""}`;
}

function rectTranslate(graphType: string, horizontal: boolean, filled = false) {
  return (_type: string, datasource: Record<string, string[]>) => {
    const x = datasource.x || [];
    const y0 = datasource.y0 || [];
    const y1 = datasource.y1 || [];
    const ds: Record<string, unknown> = { x, y0, y1 };
    if (datasource.theme) ds.theme = datasource.theme;

    return `// chart.js visual editor generated (chart.js)
var datasource = ${jsonFormat(ds)};
var labels = ${labelsOf(x)};
var dataset = function(field, idx, color) {
    return {
        label: field,
        data: data.slice(1).map(function(row) { return row[idx]; }),
        backgroundColor: ${filled ? "color" : "color + '33'"},
        borderColor: color,
        borderWidth: ${filled ? 0 : 2},
        borderRadius: 4
    };
};

var options = {
    type: '${graphType}',
    data: {
        labels: labels,
        datasets: [].concat(
            datasource.y0.map(function(f, i) { return dataset(f, data[0].indexOf(f) + 1, (datasource.theme || [])[i % ((datasource.theme || []).length || 1)] || '#7c3aed'); }),
            datasource.y1.map(function(f, i) { return dataset(f, data[0].indexOf(f) + 1, (datasource.theme || [])[i % ((datasource.theme || []).length || 1)] || '#d946ef'); })
        )
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: '${horizontal ? "y" : "x"}',
        plugins: {
            legend: { display: true },
            tooltip: { mode: 'index', intersect: false }
        },
        scales: {
            x: { grid: { display: ${horizontal} } },
            y: { grid: { display: ${!horizontal} } }
        }
    }
};`;
  };
}

function lineTranslate(filled = false) {
  return (_type: string, datasource: Record<string, string[]>) => {
    const x = datasource.x || [];
    const y0 = datasource.y0 || [];
    const y1 = datasource.y1 || [];
    const ds: Record<string, unknown> = { x, y0, y1 };
    if (datasource.theme) ds.theme = datasource.theme;

    return `// chart.js visual editor generated (chart.js)
var datasource = ${jsonFormat(ds)};
var labels = ${labelsOf(x)};
var dataset = function(field, idx, color) {
    return {
        label: field,
        data: data.slice(1).map(function(row) { return row[idx]; }),
        borderColor: color,
        backgroundColor: ${filled ? "color + '22'" : "color"},
        fill: ${filled},
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5
    };
};

var options = {
    type: 'line',
    data: {
        labels: labels,
        datasets: [].concat(
            datasource.y0.map(function(f, i) { return dataset(f, data[0].indexOf(f) + 1, (datasource.theme || [])[i % ((datasource.theme || []).length || 1)] || '#7c3aed'); }),
            datasource.y1.map(function(f, i) { return dataset(f, data[0].indexOf(f) + 1, (datasource.theme || [])[i % ((datasource.theme || []).length || 1)] || '#d946ef'); })
        )
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: true },
            tooltip: { mode: 'index', intersect: false }
        },
        scales: {
            x: { grid: { display: false } },
            y: { grid: { color: '#e5e7eb55' } }
        }
    }
};`;
  };
}

function polarTranslate(kind: "pie" | "doughnut" | "polarArea") {
  return (_type: string, datasource: Record<string, string[]>) => {
    const x = datasource.x || [];
    const y0 = datasource.y0 || [];
    const ds: Record<string, unknown> = { x, y0 };
    if (datasource.theme) ds.theme = datasource.theme;

    return `// chart.js visual editor generated (chart.js)
var datasource = ${jsonFormat(ds)};
var labels = ${labelsOf(x)};
var field = (datasource.y0 || [])[0];
var theme = datasource.theme || [];

var options = {
    type: '${kind}',
    data: {
        labels: labels,
        datasets: [{
            data: data.slice(1).map(function(row) { return row[data[0].indexOf(field) + 1]; }),
            backgroundColor: labels.map(function(_, i) { return theme[i % (theme.length || 1)] || '#7c3aed'; }),
            borderColor: '#ffffff',
            borderWidth: 2,
            hoverOffset: 8
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right' },
            tooltip: { mode: 'index', intersect: false }
        }
    }
};`;
  };
}

function radarTranslate() {
  return (_type: string, datasource: Record<string, string[]>) => {
    const x = datasource.x || [];
    const y0 = datasource.y0 || [];
    const ds: Record<string, unknown> = { x, y0 };
    if (datasource.theme) ds.theme = datasource.theme;

    return `// chart.js visual editor generated (chart.js)
var datasource = ${jsonFormat(ds)};
var labels = ${labelsOf(x)};
var theme = datasource.theme || [];

var options = {
    type: 'radar',
    data: {
        labels: labels,
        datasets: (datasource.y0 || []).map(function(f, i) {
            return {
                label: f,
                data: data.slice(1).map(function(row) { return row[data[0].indexOf(f) + 1]; }),
                borderColor: theme[i % (theme.length || 1)] || '#7c3aed',
                backgroundColor: (theme[i % (theme.length || 1)] || '#7c3aed') + '33',
                borderWidth: 2,
                pointRadius: 3
            };
        })
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: {
            r: { grid: { color: '#e5e7eb55' }, angleLines: { color: '#e5e7eb55' } }
        }
    }
};`;
  };
}

function scatterTranslate(bubble = false) {
  return (_type: string, datasource: Record<string, string[]>) => {
    const x = datasource.x || [];
    const y0 = datasource.y0 || [];
    const ds: Record<string, unknown> = { x, y0 };
    if (datasource.theme) ds.theme = datasource.theme;

    return `// chart.js visual editor generated (chart.js)
var datasource = ${jsonFormat(ds)};
var theme = datasource.theme || [];
var xf = (datasource.x || [])[0];

var options = {
    type: '${bubble ? "bubble" : "scatter"}',
    data: {
        datasets: (datasource.y0 || []).map(function(f, i) {
            return {
                label: f,
                data: data.slice(1).map(function(row) {
                    var pt = { x: row[data[0].indexOf(xf)], y: row[data[0].indexOf(f) + 1] };
                    ${bubble ? "pt.r = Math.abs(pt.y) / 10 + 4;" : ""}
                    return pt;
                }),
                backgroundColor: (theme[i % (theme.length || 1)] || '#7c3aed') + '99',
                borderColor: theme[i % (theme.length || 1)] || '#7c3aed'
            };
        })
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true }, tooltip: { mode: 'index', intersect: false } },
        scales: {
            x: { grid: { color: '#e5e7eb55' } },
            y: { grid: { color: '#e5e7eb55' } }
        }
    }
};`;
  };
}

const chartRegistry: ChartTypeConfig[] = [
  {
    type: "line",
    name: "Line",
    icon: "line",
    order: 1,
    datasource: { x: [], y0: [], y1: [] },
    editorConfig: {
      x: { limit: 1 },
      y0: { limit: Number.MAX_SAFE_INTEGER },
      y1: { limit: Number.MAX_SAFE_INTEGER, empty: true },
    },
    translate: lineTranslate(false),
  },
  {
    type: "area",
    name: "Area",
    icon: "area",
    order: 2,
    datasource: { x: [], y0: [], y1: [] },
    editorConfig: {
      x: { limit: 1 },
      y0: { limit: Number.MAX_SAFE_INTEGER },
      y1: { limit: Number.MAX_SAFE_INTEGER, empty: true },
    },
    translate: lineTranslate(true),
  },
  {
    type: "bar",
    name: "Bar",
    icon: "bar",
    order: 3,
    datasource: { x: [], y0: [], y1: [] },
    editorConfig: {
      x: { limit: 1 },
      y0: { limit: Number.MAX_SAFE_INTEGER },
      y1: { limit: Number.MAX_SAFE_INTEGER, empty: true },
    },
    translate: rectTranslate("bar", false),
  },
  {
    type: "hbar",
    name: "Horizontal Bar",
    icon: "hbar",
    order: 4,
    datasource: { x: [], y0: [], y1: [] },
    editorConfig: {
      x: { limit: 1 },
      y0: { limit: Number.MAX_SAFE_INTEGER },
      y1: { limit: Number.MAX_SAFE_INTEGER, empty: true },
    },
    translate: rectTranslate("bar", true),
  },
  {
    type: "pie",
    name: "Pie",
    icon: "pie",
    order: 5,
    datasource: { x: [], y0: [] },
    editorConfig: { x: { limit: 1 }, y0: { limit: 1 } },
    translate: polarTranslate("pie"),
  },
  {
    type: "doughnut",
    name: "Doughnut",
    icon: "doughnut",
    order: 6,
    datasource: { x: [], y0: [] },
    editorConfig: { x: { limit: 1 }, y0: { limit: 1 } },
    translate: polarTranslate("doughnut"),
  },
  {
    type: "radar",
    name: "Radar",
    icon: "radar",
    order: 7,
    datasource: { x: [], y0: [] },
    editorConfig: { x: { limit: 1 }, y0: { limit: Number.MAX_SAFE_INTEGER } },
    translate: radarTranslate(),
  },
  {
    type: "scatter",
    name: "Scatter",
    icon: "scatter",
    order: 8,
    datasource: { x: [], y0: [] },
    editorConfig: { x: { limit: 1 }, y0: { limit: Number.MAX_SAFE_INTEGER } },
    translate: scatterTranslate(false),
  },
  {
    type: "bubble",
    name: "Bubble",
    icon: "bubble",
    order: 9,
    datasource: { x: [], y0: [] },
    editorConfig: { x: { limit: 1 }, y0: { limit: Number.MAX_SAFE_INTEGER } },
    translate: scatterTranslate(true),
  },
  {
    type: "polarArea",
    name: "Polar Area",
    icon: "polarArea",
    order: 10,
    datasource: { x: [], y0: [] },
    editorConfig: { x: { limit: 1 }, y0: { limit: 1 } },
    translate: polarTranslate("polarArea"),
  },
];

export function getAllChartTypes(): ChartTypeConfig[] {
  return [...chartRegistry].sort((a, b) => a.order - b.order);
}

export function getChartType(type: string): ChartTypeConfig | undefined {
  return chartRegistry.find((c) => c.type === type);
}

export function generateCode(type: string, datasource: Record<string, string[]>): string {
  const config = getChartType(type);
  if (!config) return "var options = {};";
  return config.translate(type, datasource);
}
