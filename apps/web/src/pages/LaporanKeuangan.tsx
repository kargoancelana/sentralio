import { useState } from 'react';
import { BarChart3, AlertTriangle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { PeriodPicker, getPresetRange, type PresetKey } from '../components/laporan/PeriodPicker';
import './LaporanKeuangan.css';

// ── Helpers ──

function formatRupiah(value: number): string {
  if (value == null || isNaN(value)) return 'Rp 0';
  const abs = Math.abs(Math.round(value));
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return value < 0 ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

function formatPercent(value: number): string {
  if (value == null || isNaN(value)) return '0.0%';
  return `${value.toFixed(1)}%`;
}

// ─── Timezone-safe WIB date display helper ────────────────────────────────────
//
// Reports are scoped to Asia/Jakarta calendar dates. Period selection now lives
// in the PeriodPicker component (which has its own WIB math). Here we only need
// to format the WIB date strings the backend returns.

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  // Backend returns "YYYY-MM-DDTHH:mm:ss" already in WIB. Parse the date part
  // directly so the user's browser timezone never re-interprets it.
  const datePart = dateStr.slice(0, 10);
  const [yyyy, mm, dd] = datePart.split('-');
  if (!yyyy || !mm || !dd) return dateStr;
  return `${dd}/${mm}/${yyyy}`;
}

// ── Types ──

type TabKey = 'ringkasan' | 'per-order' | 'per-toko' | 'per-produk' | 'potongan';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ringkasan', label: 'Ringkasan' },
  { key: 'per-order', label: 'Per Order' },
  { key: 'per-toko', label: 'Per Toko' },
  { key: 'per-produk', label: 'Per Produk' },
  { key: 'potongan', label: 'Rincian Potongan Marketplace' },
];

// ── Shared loading / state helpers ──

/** Skeleton grid of cards that matches the stat-card footprint, so the layout
 *  doesn't jump when real data arrives. */
function CardSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="laporan-stats">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="laporan-skel-card">
          <div className="laporan-skel-line short" />
          <div className="laporan-skel-line tall" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for table-based tabs. */
function TableSkeleton() {
  return (
    <div className="laporan-table-wrapper" style={{ padding: '16px' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="laporan-skel-line" style={{ height: 16, margin: '10px 0' }} />
      ))}
    </div>
  );
}

/** Small inline chip shown while refetching when stale data is still on screen. */
function UpdatingChip() {
  return (
    <div className="laporan-updating">
      <Loader2 size={13} className="animate-spin" />
      Memperbarui…
    </div>
  );
}

// ── Main Component ──

export function LaporanKeuangan() {
  const defaultDates = getPresetRange('30d');
  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);
  const [shopId, setShopId] = useState<number | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabKey>('ringkasan');
  const [datePreset, setDatePreset] = useState<PresetKey>('30d');

  // Shop list for filter
  const { data: shopsData } = useApi(() => api.shopeeCredentialsList(), [], 'shopee-credentials');
  const shops = shopsData?.data || [];

  const handlePeriodChange = (preset: PresetKey, start: string, end: string) => {
    setDatePreset(preset);
    setStartDate(start);
    setEndDate(end);
  };

  return (
    <div className="wms-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Laporan Keuangan</h1>
          <p className="page-subtitle">Analisis profit dan biaya per order, toko, dan produk</p>
        </div>
      </div>

      {/* Filters */}
      <div className="laporan-filters">
        <label>Periode:</label>
        <PeriodPicker
          startDate={startDate}
          endDate={endDate}
          preset={datePreset}
          onChange={handlePeriodChange}
        />
        <div className="laporan-shop-filter">
          <select value={shopId ?? ''} onChange={e => setShopId(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">Semua Toko</option>
            {shops.map((s: any) => (
              <option key={s.shop_id} value={s.shop_id}>{s.shop_name || `Shop ${s.shop_id}`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="laporan-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`laporan-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'ringkasan' && <TabRingkasan startDate={startDate} endDate={endDate} shopId={shopId} />}
      {activeTab === 'per-order' && <TabPerOrder startDate={startDate} endDate={endDate} shopId={shopId} />}
      {activeTab === 'per-toko' && <TabPerToko startDate={startDate} endDate={endDate} />}
      {activeTab === 'per-produk' && <TabPerProduk startDate={startDate} endDate={endDate} shopId={shopId} />}
      {activeTab === 'potongan' && <TabPotongan startDate={startDate} endDate={endDate} shopId={shopId} />}
    </div>
  );
}

// ── Tab: Ringkasan ──

function TabRingkasan({ startDate, endDate, shopId }: { startDate: string; endDate: string; shopId?: number }) {
  const { data, loading, error } = useApi(
    () => api.profitSummary(startDate, endDate, shopId),
    [startDate, endDate, shopId],
    `profit-summary-${startDate}-${endDate}-${shopId ?? 'all'}`
  );

  // First load (no data yet) → skeleton. Refetch with stale data → keep showing it.
  if (loading && !data?.data) return <CardSkeleton count={5} />;
  if (error && !data?.data) return <div className="laporan-error">Error: {error}</div>;
  if (!data?.data) return <EmptyState />;

  const s = data.data;

  return (
    <div>
      {loading && <UpdatingChip />}
      {s.hasUnresolvedHpp && (
        <div className="laporan-warning">
          <AlertTriangle size={16} />
          Ada produk yang belum memiliki HPP. Profit mungkin tidak akurat.
        </div>
      )}
      {(s.unmappedOrderCount ?? 0) > 0 && (
        <div className="laporan-warning">
          <AlertTriangle size={16} />
          {s.unmappedOrderCount} order belum dimapping ke Master Produk
        </div>
      )}

      {/* Ringkasan utama */}
      <div className="laporan-stats">
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Total Revenue</div>
          <div className="laporan-stat-value">{formatRupiah(s.totalRevenue)}</div>
        </div>
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Net Profit</div>
          <div className={`laporan-stat-value ${s.totalNetProfit >= 0 ? 'positive' : 'negative'}`}>
            {formatRupiah(s.totalNetProfit)}
          </div>
        </div>
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Profit Margin</div>
          <div className={`laporan-stat-value ${s.profitMarginPercent >= 0 ? 'positive' : 'negative'}`}>
            {formatPercent(s.profitMarginPercent)}
          </div>
        </div>
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Jumlah Order</div>
          <div className="laporan-stat-value">{s.orderCount ?? 0}</div>
        </div>
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Jumlah Pcs</div>
          <div className="laporan-stat-value">{s.totalQty ?? 0}</div>
        </div>
      </div>

      {/* Rincian biaya */}
      <div className="laporan-section-label">Rincian Biaya</div>
      <div className="laporan-breakdown">
        <div className="laporan-breakdown-card">
          <div className="laporan-breakdown-label">HPP (Harga Pokok)</div>
          <div className="laporan-breakdown-value">{formatRupiah(s.totalHpp)}</div>
        </div>
        <div className="laporan-breakdown-card">
          <div className="laporan-breakdown-label">Biaya Packing</div>
          <div className="laporan-breakdown-value">{formatRupiah(s.totalPackingCost)}</div>
        </div>
        <div className="laporan-breakdown-card">
          <div className="laporan-breakdown-label">Potongan Shopee</div>
          <div className="laporan-breakdown-value">{formatRupiah(s.totalShopeeDeductions)}</div>
        </div>
        <div className="laporan-breakdown-card">
          <div className="laporan-breakdown-label">Biaya Iklan</div>
          <div className="laporan-breakdown-value">{formatRupiah(s.totalAdCost ?? 0)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Per Order ──

function TabPerOrder({ startDate, endDate, shopId }: { startDate: string; endDate: string; shopId?: number }) {
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data, loading, error } = useApi(
    () => api.profitOrders(startDate, endDate, shopId, page, 20),
    [startDate, endDate, shopId, page],
    `profit-orders-${startDate}-${endDate}-${shopId ?? 'all'}-${page}`
  );

  if (loading && !data?.data) return <TableSkeleton />;
  if (error && !data?.data) return <div className="laporan-error">Error: {error}</div>;
  if (!data?.data?.orders?.length) return <EmptyState />;

  const { orders, pagination } = data.data;

  return (
    <div>
      {loading && <UpdatingChip />}
      <div className="laporan-table-wrapper">
        <table className="laporan-table">
          <thead>
            <tr>
              <th></th>
              <th>Order SN</th>
              <th>Toko</th>
              <th>Tgl Order</th>
              <th>Tgl Pencairan</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Potongan</th>
              <th className="text-right">HPP</th>
              <th className="text-right">Packing</th>
              <th className="text-right">Net Profit</th>
              <th className="text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order: any) => (
              <OrderRow
                key={order.orderSn}
                order={order}
                expanded={expandedRow === order.orderSn}
                onToggle={() => setExpandedRow(expandedRow === order.orderSn ? null : order.orderSn)}
              />
            ))}
          </tbody>
        </table>
        {pagination && (
          <div className="laporan-pagination">
            <div className="laporan-pagination-info">
              Halaman {pagination.page} dari {pagination.totalPages} ({pagination.total} order)
            </div>
            <div className="laporan-pagination-buttons">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderRow({ order, expanded, onToggle }: { order: any; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr>
        <td>
          <button className="laporan-expand-btn" onClick={onToggle}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
          {order.orderSn}
          {order.hasUnresolvedHpp === true && (
            <span className="laporan-badge-unmapped">Belum dimapping</span>
          )}
        </td>
        <td>{order.shopName || '-'}</td>
        <td>{formatDate(order.createTime)}</td>
        <td>{order.escrowReleaseTime ? formatDate(order.escrowReleaseTime) : '-'}</td>
        <td className="text-right">{formatRupiah(order.revenue)}</td>
        <td className="text-right">{formatRupiah(order.shopeeDeductions)}</td>
        <td className="text-right">{formatRupiah(order.hpp)}</td>
        <td className="text-right">{formatRupiah(order.packingCost)}</td>
        <td className={`text-right ${order.netProfit >= 0 ? 'positive' : 'negative'}`}>
          {formatRupiah(order.netProfit)}
        </td>
        <td className={`text-right ${order.profitMarginPercent >= 0 ? 'positive' : 'negative'}`}>
          {formatPercent(order.profitMarginPercent)}
        </td>
      </tr>
      {expanded && order.items?.length > 0 && (
        <tr className="laporan-expanded-row">
          <td colSpan={11}>
            <div className="laporan-item-detail">
              {order.items.map((item: any, idx: number) => (
                <div key={idx} className="laporan-item-detail-row">
                  <span>{item.itemName} {item.modelName ? `(${item.modelName})` : ''} × {item.qty}</span>
                  <span>HPP: {formatRupiah(item.hppPerUnit * item.qty)} | Packing: {formatRupiah(item.packingCostPerUnit * item.qty)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Tab: Per Toko ──

function TabPerToko({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [sortBy, setSortBy] = useState('revenue');

  const { data, loading, error } = useApi(
    () => api.profitShops(startDate, endDate, sortBy),
    [startDate, endDate, sortBy],
    `profit-shops-${startDate}-${endDate}-${sortBy}`
  );

  if (loading && !data?.data) return <TableSkeleton />;
  if (error && !data?.data) return <div className="laporan-error">Error: {error}</div>;
  if (!data?.data?.shops?.length) return <EmptyState />;

  const shops = data.data.shops;

  return (
    <div>
      {loading && <UpdatingChip />}
      <div className="laporan-controls">
        <label>Urutkan:</label>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="revenue">Revenue</option>
          <option value="netProfit">Net Profit</option>
          <option value="profitMarginPercent">Margin %</option>
          <option value="orderCount">Jumlah Order</option>
        </select>
      </div>

      <div className="laporan-table-wrapper">
        <table className="laporan-table">
          <thead>
            <tr>
              <th>Nama Toko</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Net Profit</th>
              <th className="text-right">Margin %</th>
              <th className="text-right">Jumlah Order</th>
            </tr>
          </thead>
          <tbody>
            {shops.map((shop: any) => (
              <tr key={shop.shopId}>
                <td>{shop.shopName || `Shop ${shop.shopId}`}</td>
                <td className="text-right">{formatRupiah(shop.totalRevenue)}</td>
                <td className={`text-right ${shop.totalNetProfit >= 0 ? 'positive' : 'negative'}`}>
                  {formatRupiah(shop.totalNetProfit)}
                </td>
                <td className={`text-right ${shop.profitMarginPercent >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(shop.profitMarginPercent)}
                </td>
                <td className="text-right">{shop.orderCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Per Produk ──

function TabPerProduk({ startDate, endDate, shopId }: { startDate: string; endDate: string; shopId?: number }) {
  const [groupBy, setGroupBy] = useState('msku');
  const [sortBy, setSortBy] = useState('netProfit');

  const { data, loading, error } = useApi(
    () => api.profitProducts(startDate, endDate, shopId, groupBy, sortBy),
    [startDate, endDate, shopId, groupBy, sortBy],
    `profit-products-${startDate}-${endDate}-${shopId ?? 'all'}-${groupBy}-${sortBy}`
  );

  if (loading && !data?.data) return <TableSkeleton />;
  if (error && !data?.data) return <div className="laporan-error">Error: {error}</div>;
  if (!data?.data?.products?.length) return <EmptyState />;

  const productsList = data.data.products;

  return (
    <div>
      {loading && <UpdatingChip />}
      <div className="laporan-controls">
        <label>Group by:</label>
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}>
          <option value="msku">Master SKU</option>
          <option value="product_group">Grup Produk</option>
          <option value="variation">Variasi</option>
        </select>
        <label>Urutkan:</label>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="netProfit">Net Profit</option>
          <option value="profitMarginPercent">Margin %</option>
          <option value="qtySold">Qty Terjual</option>
        </select>
      </div>

      <div className="laporan-table-wrapper">
        <table className="laporan-table">
          <thead>
            <tr>
              <th>Produk</th>
              <th>Variasi / SKU</th>
              <th className="text-right">Net Profit</th>
              <th className="text-right">Margin %</th>
              <th className="text-right">Qty Terjual</th>
              <th className="text-right">Avg Profit/Unit</th>
            </tr>
          </thead>
          <tbody>
            {productsList.map((product: any, idx: number) => (
              <tr key={idx}>
                <td>{product.productName || '-'}</td>
                <td>{product.variantName || product.modelSku || '-'}</td>
                <td className={`text-right ${product.totalNetProfit >= 0 ? 'positive' : 'negative'}`}>
                  {formatRupiah(product.totalNetProfit)}
                </td>
                <td className={`text-right ${product.profitMarginPercent >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(product.profitMarginPercent)}
                </td>
                <td className="text-right">{product.qtySold ?? 0}</td>
                <td className={`text-right ${product.avgProfitPerUnit >= 0 ? 'positive' : 'negative'}`}>
                  {formatRupiah(product.avgProfitPerUnit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Rincian Potongan Marketplace ──

function TabPotongan({ startDate, endDate, shopId }: { startDate: string; endDate: string; shopId?: number }) {
  const { data, loading, error } = useApi(
    () => api.profitDeductions(startDate, endDate, shopId),
    [startDate, endDate, shopId],
    `profit-deductions-${startDate}-${endDate}-${shopId ?? 'all'}`
  );

  if (loading && !data?.data) return <CardSkeleton count={6} />;
  if (error && !data?.data) return <div className="laporan-error">Error: {error}</div>;
  if (!data?.data) return <EmptyState />;

  const d = data.data;

  return (
    <div>
      {loading && <UpdatingChip />}
      <div className="laporan-stats">
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Biaya Administrasi</div>
          <div className="laporan-stat-value">{formatRupiah(d.totalCommission)}</div>
        </div>
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Biaya Layanan</div>
          <div className="laporan-stat-value">{formatRupiah(d.totalServiceFee)}</div>
        </div>
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Biaya Proses Pesanan</div>
          <div className="laporan-stat-value">{formatRupiah(d.totalProcessingFee)}</div>
        </div>
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Pengembalian Dana Ke Pembeli</div>
          <div className="laporan-stat-value">{formatRupiah(d.totalSellerReturnRefund)}</div>
        </div>
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Biaya Komisi AMS</div>
          <div className="laporan-stat-value">{formatRupiah(d.totalAmsCommission)}</div>
        </div>
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Ongkir Ditanggung Penjual</div>
          <div className="laporan-stat-value">{formatRupiah(d.totalFinalShippingFee ?? 0)}</div>
        </div>
      </div>

      <div className="laporan-section-label">Total</div>
      <div className="laporan-stats">
        <div className="laporan-stat-card">
          <div className="laporan-stat-label">Grand Total Potongan</div>
          <div className="laporan-stat-value negative">{formatRupiah(d.grandTotal)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Empty State ──

function EmptyState() {
  return (
    <div className="laporan-empty">
      <div className="laporan-empty-icon">
        <BarChart3 size={48} />
      </div>
      <h3>Belum ada data</h3>
      <p>Tidak ada data profit untuk periode yang dipilih.</p>
    </div>
  );
}
