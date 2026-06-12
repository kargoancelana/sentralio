import { useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Clock } from 'lucide-react';

// Audit log entry as returned by GET /hpp/variants/:id/history (one per change).
interface HppAuditLogEntry {
  id: number;
  action: string;
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  userId: string;
  createdAt: string;
}

interface HppAuditEntry {
  id: number;
  hppValue: number;
  startDate: string;
  endDate: string | null;
  note: string | null;
  auditLogs?: HppAuditLogEntry[];
}

export interface HppAuditHistoryProps {
  /** Entries for the selected variant; each may carry an auditLogs array. */
  entries: HppAuditEntry[];
}

function formatRp(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString('id-ID', {
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
    case 'insert':
      return 'Dibuat';
    case 'update':
      return 'Diubah';
    case 'delete':
      return 'Dihapus';
    default:
      return action;
  }
}

function actionColor(action: string): string {
  switch (action) {
    case 'insert':
      return 'var(--success, #16a34a)';
    case 'update':
      return 'var(--accent, #2563eb)';
    case 'delete':
      return 'var(--error, #dc2626)';
    default:
      return 'var(--text3)';
  }
}

function actionBg(action: string): string {
  switch (action) {
    case 'insert':
      return 'var(--success-bg, #f0fdf4)';
    case 'update':
      return 'var(--accent-subtle, rgba(37,99,235,0.08))';
    case 'delete':
      return 'var(--error-bg, #fff0f0)';
    default:
      return 'var(--bg3)';
  }
}

const FIELD_LABELS: Record<string, string> = {
  variantId: 'Variasi',
  hppValue: 'Nilai HPP',
  startDate: 'Tanggal Mulai',
  endDate: 'Tanggal Selesai',
  note: 'Catatan',
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (key === 'hppValue' && typeof value === 'number') return formatRp(value);
  return String(value);
}

// All static styles live here so the JSX never needs a double-brace literal.
const styles: Record<string, CSSProperties> = {
  changedGrid: { marginTop: '6px', display: 'grid', gap: '3px', fontSize: '12px' },
  changedRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '8px',
    alignItems: 'baseline',
  },
  fieldLabel: { color: 'var(--text3)' },
  fieldValue: { color: 'var(--text1)' },
  strikethrough: { textDecoration: 'line-through', color: 'var(--text3)' },
  newValueBold: { fontWeight: 600 },
  auditRowMeta: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  timestamp: { fontSize: '12px', color: 'var(--text1)' },
  byUser: { fontSize: '12px', color: 'var(--text3)' },
  toggleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--accent, #2563eb)',
    fontSize: '11px',
    padding: '2px 4px',
  },
  entryCard: { borderBottom: '1px solid var(--border)' },
  entryBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '8px 4px',
    textAlign: 'left',
    color: 'var(--text1)',
  },
  entryValue: { fontWeight: 600, fontSize: '13px' },
  entryPeriod: { fontSize: '12px', color: 'var(--text3)' },
  logCount: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--text3)',
  },
  expandWrap: { padding: '0 4px 10px 24px' },
  emptyLog: { fontSize: '12px', color: 'var(--text3)', padding: '4px 0' },
  sectionWrap: {
    marginTop: '14px',
    borderTop: '1px solid var(--border)',
    paddingTop: '10px',
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    marginBottom: '4px',
  },
};

interface ChangedValuesProps {
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  action: string;
}

function ChangedValues({ previousValues, newValues, action }: ChangedValuesProps) {
  const allKeys = Array.from(
    new Set([...Object.keys(previousValues ?? {}), ...Object.keys(newValues ?? {})])
  ).filter((k) => FIELD_LABELS[k] !== undefined);

  if (allKeys.length === 0) return null;

  return (
    <div style={styles.changedGrid}>
      {allKeys.map((key) => {
        const prev = previousValues?.[key];
        const next = newValues?.[key];
        return (
          <div key={key} style={styles.changedRow}>
            <span style={styles.fieldLabel}>{FIELD_LABELS[key] ?? key}</span>
            <span style={styles.fieldValue}>
              {action === 'update' ? (
                <>
                  <span style={styles.strikethrough}>{formatValue(key, prev)}</span>
                  {' -> '}
                  <span style={styles.newValueBold}>{formatValue(key, next)}</span>
                </>
              ) : (
                formatValue(key, action === 'delete' ? prev : next)
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface AuditRowProps {
  log: HppAuditLogEntry;
  isLast: boolean;
}

function AuditRow({ log, isLast }: AuditRowProps) {
  const [showValues, setShowValues] = useState(false);
  const hasValues = log.previousValues !== null || log.newValues !== null;

  const rowStyle: CSSProperties = {
    padding: '6px 0',
    borderBottom: isLast ? 'none' : '1px dashed var(--border)',
  };
  const badgeStyle: CSSProperties = {
    display: 'inline-block',
    padding: '1px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    background: actionBg(log.action),
    color: actionColor(log.action),
    border: `1px solid ${actionColor(log.action)}`,
    flexShrink: 0,
  };

  return (
    <div style={rowStyle}>
      <div style={styles.auditRowMeta}>
        <span style={badgeStyle}>{actionLabel(log.action)}</span>
        <span style={styles.timestamp}>{formatDateTime(log.createdAt)}</span>
        <span style={styles.byUser}>oleh: {log.userId}</span>
        {hasValues && (
          <button type="button" onClick={() => setShowValues((v) => !v)} style={styles.toggleBtn}>
            {showValues ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {showValues ? 'Sembunyikan' : 'Lihat perubahan'}
          </button>
        )}
      </div>
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

interface EntryCardProps {
  entry: HppAuditEntry;
  expanded: boolean;
  onToggle: () => void;
}

function EntryCard({ entry, expanded, onToggle }: EntryCardProps) {
  const logs = entry.auditLogs ?? [];
  return (
    <div style={styles.entryCard}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} style={styles.entryBtn}>
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span style={styles.entryValue}>{formatRp(entry.hppValue)}</span>
        <span style={styles.entryPeriod}>
          {formatDate(entry.startDate)} {'->'} {entry.endDate ? formatDate(entry.endDate) : 'Berlaku'}
        </span>
        <span style={styles.logCount}>
          <Clock size={12} />
          {logs.length} log
        </span>
      </button>
      {expanded && (
        <div style={styles.expandWrap}>
          {logs.length === 0 ? (
            <div style={styles.emptyLog}>Belum ada log perubahan.</div>
          ) : (
            logs.map((log, idx) => (
              <AuditRow key={log.id} log={log} isLast={idx === logs.length - 1} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * HppAuditHistory - shows when and who edited each HPP entry for the selected
 * variant, mirroring the packing-cost history UI. Renders nothing when no entry
 * has any audit log.
 */
export function HppAuditHistory({ entries }: HppAuditHistoryProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const withLogs = entries.filter((e) => (e.auditLogs?.length ?? 0) > 0);
  if (withLogs.length === 0) return null;

  return (
    <section aria-label="Log Perubahan HPP" style={styles.sectionWrap}>
      <div style={styles.sectionTitle}>
        <Clock size={12} />
        Log Perubahan
      </div>
      {withLogs.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          expanded={expandedIds.has(entry.id)}
          onToggle={() => toggle(entry.id)}
        />
      ))}
    </section>
  );
}
