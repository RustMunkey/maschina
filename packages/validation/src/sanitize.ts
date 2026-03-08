// ─── Input sanitization ───────────────────────────────────────────────────────
// Applied to all user-supplied text BEFORE it touches the database or processing.
// Does NOT use a DOM — server-side only, no browser dependencies.

const NULL_BYTE_RE = /\0/g;
const CONTROL_CHAR_RE = /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const HTML_TAG_RE = /<[^>]*>/g;
const HTML_ENTITY_RE = /&(?:#\d+|#x[\da-f]+|[a-z]+);/gi;

/**
 * Strip dangerous characters from plain-text user input.
 * Use for: names, descriptions, labels, metadata — anything that is NOT code.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(NULL_BYTE_RE, "")           // null bytes crash some parsers
    .replace(CONTROL_CHAR_RE, "")        // control chars except \t \n \r
    .replace(HTML_TAG_RE, "")            // strip all HTML tags
    .replace(HTML_ENTITY_RE, "")         // strip HTML entities
    .normalize("NFC")                    // normalize unicode (prevent homograph attacks)
    .trim();
}

/**
 * Sanitize a slug/identifier: lowercase, alphanumeric + hyphens only.
 */
export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

/**
 * Sanitize a filename: strip path traversal, keep only safe characters.
 */
export function sanitizeFilename(input: string): string {
  // basename only — remove all directory separators
  const base = input.replace(/[/\\]/g, "_");
  return base
    .replace(NULL_BYTE_RE, "")
    .replace(/[<>:"|?*]/g, "_")   // Windows forbidden chars
    .replace(/^\.+/, "")           // no leading dots (hidden files)
    .trim()
    .slice(0, 255);
}

/**
 * Sanitize a URL: must be http/https only (no javascript:, data:, etc.)
 * Returns null if the URL is not safe to store/display.
 */
export function sanitizeUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Enforce hard length limits on a string. Throws if exceeded.
 * Use at validation layer before sanitization.
 */
export function enforceLength(
  value: string,
  field: string,
  max: number,
  min = 0,
): void {
  if (value.length < min) throw new Error(`${field} must be at least ${min} characters`);
  if (value.length > max) throw new Error(`${field} must be at most ${max} characters`);
}

// ─── Desanitization ───────────────────────────────────────────────────────────
// We don't "desanitize" — once sanitized, data is stored clean.
// When rendering user content in the UI (apps/), the frontend escapes output
// via React's default JSX escaping (never dangerouslySetInnerHTML with user data).
// There is no server-side desanitization step.
