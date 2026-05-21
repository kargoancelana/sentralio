import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, RefreshCw, Clock } from 'lucide-react';
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

interface PackingCostHistoryEntry {
  id: number;
  productGroupId: number;
  packingCost: number;
  startDate: string;       // YYYY-MM-DD
  endDate: string | null;
  note: string | null;
  autoClosedBy: number | null;
  deletedAt: string | null; // null = active, non-null = deleted
  createdAt: string;
  updatedAt: string;
  auditLogs: AuditLogEntry[];
}

interface PackingCostHistoryResponse {
  success: boolean;
  data: PackingCostHistoryEntry[];
}

export interface PackingCostHistoryProps {
  /** The product_groups.id for the channel product */
  productGroupId: number;
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

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PackingCostHistory — displays the full history of Entry_Biaya_Packing records
 * for a given channel product, including audit log entries per entry.
 *
 * - Fetches from GET /packing-cost/product-groups/:groupId/history
 * - Shows all entries (active + deleted), sorted by start date desc (Req 9.1)
 * - Each entry shows: ID, value, start/end dates, note, active/deleted badge (Req 9.3)
 * - Each entry has an expandable/collapsible audit log section (Req 9.2)
 * - Audit logs show: action, timestamp, userId, changed values
 * - Max 100 entries (enforced by API per Req 9.1)
 *
 * Requirements: 9.1, 9.2, 9.3
 */
export function PackingCostHistory({ productGroupId }: PackingCostHistoryProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // ── Fetch history ──────────────────────────────────────────────────────────
  const { data, loading, error, refetch } = useApi<PackingCostHistoryResponse>(
    () => fetchApi(`/packing-cost/product-groups/${productGroupId}/history`),
    [productGroupId],
    `packing-cost-full-history-${productGroupId}`,
  );

  const entries: PackingCostHistoryEntry[] = data?.data ?? [];

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
    <section aria-label="Riwayat Biaya Packing">
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
            Riwayat Biaya Packing
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
            Semua entry termasuk yang sudah dihapus, maks. 100 record.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          title="Refresh riwayat biaya packing"
          aria-label="Refresh riwayat biaya packing"
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

        {!loading && !error && entries.length > 0 && (
          <div>
            {entries.map((entry, idx) => (
              <HistoryEntryRow
                key={entry.id}
                entry={entry}
                isLast={idx === entries.length - 1}
                expanded={expandedIds.has(entry.id)}
                onToggle={() => toggleExpand(entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── HistoryEntryRow ──────────────────────────────────────────────────────────

interface HistoryEntryRowProps {
  entry: PackingCostHistoryEntry;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function HistoryEntryRow({ entry, isLast, expanded, onToggle }: HistoryEntryRowProps) {
  const isDeleted = entry.deletedAt !== null;

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
        {/* Left: toggle + status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Sembunyikan audit log entry #${entry.id}`
                : `Tampilkan audit log entry #${entry.id}`
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

          {/* Status badge */}
          <StatusBadge deleted={isDeleted} />
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
          {/* Entry ID */}
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text4)',
              fontFamily: 'monospace',
              flexShrink: 0,
            }}
          >
            #{entry.id}
          </span>

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

          {/* Period */}
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text3)',
              flexShrink: 0,
            }}
          >
            {formatDate(entry.startDate)}
            {' → '}
            {entry.endDate ? (
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
              title={`Ditutup otomatis oleh entry #${entry.autoClosedBy}`}
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

        {/* Right: audit log count */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          <Clock size={12} style={{ color: 'var(--text4)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text4)' }}>
            {entry.auditLogs.length} log
          </span>
        </div>
      </div>

      {/* ── Expandable audit log section ── */}
      {expanded && (
        <AuditLogSection auditLogs={entry.auditLogs} entryId={entry.id} />
      )}
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ deleted }: { deleted: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 500,
        background: deleted
          ? 'var(--error-bg, #fff0f0)'
          : 'var(--success-bg, #f0fdf4)',
        color: deleted
          ? 'var(--error, #dc2626)'
          : 'var(--success, #16a34a)',
        border: `1px solid ${deleted ? 'var(--error, #dc2626)' : 'var(--success, #16a34a)'}`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'currentColor',
          flexShrink: 0,
        }}
      />
      {deleted ? 'Dihapus' : 'Aktif'}
    </span>
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
  // Collect all keys from both objects
  const allKeys = Array.from(
    new Set([
      ...Object.keys(previousValues ?? {}),
      ...Object.keys(newValues ?? {}),
    ])
  );

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
                color: 'var(--text3)',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              {key}
            </span>
            {action === 'update' && (
              <span
                style={{
                  padding: '4px 10px',
                  color: changed ? 'var(--error, #dc2626)' : 'var(--text2)',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  borderLeft: '1px solid var(--border)',
                  wordBreak: 'break-all',
                }}
              >
                {prev === null || prev === undefined ? (
                  <span style={{ color: 'var(--text4)', fontStyle: 'italic' }}>null</span>
                ) : (
                  String(prev)
                )}
              </span>
            )}
            <span
              style={{
                padding: '4px 10px',
                color: changed ? 'var(--success, #16a34a)' : 'var(--text2)',
                fontFamily: 'monospace',
                fontSize: '11px',
                borderLeft: '1px solid var(--border)',
                wordBreak: 'break-all',
              }}
            >
              {(action === 'delete' ? prev : next) === null ||
              (action === 'delete' ? prev : next) === undefined ? (
                <span style={{ color: 'var(--text4)', fontStyle: 'italic' }}>null</span>
              ) : (
                String(action === 'delete' ? prev : next)
              )}
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
      <p style={{ margin: 0 }}>Belum ada riwayat biaya packing untuk produk ini.</p>
    </div>
  );
}
