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
  deletedAt?: string | null;
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
  if (!dateStr) return '\u2014';
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
  if (value === null || value === undefined) return '\u2014';
  if (key === 'hppValue' && typeof value === 'number') return formatRp(value);
  return String(value);
}

// Static styles mirror MasterPackingCostHistory so the two histories look identical.
// NOTE: keep every style as a named entry/variable referenced with single braces
// (style={styles.x}); never inline a double-brace object literal in JSX.
const styles: Record<string, CSSProperties> = {
  sectionWrap: { marginTop: '16px' },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: '8px',
  },
  card: {
    border: '1px solid var(--border)',
    borderRadius: '8px',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    background: 'var(--bg)',
  },
  toggleWrap: { display: 'flex', alignItems: 'center', gap: '8px' },
  toggleBtn: {
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
  },
  details: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px 16px',
    minWidth: 0,
  },
  entryValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text1)',
    flexShrink: 0,
  },
  period: { fontSize: '12px', color: 'var(--text3)', flexShrink: 0 },
  periodNow: { fontStyle: 'italic', color: 'var(--text4)' },
  note: {
    fontSize: '12px',
    color: 'var(--text3)',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rightWrap: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  logCount: { display: 'flex', alignItems: 'center', gap: '4px' },
  logCountIcon: { color: 'var(--text4)' },
  logCountText: { fontSize: '11px', color: 'var(--text4)' },
  auditSection: { background: 'var(--bg2)', borderTop: '1px solid var(--border)' },
  auditHeader: {
    padding: '8px 14px 6px 48px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid var(--border)',
  },
  auditEmpty: {
    padding: '12px 14px 12px 48px',
    background: 'var(--bg2)',
    borderTop: '1px solid var(--border)',
    fontSize: '12px',
    color: 'var(--text4)',
    fontStyle: 'italic',
  },
  auditMeta: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' },
  timestamp: { fontSize: '12px', color: 'var(--text3)', flexShrink: 0 },
  byUser: {
    fontSize: '11px',
    color: 'var(--text4)',
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  changesToggle: {
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
  },
  cvWrap: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    overflow: 'hidden',
    fontSize: '12px',
  },
  cvHeadCell: {
    padding: '4px 10px',
    fontWeight: 600,
    color: 'var(--text3)',
    fontSize: '11px',
  },
  cvHeadCellBorder: {
    padding: '4px 10px',
    fontWeight: 600,
    color: 'var(--text3)',
    fontSize: '11px',
    borderLeft: '1px solid var(--border)',
  },
  cvFieldCell: {
    padding: '4px 10px',
    color: 'var(--text2)',
    fontSize: '12px',
    fontWeight: 500,
  },
  dash: { color: 'var(--text4)', fontStyle: 'italic' },
  deletedBadge: {
    display: 'inline-block',
    padding: '1px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    background: 'var(--error-bg, #fff0f0)',
    color: 'var(--error, #dc2626)',
    border: '1px solid var(--error, #dc2626)',
    flexShrink: 0,
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

  const isUpdate = action === 'update';
  const gridCols = isUpdate ? '1fr 1fr 1fr' : '1fr 1fr';
  const headerGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridCols,
    background: 'var(--bg2)',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={styles.cvWrap}>
      <div style={headerGridStyle}>
        <span style={styles.cvHeadCell}>Field</span>
        {isUpdate && <span style={styles.cvHeadCellBorder}>Sebelum</span>}
        <span style={styles.cvHeadCellBorder}>
          {action === 'delete' ? 'Nilai' : action === 'insert' ? 'Nilai' : 'Sesudah'}
        </span>
      </div>

      {allKeys.map((key, idx) => {
        const prev = previousValues?.[key];
        const next = newValues?.[key];
        const changed = isUpdate && JSON.stringify(prev) !== JSON.stringify(next);

        const rowGridStyle: CSSProperties = {
          display: 'grid',
          gridTemplateColumns: gridCols,
          borderBottom: idx < allKeys.length - 1 ? '1px solid var(--border)' : 'none',
          background: changed ? 'var(--accent-subtle, rgba(37,99,235,0.04))' : 'transparent',
        };
        const prevCellStyle: CSSProperties = {
          padding: '4px 10px',
          color: changed ? 'var(--error, #dc2626)' : 'var(--text2)',
          fontSize: '12px',
          borderLeft: '1px solid var(--border)',
          wordBreak: 'break-all',
        };
        const nextCellStyle: CSSProperties = {
          padding: '4px 10px',
          color: changed ? 'var(--success, #16a34a)' : 'var(--text2)',
          fontSize: '12px',
          borderLeft: '1px solid var(--border)',
          wordBreak: 'break-all',
        };

        return (
          <div key={key} style={rowGridStyle}>
            <span style={styles.cvFieldCell}>{FIELD_LABELS[key] ?? key}</span>
            {isUpdate && (
              <span style={prevCellStyle}>
                {prev === null || prev === undefined ? (
                  <span style={styles.dash}>{'\u2014'}</span>
                ) : (
                  formatValue(key, prev)
                )}
              </span>
            )}
            <span style={nextCellStyle}>
              {(() => {
                const value = action === 'delete' ? prev : next;
                if (value === null || value === undefined) {
                  return <span style={styles.dash}>{'\u2014'}</span>;
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

interface AuditRowProps {
  log: HppAuditLogEntry;
  isLast: boolean;
}

function AuditRow({ log, isLast }: AuditRowProps) {
  const [showValues, setShowValues] = useState(false);
  const hasValues = log.previousValues !== null || log.newValues !== null;

  const rowStyle: CSSProperties = {
    padding: '10px 14px 10px 48px',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
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
      <div style={styles.auditMeta}>
        <span style={badgeStyle}>{actionLabel(log.action)}</span>
        <span style={styles.timestamp}>{formatDateTime(log.createdAt)}</span>
        <span style={styles.byUser}>oleh: {log.userId}</span>
        {hasValues && (
          <button
            type="button"
            onClick={() => setShowValues((v) => !v)}
            style={styles.changesToggle}
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

interface EntryRowProps {
  entry: HppAuditEntry;
  expanded: boolean;
  isLast: boolean;
  onToggle: () => void;
}

function EntryRow({ entry, expanded, isLast, onToggle }: EntryRowProps) {
  const logs = entry.auditLogs ?? [];
  const outerStyle: CSSProperties = {
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
  };
  const toggleTitle = expanded ? 'Sembunyikan log perubahan' : 'Tampilkan log perubahan';

  return (
    <div style={outerStyle}>
      <div style={styles.summaryRow}>
        <div style={styles.toggleWrap}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={toggleTitle}
            title={toggleTitle}
            style={styles.toggleBtn}
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

        <div style={styles.details}>
          <span style={styles.entryValue}>{formatRp(entry.hppValue)}</span>
          {entry.deletedAt && <span style={styles.deletedBadge}>Dihapus</span>}
          <span style={styles.period}>
            {formatDate(entry.startDate)}
            {' \u2192 '}
            {entry.endDate ? (
              formatDate(entry.endDate)
            ) : (
              <span style={styles.periodNow}>Sekarang</span>
            )}
          </span>
          {entry.note && (
            <span title={entry.note} style={styles.note}>
              {entry.note}
            </span>
          )}
        </div>

        <div style={styles.rightWrap}>
          <div style={styles.logCount}>
            <Clock size={12} style={styles.logCountIcon} />
            <span style={styles.logCountText}>{logs.length} log</span>
          </div>
        </div>
      </div>

      {expanded &&
        (logs.length === 0 ? (
          <div style={styles.auditEmpty}>Belum ada log perubahan.</div>
        ) : (
          <div style={styles.auditSection}>
            <div style={styles.auditHeader}>Audit Log</div>
            {logs.map((log, idx) => (
              <AuditRow key={log.id} log={log} isLast={idx === logs.length - 1} />
            ))}
          </div>
        ))}
    </div>
  );
}

/**
 * HppAuditHistory - shows when and who edited each HPP entry for the selected
 * variant, styled identically to the packing-cost history. Renders nothing when
 * no entry has any audit log.
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
      <div style={styles.card}>
        {withLogs.map((entry, idx) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            expanded={expandedIds.has(entry.id)}
            isLast={idx === withLogs.length - 1}
            onToggle={() => toggle(entry.id)}
          />
        ))}
      </div>
    </section>
  );
}
