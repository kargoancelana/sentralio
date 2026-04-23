import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import './ShopeeCallback.css';

type CallbackState = 'loading' | 'success' | 'error';

export function ShopeeCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>('loading');
  const [message, setMessage] = useState('');
  const [shopInfo, setShopInfo] = useState<{ shop_id?: number; shop_name?: string } | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const shopId = searchParams.get('shop_id');

    if (!code || !shopId) {
      setState('error');
      setMessage('Parameter tidak lengkap. Pastikan URL memiliki code dan shop_id.');
      return;
    }

    // Otomatis menukar kode otorisasi (auto-exchange)
    (async () => {
      try {
        const result = await api.shopeeExchangeToken(code, shopId);
        setState('success');
        setMessage(result.message || 'Toko berhasil terhubung!');
        setShopInfo({ shop_id: result.shop_id, shop_name: result.shop_name });

        // Otomatis redirect setelah 3 detik
        setTimeout(() => navigate('/integrasi/shopee'), 3000);
      } catch (err: any) {
        setState('error');
        setMessage(err.message || 'Gagal menukar token. Silakan coba authorize ulang.');
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="callback-page">
      <div className="callback-card animate-scale-in">
        {state === 'loading' && (
          <>
            <div className="callback-icon loading">
              <Loader2 size={48} className="animate-spin" />
            </div>
            <h2>Menghubungkan ke Shopee</h2>
            <p>Sedang menukar authorization code...</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="callback-icon success">
              <CheckCircle size={48} />
            </div>
            <h2>Berhasil Terhubung!</h2>
            <p>{message}</p>
            {shopInfo && (
              <div className="callback-shop-info">
                <span>Shop ID: <strong>{shopInfo.shop_id}</strong></span>
                {shopInfo.shop_name && <span>Nama: <strong>{shopInfo.shop_name}</strong></span>}
              </div>
            )}
            <p className="callback-redirect-text">Mengalihkan ke halaman integrasi dalam 3 detik...</p>
            <Button variant="secondary" onClick={() => navigate('/integrasi/shopee')}>
              Kembali Sekarang
            </Button>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="callback-icon error">
              <XCircle size={48} />
            </div>
            <h2>Gagal Menghubungkan</h2>
            <p>{message}</p>
            <div className="callback-actions">
              <Button variant="primary" onClick={() => navigate('/integrasi/shopee')}>
                Kembali ke Integrasi
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
