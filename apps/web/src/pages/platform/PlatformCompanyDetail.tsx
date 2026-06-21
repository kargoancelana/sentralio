/**
 * PlatformCompanyDetail - detail satu company (portal Super Admin).
 *
 * Read-only: info company + daftar user (tanpa data sensitif spt password) dan
 * daftar toko Shopee. Reset password & aksi lain menyusul (Fase 2.3+).
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { platformFetch, PlatformApiError } from '../../lib/platformApi';
import { companyStatusBadge } from './companyStatus';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';

interface CompanyUser {
  id: number;
  name: string;
  email: string;
  username: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface CompanyShop {
  id: number;
  shopId: number;
  shopName: string | null;
  status: string;
  updatedAt: string;
}

interface CompanyDetail {
  id: number;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  users: CompanyUser[];
  shops: CompanyShop[];
}

interface CompanyDetailResponse {
  ok: boolean;
  company: CompanyDetail;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(isoOrTimestamp: string | number): string {
  const d = new Date(isoOrTimestamp);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function PlatformCompanyDetail() {
  const { id } = useParams();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Reset password states
  const [resettingUserId, setResettingUserId] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<{
    resetUrl: string;
    expiresAt: number;
    userName: string;
    email: string;
  } | null>(null);

  const toast = useToast();

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      setCompany(null);
      setError(null);
      setNotFound(false);
    });

    platformFetch<CompanyDetailResponse>(`/companies/${id}`)
      .then((res) => {
        if (active) setCompany(res.company);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof PlatformApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError('Gagal memuat detail company.');
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

  const handleResetPassword = async (u: CompanyUser) => {
    if (resettingUserId !== null) return;
    setResettingUserId(u.id);
    try {
      const res = await platformFetch<{ ok: boolean; resetUrl: string; expiresAt: number }>(
        `/companies/${id}/users/${u.id}/reset-password`,
        { method: 'POST' }
      );
      if (res.ok) {
        setResetResult({
          resetUrl: res.resetUrl,
          expiresAt: res.expiresAt,
          userName: u.name,
          email: u.email,
        });
      }
    } catch (err) {
      if (err instanceof PlatformApiError && err.status === 404) {
        toast('User tidak ditemukan.', 'error');
      } else {
        toast('Gagal membuat link reset.', 'error');
      }
    } finally {
      setResettingUserId(null);
    }
  };

  if (notFound) {
    return (
      <section className="platform-company-detail">
        <p className="platform-empty">Company tidak ditemukan.</p>
        <Link to="/platform/companies">&larr; Kembali ke daftar company</Link>
      </section>
    );
  }

  if (error) {
    return (
      <section className="platform-company-detail">
        <p className="platform-error">{error}</p>
        <Link to="/platform/companies">&larr; Kembali ke daftar company</Link>
      </section>
    );
  }

  if (company === null) {
    return <p className="platform-loading">Memuat...</p>;
  }

  const badge = companyStatusBadge(company.status);

  return (
    <section className="platform-company-detail">
      <Link to="/platform/companies">&larr; Kembali ke daftar company</Link>
      <header className="platform-company-detail__header">
        <h1>{company.name}</h1>
        <span className={badge.className}>{badge.label}</span>
      </header>
      <p className="platform-company-detail__meta">
        Slug: {company.slug} &middot; Dibuat: {formatDate(company.createdAt)}
      </p>

      <h2>User ({company.users.length})</h2>
      {company.users.length === 0 ? (
        <p className="platform-empty">Belum ada user.</p>
      ) : (
        <table className="platform-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Username</th>
              <th>Role</th>
              <th>Aktif</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {company.users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.username ?? '-'}</td>
                <td>{u.role}</td>
                <td>{u.isActive ? 'Ya' : 'Tidak'}</td>
                <td>{formatDate(u.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    disabled={resettingUserId === u.id}
                    onClick={() => handleResetPassword(u)}
                  >
                    {resettingUserId === u.id ? 'Memproses...' : 'Reset password'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Toko Shopee ({company.shops.length})</h2>
      {company.shops.length === 0 ? (
        <p className="platform-empty">Belum ada toko.</p>
      ) : (
        <table className="platform-table">
          <thead>
            <tr>
              <th>Shop ID</th>
              <th>Nama Toko</th>
              <th>Status</th>
              <th>Diperbarui</th>
            </tr>
          </thead>
          <tbody>
            {company.shops.map((s) => (
              <tr key={s.id}>
                <td>{s.shopId}</td>
                <td>{s.shopName ?? '-'}</td>
                <td>{s.status}</td>
                <td>{formatDate(s.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={resetResult !== null}
        onClose={() => setResetResult(null)}
        title="Reset Password"
        footer={
          <button className="btn btn-ghost btn-sm" onClick={() => setResetResult(null)}>
            Tutup
          </button>
        }
      >
        {resetResult && (
          <div>
            <p className="form-hint" style={{ color: 'var(--text1)', marginBottom: '12px' }}>
              Link reset password untuk <strong>{resetResult.userName}</strong> ({resetResult.email}):
            </p>
            <div className="form-group" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                readOnly
                value={resetResult.resetUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="form-input"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  navigator.clipboard.writeText(resetResult.resetUrl);
                  toast('Link reset password berhasil disalin.', 'success');
                }}
              >
                Salin link
              </button>
            </div>
            <p className="form-hint" style={{ color: 'var(--text2)', marginBottom: '8px' }}>
              Berlaku sampai: <strong>{formatDateTime(resetResult.expiresAt)}</strong>
            </p>
            <p className="form-hint" style={{ fontStyle: 'italic' }}>
              Catatan: Kasih link ini ke user. Berlaku 1 jam, sekali pakai.
            </p>
          </div>
        )}
      </Modal>
    </section>
  );
}
