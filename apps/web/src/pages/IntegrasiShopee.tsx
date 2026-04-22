import { useState, useCallback } from 'react';
import { Plus, ShieldCheck, RefreshCw, Zap, Trash2, CheckCircle, XCircle, Clock, Store, ExternalLink, ClipboardPaste, Link2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { PageLoading } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import { useApi, useApiMutation } from '../hooks/useApi';
import { api } from '../lib/api';
import './IntegrasiShopee.css';

/**
 * Parse code and shop_id from a Shopee OAuth redirect URL.
 * Expected format: https://google.com?code=xxx&shop_id=123
 */
function parseShopeeCallbackUrl(raw: string): { code: string; shop_id: string } | null {
  try {
    // Support pasting just query params or a full URL
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

export function IntegrasiShopee() {
  const { data: credsData, loading, refetch } = useApi(() => api.shopeeCredentialsList(), []);
  const [disconnectShop, setDisconnectShop] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);

  // Paste-URL modal state
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [exchangeSuccess, setExchangeSuccess] = useState<{ shop_id: number; shop_name?: string } | null>(null);

  const [authUrl, setAuthUrl] = useState<string>('');

  const authMut = useApiMutation(async () => {
    // Show modal immediately so it doesn't get blocked by navigation
    setShowPasteModal(true);
    setPasteUrl('');
    setPasteError('');
    setExchangeSuccess(null);
    setAuthUrl('');

    try {
      const result = await api.shopeeGetAuthUrl();
      setAuthUrl(result.auth_url);
      // Open in new tab after we have the URL
      window.open(result.auth_url, '_blank');
      return result;
    } catch (err) {
      throw err;
    }
  });

  const exchangeMut = useApiMutation(async (code: string, shopId: string) => {
    const result = await api.shopeeExchangeToken(code, shopId);
    return result;
  });

  const handlePasteSubmit = useCallback(async () => {
    setPasteError('');
    const parsed = parseShopeeCallbackUrl(pasteUrl);
    if (!parsed) {
      setPasteError('URL tidak valid. Pastikan URL mengandung parameter code dan shop_id.');
      return;
    }
    try {
      const result = await exchangeMut.execute(parsed.code, parsed.shop_id);
      if (result) {
        setExchangeSuccess({ shop_id: result.shop_id, shop_name: result.shop_name });
        await refetch();
        // Auto-close modal after 2 seconds
        setTimeout(() => {
          setShowPasteModal(false);
          setExchangeSuccess(null);
          setPasteUrl('');
        }, 2000);
      }
    } catch (err: any) {
      setPasteError(err.message || 'Gagal menukar token.');
    }
  }, [pasteUrl, exchangeMut, refetch]);

  const closePasteModal = useCallback(() => {
    setShowPasteModal(false);
    setPasteUrl('');
    setPasteError('');
    setExchangeSuccess(null);
  }, []);

  const testMut = useApiMutation(async () => {
    const result = await api.shopeeTestShop();
    setTestResult(result);
    return result;
  });

  const syncMut = useApiMutation(async () => {
    const result = await api.shopeeSyncProducts();
    return result;
  });

  const disconnectMut = useApiMutation(async (shopId: number) => {
    await api.shopeeDisconnect(shopId);
    await refetch();
  });

  if (loading) return <PageLoading />;

  const shops: any[] = credsData?.data || [];

  return (
    <div className="integrasi-shopee animate-fade-in">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Integrasi Shopee</h1>
            <p className="page-subtitle">Manage your connected Shopee shops</p>
          </div>
          <div className="page-header-actions">
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => authMut.execute()}
              loading={authMut.loading}
            >
              Authorize Shop
            </Button>
          </div>
        </div>
      </div>

      {/* Connected Shops List */}
      {shops.length === 0 ? (
        <EmptyState
          title="Belum ada toko terhubung"
          message='Klik "Authorize Shop" untuk menghubungkan toko Shopee Anda.'
          icon={<Store size={40} />}
          action={
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => authMut.execute()} loading={authMut.loading}>
              Authorize Shop
            </Button>
          }
        />
      ) : (
        <div className="shop-list stagger-children">
          {shops.map((shop: any) => (
            <div key={shop.shop_id} className="shop-card">
              <div className="shop-card-header">
                <div className="shop-card-icon-wrapper">
                  <div className={`shop-card-icon ${shop.connected ? 'connected' : 'disconnected'}`}>
                    {shop.connected ? <CheckCircle size={24} /> : <XCircle size={24} />}
                  </div>
                </div>
                <div className="shop-card-info">
                  <h3>{shop.shop_name}</h3>
                  <div className="shop-card-meta">
                    <span className="shop-id-badge">Shop #{shop.shop_id}</span>
                    <StatusBadge
                      label={shop.connected ? 'Connected' : shop.is_expired ? 'Expired' : 'Disconnected'}
                      variant={shop.connected ? 'success' : 'error'}
                    />
                  </div>
                </div>
              </div>

              <div className="shop-card-details">
                <div className="shop-detail">
                  <Clock size={14} />
                  <span className="shop-detail-label">Expires:</span>
                  <span className="shop-detail-value">
                    {new Date(shop.expires_at).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="shop-detail">
                  <RefreshCw size={14} />
                  <span className="shop-detail-label">Updated:</span>
                  <span className="shop-detail-value">
                    {new Date(shop.updated_at).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="shop-card-actions">
                {shop.connected ? (
                  <>
                    <Button size="sm" variant="secondary" icon={<Zap size={14} />} onClick={() => testMut.execute()} loading={testMut.loading}>
                      Test
                    </Button>
                    <Button size="sm" variant="primary" icon={<RefreshCw size={14} />} onClick={() => syncMut.execute()} loading={syncMut.loading}>
                      Sync Products
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="primary" icon={<ShieldCheck size={14} />} onClick={() => authMut.execute()} loading={authMut.loading}>
                    Re-Authorize
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={14} />}
                  onClick={() => setDisconnectShop(shop)}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div className="test-result animate-fade-in-up">
          <h3>Test Result</h3>
          <pre className="test-result-pre">{JSON.stringify(testResult, null, 2)}</pre>
        </div>
      )}

      {/* Sync Result */}
      {syncMut.error && (
        <div className="sync-error">
          <p>Sync failed: {syncMut.error}</p>
        </div>
      )}

      {/* ─── Paste URL Modal ──────────────────────────────────────── */}
      <Modal
        open={showPasteModal}
        onClose={closePasteModal}
        title="Hubungkan Toko Shopee"
        width="520px"
      >
        <div className="paste-modal-content">
          {exchangeSuccess ? (
            /* Success state */
            <div className="paste-success animate-scale-in">
              <div className="paste-success-icon">
                <CheckCircle size={48} />
              </div>
              <h3>Berhasil Terhubung!</h3>
              <p className="paste-success-detail">
                Shop ID: <strong>{exchangeSuccess.shop_id}</strong>
                {exchangeSuccess.shop_name && (
                  <> &mdash; {exchangeSuccess.shop_name}</>
                )}
              </p>
            </div>
          ) : (
            /* Input state */
            <>
              <div className="paste-steps">
                <div className="paste-step">
                  <div className="paste-step-number">1</div>
                  <div className="paste-step-text">
                    <strong>Otorisasi di Shopee</strong>
                    <span>Tab baru ke halaman otorisasi Shopee telah dibuka. Jika popup terblokir, klik link di bawah:</span>
                    {authUrl ? (
                      <a href={authUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: '0.8125rem', marginTop: '4px', display: 'inline-block', fontWeight: 500 }}>
                        Buka Halaman Otorisasi &rarr;
                      </a>
                    ) : (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '4px' }}>Memuat URL...</span>
                    )}
                  </div>
                  <ExternalLink size={16} className="paste-step-icon" />
                </div>
                <div className="paste-step">
                  <div className="paste-step-number">2</div>
                  <div className="paste-step-text">
                    <strong>Salin URL redirect</strong>
                    <span>Setelah otorisasi, Anda akan diarahkan ke halaman baru. Salin <em>seluruh URL</em> dari address bar browser.</span>
                  </div>
                  <Link2 size={16} className="paste-step-icon" />
                </div>
                <div className="paste-step">
                  <div className="paste-step-number">3</div>
                  <div className="paste-step-text">
                    <strong>Paste URL di bawah</strong>
                    <span>Tempel URL yang sudah disalin ke kolom di bawah ini.</span>
                  </div>
                  <ClipboardPaste size={16} className="paste-step-icon" />
                </div>
              </div>

              <div className="paste-input-group">
                <label htmlFor="paste-url-input" className="paste-input-label">
                  Redirect URL
                </label>
                <div className="paste-input-wrapper">
                  <input
                    id="paste-url-input"
                    type="text"
                    className="paste-input"
                    placeholder="https://google.com?code=xxxxx&shop_id=12345"
                    value={pasteUrl}
                    onChange={(e) => {
                      setPasteUrl(e.target.value);
                      setPasteError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && pasteUrl.trim()) handlePasteSubmit();
                    }}
                    autoFocus
                  />
                </div>
                {pasteError && (
                  <p className="paste-input-error">{pasteError}</p>
                )}
                {exchangeMut.error && !pasteError && (
                  <p className="paste-input-error">{exchangeMut.error}</p>
                )}
              </div>

              <div className="form-actions">
                <Button variant="secondary" onClick={closePasteModal}>
                  Batal
                </Button>
                <Button
                  variant="primary"
                  onClick={handlePasteSubmit}
                  loading={exchangeMut.loading}
                  disabled={!pasteUrl.trim()}
                >
                  Hubungkan
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Disconnect Confirmation Modal */}
      <Modal
        open={!!disconnectShop}
        onClose={() => setDisconnectShop(null)}
        title="Peringatan Disconnect Integrasi"
        width="420px"
      >
        {disconnectShop && (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '8px' }}>
              Anda akan memutus koneksi integrasi toko:
            </p>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.0625rem', marginBottom: '4px' }}>
              {disconnectShop.shop_name}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '20px' }}>
              Shop ID: {disconnectShop.shop_id}
            </p>
            <div style={{ background: 'rgba(239,68,68,0.1)', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p style={{ color: 'var(--error)', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>⚠️ Peringatan Keras</p>
              <p style={{ color: 'var(--error)', fontSize: '0.8125rem', lineHeight: 1.4 }}>
                Token dan seluruh kredensial toko Shopee ini akan dihapus secara permanen dari sistem. Manajemen Master Produk untuk toko ini mungkin tertunda hingga Anda melakukan Re-Authorize.
              </p>
            </div>
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setDisconnectShop(null)}>Batal</Button>
              <Button
                variant="danger"
                loading={disconnectMut.loading}
                onClick={async () => {
                  await disconnectMut.execute(disconnectShop.shop_id);
                  setDisconnectShop(null);
                }}
              >
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
