import { useState } from 'react';
import { Package, Edit3, RefreshCw, Link2, Download, Trash2, Search, CloudUpload } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, type Column } from '../components/ui/DataTable';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { SearchBar } from '../components/ui/SearchBar';
import { Modal } from '../components/ui/Modal';
import { PageLoading } from '../components/shared/LoadingSpinner';
import { useApi, useApiMutation } from '../hooks/useApi';
import { api } from '../lib/api';
import './MasterProduk.css';

export function MasterProduk() {
  const { data, loading, refetch } = useApi(() => api.masterList(), []);
  const [search, setSearch] = useState('');
  const [editModal, setEditModal] = useState<any>(null);
  const [stockModal, setStockModal] = useState<any>(null);
  const [importModal, setImportModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<any>(null);

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
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((m: any) => m.id)));
    }
  };
  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Compute Shopee stock for a master (sum of linked models' shopee_stock)
  function getShopeeStock(master: any): number | null {
    const models = master.linked_models || [];
    if (models.length === 0) return null;
    return models.reduce((sum: number, m: any) => sum + (m.shopeeStock ?? 0), 0);
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
    { key: 'sku', label: 'SKU', render: (item) => <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{item.sku}</span> },
    { key: 'name', label: 'Nama' },
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
      key: 'linked_models', label: 'Models',
      render: (item) => <span>{item.linked_models?.length || 0}</span>,
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
      key: 'actions', label: '', width: '120px',
      render: (item) => (
        <div className="data-table-actions">
          <Button size="sm" variant="ghost" icon={<Edit3 size={14} />} onClick={() => setEditModal(item)} />
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
            <Button
              variant="primary"
              icon={<CloudUpload size={16} />}
              loading={bulkMut.loading}
              disabled={!bulkStock || parseInt(bulkStock) < 0}
              onClick={() => bulkMut.execute(Array.from(selectedIds), parseInt(bulkStock))}
            >
              Update &amp; Sync
            </Button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Edit Master Product">
        {editModal && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const sku = (form.elements.namedItem('sku') as HTMLInputElement).value;
            const name = (form.elements.namedItem('name') as HTMLInputElement).value;
            await editMut.execute(editModal.id, sku, name);
            setEditModal(null);
          }}>
            <div className="form-group">
              <label className="form-label">SKU</label>
              <input className="form-input" name="sku" defaultValue={editModal.sku} required />
            </div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" name="name" defaultValue={editModal.name} required />
            </div>
            <div className="form-actions">
              <Button variant="secondary" type="button" onClick={() => setEditModal(null)}>Cancel</Button>
              <Button variant="primary" type="submit" loading={editMut.loading}>Save Changes</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Stock Update Modal */}
      <Modal open={!!stockModal} onClose={() => setStockModal(null)} title="Update Stock">
        {stockModal && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const stock = parseInt((e.target as HTMLFormElement).stock.value);
            await stockMut.execute(stockModal.id, stock);
            setStockModal(null);
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
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '8px' }}>
              Yakin ingin menghapus master SKU:
            </p>
            <p style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '1.0625rem', marginBottom: '4px' }}>
              {deleteModal.sku}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '12px' }}>
              {deleteModal.name}
            </p>
            {(deleteModal.linked_models?.length || 0) > 0 && (
              <p style={{ color: 'var(--warning)', fontSize: '0.8125rem', marginBottom: '12px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px' }}>
                ⚠️ {deleteModal.linked_models.length} model Shopee yang terhubung akan dilepas (unlinked).
              </p>
            )}
            <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginBottom: '20px' }}>
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setDeleteModal(null)}>Batal</Button>
              <Button
                variant="danger"
                loading={deleteMut.loading}
                onClick={async () => {
                  await deleteMut.execute(deleteModal.id);
                  setDeleteModal(null);
                }}
              >
                Hapus
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Import from Listing — Product Picker */}
      <ImportPickerModal
        open={importModal}
        onClose={() => setImportModal(false)}
        onImport={async (itemId: string) => {
          await importMut.execute(itemId);
          setImportModal(false);
        }}
        importLoading={importMut.loading}
        importError={importMut.error}
      />
    </div>
  );
}

/* ─── Import Picker Modal ──────────────────── */

function ImportPickerModal({ open, onClose, onImport, importLoading, importError }: {
  open: boolean;
  onClose: () => void;
  onImport: (itemId: string) => Promise<void>;
  importLoading: boolean;
  importError: string | null;
}) {
  const { data: catalogData, loading } = useApi(() => open ? api.shopeeCatalog() : Promise.resolve(null), [open]);
  const [pickerSearch, setPickerSearch] = useState('');

  const catalog: any[] = catalogData?.data || [];
  const filteredCatalog = catalog.filter((item: any) => {
    if (!pickerSearch) return true;
    const s = pickerSearch.toLowerCase();
    return (item.name || '').toLowerCase().includes(s) ||
      (item.itemSku || '').toLowerCase().includes(s) ||
      (item.shopeeItemId || '').toLowerCase().includes(s);
  });

  return (
    <Modal open={open} onClose={onClose} title="Import dari Produk Shopee" width="560px">
      <div>
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="form-input" placeholder="Cari produk..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Memuat katalog...</div>
        ) : filteredCatalog.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
            {catalog.length === 0 ? 'Belum ada produk. Sync dari Shopee terlebih dahulu.' : 'Tidak ada hasil.'}
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredCatalog.map((item: any) => (
              <div key={item.shopeeItemId} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-card)',
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-hover)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.imageUrl
                    ? <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Package size={20} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                    {item.itemSku && <span>{item.itemSku}</span>}
                    <span>{item.totalVariants} variasi</span>
                  </div>
                </div>
                <Button size="sm" variant="primary" onClick={() => onImport(item.shopeeItemId)} loading={importLoading}>
                  Import
                </Button>
              </div>
            ))}
          </div>
        )}

        {importError && <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginTop: '12px' }}>{importError}</p>}
      </div>
    </Modal>
  );
}
