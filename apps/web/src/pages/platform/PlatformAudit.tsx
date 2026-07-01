/**
 * PlatformAudit — halaman Audit Log Viewer untuk Super Admin (Fase 6.2).
 *
 * Fitur:
 * - Filter: Company, Action, Date Range
 * - Pagination (50 rows/page)
 * - Modal: View Before/After JSON
 */

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import {
  platformAuditApi,
  type AuditLogRow,
  type AuditLogFilters,
  PlatformApiError,
} from '../../lib/platformApi';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function actorBadgeClass(actorType: 'platform' | 'company'): string {
  return actorType === 'platform' ? 'badge badge--active' : 'badge badge--pending';
}

export function PlatformAudit() {
  const toast = useToast();

  // Filter states
  const [companyId, setCompanyId] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Data states
  const [rows, setRows] = useState<AuditLogRow[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(50);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Actions dropdown
  const [actions, setActions] = useState<string[]>([]);

  // Detail modal
  const [detailRow, setDetailRow] = useState<AuditLogRow | null>(null);

  // Fetch actions for dropdown
  useEffect(() => {
    async function loadActions() {
      try {
        const res = await platformAuditApi.actions();
        setActions(res.actions);
      } catch {
        // Silent fail, not critical
      }
    }
    void loadActions();
  }, []);

  const fetchAuditLogs = useCallback(
    async (filters: AuditLogFilters) => {
      setRows(null);
      setLoadError(null);
      try {
        const res = await platformAuditApi.list(filters);
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
      } catch (err) {
        if (err instanceof PlatformApiError) {
          setLoadError(err.message);
        } else {
          setLoadError('Gagal memuat audit log.');
        }
      }
    },
    []
  );

  useEffect(() => {
    const filters: AuditLogFilters = {
      page,
      pageSize,
    };
    if (companyId) filters.companyId = parseInt(companyId, 10);
    if (action) filters.action = action;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    void fetchAuditLogs(filters);
  }, [page, pageSize, companyId, action, dateFrom, dateTo, fetchAuditLogs]);

  function handleApplyFilter() {
    setPage(1); // Reset to page 1 when filter changes
  }

  function handleResetFilter() {
    setCompanyId('');
    setAction('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  function handleOpenDetail(row: AuditLogRow) {
    setDetailRow(row);
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="platform-page">
      <div className="platform-page__header">
        <h1>Audit Log</h1>
        <p className="platform-page__desc">
          Riwayat seluruh aksi platform & company (read-only)
        </p>
      </div>

      {/* Filter Section */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label className="form-label">Company ID</label>
            <input
              type="number"
              className="form-input"
              placeholder="Contoh: 5"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Action</label>
            <select
              className="form-input"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">Semua Action</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Date From</label>
            <input
              type="date"
              className="form-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Date To</label>
            <input
              type="date"
              className="form-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn--primary" onClick={handleApplyFilter}>
            Apply Filter
          </button>
          <button className="btn btn--outline" onClick={handleResetFilter}>
            Reset
          </button>
        </div>
      </div>

      {/* Results */}
      {loadError && (
        <div className="alert alert--error" style={{ marginBottom: '1rem' }}>
          {loadError}
        </div>
      )}

      {rows === null && !loadError && (
        <div className="card">
          <p style={{ textAlign: 'center', color: '#666' }}>Memuat...</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <p style={{ textAlign: 'center', color: '#666' }}>Tidak ada audit log ditemukan.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Actor</th>
                    <th>Company</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>IP</th>
                    <th>Created At</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>
                        <span className={actorBadgeClass(row.actorType)}>
                          {row.actorType}
                        </span>
                        <br />
                        <small style={{ color: '#666' }}>ID: {row.actorId}</small>
                      </td>
                      <td>
                        {row.companyId ? (
                          <>
                            {row.companyName || `Company #${row.companyId}`}
                            <br />
                            <small style={{ color: '#666' }}>ID: {row.companyId}</small>
                          </>
                        ) : (
                          <span style={{ color: '#999' }}>Global</span>
                        )}
                      </td>
                      <td>
                        <code style={{ fontSize: '0.85em' }}>{row.action}</code>
                      </td>
                      <td>
                        <small style={{ color: '#666' }}>
                          {row.targetType}
                          <br />#{row.targetId}
                        </small>
                      </td>
                      <td>
                        <small style={{ color: '#666' }}>{row.ip || '-'}</small>
                      </td>
                      <td>
                        <small>{formatDateTime(row.createdAt)}</small>
                      </td>
                      <td>
                        <button
                          className="btn btn--sm btn--outline"
                          onClick={() => handleOpenDetail(row)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: '#666', fontSize: '0.9em' }}>
              Showing {rows.length} of {total} total records (Page {page} of {totalPages})
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn--sm btn--outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="btn btn--sm btn--outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail Modal */}
      {detailRow && (
        <Modal open={true} onClose={() => setDetailRow(null)} title="Audit Log Detail">
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <table className="table" style={{ marginBottom: '1rem' }}>
              <tbody>
                <tr>
                  <td><strong>ID</strong></td>
                  <td>{detailRow.id}</td>
                </tr>
                <tr>
                  <td><strong>Actor Type</strong></td>
                  <td>
                    <span className={actorBadgeClass(detailRow.actorType)}>
                      {detailRow.actorType}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td><strong>Actor ID</strong></td>
                  <td>{detailRow.actorId}</td>
                </tr>
                <tr>
                  <td><strong>Company</strong></td>
                  <td>
                    {detailRow.companyId
                      ? `${detailRow.companyName || `Company #${detailRow.companyId}`} (ID: ${detailRow.companyId})`
                      : 'Global'}
                  </td>
                </tr>
                <tr>
                  <td><strong>Action</strong></td>
                  <td><code>{detailRow.action}</code></td>
                </tr>
                <tr>
                  <td><strong>Target Type</strong></td>
                  <td>{detailRow.targetType}</td>
                </tr>
                <tr>
                  <td><strong>Target ID</strong></td>
                  <td>{detailRow.targetId}</td>
                </tr>
                <tr>
                  <td><strong>IP</strong></td>
                  <td>{detailRow.ip || '-'}</td>
                </tr>
                <tr>
                  <td><strong>Created At</strong></td>
                  <td>{formatDateTime(detailRow.createdAt)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Before JSON</h3>
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: '1rem',
                  borderRadius: '4px',
                  fontSize: '0.85em',
                  overflow: 'auto',
                  maxHeight: '200px',
                }}
              >
                {detailRow.beforeJson
                  ? JSON.stringify(JSON.parse(detailRow.beforeJson), null, 2)
                  : '(null)'}
              </pre>
            </div>

            <div>
              <h3 style={{ marginBottom: '0.5rem' }}>After JSON</h3>
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: '1rem',
                  borderRadius: '4px',
                  fontSize: '0.85em',
                  overflow: 'auto',
                  maxHeight: '200px',
                }}
              >
                {detailRow.afterJson
                  ? JSON.stringify(JSON.parse(detailRow.afterJson), null, 2)
                  : '(null)'}
              </pre>
            </div>
          </div>
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn--outline" onClick={() => setDetailRow(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
