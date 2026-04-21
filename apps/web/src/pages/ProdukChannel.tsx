import { useState } from 'react';
import { ShoppingBag, RefreshCw, Package, Clock, Link2, Unlink, Search, Edit3 } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageLoading } from '../components/shared/LoadingSpinner';
import { useApi, useApiMutation } from '../hooks/useApi';
import { api } from '../lib/api';
import './ProdukChannel.css';

function formatPrice(price: number | null | undefined): string {
  if (!price) return '-';
  return `Rp ${price.toLocaleString('id-ID')}`;
}

function getStockClass(stock: number | null | undefined): string {
  if (!stock || stock === 0) return 'out-of-stock';
  if (stock <= 5) return 'low-stock';
  return 'in-stock';
}

type FilterMode = 'all' | 'mapped' | 'unmapped';

export function ProdukChannel() {
  const { data: catalogData, loading, refetch } = useApi(() => api.shopeeCatalog(), []);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});

  const syncMut = useApiMutation(async () => {
    await api.shopeeSyncProducts();
    await refetch();
  });

  const updateItemMut = useApiMutation(async (itemId: string, name: string) => {
    await api.shopeeUpdateItem(itemId, { name });
    await refetch();
  });

  const updatePriceMut = useApiMutation(async (itemId: string, modelId: string, price: number) => {
    await api.shopeeUpdatePrice(itemId, modelId, price);
    await refetch();
  });

  if (loading) return <PageLoading />;

  const catalog: any[] = catalogData?.data || [];

  const totalItems = catalog.length;
  const totalVariants = catalog.reduce((s, item) => s + (item.totalVariants || 0), 0);
  const totalMapped = catalog.reduce((s, item) => s + (item.mappedVariants || 0), 0);
  const totalUnmapped = totalVariants - totalMapped;

  const filtered = catalog.filter((item) => {
    const s = search.toLowerCase();
    const matchSearch = !s ||
      (item.name || '').toLowerCase().includes(s) ||
      (item.itemSku || '').toLowerCase().includes(s) ||
      (item.shopeeItemId || '').toLowerCase().includes(s) ||
      (item.variants || []).some((v: any) =>
        (v.modelName || '').toLowerCase().includes(s) ||
        (v.modelSku || '').toLowerCase().includes(s)
      );
    if (!matchSearch) return false;
    if (filter === 'mapped') return item.mappedVariants === item.totalVariants && item.totalVariants > 0;
    if (filter === 'unmapped') return item.mappedVariants < item.totalVariants;
    return true;
  });

  function openEditModal(item: any) {
    setEditItem(item);
    setEditName(item.name || '');
    const prices: Record<string, string> = {};
    for (const v of (item.variants || [])) {
      prices[v.shopeeModelId] = String(v.price || 0);
    }
    setEditPrices(prices);
  }

  async function handleSaveEdit() {
    if (!editItem) return;
    // Save name if changed
    if (editName !== editItem.name) {
      await updateItemMut.execute(editItem.shopeeItemId, editName);
    }
    // Save changed prices
    for (const v of (editItem.variants || [])) {
      const newPrice = parseInt(editPrices[v.shopeeModelId] || '0');
      if (newPrice !== v.price && newPrice > 0) {
        await updatePriceMut.execute(editItem.shopeeItemId, v.shopeeModelId, newPrice);
      }
    }
    setEditItem(null);
    await refetch();
  }

  return (
    <div className="produk-channel animate-fade-in">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Produk Channel</h1>
            <p className="page-subtitle">Katalog produk Shopee yang tersinkronisasi</p>
          </div>
          <div className="page-header-actions">
            <Button variant="primary" icon={<RefreshCw size={16} />} onClick={() => syncMut.execute()} loading={syncMut.loading}>
              Sync dari Shopee
            </Button>
          </div>
        </div>
      </div>

      <div className="stats-grid stagger-children">
        <StatCard label="Total Produk" value={totalItems} icon={<ShoppingBag size={18} />} />
        <StatCard label="Total Variasi" value={totalVariants} icon={<Package size={18} />} />
        <StatCard label="Linked" value={totalMapped} icon={<Link2 size={18} />}
          trend={{ value: totalVariants > 0 ? `${Math.round((totalMapped / totalVariants) * 100)}%` : '0%', type: 'positive' }} />
        <StatCard label="Unlinked" value={totalUnmapped} icon={<Unlink size={18} />}
          trend={totalUnmapped > 0 ? { value: 'Perlu mapping', type: 'negative' } : { value: 'Semua linked', type: 'positive' }} />
      </div>

      <div className="catalog-filter-bar">
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="form-input" placeholder="Cari produk, SKU, variasi..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>
        <div className="filter-chips">
          <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            Semua <span className="chip-count">{catalog.length}</span>
          </button>
          <button className={`filter-chip ${filter === 'mapped' ? 'active' : ''}`} onClick={() => setFilter('mapped')}>
            Linked <span className="chip-count">{catalog.filter(i => i.mappedVariants === i.totalVariants && i.totalVariants > 0).length}</span>
          </button>
          <button className={`filter-chip ${filter === 'unmapped' ? 'active' : ''}`} onClick={() => setFilter('unmapped')}>
            Unlinked <span className="chip-count">{catalog.filter(i => i.mappedVariants < i.totalVariants).length}</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="catalog-empty">
          <div className="catalog-empty-icon"><ShoppingBag size={36} /></div>
          <h3>{catalog.length === 0 ? 'Belum ada produk' : 'Tidak ada hasil'}</h3>
          <p>{catalog.length === 0 ? 'Klik "Sync dari Shopee" untuk menarik produk.' : 'Coba ubah filter atau kata kunci.'}</p>
          {catalog.length === 0 && (
            <Button variant="primary" icon={<RefreshCw size={16} />} onClick={() => syncMut.execute()} loading={syncMut.loading}>Sync dari Shopee</Button>
          )}
        </div>
      ) : (
        <div className="catalog-grid">
          {filtered.map((item: any) => (
            <div className="catalog-card" key={item.shopeeItemId}>
              <div className="catalog-card-header">
                <div className="catalog-thumbnail">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" /> : <Package size={28} className="placeholder-icon" />}
                </div>
                <div className="catalog-header-info">
                  <h3>{item.name}</h3>
                  <div className="catalog-meta">
                    {item.itemSku && <span className="catalog-sku">{item.itemSku}</span>}
                    <span className={`catalog-status-badge ${(item.itemStatus || 'NORMAL').toLowerCase()}`}>{item.itemStatus || 'NORMAL'}</span>
                    <span className="catalog-mapping-summary">
                      <Link2 size={12} /> <span className="mapped-count">{item.mappedVariants}</span>/<span className="total-count">{item.totalVariants}</span>
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" icon={<Edit3 size={14} />} onClick={() => openEditModal(item)} />
              </div>

              <div className="catalog-variants">
                {(item.variants || []).map((v: any) => (
                  <div className="variant-row" key={v.shopeeModelId}>
                    <div className="variant-name">
                      <span className="name">{v.modelName || `Model ${v.shopeeModelId}`}</span>
                      {v.modelSku && <span className="sku">{v.modelSku}</span>}
                    </div>
                    <span className="variant-price">{formatPrice(v.price)}</span>
                    <span className={`variant-stock ${getStockClass(v.shopeeStock)}`}>{v.shopeeStock ?? 0} stok</span>
                    <span className={`variant-mapping-badge ${v.isMapped ? 'linked' : 'unlinked'}`}>{v.isMapped ? (v.master?.sku || 'Linked') : 'Unmapped'}</span>
                  </div>
                ))}
              </div>

              {item.lastSync && (
                <div className="catalog-card-footer">
                  <span className="sync-time"><Clock size={12} /> Sync: {new Date(item.lastSync).toLocaleString('id-ID')}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.6875rem' }}>#{item.shopeeItemId}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {syncMut.error && <div className="sync-error" style={{ marginTop: '16px' }}><p>Sync gagal: {syncMut.error}</p></div>}

      {/* Edit Product Modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Produk" width="560px">
        {editItem && (
          <div>
            {/* Product Context Header */}
            <div className="edit-modal-header">
              <div className="edit-modal-thumb">
                {editItem.imageUrl
                  ? <img src={editItem.imageUrl} alt={editItem.name} />
                  : <Package size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                }
              </div>
              <div className="edit-modal-info">
                <div className="edit-product-name">{editItem.name}</div>
                <div className="edit-product-meta">
                  {editItem.itemSku && <span className="sku-tag">{editItem.itemSku}</span>}
                  <span className="id-tag">#{editItem.shopeeItemId}</span>
                  <span>{editItem.totalVariants} variasi</span>
                </div>
              </div>
            </div>

            {/* Product Name Edit */}
            <div className="form-group">
              <label className="form-label">Nama Produk</label>
              <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>

            {/* Variant Prices */}
            <div style={{ marginTop: '16px' }}>
              <label className="form-label" style={{ marginBottom: '10px', display: 'block' }}>Harga per Variasi</label>
              <div className="edit-variant-list">
                {(editItem.variants || []).map((v: any) => (
                  <div className="edit-variant-row" key={v.shopeeModelId}>
                    <div className="edit-variant-info">
                      <div className="vname">{v.modelName || `Model ${v.shopeeModelId}`}</div>
                      {v.modelSku && <div className="vsku">{v.modelSku}</div>}
                    </div>
                    <div className="edit-price-input">
                      <span className="currency">Rp</span>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        value={editPrices[v.shopeeModelId] || '0'}
                        onChange={(e) => setEditPrices(prev => ({ ...prev, [v.shopeeModelId]: e.target.value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(updateItemMut.error || updatePriceMut.error) && (
              <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginTop: '12px' }}>
                {updateItemMut.error || updatePriceMut.error}
              </p>
            )}

            <div className="form-actions" style={{ marginTop: '20px' }}>
              <Button variant="secondary" onClick={() => setEditItem(null)}>Batal</Button>
              <Button variant="primary" onClick={handleSaveEdit} loading={updateItemMut.loading || updatePriceMut.loading}>
                Simpan ke Shopee
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
