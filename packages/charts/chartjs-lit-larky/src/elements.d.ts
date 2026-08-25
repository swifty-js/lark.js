import type { HTMLAttributes } from "@lark.js/larky";

import type { WcHeader } from "@/components/wc-header";
import type { WcFooter } from "@/components/wc-footer";
import type { WcAuthModal } from "@/components/wc-auth-modal";
import type { WcPlazaPage } from "@/components/wc-plaza-page";
import type { WcProjectsPage } from "@/components/wc-projects-page";
import type { WcHelpPage } from "@/components/wc-help-page";
import type { WcNotFoundPage } from "@/components/wc-not-found-page";
import type { WcEditorPage } from "@/components/wc-editor-page";

declare module "@lark.js/larky/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "wc-header": HTMLAttributes<WcHeader> & {
        activePath?: string;
      };
      "wc-footer": HTMLAttributes<WcFooter>;
      "wc-auth-modal": HTMLAttributes<WcAuthModal>;
      "wc-plaza-page": HTMLAttributes<WcPlazaPage> & {
        activePath?: string;
      };
      "wc-projects-page": HTMLAttributes<WcProjectsPage> & {
        activePath?: string;
      };
      "wc-help-page": HTMLAttributes<WcHelpPage> & {
        activePath?: string;
        sectionParam?: string;
      };
      "wc-not-found-page": HTMLAttributes<WcNotFoundPage> & {
        activePath?: string;
      };
      "wc-editor-page": HTMLAttributes<WcEditorPage> & {
        activePath?: string;
      };
    }
  }
}
