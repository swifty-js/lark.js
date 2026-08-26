import { useEffect, useRef, useState } from "@lark.js/react";
import { Icon } from "@/components/Icon";
import { homeChartsApi, type ChartItem } from "@/lib/api";
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

/**
 * Chart Plaza — community chart gallery with type filter chips, category
 * sections, and a preview dialog. Data loads from `/api/charts/home`.
 */
export default function PlazaPage() {
  const [charts, setCharts] = useState<ChartItem[]>([]);
  const [groups, setGroups] = useState<ChartGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<{ type: string; count: number }[]>([]);
  const [activeType, setActiveType] = useState("");
  const [searchText, setSearchText] = useState("");
  const [preview, setPreview] = useState<ChartItem | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Initial load.
  useEffect(() => {
    homeChartsApi()
      .then((res) => {
        if (res.ok && res.data) {
          const list = res.data.charts;
          setCharts(list);
          const countMap = new Map<string, number>();
          for (const c of list) {
            const t = c.chartType || "other";
            countMap.set(t, (countMap.get(t) || 0) + 1);
          }
          const t = Array.from(countMap.entries()).map(([type, count]) => ({
            type,
            count,
          }));
          t.sort((a, b) => b.count - a.count);
          setTypes(t);
          setGroups(buildGroups(list));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Entrance choreography once data lands.
  useEffect(() => {
    if (!loading && rootRef.current) animateIn(rootRef.current, "[data-anim]");
  }, [loading]);

  // Re-animate the cards on every filter/search change.
  useEffect(() => {
    if (!loading && rootRef.current) {
      animateIn(rootRef.current, "[data-anim-card]", { y: 24, stagger: 0.03 });
    }
  }, [activeType, searchText, loading]);

  // Pop-in once per preview-open.
  useEffect(() => {
    if (preview && dialogRef.current) animatePop(dialogRef.current);
  }, [preview]);

  const applyFilter = (type: string) => {
    setActiveType(type);
    const q = searchText.trim().toLowerCase();
    const filtered = charts.filter((c) => {
      const byType = !type || c.chartType === type;
      const bySearch = !q || (c.name || "").toLowerCase().includes(q);
      return byType && bySearch;
    });
    setGroups(buildGroups(filtered));
  };

  const onSearch = (value: string) => {
    setSearchText(value);
    const q = value.trim().toLowerCase();
    const filtered = charts.filter((c) => {
      const byType = !activeType || c.chartType === activeType;
      const bySearch = !q || (c.name || "").toLowerCase().includes(q);
      return byType && bySearch;
    });
    setGroups(buildGroups(filtered));
  };

  const scrollToGroup = (index: number) => {
    const sections = rootRef.current?.querySelectorAll<HTMLElement>("[data-group-section]");
    sections?.[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const chip = (type: string, label: string, active: boolean) => (
    <button
      key={type || "all"}
      data-anim
      className={`${
        active
          ? " bg-brand text-white shadow-sm"
          : "border-border text-text-secondary hover:border-brand/50 hover:text-brand border hover:shadow-sm"
      } rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200`}
      onClick={() => applyFilter(type)}
    >
      {label}
    </button>
  );

  const renderCard = (item: ChartItem) => (
    <div
      key={item.id}
      data-anim-card
      className="group border-border bg-surface hover:border-brand/40 hover:shadow-card-hover relative cursor-pointer overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5"
      onClick={() => setPreview(item)}
    >
      <div className="bg-surface-alt relative flex h-40 items-center justify-center overflow-hidden p-3">
        <div className="bg-brand/5 pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
        <img
          src={item.previewUrl || ""}
          alt={item.name || ""}
          className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="border-border border-t px-4 py-3">
        <p className="text-text-primary truncate text-sm font-medium">{item.name}</p>
        <div className="mt-1 flex items-center justify-between">
          {item.chartType && (
            <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-[10px] font-medium">
              {item.chartType}
            </span>
          )}
          <span className="text-text-tertiary text-[10px]">
            {new Date(item.gmtModified).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );

  const showGroupHeaders = groups.length > 1 && !activeType;

  return (
    <>
      <div ref={rootRef} className="relative mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <div className="flex items-end justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Icon name="sparkles" size={16} className="text-brand" />
                <span className="text-brand text-xs font-semibold tracking-widest uppercase">
                  Community Gallery
                </span>
              </div>
              <h1 className="text-text-primary text-3xl font-bold tracking-tight">
                Chart<span className="text-brand">Plaza</span>
              </h1>
              <p className="text-text-secondary mt-1.5 text-sm">
                Browse and discover community charts
              </p>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-text-tertiary text-xs">Total</span>
              <span className="bg-brand/10 text-brand rounded-full px-3 py-1 text-sm font-semibold tabular-nums">
                {charts.length}
              </span>
            </div>
          </div>
        </div>

        {types.length > 0 && (
          <div className="bg-surface/75 border-border sticky top-14 z-20 -mx-6 mb-8 border-y px-6 py-3 backdrop-blur-xl backdrop-saturate-150">
            <div className="flex flex-wrap items-center gap-2">
              {chip("", "All", !activeType)}
              {types.map((t) => chip(t.type, `${t.type} (${t.count})`, activeType === t.type))}
              <div className="border-border ml-auto flex items-center gap-2 rounded-full border px-3 py-1">
                <Icon name="search" size={13} className="text-text-tertiary" />
                <input
                  type="text"
                  placeholder="Search charts..."
                  value={searchText}
                  className="placeholder:text-text-tertiary/70 bg-transparent text-xs outline-none"
                  onInput={(e) => onSearch(e.currentTarget.value)}
                />
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-surface-alt h-56 animate-pulse rounded-xl"></div>
            ))}
          </div>
        ) : (
          <>
            {showGroupHeaders && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {groups.map((g, gi) => (
                  <button
                    key={g.name}
                    data-anim
                    className="text-text-secondary hover:bg-surface-alt hover:text-brand rounded-md px-2.5 py-1 text-xs transition-colors"
                    onClick={() => scrollToGroup(gi)}
                  >
                    {g.name} ({g.count})
                  </button>
                ))}
              </div>
            )}
            {groups.map((group) => (
              <div key={group.name} data-group-section className="mb-10 scroll-mt-32">
                {showGroupHeaders && (
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-text-primary text-base font-semibold">{group.name}</h2>
                    <span className="bg-surface-alt text-text-secondary rounded-full px-2 py-0.5 text-xs tabular-nums">
                      {group.count}
                    </span>
                    <div className="bg-border h-px flex-1"></div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                  {group.list.map((item) => renderCard(item))}
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="text-text-secondary flex h-64 flex-col items-center justify-center">
                <Icon name="search" size={40} className="text-text-tertiary/40" />
                <p className="mt-4 text-lg">No charts found</p>
                <p className="mt-1 text-sm">Try selecting a different chart type or search term</p>
              </div>
            )}
          </>
        )}
      </div>

      {preview && (
        <div
          className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div
            ref={dialogRef}
            className="border-border bg-surface shadow-modal animate-scale-in relative max-h-[85vh] max-w-4xl overflow-auto rounded-2xl border"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="text-text-secondary hover:bg-surface-alt hover:text-text-primary absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              onClick={() => setPreview(null)}
            >
              <Icon name="x" size={16} />
            </button>
            <div className="p-6">
              <h3 className="text-text-primary mb-1 text-lg font-medium">{preview.name}</h3>
              {preview.chartType && (
                <p className="text-text-secondary mb-4 text-xs">{preview.chartType}</p>
              )}
              <div className="bg-surface-alt flex items-center justify-center rounded-lg p-4">
                <img
                  src={preview.previewUrl || ""}
                  alt={preview.name || ""}
                  className="max-h-[60vh] max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
