import { type FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchApi, ApiError } from '../lib/api';
import { PasswordInput } from '../components/ui/PasswordInput';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [verifying, setVerifying] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      Promise.resolve().then(() => {
        setIsValidToken(false);
        setVerificationError('Link reset tidak valid atau sudah kadaluarsa.');
        setVerifying(false);
      });
      return;
    }

    let active = true;
    fetchApi<{ valid: boolean }>('/auth/reset-password/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (!active) return;
        if (res.valid) {
          setIsValidToken(true);
        } else {
          setIsValidToken(false);
          setVerificationError('Link reset tidak valid atau sudah kadaluarsa.');
        }
      })
      .catch(() => {
        if (!active) return;
        setIsValidToken(false);
        setVerificationError('Link reset tidak valid atau sudah kadaluarsa.');
      })
      .finally(() => {
        if (active) {
          setVerifying(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    if (password !== confirmPassword) {
      setFormError('Konfirmasi password tidak cocok');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await fetchApi('/auth/reset-password/complete', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message === 'invalid_or_expired_token') {
          setFormError('Link reset tidak valid atau sudah kadaluarsa.');
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Gagal mereset password.');
      }
    } finally {
      setSubmitting(false);
    }
  };

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
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '40px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <img src="/logo.png" alt="Sentralio" style={{ height: '56px', width: 'auto' }} />
        </div>
        
        {verifying ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: 'var(--text3)' }}>Memverifikasi link reset password...</p>
          </div>
        ) : success ? (
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text1)' }}>
              Password Berhasil Diubah
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text3)', marginBottom: '28px' }}>
              Password Anda telah berhasil diperbarui. Silakan masuk kembali dengan password baru Anda.
            </p>
            <Link
              to="/login"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '11px', textDecoration: 'none' }}
            >
              Kembali ke Halaman Login
            </Link>
          </div>
        ) : !isValidToken ? (
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text1)' }}>
              Link Tidak Valid
            </h1>
            <p role="alert" style={{ fontSize: '0.9rem', color: 'var(--error)', marginBottom: '28px' }}>
              {verificationError || 'Link reset tidak valid atau sudah kadaluarsa.'}
            </p>
            <Link
              to="/login"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '11px', textDecoration: 'none' }}
            >
              Kembali ke Halaman Login
            </Link>
          </div>
        ) : (
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text1)' }}>
              Reset Password
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text3)', marginBottom: '28px' }}>
              Masukkan password baru Anda di bawah ini
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div style={{ marginBottom: '18px' }}>
                <label htmlFor="reset-password" className="form-label">Password Baru</label>
                <PasswordInput
                  id="reset-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="••••••••"
                />
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label htmlFor="confirm-password" className="form-label">Konfirmasi Password</label>
                <PasswordInput
                  id="confirm-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="••••••••"
                />
              </div>

              {formError && (
                <p
                  role="alert"
                  aria-live="assertive"
                  style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--error)' }}
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
              >
                {submitting ? 'Memproses…' : 'Simpan Password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
