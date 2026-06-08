import { useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { useApi, useApiMutation } from '../hooks/useApi';
import { api } from '../lib/api';
import { AlertTriangle, Zap, CloudSync, Loader2 } from 'lucide-react';

/* ── HELPERS ── */
function parseShopeeCallbackUrl(raw: string): { code: string; shop_id: string } | null {
  try {
    const input = raw.trim();
    let url: URL;
    if (input.startsWith('http://') || input.startsWith('https://')) {
      url = new URL(input);
    } else if (input.startsWith('?')) {
      url = new URL(`https://dummy.com${input}`);
    } else {
      url = new URL(`https://dummy.com?${input}`);
    }
    const code = url.searchParams.get('code');
    const shopId = url.searchParams.get('shop_id');
    if (code && shopId) return { code, shop_id: shopId };
    return null;
  } catch {
    return null;
  }
}

function getInitials(name: string) {
  return name ? name.substring(0, 2).toUpperCase() : 'SH';
}

/* ── STATUS BADGE ── */
function ShopStatusBadge({ connected, expired }: { connected: boolean, expired: boolean }) {
  if (connected) return <span className="badge badge-green badge-dot">Aktif</span>;
  if (expired) return <span className="badge badge-red badge-dot">Kadaluwarsa</span>;
  return <span className="badge badge-gray badge-dot">Terputus</span>;
}

/* ── CONFIRM DISCONNECT MODAL ── */
function DisconnectModal({ shop, onClose, onConfirm }: any) {
  return (
    <Modal
      open={!!shop}
      onClose={onClose}
      title="Putus Koneksi Toko"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Batal</button>
          <button className="btn btn-danger btn-sm" onClick={() => { onConfirm(shop.shop_id); onClose(); }}>
            Ya, Putuskan Koneksi
          </button>
        </>
      }
    >
      {shop && (
        <div>
          <div style={{
            background: 'var(--danger-bg, rgba(220,38,38,0.1))', border: '1px solid var(--error)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 16,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={24} style={{ color: 'var(--error)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--error)', marginBottom: 4 }}>
                Peringatan: Aksi Berisiko Tinggi
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 }}>
                Memutus koneksi akan menghapus token akses dan menghentikan semua sinkronisasi
                otomatis untuk toko ini. Data produk channel yang sudah tersimpan tidak akan ikut terhapus.
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            Anda akan memutus koneksi toko{' '}
            <strong style={{ color: 'var(--text1)' }}>{shop.shop_name}</strong>{' '}
            (Shop ID: <code style={{ fontSize: 12, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>{shop.shop_id}</code>).
            Untuk menghubungkan kembali, Anda perlu melakukan proses OAuth2 ulang.
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── SHOP CARD ── */
function ShopCard({ shop, onTest, onDisconnect, onSync, onReauth, testing, syncing }: any) {
  return (
    <div className="shop-card">
      <div className="shop-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="shop-avatar">{getInitials(shop.shop_name)}</div>
          <div>
            <div className="shop-name">{shop.shop_name}</div>
            <div className="shop-id">ID: {shop.shop_id}</div>
          </div>
        </div>
        <ShopStatusBadge connected={shop.connected} expired={shop.is_expired} />
      </div>

      <div className="shop-meta">
        <div className="shop-meta-row">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10" stroke="currentColor" strokeWidth="1.5"/><path d="M2 12h20" stroke="currentColor" strokeWidth="1.5"/></svg>
          <span>Region: ID — Platform Shopee</span>
        </div>
        <div className="shop-meta-row">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <span>Token update: {new Date(shop.updated_at).toLocaleDateString('id-ID')}</span>
        </div>
        <div className="shop-meta-row">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5"/></svg>
          <span>Token exp: <span style={{ color: shop.is_expired ? 'var(--error)' : 'var(--text3)' }}>{new Date(shop.expires_at).toLocaleDateString('id-ID')}</span></span>
        </div>
      </div>

      <div className="shop-actions" style={{ marginTop: 14 }}>
        {shop.connected ? (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => onTest(shop)} disabled={testing}>
              {testing ? <><Loader2 size={14} className="spin" /> Testing...</> : <><Zap size={14} /> Test Koneksi</>}
            </button>
            <button className="btn btn-shopee btn-sm" onClick={() => onSync(shop)} disabled={syncing}>
              {syncing ? <><Loader2 size={14} className="spin" /> Syncing...</> : <><CloudSync size={14} /> Sync Katalog</>}
            </button>
          </>
        ) : (
          <button className="btn btn-shopee btn-sm" onClick={() => onReauth()}>
            Re-Authorize
          </button>
        )}
        <button className="btn btn-danger btn-sm" onClick={() => onDisconnect(shop)}>
          Disconnect
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   PAGE
════════════════════════════════════════════ */
export function IntegrasiShopee() {
  const toast = useToast();
  const { data: credsData, loading, refetch } = useApi(() => api.shopeeCredentialsList(), []);
  
  const [disconnectShop, setDisconnectShop] = useState<any>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  // Paste Modal State
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');

  const authMut = useApiMutation(async () => {
    setShowPasteModal(true);
    setPasteUrl('');
    try {
      const result = await api.shopeeGetAuthUrl();
      window.open(result.auth_url, '_blank');
      return result;
    } catch (err: any) {
      toast(err.message || 'Gagal generate auth url', 'error');
      throw err;
    }
  });

  const exchangeMut = useApiMutation(async (code: string, shopId: string) => {
    const result = await api.shopeeExchangeToken(code, shopId);
    return result;
  });

  const testMut = useApiMutation(async () => {
    return await api.shopeeTestShop();
  });

  const syncMut = useApiMutation(async () => {
    return await api.shopeeSyncProducts();
  });

  const disconnectMut = useApiMutation(async (shopId: number) => {
    await api.shopeeDisconnect(shopId);
    await refetch();
  });

  const handleTest = async (shop: any) => {
    setTestingId(shop.shop_id);
    toast(`Menguji koneksi ${shop.shop_name}...`, 'info');
    try {
      await testMut.execute();
      toast(`Koneksi ${shop.shop_name} sukses (OK)`, 'success');
    } catch {
      toast(`Koneksi ${shop.shop_name} bermasalah`, 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleSync = async (shop: any) => {
    setSyncingId(shop.shop_id);
    toast(`Sync katalog ${shop.shop_name} dimulai...`, 'info');
    try {
      await syncMut.execute();
      toast(`Sync ${shop.shop_name} selesai. Data berhasil disinkron`, 'success');
    } catch (err: any) {
      toast(err.message || 'Sync gagal', 'error');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnectConfirm = async (shopId: number) => {
    toast('Memutus koneksi toko...', 'info');
    try {
      await disconnectMut.execute(shopId);
      toast('Toko berhasil diputus', 'warn');
    } catch (err: any) {
      toast(err.message || 'Gagal memutus koneksi', 'error');
    }
  };

  const handlePasteSubmit = async () => {
    const parsed = parseShopeeCallbackUrl(pasteUrl);
    if (!parsed) {
      toast('URL tidak valid. Pastikan ada code dan shop_id', 'error');
      return;
    }
    toast('Memproses token Shopee...', 'info');
    try {
      await exchangeMut.execute(parsed.code, parsed.shop_id);
      toast('Token berhasil disimpan! Toko terhubung.', 'success');
      setShowPasteModal(false);
      refetch();
    } catch (err: any) {
      toast(err.message || 'Gagal menukar token.', 'error');
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Memuat data integrasi...</div>;
  }

  const shops: any[] = credsData?.data || [];
  const total = shops.length;
  const active = shops.filter(s => s.connected).length;
  const expired = shops.filter(s => s.is_expired).length;

  return (
    <div className="wms-page">
      <div className="page-header">
        <div>
          <div className="page-title">Integrasi Shopee</div>
          <div className="page-subtitle">Kelola koneksi multi-toko via Shopee Open API (OAuth2)</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-shopee" onClick={() => authMut.execute()} disabled={authMut.loading}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Hubungkan Toko
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Total Toko</div>
          <div className="stat-value">{total}</div>
          <div className="stat-sub">Terhubung ke WMS</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Toko Aktif</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{active}</div>
          <div className="stat-sub">Token valid</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Token Kadaluwarsa</div>
          <div className="stat-value" style={{ color: expired > 0 ? 'var(--error)' : 'var(--text1)' }}>{expired}</div>
          <div className="stat-sub">{expired > 0 ? 'Perlu re-authorisasi segera' : 'Semua token OK'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Auto-Sync</div>
          <div className="stat-value">On</div>
          <div className="stat-sub">Webhook aktif</div>
        </div>
      </div>

      {shops.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🏪</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Belum ada toko terhubung</div>
          <div style={{ fontSize: 13, color: 'var(--text4)', marginBottom: 20 }}>Klik "Hubungkan Toko" untuk memulai proses otorisasi Shopee</div>
          <button className="btn btn-shopee" onClick={() => authMut.execute()} style={{ margin: '0 auto' }}>+ Hubungkan Toko Pertama</button>
        </div>
      ) : (
        <div className="shop-grid">
          {shops.map(shop => (
            <ShopCard
              key={shop.shop_id}
              shop={shop}
              onTest={handleTest}
              onDisconnect={setDisconnectShop}
              onSync={handleSync}
              onReauth={() => authMut.execute()}
              testing={testingId === shop.shop_id}
              syncing={syncingId === shop.shop_id}
            />
          ))}
          <div
            onClick={() => authMut.execute()}
            style={{
              border: '1.5px dashed var(--border2)', borderRadius: 10, padding: 20, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
              cursor: 'pointer', minHeight: 200, color: 'var(--text4)', transition: 'border-color .15s, color .15s',
            }}
          >
            <div style={{ fontSize: 28 }}>+</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Tambah Toko Baru</div>
          </div>
        </div>
      )}

      <DisconnectModal shop={disconnectShop} onClose={() => setDisconnectShop(null)} onConfirm={handleDisconnectConfirm} />

      <Modal open={showPasteModal} onClose={() => setShowPasteModal(false)} title="Hubungkan Toko Shopee" footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPasteModal(false)}>Tutup</button>
          <button className="btn btn-primary btn-sm" onClick={handlePasteSubmit} disabled={exchangeMut.loading || !pasteUrl}>
            {exchangeMut.loading ? 'Menyimpan...' : 'Simpan URL'}
          </button>
        </>
      }>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 16 }}>
          1. Tab baru dengan situs Shopee telah dibuka. Lakukan login dan otorisasi. <br/>
          2. Setelah otorisasi selesai, Anda akan diarahkan ke blank page atau localhost.<br/>
          3. <strong>Copy seluruh URL</strong> dari address bar halaman tersebut dan paste di bawah ini:
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Callback URL</label>
          <input
            type="text"
            className="form-input"
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            placeholder="https://localhost:5173/auth/callback?code=xxxxx&shop_id=yyyyy"
          />
        </div>
      </Modal>
    </div>
  );
}
