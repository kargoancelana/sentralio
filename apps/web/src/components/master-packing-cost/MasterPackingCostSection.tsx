import { useState, useCallback } from 'react';
import { Plus, AlertCircle, Loader2 } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { MasterPackingCostForm, type MasterPackingCostEntry } from './MasterPackingCostForm';
import {
  MasterPackingCostHistory,
  type MasterPackingCostHistoryEntry,
} from './MasterPackingCostHistory';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MasterPackingCostSectionProps {
  /** master_products.id this section belongs to */
  masterProductId: number;
  /** User ID for audit log (passed as x-user-id header on mutations) */
  userId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRp(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * MasterPackingCostSection — Pengaturan Packing Cost section for the master product
 * edit modal. Mirrors the layout of HppSection.
 *
 * - Header "Pengaturan Packing Cost" + "Tambah Entry" button
 * - Opens MasterPackingCostForm modal on button click
 * - Renders MasterPackingCostHistory below the header
 * - Refreshes history after a successful form submit
 * - Owns the delete flow (confirmation dialog + DELETE request) so the
 *   history component can stay a presentation component
 */
export function MasterPackingCostSection({
  masterProductId,
  userId,
}: MasterPackingCostSectionProps) {
  // ── Form visibility ──
  const [showForm, setShowForm] = useState(false);

  // ── History refresh key — increment to force MasterPackingCostHistory to re-fetch ──
  const [historyKey, setHistoryKey] = useState(0);

  // ── Delete flow state ──
  const [deleteTarget, setDeleteTarget] = useState<MasterPackingCostHistoryEntry | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Form handlers ──

  const handleAddClick = useCallback(() => {
    setShowForm(true);
  }, []);

  const handleFormSuccess = useCallback((_entry: MasterPackingCostEntry) => {
    setShowForm(false);
    // Increment key to trigger history refresh
    setHistoryKey((k) => k + 1);
  }, []);

  const handleFormCancel = useCallback(() => {
    setShowForm(false);
  }, []);

  // ── Delete handlers ──

  const handleDeleteRequest = useCallback((entry: MasterPackingCostHistoryEntry) => {
    setDeleteTarget(entry);
    setDeleteError(null);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError(null);

    try {
      await fetchApi(`/master-packing-cost/entries/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': userId } : {}),
        },
      });
      // Success — close the dialog and force history refetch so the row
      // flips from active → soft-deleted in the UI.
      setDeleteTarget(null);
      setHistoryKey((k) => k + 1);
    } catch (err: any) {
      // Surface the API-side message to the user instead of swallowing it.
      // Common cases: entry already deleted (404), not-authorised (401),
      // server error (500).
      setDeleteError(err?.message ?? 'Gagal menghapus entry biaya packing');
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, userId]);

  // ── Render ──

  return (
    <section aria-label="Pengaturan Packing Cost">
      {/* ── Section header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          gap: '12px',
        }}
      >
        <div>
          <h3
            style={{
              margin: '0 0 2px',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text1)',
            }}
          >
            Pengaturan Packing Cost
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
            Kelola biaya packing untuk master produk ini.
          </p>
        </div>

        <button
          onClick={handleAddClick}
          aria-label="Tambah entry biaya packing"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '7px 14px',
            background: 'var(--accent)',
            color: 'var(--accent-f, #fff)',
            border: 'none',
            borderRadius: '7px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
            transition: 'opacity .15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.85';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          <Plus size={14} />
          Tambah Entry
        </button>
      </div>

      {/* ── Delete error banner — surfaced when a delete attempt fails ── */}
      {deleteError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '8px 12px',
            marginBottom: '12px',
            background: 'var(--error-bg, #fff0f0)',
            border: '1px solid var(--error, #dc2626)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--error, #dc2626)',
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{deleteError}</span>
        </div>
      )}

      {/* ── History (with delete controls) ── */}
      <MasterPackingCostHistory
        key={historyKey}
        masterProductId={masterProductId}
        onDelete={handleDeleteRequest}
        deletingId={deletingId}
      />

      {/* ── Form modal ── */}
      {showForm && (
        <MasterPackingCostForm
          masterProductId={masterProductId}
          userId={userId}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      )}

      {/* ── Delete confirmation dialog ── */}
      {deleteTarget && (
        <DeleteConfirm
          entry={deleteTarget}
          loading={deletingId === deleteTarget.id}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </section>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

interface DeleteConfirmProps {
  entry: MasterPackingCostHistoryEntry;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * DeleteConfirm — modal dialog asking the user to confirm a soft-delete.
 * Mirrors the same flow as HppSection so the experience is consistent.
 *
 * Note: backend performs a soft delete (sets `deletedAt`). The data is not
 * physically removed; the entry just flips to the "Dihapus" badge in history.
 */
function DeleteConfirm({ entry, loading, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Konfirmasi hapus entry biaya packing"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={(e) => {
        // Click on the backdrop closes the dialog (but never while a delete
        // is mid-flight — we don't want to leave the user wondering if it
        // succeeded).
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '20px 22px',
          maxWidth: '400px',
          width: '100%',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600, color: 'var(--text1)' }}>
          Hapus Entry Biaya Packing?
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
          Entry <strong>{formatRp(entry.packingCost)}</strong> berlaku mulai{' '}
          <strong>{formatDate(entry.startDate)}</strong>
          {entry.endDate ? ` s/d ${formatDate(entry.endDate)}` : ''} akan ditandai sebagai dihapus.
        </p>
        <p style={{ margin: '0 0 20px', fontSize: '12px', color: 'var(--text3)' }}>
          Entry yang dihapus tetap tampil di riwayat dengan badge <em>Dihapus</em>.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '7px 14px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--text2)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              background: 'var(--error, #dc2626)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {loading ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}
