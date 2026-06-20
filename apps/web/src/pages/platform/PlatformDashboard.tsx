/**
 * PlatformDashboard - landing portal Super Admin (/platform).
 *
 * Konten placeholder untuk Fase 2.1. Modul manajemen (companies, plans,
 * subscriptions, dst) menyusul di fase berikutnya.
 */

import { usePlatformAuth } from '../../context/PlatformAuthContext';

export function PlatformDashboard() {
  const { state } = usePlatformAuth();
  const name = state.status === 'authenticated' ? state.admin.name : '';

  return (
    <section>
      <h1>Dashboard Platform</h1>
      <p>Selamat datang, {name}.</p>
      <p>Portal Super Admin siap. Modul manajemen menyusul di fase berikutnya.</p>
    </section>
  );
}
