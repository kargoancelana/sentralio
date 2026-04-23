import { useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { useApi, useApiMutation } from '../hooks/useApi';
import { api } from '../lib/api';
import { Package, RefreshCw, Search, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale/id';

/* ── Status mapping ── */
type MainFilter = 'UNPAID' | 'NEED_SHIP' | 'SHIPPED' | 'COMPLETED';
type SubFilter  = 'ALL' | 'READY_TO_SHIP' | 'PROCESSED';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  UNPAID:        { label: 'Belum Bayar',    cls: 'badge-orange' },
  READY_TO_SHIP: { label: 'Perlu Diproses', cls: 'badge-primary' },
  PROCESSED:     { label: 'Telah Diproses', cls: 'badge-purple' },
  SHIPPED:       { label: 'Dikirim',        cls: 'badge-green' },
  COMPLETED:     { label: 'Selesai',        cls: 'badge-green' },
  IN_CANCEL:     { label: 'Dibatalkan',     cls: 'badge-red' },
  CANCELLED:     { label: 'Dibatalkan',     cls: 'badge-red' },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_BADGE[status] || { label: status, cls: '' };
  return <span className={`badge ${info.cls}`}>{info.label}</span>;
}

const formatRp   = (num: number) => 'Rp ' + num.toLocaleString('id-ID');
const formatDate = (dateStr: string) => {
  try { return format(new Date(dateStr), 'dd MMM yyyy, HH:mm', { locale: idLocale }); }
  catch { return dateStr; }
};

/* ── ORDER CARD ── */
function OrderCard({ order }: { order: any }) {
  const items: any[] = order.items || [];
  const hasItems = items.length > 0;

  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      marginBottom: 10, overflow: 'hidden',
    }}>
      {/* Header: tanggal kiri, no pesanan kanan */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 16px', borderBottom: '1px solid var(--bg3)',
        background: 'var(--bg2)',
      }}>
        <span style={{ fontSize: 11.5, color: 'var(--text4)' }}>
          {formatDate(order.createTime)}
        </span>
        <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--text3)', userSelect: 'all' }}>
          #{order.orderSn}
        </span>
      </div>

      {/* Username */}
      <div style={{ padding: '10px 16px 0', fontWeight: 600, fontSize: 13, color: 'var(--text1)' }}>
        @{order.buyerUsername || 'Pembeli'}
      </div>

      {/* Rows: satu row per item, semua kolom sejajar */}
      <div style={{ padding: '6px 16px 12px' }}>
        {hasItems ? (
          items.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              paddingTop: 8,
              borderTop: idx > 0 ? '1px solid var(--bg3)' : 'none',
              marginTop: idx > 0 ? 8 : 0,
            }}>
              {/* Produk + variasi — flex 1 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.4, fontWeight: 500 }}>
                  {item.itemName}
                </div>
                {item.modelName && (
                  <div style={{ fontSize: 11.5, color: 'var(--text4)', marginTop: 2 }}>
                    Variasi: {item.modelName}
                  </div>
                )}
              </div>

              {/* Qty — sejajar dengan item row */}
              <div style={{ minWidth: 40, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text2)', paddingTop: 1 }}>
                ×{item.qty}
              </div>

              {/* Total: hanya tampil di row pertama, sisanya kosong */}
              <div style={{ minWidth: 100, textAlign: 'right' }}>
                {idx === 0 ? (
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', whiteSpace: 'nowrap' }}>
                    {formatRp(order.totalAmount)}
                  </span>
                ) : null}
              </div>

              {/* Status: hanya di row pertama */}
              <div style={{ minWidth: 110, textAlign: 'center' }}>
                {idx === 0 ? <StatusBadge status={order.orderStatus} /> : null}
              </div>

              {/* Jasa kirim: hanya di row pertama */}
              <div style={{ minWidth: 80, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                {idx === 0 ? (
                  order.shippingCarrier ? (
                    <>
                      <Truck size={13} style={{ color: 'var(--text3)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, textAlign: 'center' }}>
                        {order.shippingCarrier}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 11.5, color: 'var(--text4)' }}>—</span>
                  )
                ) : null}
              </div>
            </div>
          ))
        ) : (
          /* Fallback jika belum ada item detail */
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text4)', fontStyle: 'italic' }}>Data produk belum tersedia</div>
            <div style={{ minWidth: 40 }} />
            <div style={{ minWidth: 100, textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--text1)' }}>
              {formatRp(order.totalAmount)}
            </div>
            <div style={{ minWidth: 110, textAlign: 'center' }}>
              <StatusBadge status={order.orderStatus} />
            </div>
            <div style={{ minWidth: 80, textAlign: 'center' }}>
              {order.shippingCarrier ? (
                <span style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 500 }}>{order.shippingCarrier}</span>
              ) : (
                <span style={{ fontSize: 11.5, color: 'var(--text4)' }}>—</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   PAGE
════════════════════════════════════════════ */
export function PesananSaya() {
  const toast = useToast();
  const { data: ordersData, loading, refetch } = useApi(() => api.orderList(), []);
  const [syncing, setSyncing]         = useState(false);
  const [mainFilter, setMainFilter]   = useState<MainFilter>('NEED_SHIP');   // default: Perlu Dikirim
  const [subFilter, setSubFilter]     = useState<SubFilter>('ALL');
  const [search, setSearch]           = useState('');

  const syncMut = useApiMutation(async () => {
    return await api.orderSync();
  });

  const handleSync = async () => {
    setSyncing(true);
    toast('Memulai penarikan data pesanan Shopee (15 hari terakhir)...', 'info');
    try {
      const res = await syncMut.execute();
      toast(res.message || 'Berhasil menarik pesanan', 'success');
      await refetch();
    } catch (err: any) {
      toast(err.message || 'Gagal menarik pesanan', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleMainFilter = (f: MainFilter) => {
    setMainFilter(f);
    if (f !== 'NEED_SHIP') setSubFilter('ALL');
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Memuat data pesanan...</div>;
  }

  const orders: any[] = ordersData?.data || [];

  // Counts
  const countUnpaid    = orders.filter(o => o.orderStatus === 'UNPAID').length;
  const countNeedShip  = orders.filter(o => ['READY_TO_SHIP', 'PROCESSED'].includes(o.orderStatus)).length;
  const countRts       = orders.filter(o => o.orderStatus === 'READY_TO_SHIP').length;
  const countProcessed = orders.filter(o => o.orderStatus === 'PROCESSED').length;
  const countShipped   = orders.filter(o => ['SHIPPED', 'IN_CANCEL'].includes(o.orderStatus)).length;
  const countCompleted = orders.filter(o => o.orderStatus === 'COMPLETED').length;

  // Filter logic
  const filtered = orders.filter(o => {
    // Main filter
    let matchMain = false;
    if (mainFilter === 'UNPAID')    matchMain = o.orderStatus === 'UNPAID';
    if (mainFilter === 'SHIPPED')   matchMain = ['SHIPPED', 'IN_CANCEL'].includes(o.orderStatus);
    if (mainFilter === 'COMPLETED') matchMain = o.orderStatus === 'COMPLETED';
    if (mainFilter === 'NEED_SHIP') {
      if (subFilter === 'ALL')           matchMain = ['READY_TO_SHIP', 'PROCESSED'].includes(o.orderStatus);
      if (subFilter === 'READY_TO_SHIP') matchMain = o.orderStatus === 'READY_TO_SHIP';
      if (subFilter === 'PROCESSED')     matchMain = o.orderStatus === 'PROCESSED';
    }
    const matchSearch = o.orderSn.toLowerCase().includes(search.toLowerCase()) ||
                        (o.buyerUsername || '').toLowerCase().includes(search.toLowerCase());
    return matchMain && matchSearch;
  });

  const badgeDot = (count: number, color: string) =>
    count > 0 ? <span style={{ marginLeft: 4, background: color, color: '#fff', fontSize: 10, padding: '0 5px', borderRadius: 10, fontWeight: 700 }}>{count}</span> : null;

  return (
    <div className="wms-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pesanan Saya</h1>
          <p className="page-subtitle">Kelola pesanan dari toko Shopee Anda</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-shopee" onClick={handleSync} disabled={syncing}>
            {syncing ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Menarik...' : 'Tarik Pesanan (15 Hari)'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Belum Bayar</div>
          <div className="stat-value" style={{ color: '#F59E0B' }}>{countUnpaid}</div>
          <div className="stat-sub">Menunggu pembayaran buyer</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Perlu Dikirim</div>
          <div className="stat-value" style={{ color: '#3B82F6' }}>{countNeedShip}</div>
          <div className="stat-sub">Siap di-pickup / antar</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dikirim</div>
          <div className="stat-value" style={{ color: '#8B5CF6' }}>{countShipped}</div>
          <div className="stat-sub">Dalam proses pengiriman</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Selesai</div>
          <div className="stat-value" style={{ color: '#16A34A' }}>{countCompleted}</div>
          <div className="stat-sub">Transaksi berhasil</div>
        </div>
      </div>

      {/* ── TOOLBAR ── */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="filter-tabs">
            <button
              className={`filter-tab ${mainFilter === 'UNPAID' ? 'active' : ''}`}
              onClick={() => handleMainFilter('UNPAID')}
            >
              Belum Bayar{badgeDot(countUnpaid, '#F59E0B')}
            </button>

            <button
              className={`filter-tab ${mainFilter === 'NEED_SHIP' ? 'active' : ''}`}
              onClick={() => handleMainFilter('NEED_SHIP')}
            >
              Perlu Dikirim{badgeDot(countNeedShip, '#3B82F6')}
            </button>

            <button
              className={`filter-tab ${mainFilter === 'SHIPPED' ? 'active' : ''}`}
              onClick={() => handleMainFilter('SHIPPED')}
            >
              Dikirim{badgeDot(countShipped, '#8B5CF6')}
            </button>

            <button
              className={`filter-tab ${mainFilter === 'COMPLETED' ? 'active' : ''}`}
              onClick={() => handleMainFilter('COMPLETED')}
            >
              Selesai
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="search-wrap" style={{ width: 260 }}>
            <Search size={14} />
            <input className="search-inp" placeholder="Cari No. Pesanan atau Pembeli..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── SUB-FILTER: hanya muncul saat Perlu Dikirim aktif ── */}
      {mainFilter === 'NEED_SHIP' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, marginTop: -6 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text4)', marginRight: 4 }}>Status:</span>
          {([
            { key: 'ALL'           as SubFilter, label: 'Semua', count: countNeedShip },
            { key: 'READY_TO_SHIP' as SubFilter, label: 'Perlu Diproses', count: countRts },
            { key: 'PROCESSED'     as SubFilter, label: 'Telah Diproses', count: countProcessed },
          ]).map(item => (
            <button
              key={item.key}
              onClick={() => setSubFilter(item.key)}
              style={{
                padding: '4px 12px', borderRadius: 20, border: '1px solid',
                fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                fontWeight: subFilter === item.key ? 600 : 400,
                background: subFilter === item.key ? 'var(--accent)' : 'var(--bg)',
                color: subFilter === item.key ? 'var(--accent-f)' : 'var(--text3)',
                borderColor: subFilter === item.key ? 'var(--accent)' : 'var(--border)',
                transition: 'all .15s',
              }}
            >
              {item.label}
              {item.count > 0 && (
                <span style={{ marginLeft: 5, opacity: subFilter === item.key ? 0.8 : 0.6, fontSize: 11 }}>
                  ({item.count})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── ORDER LIST ── */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={48} opacity={0.3} style={{ margin: '0 auto' }} /></div>
          <div className="empty-state-text">Tidak ada pesanan</div>
          <div className="empty-state-sub">Belum ada pesanan yang sesuai dengan filter ini. Coba tarik pesanan terlebih dahulu.</div>
        </div>
      ) : (
        <div>
          {/* Sticky column header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '6px 16px', marginBottom: 6,
            fontSize: 11, fontWeight: 600, color: 'var(--text4)',
            textTransform: 'uppercase', letterSpacing: '.04em',
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--bg3)',
            borderRadius: 6,
          }}>
            <div style={{ flex: 1 }}>Pembeli &amp; Produk</div>
            <div style={{ minWidth: 40, textAlign: 'center' }}>Qty</div>
            <div style={{ minWidth: 100, textAlign: 'right' }}>Total</div>
            <div style={{ minWidth: 110, textAlign: 'center' }}>Status</div>
            <div style={{ minWidth: 80, textAlign: 'center' }}>Ekspedisi</div>
          </div>

          {filtered.map((order: any) => (
            <OrderCard key={order.id} order={order} />
          ))}

          <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 12, color: 'var(--text4)' }}>
            {filtered.length} pesanan ditampilkan
          </div>
        </div>
      )}
    </div>
  );
}
