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

// ─── Platform Order Types (Fase 4.3b) ───────────────────────────────────────

export type PlatformOrderStatus = 'pending' | 'approved' | 'rejected';

export interface PlatformOrder {
  id: number;
  companyId: number;
  companyName: string | null;
  planId: number;
  planName: string | null;
  amount: number;
  proofKey: string | null;
  status: PlatformOrderStatus;
  note: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  createdAt: string;
}

// ─── Platform Order API helpers ──────────────────────────────────────────────

export const platformOrderApi = {
  list: (status?: PlatformOrderStatus) => {
    const qs = status ? `?status=${status}` : '';
    return platformFetch<{ ok: boolean; orders: PlatformOrder[] }>(`/orders${qs}`);
  },
  pendingCount: () =>
    platformFetch<{ ok: boolean; count: number }>('/orders/pending-count'),
  proofUrl: (id: number) =>
    platformFetch<{ ok: boolean; url: string }>(`/orders/${id}/proof-url`),
  approve: (id: number) =>
    platformFetch<{ ok: boolean; order: PlatformOrder }>(`/orders/${id}/approve`, { method: 'POST' }),
  reject: (id: number, note: string) =>
    platformFetch<{ ok: boolean; order: PlatformOrder }>(`/orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
};

// ─── Platform Settings Types (Fase 4.4b) ────────────────────────────────────

export interface PaymentInfo {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  instructions: string;
  supportContact: string;
  note: string;
}

export type MaintenanceLevel = 'off' | 'banner' | 'full';

export interface MaintenanceSetting {
  level: MaintenanceLevel;
  message: string;
}

export interface SystemSettings {
  paymentInfo: PaymentInfo;
  maintenance: MaintenanceSetting;
}

// ─── Platform Settings API helpers ───────────────────────────────────────────

export const platformSettingsApi = {
  get: () => platformFetch<{ ok: boolean; settings: SystemSettings }>('/settings'),
  update: (input: { paymentInfo?: PaymentInfo; maintenance?: MaintenanceSetting }) =>
    platformFetch<{ ok: boolean; settings: SystemSettings }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
