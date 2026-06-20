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

export function PlatformCompanyDetail() {
  const { id } = useParams();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setCompany(null);
    setError(null);
    setNotFound(false);

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
    </section>
  );
}
