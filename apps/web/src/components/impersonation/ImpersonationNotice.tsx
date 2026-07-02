/**
 * ImpersonationNotice — Alert untuk mode impersonation (Fase 7.2).
 *
 * Tampilkan warning notice bahwa user sedang dalam mode impersonation dan
 * beberapa aksi sensitif (ganti password, ubah langganan) dinonaktifkan.
 *
 * Komponen reusable untuk dipakai di halaman Change Password & Langganan.
 */

interface ImpersonationNoticeProps {
  /** Pesan custom opsional. Default: generic message. */
  message?: string;
}

export function ImpersonationNotice({ message }: ImpersonationNoticeProps) {
  const defaultMessage =
    'Mode Impersonation aktif. Beberapa aksi sensitif (ganti password & ubah langganan) dinonaktifkan untuk keamanan.';

  return (
    <div
      role="alert"
      style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#fefce8', // yellow-50
        border: '2px solid #facc15', // yellow-400
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: '#854d0e', // yellow-800
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <svg
          width={20}
          height={20}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
          style={{ flexShrink: 0, color: '#ca8a04' }} // yellow-600
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 500 }}>{message || defaultMessage}</p>
        </div>
      </div>
    </div>
  );
}
