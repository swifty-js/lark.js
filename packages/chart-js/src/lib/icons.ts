import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Copy,
  Play,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Image,
  ChartLine,
  ChartBar,
  BarChartHorizontal,
  ChartPie,
  ChartScatter,
  ChartArea,
  Radar,
  ChartNoAxesColumn,
  PieChart,
  CircleDot,
  User,
  LogOut,
  Search,
  Folder,
  FileCode2,
  Layers,
  Sparkles,
  ArrowRight,
  Globe,
  ChevronDown,
  LoaderCircle,
} from "lucide-static";

function resize(svg: string, size: number): string {
  return svg
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`);
}

const src = {
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  check: Check,
  x: X,
  copy: Copy,
  play: Play,
  plus: Plus,
  pencil: Pencil,
  trash: Trash2,
  alertCircle: AlertCircle,
  image: Image,
  user: User,
  logout: LogOut,
  search: Search,
  folder: Folder,
  code: FileCode2,
  layers: Layers,
  sparkles: Sparkles,
  arrowRight: ArrowRight,
  globe: Globe,
  spinner: LoaderCircle,
  chartLine: ChartLine,
  chartBar: ChartBar,
  chartHBar: BarChartHorizontal,
  chartPie: ChartPie,
  chartScatter: ChartScatter,
  chartArea: ChartArea,
  chartRadar: Radar,
  chartColumn: ChartNoAxesColumn,
  chartPolar: PieChart,
  chartBubble: CircleDot,
};

export type IconName = keyof typeof src;

export function icon(name: IconName, size = 16): string {
  return resize(src[name], size);
}

export const chartTypeIcons: Record<string, string> = {
  line: icon("chartLine", 22),
  bar: icon("chartBar", 22),
  hbar: icon("chartHBar", 22),
  pie: icon("chartPie", 22),
  doughnut: icon("chartColumn", 22),
  radar: icon("chartRadar", 22),
  scatter: icon("chartScatter", 22),
  area: icon("chartArea", 22),
  polarArea: icon("chartPolar", 22),
  bubble: icon("chartBubble", 22),
};
