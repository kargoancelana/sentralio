/**
 * PlatformCompanies - daftar semua company (portal Super Admin /platform/companies).
 *
 * Tabel read-only: nama, slug, status, jumlah user, jumlah toko aktif, tanggal
 * dibuat. Klik nama -> detail company. Info langganan menyusul (Fase 3).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { platformFetch } from '../../lib/platformApi';
import { companyStatusBadge } from './companyStatus';

interface CompanyListItem {
  id: number;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  userCount: number;
  activeShopCount: number;
}

interface CompaniesResponse {
  ok: boolean;
  companies: CompanyListItem[];
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

export function PlatformCompanies() {
  const [companies, setCompanies] = useState<CompanyListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    platformFetch<CompaniesResponse>('/companies')
      .then((res) => {
        if (active) setCompanies(res.companies);
      })
      .catch(() => {
        if (active) setError('Gagal memuat daftar company.');
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <p className="platform-error">{error}</p>;
  }

  if (companies === null) {
    return <p className="platform-loading">Memuat...</p>;
  }

  return (
    <section className="platform-companies">
      <h1>Companies</h1>
      {companies.length === 0 ? (
        <p className="platform-empty">Belum ada company.</p>
      ) : (
        <table className="platform-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Slug</th>
              <th>Status</th>
              <th>User</th>
              <th>Toko aktif</th>
              <th>Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const badge = companyStatusBadge(c.status);
              return (
                <tr key={c.id}>
                  <td>
                    <Link to={`/platform/companies/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>{c.slug}</td>
                  <td>
                    <span className={badge.className}>{badge.label}</span>
                  </td>
                  <td>{c.userCount}</td>
                  <td>{c.activeShopCount}</td>
                  <td>{formatDate(c.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
