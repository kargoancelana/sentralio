import { Package, ShoppingBag, CheckCircle, AlertTriangle } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
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
    <div className="dashboard animate-fade-in">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="page-subtitle">Overview of your WMS Sync system</p>
      </div>

      <div className="stats-grid stagger-children">
        <StatCard
          label="Master Products"
          value={totalMaster}
          icon={<Package size={18} />}
        />
        <StatCard
          label="Channel Models"
          value={allLinked}
          icon={<ShoppingBag size={18} />}
        />
        <StatCard
          label="Synced"
          value={synced}
          icon={<CheckCircle size={18} />}
          trend={allLinked > 0 ? { value: `${Math.round((synced/Math.max(allLinked,1))*100)}%`, type: 'positive' } : undefined}
        />
        <StatCard
          label="Failed"
          value={failed}
          icon={<AlertTriangle size={18} />}
          trend={failed > 0 ? { value: `${failed} issues`, type: 'negative' } : { value: 'All good', type: 'positive' }}
        />
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
