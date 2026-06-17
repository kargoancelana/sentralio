import { useState, useEffect } from 'react';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { useApi, useApiMutation } from '../hooks/useApi';
import { api } from '../lib/api';
import type { AutoBoostConfig, AutoBoostQueueItem, AutoBoostStatusItem, AutoBoostLog } from '../lib/api';
import { Rocket, Clock, History, Settings, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

export function AutoBoost() {
  const toast = useToast();
  const [shopId, setShopId] = useState<number | null>(null);
  
  // Fetch available shops
  const { data: shopsData } = useApi(() => api.shopeeCredentialsList(), []);
  const shops = shopsData?.data || [];
  
  useEffect(() => {
    if (shops.length > 0 && !shopId) {
      setShopId(shops[0].shop_id);
    }
  }, [shops, shopId]);

  const { data: configData, refetch: refetchConfig } = useApi(
    () => shopId ? api.autoBoostConfigGet(shopId) : Promise.reject('No shopId'),
    [shopId]
  );
  const { data: statusData, refetch: refetchStatus } = useApi(
    () => shopId ? api.autoBoostStatus(shopId) : Promise.reject('No shopId'),
    [shopId]
  );
  const { data: queueData, refetch: refetchQueue } = useApi(
    () => shopId ? api.autoBoostQueueList(shopId) : Promise.reject('No shopId'),
    [shopId]
  );
  const { data: historyData, refetch: refetchHistory } = useApi(
    () => shopId ? api.autoBoostHistory(shopId) : Promise.reject('No shopId'),
    [shopId]
  );

  const config = configData?.data as AutoBoostConfig | undefined;
  const queue = (queueData?.data || []) as AutoBoostQueueItem[];
  const history = (historyData?.data || []) as AutoBoostLog[];
  const status = (statusData?.data || []) as AutoBoostStatusItem[];

  const [activeTab, setActiveTab] = useState<'status'|'queue'|'history'|'config'>('status');

  const [now, setNow] = useState(Date.now());
  const [fetchedAt, setFetchedAt] = useState(Date.now());

  useEffect(() => {
    setFetchedAt(Date.now());
  }, [statusData]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(() => refetchStatus(), 30000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [refetchStatus]);

  const renderProduct = (shopeeItemId: number, extraSub?: React.ReactNode) => {
    const prod = catalogMap.get(shopeeItemId);
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {prod?.imageUrl ? (
          <img src={prod.imageUrl} style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} alt="Product" />
        ) : (
          <div style={{ width: 44, height: 44, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)' }} />
        )}
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text1)' }}>{prod?.name || `Item ID: ${shopeeItemId}`}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            ID: {shopeeItemId}
            {extraSub && <> • {extraSub}</>}
          </div>
        </div>
      </div>
    );
  };

  // Master Toggle
  const toggleMut = useApiMutation(async (enabled: boolean) => {
    if (!shopId) return;
    await api.autoBoostConfigUpdate({ shopId, enabled: enabled ? 1 : 0 });
    await refetchConfig();
  });

  const handleToggle = async () => {
    const isEnabled = config?.enabled === 1;
    try {
      await toggleMut.execute(!isEnabled);
      toast(`Naikkan Produk ${!isEnabled ? 'diaktifkan' : 'dinonaktifkan'}`, 'success');
    } catch (err: any) {
      toast(err.message || 'Gagal mengubah status', 'error');
    }
  };

  const configMut = useApiMutation(async (data: Partial<AutoBoostConfig>) => {
    if (!shopId) return;
    await api.autoBoostConfigUpdate({ shopId, ...data });
    await refetchConfig();
  });

  const handleConfigChange = async (data: Partial<AutoBoostConfig>) => {
    try {
      await configMut.execute(data);
      toast('Pengaturan berhasil disimpan', 'success');
    } catch (err: any) {
      toast(err.message || 'Gagal menyimpan pengaturan', 'error');
    }
  };

  // Queue Management
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: catalogData } = useApi(() => shopId ? api.shopeeCatalog() : Promise.resolve({ success: true, data: [] }), [shopId]);
  const catalog = catalogData?.data || [];
  
  const catalogMap = new Map(
    catalog.filter((p: any) => p.shopId === shopId)
           .map((p: any) => [Number(p.shopeeItemId), p])
  );
  const [search, setSearch] = useState('');

  const addMut = useApiMutation(async (shopeeItemId: number) => {
    if (!shopId) return;
    await api.autoBoostQueueAdd(shopId, shopeeItemId);
    await refetchQueue();
  });

  const handleAdd = async (shopeeItemId: number) => {
    try {
      await addMut.execute(shopeeItemId);
      toast('Produk ditambahkan ke antrian', 'success');
      setPickerOpen(false);
    } catch (err: any) {
      toast(err.message || 'Gagal menambahkan produk', 'error');
    }
  };

  const removeMut = useApiMutation(async (id: number) => {
    await api.autoBoostQueueRemove(id);
    await refetchQueue();
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  const confirmDelete = (id: number) => {
    setItemToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleRemove = async () => {
    if (itemToDelete === null) return;
    try {
      await removeMut.execute(itemToDelete);
      toast('Produk dihapus dari antrian', 'success');
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      toast(err.message || 'Gagal menghapus produk', 'error');
    }
  };

  const reorderMut = useApiMutation(async (orderedIds: number[]) => {
    if (!shopId) return;
    await api.autoBoostQueueReorder(shopId, orderedIds);
    await refetchQueue();
  });

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const newQueue = [...queue];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newQueue.length) return;

    const temp = newQueue[index];
    newQueue[index] = newQueue[targetIndex];
    newQueue[targetIndex] = temp;

    try {
      await reorderMut.execute(newQueue.map(item => item.id));
    } catch (err: any) {
      toast('Gagal mengurutkan antrian', 'error');
    }
  };

  // Stats
  const slotsUsed = status.length;
  const queueCount = queue.length;
  const todayBoosts = history.filter(h => new Date(h.boostedAt).toDateString() === new Date().toDateString()).length;

  return (
    <div className="wms-page">
      <div className="page-header">
        <div>
          <div className="page-title">Naikkan Produk</div>
          <div className="page-subtitle">Rotasi produk otomatis tiap ~5 menit, dengan cooldown 4 jam per produk (maks. 5 slot).</div>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            value={shopId || ''} 
            onChange={(e) => setShopId(Number(e.target.value))}
            className="form-input"
            style={{ width: 160 }}
          >
            {shops.map((s: any) => (
              <option key={s.shop_id} value={s.shop_id}>{s.shop_name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>Status: <strong style={{ color: config?.enabled === 1 ? 'var(--accent)' : 'var(--text3)' }}>{config?.enabled === 1 ? 'Aktif' : 'Nonaktif'}</strong></span>
            <button
              onClick={handleToggle}
              disabled={toggleMut.loading || !config}
              className={`switch ${config?.enabled === 1 ? 'on' : ''}`}
            >
              <span className="switch-knob" />
            </button>
          </div>
        </div>
      </div>

      {config && config.enabled !== 1 && (
        <div style={{ padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, marginBottom: 24, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>⚠️</span> Naikkan Produk nonaktif — rotasi tidak berjalan. Aktifkan toggle di kanan atas.
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Slot Shopee Terpakai</div>
          <div className="stat-value" style={{ color: slotsUsed >= 5 ? 'var(--danger)' : 'var(--text1)' }}>{slotsUsed} / 5</div>
          <div className="stat-sub">Maksimal 5 produk secara bersamaan</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Produk di Antrian</div>
          <div className="stat-value">{queueCount}</div>
          <div className="stat-sub">Rotasi berlanjut saat slot tersedia</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Boost Hari Ini</div>
          <div className="stat-value">{todayBoosts}</div>
          <div className="stat-sub">Total aktivitas boost hari ini</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="toolbar-left">
          <div className="filter-tabs">
            <button className={`filter-tab ${activeTab === 'status' ? 'active' : ''}`} onClick={() => setActiveTab('status')}><Rocket size={14} style={{ marginRight: 6 }}/> Sedang Di-Boost</button>
            <button className={`filter-tab ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}><Clock size={14} style={{ marginRight: 6 }}/> Antrian Rotasi</button>
            <button className={`filter-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}><History size={14} style={{ marginRight: 6 }}/> Riwayat</button>
            <button className={`filter-tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}><Settings size={14} style={{ marginRight: 6 }}/> Pengaturan</button>
          </div>
        </div>
        <div className="toolbar-right">
          {history.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Terakhir dijalankan: {new Date(history[0].boostedAt).toLocaleString()}</span>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', borderTop: 'none', padding: 20, minHeight: 400 }}>
        {activeTab === 'status' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, color: 'var(--text1)' }}>Produk Sedang Di-Boost</h3>
              <span style={{ fontSize: 13, color: 'var(--text3)' }}>{slotsUsed}/5 slot terpakai</span>
            </div>
            {status.length === 0 ? (
              <div className="empty-state">Belum ada produk yang sedang di-boost. Pastikan toggle diaktifkan dan ada produk di antrian.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {status.map(item => {
                  const elapsed = (now - fetchedAt) / 1000;
                  const remaining = Math.max(0, item.cooldownSecond - elapsed);
                  const j = Math.floor(remaining / 3600);
                  const m = Math.floor((remaining % 3600) / 60);
                  const d = Math.floor(remaining % 60);
                  const formatted = `${j}j ${m}m ${String(d).padStart(2, '0')}d`;
                  
                  return (
                    <div key={item.shopeeItemId} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {renderProduct(item.shopeeItemId)}
                        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Status: <span style={{ color: item.boosted ? 'var(--success)' : 'var(--text3)' }}>{item.boosted ? 'Sedang Di-Boost' : 'Menunggu'}</span></div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {remaining > 0 ? (
                          <div className="badge badge-blue" style={{ fontFamily: 'monospace', fontSize: 14, padding: '4px 10px' }}>
                            {formatted}
                          </div>
                        ) : (
                          <div className="badge badge-green" style={{ fontSize: 14, padding: '4px 10px' }}>Siap</div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 4 }}>Cooldown</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'queue' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, color: 'var(--text1)' }}>Antrian Rotasi</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setPickerOpen(true)}><Plus size={14}/> Tambah Produk</button>
            </div>
            {queue.length === 0 ? (
              <div className="empty-state">Belum ada produk di antrian.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {queue.map((item, idx) => (
                  <div key={item.id} style={{ padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
                        {idx + 1}
                      </div>
                      <div>
                        {renderProduct(item.shopeeItemId, `Terakhir di-boost: ${item.lastBoostedAt ? new Date(item.lastBoostedAt).toLocaleString() : 'Belum pernah'}`)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-xs" disabled={idx === 0 || reorderMut.loading} onClick={() => moveItem(idx, 'up')}><ArrowUp size={14}/></button>
                      <button className="btn btn-ghost btn-xs" disabled={idx === queue.length - 1 || reorderMut.loading} onClick={() => moveItem(idx, 'down')}><ArrowDown size={14}/></button>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={() => confirmDelete(item.id)} disabled={removeMut.loading}><Trash2 size={14}/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text1)' }}>Riwayat Boost</h3>
            {history.length === 0 ? (
              <div className="empty-state">Belum ada riwayat aktivitas.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 8px' }}>Waktu</th>
                      <th style={{ padding: '10px 8px' }}>Item ID Shopee</th>
                      <th style={{ padding: '10px 8px' }}>Status</th>
                      <th style={{ padding: '10px 8px' }}>Pesan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{new Date(item.boostedAt).toLocaleString()}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--text1)' }}>{item.shopeeItemId}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: item.status === 'success' ? '#D1FAE5' : '#FEE2E2', color: item.status === 'success' ? '#065F46' : '#991B1B' }}>
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', color: 'var(--text3)' }}>{item.message || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'config' && (
          <div style={{ maxWidth: 500 }}>
            <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text1)' }}>Pengaturan Rotasi</h3>
            
            {!config ? (
              <div className="empty-state">Gagal memuat pengaturan, coba refresh.</div>
            ) : (
              <div style={{ opacity: configMut.loading ? 0.7 : 1, pointerEvents: configMut.loading ? 'none' : 'auto' }}>
                <div className="form-group">
                  <label className="form-label">Mode Rotasi</label>
                  <select className="form-input" value={config.mode} onChange={e => {
                    handleConfigChange({ mode: e.target.value as any });
                  }}>
                    <option value="rotation">Rotasi Berurutan (Rekomendasi)</option>
                    <option value="fixed">Tetap (5 Produk Teratas Saja)</option>
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Jam Aktif Mulai</label>
                    <select className="form-input" value={config.activeHourStart} onChange={e => {
                      handleConfigChange({ activeHourStart: Number(e.target.value) });
                    }}>
                      {Array.from({ length: 24 }).map((_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Jam Aktif Selesai</label>
                    <select className="form-input" value={config.activeHourEnd} onChange={e => {
                      handleConfigChange({ activeHourEnd: Number(e.target.value) });
                    }}>
                      {Array.from({ length: 24 }).map((_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <p className="form-hint">Naikkan Produk hanya akan memicu rotasi produk selama jam aktif (WIB).</p>
                <p className="form-hint" style={{ marginTop: 8, color: 'var(--accent)' }}>Info: Shopee menerapkan cooldown 4 jam setelah setiap produk di-boost.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Pilih Produk dari Channel" size="lg">
        <div style={{ marginBottom: 16 }}>
          <input className="form-input" placeholder="Cari nama produk / ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {catalog.filter((p: any) => p.shopId === shopId && (p.name?.toLowerCase().includes(search.toLowerCase()) || String(p.shopeeItemId).includes(search))).map((p: any) => (
            <div key={p.shopeeItemId} style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {p.imageUrl ? <img src={p.imageUrl} style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} alt="Product" /> : <div style={{ width: 40, height: 40, background: 'var(--bg3)', borderRadius: 4 }} />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>ID: {p.shopeeItemId}</div>
                </div>
              </div>
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={() => handleAdd(Number(p.shopeeItemId))}
                disabled={addMut.loading || queue.some(q => q.shopeeItemId === Number(p.shopeeItemId))}
              >
                {queue.some(q => q.shopeeItemId === Number(p.shopeeItemId)) ? 'Ditambahkan' : 'Tambah'}
              </button>
            </div>
          ))}
          {catalog.filter((p: any) => p.shopId === shopId).length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>Tidak ada produk di toko ini.</div>
          )}
        </div>
      </Modal>
      <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title="Hapus dari Antrian">
        <div style={{ marginBottom: 20, color: 'var(--text2)' }}>Apakah Anda yakin ingin menghapus produk ini dari antrian rotasi?</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setDeleteConfirmOpen(false)}>Batal</button>
          <button className="btn btn-danger" onClick={() => handleRemove()} disabled={removeMut.loading}>Hapus</button>
        </div>
      </Modal>
    </div>
  );
}
