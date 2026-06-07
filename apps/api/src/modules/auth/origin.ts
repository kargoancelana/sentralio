/**
 * Origin allow-list helpers for CSRF protection.
 * Requirements: 9.2, 9.4, 9.6
 *
 * Parses AUTH_ALLOWED_ORIGINS once at module load time into a normalized set of
 * scheme://host:port strings, then exposes `matchesAllowList` and `isStateChanging`.
 */

/** HTTP methods that change server state and therefore require origin enforcement. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Default ports per scheme. Used when the URL's authority omits the port.
 */
const DEFAULT_PORTS: Record<string, number> = {
  http: 80,
  https: 443,
};

/**
 * Normalize a URL or bare origin string to `scheme://host:port`.
 *
 * Rules:
 *  - Lowercases the host.
 *  - Adds the scheme-appropriate default port (80/443) when the URL omits it.
 *  - Ignores path, query, and fragment.
 *  - Handles IPv6 addresses (they are preserved as-is inside square brackets).
 *  - Returns `null` for anything that cannot be parsed or that uses a non-http/https scheme.
 */
export function normalizeOrigin(input: string): string | null {
  if (!input || typeof input !== 'string') return null;

  let trimmed = input.trim();
  if (!trimmed) return null;

  // If the input looks like a bare origin (scheme://host or scheme://host:port)
  // without a path, the URL constructor still handles it.  However some callers
  // pass "https://example.com" without a trailing slash — that is fine.
  // The Referer header may include a full path, so we need to strip it.

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase(); // strip trailing ":"
  if (scheme !== 'http' && scheme !== 'https') return null;

  // Hostname is already lowercased by the URL constructor for normal hostnames.
  // For IPv6 addresses the URL constructor keeps them in brackets, e.g. "[::1]".
  const host = url.hostname.toLowerCase();
  if (!host) return null;

  // Determine the effective port.
  let port: number;
  if (url.port !== '') {
    port = Number(url.port);
  } else {
    port = DEFAULT_PORTS[scheme]!;
  }

  return `${scheme}://${host}:${port}`;
}

/**
 * The allow-list parsed once from AUTH_ALLOWED_ORIGINS at module load time.
 *
 * Each entry is a comma-separated origin string.  Entries that cannot be
 * normalized (invalid URL, unsupported scheme) are silently skipped.
 *
 * If the env var is absent or empty the set will be empty — the startup
 * validator in env.ts is responsible for rejecting that configuration before
 * the server binds a port (Req 9.7).
 */
export const allowedOrigins: ReadonlySet<string> = (() => {
  const raw = process.env.AUTH_ALLOWED_ORIGINS ?? '';
  const set = new Set<string>();
  for (const entry of raw.split(',')) {
    const normalized = normalizeOrigin(entry);
    if (normalized !== null) {
      set.add(normalized);
    }
  }
  return set;
})();

/**
 * Returns true when the given URL or origin string (from an `Origin` or
 * `Referer` header) matches one of the configured allowed origins.
 *
 * Comparison is on scheme + lowercase host + effective port only; path, query,
 * and fragment are ignored (Requirement 9.2).
 *
 * Returns false for any input that cannot be parsed as a valid http/https URL.
 */
export function matchesAllowList(headerUrl: string): boolean {
  const normalized = normalizeOrigin(headerUrl);
  if (normalized === null) return false;
  return allowedOrigins.has(normalized);
}

/**
 * Returns true when the HTTP method is state-changing:
 * POST, PUT, PATCH, or DELETE (case-insensitive).
 *
 * GET, HEAD, and OPTIONS are read-only and therefore exempt from origin
 * enforcement per Requirements 9.4 and 9.6.
 */
export function isStateChanging(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}
