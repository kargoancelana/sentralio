/**
 * PlatformSettings - System Settings di portal Super Admin (/platform/settings).
 *
 * 1. Info Pembayaran (payment_info) -> dikonsumsi tenant di halaman Langganan.
 * 2. Mode Maintenance (maintenance) -> dikonsumsi publik via GET /system/status
 *    + diblok maintenance-guard (full = 503; portal /platform tetap aman).
 *
 * Backend: GET/PUT /platform/settings. PUT nerima salah satu / dua-duanya;
 * tiap kartu di sini disubmit terpisah.
 */

import { useEffect, useState } from 'react';
import {
  platformSettingsApi,
  PlatformApiError,
  type PaymentInfo,
  type MaintenanceSetting,
  type MaintenanceLevel,
} from '../../lib/platformApi';

const EMPTY_PAYMENT: PaymentInfo = {
  bankName: '',
  accountNumber: '',
  accountHolder: '',
  instructions: '',
  supportContact: '',
  note: '',
};

const EMPTY_MAINTENANCE: MaintenanceSetting = { level: 'off', message: '' };

export function PlatformSettings() {
  const [payment, setPayment] = useState<PaymentInfo>(EMPTY_PAYMENT);
  const [maintenance, setMaintenance] = useState<MaintenanceSetting>(EMPTY_MAINTENANCE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSaved, setPaymentSaved] = useState(false);

  const [maintSaving, setMaintSaving] = useState(false);
  const [maintError, setMaintError] = useState<string | null>(null);
  const [maintSaved, setMaintSaved] = useState(false);

  useEffect(() => {
    let active = true;
    platformSettingsApi
      .get()
      .then((res) => {
        if (!active) return;
        setPayment(res.settings.paymentInfo);
        setMaintenance(res.settings.maintenance);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadError('Gagal memuat settings.');
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function savePayment(e: React.FormEvent) {
    e.preventDefault();
    setPaymentSaving(true);
    setPaymentError(null);
    setPaymentSaved(false);
    try {
      const res = await platformSettingsApi.update({ paymentInfo: payment });
      setPayment(res.settings.paymentInfo);
      setPaymentSaved(true);
    } catch (err) {
      setPaymentError(err instanceof PlatformApiError ? err.message : 'Gagal menyimpan.');
    } finally {
      setPaymentSaving(false);
    }
  }

  async function saveMaintenance(e: React.FormEvent) {
    e.preventDefault();
    setMaintSaving(true);
    setMaintError(null);
    setMaintSaved(false);
    try {
      const res = await platformSettingsApi.update({ maintenance });
      setMaintenance(res.settings.maintenance);
      setMaintSaved(true);
    } catch (err) {
      setMaintError(err instanceof PlatformApiError ? err.message : 'Gagal menyimpan.');
    } finally {
      setMaintSaving(false);
    }
  }

  if (loading) return <p className="platform-loading">Memuat...</p>;
  if (loadError) return <p className="platform-error">{loadError}</p>;

  return (
    <section className="platform-settings">
      <h1>System Settings</h1>

      {/* Info Pembayaran */}
      <div className="platform-form-card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Info Pembayaran</h2>
        <p style={{ color: '#666', fontSize: 13 }}>
          Ditampilkan ke tenant di halaman Langganan saat mau transfer.
        </p>
        {paymentError && <p className="platform-error">{paymentError}</p>}
        {paymentSaved && <p style={{ color: 'green' }}>Info pembayaran tersimpan.</p>}
        <form onSubmit={(e) => void savePayment(e)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <label>Nama Bank
              <input type="text" value={payment.bankName} maxLength={255}
                onChange={(e) => setPayment({ ...payment, bankName: e.target.value })} />
            </label>
            <label>Nomor Rekening
              <input type="text" value={payment.accountNumber} maxLength={255}
                onChange={(e) => setPayment({ ...payment, accountNumber: e.target.value })} />
            </label>
            <label>Atas Nama
              <input type="text" value={payment.accountHolder} maxLength={255}
                onChange={(e) => setPayment({ ...payment, accountHolder: e.target.value })} />
            </label>
            <label>Instruksi Transfer
              <textarea value={payment.instructions} rows={4} maxLength={5000}
                onChange={(e) => setPayment({ ...payment, instructions: e.target.value })} />
            </label>
            <label>Kontak Support (WA/email)
              <input type="text" value={payment.supportContact} maxLength={255}
                onChange={(e) => setPayment({ ...payment, supportContact: e.target.value })} />
            </label>
            <label>Catatan (mis. nominal unik)
              <textarea value={payment.note} rows={2} maxLength={2000}
                onChange={(e) => setPayment({ ...payment, note: e.target.value })} />
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn" disabled={paymentSaving}>
              {paymentSaving ? 'Menyimpan...' : 'Simpan Info Pembayaran'}
            </button>
          </div>
        </form>
      </div>

      {/* Mode Maintenance */}
      <div className="platform-form-card" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>Mode Maintenance</h2>
        <p style={{ color: '#666', fontSize: 13 }}>
          <strong>off</strong>: normal. <strong>banner</strong>: app tenant jalan + banner.
          {' '}<strong>full</strong>: app tenant diblok (503), portal Super Admin tetap bisa diakses.
        </p>
        {maintError && <p className="platform-error">{maintError}</p>}
        {maintSaved && <p style={{ color: 'green' }}>Mode maintenance tersimpan.</p>}
        <form onSubmit={(e) => void saveMaintenance(e)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <label>Level
              <select value={maintenance.level}
                onChange={(e) => setMaintenance({ ...maintenance, level: e.target.value as MaintenanceLevel })}>
                <option value="off">off — Normal</option>
                <option value="banner">banner — Peringatan</option>
                <option value="full">full — Blokir total</option>
              </select>
            </label>
            <label>Pesan
              <textarea value={maintenance.message} rows={3} maxLength={2000}
                onChange={(e) => setMaintenance({ ...maintenance, message: e.target.value })} />
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn" disabled={maintSaving}>
              {maintSaving ? 'Menyimpan...' : 'Simpan Mode Maintenance'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
