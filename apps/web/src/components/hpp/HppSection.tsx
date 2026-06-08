import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit3, Trash2, ChevronRight, AlertCircle, Loader2, Copy } from 'lucide-react';
import { fetchApi } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HppVariant {
  id: number;
  name: string;
}

interface HppResolveResult {
  variantId: number;
  hppValue: number;
  entryId: number | null;
  source: 'active' | 'fallback' | 'default';
}

interface HppEntry {
  id: number;
  variantId: number;
  hppValue: number;
  startDate: string;
  endDate: string | null;
  note: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HppHistoryResponse {
  success: boolean;
  data: HppEntry[];
}

interface HppResolveResponse {
  success: boolean;
  data: HppResolveResult;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HppSectionProps {
  /** List of variants belonging to the master product */
  variants: HppVariant[];
  /** User ID for audit log (passed as x-user-id header on mutations) */
  userId?: string;
  /**
   * Called when the user clicks "Add" — receives the selected variantId.
   * Task 9.2 will provide the real form; use a callback prop for now.
   */
  onAddEntry?: (variantId: number) => void;
  /**
   * Called when the user clicks "Edit" on an entry.
   * Receives the entry to edit.
   */
  onEditEntry?: (entry: HppEntry) => void;
  /**
   * Called after a successful delete so the parent can refresh if needed.
   */
  onDeleted?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRp(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  // dateStr is YYYY-MM-DD
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLoading() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        color: 'var(--accent)',
      }}
    >
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}

interface SectionErrorProps {
  message: string;
  onRetry?: () => void;
}

function SectionError({ message, onRetry }: SectionErrorProps) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <AlertCircle size={24} style={{ color: 'var(--error, #DC2626)' }} />
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text2)' }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '6px 16px',
            background: 'var(--accent)',
            color: 'var(--accent-f, #fff)',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Coba Lagi
        </button>
      )}
    </div>
  );
}

// ─── Variant Row ──────────────────────────────────────────────────────────────

interface VariantRowProps {
  variant: HppVariant;
  hppValue: number | null;
  resolving: boolean;
  selected: boolean;
  onClick: () => void;
}

function VariantRow({ variant, hppValue, resolving, selected, onClick }: VariantRowProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '10px 14px',
        background: selected ? 'var(--accent-subtle, rgba(59,130,246,0.08))' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'background .12s',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = 'var(--bg3)';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: selected ? 600 : 400,
            color: 'var(--text1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {variant.name}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
          {resolving ? (
            <span style={{ color: 'var(--text4)' }}>Memuat...</span>
          ) : hppValue !== null ? (
            <span style={{ color: hppValue === 0 ? 'var(--text4)' : 'var(--text2)' }}>
              HPP: {formatRp(hppValue)}
            </span>
          ) : (
            <span style={{ color: 'var(--text4)' }}>HPP: —</span>
          )}
        </span>
      </div>
      <ChevronRight
        size={14}
        style={{
          color: selected ? 'var(--accent)' : 'var(--text4)',
          flexShrink: 0,
          transform: selected ? 'rotate(90deg)' : 'none',
          transition: 'transform .15s',
        }}
      />
    </button>
  );
}

// ─── Entry Table ──────────────────────────────────────────────────────────────

interface EntryTableProps {
  entries: HppEntry[];
  onEdit: (entry: HppEntry) => void;
  onDelete: (entry: HppEntry) => void;
  deletingId: number | null;
}

function EntryTable({ entries, onEdit, onDelete, deletingId }: EntryTableProps) {
  if (entries.length === 0) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text4)',
          fontSize: '13px',
        }}
      >
        Belum ada entry HPP untuk variasi ini.
      </div>
    );
  }

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
          <tr style={{ background: 'var(--bg2)' }}>
            {['Mulai', 'Selesai', 'Nilai HPP', 'Catatan', ''].map((h, i) => (
              <th
                key={i}
                style={{
                  padding: '8px 12px',
                  textAlign: i === 2 ? 'right' : 'left',
                  fontWeight: 600,
                  fontSize: '11px',
                  color: 'var(--text3)',
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  borderBottom: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isDeleting = deletingId === entry.id;
            return (
              <tr
                key={entry.id}
                style={{
                  opacity: isDeleting ? 0.5 : 1,
                  transition: 'opacity .15s',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <td style={{ padding: '9px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {formatDate(entry.startDate)}
                </td>
                <td style={{ padding: '9px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {entry.endDate ? formatDate(entry.endDate) : (
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        background: 'var(--bg3)',
                        borderRadius: '4px',
                        color: 'var(--text3)',
                      }}
                    >
                      Berlaku
                    </span>
                  )}
                </td>
                <td
                  style={{
                    padding: '9px 12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--text1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatRp(entry.hppValue)}
                </td>
                <td
                  style={{
                    padding: '9px 12px',
                    color: 'var(--text3)',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={entry.note ?? undefined}
                >
                  {entry.note || '—'}
                </td>
                <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => onEdit(entry)}
                      disabled={isDeleting}
                      aria-label={`Edit entry HPP mulai ${formatDate(entry.startDate)}`}
                      title="Edit"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: 'var(--text3)',
                        transition: 'background .12s, color .12s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg3)';
                        e.currentTarget.style.color = 'var(--text1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text3)';
                      }}
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => onDelete(entry)}
                      disabled={isDeleting}
                      aria-label={`Hapus entry HPP mulai ${formatDate(entry.startDate)}`}
                      title="Hapus"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: isDeleting ? 'var(--text4)' : '#DC2626',
                        transition: 'background .12s, color .12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isDeleting) {
                          e.currentTarget.style.background = '#FEF2F2';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

interface DeleteConfirmProps {
  entry: HppEntry;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function DeleteConfirm({ entry, onConfirm, onCancel, loading }: DeleteConfirmProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Konfirmasi hapus entry HPP"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '380px',
          width: '100%',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600, color: 'var(--text1)' }}>
          Hapus Entry HPP?
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
          Entry HPP <strong>{formatRp(entry.hppValue)}</strong> berlaku mulai{' '}
          <strong>{formatDate(entry.startDate)}</strong>
          {entry.endDate ? ` s/d ${formatDate(entry.endDate)}` : ''} akan dihapus secara permanen.
        </p>
        <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#DC2626' }}>
          Tindakan ini tidak dapat dibatalkan.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '7px 16px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '7px',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: 'var(--text2)',
            }}
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '7px 16px',
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: '7px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
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

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * HppSection — HPP management section for the master product edit modal.
 *
 * Requirements: 12.1, 12.2, 12.3
 *
 * - Displays all variants with their resolved HPP value as of today (Req 12.1)
 * - When a variant is selected, shows its HPP entry list sorted by start date desc (Req 12.2)
 * - Provides Add, Edit, and Delete controls per entry (Req 12.3)
 * - Handles loading and error states
 */
export function HppSection({
  variants,
  userId,
  onAddEntry,
  onEditEntry,
  onDeleted,
}: HppSectionProps) {
  const today = todayIso();

  // ── Resolved HPP values per variant ──
  const [resolvedMap, setResolvedMap] = useState<Record<number, number>>({});
  const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set());
  const [resolveErrors, setResolveErrors] = useState<Record<number, string>>({});

  // ── Selected variant & its entries ──
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    variants.length > 0 ? variants[0].id : null
  );
  const [entries, setEntries] = useState<HppEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  // ── Delete state ──
  const [deleteTarget, setDeleteTarget] = useState<HppEntry | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Resolve HPP for all variants on mount / when variants change ──
  useEffect(() => {
    if (variants.length === 0) return;

    const ids = variants.map((v) => v.id);
    setResolvingIds(new Set(ids));

    Promise.allSettled(
      ids.map((id) =>
        fetchApi<HppResolveResponse>(`/hpp/variants/${id}/resolve?date=${today}`)
          .then((res) => ({ id, value: res.data.hppValue }))
      )
    ).then((results) => {
      const newMap: Record<number, number> = {};
      const newErrors: Record<number, string> = {};

      results.forEach((result, idx) => {
        const id = ids[idx];
        if (result.status === 'fulfilled') {
          newMap[id] = result.value.value;
        } else {
          newErrors[id] = result.reason?.message || 'Gagal memuat HPP';
        }
      });

      setResolvedMap(newMap);
      setResolveErrors(newErrors);
      setResolvingIds(new Set());
    });
  }, [variants, today]);

  // ── Load entries for selected variant ──
  const loadEntries = useCallback(async (variantId: number) => {
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const res = await fetchApi<HppHistoryResponse>(
        `/hpp/variants/${variantId}/history`
      );
      // API returns sorted by start date desc; filter out deleted entries for the active list
      const active = (res.data || []).filter((e) => !e.deletedAt);
      setEntries(active);
    } catch (err: any) {
      setEntriesError(err.message || 'Gagal memuat riwayat HPP');
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVariantId !== null) {
      loadEntries(selectedVariantId);
    }
  }, [selectedVariantId, loadEntries]);

  // ── Handlers ──

  const handleSelectVariant = (id: number) => {
    setSelectedVariantId(id);
    setDeleteError(null);
  };

  const handleEdit = (entry: HppEntry) => {
    onEditEntry?.(entry);
  };

  const handleDeleteRequest = (entry: HppEntry) => {
    setDeleteTarget(entry);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError(null);

    try {
      await fetchApi(`/hpp/entries/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': userId } : {}),
        },
      });

      // Refresh entries and resolved value for the affected variant
      if (selectedVariantId !== null) {
        await loadEntries(selectedVariantId);

        // Re-resolve HPP for this variant
        try {
          const res = await fetchApi<HppResolveResponse>(
            `/hpp/variants/${selectedVariantId}/resolve?date=${today}`
          );
          setResolvedMap((prev) => ({ ...prev, [selectedVariantId]: res.data.hppValue }));
        } catch {
          // Non-critical — ignore resolve refresh error
        }
      }

      setDeleteTarget(null);
      onDeleted?.();
    } catch (err: any) {
      setDeleteError(err.message || 'Gagal menghapus entry HPP');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
    setDeleteError(null);
  };

  // ── Copy to all variants ──
  const [copyingToAll, setCopyingToAll] = useState(false);
  const [copyResult, setCopyResult] = useState<{ success: number; failed: number } | null>(null);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);

  const handleCopyToAll = useCallback(() => {
    if (!selectedVariantId || entries.length === 0 || variants.length <= 1) return;
    setCopyResult(null);
    setShowCopyConfirm(true);
  }, [selectedVariantId, entries.length, variants.length]);

  const executeCopyToAll = useCallback(async () => {
    if (!selectedVariantId || entries.length === 0 || variants.length <= 1) return;

    setShowCopyConfirm(false);
    setCopyingToAll(true);
    setCopyResult(null);

    const otherVariants = variants.filter((v) => v.id !== selectedVariantId);
    let success = 0;
    let failed = 0;

    for (const variant of otherVariants) {
      for (const entry of entries) {
        try {
          await fetchApi('/hpp/entries', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(userId ? { 'x-user-id': userId } : {}),
            },
            body: JSON.stringify({
              variantId: variant.id,
              hppValue: entry.hppValue,
              startDate: entry.startDate,
              endDate: entry.endDate,
              note: entry.note,
            }),
          });
          success++;
        } catch {
          // Entry with a duplicate/overlapping period — skip silently.
          failed++;
        }
      }
    }

    setCopyResult({ success, failed });
    setCopyingToAll(false);

    // Refresh resolved values for all variants
    const ids = variants.map((v) => v.id);
    Promise.allSettled(
      ids.map((id) =>
        fetchApi<HppResolveResponse>(`/hpp/variants/${id}/resolve?date=${today}`)
          .then((res) => ({ id, value: res.data.hppValue }))
      )
    ).then((results) => {
      const newMap: Record<number, number> = {};
      results.forEach((result, idx) => {
        const id = ids[idx];
        if (result.status === 'fulfilled') {
          newMap[id] = result.value.value;
        }
      });
      setResolvedMap((prev) => ({ ...prev, ...newMap }));
    });
  }, [selectedVariantId, entries, variants, userId, today]);

  // ── Render ──

  if (variants.length === 0) {
    return (
      <section aria-label="HPP Variasi">
        <SectionHeader />
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text4)',
            fontSize: '13px',
            background: 'var(--bg2)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          Tidak ada variasi untuk produk ini.
        </div>
      </section>
    );
  }

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? null;

  return (
    <section aria-label="HPP Variasi">
      <SectionHeader />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          background: 'var(--bg)',
        }}
      >
        {/* ── Left: Variant list ── */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
            maxHeight: '400px',
          }}
        >
          {variants.map((variant) => (
            <VariantRow
              key={variant.id}
              variant={variant}
              hppValue={resolvedMap[variant.id] ?? null}
              resolving={resolvingIds.has(variant.id)}
              selected={selectedVariantId === variant.id}
              onClick={() => handleSelectVariant(variant.id)}
            />
          ))}
        </div>

        {/* ── Right: Entry list for selected variant ── */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
          {/* Header row with Add button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg2)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text3)' }}>
              {selectedVariant ? selectedVariant.name : 'Pilih variasi'}
            </span>
            {selectedVariant && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {/* Copy to all variants button */}
                {entries.length > 0 && variants.length > 1 && (
                  <button
                    onClick={handleCopyToAll}
                    disabled={copyingToAll}
                    aria-label="Terapkan HPP ke semua variasi"
                    title="Terapkan HPP variasi ini ke semua variasi lainnya"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      background: 'transparent',
                      color: 'var(--text3)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: copyingToAll ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background .12s, color .12s, border-color .12s',
                      opacity: copyingToAll ? 0.6 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!copyingToAll) {
                        e.currentTarget.style.background = 'var(--bg3)';
                        e.currentTarget.style.color = 'var(--text1)';
                        e.currentTarget.style.borderColor = 'var(--text3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text3)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                  >
                    {copyingToAll ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                    {copyingToAll ? 'Menyalin...' : 'Ke Semua'}
                  </button>
                )}
                <button
                  onClick={() => onAddEntry?.(selectedVariant.id)}
                  aria-label={`Tambah entry HPP untuk ${selectedVariant.name}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 12px',
                    background: 'var(--accent)',
                    color: 'var(--accent-f, #fff)',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'opacity .15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  <Plus size={13} />
                  Tambah
                </button>
              </div>
            )}
          </div>

          {/* Error from delete */}
          {deleteError && (
            <div
              role="alert"
              style={{
                padding: '8px 14px',
                background: '#FEF2F2',
                borderBottom: '1px solid #FECACA',
                fontSize: '12px',
                color: '#991B1B',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertCircle size={13} />
              {deleteError}
            </div>
          )}

          {/* Copy result banner */}
          {copyResult && (
            <div
              role="status"
              style={{
                padding: '8px 14px',
                background: copyResult.failed > 0 ? '#FFFBEB' : '#F0FDF4',
                borderBottom: `1px solid ${copyResult.failed > 0 ? '#FDE68A' : '#BBF7D0'}`,
                fontSize: '12px',
                color: copyResult.failed > 0 ? '#92400E' : '#166534',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}
            >
              <span>
                ✓ {copyResult.success} entry berhasil disalin.
                {copyResult.failed > 0 && ` ${copyResult.failed} dilewati (duplikat).`}
              </span>
              <button
                onClick={() => setCopyResult(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '14px', padding: '0 4px' }}
              >
                ×
              </button>
            </div>
          )}

          {/* Resolve error for selected variant */}
          {selectedVariantId !== null && resolveErrors[selectedVariantId] && (
            <div
              role="alert"
              style={{
                padding: '8px 14px',
                background: '#FFFBEB',
                borderBottom: '1px solid #FDE68A',
                fontSize: '12px',
                color: '#92400E',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertCircle size={13} />
              {resolveErrors[selectedVariantId]}
            </div>
          )}

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {entriesLoading ? (
              <SectionLoading />
            ) : entriesError ? (
              <SectionError
                message={entriesError}
                onRetry={selectedVariantId !== null ? () => loadEntries(selectedVariantId) : undefined}
              />
            ) : (
              <EntryTable
                entries={entries}
                onEdit={handleEdit}
                onDelete={handleDeleteRequest}
                deletingId={deletingId}
              />
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteConfirm
          entry={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          loading={deletingId === deleteTarget.id}
        />
      )}

      {/* Copy-to-all confirmation dialog */}
      {showCopyConfirm && selectedVariant && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Konfirmasi salin HPP ke semua variasi"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowCopyConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600, color: 'var(--text1)' }}>
              Salin HPP ke Semua Variasi?
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
              {entries.length} entry HPP dari <strong>"{selectedVariant.name}"</strong> akan diterapkan ke{' '}
              <strong>{variants.length - 1} variasi lainnya</strong>.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>
              Entry yang sudah ada tidak akan ditimpa. Entry dengan periode yang <strong>duplikat</strong> akan
              dilewati otomatis.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowCopyConfirm(false)}
                style={{
                  padding: '7px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '7px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: 'var(--text2)',
                }}
              >
                Batal
              </button>
              <button
                onClick={executeCopyToAll}
                style={{
                  padding: '7px 16px',
                  background: 'var(--accent)',
                  color: 'var(--accent-f, #fff)',
                  border: 'none',
                  borderRadius: '7px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Copy size={13} />
                Salin ke Semua
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader() {
  return (
    <div style={{ marginBottom: '12px' }}>
      <h3
        style={{
          margin: '0 0 4px',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text1)',
        }}
      >
        HPP (Harga Pokok Penjualan)
      </h3>
      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
        Kelola HPP per variasi produk. Nilai yang ditampilkan adalah HPP aktif per hari ini.
      </p>
    </div>
  );
}
