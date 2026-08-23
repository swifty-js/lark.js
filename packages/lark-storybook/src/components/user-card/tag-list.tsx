import { defineView, jsxTemplate } from "@lark.js/mvc";
import styles from "./tag-list.module.css";

export interface TagListProps {
  tags: string[];
  onSelect?: (data?: Record<string, unknown>) => void;
}

export default defineView<TagListProps>((ctx, params) => {
  const props = (params ?? {}) as Partial<TagListProps>;

  const pick = (e: Event): void => {
    const target = e.target as HTMLElement | null;
    const tag = target?.closest<HTMLElement>("[data-tag]")?.dataset["tag"];
    if (tag) ctx.owner.fire("select", { tag });
  };

  const template = jsxTemplate(() => {
    const tags = Array.isArray(props.tags) ? props.tags : [];
    return (
      <div class={styles["tag-list"]}>
        {tags.length > 0 ? (
          tags.map((tag) => (
            <wa-tag
              class={styles["tag-list__tag"]}
              variant="brand"
              appearance="outlined"
              size="s"
              pill
              role="button"
              tabindex="0"
              data-tag={tag}
              onClick={pick}
              onKeydown={(e) => {
                const key = (e as KeyboardEvent).key;
                if (key !== "Enter" && key !== " ") return;
                e.preventDefault();
                pick(e);
              }}
            >
              {tag}
            </wa-tag>
          ))
        ) : (
          <wa-badge
            class={styles["tag-list__empty"]}
            variant="neutral"
            appearance="outlined"
          >
            No tags
          </wa-badge>
        )}
      </div>
    );
  });

  return { template };
});
