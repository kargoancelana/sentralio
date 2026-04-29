/**
 * Sync Status Indicator
 * 
 * Shows background sync status in the UI.
 * Displays last sync time and sync health.
 */

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';

export function SyncStatusIndicator() {
  const [syncStats, setSyncStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch sync status on mount
    fetchSyncStatus();

    // Refresh every 30 seconds
    const interval = setInterval(fetchSyncStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/sync/status`);
      const data = await response.json();
      if (data.success) {
        setSyncStats(data.data);
      }
    } catch (error) {
      console.error('[SyncStatusIndicator] Failed to fetch sync status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !syncStats) {
    return null;
  }

  // Get active orders job stats
  const activeOrdersJob = syncStats['active-orders'];
  if (!activeOrdersJob) return null;

  const lastSyncTime = new Date(activeOrdersJob.lastSyncTime);
  const timeSinceSync = Date.now() - lastSyncTime.getTime();
  const minutesSinceSync = Math.floor(timeSinceSync / 60000);

  // Determine status
  const isHealthy = minutesSinceSync < 5 && activeOrdersJob.errors === 0;
  const isWarning = minutesSinceSync >= 5 || activeOrdersJob.errors > 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11,
        background: isHealthy ? 'rgba(22, 163, 74, 0.1)' : isWarning ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg2)',
        border: `1px solid ${isHealthy ? 'rgba(22, 163, 74, 0.3)' : isWarning ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)'}`,
        color: isHealthy ? '#16A34A' : isWarning ? '#F59E0B' : 'var(--text3)',
      }}
      title={`Last sync: ${lastSyncTime.toLocaleTimeString()}\nTotal synced: ${activeOrdersJob.totalSynced}\nErrors: ${activeOrdersJob.errors}`}
    >
      {isHealthy ? (
        <CheckCircle size={12} />
      ) : isWarning ? (
        <AlertCircle size={12} />
      ) : (
        <RefreshCw size={12} className="spin" />
      )}
      <span style={{ fontWeight: 500 }}>
        {minutesSinceSync === 0 ? 'Baru saja' : `${minutesSinceSync}m yang lalu`}
      </span>
    </div>
  );
}
