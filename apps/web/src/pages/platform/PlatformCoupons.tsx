/**
 * PlatformCoupons - manajemen kupon diskon di portal Super Admin (/platform/coupons).
 *
 * Fitur: list kupon, tambah kupon baru, edit kupon (termasuk aktif/nonaktif).
 * TIDAK ada tombol hapus — kupon cuma bisa dinonaktifin via isActive=false.
 */

import { useEffect, useState } from 'react';
import { platformFetch, PlatformApiError } from '../../lib/platformApi';

interface CouponItem {
  id: number;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  maxUses: number | null;
  usedCount: number;
  validFrom: string | null;
  validUntil: string | null;
  planId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PlanItem {
  id: number;
  name: string;
  isActive: boolean;
}

interface CouponsResponse {
  ok: boolean;
  coupons: CouponItem[];
}

interface PlansResponse {
  ok: boolean;
  plans: PlanItem[];
}

interface CouponResponse {
  ok: boolean;
  coupon: CouponItem;
}

const emptyForm = {
  code: '',
  type: 'percent' as 'percent' | 'fixed',
  value: '',
  maxUses: '',
  validFrom: '',
  validUntil: '',
  planId: '',
  isActive: true,
};

type FormState = typeof emptyForm;

function formatRupiah(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

function formatDate(isoString: string | null): string {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
}

function couponToForm(coupon: CouponItem): FormState {
  return {
    code: coupon.code,
    type: coupon.type,
    value: String(coupon.value),
    maxUses: coupon.maxUses !== null ? String(coupon.maxUses) : '',
    validFrom: coupon.validFrom ? coupon.validFrom.substring(0, 10) : '',
    validUntil: coupon.validUntil ? coupon.validUntil.substring(0, 10) : '',
    planId: coupon.planId !== null ? String(coupon.planId) : '',
    isActive: coupon.isActive,
  };
}

function formToPayload(form: FormState) {
  return {
    code: form.code.trim(),
    type: form.type,
    value: parseInt(form.value, 10),
    maxUses: form.maxUses.trim() ? parseInt(form.maxUses, 10) : null,
    validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null,
    validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
    planId: form.planId ? parseInt(form.planId, 10) : null,
    isActive: form.isActive,
  };
}

export function PlatformCoupons() {
  const [coupons, setCoupons] = useState<CouponItem[] | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function fetchCoupons() {
    return platformFetch<CouponsResponse>('/coupons')
      .then((res) => setCoupons(res.coupons))
      .catch(() => setLoadError('Gagal memuat daftar kupon.'));
  }

  function fetchPlans() {
    return platformFetch<PlansResponse>('/plans')
      .then((res) => setPlans(res.plans))
      .catch(() => setPlans([]));
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      platformFetch<CouponsResponse>('/coupons'),
      platformFetch<PlansResponse>('/plans'),
    ])
      .then(([couponsRes, plansRes]) => {
        if (active) {
          setCoupons(couponsRes.coupons);
          setPlans(plansRes.plans);
        }
      })
      .catch(() => {
        if (active) setLoadError('Gagal memuat data.');
      });
    return () => { active = false; };
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setShowForm(true);
  }

  function openEdit(coupon: CouponItem) {
    setEditingId(coupon.id);
    setForm(couponToForm(coupon));
    setSubmitError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setSubmitError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const payload = formToPayload(form);

    try {
      if (editingId !== null) {
        await platformFetch<CouponResponse>(`/coupons/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await platformFetch<CouponResponse>('/coupons', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await fetchCoupons();
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      if (err instanceof PlatformApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Terjadi kesalahan. Silakan coba lagi.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <p className="platform-error">{loadError}</p>;
  }

  if (coupons === null) {
    return <p className="platform-loading">Memuat...</p>;
  }

  const getPlanName = (planId: number | null): string => {
    if (planId === null) return 'Semua Plan';
    const plan = plans.find((p) => p.id === planId);
    return plan ? plan.name : `Plan #${planId}`;
  };

  return (
    <section className="platform-coupons">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1>Coupons</h1>
        {!showForm && (
          <button type="button" className="btn" onClick={openCreate}>
            + Tambah Kupon
          </button>
        )}
      </div>

      {showForm && (
        <div className="platform-form-card" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
          <h2 style={{ marginTop: 0 }}>{editingId !== null ? 'Edit Kupon' : 'Tambah Kupon Baru'}</h2>
          {submitError && <p className="platform-error">{submitError}</p>}
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label>
                Kode Kupon
                <input
                  type="text"
                  value={form.code}
                  maxLength={64}
                  required
                  pattern="[A-Za-z0-9_-]+"
                  title="Hanya huruf, angka, underscore, dan dash"
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Tipe Diskon
                <select
                  value={form.type}
                  required
                  onChange={(e) => setForm({ ...form, type: e.target.value as 'percent' | 'fixed' })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                >
                  <option value="percent">Persen (%)</option>
                  <option value="fixed">Nominal Tetap (Rp)</option>
                </select>
              </label>
              <label>
                {form.type === 'percent' ? 'Nilai (%)' : 'Nilai (Rp)'}
                <input
                  type="number"
                  value={form.value}
                  min={1}
                  max={form.type === 'percent' ? 100 : undefined}
                  required
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Max Penggunaan (kosongkan = unlimited)
                <input
                  type="number"
                  value={form.maxUses}
                  min={1}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Berlaku Dari (kosongkan = tanpa batas bawah)
                <input
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Berlaku Sampai (kosongkan = tanpa kadaluarsa)
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Berlaku Untuk Plan
                <select
                  value={form.planId}
                  onChange={(e) => setForm({ ...form, planId: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                >
                  <option value="">Semua Plan</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Aktif
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button type="button" className="btn" onClick={cancelForm} disabled={submitting}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {coupons.length === 0 ? (
        <p className="platform-empty">Belum ada kupon. Klik "+ Tambah Kupon" untuk membuat kupon pertama.</p>
      ) : (
        <table className="platform-table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Tipe</th>
              <th>Nilai</th>
              <th>Max Uses</th>
              <th>Terpakai</th>
              <th>Plan</th>
              <th>Masa Berlaku</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.id}>
                <td><strong>{coupon.code}</strong></td>
                <td>{coupon.type === 'percent' ? 'Persen' : 'Nominal'}</td>
                <td>
                  {coupon.type === 'percent' ? `${coupon.value}%` : formatRupiah(coupon.value)}
                </td>
                <td>{coupon.maxUses ?? '-'}</td>
                <td>{coupon.usedCount}</td>
                <td>{getPlanName(coupon.planId)}</td>
                <td>
                  {coupon.validFrom || coupon.validUntil ? (
                    <>
                      {formatDate(coupon.validFrom)} – {formatDate(coupon.validUntil)}
                    </>
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  {coupon.isActive ? (
                    <span className="badge badge--active">Aktif</span>
                  ) : (
                    <span className="badge badge--inactive">Nonaktif</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => openEdit(coupon)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
