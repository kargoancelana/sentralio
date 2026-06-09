/**
 * LoginPage — email + password login form.
 *
 * Behaviour:
 * - One POST /auth/login per submit; form is disabled for 30 seconds OR until
 *   the response arrives, whichever comes first (Req 1.2).
 * - 401 response shows a local "Email atau password salah" message; no
 *   redirect is issued so there is no redirect loop (Req 1.4).
 * - On success: read the stored redirect path from sessionStorage, sanitise
 *   it through safeRedirectPath, navigate there, and clear the key (Req 1.8).
 *
 * Requirements: 1.1, 1.2, 1.8, 4.1
 */

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { safeRedirectPath } from '../auth/redirect';
import { PasswordInput } from '../components/ui/PasswordInput';

const SESSION_KEY = 'wms.postLoginRedirect';

/** Milliseconds the form stays disabled after a submit (Req 1.2). */
const DISABLE_DURATION_MS = 30_000;

export function LoginPage() {
  const { state, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  // Timer ref so we can clear it if the response arrives before 30 s.
  const disableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If the user is already authenticated, redirect immediately.
  useEffect(() => {
    if (state.status === 'authenticated') {
      const stored = sessionStorage.getItem(SESSION_KEY) ?? '/';
      const target = safeRedirectPath(stored);
      sessionStorage.removeItem(SESSION_KEY);
      navigate(target, { replace: true });
    }
  }, [state.status, navigate]);

  function enableForm() {
    setDisabled(false);
    if (disableTimerRef.current !== null) {
      clearTimeout(disableTimerRef.current);
      disableTimerRef.current = null;
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (disabled) return;

    setDisabled(true);
    setErrorMsg(null);

    // Start the 30-second timer; it will re-enable the form if the response
    // has not arrived yet (Req 1.2).
    disableTimerRef.current = setTimeout(() => {
      setDisabled(false);
      disableTimerRef.current = null;
    }, DISABLE_DURATION_MS);

    const result = await login(email, password);

    // Re-enable the form and cancel the 30-second timer since we have a response.
    enableForm();

    if (result.ok) {
      // Consume the stored redirect, sanitise it, and navigate (Req 1.8).
      const stored = sessionStorage.getItem(SESSION_KEY) ?? '/';
      const target = safeRedirectPath(stored);
      sessionStorage.removeItem(SESSION_KEY);
      navigate(target, { replace: true });
    } else {
      // Show a fixed local message regardless of what the server returned (Req 1.4).
      setErrorMsg('Email atau password salah');
    }
  }

  // Clean up the timer on unmount.
  useEffect(() => {
    return () => {
      if (disableTimerRef.current !== null) {
        clearTimeout(disableTimerRef.current);
      }
    };
  }, []);

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
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text1)' }}>
          Masuk
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text3)', marginBottom: '28px' }}>
          Masuk ke akun Sentralio Anda
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/* Email field (Req 1.1) */}
          <div style={{ marginBottom: '18px' }}>
            <label htmlFor="login-email" className="form-label">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={disabled}
              aria-describedby={errorMsg ? 'login-error' : undefined}
              className="form-input"
              placeholder="email@contoh.com"
            />
          </div>

          {/* Password field — masked entry with show/hide toggle (Req 1.1) */}
          <div style={{ marginBottom: '22px' }}>
            <label htmlFor="login-password" className="form-label">Password</label>
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={disabled}
              aria-describedby={errorMsg ? 'login-error' : undefined}
              placeholder="••••••••"
            />
          </div>

          {/* Inline error message (local text, not from server — Req 1.4) */}
          {errorMsg && (
            <p
              id="login-error"
              role="alert"
              aria-live="assertive"
              style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--error)' }}
            >
              {errorMsg}
            </p>
          )}

          {/* Submit button (Req 1.2) */}
          <button
            type="submit"
            disabled={disabled}
            aria-disabled={disabled}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
          >
            {disabled ? 'Memproses…' : 'Masuk'}
          </button>
        </form>
      </div>
    </main>
  );
}
