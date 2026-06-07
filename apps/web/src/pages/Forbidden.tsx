/**
 * Forbidden — 403 view rendered by RoleGate when the user's role is not
 * allowed to access the requested route.
 *
 * Requirement: 5.8
 */

/**
 * Renders a "403 - Akses ditolak" view without issuing any API requests.
 */
export function Forbidden() {
  return (
    <div
      role="alert"
      aria-label="403 - Akses ditolak"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 40px',
        textAlign: 'center',
        color: 'var(--text3)',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '12px', color: 'var(--text1)' }}>
        403 - Akses ditolak
      </h1>
      <p>Anda tidak memiliki akses ke halaman ini.</p>
    </div>
  );
}
