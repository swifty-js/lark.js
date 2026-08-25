import * as monaco from "monaco-editor";
import * as acorn from "acorn";

interface Position {
  lineNumber: number;
  column: number;
}

interface Loc {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/** Static chart.js option schema tree powering Monaco completions. */
type PropSchema = Record<string, unknown>;
const SCHEMA: Record<string, PropSchema> = {
  options: {
    type: {
      detail: "Chart type",
      documentation:
        "line | bar | pie | doughnut | radar | scatter | bubble | polarArea",
      insertText: "type: ''",
    },
    data: { propertys: {} },
    options: { propertys: {} },
  },
};

const DATA_PROPS: Record<string, PropSchema> = {
  labels: { detail: "string[] — category labels" },
  datasets: { detail: "array of dataset objects" },
};

const DATASET_PROPS: Record<string, PropSchema> = {
  label: { detail: "string — dataset label" },
  data: { detail: "number[] | point[] — values" },
  backgroundColor: { detail: "color | color[] — fill" },
  borderColor: { detail: "color | color[] — outline" },
  borderWidth: { detail: "number" },
  borderRadius: { detail: "number" },
  fill: { detail: "boolean — area fill (line)" },
  tension: { detail: "number 0..1 — curve (line)" },
  pointRadius: { detail: "number" },
  pointHoverRadius: { detail: "number" },
  hoverOffset: { detail: "number — explode on hover (pie)" },
  indexAxis: { detail: "'x' | 'y'" },
};

const OPTIONS_PROPS: Record<string, PropSchema> = {
  responsive: { detail: "boolean" },
  maintainAspectRatio: { detail: "boolean" },
  stacked: { detail: "boolean" },
  indexAxis: { detail: "'x' | 'y'" },
  plugins: { propertys: {} },
  scales: { propertys: {} },
};

const PLUGIN_PROPS: Record<string, PropSchema> = {
  legend: { propertys: {} },
  tooltip: { propertys: {} },
  title: { propertys: {} },
};

const LEGEND_PROPS: Record<string, PropSchema> = {
  display: { detail: "boolean" },
  position: { detail: "'top' | 'right' | 'bottom' | 'left'" },
};

const TOOLTIP_PROPS: Record<string, PropSchema> = {
  mode: { detail: "'index' | 'nearest' | 'point'" },
  intersect: { detail: "boolean" },
  enabled: { detail: "boolean" },
};

const SCALE_PROPS: Record<string, PropSchema> = {
  x: { propertys: {} },
  y: { propertys: {} },
  r: { propertys: {} },
};

const AXIS_PROPS: Record<string, PropSchema> = {
  display: { detail: "boolean" },
  beginAtZero: { detail: "boolean" },
  stacked: { detail: "boolean" },
  min: { detail: "number" },
  max: { detail: "number" },
  title: { propertys: {} },
  grid: { propertys: {} },
  ticks: { propertys: {} },
};

const GRID_PROPS: Record<string, PropSchema> = {
  display: { detail: "boolean" },
  color: { detail: "color" },
};

const TICKS_PROPS: Record<string, PropSchema> = {
  color: { detail: "color" },
  precision: { detail: "number" },
  maxTicksLimit: { detail: "number" },
};

const TITLE_PROPS: Record<string, PropSchema> = {
  display: { detail: "boolean" },
  text: { detail: "string" },
};

function schemaFor(path: string): Record<string, PropSchema> | null {
  switch (path) {
    case "options":
      return SCHEMA.options as Record<string, PropSchema>;
    case "options.data":
      return DATA_PROPS;
    case "options.data.datasets[]":
      return DATASET_PROPS;
    case "options.options":
      return OPTIONS_PROPS;
    case "options.options.plugins":
      return PLUGIN_PROPS;
    case "options.options.plugins.legend":
      return LEGEND_PROPS;
    case "options.options.plugins.tooltip":
      return TOOLTIP_PROPS;
    case "options.options.plugins.title":
      return TITLE_PROPS;
    case "options.options.scales":
      return SCALE_PROPS;
    case "options.options.scales.x":
    case "options.options.scales.y":
    case "options.options.scales.r":
      return AXIS_PROPS;
    case "options.options.scales.*.grid":
    case "options.options.scales.x.grid":
    case "options.options.scales.y.grid":
    case "options.options.scales.r.grid":
      return GRID_PROPS;
    case "options.options.scales.*.ticks":
    case "options.options.scales.x.ticks":
    case "options.options.scales.y.ticks":
      return TICKS_PROPS;
    default:
      return null;
  }
}

// acorn columns are 0-based, Monaco columns are 1-based
function positionInLoc(position: Position, loc: Loc): boolean {
  const col = position.column - 1;
  const line = position.lineNumber;
  if (line < loc.start.line || line > loc.end.line) return false;
  if (line === loc.start.line && line === loc.end.line) {
    return col >= loc.start.column && col <= loc.end.column;
  }
  if (line === loc.start.line) return col >= loc.start.column;
  if (line === loc.end.line) return col <= loc.end.column;
  return true;
}

function positionInComment(
  comments: { loc: Loc }[],
  position: Position,
): boolean {
  return comments.some((c) => positionInLoc(position, c.loc));
}

function getOptionsNode(
  ast: acorn.Node & { body: unknown[] },
  position: Position,
): (acorn.Node & Record<string, unknown>) | null {
  for (const stmt of ast.body as Record<string, unknown>[]) {
    if (stmt.type !== "VariableDeclaration") continue;
    for (const decl of stmt.declarations as Record<string, unknown>[]) {
      const id = decl.id as Record<string, unknown>;
      const init = decl.init as (acorn.Node & Record<string, unknown>) | null;
      if (
        id?.name === "options" &&
        init?.type === "ObjectExpression" &&
        positionInLoc(position, init.loc as unknown as Loc)
      ) {
        return init;
      }
    }
  }
  return null;
}

function getOptionPath(
  ast: acorn.Node & { body: unknown[] },
  position: Position,
  comments: { loc: Loc }[],
): string[] {
  const path: string[] = [];
  const optionsNode = getOptionsNode(ast, position);
  if (!optionsNode || positionInComment(comments, position)) return path;
  path.push("options");

  function findOf(properties: Record<string, unknown>[], pos: Position) {
    for (const prop of properties) {
      if (prop.type !== "Property") continue;
      const loc = prop.loc as unknown as Loc;
      if (!positionInLoc(pos, loc)) continue;

      const value = prop.value as acorn.Node & Record<string, unknown>;
      if (
        value.type === "FunctionExpression" ||
        value.type === "ArrowFunctionExpression"
      ) {
        path.length = 0;
        return;
      }

      const key = prop.key as Record<string, unknown>;
      path.push((key.name || key.value) as string);

      if (value.type === "ObjectExpression" && value.properties) {
        findOf(value.properties as Record<string, unknown>[], pos);
      }

      if (value.type === "ArrayExpression" && value.elements) {
        const elements = value.elements as (acorn.Node &
          Record<string, unknown>)[];
        for (const ele of elements) {
          if (
            ele &&
            ele.type === "ObjectExpression" &&
            positionInLoc(pos, ele.loc as unknown as Loc)
          ) {
            path.push("[]");
            if (ele.properties) {
              findOf(ele.properties as Record<string, unknown>[], pos);
            }
          }
        }
      }
    }
  }

  if (optionsNode.properties) {
    findOf(optionsNode.properties as Record<string, unknown>[], position);
  }
  return path;
}

let registered = false;

export function registerChartCompletion(): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerCompletionItemProvider("javascript", {
    triggerCharacters: ["\r", "\n", " ", ":", "."],
    provideCompletionItems(model, position, context) {
      if (
        context.triggerKind ===
        monaco.languages.CompletionTriggerKind.TriggerForIncompleteCompletions
      ) {
        return { suggestions: [], incomplete: false };
      }

      const code = model.getValue();
      let ast: acorn.Node & { body: unknown[] };
      let comments: { loc: Loc }[] = [];
      try {
        const collected: acorn.Comment[] = [];
        ast = acorn.parse(code, {
          ecmaVersion: "latest",
          locations: true,
          onComment: collected,
        }) as acorn.Node & { body: unknown[] };
        comments = collected as unknown as { loc: Loc }[];
      } catch {
        return { suggestions: [], incomplete: false };
      }

      const optionPath = getOptionPath(ast, position, comments);
      if (optionPath.length === 0) {
        return { suggestions: [], incomplete: false };
      }
      // Cursor directly on the array (between datasets brackets) — suggest
      // nothing; completions belong inside an element object.
      if (optionPath[optionPath.length - 1] === "[]") {
        return { suggestions: [], incomplete: false };
      }

      const schema = schemaFor(optionPath.join("."));
      if (!schema) return { suggestions: [], incomplete: false };

      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];
      for (const [key, item] of Object.entries(schema)) {
        const hasChildren = !!(item as PropSchema).propertys;
        suggestions.push({
          label: key,
          detail: ((item as PropSchema).detail as string) || "",
          kind: hasChildren
            ? monaco.languages.CompletionItemKind.Module
            : monaco.languages.CompletionItemKind.Property,
          documentation: (item as PropSchema).documentation as string,
          insertText:
            ((item as PropSchema).insertText as string) ||
            (hasChildren ? key + ": {}" : key + ": "),
          range,
        });
      }
      return { suggestions, incomplete: false };
    },
  });
}
