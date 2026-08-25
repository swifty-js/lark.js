import type { HTMLAttributes } from "@lark.js/mvc";

import type { CpHeader } from "@/components/cp-header";
import type { CpFooter } from "@/components/cp-footer";
import type { CpAuthModal } from "@/components/cp-auth-modal";
import type { CpPlazaPage } from "@/components/cp-plaza-page";
import type { CpProjectsPage } from "@/components/cp-projects-page";
import type { CpHelpPage } from "@/components/cp-help-page";
import type { CpNotFoundPage } from "@/components/cp-not-found-page";
import type { CpEditorPage } from "@/components/cp-editor-page";

/**
 * Lit custom-element registrations for the lark JSX runtime.
 *
 * `JSX.IntrinsicElements` is strict — unknown tags are compile errors — so
 * every cp-* element is declared here via module augmentation. Only DATA
 * attributes are declared; `nav-request` custom events are consumed by the
 * lark shell via `addEventListener` (camelCase `on*` props derive event
 * names via `slice(2).toLowerCase()` and cannot express hyphenated names).
 */
declare module "@lark.js/mvc/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "cp-header": HTMLAttributes<CpHeader> & {
        activePath?: string;
      };
      "cp-footer": HTMLAttributes<CpFooter>;
      "cp-auth-modal": HTMLAttributes<CpAuthModal>;
      "cp-plaza-page": HTMLAttributes<CpPlazaPage> & {
        activePath?: string;
      };
      "cp-projects-page": HTMLAttributes<CpProjectsPage> & {
        activePath?: string;
      };
      "cp-help-page": HTMLAttributes<CpHelpPage> & {
        activePath?: string;
        sectionParam?: string;
      };
      "cp-not-found-page": HTMLAttributes<CpNotFoundPage> & {
        activePath?: string;
      };
      "cp-editor-page": HTMLAttributes<CpEditorPage> & {
        activePath?: string;
      };
    }
  }
}
