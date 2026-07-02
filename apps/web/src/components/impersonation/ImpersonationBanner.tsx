/**
 * ImpersonationBanner (Fase 7.1) — banner peringatan saat Super Admin sedang
 * impersonate user. Muncul di atas semua halaman app (bukan portal).
 */

import { useAuth } from '../../context/AuthContext';

export function ImpersonationBanner() {
  const { state, stopImpersonation } = useAuth();

  if (state.status !== 'authenticated' || !state.user.impersonatorId) {
    return null;
  }

  return (
    <div className="impersonation-banner">
      <div className="impersonation-banner__content">
        <span className="impersonation-banner__icon">👁️</span>
        <span className="impersonation-banner__text">
          Super Admin sedang melihat akun ini sebagai <strong>{state.user.name}</strong>
        </span>
        <button
          type="button"
          className="impersonation-banner__btn"
          onClick={() => void stopImpersonation()}
        >
          Kembali ke Portal
        </button>
      </div>
    </div>
  );
}
