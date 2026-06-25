/**
 * PlatformPlans - manajemen paket langganan di portal Super Admin (/platform/plans).
 *
 * Fitur: list plan, tambah plan baru, edit plan (termasuk aktif/nonaktif).
 * TIDAK ada tombol hapus — plan cuma bisa dinonaktifin via isActive=false.
 */

import { useEffect, useState } from 'react';
import { platformFetch, PlatformApiError } from '../../lib/platformApi';

interface PlanItem {
  id: number;
  name: string;
  durationDays: number;
  price: number;
  maxShops: number;
  maxUsers: number;
  features: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PlansResponse {
  ok: boolean;
  plans: PlanItem[];
}

interface PlanResponse {
  ok: boolean;
  plan: PlanItem;
}

const emptyForm = {
  name: '',
  durationDays: '',
  price: '',
  maxShops: '1',
  maxUsers: '1',
  features: '',
  isActive: true,
};

type FormState = typeof emptyForm;

function formatRupiah(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

function planToForm(plan: PlanItem): FormState {
  return {
    name: plan.name,
    durationDays: String(plan.durationDays),
    price: String(plan.price),
    maxShops: String(plan.maxShops),
    maxUsers: String(plan.maxUsers),
    features: plan.features ? plan.features.join('\n') : '',
    isActive: plan.isActive,
  };
}

function formToPayload(form: FormState) {
  const features = form.features
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  return {
    name: form.name.trim(),
    durationDays: parseInt(form.durationDays, 10),
    price: parseInt(form.price, 10) || 0,
    maxShops: parseInt(form.maxShops, 10) || 1,
    maxUsers: parseInt(form.maxUsers, 10) || 1,
    features: features.length > 0 ? features : null,
    isActive: form.isActive,
  };
}

export function PlatformPlans() {
  const [plans, setPlans] = useState<PlanItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function fetchPlans() {
    return platformFetch<PlansResponse>('/plans')
      .then((res) => setPlans(res.plans))
      .catch(() => setLoadError('Gagal memuat daftar plan.'));
  }

  useEffect(() => {
    let active = true;
    platformFetch<PlansResponse>('/plans')
      .then((res) => { if (active) setPlans(res.plans); })
      .catch(() => { if (active) setLoadError('Gagal memuat daftar plan.'); });
    return () => { active = false; };
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setShowForm(true);
  }

  function openEdit(plan: PlanItem) {
    setEditingId(plan.id);
    setForm(planToForm(plan));
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
        await platformFetch<PlanResponse>(`/plans/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await platformFetch<PlanResponse>('/plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await fetchPlans();
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

  if (plans === null) {
    return <p className="platform-loading">Memuat...</p>;
  }

  return (
    <section className="platform-plans">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1>Plans</h1>
        {!showForm && (
          <button type="button" className="btn" onClick={openCreate}>
            + Tambah Plan
          </button>
        )}
      </div>

      {showForm && (
        <div className="platform-form-card" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
          <h2 style={{ marginTop: 0 }}>{editingId !== null ? 'Edit Plan' : 'Tambah Plan Baru'}</h2>
          {submitError && <p className="platform-error">{submitError}</p>}
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label>
                Nama Paket
                <input
                  type="text"
                  value={form.name}
                  maxLength={255}
                  required
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Durasi (hari)
                <input
                  type="number"
                  value={form.durationDays}
                  min={1}
                  required
                  onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Harga (Rp)
                <input
                  type="number"
                  value={form.price}
                  min={0}
                  required
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Max Toko
                <input
                  type="number"
                  value={form.maxShops}
                  min={1}
                  required
                  onChange={(e) => setForm({ ...form, maxShops: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Max User
                <input
                  type="number"
                  value={form.maxUsers}
                  min={1}
                  required
                  onChange={(e) => setForm({ ...form, maxUsers: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                Fitur (1 per baris, opsional)
                <textarea
                  value={form.features}
                  rows={4}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
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

      {plans.length === 0 ? (
        <p className="platform-empty">Belum ada plan. Klik "+ Tambah Plan" untuk membuat paket pertama.</p>
      ) : (
        <table className="platform-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Durasi</th>
              <th>Harga</th>
              <th>Max Toko</th>
              <th>Max User</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.name}</td>
                <td>{plan.durationDays} hari</td>
                <td>{formatRupiah(plan.price)}</td>
                <td>{plan.maxShops}</td>
                <td>{plan.maxUsers}</td>
                <td>
                  {plan.isActive ? (
                    <span className="badge badge--active">Aktif</span>
                  ) : (
                    <span className="badge badge--inactive">Nonaktif</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => openEdit(plan)}
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
