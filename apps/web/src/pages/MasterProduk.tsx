import { useState, useMemo, useCallback } from 'react';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { useApi, useApiMutation } from '../hooks/useApi';
import { api } from '../lib/api';
import { HppSection, type HppVariant } from '../components/hpp/HppSection';
import { HppEntryForm, type HppEntry } from '../components/hpp/HppEntryForm';
import { MasterPackingCostSection } from '../components/master-packing-cost/MasterPackingCostSection';

import { Search, Edit3, Trash2, Package, Book, Info, CloudUpload, DollarSign, Plus } from "lucide-react";

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
  const [name, setName] = useState('');
  const [variants, setVariants] = useState<any[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [variantToDelete, setVariantToDelete] = useState<any | null>(null);

  // ── HPP state ──
  const [hppFormVariantId, setHppFormVariantId] = useState<number | null>(null);
  const [hppFormEntry, setHppFormEntry] = useState<HppEntry | undefined>(undefined);
  const [hppSectionKey, setHppSectionKey] = useState(0);

  useMemo(() => {
    if (product) {
      setName(product.name || '');
      
      let uniqueVariants: any[] = [];
      if (product.variants && product.variants.length > 0) {
        uniqueVariants = product.variants.map((v: any) => ({
          dbId: v.id, // For update
          id: v.sku, // Unique key for UI
          varName: v.name,
          msku: v.sku,
          stock: v.stock,
          originalMsku: v.sku,
        }));
      } else {
        const mskus = new Set();
        for (const v of product.linked_models || []) {
          const msku = v.modelSku || '(Kosong)';
          if (!mskus.has(msku)) {
            mskus.add(msku);
            uniqueVariants.push({
              dbId: null,
              id: msku,
              varName: v.modelName || 'Default',
              msku: msku,
              stock: v.shopeeStock ?? 0,
              originalMsku: msku,
            });
          }
        }
      }
      uniqueVariants.sort((a: any, b: any) => a.varName.localeCompare(b.varName));
      setVariants(uniqueVariants);
    }
  }, [product]);

  const updateVariant = (id: string, field: string, value: any) => {
    setVariants(vs => vs.map(v => v.id === id ? { ...v, [field]: value } : v));
    if (formError) setFormError(null);
  };

  const addVariant = () => {
    // New, unsaved variant row. dbId=null marks it as an insert on save.
    const tempId = `__new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setVariants(vs => [
      ...vs,
      { dbId: null, id: tempId, varName: '', msku: '', stock: 0, originalMsku: '', isNew: true },
    ]);
  };

  const removeVariant = (id: string) => {
    setVariants(vs => vs.filter(v => v.id !== id));
    if (formError) setFormError(null);
  };

  /** Validate inline (no toast), then delegate to onSave. */
  const handleSaveClick = () => {
    // A row that has any content but no MSKU is invalid.
    const missingMsku = variants.some(
      (v) => (String(v.varName).trim() || v.dbId != null) && !String(v.msku).trim(),
    );
    if (missingMsku) {
      setFormError('MSKU belum diisi. Setiap variasi wajib memiliki MSKU sebelum disimpan.');
      return;
    }
    setFormError(null);
    onSave(product, name, variants);
  };
  
  const handleFocus = (e: any) => e.target.select();

  // ── HPP handlers ──

  // Build HppVariant list from variants that have a real DB id
  const hppVariants: HppVariant[] = variants
    .filter((v) => v.dbId !== null && v.dbId !== undefined)
    .map((v) => ({ id: v.dbId as number, name: v.varName }));

  const handleHppAddEntry = useCallback((variantId: number) => {
    setHppFormEntry(undefined);
    setHppFormVariantId(variantId);
  }, []);

  const handleHppEditEntry = useCallback((entry: HppEntry) => {
    setHppFormEntry(entry);
    setHppFormVariantId(entry.variantId);
  }, []);

  const handleHppFormSuccess = useCallback((_entry: HppEntry) => {
    setHppFormVariantId(null);
    setHppFormEntry(undefined);
    // Refresh HppSection by bumping key
    setHppSectionKey((k) => k + 1);
  }, []);

  const handleHppFormCancel = useCallback(() => {
    setHppFormVariantId(null);
    setHppFormEntry(undefined);
  }, []);

  const handleHppDeleted = useCallback(() => {
    // HppSection handles its own refresh; nothing extra needed here
  }, []);

  if (!product) return null;

  return (
    <>
      <Modal
        open={!!product}
        onClose={onClose}
        title="Edit Master Produk"
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Batal</button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveClick} disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan & Push ke Shopee'}
            </button>
          </>
        }
      >
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Book size={14} /> Data Master Produk</div>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nama Produk (Global)</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                placeholder="Nama master produk"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Master SKU</label>
              <input className="form-input readonly" value={product.sku} readOnly />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Edit3 size={14} /> Live Edit — MSKU & Stok Terpusat</div>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table className="variant-table">
              <thead>
                <tr>
                  <th>Nama Variasi</th>
                  <th>MSKU</th>
                  <th style={{ textAlign: 'right' }}>Stok Global</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const isMatch = v.msku === product.sku;
                  return (
                    <tr key={v.id}>
                      <td>
                        <input
                          className="variant-input"
                          value={v.varName}
                          placeholder="Nama variasi"
                          onChange={e => updateVariant(v.id, 'varName', e.target.value)}
                          disabled={saving}
                          style={{ textAlign: 'left' }}
                        />
                      </td>
                      <td>
                        <input 
                          className="variant-input" 
                          value={v.msku} 
                          placeholder="MSKU"
                          onChange={e => updateVariant(v.id, 'msku', e.target.value)}
                          disabled={saving} 
                          style={{
                            textAlign: 'left',
                            ...(formError && !String(v.msku).trim() && (String(v.varName).trim() || v.dbId != null)
                              ? { borderColor: '#DC2626' }
                              : {}),
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="variant-input"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={v.stock === 0 ? '' : v.stock}
                          onFocus={handleFocus}
                          onChange={e => {
                            const valStr = e.target.value.replace(/^0+/, '');
                            const val = valStr === '' ? 0 : parseInt(valStr, 10);
                            updateVariant(v.id, 'stock', val);
                          }}
                          disabled={saving}
                          title={isMatch ? '' : 'Stok tidak akan di-push karena MSKU tidak cocok'}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{ color: '#DC2626', padding: 4 }}
                          title="Hapus variasi ini"
                          onClick={() => {
                            // New, completely-empty rows can be dropped without asking.
                            const isEmptyNew = v.dbId == null && !String(v.varName).trim() && !String(v.msku).trim();
                            if (isEmptyNew) {
                              removeVariant(v.id);
                            } else {
                              setVariantToDelete(v);
                            }
                          }}
                          disabled={saving}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10 }}
            onClick={addVariant}
            disabled={saving}
          >
            <Plus size={14} style={{ marginRight: 6 }} /> Tambah Variasi
          </button>
          <p className="form-hint" style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
             <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
             <span>Saat Anda menekan "Simpan & Push", WMS akan otomatis menembakkan API Shopee Update Stock ke seluruh produk channel yang terhubung dengan MSKU di atas.</span>
          </p>

          {formError && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                padding: '10px 12px',
                background: 'var(--bg2)',
                border: '1px solid #DC2626',
                color: '#DC2626',
                borderRadius: 8,
                fontSize: 12.5,
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
              }}
            >
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{formError}</span>
            </div>
          )}
        </div>

        {/* ── HPP Section ── */}
        {hppVariants.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <DollarSign size={14} /> HPP per Variasi
            </div>
            <HppSection
              key={hppSectionKey}
              variants={hppVariants}
              onAddEntry={handleHppAddEntry}
              onEditEntry={handleHppEditEntry}
              onDeleted={handleHppDeleted}
            />
          </div>
        )}

        {/* ── Master Packing Cost Section ── */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
          <MasterPackingCostSection masterProductId={product.id} />
        </div>
      </Modal>

      {/* ── HPP Entry Form Modal ── */}
      {hppFormVariantId !== null && (
        <HppEntryForm
          variantId={hppFormVariantId}
          entry={hppFormEntry}
          onSuccess={handleHppFormSuccess}
          onCancel={handleHppFormCancel}
        />
      )}

      {/* ── Delete Variant Confirmation ── */}
      <Modal
        open={!!variantToDelete}
        onClose={() => setVariantToDelete(null)}
        title="Hapus Variasi"
      >
        {variantToDelete && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
              Yakin ingin menghapus variasi:
            </p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text1)', marginBottom: 4 }}>
              {variantToDelete.varName?.trim() || '(Tanpa nama)'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text4)', marginBottom: 12 }}>
              MSKU: {variantToDelete.msku?.trim() || '(kosong)'}
            </p>
            {variantToDelete.dbId != null && (
              <div style={{ background: 'var(--bg2)', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <p style={{ color: '#991B1B', fontSize: 12.5 }}>
                  Variasi ini dan data HPP yang terkait akan dihapus permanen setelah Anda menekan
                  "Simpan & Push". Mapping ke produk channel dengan MSKU ini juga akan dilepas.
                </p>
              </div>
            )}
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setVariantToDelete(null)} disabled={saving}>
                Batal
              </button>
              <button
                className="btn btn-danger"
                disabled={saving}
                onClick={() => {
                  removeVariant(variantToDelete.id);
                  setVariantToDelete(null);
                }}
              >
                Hapus Variasi
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}


/* ════════════════════════════════════════════
   PAGE
════════════════════════════════════════════ */
export function MasterProduk() {
  const toast = useToast();
  const { data: masterData, loading, refetch } = useApi(() => api.masterList(), []);
  
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  
  const [editTarget, setEditTarget] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  
  const editMut = useApiMutation(async (id: number, sku: string, name: string) => {
    await api.masterUpdate(id, { sku, name });
  });

  const importMut = useApiMutation(async (itemId: string) => {
    await api.masterImport(itemId);
  });

  const deleteMut = useApiMutation(async (id: number) => {
    await api.masterDelete(id);
  });

  const [importModal, setImportModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<any>(null);

  const handleSaveEdit = async (product: any, newName: string, newVariants: any[]) => {
    setSavingEdit(true);
    try {
      // 1. Update Master Product Name
      if (newName !== product.name) {
        await editMut.execute(product.id, product.sku, newName);
      }

      // 2. Update and Push Variants
      // Skip brand-new rows that are completely empty (no name + no MSKU).
      const cleanedVariants = newVariants.filter(
        (v) => !(v.dbId == null && !String(v.varName).trim() && !String(v.msku).trim()),
      );

      // Guard: a new variant must have an MSKU (used for mapping to Shopee models).
      const invalidNew = cleanedVariants.find(
        (v) => v.dbId == null && !String(v.msku).trim(),
      );
      if (invalidNew) {
        toast('Variasi baru harus memiliki MSKU.', 'error');
        setSavingEdit(false);
        return;
      }

      const payloadVariants = cleanedVariants.map(v => ({
        id: v.dbId,
        sku: String(v.msku).trim(),
        name: String(v.varName).trim() || 'Default',
        stock: v.stock,
      }));

      const res: any = await api.masterUpdateVariants(product.id, payloadVariants);
      
      let toastMsg = 'Berhasil menyimpan perubahan.';
      if (res.data?.synced_listings) {
        toastMsg += ` ${res.data.synced_listings} variasi di-push ke Shopee.`;
      }
      
      toast(toastMsg, 'success');

      // Refresh the list, then re-sync the open modal to the updated product so
      // newly-added variants (now with real DB ids) appear in the HPP section
      // and can have their HPP values filled without reopening.
      await refetch();
      try {
        const fresh: any = await api.masterList();
        const updatedProduct = (fresh?.data || []).find((p: any) => p.id === product.id);
        if (updatedProduct) {
          setEditTarget(updatedProduct);
        } else {
          setEditTarget(null);
        }
      } catch {
        // If the re-fetch fails, just keep the modal as-is.
      }
    } catch (err: any) {
      toast(err.message || 'Gagal menyimpan perubahan.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Memuat Master Produk...</div>;
  }

  const products: any[] = masterData?.data || [];

  const totalProducts = products.length;
  let linked = 0;
  let unlinked = 0;
  let skuHabis = 0;

  for (const p of products) {
    if (p.linked_models && p.linked_models.length > 0) linked++;
    else unlinked++;
    
    // Habis jika semua 0
    if (p.stock === 0) skuHabis++; 
  }
  const linkedPct = totalProducts > 0 ? Math.round((linked / totalProducts) * 100) : 0;

  const filtered = products
      .filter(p => filter === 'all' ? true : filter === 'linked' ? (p.linked_models && p.linked_models.length > 0) : (!p.linked_models || p.linked_models.length === 0))
      .filter(p => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
      });

  return (
    <div className="wms-page">
      <div className="page-header">
        <div>
          <div className="page-title">Master Produk</div>
          <div className="page-subtitle">Pusat kelola katalog dan sinkronisasi stok otomatis</div>
        </div>
        <div className="page-actions">
           <button className="btn btn-ghost" onClick={() => setImportModal(true)}>
            <CloudUpload size={14} />
            Import dari Channel
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Master SKU</div>
          <div className="stat-value">{totalProducts}</div>
          <div className="stat-sub">Item di WMS</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Terhubung ke Shopee</div>
          <div className="stat-value" style={{ color: '#1D4ED8' }}>{linked}</div>
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${linkedPct}%`, background: '#3B82F6' }} /></div>
          <div className="stat-sub" style={{ color: '#1D4ED8' }}>▲ {linkedPct}% ter-link</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Belum Terhubung</div>
          <div className="stat-value">{unlinked}</div>
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${totalProducts > 0 ? Math.round((unlinked / totalProducts) * 100) : 0}%`, background: '#E5E7EB' }} /></div>
          <div className="stat-sub">Perlu mapping manual</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stok Habis (0)</div>
          <div className="stat-value" style={{ color: skuHabis > 0 ? '#DC2626' : 'var(--text1)' }}>{skuHabis}</div>
          <div className="stat-sub" style={{ color: skuHabis > 0 ? '#DC2626' : 'var(--text4)' }}>{skuHabis > 0 ? `⚠ Butuh restock` : '✓ Stok aman'}</div>
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
        </div>
        <div className="toolbar-right">
          <div className="search-wrap" style={{ width: 260 }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input className="search-inp" placeholder="Cari master produk atau SKU..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
           <div className="empty-state-icon"><Package size={48} opacity={0.3} style={{ margin: '0 auto' }} /></div>
           <div className="empty-state-text">Tidak ada Master Produk</div>
           <div className="empty-state-sub">Belum ada data, silakan import dari Produk Channel</div>
        </div>
      ) : (
        <div className="product-grid">
          {filtered.map(product => {
            const models = product.linked_models || [];
            const isMapped = models.length > 0;
            
            let wmsStock = 0;
            if (isMapped) {
              const mskus = new Set();
              for (const v of models) {
                const msku = v.modelSku || '(Kosong)';
                if (!mskus.has(msku)) {
                  mskus.add(msku);
                  wmsStock += (v.shopeeStock ?? 0);
                }
              }
            } else {
              wmsStock = product.stock;
            }

            let badgeClass = 'badge-gray';
            let badgeText = 'Unlinked';
            
            if (isMapped) {
              if (wmsStock === 0) {
                 badgeClass = 'badge-red';
                 badgeText = 'Stok Habis';
              } else if (wmsStock <= 50) {
                 badgeClass = 'badge-orange';
                 badgeText = 'Stok Menipis';
              } else {
                 badgeClass = 'badge-green';
                 badgeText = 'Linked';
              }
            }

            return (
              <div key={product.id} className="prod-card">
                <ProductThumb name={product.name || ''} imageUrl={product.imageUrl} />
                <div className="prod-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
                    <span className={`badge ${badgeClass}`}>{isMapped ? `☁ ${badgeText}` : '⚠ Unlinked'}</span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {isMapped && (
                        <span className="badge badge-purple" style={{ padding: '0 6px' }}>🔗 {models.length} Linked SKUs</span>
                      )}
                    </div>
                  </div>
                  <div className="prod-name" title={product.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span>{product.name}</span>
                    <button className="btn btn-ghost btn-xs" style={{ color: '#DC2626', padding: 4 }} onClick={() => setDeleteModal(product)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="prod-sku">MSKU: {product.sku}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: wmsStock === 0 ? '#DC2626' : 'inherit' }}><strong>Total Stok: {wmsStock}</strong></span>
                  </div>
                  <div className="prod-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(product)} style={{ width: '100%', justifyContent: 'center' }}>
                      <Edit3 size={14} style={{ marginRight: 6 }} /> Kelola Stok & Info
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditModal product={editTarget} onClose={() => setEditTarget(null)} onSave={handleSaveEdit} saving={savingEdit} />

      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Hapus Master Produk">
        {deleteModal && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Yakin ingin menghapus master SKU:</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text1)', marginBottom: 4 }}>{deleteModal.sku}</p>
            <p style={{ fontSize: 12, color: 'var(--text4)', marginBottom: 12 }}>{deleteModal.name}</p>
            {(deleteModal.linked_models?.length || 0) > 0 && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <p style={{ color: '#991B1B', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trash2 size={14} /> {deleteModal.linked_models.length} variasi Shopee yang terhubung akan ikut dilepas otomatis.
                </p>
              </div>
            )}
            <p style={{ color: '#DC2626', fontSize: 12, marginBottom: 20 }}>Tindakan ini tidak dapat dibatalkan.</p>
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setDeleteModal(null)}>Batal</button>
              <button className="btn btn-danger" disabled={deleteMut.loading} onClick={async () => {
                  try {
                    await deleteMut.execute(deleteModal.id);
                    toast('Master produk berhasil dihapus', 'success');
                    setDeleteModal(null);
                    await refetch();
                  } catch (err: any) { toast(err.message || 'Gagal menghapus', 'error'); }
              }}>
                {deleteMut.loading ? 'Menghapus...' : 'Hapus Permanen'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ImportPickerModal open={importModal} onClose={() => setImportModal(false)}
        onImport={async (itemId: string) => {
          try {
            await importMut.execute(itemId);
            toast('Listing berhasil di-import sebagai master produk.', 'success');
            setImportModal(false);
            await refetch();
          } catch (err: any) { toast(err.message || 'Gagal import listing', 'error'); }
        }}
        importLoading={importMut.loading}
      />
    </div>
  );
}

/* ─── IMPORT PICKER MODAL ─── */
function ImportPickerModal({ open, onClose, onImport, importLoading }: any) {
  const { data: catalogData, loading } = useApi(() => open ? api.shopeeCatalog() : Promise.resolve(null), [open]);
  const [pickerSearch, setPickerSearch] = useState('');

  const catalog = catalogData?.data || [];
  const filteredCatalog = catalog.filter((item: any) =>
    item.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    (item.itemSku || '').toLowerCase().includes(pickerSearch.toLowerCase())
  );

  return (
    <Modal open={open} onClose={onClose} title="Import dari Produk Shopee" size="lg">
      <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8 }}>
        Setiap listing akan di-import sebagai <strong>1 master produk</strong>. Semua variasi otomatis di-link.
      </div>
      <div className="search-wrap" style={{ width: '100%', marginBottom: 16 }}>
        <Search size={16} />
        <input className="search-inp" placeholder="Cari nama produk atau SKU..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}>Memuat katalog Shopee...</div>
      ) : (
        <div style={{ maxHeight: 400, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredCatalog.map((item: any) => (
             <div key={item.shopeeItemId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                 <div style={{ width: 80, height: 80, flexShrink: 0, borderRadius: 6, overflow: 'hidden' }}>
                    <ProductThumb name={item.name} imageUrl={item.imageUrl} />
                 </div>
                 <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="prod-name" style={{ fontSize: 13 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text4)' }}>{item.itemSku && `${item.itemSku} • `} {item.totalVariants} variasi</div>
                 </div>
                 <button className="btn btn-primary btn-sm" onClick={() => onImport(item.shopeeItemId)} disabled={importLoading}>
                    {importLoading ? 'Memproses...' : 'Import'}
                 </button>
             </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

