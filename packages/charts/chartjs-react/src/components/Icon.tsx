import { icon, type IconName } from "@/lib/icons";

/**
 * Inline lucide-static SVG. Replaces the Lit `unsafeHTML(icon(...))`
 * pattern — lark-react's only trusted-HTML path is
 * `dangerouslySetInnerHTML` (never combine with children).
 */
export function Icon({
  name,
  size = 16,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon(name, size) }}
    />
  );
}
