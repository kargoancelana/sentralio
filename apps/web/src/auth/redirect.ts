/**
 * Redirect path safety helper.
 * Requirement: 1.8
 */

/**
 * Returns `path` only when it is a valid same-origin path — i.e. it starts
 * with exactly one `/` (starts with `/` but NOT with `//`).
 *
 * Any other value (empty string, scheme-relative `//evil.com`, absolute URL,
 * etc.) falls back to `/` so the app never redirects the user off-origin.
 */
export function safeRedirectPath(path: string): string {
  if (path.startsWith("/") && !path.startsWith("//")) {
    return path;
  }
  return "/";
}
