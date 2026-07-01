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
  couponId: number | null;
  couponCode: string | null;
  discountAmount: number;
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

// ─── Platform Audit Types (Fase 6.2b) ────────────────────────────────────────

export type ActorType = 'platform' | 'company';

export interface AuditLogRow {
  id: number;
  actorType: ActorType;
  actorId: number;
  companyId: number | null;
  companyName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  beforeJson: string | null;
  afterJson: string | null;
  ip: string | null;
  createdAt: string; // ISO string
}

export interface AuditLogListResponse {
  ok: boolean;
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditActionsResponse {
  ok: boolean;
  actions: string[];
}

export interface AuditLogFilters {
  companyId?: number;
  action?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  page?: number;
  // pageSize removed - backend hardcodes to 50
}

// ─── Platform Audit API helpers ──────────────────────────────────────────────

export const platformAuditApi = {
  list: (filters?: AuditLogFilters) => {
    const params = new URLSearchParams();
    if (filters?.companyId) params.set('company_id', String(filters.companyId));
    if (filters?.action) params.set('action', filters.action);
    if (filters?.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters?.dateTo) params.set('date_to', filters.dateTo);
    if (filters?.page) params.set('page', String(filters.page));
    // pageSize param removed - backend doesn't read it (hardcoded to 50)
    
    const qs = params.toString();
    return platformFetch<AuditLogListResponse>(`/audit${qs ? `?${qs}` : ''}`);
  },
  actions: () => platformFetch<AuditActionsResponse>('/audit/actions'),
};
