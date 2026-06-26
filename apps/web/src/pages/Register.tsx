/**
 * Register — halaman publik self-service pendaftaran company baru.
 *
 * Sukses: tampilkan pesan + redirect ke /login (TIDAK auto-login per Fase 4.2a).
 * Pola styling mengikuti Login.tsx.
 */

import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { PasswordInput } from '../components/ui/PasswordInput';

export function Register() {
  const { state } = useAuth();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Kalau sudah authenticated, redirect ke /
  useEffect(() => {
    if (state.status === 'authenticated') {
      navigate('/', { replace: true });
    }
  }, [state.status, navigate]);

  // Auto-redirect ke /login setelah sukses register
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => navigate('/login', { replace: true }), 1500);
    return () => clearTimeout(timer);
  }, [success, navigate]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    if (password !== confirmPassword) {
      setErrorMsg('Password dan konfirmasi password tidak cocok.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await api.register({
        companyName,
        name,
        email,
        username: username.trim() || undefined,
        password,
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          if (err.message === 'email_taken') {
            setErrorMsg('Email sudah terdaftar.');
          } else if (err.message === 'username_taken') {
            setErrorMsg('Username sudah dipakai.');
          } else {
            setErrorMsg(err.message || 'Terjadi kesalahan, coba lagi.');
          }
        } else if (err.status === 400) {
          setErrorMsg(err.message || 'Data tidak valid.');
        } else {
          setErrorMsg('Terjadi kesalahan, coba lagi.');
        }
      } else {
        setErrorMsg('Terjadi kesalahan, coba lagi.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          backgroundColor: 'var(--bg3)',
        }}
      >
        <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>✅</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text1)' }}>
            Registrasi berhasil!
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text3)', marginBottom: '24px' }}>
            Silakan login dengan akun Anda. Anda akan diarahkan otomatis…
          </p>
          <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block' }}>
            Masuk sekarang
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        backgroundColor: 'var(--bg3)',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '40px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <img src="/logo.png" alt="Sentralio" style={{ height: '56px', width: 'auto' }} />
        </div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text1)' }}>
          Daftar
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text3)', marginBottom: '28px' }}>
          Buat akun perusahaan baru
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="reg-company" className="form-label">Nama perusahaan / toko</label>
            <input
              id="reg-company"
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={submitting}
              className="form-input"
              placeholder="PT Maju Jaya"
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="reg-name" className="form-label">Nama lengkap</label>
            <input
              id="reg-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="form-input"
              placeholder="Budi Santoso"
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="reg-email" className="form-label">Email</label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="form-input"
              placeholder="email@contoh.com"
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="reg-username" className="form-label">
              Username <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opsional)</span>
            </label>
            <input
              id="reg-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              className="form-input"
              placeholder="nama_pengguna"
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="reg-password" className="form-label">Password</label>
            <PasswordInput
              id="reg-password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              placeholder="Min. 8 karakter"
            />
          </div>

          <div style={{ marginBottom: '22px' }}>
            <label htmlFor="reg-confirm" className="form-label">Konfirmasi password</label>
            <PasswordInput
              id="reg-confirm"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              placeholder="Ulangi password"
            />
          </div>

          {errorMsg && (
            <p
              role="alert"
              aria-live="assertive"
              style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--error)' }}
            >
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            aria-disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
          >
            {submitting ? 'Mendaftar…' : 'Daftar'}
          </button>
        </form>

        <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text3)' }}>
          Sudah punya akun? <Link to="/login">Masuk</Link>
        </p>
      </div>
    </main>
  );
}
