import { raw, useSignal, useEffect, useRef } from "@lark.js/larky";
import { homeChartsApi, type ChartItem } from "@/lib/api";
import { icon } from "@/lib/icons";
import { animateIn, animatePop } from "@/lib/anim";

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

export default function PlazaPage() {
  const root = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const charts = useSignal<ChartItem[]>([]);
  const groups = useSignal<ChartGroup[]>([]);
  const loading = useSignal(true);
  const types = useSignal<{ type: string; count: number }[]>([]);
  const activeType = useSignal("");
  const searchText = useSignal("");
  const preview = useSignal<ChartItem | null>(null);

  useEffect(() => {
    homeChartsApi()
      .then((res) => {
        if (res.ok && res.data) {
          const list = res.data.charts;
          charts.value = list;
          const countMap = new Map<string, number>();
          for (const c of list) {
            const t = c.chartType || "other";
            countMap.set(t, (countMap.get(t) || 0) + 1);
          }
          const t = Array.from(countMap.entries()).map(([type, count]) => ({ type, count }));
          t.sort((a, b) => b.count - a.count);
          types.value = t;
          groups.value = buildGroups(list);
        }
        loading.value = false;
        queueMicrotask(() => {
          if (root.current) animateIn(root.current, "[data-anim]");
        });
      })
      .catch(() => {
        loading.value = false;
      });
  });

  const applyFilter = (type: string) => {
    activeType.value = type;
    const q = searchText.value.trim().toLowerCase();
    const filtered = charts.value.filter((c) => {
      const byType = !type || c.chartType === type;
      const bySearch = !q || (c.name || "").toLowerCase().includes(q);
      return byType && bySearch;
    });
    groups.value = buildGroups(filtered);
    queueMicrotask(() => {
      if (root.current) animateIn(root.current, "[data-anim-card]", { y: 24, stagger: 0.03 });
    });
  };

  const scrollToGroup = (index: number) => {
    const sections = root.current?.querySelectorAll<HTMLElement>("[data-group-section]");
    sections?.[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const popAnimated = useRef(false);
  const onPreviewChange = () => {
    if (preview.value && !popAnimated.current && dialogRef.current) {
      popAnimated.current = true;
      animatePop(dialogRef.current);
    }
    if (!preview.value) popAnimated.current = false;
  };

  const renderCard = (item: ChartItem) => (
    <div
      data-anim-card
      class="group border-border bg-surface hover:border-brand/40 hover:shadow-card-hover relative cursor-pointer overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5"
      onClick={() => {
        preview.value = item;
        queueMicrotask(onPreviewChange);
      }}
    >
      <div class="bg-surface-alt relative flex h-40 items-center justify-center overflow-hidden p-3">
        <div class="bg-brand/5 pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
        <img
          src={item.previewUrl || ""}
          alt={item.name || ""}
          class="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div class="border-border border-t px-4 py-3">
        <p class="text-text-primary truncate text-sm font-medium">{item.name}</p>
        <div class="mt-1 flex items-center justify-between">
          {item.chartType && (
            <span class="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-[10px] font-medium">
              {item.chartType}
            </span>
          )}
          <span class="text-text-tertiary text-[10px]">
            {new Date(item.gmtModified).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={root} class="relative mx-auto max-w-7xl px-6 py-8">
      <div class="mb-8">
        <div class="flex items-end justify-between">
          <div>
            <div class="mb-2 flex items-center gap-2">
              <span class="text-brand inline-flex">{raw(icon("sparkles", 16))}</span>
              <span class="text-brand text-xs font-semibold tracking-widest uppercase">
                Community Gallery
              </span>
            </div>
            <h1 class="text-text-primary text-3xl font-bold tracking-tight">
              Chart<span class="text-brand">Plaza</span>
            </h1>
            <p class="text-text-secondary mt-1.5 text-sm">Browse and discover community charts</p>
          </div>
          <div class="hidden items-center gap-2 sm:flex">
            <span class="text-text-tertiary text-xs">Total</span>
            <span class="bg-brand/10 text-brand rounded-full px-3 py-1 text-sm font-semibold tabular-nums">
              {charts.value.length}
            </span>
          </div>
        </div>
      </div>

      {types.value.length > 0 && (
        <div class="bg-surface/75 border-border sticky top-14 z-20 -mx-6 mb-8 border-y px-6 py-3 backdrop-blur-xl backdrop-saturate-150">
          <div class="flex flex-wrap items-center gap-2">
            <button
              data-anim
              class={`${
                !activeType.value
                  ? "bg-brand text-white shadow-sm"
                  : "border-border text-text-secondary hover:border-brand/50 hover:text-brand border hover:shadow-sm"
              } rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200`}
              onClick={() => applyFilter("")}
            >
              All
            </button>
            {types.value.map((t) => (
              <button
                data-anim
                class={`${
                  activeType.value === t.type
                    ? "bg-brand text-white shadow-sm"
                    : "border-border text-text-secondary hover:border-brand/50 hover:text-brand border hover:shadow-sm"
                } rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200`}
                onClick={() => applyFilter(t.type)}
              >
                {t.type} ({t.count})
              </button>
            ))}
            <div class="border-border ml-auto flex items-center gap-2 rounded-full border px-3 py-1">
              <span class="text-text-tertiary inline-flex">{raw(icon("search", 13))}</span>
              <input
                type="text"
                placeholder="Search charts..."
                value={searchText.value}
                class="placeholder:text-text-tertiary/70 bg-transparent text-xs outline-none"
                onInput={(e) => {
                  searchText.value = (e.target as HTMLInputElement).value;
                  applyFilter(activeType.value);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {loading.value ? (
        <div class="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(() => (
            <div class="bg-surface-alt h-56 animate-pulse rounded-xl"></div>
          ))}
        </div>
      ) : (
        <>
          {groups.value.length > 1 && !activeType.value && (
            <div class="mb-4 flex flex-wrap gap-1.5">
              {groups.value.map((g, gi) => (
                <button
                  data-anim
                  class="text-text-secondary hover:bg-surface-alt hover:text-brand rounded-md px-2.5 py-1 text-xs transition-colors"
                  onClick={() => scrollToGroup(gi)}
                >
                  {g.name} ({g.count})
                </button>
              ))}
            </div>
          )}
          {groups.value.map((group) => (
            <div data-group-section class="mb-10 scroll-mt-32">
              {groups.value.length > 1 && !activeType.value && (
                <div class="mb-4 flex items-center gap-3">
                  <h2 class="text-text-primary text-base font-semibold">{group.name}</h2>
                  <span class="bg-surface-alt text-text-secondary rounded-full px-2 py-0.5 text-xs tabular-nums">
                    {group.count}
                  </span>
                  <div class="bg-border h-px flex-1"></div>
                </div>
              )}
              <div class="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                {group.list.map((item) => renderCard(item))}
              </div>
            </div>
          ))}
          {!loading.value && groups.value.length === 0 && (
            <div class="text-text-secondary flex h-64 flex-col items-center justify-center">
              <span class="text-text-tertiary/40 inline-flex">{raw(icon("search", 40))}</span>
              <p class="mt-4 text-lg">No charts found</p>
              <p class="mt-1 text-sm">Try selecting a different chart type or search term</p>
            </div>
          )}
        </>
      )}

      {preview.value && (
        <div
          class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => (preview.value = null)}
        >
          <div
            ref={dialogRef}
            class="border-border bg-surface shadow-modal animate-scale-in relative max-h-[85vh] max-w-4xl overflow-auto rounded-2xl border"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              class="text-text-secondary hover:bg-surface-alt hover:text-text-primary absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              onClick={() => (preview.value = null)}
            >
              {raw(icon("x", 16))}
            </button>
            <div class="p-6">
              <h3 class="text-text-primary mb-1 text-lg font-medium">{preview.value.name}</h3>
              {preview.value.chartType && (
                <p class="text-text-secondary mb-4 text-xs">{preview.value.chartType}</p>
              )}
              <div class="bg-surface-alt flex items-center justify-center rounded-lg p-4">
                <img
                  src={preview.value.previewUrl || ""}
                  alt={preview.value.name || ""}
                  class="max-h-[60vh] max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
