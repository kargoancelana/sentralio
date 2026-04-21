import { useState } from 'react';
import { Package, Edit3, RefreshCw, Link2, Download, Trash2, Search, CloudUpload, Unlink } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, type Column } from '../components/ui/DataTable';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { SearchBar } from '../components/ui/SearchBar';
import { Modal } from '../components/ui/Modal';
import { PageLoading } from '../components/shared/LoadingSpinner';
import { useApi, useApiMutation } from '../hooks/useApi';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import './MasterProduk.css';

function formatPrice(price: number | null | undefined): string {
  if (!price) return '-';
  return `Rp ${price.toLocaleString('id-ID')}`;
}

export function MasterProduk() {
  const { data, loading, refetch } = useApi(() => api.masterList(), []);
  const [search, setSearch] = useState('');
  const [editModal, setEditModal] = useState<any>(null);
  const [stockModal, setStockModal] = useState<any>(null);
  const [importModal, setImportModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<any>(null);
  const [linkModal, setLinkModal] = useState<any>(null);
  const { toast } = useToast();

  // Edit modal variant stocks
  const [editVariantStocks, setEditVariantStocks] = useState<Record<string, string>>({});

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStock, setBulkStock] = useState('');

  // Mutations
  const editMut = useApiMutation(async (id: number, sku: string, name: string) => {
    await api.masterUpdate(id, { sku, name });
    await refetch();
  });

  const stockMut = useApiMutation(async (id: number, stock: number) => {
    await api.masterUpdateStock(id, stock);
    await refetch();
  });

  const importMut = useApiMutation(async (itemId: string) => {
    await api.masterImport(itemId);
    await refetch();
  });

  const deleteMut = useApiMutation(async (id: number) => {
    await api.masterDelete(id);
    await refetch();
  });

  const unlinkMut = useApiMutation(async (shopeeItemId: string) => {
    await api.masterUnlink(shopeeItemId);
    await refetch();
  });

  const linkGroupMut = useApiMutation(async (masterId: number, shopeeItemId: string) => {
    await api.masterLinkGroup(masterId, shopeeItemId);
    await refetch();
  });

  const variantStockMut = useApiMutation(async (itemId: string, modelId: string, stock: number) => {
    await api.shopeeUpdateVariantStock(itemId, modelId, stock);
    await refetch();
  });

  const bulkMut = useApiMutation(async (ids: number[], stock: number) => {
    for (const id of ids) {
      await api.masterUpdateStock(id, stock);
    }
    setSelectedIds(new Set());
    setBulkStock('');
    await refetch();
  });

  if (loading) return <PageLoading />;

  const masters: any[] = data?.data || [];
  const filtered = masters.filter((m: any) =>
    m.sku.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalLinked = masters.reduce((s: number, m: any) => s + (m.linked_models?.length || 0), 0);
  const synced = masters.reduce((s: number, m: any) =>
    s + (m.linked_models?.filter((l: any) => l.syncStatus === 'success').length || 0), 0);
  const failed = masters.reduce((s: number, m: any) =>
    s + (m.linked_models?.filter((l: any) => l.syncStatus === 'failed').length || 0), 0);

  // Checkbox helpers
  const allSelected = filtered.length > 0 && filtered.every((m: any) => selectedIds.has(m.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((m: any) => m.id)));
  };
  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  function getPriceRange(master: any): string {
    const models = master.linked_models || [];
    if (models.length === 0) return '-';
    const prices = models.map((m: any) => m.price || 0).filter((p: number) => p > 0);
    if (prices.length === 0) return '-';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return formatPrice(min);
    return `${formatPrice(min)} - ${formatPrice(max)}`;
  }

  function getShopeeStock(master: any): number | null {
    const models = master.linked_models || [];
    if (models.length === 0) return null;
    return models.reduce((sum: number, m: any) => sum + (m.shopeeStock ?? 0), 0);
  }

  function openEditModal(item: any) {
    setEditModal(item);
    const stocks: Record<string, string> = {};
    for (const v of (item.linked_models || [])) {
      stocks[v.shopeeModelId] = String(v.shopeeStock ?? 0);
    }
    setEditVariantStocks(stocks);
  }

  const columns: Column<any>[] = [
    {
      key: 'select', label: '', width: '40px',
      headerRender: () => (
        <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
      ),
      render: (item) => (
        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleOne(item.id)} style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
      ),
    },
    {
      key: 'image', label: '', width: '48px',
      render: (item) => (
        <div className="master-thumb">
          {item.imageUrl
            ? <img src={item.imageUrl} alt="" />
            : <Package size={18} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          }
        </div>
      ),
    },
    { key: 'sku', label: 'SKU', render: (item) => <span style={{ fontWeight: 600, color: 'var(--accent)', fontFamily: 'monospace', fontSize: '0.8125rem' }}>{item.sku}</span> },
    { key: 'name', label: 'Nama' },
    {
      key: 'price', label: 'Harga',
      render: (item) => (
        <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>{getPriceRange(item)}</span>
      ),
    },
    {
      key: 'stock', label: 'Stok WMS',
      render: (item) => (
        <div className="stock-cell">
          <span className="stock-value">{item.stock}</span>
          <span className="stock-label">Master</span>
        </div>
      ),
    },
    {
      key: 'shopee_stock', label: 'Stok Shopee',
      render: (item) => {
        const shopeeStock = getShopeeStock(item);
        if (shopeeStock === null) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
        const isMismatch = shopeeStock !== item.stock;
        return (
          <div className="stock-cell">
            <span className={`stock-value ${isMismatch ? 'mismatch' : ''}`}>{shopeeStock}</span>
            <span className="stock-label">{isMismatch ? 'Mismatch' : 'Synced'}</span>
          </div>
        );
      },
    },
    {
      key: 'linked_models', label: 'Variasi',
      render: (item) => {
        const models = item.linked_models || [];
        if (models.length === 0) return <span style={{ color: 'var(--text-muted)' }}>0</span>;
        return <span>{models.length} variasi</span>;
      },
    },
    {
      key: 'sync', label: 'Status',
      render: (item) => {
        const models = item.linked_models || [];
        if (models.length === 0) return <StatusBadge label="No models" variant="neutral" />;
        const allSuccess = models.every((m: any) => m.syncStatus === 'success');
        const anyFailed = models.some((m: any) => m.syncStatus === 'failed');
        if (allSuccess) return <StatusBadge label="Synced" />;
        if (anyFailed) return <StatusBadge label="Failed" />;
        return <StatusBadge label="Pending" />;
      },
    },
    {
      key: 'actions', label: '', width: '160px',
      render: (item) => (
        <div className="data-table-actions">
          <Button size="sm" variant="ghost" icon={<Edit3 size={14} />} onClick={() => openEditModal(item)} />
          <Button size="sm" variant="ghost" icon={<Link2 size={14} />} onClick={() => setLinkModal(item)} />
          <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => setStockModal(item)} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleteModal(item)} />
        </div>
      ),
    },
  ];

  return (
    <div className={`master-produk animate-fade-in ${selectedIds.size > 0 ? 'has-selection' : ''}`}>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Master Produk</h1>
            <p className="page-subtitle">Kelola master produk dan sinkronisasi stok</p>
          </div>
          <div className="page-header-actions">
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => setImportModal(true)}>
              Import from Listing
            </Button>
          </div>
        </div>
      </div>

      <div className="stats-grid stagger-children">
        <StatCard label="Total Master" value={masters.length} icon={<Package size={18} />} />
        <StatCard label="Linked Models" value={totalLinked} icon={<Link2 size={18} />} />
        <StatCard label="Synced" value={synced} icon={<RefreshCw size={18} />} trend={{ value: `${Math.round((synced/Math.max(totalLinked,1))*100)}%`, type: 'positive' }} />
        <StatCard label="Failed" value={failed} trend={failed > 0 ? { value: `${failed} issues`, type: 'negative' } : { value: 'All good', type: 'positive' }} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="Belum ada master produk. Klik Import from Listing untuk memulai."
        rowClassName={(item: any) => selectedIds.has(item.id) ? 'row-selected' : ''}
        toolbar={
          <>
            <div className="data-table-toolbar-left">
              <SearchBar value={search} onChange={setSearch} placeholder="Cari SKU atau nama..." />
            </div>
            <div className="data-table-toolbar-right">
              <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={refetch}>Refresh</Button>
            </div>
          </>
        }
      />

      {/* Sticky Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-bar">
          <div className="bulk-bar-info">
            <span className="bulk-count">{selectedIds.size} produk dipilih</span>
            <span className="bulk-hint">Set stok baru untuk semua produk yang dipilih</span>
          </div>
          <div className="bulk-bar-form">
            <div className="bulk-stock-input">
              <label>Stok Baru:</label>
              <input className="form-input" type="number" min="0" max="10000" value={bulkStock} onChange={(e) => setBulkStock(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="bulk-bar-actions">
            <Button variant="secondary" onClick={() => { setSelectedIds(new Set()); setBulkStock(''); }}>Batal</Button>
            <Button variant="primary" icon={<CloudUpload size={16} />} loading={bulkMut.loading} disabled={!bulkStock || parseInt(bulkStock) < 0}
              onClick={() => bulkMut.execute(Array.from(selectedIds), parseInt(bulkStock)).then(() => toast.success('Stok berhasil diupdate')).catch((e: any) => toast.error(e.message))}
            >Update &amp; Sync</Button>
          </div>
        </div>
      )}

      {/* ─── Edit Modal (SKU, Name, Linked Groups with Unlink, Variant Stocks) ── */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Edit Master Product" width="600px">
        {editModal && (
          <div>
            {/* Product image + info header */}
            <div className="edit-modal-header" style={{ marginBottom: '16px' }}>
              <div className="edit-modal-thumb">
                {editModal.imageUrl
                  ? <img src={editModal.imageUrl} alt={editModal.name} />
                  : <Package size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                }
              </div>
              <div className="edit-modal-info">
                <div className="edit-product-name">{editModal.name}</div>
                <div className="edit-product-meta">
                  <span className="sku-tag">{editModal.sku}</span>
                  <span>{editModal.linked_models?.length || 0} variasi</span>
                </div>
              </div>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const sku = (form.elements.namedItem('sku') as HTMLInputElement).value;
              const name = (form.elements.namedItem('name') as HTMLInputElement).value;
              try {
                await editMut.execute(editModal.id, sku, name);
                toast.success('Master product berhasil diupdate');
                setEditModal(null);
              } catch (err: any) { toast.error(err.message || 'Gagal update'); }
            }}>
              <div className="form-group">
                <label className="form-label">SKU</label>
                <input className="form-input" name="sku" defaultValue={editModal.sku} required />
              </div>
              <div className="form-group">
                <label className="form-label">Nama</label>
                <input className="form-input" name="name" defaultValue={editModal.name} required />
              </div>
              <div className="form-actions">
                <Button variant="secondary" type="button" onClick={() => setEditModal(null)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={editMut.loading}>Save Changes</Button>
              </div>
            </form>

            {/* Linked Product Groups — Unlink per group */}
            {(editModal.linked_groups?.length || 0) > 0 && (
              <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Listing Terhubung
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {editModal.linked_groups.map((group: any) => (
                    <div key={group.shopeeItemId} className="linked-variant-row">
                      <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {group.imageUrl
                          ? <img src={group.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <Package size={14} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
                      </div>
                      <div className="linked-variant-info">
                        <span className="linked-variant-name">{group.name}</span>
                        <span className="linked-variant-sku">#{group.shopeeItemId}</span>
                      </div>
                      <Button size="sm" variant="ghost" icon={<Unlink size={13} />} loading={unlinkMut.loading}
                        onClick={async () => {
                          try {
                            await unlinkMut.execute(group.shopeeItemId);
                            toast.success(`Listing "${group.name}" berhasil di-unlink`);
                            const refreshed = (await api.masterList()).data?.find((m: any) => m.id === editModal.id);
                            if (refreshed) openEditModal(refreshed); else setEditModal(null);
                          } catch (err: any) { toast.error(err.message || 'Gagal unlink'); }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Variant Stock Editing */}
            {(editModal.linked_models?.length || 0) > 0 && (
              <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Stok per Variasi
                </h4>
                <div className="edit-variant-table">
                  <div className="edit-variant-table-header">
                    <span className="col-name">Variasi</span>
                    <span className="col-price">Harga</span>
                    <span className="col-stock">Stok</span>
                    <span className="col-action">Sync</span>
                  </div>
                  {editModal.linked_models.map((v: any) => (
                    <div className="edit-variant-row" key={v.shopeeModelId}>
                      <div className="edit-variant-info">
                        <div className="vname">{v.modelName || `Model ${v.shopeeModelId}`}</div>
                        {v.modelSku && <div className="vsku">{v.modelSku}</div>}
                      </div>
                      <div className="linked-variant-price">{formatPrice(v.price)}</div>
                      <div className="edit-stock-input">
                        <input className="form-input" type="number" min="0"
                          value={editVariantStocks[v.shopeeModelId] || '0'}
                          onChange={(e) => setEditVariantStocks(prev => ({ ...prev, [v.shopeeModelId]: e.target.value }))}
                        />
                      </div>
                      <div className="edit-variant-actions">
                        <Button size="sm" variant="ghost" icon={<CloudUpload size={13} />}
                          loading={variantStockMut.loading}
                          onClick={async () => {
                            const newStock = parseInt(editVariantStocks[v.shopeeModelId] || '0');
                            if (newStock < 0) return;
                            try {
                              await variantStockMut.execute(v.shopeeItemId, v.shopeeModelId, newStock);
                              toast.success(`Stok ${v.modelName || v.shopeeModelId} disync ke Shopee`);
                            } catch (err: any) { toast.error(err.message || 'Gagal sync stok'); }
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── Link Product Group Picker ── */}
      <LinkGroupPicker
        open={!!linkModal}
        master={linkModal}
        onClose={() => setLinkModal(null)}
        onLink={async (shopeeItemId: string) => {
          if (!linkModal) return;
          try {
            await linkGroupMut.execute(linkModal.id, shopeeItemId);
            toast.success('Listing berhasil di-link ke master');
            setLinkModal(null);
          } catch (err: any) { toast.error(err.message || 'Gagal link listing'); }
        }}
        linkLoading={linkGroupMut.loading}
      />

      {/* Stock Update Modal */}
      <Modal open={!!stockModal} onClose={() => setStockModal(null)} title="Update Stock">
        {stockModal && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const stock = parseInt((e.target as HTMLFormElement).stock.value);
            try {
              await stockMut.execute(stockModal.id, stock);
              toast.success('Stok berhasil disync ke Shopee');
              setStockModal(null);
            } catch (err: any) { toast.error(err.message || 'Gagal update stok'); }
          }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
              Updating stock for <strong style={{ color: 'var(--accent)' }}>{stockModal.sku}</strong> will sync to all linked Shopee models.
            </p>
            <div className="form-group">
              <label className="form-label">New Stock</label>
              <input className="form-input" name="stock" type="number" min="0" max="10000" defaultValue={stockModal.stock} required />
            </div>
            <div className="form-actions">
              <Button variant="secondary" type="button" onClick={() => setStockModal(null)}>Cancel</Button>
              <Button variant="primary" type="submit" loading={stockMut.loading}>Update &amp; Sync</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Hapus Master Product" width="420px">
        {deleteModal && (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '8px' }}>Yakin ingin menghapus master SKU:</p>
            <p style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '1.0625rem', marginBottom: '4px' }}>{deleteModal.sku}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '12px' }}>{deleteModal.name}</p>
            {(deleteModal.linked_models?.length || 0) > 0 && (
              <p style={{ color: 'var(--warning)', fontSize: '0.8125rem', marginBottom: '12px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px' }}>
                ⚠️ {deleteModal.linked_models.length} variasi Shopee yang terhubung akan dilepas (unlinked).
              </p>
            )}
            <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginBottom: '20px' }}>Tindakan ini tidak dapat dibatalkan.</p>
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setDeleteModal(null)}>Batal</Button>
              <Button variant="danger" loading={deleteMut.loading}
                onClick={async () => {
                  try { await deleteMut.execute(deleteModal.id); toast.success('Master product dihapus'); setDeleteModal(null); }
                  catch (err: any) { toast.error(err.message || 'Gagal hapus'); }
                }}>Hapus</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Import from Listing */}
      <ImportPickerModal open={importModal} onClose={() => setImportModal(false)}
        onImport={async (itemId: string) => {
          try { await importMut.execute(itemId); toast.success('Listing berhasil di-import sebagai 1 master produk'); setImportModal(false); }
          catch (err: any) { toast.error(err.message || 'Gagal import listing'); }
        }}
        importLoading={importMut.loading} importError={importMut.error}
      />
    </div>
  );
}

/* ─── Link Group Picker Modal (pick product groups, not individual variants) ── */

function LinkGroupPicker({ open, master, onClose, onLink, linkLoading }: {
  open: boolean; master: any; onClose: () => void;
  onLink: (shopeeItemId: string) => Promise<void>; linkLoading: boolean;
}) {
  const { data: catalogData, loading } = useApi(() => open ? api.shopeeCatalog() : Promise.resolve(null), [open]);
  const [pickerSearch, setPickerSearch] = useState('');

  const catalog: any[] = catalogData?.data || [];
  // Show listings that have unmapped variants
  const available = catalog.filter((item: any) => {
    const hasUnmapped = (item.variants || []).some((v: any) => !v.isMapped);
    if (!hasUnmapped) return false;
    if (!pickerSearch) return true;
    const s = pickerSearch.toLowerCase();
    return (item.name || '').toLowerCase().includes(s) || (item.itemSku || '').toLowerCase().includes(s) || (item.shopeeItemId || '').includes(s);
  });

  return (
    <Modal open={open} onClose={onClose} title={`Link Listing ke: ${master?.sku || ''}`} width="540px">
      <div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Pilih listing produk Shopee. Semua variasi di dalamnya akan otomatis di-link ke master ini.
        </p>
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="form-input" placeholder="Cari produk..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Memuat katalog...</div>
        ) : available.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Semua listing sudah ter-link.</div>
        ) : (
          <div style={{ maxHeight: '380px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {available.map((item: any) => (
              <div key={item.shopeeItemId} className="linked-variant-row" style={{ padding: '10px 12px' }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={18} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
                </div>
                <div className="linked-variant-info">
                  <span className="linked-variant-name">{item.name}</span>
                  <span className="linked-variant-sku">{item.totalVariants} variasi • {item.totalVariants - item.mappedVariants} unmapped</span>
                </div>
                <Button size="sm" variant="primary" onClick={() => onLink(item.shopeeItemId)} loading={linkLoading}>Link</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─── Import Picker Modal ──────────────────── */

function ImportPickerModal({ open, onClose, onImport, importLoading, importError }: {
  open: boolean; onClose: () => void; onImport: (itemId: string) => Promise<void>;
  importLoading: boolean; importError: string | null;
}) {
  const { data: catalogData, loading } = useApi(() => open ? api.shopeeCatalog() : Promise.resolve(null), [open]);
  const [pickerSearch, setPickerSearch] = useState('');

  const catalog: any[] = catalogData?.data || [];
  const filteredCatalog = catalog.filter((item: any) => {
    if (!pickerSearch) return true;
    const s = pickerSearch.toLowerCase();
    return (item.name || '').toLowerCase().includes(s) || (item.itemSku || '').toLowerCase().includes(s) || (item.shopeeItemId || '').includes(s);
  });

  return (
    <Modal open={open} onClose={onClose} title="Import dari Produk Shopee" width="560px">
      <div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '12px', padding: '10px 14px', background: 'rgba(232, 133, 45, 0.06)', borderRadius: '8px', border: '1px solid rgba(232, 133, 45, 0.12)' }}>
          Setiap listing akan di-import sebagai <strong>1 master produk</strong>. Semua variasi otomatis di-link.
        </p>
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="form-input" placeholder="Cari produk..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Memuat katalog...</div>
        ) : filteredCatalog.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{catalog.length === 0 ? 'Belum ada produk. Sync dari Shopee terlebih dahulu.' : 'Tidak ada hasil.'}</div>
        ) : (
          <div style={{ maxHeight: '400px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredCatalog.map((item: any) => (
              <div key={item.shopeeItemId} className="linked-variant-row" style={{ padding: '10px 12px' }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={20} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />}
                </div>
                <div className="linked-variant-info">
                  <span className="linked-variant-name">{item.name}</span>
                  <span className="linked-variant-sku">{item.itemSku && `${item.itemSku} • `}{item.totalVariants} variasi • {item.mappedVariants}/{item.totalVariants} linked</span>
                </div>
                <Button size="sm" variant="primary" onClick={() => onImport(item.shopeeItemId)} loading={importLoading}>Import</Button>
              </div>
            ))}
          </div>
        )}
        {importError && <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginTop: '12px' }}>{importError}</p>}
      </div>
    </Modal>
  );
}
