/**
 * System Status Route — endpoint publik untuk cek status maintenance.
 *
 *   GET /system/status -> { ok, maintenance: { level, message } }
 *
 * Tanpa autentikasi — dipakai frontend untuk:
 *  - Banner peringatan saat level='banner'
 *  - Halaman maintenance saat level='full'
 *  - Bahkan di layar login (sebelum user login)
 */

import { Elysia } from 'elysia';
import { getMaintenance } from '../platform/platform-settings.service';

export const systemStatusRoutes = new Elysia().get('/system/status', async ({ set }) => {
  set.status = 200;
  const maintenance = await getMaintenance();
  return { ok: true, maintenance };
});
