/**
 * ChangePasswordForm — lets the current user change their own password.
 *
 * Calls POST /auth/change-password via AuthContext. Verifies the current
 * password server-side and rotates the session. Other sessions are revoked.
 *
 * Provides clear, friendly validation:
 *  - live requirement checklist for the new password (min 8, uppercase, special)
 *  - inline confirmation-match feedback
 *  - specific server messages (wrong current password, policy failures)
 *
 * Uses shared theme tokens so it renders correctly in light and dark mode.
 */

import { type FormEvent, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PasswordInput } from '../ui/PasswordInput';

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--text2)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

// ─── Password requirement rules ────────────────────────────────────────────
const RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'len', label: 'Minimal 8 karakter', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'Mengandung huruf kapital (A–Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'special', label: 'Mengandung karakter khusus (mis. !@#$%)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function RuleItem({ ok, label, show }: { ok: boolean; label: string; show: boolean }) {
  // Neutral before typing; green when satisfied; red when typed but unmet.
  const color = !show ? 'var(--text4)' : ok ? 'var(--success)' : 'var(--error)';
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color, marginBottom: '4px' }}>
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          border: `1.5px solid ${color}`,
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '9px',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {show && ok ? '✓' : show && !ok ? '✕' : ''}
      </span>
      {label}
    </li>
  );
}

export function ChangePasswordForm() {
  const { changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const allRulesPass = RULES.every((r) => r.test(next));
  const confirmMatches = confirm.length > 0 && next === confirm;
  const confirmMismatch = confirm.length > 0 && next !== confirm;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSuccess(false);

    // Friendly, specific client-side checks (server re-validates).
    if (!current) {
      setError('Masukkan password lama Anda.');
      return;
    }
    const failed = RULES.find((r) => !r.test(next));
    if (failed) {
      setError(`Password baru belum memenuhi syarat: ${failed.label.toLowerCase()}.`);
      return;
    }
    if (next !== confirm) {
      setError('Konfirmasi password baru tidak sama dengan password baru.');
      return;
    }
    if (next === current) {
      setError('Password baru harus berbeda dari password lama.');
      return;
    }

    setSubmitting(true);
    const result = await changePassword(current, next);
    setSubmitting(false);

    if (result.ok) {
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } else if (result.error === 'current_password_incorrect') {
      setError('Password lama yang Anda masukkan salah.');
    } else if (result.error && result.error !== 'invalid' && result.error !== 'validation') {
      // Server returns a user-friendly Indonesian message for policy failures.
      setError(result.error);
    } else {
      setError('Gagal mengubah password. Periksa kembali isian Anda.');
    }
  }

  return (
    <section className="card" style={{ padding: '24px', maxWidth: '460px' }}>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text1)', marginBottom: '4px' }}>
        Ubah Password
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginBottom: '20px' }}>
        Mengubah password akan mengeluarkan sesi login Anda yang lain.
      </p>

      {success && (
        <div
          role="status"
          style={{
            padding: '11px 14px',
            backgroundColor: 'var(--bg2)',
            border: '1px solid var(--success)',
            color: 'var(--success)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            marginBottom: '16px',
          }}
        >
          Password berhasil diubah.
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{
            padding: '11px 14px',
            backgroundColor: 'var(--bg2)',
            border: '1px solid var(--error)',
            color: 'var(--error)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="cp-current" style={labelStyle}>Password Lama</label>
          <PasswordInput
            id="cp-current"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label htmlFor="cp-new" style={labelStyle}>Password Baru</label>
          <PasswordInput
            id="cp-new"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={submitting}
            placeholder="Masukkan password baru"
            required
          />
          {/* Live requirement checklist */}
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
            {RULES.map((r) => (
              <RuleItem key={r.id} ok={r.test(next)} label={r.label} show={next.length > 0} />
            ))}
          </ul>
        </div>

        <div style={{ marginBottom: '6px' }}>
          <label htmlFor="cp-confirm" style={labelStyle}>Konfirmasi Password Baru</label>
          <PasswordInput
            id="cp-confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
            placeholder="Ulangi password baru"
            style={confirmMismatch ? { borderColor: 'var(--error)' } : undefined}
            required
          />
        </div>
        <p
          style={{
            fontSize: '0.75rem',
            minHeight: '16px',
            marginBottom: '20px',
            color: confirmMismatch ? 'var(--error)' : confirmMatches ? 'var(--success)' : 'var(--text4)',
          }}
        >
          {confirmMismatch
            ? 'Konfirmasi tidak sama dengan password baru.'
            : confirmMatches
              ? 'Konfirmasi cocok.'
              : ''}
        </p>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !current || !allRulesPass || !confirmMatches}
        >
          {submitting ? 'Menyimpan…' : 'Ubah Password'}
        </button>
      </form>
    </section>
  );
}
