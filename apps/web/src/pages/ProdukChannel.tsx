import { useState } from 'react';
import { ShoppingBag, RefreshCw, Package, Clock, Link2, Unlink, Search, Edit3, Eye, EyeOff, Save } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageLoading } from '../components/shared/LoadingSpinner';
import { useApi, useApiMutation } from '../hooks/useApi';
import { useToast } from '../components/ui/Toast';
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
type EditTab = 'info' | 'variants';

export function ProdukChannel() {
  const { data: catalogData, loading, refetch } = useApi(() => api.shopeeCatalog(), []);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  // Edit modal state
  const [editItem, setEditItem] = useState<any>(null);
  const [editTab, setEditTab] = useState<EditTab>('info');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [editStocks, setEditStocks] = useState<Record<string, string>>({});
  const [unlistConfirm, setUnlistConfirm] = useState<any>(null);

  const syncMut = useApiMutation(async () => {
    await api.shopeeSyncProducts();
    await refetch();
  });

  const updateItemMut = useApiMutation(async (itemId: string, data: { name?: string; description?: string }) => {
    await api.shopeeUpdateItem(itemId, data);
    await refetch();
  });

  const updatePriceMut = useApiMutation(async (itemId: string, modelId: string, price: number) => {
    await api.shopeeUpdatePrice(itemId, modelId, price);
    await refetch();
  });

  const updateStockMut = useApiMutation(async (itemId: string, modelId: string, stock: number) => {
    await api.shopeeUpdateVariantStock(itemId, modelId, stock);
    await refetch();
  });

  const toggleStatusMut = useApiMutation(async (itemIds: string[], unlist: boolean) => {
    await api.shopeeToggleStatus(itemIds, unlist);
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
    setEditTab('info');
    setEditName(item.name || '');
    setEditDescription(item.description || '');
    const prices: Record<string, string> = {};
    const stocks: Record<string, string> = {};
    for (const v of (item.variants || [])) {
      prices[v.shopeeModelId] = String(v.price || 0);
      stocks[v.shopeeModelId] = String(v.shopeeStock ?? 0);
    }
    setEditPrices(prices);
    setEditStocks(stocks);
  }

  async function handleSaveInfo() {
    if (!editItem) return;
    try {
      const changes: { name?: string; description?: string } = {};
      if (editName !== editItem.name) changes.name = editName;
      if (editDescription !== (editItem.description || '')) changes.description = editDescription;

      if (Object.keys(changes).length > 0) {
        await updateItemMut.execute(editItem.shopeeItemId, changes);
        toast.success('Informasi produk berhasil diupdate ke Shopee');
      } else {
        toast.info('Tidak ada perubahan');
      }
      setEditItem(null);
    } catch (err: any) {
      toast.error(err.message || 'Gagal update informasi produk');
    }
  }

  async function handleSaveVariantPrice(modelId: string) {
    if (!editItem) return;
    const newPrice = parseInt(editPrices[modelId] || '0');
    const variant = editItem.variants?.find((v: any) => v.shopeeModelId === modelId);
    if (!variant || newPrice === variant.price || newPrice <= 0) return;
    try {
      await updatePriceMut.execute(editItem.shopeeItemId, modelId, newPrice);
      toast.success(`Harga variasi berhasil diupdate`);
    } catch (err: any) {
      toast.error(err.message || 'Gagal update harga');
    }
  }

  async function handleSaveVariantStock(modelId: string) {
    if (!editItem) return;
    const newStock = parseInt(editStocks[modelId] || '0');
    const variant = editItem.variants?.find((v: any) => v.shopeeModelId === modelId);
    if (!variant || newStock === (variant.shopeeStock ?? 0) || newStock < 0) return;
    try {
      await updateStockMut.execute(editItem.shopeeItemId, modelId, newStock);
      toast.success(`Stok variasi berhasil disync ke Shopee`);
    } catch (err: any) {
      toast.error(err.message || 'Gagal update stok');
    }
  }

  async function handleToggleStatus(item: any) {
    const isNormal = (item.itemStatus || 'NORMAL') === 'NORMAL';
    if (isNormal) {
      // Unlist = dangerous, show confirmation
      setUnlistConfirm(item);
      return;
    }
    // Re-list = safe, execute directly
    try {
      await toggleStatusMut.execute([item.shopeeItemId], false);
      toast.success('Produk berhasil di-aktifkan');
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengaktifkan produk');
    }
  }

  async function confirmUnlist() {
    if (!unlistConfirm) return;
    try {
      await toggleStatusMut.execute([unlistConfirm.shopeeItemId], true);
      toast.success('Produk berhasil di-arsipkan');
      setUnlistConfirm(null);
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengarsipkan produk');
    }
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
            <Button variant="primary" icon={<RefreshCw size={16} />} onClick={() => {
              syncMut.execute().then(() => toast.success('Sync selesai')).catch((e: any) => toast.error(e.message || 'Sync gagal'));
            }} loading={syncMut.loading}>
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
                    <span className={`catalog-status-badge ${(item.itemStatus || 'NORMAL').toLowerCase()}`}>{(item.itemStatus || 'NORMAL') === 'NORMAL' ? 'AKTIF' : item.itemStatus}</span>
                    <span className="catalog-mapping-summary">
                      <Link2 size={12} /> <span className="mapped-count">{item.mappedVariants}</span>/<span className="total-count">{item.totalVariants}</span>
                    </span>
                  </div>
                </div>
                <div className="catalog-card-actions-group">
                  <Button size="sm" variant="ghost" icon={<Edit3 size={14} />} onClick={() => openEditModal(item)} />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={(item.itemStatus || 'NORMAL') === 'NORMAL' ? <EyeOff size={14} /> : <Eye size={14} />}
                    onClick={() => handleToggleStatus(item)}
                    loading={toggleStatusMut.loading}
                  />
                </div>
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

      {/* ─── Edit Product Modal (Tabbed) ────────────────── */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Produk" width="640px">
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

            {/* Tabs */}
            <div className="edit-tabs">
              <button className={`edit-tab ${editTab === 'info' ? 'active' : ''}`} onClick={() => setEditTab('info')}>
                Informasi Dasar
              </button>
              <button className={`edit-tab ${editTab === 'variants' ? 'active' : ''}`} onClick={() => setEditTab('variants')}>
                Harga &amp; Stok
              </button>
            </div>

            {/* Tab 1: Info */}
            {editTab === 'info' && (
              <div className="edit-tab-content">
                <div className="form-group">
                  <label className="form-label">
                    Nama Produk
                    <span className="char-counter">{editName.length}/255</span>
                  </label>
                  <input
                    className="form-input"
                    value={editName}
                    maxLength={255}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Deskripsi
                    <span className="char-counter">{editDescription.length}</span>
                  </label>
                  <textarea
                    className="form-input form-textarea"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={6}
                    placeholder="Masukkan deskripsi produk..."
                  />
                </div>
                <div className="form-actions" style={{ marginTop: '20px' }}>
                  <Button variant="secondary" onClick={() => setEditItem(null)}>Batal</Button>
                  <Button variant="primary" onClick={handleSaveInfo} loading={updateItemMut.loading}>
                    Simpan ke Shopee
                  </Button>
                </div>
              </div>
            )}

            {/* Tab 2: Variants — Price & Stock */}
            {editTab === 'variants' && (
              <div className="edit-tab-content">
                <div className="edit-variant-table">
                  <div className="edit-variant-table-header">
                    <span className="col-name">Variasi</span>
                    <span className="col-price">Harga (Rp)</span>
                    <span className="col-stock">Stok</span>
                    <span className="col-action">Aksi</span>
                  </div>
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
                      <div className="edit-stock-input">
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          value={editStocks[v.shopeeModelId] || '0'}
                          onChange={(e) => setEditStocks(prev => ({ ...prev, [v.shopeeModelId]: e.target.value }))}
                        />
                      </div>
                      <div className="edit-variant-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Save size={14} />}
                          loading={updatePriceMut.loading || updateStockMut.loading}
                          onClick={async () => {
                            await handleSaveVariantPrice(v.shopeeModelId);
                            await handleSaveVariantStock(v.shopeeModelId);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="form-actions" style={{ marginTop: '20px' }}>
                  <Button variant="secondary" onClick={() => setEditItem(null)}>Tutup</Button>
                </div>
              </div>
            )}

            {(updateItemMut.error || updatePriceMut.error || updateStockMut.error) && (
              <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginTop: '12px' }}>
                {updateItemMut.error || updatePriceMut.error || updateStockMut.error}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ─── Unlist Confirmation Modal ────────────────── */}
      <Modal open={!!unlistConfirm} onClose={() => setUnlistConfirm(null)} title="⚠️ Arsipkan Produk?" width="460px">
        {unlistConfirm && (
          <div>
            <div className="edit-modal-header" style={{ marginBottom: '16px' }}>
              <div className="edit-modal-thumb">
                {unlistConfirm.imageUrl
                  ? <img src={unlistConfirm.imageUrl} alt={unlistConfirm.name} />
                  : <Package size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                }
              </div>
              <div className="edit-modal-info">
                <div className="edit-product-name">{unlistConfirm.name}</div>
                <div className="edit-product-meta">
                  <span className="id-tag">#{unlistConfirm.shopeeItemId}</span>
                  <span>{unlistConfirm.totalVariants} variasi</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 16px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '10px', marginBottom: '16px' }}>
              <p style={{ color: 'var(--error)', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Peringatan: Tindakan ini berisiko!
              </p>
              <ul style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
                <li>Produk akan <strong>hilang dari pencarian Shopee</strong> dan tidak bisa dibeli pembeli.</li>
                <li>Produk yang sedang <strong>ramai orderan bisa kehilangan ranking</strong> di hasil pencarian.</li>
                <li>Produk bisa diaktifkan kembali, tapi <strong>posisi ranking mungkin tidak kembali</strong> seperti semula.</li>
              </ul>
            </div>

            <div className="form-actions">
              <Button variant="secondary" onClick={() => setUnlistConfirm(null)}>Batal</Button>
              <Button variant="danger" onClick={confirmUnlist} loading={toggleStatusMut.loading}>
                Ya, Arsipkan
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
