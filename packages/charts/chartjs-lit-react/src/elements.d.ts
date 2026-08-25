import type { WcHeader } from "@/components/wc-header";
import type { WcFooter } from "@/components/wc-footer";
import type { WcAuthModal } from "@/components/wc-auth-modal";
import type { WcPlazaPage } from "@/components/wc-plaza-page";
import type { WcProjectsPage } from "@/components/wc-projects-page";
import type { WcHelpPage } from "@/components/wc-help-page";
import type { WcNotFoundPage } from "@/components/wc-not-found-page";
import type { WcEditorPage } from "@/components/wc-editor-page";

type WcProps<T> = Partial<Record<string, unknown>> & {
  ref?: { current: T | null } | null;
  children?: unknown;
  className?: string;
  style?: string | Record<string, string | number>;
};

declare module "@lark.js/react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "wc-header": WcProps<WcHeader> & {
        activePath?: string;
      };
      "wc-footer": WcProps<WcFooter>;
      "wc-auth-modal": WcProps<WcAuthModal>;
      "wc-plaza-page": WcProps<WcPlazaPage> & {
        activePath?: string;
      };
      "wc-projects-page": WcProps<WcProjectsPage> & {
        activePath?: string;
      };
      "wc-help-page": WcProps<WcHelpPage> & {
        activePath?: string;
        sectionParam?: string;
      };
      "wc-not-found-page": WcProps<WcNotFoundPage> & {
        activePath?: string;
      };
      "wc-editor-page": WcProps<WcEditorPage> & {
        activePath?: string;
      };
    }
  }
}
