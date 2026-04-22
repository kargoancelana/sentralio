import { useState, useMemo } from 'react';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { useApi, useApiMutation } from '../hooks/useApi';
import { api } from '../lib/api';

import { Package, Edit3, RefreshCw, Info, Lock } from 'lucide-react';

/* ── PRODUCT IMAGE PLACEHOLDER ── */
function ProductThumb({ name, imageUrl }: { name: string; imageUrl?: string }) {
  if (imageUrl) {
    return (
      <div style={{ aspectRatio: '1/1', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <img src={imageUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={{
      aspectRatio: '1/1', background: 'var(--bg3)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', color: 'var(--text4)'
    }}>
      <Package size={40} strokeWidth={1.5} opacity={0.6} />
    </div>
  );
}

/* ── EDIT MODAL ── */
function EditModal({ product, onClose, onSave, saving }: any) {
  const [variants, setVariants] = useState<any[]>([]);

  // Init variants on mount
  useMemo(() => {
    if (product) {
      setVariants(product.variants.map((v: any) => ({
        id: v.shopeeModelId,
        varName: v.modelName || 'Default',
        msku: v.modelSku || '',
        stock: v.shopeeStock ?? 0,
        origPrice: v.price,
      })));
    }
  }, [product]);

  const updateVariant = (id: string, field: string, value: any) => {
    setVariants(vs => vs.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const handleFocus = (e: any) => e.target.select();

  const handleSave = () => {
    onSave(product, variants);
  };

  if (!product) return null;

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title="Edit Produk Channel"
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Batal</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Loading...' : 'Simpan Perubahan'}
          </button>
        </>
      }
    >
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Lock size={14} /> Read-Only — Data dari Shopee</div>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nama Produk</label>
            <input className="form-input readonly" value={product.name} readOnly />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">SKU Induk</label>
            <input className="form-input readonly" value={product.itemSku || ''} readOnly />
          </div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Edit3 size={14} /> Live Edit — MSKU & Stok Variasi</div>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table className="variant-table">
            <thead>
              <tr>
                <th>Nama Variasi</th>
                <th>MSKU (Master SKU)</th>
                <th style={{ textAlign: 'right' }}>Stok</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td style={{ color: 'var(--text3)', fontSize: 12.5 }}>{v.varName}</td>
                  <td>
                    <input
                      className="variant-input"
                      value={v.msku}
                      placeholder="Masukkan MSKU..."
                      onChange={e => updateVariant(v.id, 'msku', e.target.value)}
                      style={{ textAlign: 'left' }}
                      disabled={saving}
                    />
                  </td>
                  <td>
                    <input
                      className="variant-input"
                      type="number"
                      min="0"
                      value={v.stock}
                      onFocus={handleFocus}
                      onChange={e => {
                        const strVal = e.target.value;
                        const val = strVal === '' ? 0 : parseInt(strVal, 10);
                        updateVariant(v.id, 'stock', val);
                      }}
                      disabled={saving}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="form-hint" style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
           <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} /> 
           <span>MSKU digunakan untuk mapping ke Master Produk. Stok akan disinkronkan ke Shopee sesuai nilai Master.</span>
        </p>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════
   PAGE
════════════════════════════════════════════ */
export function ProdukChannel() {
  const toast = useToast();
  const { data: catalogData, loading, refetch } = useApi(() => api.shopeeCatalog(), []);
  
  const [filter, setFilter] = useState('all'); // all | linked | unlinked
  const [shopFilter, setShopFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  
  const [editTarget, setEditTarget] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [reloadingId, setReloadingId] = useState<string | null>(null);

  const syncMut = useApiMutation(async () => {
    await api.shopeeSyncProducts();
    await refetch();
  });

  const handleReload = async (product: any) => {
    setReloadingId(product.shopeeItemId);
    toast(`Memuat ulang data ${product.itemSku || product.name}...`, 'info');
    try {
      // Typically we'd have a single product sync endpoint, fallback to global for now
      await syncMut.execute();
      toast(`${product.itemSku || product.name} berhasil diperbarui dari Shopee`, 'success');
    } catch {
      toast('Gagal memuat ulang data dari Shopee', 'error');
    } finally {
      setReloadingId(null);
    }
  };

  const handleSaveEdit = async (product: any, newVariants: any[]) => {
    setSavingEdit(true);
    let successCount = 0;
    try {
      for (const v of newVariants) {
        const orig = product.variants.find((ov: any) => ov.shopeeModelId === v.id);
        if (!orig) continue;

        let changed = false;
        if (v.msku !== (orig.modelSku || '')) {
          await api.shopeeUpdateModel(product.shopeeItemId, v.id, { model_sku: v.msku });
          changed = true;
        }

        if (v.stock !== orig.shopeeStock) {
          await api.shopeeUpdateStock(product.shopeeItemId, v.id, v.stock);
          changed = true;
        }

        if (changed) successCount++;
      }

      if (successCount > 0) {
        toast(`Berhasil update ${successCount} variasi.`, 'success');
        await refetch();
      } else {
        toast('Tidak ada perubahan', 'info');
      }
      setEditTarget(null);
    } catch (err: any) {
      toast(err.message || 'Gagal menyimpan perubahan.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Memuat produk channel...</div>;
  }

  const products: any[] = catalogData?.data || [];

  const SHOPS = [{ id: 'all', label: 'Semua Toko' }];
  for (const p of products) {
    if (p.shopId && !SHOPS.some(s => s.id === p.shopId)) {
      SHOPS.push({ id: p.shopId, label: `Toko #${p.shopId}` });
    }
  }

  const totalProducts = products.length;
  const totalVariants = products.reduce((s, p) => s + (p.totalVariants || p.variants?.length || 0), 0);
  const linked = products.filter(p => p.mappedVariants && p.mappedVariants === p.totalVariants && p.totalVariants > 0).length;
  const unlinked = products.filter(p => !p.mappedVariants || p.mappedVariants < p.totalVariants).length;
  const linkedPct = totalProducts > 0 ? Math.round((linked / totalProducts) * 100) : 0;

  const filtered = products
      .filter(p => filter === 'all' ? true : filter === 'linked' ? (p.mappedVariants === p.totalVariants && p.totalVariants > 0) : (p.mappedVariants < p.totalVariants || !p.mappedVariants))
      .filter(p => shopFilter === 'all' ? true : p.shopId === shopFilter)
      .filter(p => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (p.name || '').toLowerCase().includes(q) || (p.itemSku || '').toLowerCase().includes(q) || p.shopeeItemId?.toLowerCase().includes(q);
      });

  return (
    <div className="wms-page">
      <div className="page-header">
        <div>
          <div className="page-title">Produk Channel</div>
          <div className="page-subtitle">Raw data Shopee — parkir sebelum dipetakan ke Master Produk</div>
        </div>
        <div className="page-actions">
           <button className="btn btn-shopee" onClick={() => syncMut.execute()} disabled={syncMut.loading}>
            {syncMut.loading ? 'Syncing...' : 'Sinkronkan Sekarang'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Produk</div>
          <div className="stat-value">{totalProducts}</div>
          <div className="stat-sub">Dari {SHOPS.length - 1} toko aktif</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Variasi</div>
          <div className="stat-value">{totalVariants}</div>
          <div className="stat-sub">Kombinasi semua produk</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ter-Link (Mapped)</div>
          <div className="stat-value" style={{ color: '#16A34A' }}>{linked}</div>
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${linkedPct}%`, background: '#16A34A' }} /></div>
          <div className="stat-sub" style={{ color: '#16A34A' }}>▲ {linkedPct}% terpetakan</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Belum Ter-Link</div>
          <div className="stat-value" style={{ color: unlinked > 0 ? '#DC2626' : 'var(--text1)' }}>{unlinked}</div>
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${totalProducts > 0 ? Math.round((unlinked / totalProducts) * 100) : 0}%`, background: unlinked > 0 ? '#EF4444' : '#E5E7EB' }} /></div>
          <div className="stat-sub" style={{ color: unlinked > 0 ? '#DC2626' : 'var(--text4)' }}>{unlinked > 0 ? `Belum dipetakan` : 'Semua terpetakan'}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="filter-tabs">
            {[
              { id: 'all',      label: `Semua (${totalProducts})` },
              { id: 'linked',   label: `Linked (${linked})` },
              { id: 'unlinked', label: `Unlinked (${unlinked})` },
            ].map(f => (
              <button key={f.id} className={`filter-tab ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="search-wrap" style={{ width: 220 }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input className="search-inp" placeholder="Cari produk atau SKU..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={shopFilter} onChange={e => setShopFilter(e.target.value)} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
            {SHOPS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="toolbar-right">
          <span style={{ fontSize: 12, color: 'var(--text4)' }}>{filtered.length} produk ditampilkan</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
           <div className="empty-state-icon"><Package size={48} opacity={0.3} style={{ margin: '0 auto' }} /></div>
           <div className="empty-state-text">Tidak ada produk ditemukan</div>
           <div className="empty-state-sub">Coba ubah filter atau kata kunci pencarian</div>
        </div>
      ) : (
        <div className="product-grid">
          {filtered.map(product => {
            const isMapped = product.mappedVariants === product.totalVariants && product.totalVariants > 0;
            return (
              <div key={product.shopeeItemId} className="prod-card">
                <ProductThumb name={product.name || ''} imageUrl={product.imageUrl} />
                <div className="prod-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                    <span className={`badge ${product.status === 'NORMAL' ? 'badge-green' : 'badge-gray'}`}>{product.status}</span>
                    <span className={`badge ${isMapped ? 'badge-blue' : 'badge-yellow'}`}>{isMapped ? `Ter-link ${product.mappedVariants}` : 'Unlinked'}</span>
                  </div>
                  <div className="prod-name" title={product.name}>{product.name}</div>
                  <div className="prod-sku">{product.itemSku || product.shopeeItemId}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text4)', marginBottom: 10 }}>Toko #{product.shopId} · {product.totalVariants} variasi</div>
                  <div className="prod-footer">
                    <button className="btn btn-ghost btn-xs" onClick={() => setEditTarget(product)}><Edit3 size={12} /> Edit Variasi</button>
                    <button className="btn btn-ghost btn-xs" style={{ padding: '4px' }} onClick={() => handleReload(product)} disabled={reloadingId === product.shopeeItemId}>
                      <RefreshCw size={12} className={reloadingId === product.shopeeItemId ? "spin" : ""} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditModal product={editTarget} onClose={() => setEditTarget(null)} onSave={handleSaveEdit} saving={savingEdit} />
    </div>
  );
}
