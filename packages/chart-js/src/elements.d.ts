import type { HTMLAttributes } from "@lark.js/mvc";

import type { WcHeader } from "@/components/wc-header";
import type { WcFooter } from "@/components/wc-footer";
import type { WcAuthModal } from "@/components/wc-auth-modal";
import type { WcPlazaPage } from "@/components/wc-plaza-page";
import type { WcProjectsPage } from "@/components/wc-projects-page";
import type { WcHelpPage } from "@/components/wc-help-page";
import type { WcNotFoundPage } from "@/components/wc-not-found-page";
import type { WcEditorPage } from "@/components/wc-editor-page";

/**
 * Lit custom-element registrations for the lark JSX runtime.
 *
 * `JSX.IntrinsicElements` is strict — unknown tags are compile errors — so
 * every wc-* element is declared here via module augmentation. Only DATA
 * attributes are declared; `nav-request` custom events are consumed by the
 * lark shell via `addEventListener` (camelCase `on*` props derive event
 * names via `slice(2).toLowerCase()` and cannot express hyphenated names).
 */
declare module "@lark.js/mvc/jsx-runtime" {
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
