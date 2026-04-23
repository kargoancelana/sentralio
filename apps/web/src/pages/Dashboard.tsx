import { Package, ShoppingBag, CheckCircle, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { PageLoading } from '../components/shared/LoadingSpinner';
import './Dashboard.css';

export function Dashboard() {
  const { data: healthData } = useApi(() => api.health(), []);
  const { data: masterData, loading } = useApi(() => api.masterList(), []);

  if (loading) return <PageLoading />;

  const masters = masterData?.data || [];
  const totalMaster = masters.length;
  const allLinked = masters.reduce((sum: number, m: any) => sum + (m.linked_models?.length || 0), 0);
  const synced = masters.reduce((sum: number, m: any) =>
    sum + (m.linked_models?.filter((l: any) => l.syncStatus === 'success').length || 0), 0);
  const failed = masters.reduce((sum: number, m: any) =>
    sum + (m.linked_models?.filter((l: any) => l.syncStatus === 'failed').length || 0), 0);

  return (
    <div className="wms-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your WMS Sync system</p>
        </div>
      </div>

      <div className="stats-grid stagger-children">
        <div className="stat-card">
          <div className="stat-label">Master Products</div>
          <div className="stat-value">{totalMaster}</div>
          <div className="stat-sub"><Package size={14} style={{ marginRight: 4 }} /> Item di WMS</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Channel Models</div>
          <div className="stat-value">{allLinked}</div>
          <div className="stat-sub"><ShoppingBag size={14} style={{ marginRight: 4 }} /> Variasi terhubung</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Synced</div>
          <div className="stat-value" style={{ color: '#16A34A' }}>{synced}</div>
          <div className="stat-sub" style={{ color: '#16A34A' }}><CheckCircle size={14} style={{ marginRight: 4 }} /> {allLinked > 0 ? `${Math.round((synced/Math.max(allLinked,1))*100)}% berhasil` : 'Belum ada data'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Failed</div>
          <div className="stat-value" style={{ color: failed > 0 ? '#DC2626' : 'var(--text1)' }}>{failed}</div>
          <div className="stat-sub" style={{ color: failed > 0 ? '#DC2626' : 'var(--text3)' }}><AlertTriangle size={14} style={{ marginRight: 4 }} /> {failed > 0 ? 'Butuh perhatian' : 'Semua aman'}</div>
        </div>
      </div>

      <div className="dashboard-info-cards">
        <div className="info-card">
          <h3>System Status</h3>
          <div className="info-card-row">
            <span className="info-label">API Status</span>
            <StatusBadge label="Connected" variant="success" />
          </div>
          <div className="info-card-row">
            <span className="info-label">Database</span>
            <StatusBadge label={healthData?.database || 'checking...'} variant={healthData?.database === 'connected' ? 'success' : 'error'} />
          </div>
        </div>

        <div className="info-card">
          <h3>Quick Guide</h3>
          <div className="quick-guide-list">
            <div className="quick-guide-item">
              <span className="quick-guide-num">1</span>
              <span>Connect your Shopee account via <strong>Integrasi</strong></span>
            </div>
            <div className="quick-guide-item">
              <span className="quick-guide-num">2</span>
              <span>Sync products from Shopee to <strong>Produk Channel</strong></span>
            </div>
            <div className="quick-guide-item">
              <span className="quick-guide-num">3</span>
              <span>Create & map <strong>Master Produk</strong> for stock management</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
