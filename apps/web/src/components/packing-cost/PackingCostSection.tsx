import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, AlertCircle, RefreshCw, Lock } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { useApi, useApiMutation } from '../../hooks/useApi';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { Button } from '../ui/Button';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackingCostEntry {
  id: number;
  productGroupId: number;
  packingCost: number;
  startDate: string;   // YYYY-MM-DD
  endDate: string | null;
  note: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PackingCostHistoryResponse {
  success: boolean;
  data: PackingCostEntry[];
}

export interface PackingCostSectionProps {
  /** The product_groups.id for the channel product being managed */
  productGroupId: number;
  /** Optional user ID passed as x-user-id header for delete operations */
  userId?: string;
  /** Called when the Add button is clicked — receives undefined for new entry */
  onAdd?: () => void;
  /** Called when the Edit button is clicked — receives the entry to edit */
  onEdit?: (entry: PackingCostEntry) => void;
  /**
   * When true, hides all mutating controls (Tambah/Edit/Hapus) and shows a
   * persistent read-only banner. Historical entries are still rendered.
   * Requirements: 22.1, 22.2, 22.3, 22.4
   */
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRp(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  // dateStr is YYYY-MM-DD; display as DD/MM/YYYY
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PackingCostSection — displays and manages Entry_Biaya_Packing records
 * for a given channel product (product_groups row).
 *
 * - Fetches history from GET /packing-cost/product-groups/:groupId/history
 * - Entries are sorted by startDate descending (server-side per Requirement 9.1)
 * - Provides Add, Edit, and Delete controls (Requirements 13.1, 13.2, 13.3)
 * - Delete calls DELETE /packing-cost/entries/:id with x-user-id header
 * - Add/Edit delegate to parent via onAdd/onEdit callbacks (form is task 10.2)
 * - Handles loading and error states
 *
 * Requirements: 13.1, 13.2, 13.3
 */
export function PackingCostSection({
  productGroupId,
  userId,
  onAdd,
  onEdit,
  readOnly = false,
}: PackingCostSectionProps) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Fetch history ──────────────────────────────────────────────────────────
  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<PackingCostHistoryResponse>(
    () => fetchApi(`/packing-cost/product-groups/${productGroupId}/history`),
    [productGroupId],
    `packing-cost-history-${productGroupId}`,
  );

  // ── Delete mutation ────────────────────────────────────────────────────────
  const { execute: deleteEntry, loading: deleteLoading } = useApiMutation(
    (id: number) =>
      fetchApi(`/packing-cost/entries/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': userId } : {}),
        },
      }),
  );

  const handleDelete = useCallback(
    async (entry: PackingCostEntry) => {
      const confirmed = window.confirm(
        `Hapus entry biaya packing mulai ${formatDate(entry.startDate)}` +
          (entry.endDate ? ` s/d ${formatDate(entry.endDate)}` : '') +
          ` (${formatRp(entry.packingCost)})?`,
      );
      if (!confirmed) return;

      setDeleteError(null);
      setDeletingId(entry.id);
      const result = await deleteEntry(entry.id);
      setDeletingId(null);

      if (result !== null) {
        // Success — refresh the list
        refetch();
      } else {
        setDeleteError('Gagal menghapus entry. Silakan coba lagi.');
      }
    },
    [deleteEntry, refetch],
  );

  // ── Active entries only (soft-deleted are excluded from the list view) ─────
  const entries: PackingCostEntry[] = (data?.data ?? []).filter(
    (e) => e.deletedAt === null,
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section aria-label="Biaya Packing">
      {/* Read-only banner — shown when section is managed by Master Produk */}
      {readOnly && (
        <div
          role="note"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            marginBottom: '12px',
            background: 'var(--bg3, #f3f4f6)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '13px',
            color: 'var(--text2)',
          }}
        >
          <Lock size={14} style={{ flexShrink: 0, color: 'var(--text3)' }} />
          <span>Biaya packing sekarang dikelola di Master Produk</span>
        </div>
      )}

      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          gap: '8px',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text1)',
          }}
        >
          Biaya Packing
        </h3>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Refresh button — always visible */}
          <button
            onClick={() => refetch()}
            title="Refresh data biaya packing"
            aria-label="Refresh data biaya packing"
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--text3)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'background .12s, color .12s',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'var(--bg3)';
                e.currentTarget.style.color = 'var(--text1)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text3)';
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>

          {/* Add button — hidden in read-only mode */}
          {!readOnly && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={onAdd}
              aria-label="Tambah entry biaya packing"
            >
              Tambah
            </Button>
          )}
        </div>
      </div>

      {/* Delete error banner — hidden in read-only mode */}
      {!readOnly && deleteError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            marginBottom: '12px',
            background: 'var(--error-bg, #fff0f0)',
            border: '1px solid var(--error, #e53e3e)',
            borderRadius: '8px',
            fontSize: '13px',
            color: 'var(--error, #e53e3e)',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{deleteError}</span>
          <button
            onClick={() => setDeleteError(null)}
            aria-label="Tutup pesan error"
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              fontSize: '16px',
              lineHeight: 1,
              padding: '0 2px',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Content area */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          background: 'var(--bg)',
        }}
      >
        {loading && <LoadingSpinner size={20} />}

        {!loading && error && (
          <ErrorCard message={error} onRetry={refetch} />
        )}

        {!loading && !error && entries.length === 0 && (
          <EmptyEntries onAdd={readOnly ? undefined : onAdd} />
        )}

        {!loading && !error && entries.length > 0 && (
          <EntriesTable
            entries={entries}
            deletingId={deletingId}
            deleteLoading={deleteLoading}
            onEdit={readOnly ? undefined : onEdit}
            onDelete={handleDelete}
            readOnly={readOnly}
          />
        )}
      </div>
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ErrorCardProps {
  message: string;
  onRetry: () => void;
}

function ErrorCard({ message, onRetry }: ErrorCardProps) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        padding: '32px 24px',
        textAlign: 'center',
      }}
    >
      <AlertCircle size={32} style={{ color: 'var(--error, #e53e3e)' }} />
      <p
        style={{
          margin: 0,
          fontSize: '13px',
          color: 'var(--text2)',
          lineHeight: 1.5,
          maxWidth: '360px',
        }}
      >
        {message}
      </p>
      <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={onRetry}>
        Coba Lagi
      </Button>
    </div>
  );
}

interface EmptyEntriesProps {
  onAdd?: () => void;
}

function EmptyEntries({ onAdd }: EmptyEntriesProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        padding: '40px 24px',
        textAlign: 'center',
        color: 'var(--text4)',
        fontSize: '13px',
      }}
    >
      <p style={{ margin: 0 }}>Belum ada data biaya packing untuk produk ini.</p>
      {onAdd && (
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={onAdd}
        >
          Tambah Entry Pertama
        </Button>
      )}
    </div>
  );
}

interface EntriesTableProps {
  entries: PackingCostEntry[];
  deletingId: number | null;
  deleteLoading: boolean;
  onEdit?: (entry: PackingCostEntry) => void;
  onDelete: (entry: PackingCostEntry) => void;
  readOnly?: boolean;
}

function EntriesTable({
  entries,
  deletingId,
  deleteLoading,
  onEdit,
  onDelete,
  readOnly = false,
}: EntriesTableProps) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
        }}
      >
        <thead>
          <tr
            style={{
              background: 'var(--bg2)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <Th>Mulai</Th>
            <Th>Selesai</Th>
            <Th align="right">Nilai</Th>
            <Th>Catatan</Th>
            {!readOnly && <Th align="center">Aksi</Th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, idx) => (
            <tr
              key={entry.id}
              style={{
                borderBottom:
                  idx < entries.length - 1 ? '1px solid var(--border)' : 'none',
                background: 'var(--bg)',
                transition: 'background .1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg)';
              }}
            >
              <Td>{formatDate(entry.startDate)}</Td>
              <Td>
                {entry.endDate ? (
                  formatDate(entry.endDate)
                ) : (
                  <span style={{ color: 'var(--text4)', fontStyle: 'italic' }}>
                    Sekarang
                  </span>
                )}
              </Td>
              <Td align="right">
                <span style={{ fontWeight: 500, color: 'var(--text1)' }}>
                  {formatRp(entry.packingCost)}
                </span>
              </Td>
              <Td>
                {entry.note ? (
                  <span
                    title={entry.note}
                    style={{
                      display: 'block',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--text3)',
                    }}
                  >
                    {entry.note}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text4)' }}>—</span>
                )}
              </Td>
              {/* Action column — hidden in read-only mode (Req 22.2) */}
              {!readOnly && (
                <Td align="center">
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: '6px',
                      alignItems: 'center',
                    }}
                  >
                    {/* Edit button */}
                    <ActionButton
                      onClick={() => onEdit?.(entry)}
                      title="Edit entry"
                      aria-label={`Edit entry biaya packing mulai ${formatDate(entry.startDate)}`}
                      disabled={deleteLoading}
                    >
                      <Pencil size={13} />
                    </ActionButton>

                    {/* Delete button */}
                    <ActionButton
                      onClick={() => onDelete(entry)}
                      title="Hapus entry"
                      aria-label={`Hapus entry biaya packing mulai ${formatDate(entry.startDate)}`}
                      disabled={deleteLoading}
                      loading={deletingId === entry.id}
                      danger
                    >
                      <Trash2 size={13} />
                    </ActionButton>
                  </div>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tiny table primitives ────────────────────────────────────────────────────

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      style={{
        padding: '8px 12px',
        textAlign: align,
        fontWeight: 600,
        color: 'var(--text2)',
        fontSize: '12px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      style={{
        padding: '10px 12px',
        textAlign: align,
        color: 'var(--text2)',
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}

interface ActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  danger?: boolean;
}

function ActionButton({
  children,
  loading = false,
  danger = false,
  disabled,
  ...props
}: ActionButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        border: '1px solid var(--border)',
        borderRadius: '6px',
        background: 'transparent',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        color: danger ? 'var(--error, #e53e3e)' : 'var(--text3)',
        opacity: disabled && !loading ? 0.5 : 1,
        transition: 'background .12s, color .12s, border-color .12s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = danger
            ? 'var(--error-bg, #fff0f0)'
            : 'var(--bg3)';
          e.currentTarget.style.borderColor = danger
            ? 'var(--error, #e53e3e)'
            : 'var(--border-hover, var(--border))';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
      {...props}
    >
      {loading ? (
        <span
          style={{
            width: 13,
            height: 13,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin .6s linear infinite',
          }}
        />
      ) : (
        children
      )}
    </button>
  );
}
