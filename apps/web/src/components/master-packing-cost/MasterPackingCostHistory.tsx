import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, RefreshCw, Clock, Trash2, Loader2 } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { Button } from '../ui/Button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: number;
  action: string;
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  userId: string;
  createdAt: string;
}

export interface MasterPackingCostHistoryEntry {
  id: number;
  masterProductId: number;
  packingCost: number;
  startDate: string;        // YYYY-MM-DD
  endDate: string | null;
  note: string | null;
  autoClosedBy: number | null;
  deletedAt: string | null; // null = active, non-null = soft-deleted
  createdAt: string;
  updatedAt: string;
  auditLogs: AuditLogEntry[];
}

interface MasterPackingCostHistoryResponse {
  success: boolean;
  data: MasterPackingCostHistoryEntry[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MasterPackingCostHistoryProps {
  /** master_products.id to load history for */
  masterProductId: number;
  /**
   * Optional delete handler. When provided, an active entry exposes a Trash
   * icon button that invokes this callback. The parent owns the confirmation
   * dialog + the actual DELETE request, mirroring HppSection's pattern.
   *
   * If omitted, the row is read-only (no delete UI).
   */
  onDelete?: (entry: MasterPackingCostHistoryEntry) => void;
  /**
   * Entry id currently being deleted. Used to render a spinner on the
   * specific row while the parent's delete request is in flight.
   */
  deletingId?: number | null;
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

function formatDateTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case 'insert': return 'Dibuat';
    case 'update': return 'Diubah';
    case 'delete': return 'Dihapus';
    default: return action;
  }
}

function actionColor(action: string): string {
  switch (action) {
    case 'insert': return 'var(--success, #16a34a)';
    case 'update': return 'var(--accent, #2563eb)';
    case 'delete': return 'var(--error, #dc2626)';
    default: return 'var(--text3)';
  }
}

function actionBg(action: string): string {
  switch (action) {
    case 'insert': return 'var(--success-bg, #f0fdf4)';
    case 'update': return 'var(--accent-subtle, rgba(37,99,235,0.08))';
    case 'delete': return 'var(--error-bg, #fff0f0)';
    default: return 'var(--bg3)';
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * MasterPackingCostHistory — displays the full history of master_packing_cost_entries
 * for a given master product, including audit log entries per entry.
 *
 * - Fetches from GET /master-packing-cost/master-products/:masterProductId/history
 * - Shows all entries (active and soft-deleted), sorted by start date desc (Req 9.4)
 * - Each entry shows: ID, value, start/end dates, note, active/deleted badge (Req 20.3)
 * - Each entry has an expandable/collapsible audit log section
 * - Empty state when no history exists (Req 20.8)
 * - Error state with retry option (Req 20.5)
 * - No emoji characters (Req 20.5)
 *
 * Requirements: 14.4, 20.3, 20.5, 20.8
 */
export function MasterPackingCostHistory({ masterProductId, onDelete, deletingId }: MasterPackingCostHistoryProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // ── Fetch history ──────────────────────────────────────────────────────────
  const { data, loading, error, refetch } = useApi<MasterPackingCostHistoryResponse>(
    () => fetchApi(`/master-packing-cost/master-products/${masterProductId}/history`),
    [masterProductId],
    `master-packing-cost-history-${masterProductId}`,
  );

  const entries: MasterPackingCostHistoryEntry[] = data?.data ?? [];

  // ── Toggle audit log expansion ─────────────────────────────────────────────
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section aria-label="Riwayat Packing Cost">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          gap: '8px',
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
            Riwayat Packing Cost
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
            Semua entry termasuk yang sudah dihapus, urutan terbaru ke terlama.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          title="Refresh riwayat packing cost"
          aria-label="Refresh riwayat packing cost"
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
            flexShrink: 0,
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
      </div>

      {/* Content */}
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
          <EmptyHistory />
        )}

        {!loading && !error && entries.length > 0 && (() => {
          // Group entries by status so the user always sees Aktif first, then
          // a labeled "Dihapus" divider before the soft-deleted history. The
          // server already orders by startDate desc, so within each group we
          // preserve that order.
          const activeEntries = entries.filter((e) => e.deletedAt === null);
          const deletedEntries = entries.filter((e) => e.deletedAt !== null);
          const todayIso = new Date().toISOString().slice(0, 10);

          // Determine which active entry covers today so we can label it as
          // "Berlaku Saat Ini" — the user-visible signal of which value the
          // profit calculator will pick up right now.
          const currentEntryId = activeEntries.find((e) => {
            const startsByToday = e.startDate <= todayIso;
            const notYetEnded = e.endDate === null || e.endDate >= todayIso;
            return startsByToday && notYetEnded;
          })?.id;

          return (
            <div>
              {/* ── Active group ── */}
              {activeEntries.length === 0 ? (
                <SectionHeader label="Aktif" emptyHint="Belum ada entry aktif" />
              ) : (
                <>
                  <SectionHeader label="Aktif" />
                  {activeEntries.map((entry, idx) => (
                    <HistoryEntryRow
                      key={entry.id}
                      entry={entry}
                      isLast={idx === activeEntries.length - 1 && deletedEntries.length === 0}
                      expanded={expandedIds.has(entry.id)}
                      isCurrent={entry.id === currentEntryId}
                      onToggle={() => toggleExpand(entry.id)}
                      onDelete={onDelete}
                      isDeleting={deletingId === entry.id}
                    />
                  ))}
                </>
              )}

              {/* ── Deleted group (only shown when there's history to display) ── */}
              {deletedEntries.length > 0 && (
                <>
                  <SectionHeader label="Dihapus" />
                  {deletedEntries.map((entry, idx) => (
                    <HistoryEntryRow
                      key={entry.id}
                      entry={entry}
                      isLast={idx === deletedEntries.length - 1}
                      expanded={expandedIds.has(entry.id)}
                      isCurrent={false}
                      onToggle={() => toggleExpand(entry.id)}
                      onDelete={onDelete}
                      isDeleting={deletingId === entry.id}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })()}
      </div>
    </section>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
//
// Visual divider between "Aktif" and "Dihapus" groups. Keeps the user oriented
// without forcing them to read the badges on each row.

interface SectionHeaderProps {
  label: 'Aktif' | 'Dihapus';
  emptyHint?: string;
}

function SectionHeader({ label, emptyHint }: SectionHeaderProps) {
  const isActive = label === 'Aktif';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '8px 14px',
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        color: isActive ? 'var(--success, #16a34a)' : 'var(--text4)',
      }}
    >
      <span>{label}</span>
      {emptyHint && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 400,
            color: 'var(--text4)',
            textTransform: 'none',
            letterSpacing: 0,
            fontStyle: 'italic',
          }}
        >
          {emptyHint}
        </span>
      )}
    </div>
  );
}

// ─── HistoryEntryRow ──────────────────────────────────────────────────────────

interface HistoryEntryRowProps {
  entry: MasterPackingCostHistoryEntry;
  isLast: boolean;
  expanded: boolean;
  /** True if this entry's period covers today (only meaningful for active entries). */
  isCurrent: boolean;
  onToggle: () => void;
  onDelete?: (entry: MasterPackingCostHistoryEntry) => void;
  isDeleting?: boolean;
}

function HistoryEntryRow({
  entry,
  isLast,
  expanded,
  isCurrent,
  onToggle,
  onDelete,
  isDeleting,
}: HistoryEntryRowProps) {
  const isDeleted = entry.deletedAt !== null;
  const showDeleteButton = onDelete !== undefined && !isDeleted;

  return (
    <div
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        opacity: isDeleted ? 0.75 : 1,
      }}
    >
      {/* ── Entry summary row ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 14px',
          background: isDeleted ? 'var(--bg2)' : 'var(--bg)',
        }}
      >
        {/* Left: toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Sembunyikan audit log entry`
                : `Tampilkan audit log entry`
            }
            title={expanded ? 'Sembunyikan audit log' : 'Tampilkan audit log'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text3)',
              flexShrink: 0,
              transition: 'background .1s, color .1s',
              fontFamily: 'inherit',
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
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>

        {/* Center: entry details */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px 16px',
            minWidth: 0,
          }}
        >
          {/* Value */}
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: isDeleted ? 'var(--text3)' : 'var(--text1)',
              flexShrink: 0,
            }}
          >
            {formatRp(entry.packingCost)}
          </span>

          {/* "Berlaku Saat Ini" pill — only for the active entry whose period
              covers today, so the user can see at a glance which value the
              profit calculator picks up right now. */}
          {isCurrent && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '10px',
                fontWeight: 600,
                background: 'var(--success-bg, #f0fdf4)',
                color: 'var(--success, #16a34a)',
                border: '1px solid var(--success, #16a34a)',
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                flexShrink: 0,
              }}
            >
              Berlaku Saat Ini
            </span>
          )}

          {/* Period — for deleted entries we show "→ Dihapus DD/MM/YYYY" so
              the user understands the entry is no longer in effect even when
              the original endDate was open-ended. */}
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text3)',
              flexShrink: 0,
            }}
          >
            {formatDate(entry.startDate)}
            {' → '}
            {isDeleted && entry.deletedAt ? (
              <span style={{ color: 'var(--error, #dc2626)' }}>
                Dihapus {formatDate(entry.deletedAt.slice(0, 10))}
              </span>
            ) : entry.endDate ? (
              formatDate(entry.endDate)
            ) : (
              <span style={{ fontStyle: 'italic', color: 'var(--text4)' }}>Sekarang</span>
            )}
          </span>

          {/* Note */}
          {entry.note && (
            <span
              title={entry.note}
              style={{
                fontSize: '12px',
                color: 'var(--text3)',
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.note}
            </span>
          )}

          {/* Auto-closed indicator */}
          {entry.autoClosedBy !== null && !isDeleted && (
            <span
              title={`Ditutup otomatis oleh entry yang lebih baru`}
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text4)',
                flexShrink: 0,
              }}
            >
              Auto-close
            </span>
          )}
        </div>

        {/* Right: audit log count + optional delete button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} style={{ color: 'var(--text4)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text4)' }}>
              {entry.auditLogs.length} log
            </span>
          </div>

          {showDeleteButton && (
            <button
              onClick={() => onDelete!(entry)}
              disabled={isDeleting}
              aria-label={`Hapus entry biaya packing mulai ${formatDate(entry.startDate)}`}
              title="Hapus entry"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                border: '1px solid var(--border)',
                borderRadius: '5px',
                background: 'transparent',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                color: 'var(--error, #dc2626)',
                fontFamily: 'inherit',
                transition: 'background .12s, color .12s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isDeleting) {
                  e.currentTarget.style.background = 'var(--error-bg, #fff0f0)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* ── Expandable audit log section ── */}
      {expanded && (
        <AuditLogSection auditLogs={entry.auditLogs} entryId={entry.id} />
      )}
    </div>
  );
}

// ─── AuditLogSection ─────────────────────────────────────────────────────────

interface AuditLogSectionProps {
  auditLogs: AuditLogEntry[];
  entryId: number;
}

function AuditLogSection({ auditLogs, entryId }: AuditLogSectionProps) {
  if (auditLogs.length === 0) {
    return (
      <div
        style={{
          padding: '12px 14px 12px 48px',
          background: 'var(--bg2)',
          borderTop: '1px solid var(--border)',
          fontSize: '12px',
          color: 'var(--text4)',
          fontStyle: 'italic',
        }}
      >
        Tidak ada audit log untuk entry #{entryId}.
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {/* Audit log header */}
      <div
        style={{
          padding: '8px 14px 6px 48px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text3)',
          textTransform: 'uppercase',
          letterSpacing: '.04em',
          borderBottom: '1px solid var(--border)',
        }}
      >
        Audit Log
      </div>

      {/* Audit log entries */}
      {auditLogs.map((log, idx) => (
        <AuditLogRow
          key={log.id}
          log={log}
          isLast={idx === auditLogs.length - 1}
        />
      ))}
    </div>
  );
}

// ─── AuditLogRow ─────────────────────────────────────────────────────────────

interface AuditLogRowProps {
  log: AuditLogEntry;
  isLast: boolean;
}

function AuditLogRow({ log, isLast }: AuditLogRowProps) {
  const [showValues, setShowValues] = useState(false);
  const hasValues = log.previousValues !== null || log.newValues !== null;

  return (
    <div
      style={{
        padding: '10px 14px 10px 48px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Top row: action badge + timestamp + userId */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {/* Action badge */}
        <span
          style={{
            display: 'inline-block',
            padding: '1px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 600,
            background: actionBg(log.action),
            color: actionColor(log.action),
            border: `1px solid ${actionColor(log.action)}`,
            flexShrink: 0,
          }}
        >
          {actionLabel(log.action)}
        </span>

        {/* Timestamp */}
        <span style={{ fontSize: '12px', color: 'var(--text3)', flexShrink: 0 }}>
          {formatDateTime(log.createdAt)}
        </span>

        {/* User ID */}
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text4)',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}
        >
          oleh: {log.userId}
        </span>

        {/* Toggle changed values */}
        {hasValues && (
          <button
            onClick={() => setShowValues((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '1px 8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--text3)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background .1s',
              marginLeft: 'auto',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {showValues ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {showValues ? 'Sembunyikan' : 'Lihat perubahan'}
          </button>
        )}
      </div>

      {/* Changed values */}
      {showValues && hasValues && (
        <ChangedValues
          previousValues={log.previousValues}
          newValues={log.newValues}
          action={log.action}
        />
      )}
    </div>
  );
}

// ─── ChangedValues ────────────────────────────────────────────────────────────

interface ChangedValuesProps {
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  action: string;
}

function ChangedValues({ previousValues, newValues, action }: ChangedValuesProps) {
  // Map raw camelCase keys to Indonesian labels so the audit log reads as
  // human language. Keys not present here fall back to the raw key — that
  // shouldn't happen for normal mutations but keeps the UI safe if a future
  // service adds a new field.
  const FIELD_LABELS: Record<string, string> = {
    masterProductId: 'Master Produk',
    packingCost: 'Biaya Packing',
    startDate: 'Tanggal Mulai',
    endDate: 'Tanggal Selesai',
    note: 'Catatan',
    autoClosedReason: 'Alasan Auto-Close',
  };

  // Format value for display: format Rupiah for packingCost, leave dates as
  // YYYY-MM-DD strings (already human-readable), null/undefined → italic dash.
  const formatValue = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (key === 'packingCost' && typeof value === 'number') return formatRp(value);
    return String(value);
  };

  // Filter to keys we know about — hides DB-internal noise like
  // `autoClosedBy` (an FK that's already represented by the row badge).
  const allKeys = Array.from(
    new Set([
      ...Object.keys(previousValues ?? {}),
      ...Object.keys(newValues ?? {}),
    ])
  ).filter((k) => FIELD_LABELS[k] !== undefined);

  if (allKeys.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        overflow: 'hidden',
        fontSize: '12px',
      }}
    >
      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: action === 'update' ? '1fr 1fr 1fr' : '1fr 1fr',
          gap: '0',
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          style={{
            padding: '4px 10px',
            fontWeight: 600,
            color: 'var(--text3)',
            fontSize: '11px',
          }}
        >
          Field
        </span>
        {action === 'update' && (
          <span
            style={{
              padding: '4px 10px',
              fontWeight: 600,
              color: 'var(--text3)',
              fontSize: '11px',
              borderLeft: '1px solid var(--border)',
            }}
          >
            Sebelum
          </span>
        )}
        <span
          style={{
            padding: '4px 10px',
            fontWeight: 600,
            color: 'var(--text3)',
            fontSize: '11px',
            borderLeft: '1px solid var(--border)',
          }}
        >
          {action === 'delete' ? 'Nilai' : action === 'insert' ? 'Nilai' : 'Sesudah'}
        </span>
      </div>

      {/* Rows */}
      {allKeys.map((key, idx) => {
        const prev = previousValues?.[key];
        const next = newValues?.[key];
        const changed = action === 'update' && JSON.stringify(prev) !== JSON.stringify(next);

        return (
          <div
            key={key}
            style={{
              display: 'grid',
              gridTemplateColumns: action === 'update' ? '1fr 1fr 1fr' : '1fr 1fr',
              borderBottom: idx < allKeys.length - 1 ? '1px solid var(--border)' : 'none',
              background: changed ? 'var(--accent-subtle, rgba(37,99,235,0.04))' : 'transparent',
            }}
          >
            <span
              style={{
                padding: '4px 10px',
                color: 'var(--text2)',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {FIELD_LABELS[key] ?? key}
            </span>
            {action === 'update' && (
              <span
                style={{
                  padding: '4px 10px',
                  color: changed ? 'var(--error, #dc2626)' : 'var(--text2)',
                  fontSize: '12px',
                  borderLeft: '1px solid var(--border)',
                  wordBreak: 'break-all',
                }}
              >
                {prev === null || prev === undefined ? (
                  <span style={{ color: 'var(--text4)', fontStyle: 'italic' }}>—</span>
                ) : (
                  formatValue(key, prev)
                )}
              </span>
            )}
            <span
              style={{
                padding: '4px 10px',
                color: changed ? 'var(--success, #16a34a)' : 'var(--text2)',
                fontSize: '12px',
                borderLeft: '1px solid var(--border)',
                wordBreak: 'break-all',
              }}
            >
              {(() => {
                const value = action === 'delete' ? prev : next;
                if (value === null || value === undefined) {
                  return <span style={{ color: 'var(--text4)', fontStyle: 'italic' }}>—</span>;
                }
                return formatValue(key, value);
              })()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Error card ───────────────────────────────────────────────────────────────

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
      <AlertCircle size={32} style={{ color: 'var(--error, #dc2626)' }} />
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

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyHistory() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '40px 24px',
        textAlign: 'center',
        color: 'var(--text4)',
        fontSize: '13px',
      }}
    >
      <Clock size={28} style={{ opacity: 0.4 }} />
      <p style={{ margin: 0 }}>Belum ada riwayat packing cost untuk produk ini.</p>
    </div>
  );
}
