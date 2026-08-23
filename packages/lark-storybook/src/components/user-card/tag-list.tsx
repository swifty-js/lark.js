import { defineView, jsxTemplate } from "@lark.js/mvc";
import styles from "./tag-list.module.css";

export interface TagListProps {
  tags: string[];
}

interface TagListData {
  tags: string[];
}

const template = jsxTemplate<TagListData>(({ tags }) => (
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
          onClick="pick"
          onKeydown="pickKey"
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
));

export default defineView((ctx, params) => {
  const props = (params ?? {}) as Partial<TagListProps>;

  ctx.updater.set({
    tags: Array.isArray(props.tags) ? props.tags : [],
  });

  const pick = (e: Event): void => {
    const target = e.target as HTMLElement | null;
    const tag = target?.closest<HTMLElement>("[data-tag]")?.dataset["tag"];
    if (tag) ctx.owner.fire("select", { tag });
  };

  return {
    template,
    events: {
      "pick<click>": pick,
      "pickKey<keydown>": (e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        pick(e);
      },
    },
  };
});
