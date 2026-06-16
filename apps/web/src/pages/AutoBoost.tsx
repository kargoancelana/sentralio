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

  const config = configData as unknown as { success: boolean, data: AutoBoostConfig };
  const queue = (queueData as unknown as { success: boolean, data: AutoBoostQueueItem[] })?.data || [];
  const history = (historyData as unknown as { success: boolean, data: AutoBoostLog[] })?.data || [];
  const status = (statusData as unknown as { success: boolean, data: AutoBoostStatusItem[] })?.data || [];

  const [activeTab, setActiveTab] = useState<'status'|'queue'|'history'|'config'>('status');

  // Master Toggle
  const toggleMut = useApiMutation(async (enabled: boolean) => {
    if (!shopId) return;
    await api.autoBoostConfigUpdate({ shopId, enabled: enabled ? 1 : 0 });
    await refetchConfig();
  });

  const handleToggle = async () => {
    const isEnabled = config?.data?.enabled === 1;
    try {
      await toggleMut.execute(!isEnabled);
      toast(`Auto Boost ${!isEnabled ? 'diaktifkan' : 'dinonaktifkan'}`, 'success');
    } catch (err: any) {
      toast(err.message || 'Gagal mengubah status', 'error');
    }
  };

  // Queue Management
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: catalogData } = useApi(() => pickerOpen ? api.shopeeCatalog() : Promise.resolve({ success: true, data: [] }), [pickerOpen]);
  const catalog = catalogData?.data || [];
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

  const handleRemove = async (id: number) => {
    try {
      await removeMut.execute(id);
      toast('Produk dihapus dari antrian', 'success');
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
          <div className="page-title">Auto Boost</div>
          <div className="page-subtitle">Tingkatkan visibilitas produk secara otomatis setiap 4 jam</div>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            value={shopId || ''} 
            onChange={(e) => setShopId(Number(e.target.value))}
            style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)' }}
          >
            {shops.map((s: any) => (
              <option key={s.shop_id} value={s.shop_id}>{s.shop_name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>Status:</span>
            <button
              onClick={handleToggle}
              disabled={toggleMut.loading || !config?.data}
              style={{
                position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none',
                cursor: 'pointer', background: config?.data?.enabled === 1 ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute', top: 2, left: config?.data?.enabled === 1 ? 22 : 2, width: 20, height: 20,
                  borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'left 0.2s',
                }}
              />
            </button>
          </div>
        </div>
      </div>

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
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', borderTop: 'none', padding: 20, minHeight: 400 }}>
        {activeTab === 'status' && (
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text1)' }}>Produk Sedang Di-Boost</h3>
            {status.length === 0 ? (
              <div className="empty-state">Belum ada produk yang sedang di-boost. Pastikan toggle diaktifkan dan ada produk di antrian.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {status.map(item => (
                  <div key={item.shopeeItemId} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text1)' }}>ID Produk Shopee: {item.shopeeItemId}</div>
                      <div style={{ fontSize: 13, color: 'var(--text3)' }}>Status: {item.boosted ? 'Sedang Di-Boost' : 'Menunggu'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>
                        {Math.floor(item.cooldownSecond / 3600)}j {Math.floor((item.cooldownSecond % 3600) / 60)}m
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text4)' }}>Waktu Cooldown</div>
                    </div>
                  </div>
                ))}
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
                        <div style={{ fontWeight: 600, color: 'var(--text1)' }}>Item ID: {item.shopeeItemId}</div>
                        <div style={{ fontSize: 12, color: 'var(--text4)' }}>Terakhir di-boost: {item.lastBoostedAt ? new Date(item.lastBoostedAt).toLocaleString() : 'Belum pernah'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-xs" disabled={idx === 0 || reorderMut.loading} onClick={() => moveItem(idx, 'up')}><ArrowUp size={14}/></button>
                      <button className="btn btn-ghost btn-xs" disabled={idx === queue.length - 1 || reorderMut.loading} onClick={() => moveItem(idx, 'down')}><ArrowDown size={14}/></button>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={() => handleRemove(item.id)} disabled={removeMut.loading}><Trash2 size={14}/></button>
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

        {activeTab === 'config' && config?.data && (
          <div style={{ maxWidth: 500 }}>
            <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text1)' }}>Pengaturan Rotasi</h3>
            
            <div className="form-group">
              <label className="form-label">Mode Rotasi</label>
              <select className="form-input" value={config.data.mode} onChange={e => {
                api.autoBoostConfigUpdate({ shopId: shopId!, mode: e.target.value as any }).then(refetchConfig);
              }}>
                <option value="rotation">Rotasi Berurutan (Rekomendasi)</option>
                <option value="fixed">Tetap (5 Produk Teratas Saja)</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Jam Aktif Mulai</label>
                <input className="form-input" type="number" min="0" max="23" value={config.data.activeHourStart} onChange={e => {
                  api.autoBoostConfigUpdate({ shopId: shopId!, activeHourStart: Number(e.target.value) }).then(refetchConfig);
                }} />
              </div>
              <div className="form-group">
                <label className="form-label">Jam Aktif Selesai</label>
                <input className="form-input" type="number" min="0" max="23" value={config.data.activeHourEnd} onChange={e => {
                  api.autoBoostConfigUpdate({ shopId: shopId!, activeHourEnd: Number(e.target.value) }).then(refetchConfig);
                }} />
              </div>
            </div>
            
            <p className="form-hint">Auto Boost hanya akan memicu produk selama jam aktif (zona waktu server lokal).</p>
            <p className="form-hint" style={{ marginTop: 8, color: 'var(--accent)' }}>Info: Shopee menerapkan cooldown 4 jam setelah setiap produk di-boost.</p>
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
    </div>
  );
}
