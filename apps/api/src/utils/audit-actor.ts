/**
 * Resolve the actor label recorded in cost_audit_log.userId.
 *
 * The source of truth is the authenticated session user, which the global auth
 * middleware derives onto the request context as `ctx.user` (a PublicUser:
 * { id, email, name, role }). Every cost route (HPP, packing cost, master
 * packing cost) sits behind that middleware, so a valid `user` is present on a
 * successful request.
 *
 * Historically these routes read the editor from the `x-user-id` request header
 * and fell back to "system" when it was absent. The SPA never sent that header,
 * so every audit row was attributed to "system". Deriving from the session
 * fixes "who edited".
 *
 * We store a human-readable label (name -> email -> id) so the history UI shows
 * a real person instead of an opaque id. The header is kept only as a secondary
 * fallback for non-browser/service callers, and "system" remains the last
 * resort.
 */
export type AuditActor =
  | { id?: unknown; name?: unknown; email?: unknown }
  | null
  | undefined;

export function resolveAuditActor(
  user: AuditActor,
  headers?: Record<string, string | undefined>,
): string {
  if (user) {
    const name = typeof user.name === "string" ? user.name.trim() : "";
    if (name) return name;

    const email = typeof user.email === "string" ? user.email.trim() : "";
    if (email) return email;

    if (user.id !== null && user.id !== undefined) {
      const id = String(user.id).trim();
      if (id) return id;
    }
  }

  const headerId = headers?.["x-user-id"];
  if (headerId && headerId.trim().length > 0) return headerId.trim();

  return "system";
}
