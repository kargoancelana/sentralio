import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { ProgressBar } from './ProgressBar';

export interface BatchProgressItem {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  message?: string;
  error?: string;
}

export interface BatchProgressProps {
  /** Array of items being processed */
  items: BatchProgressItem[];
  /** Show detailed item list */
  showDetails?: boolean;
  /** Maximum items to show in details (rest will be collapsed) */
  maxVisibleItems?: number;
  /** Custom className */
  className?: string;
  /** Title for the progress section */
  title?: string;
}

export function BatchProgress({
  items,
  showDetails = false,
  maxVisibleItems = 5,
  className = '',
  title = 'Processing Orders'
}: BatchProgressProps) {
  const completed = items.filter(item => item.status === 'success' || item.status === 'error').length;
  const successful = items.filter(item => item.status === 'success').length;
  const failed = items.filter(item => item.status === 'error').length;
  const total = items.length;
  
  const getStatusIcon = (status: BatchProgressItem['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={14} style={{ color: 'var(--success)' }} />;
      case 'error':
        return <XCircle size={14} style={{ color: 'var(--error)' }} />;
      case 'processing':
        return <Loader2 size={14} className="spin" style={{ color: 'var(--accent)' }} />;
      case 'pending':
        return <Clock size={14} style={{ color: 'var(--text4)' }} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: BatchProgressItem['status']) => {
    switch (status) {
      case 'success':
        return 'var(--success)';
      case 'error':
        return 'var(--error)';
      case 'processing':
        return 'var(--accent)';
      case 'pending':
        return 'var(--text4)';
      default:
        return 'var(--text3)';
    }
  };

  return (
    <div className={`batch-progress ${className}`} style={{
      padding: 16,
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      marginBottom: 16
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
      }}>
        <h4 style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text1)'
        }}>
          {title}
        </h4>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text3)'
        }}>
          {completed < total && (
            <span style={{ color: 'var(--accent)' }}>
              Memproses... {completed}/{total}
            </span>
          )}
          {completed === total && (
            <span style={{ 
              color: failed > 0 ? 'var(--warning)' : 'var(--success)',
              fontWeight: 600
            }}>
              Selesai: {successful} berhasil{failed > 0 ? `, ${failed} gagal` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <ProgressBar
        value={completed}
        max={total}
        showCounts
        current={completed}
        total={total}
        variant={failed > 0 ? 'warning' : 'primary'}
        animated={completed < total}
      />

      {/* Summary Stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        fontSize: 11,
        color: 'var(--text4)'
      }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ color: 'var(--success)', fontWeight: 500 }}>
            ✓ {successful} berhasil
          </span>
          {failed > 0 && (
            <span style={{ color: 'var(--error)', fontWeight: 500 }}>
              ✗ {failed} gagal
            </span>
          )}
          {total - completed > 0 && (
            <span style={{ fontWeight: 500 }}>
              ⏳ {total - completed} menunggu
            </span>
          )}
        </div>
        <div style={{ fontWeight: 500 }}>
          {Math.round((completed / total) * 100)}% selesai
        </div>
      </div>

      {/* Detailed Item List */}
      {showDetails && (
        <div style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--border)'
        }}>
          {/* Show failed orders first if batch is complete */}
          {completed === total && failed > 0 && (
            <div style={{
              marginBottom: 8,
              padding: '6px 10px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--error)',
              fontWeight: 500
            }}>
              ⚠️ {failed} pesanan gagal diproses - lihat detail di bawah
            </div>
          )}
          
          <div style={{
            maxHeight: 300,
            overflowY: 'auto',
            fontSize: 12
          }}>
            {/* Show failed items first, then successful ones */}
            {[...items]
              .sort((a, b) => {
                // Sort: error first, then processing, then success, then pending
                const order = { error: 0, processing: 1, success: 2, pending: 3 };
                return order[a.status] - order[b.status];
              })
              .slice(0, maxVisibleItems)
              .map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '6px 8px',
                    borderBottom: index < Math.min(items.length, maxVisibleItems) - 1 ? '1px solid var(--bg3)' : 'none',
                    background: item.status === 'error' ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                    borderRadius: 4,
                    marginBottom: 2
                  }}
                >
                  <div style={{ paddingTop: 2 }}>
                    {getStatusIcon(item.status)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: getStatusColor(item.status),
                      fontWeight: item.status === 'processing' || item.status === 'error' ? 600 : 400,
                      marginBottom: (item.message || item.error) ? 2 : 0
                    }}>
                      {item.label}
                    </div>
                    {item.message && (
                      <div style={{
                        fontSize: 10,
                        color: 'var(--text4)',
                        fontStyle: 'italic'
                      }}>
                        {item.message}
                      </div>
                    )}
                    {item.error && (
                      <div style={{
                        fontSize: 10,
                        color: 'var(--error)',
                        fontWeight: 500,
                        marginTop: 2
                      }}>
                        ⚠️ {item.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            
            {items.length > maxVisibleItems && (
              <div style={{
                padding: '8px 0',
                textAlign: 'center',
                color: 'var(--text4)',
                fontSize: 11,
                fontStyle: 'italic'
              }}>
                ... dan {items.length - maxVisibleItems} pesanan lainnya
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BatchProgress;