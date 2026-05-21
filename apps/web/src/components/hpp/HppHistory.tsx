import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Loader2, Clock } from 'lucide-react';
import { fetchApi } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: number;
  action: 'insert' | 'update' | 'delete';
  previousValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
  userId: string;
  createdAt: string;
}

interface HppHistoryEntry {
  id: number;
  variantId: number;
  hppValue: number;
  startDate: string;
  endDate: string | null;
  note: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  auditLogs: AuditLogEntry[];
}

interface HppHistoryResponse {
  success: boolean;
  data: HppHistoryEntry[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HppHistoryProps {
  /** Variant ID to load history for */
  variantId: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRp(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function actionLabel(action: AuditLogEntry['action']): string {
  switch (action) {
    case 'insert': return 'Dibuat';
    case 'update': return 'Diubah';
    case 'delete': return 'Dihapus';
  }
}

function actionColor(action: AuditLogEntry['action']): string {
  switch (action) {
    case 'insert': return '#16A34A';
    case 'update': return '#D97706';
    case 'delete': return '#DC2626';
  }
}

function actionBg(action: AuditLogEntry['action']): string {
  switch (action) {
    case 'insert': return '#F0FDF4';
    case 'update': return '#FFFBEB';
    case 'delete': return '#FEF2F2';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLoading() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
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
        padding: '32px',
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

// ─── Status Badge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  deleted: boolean;
}

function StatusBadge({ deleted }: StatusBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '.02em',
        background: deleted ? '#FEF2F2' : '#F0FDF4',
        color: deleted ? '#DC2626' : '#16A34A',
        border: `1px solid ${deleted ? '#FECACA' : '#BBF7D0'}`,
        whiteSpace: 'nowrap',
      }}
    >
      {deleted ? 'Dihapus' : 'Aktif'}
    </span>
  );
}

// ─── Changed Values Display ───────────────────────────────────────────────────

interface ChangedValuesProps {
  previousValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
  action: AuditLogEntry['action'];
}

const FIELD_LABELS: Record<string, string> = {
  hppValue: 'Nilai HPP',
  startDate: 'Tanggal Mulai',
  endDate: 'Tanggal Selesai',
  note: 'Catatan',
  deletedAt: 'Dihapus Pada',
};

function formatFieldValue(key: string, value: any): string {
  if (value === null || value === undefined) return '—';
  if (key === 'hppValue') return formatRp(Number(value));
  if (key === 'startDate' || key === 'endDate') return formatDate(String(value));
  if (key === 'deletedAt') return formatDateTime(String(value));
  return String(value);
}

function ChangedValues({ previousValues, newValues, action }: ChangedValuesProps) {
  if (action === 'insert' && newValues) {
    const keys = Object.keys(newValues).filter((k) => FIELD_LABELS[k]);
    if (keys.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {keys.map((key) => (
          <div key={key} style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
            <span style={{ color: 'var(--text4)', minWidth: '100px', flexShrink: 0 }}>
              {FIELD_LABELS[key] ?? key}
            </span>
            <span style={{ color: '#16A34A', fontWeight: 500 }}>
              {formatFieldValue(key, newValues[key])}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (action === 'delete' && previousValues) {
    const keys = Object.keys(previousValues).filter((k) => FIELD_LABELS[k]);
    if (keys.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {keys.map((key) => (
          <div key={key} style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
            <span style={{ color: 'var(--text4)', minWidth: '100px', flexShrink: 0 }}>
              {FIELD_LABELS[key] ?? key}
            </span>
            <span style={{ color: '#DC2626', textDecoration: 'line-through' }}>
              {formatFieldValue(key, previousValues[key])}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (action === 'update' && previousValues && newValues) {
    const allKeys = Array.from(
      new Set([...Object.keys(previousValues), ...Object.keys(newValues)])
    ).filter((k) => FIELD_LABELS[k]);

    const changedKeys = allKeys.filter(
      (k) => String(previousValues[k] ?? '') !== String(newValues[k] ?? '')
    );

    if (changedKeys.length === 0) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {changedKeys.map((key) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {FIELD_LABELS[key] ?? key}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
              <span style={{ color: '#DC2626', textDecoration: 'line-through' }}>
                {formatFieldValue(key, previousValues[key])}
              </span>
              <span style={{ color: 'var(--text4)' }}>→</span>
              <span style={{ color: '#16A34A', fontWeight: 500 }}>
                {formatFieldValue(key, newValues[key])}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ─── Audit Log Row ────────────────────────────────────────────────────────────

interface AuditLogRowProps {
  log: AuditLogEntry;
}

function AuditLogRow({ log }: AuditLogRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '10px',
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Action badge */}
      <div style={{ flexShrink: 0, paddingTop: '1px' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 7px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            background: actionBg(log.action),
            color: actionColor(log.action),
          }}
        >
          {actionLabel(log.action)}
        </span>
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
            <Clock size={10} style={{ display: 'inline', marginRight: '3px', verticalAlign: 'middle' }} />
            {formatDateTime(log.createdAt)}
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text4)',
              background: 'var(--bg3)',
              padding: '1px 6px',
              borderRadius: '4px',
            }}
          >
            {log.userId}
          </span>
        </div>
        <ChangedValues
          previousValues={log.previousValues}
          newValues={log.newValues}
          action={log.action}
        />
      </div>
    </div>
  );
}

// ─── Audit Log Section (expandable) ──────────────────────────────────────────

interface AuditLogSectionProps {
  logs: AuditLogEntry[];
  entryId: number;
}

function AuditLogSection({ logs, entryId }: AuditLogSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (logs.length === 0) {
    return (
      <div
        style={{
          padding: '6px 12px',
          fontSize: '11px',
          color: 'var(--text4)',
          fontStyle: 'italic',
        }}
      >
        Tidak ada log audit.
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`audit-log-${entryId}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '11px',
          color: 'var(--text3)',
          fontFamily: 'inherit',
          width: '100%',
          textAlign: 'left',
          transition: 'color .12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text3)'; }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {expanded ? 'Sembunyikan' : 'Lihat'} log audit ({logs.length})
      </button>

      {expanded && (
        <div
          id={`audit-log-${entryId}`}
          style={{
            padding: '0 12px 8px 12px',
            background: 'var(--bg2)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {logs.map((log) => (
            <AuditLogRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History Entry Card ───────────────────────────────────────────────────────

interface HistoryEntryCardProps {
  entry: HppHistoryEntry;
}

function HistoryEntryCard({ entry }: HistoryEntryCardProps) {
  const isDeleted = entry.deletedAt !== null;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
        opacity: isDeleted ? 0.75 : 1,
        background: 'var(--bg)',
      }}
    >
      {/* Entry header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '12px 14px',
          gap: '12px',
          background: isDeleted ? 'var(--bg2)' : 'var(--bg)',
          flexWrap: 'wrap',
        }}
      >
        {/* Left: dates + value */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: isDeleted ? 'var(--text3)' : 'var(--text1)',
              }}
            >
              {formatRp(entry.hppValue)}
            </span>
            <StatusBadge deleted={isDeleted} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text3)' }}>
            <span>{formatDate(entry.startDate)}</span>
            <span style={{ color: 'var(--text4)' }}>—</span>
            {entry.endDate ? (
              <span>{formatDate(entry.endDate)}</span>
            ) : (
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 6px',
                  background: 'var(--bg3)',
                  borderRadius: '4px',
                  color: 'var(--text3)',
                }}
              >
                Berlaku
              </span>
            )}
          </div>

          {entry.note && (
            <p
              style={{
                margin: 0,
                fontSize: '12px',
                color: 'var(--text3)',
                fontStyle: 'italic',
                maxWidth: '400px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={entry.note}
            >
              {entry.note}
            </p>
          )}
        </div>

        {/* Right: entry ID + deleted timestamp */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text4)',
              background: 'var(--bg3)',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            #ID {entry.id}
          </span>
          {isDeleted && entry.deletedAt && (
            <span style={{ fontSize: '10px', color: '#DC2626' }}>
              Dihapus: {formatDateTime(entry.deletedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Audit log section */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <AuditLogSection logs={entry.auditLogs} entryId={entry.id} />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * HppHistory — Full HPP history for a variant, including audit log entries.
 *
 * Requirements: 4.1, 4.2, 12.2
 *
 * - Displays all Entry_HPP records (active and deleted) sorted by start date desc (Req 4.1)
 * - Includes expandable audit log entries per Entry_HPP (Req 4.2)
 * - Shows active/deleted status badge for each entry (Req 12.2)
 * - Max 100 entries enforced by the API (Req 4.1)
 */
export function HppHistory({ variantId }: HppHistoryProps) {
  const [entries, setEntries] = useState<HppHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi<HppHistoryResponse>(
        `/hpp/variants/${variantId}/history`
      );
      setEntries(res.data ?? []);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat riwayat HPP');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [variantId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <section aria-label="Riwayat HPP">
      {/* Header */}
      <div style={{ marginBottom: '12px' }}>
        <h3
          style={{
            margin: '0 0 4px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text1)',
          }}
        >
          Riwayat HPP
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
          Semua entry HPP (aktif dan dihapus) beserta log audit perubahan. Maks. 100 entry.
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <SectionLoading />
      ) : error ? (
        <SectionError message={error} onRetry={loadHistory} />
      ) : entries.length === 0 ? (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            color: 'var(--text4)',
            fontSize: '13px',
            background: 'var(--bg2)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          Belum ada riwayat HPP untuk variasi ini.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {entries.map((entry) => (
            <HistoryEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
