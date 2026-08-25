export interface TagListProps {
  tags?: string[];
  /** Extra class applied by the parent (no host element — the component owns it). */
  class?: string;
  onSelect?: (data: { tag: string }) => void;
}

export default function TagList(props: TagListProps) {
  const pick = (e: Event): void => {
    const target = e.target as HTMLElement | null;
    const tag = target?.closest<HTMLElement>("[data-tag]")?.dataset["tag"];
    if (tag) props.onSelect?.({ tag });
  };

  const tags = Array.isArray(props.tags) ? props.tags : [];
  return (
    <div class={["flex flex-wrap gap-1.5", props.class]}>
      {tags.length > 0 ? (
        tags.map((tag) => (
          <button
            key={`tag-${tag}`}
            type="button"
            class="cursor-pointer rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors select-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
            data-tag={tag}
            onClick={pick}
          >
            {tag}
          </button>
        ))
      ) : (
        <span class="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
          No tags
        </span>
      )}
    </div>
  );
}
