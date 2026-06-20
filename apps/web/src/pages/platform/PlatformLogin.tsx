/**
 * PlatformLogin - halaman login portal Super Admin (/platform/login).
 *
 * Cermin pages/Login.tsx tapi pakai PlatformAuthContext dan redirect ke dalam
 * portal. Sukses -> ke target redirect tersimpan (tervalidasi) atau /platform.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../../context/PlatformAuthContext';
import { PLATFORM_REDIRECT_KEY } from '../../auth/PlatformProtectedRoute';
import { safeRedirectPath } from '../../auth/redirect';
import { PasswordInput } from '../../components/ui/PasswordInput';

export function PlatformLogin() {
  const { state, login } = usePlatformAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sudah login -> lempar masuk ke portal.
  useEffect(() => {
    if (state.status === 'authenticated') {
      navigate('/platform', { replace: true });
    }
  }, [state.status, navigate]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      const stored = sessionStorage.getItem(PLATFORM_REDIRECT_KEY);
      sessionStorage.removeItem(PLATFORM_REDIRECT_KEY);
      const safe = stored ? safeRedirectPath(stored) : '/platform';
      const target = safe.startsWith('/platform') ? safe : '/platform';
      navigate(target, { replace: true });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429) {
        setError('Akun terkunci sementara. Coba lagi nanti.');
      } else {
        setError('Email atau password salah');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="platform-login">
      <div className="platform-login__card">
        <h1>Portal Super Admin</h1>
        <p>Masuk untuk mengelola platform.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="platform-email">Email</label>
          <input
            id="platform-email"
            type="email"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <label htmlFor="platform-password">Password</label>
          <PasswordInput
            id="platform-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error ? (
            <p role="alert" className="platform-login__error">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}
