/**
 * Shared slugify utility.
 *
 * Converts arbitrary text into a URL-safe slug string.
 * Used by the scanner, compiler, anchor plugin, and runtime.
 */

/**
 * Create a slug from heading text for anchor links.
 *
 * Uses Unicode property escapes (\p{L} for letters, \p{N} for numbers)
 * so that CJK, Cyrillic, Arabic, and other non-ASCII scripts are preserved.
 *
 * Rules:
 * - Lowercase the text
 * - Replace non-letter/number/space/dash characters with a dash (preserves
 *   word boundaries — "Hello!World" → "hello-world", not "helloworld")
 * - Replace whitespace sequences with a single dash
 * - Collapse consecutive dashes
 * - Trim leading/trailing dashes
 * - Prefix a leading digit with underscore so the slug is a valid CSS
 *   selector (querySelector("#123") is invalid; "#_123" is valid)
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1");
}

/**
 * Create a per-document slug generator with deduplication.
 *
 * Successive calls with the same base text yield "foo", "foo-1", "foo-2"…
 * The anchor plugin and heading extraction MUST share this strategy (and
 * pass ALL heading levels through the slugger) so anchor IDs and TOC slugs
 * stay consistent even with duplicate heading text.
 */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugify(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}
