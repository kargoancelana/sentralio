/**
 * platformApi - fetch helper khusus portal Super Admin (/api/platform/*).
 *
 * Sama perilakunya dengan platformFetch di PlatformAuthContext: TIDAK pernah
 * men-dispatch event tenant 'wms.session-expired', jadi aman dari interferensi
 * sesi tenant. Dipakai halaman portal (companies, dst) di luar context auth.
 */

/** Error yang dilempar platformFetch saat respons non-OK. */
export class PlatformApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PlatformApiError';
    this.status = status;
  }
}

export async function platformFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/platform${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : `Request failed (${res.status})`;
    throw new PlatformApiError(res.status, message);
  }

  return data as T;
}
