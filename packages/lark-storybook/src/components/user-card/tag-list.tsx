import styles from "./tag-list.module.css";

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
    <div class={[styles["tag-list"], props.class]}>
      {tags.length > 0 ? (
        tags.map((tag) => (
          <wa-tag
            class={styles["tag-list__tag"]}
            variant="brand"
            appearance="outlined"
            size="s"
            pill
            role="button"
            tabindex={0}
            data-tag={tag}
            onClick={pick}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              pick(e);
            }}
          >
            {tag}
          </wa-tag>
        ))
      ) : (
        <wa-badge class={styles["tag-list__empty"]} variant="neutral" appearance="outlined">
          No tags
        </wa-badge>
      )}
    </div>
  );
}
