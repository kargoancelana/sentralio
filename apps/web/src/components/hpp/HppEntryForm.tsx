import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HppEntry {
  id: number;
  variantId: number;
  hppValue: number;
  startDate: string;
  endDate: string | null;
  note: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConflictInfo {
  id: number;
  startDate: string;
  endDate: string | null;
  value: number;
}

interface ApiErrorResponse {
  success: false;
  message: string;
  field?: string;
  conflict?: ConflictInfo;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HppEntryFormProps {
  /** The variant this entry belongs to */
  variantId: number;
  /** If provided, the form is in edit mode; otherwise create mode */
  entry?: HppEntry;
  /** User ID for audit log (passed as x-user-id header) */
  userId?: string;
  /** Called after a successful save with the created/updated entry */
  onSuccess: (entry: HppEntry) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRp(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse a Rupiah-formatted string (e.g. "1.000.000") to a number */
function parseRpInput(raw: string): number | null {
  // Remove all non-digit characters
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return null;
  const n = parseInt(digits, 10);
  return isNaN(n) ? null : n;
}

/** Format a number for display in the input (id-ID thousand separators, no prefix) */
function formatRpInput(value: number): string {
  return value.toLocaleString('id-ID');
}

// ─── Client-side validation ───────────────────────────────────────────────────

interface FormValues {
  hppValueRaw: string;   // raw input string
  startDate: string;
  endDate: string;
  note: string;
}

interface FormErrors {
  hppValue?: string;
  startDate?: string;
  endDate?: string;
  note?: string;
}

function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  // HPP value
  const parsed = parseRpInput(values.hppValueRaw);
  if (parsed === null) {
    errors.hppValue = 'Nilai HPP wajib diisi';
  } else if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999_999_999) {
    errors.hppValue = 'Nilai HPP harus antara Rp 1 dan Rp 999.999.999';
  }

  // Start date
  if (!values.startDate) {
    errors.startDate = 'Tanggal mulai wajib diisi';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startDate)) {
    errors.startDate = 'Format tanggal tidak valid (YYYY-MM-DD)';
  }

  // End date (optional)
  if (values.endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.endDate)) {
      errors.endDate = 'Format tanggal tidak valid (YYYY-MM-DD)';
    } else if (values.startDate && values.endDate < values.startDate) {
      errors.endDate = 'Tanggal selesai harus sama dengan atau setelah tanggal mulai';
    }
  }

  // Note
  if (values.note.length > 255) {
    errors.note = `Catatan maksimal 255 karakter (saat ini ${values.note.length})`;
  }

  return errors;
}

// ─── Field components ─────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, required, error, hint, children }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text2)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {label}
        {required && (
          <span style={{ color: '#DC2626', fontSize: '11px' }}>*</span>
        )}
      </label>
      {children}
      {hint && !error && (
        <span style={{ fontSize: '11px', color: 'var(--text4)' }}>{hint}</span>
      )}
      {error && (
        <span
          role="alert"
          style={{
            fontSize: '11px',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <AlertCircle size={11} />
          {error}
        </span>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: '7px',
  fontSize: '13px',
  color: 'var(--text1)',
  background: 'var(--bg)',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color .12s',
};

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: '#DC2626',
};

// ─── Conflict Banner ──────────────────────────────────────────────────────────

interface ConflictBannerProps {
  conflict: ConflictInfo;
}

function ConflictBanner({ conflict }: ConflictBannerProps) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '10px 12px',
        background: '#FFF7ED',
        border: '1px solid #FED7AA',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#92400E',
      }}
    >
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px', color: '#D97706' }} />
      <div>
        <strong style={{ display: 'block', marginBottom: '2px' }}>Konflik periode</strong>
        <span>
          Terdapat entry HPP yang tumpang tindih:{' '}
          <strong>{formatRp(conflict.value)}</strong> berlaku{' '}
          <strong>{formatDate(conflict.startDate)}</strong>
          {conflict.endDate ? ` s/d ${formatDate(conflict.endDate)}` : ' (berlaku terus)'}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * HppEntryForm — modal form for creating or editing an HPP entry.
 *
 * Requirements: 12.4, 1.1, 1.2, 2.1, 2.6
 *
 * - Create mode: POST /hpp/entries
 * - Edit mode: PUT /hpp/entries/:id
 * - Client-side validation before submit
 * - Inline error messages including conflict details from API
 * - Closes on backdrop click or Escape key
 */
export function HppEntryForm({
  variantId,
  entry,
  userId,
  onSuccess,
  onCancel,
}: HppEntryFormProps) {
  const isEditMode = entry !== undefined;

  // ── Form state ──
  const [values, setValues] = useState<FormValues>({
    hppValueRaw: entry ? formatRpInput(entry.hppValue) : '',
    startDate: entry?.startDate ?? todayIso(),
    endDate: entry?.endDate ?? '',
    note: entry?.note ?? '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Focus management ──
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    requestAnimationFrame(() => {
      firstInputRef.current?.focus();
    });
    return () => {
      if (triggerRef.current && (triggerRef.current as HTMLElement).focus) {
        (triggerRef.current as HTMLElement).focus();
      }
    };
  }, []);

  // ── Background scroll prevention ──
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ── Focus trap + Escape ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key !== 'Tab') return;

      const modal = modalRef.current;
      if (!modal) return;

      const focusable = modal.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      const arr = Array.from(focusable);
      if (arr.length === 0) return;

      const first = arr[0];
      const last = arr[arr.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onCancel]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Backdrop click ──
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) {
        onCancel();
      }
    },
    [onCancel]
  );

  // ── Field change handlers ──

  const handleHppValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow only digits and thousand-separator dots/commas
    const digitsOnly = raw.replace(/\D/g, '');
    // Re-format with id-ID separators as user types
    const formatted = digitsOnly === '' ? '' : parseInt(digitsOnly, 10).toLocaleString('id-ID');
    setValues((v) => ({ ...v, hppValueRaw: formatted }));
    if (errors.hppValue) setErrors((e) => ({ ...e, hppValue: undefined }));
    setConflict(null);
    setApiError(null);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, startDate: e.target.value }));
    if (errors.startDate) setErrors((e) => ({ ...e, startDate: undefined }));
    setConflict(null);
    setApiError(null);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, endDate: e.target.value }));
    if (errors.endDate) setErrors((e) => ({ ...e, endDate: undefined }));
    setConflict(null);
    setApiError(null);
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, note: e.target.value }));
    if (errors.note) setErrors((e) => ({ ...e, note: undefined }));
  };

  // ── Submit ──

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    const validationErrors = validateForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const hppValue = parseRpInput(values.hppValueRaw)!;

    setSubmitting(true);
    setApiError(null);
    setConflict(null);

    try {
      const url = isEditMode
        ? `/api/hpp/entries/${entry!.id}`
        : '/api/hpp/entries';

      const method = isEditMode ? 'PUT' : 'POST';

      const body: Record<string, unknown> = isEditMode
        ? {
            hppValue,
            startDate: values.startDate,
            endDate: values.endDate || null,
            note: values.note || null,
          }
        : {
            variantId,
            hppValue,
            startDate: values.startDate,
            endDate: values.endDate || null,
            note: values.note || null,
          };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': userId } : {}),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json() as
        | { success: true; data: HppEntry }
        | ApiErrorResponse;

      if (!res.ok || !data.success) {
        const errData = data as ApiErrorResponse;
        const message = errData.message || 'Terjadi kesalahan';

        if (res.status === 409) {
          // Conflict — show conflict banner if details available, else general error
          if (errData.conflict) {
            setConflict(errData.conflict);
          } else {
            setApiError(message);
          }
        } else if (res.status === 400) {
          // Field-level validation error
          const field = errData.field;
          if (field === 'hppValue') {
            setErrors((prev) => ({ ...prev, hppValue: message }));
          } else if (field === 'startDate') {
            setErrors((prev) => ({ ...prev, startDate: message }));
          } else if (field === 'endDate') {
            setErrors((prev) => ({ ...prev, endDate: message }));
          } else if (field === 'note') {
            setErrors((prev) => ({ ...prev, note: message }));
          } else {
            // Fallback: try to infer field from message text
            const lower = message.toLowerCase();
            if (lower.includes('hpp value') || lower.includes('hppvalue')) {
              setErrors((prev) => ({ ...prev, hppValue: message }));
            } else if (lower.includes('start date') || lower.includes('startdate')) {
              setErrors((prev) => ({ ...prev, startDate: message }));
            } else if (lower.includes('end date') || lower.includes('enddate')) {
              setErrors((prev) => ({ ...prev, endDate: message }));
            } else if (lower.includes('note')) {
              setErrors((prev) => ({ ...prev, note: message }));
            } else {
              setApiError(message);
            }
          }
        } else {
          setApiError(message);
        }
        return;
      }

      onSuccess((data as { success: true; data: HppEntry }).data);
    } catch (err: any) {
      setApiError(err?.message || 'Terjadi kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──

  const title = isEditMode ? 'Edit Entry HPP' : 'Tambah Entry HPP';
  const submitLabel = isEditMode ? 'Simpan Perubahan' : 'Tambah Entry';

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          width: '100%',
          maxWidth: '480px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text1)',
            }}
          >
            {title}
          </h2>
          <button
            onClick={onCancel}
            aria-label="Tutup form"
            disabled={submitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              border: 'none',
              background: 'transparent',
              cursor: submitting ? 'not-allowed' : 'pointer',
              borderRadius: '6px',
              color: 'var(--text3)',
              transition: 'background .12s, color .12s',
            }}
            onMouseEnter={(e) => {
              if (!submitting) {
                e.currentTarget.style.background = 'var(--bg3)';
                e.currentTarget.style.color = 'var(--text1)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text3)';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <form onSubmit={handleSubmit} noValidate>
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* General API error */}
            {apiError && !conflict && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '10px 12px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#991B1B',
                }}
              >
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{apiError}</span>
              </div>
            )}

            {/* Conflict banner */}
            {conflict && <ConflictBanner conflict={conflict} />}

            {/* HPP Value */}
            <Field
              label="Nilai HPP"
              required
              error={errors.hppValue}
              hint="Masukkan nilai dalam Rupiah (Rp 1 – Rp 999.999.999)"
            >
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '13px',
                    color: 'var(--text3)',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                >
                  Rp
                </span>
                <input
                  ref={firstInputRef}
                  type="text"
                  inputMode="numeric"
                  value={values.hppValueRaw}
                  onChange={handleHppValueChange}
                  placeholder="0"
                  aria-label="Nilai HPP dalam Rupiah"
                  aria-invalid={!!errors.hppValue}
                  aria-describedby={errors.hppValue ? 'hpp-value-error' : undefined}
                  disabled={submitting}
                  style={{
                    ...(errors.hppValue ? inputErrorStyle : inputStyle),
                    paddingLeft: '32px',
                  }}
                />
              </div>
            </Field>

            {/* Start Date */}
            <Field
              label="Tanggal Mulai"
              required
              error={errors.startDate}
            >
              <input
                type="date"
                value={values.startDate}
                onChange={handleStartDateChange}
                aria-label="Tanggal mulai berlaku"
                aria-invalid={!!errors.startDate}
                disabled={submitting}
                style={errors.startDate ? inputErrorStyle : inputStyle}
              />
            </Field>

            {/* End Date */}
            <Field
              label="Tanggal Selesai"
              error={errors.endDate}
              hint="Kosongkan jika berlaku terus (open-ended)"
            >
              <input
                type="date"
                value={values.endDate}
                onChange={handleEndDateChange}
                min={values.startDate || undefined}
                aria-label="Tanggal selesai berlaku (opsional)"
                aria-invalid={!!errors.endDate}
                disabled={submitting}
                style={errors.endDate ? inputErrorStyle : inputStyle}
              />
            </Field>

            {/* Note */}
            <Field
              label="Catatan"
              error={errors.note}
              hint={`${values.note.length}/255 karakter`}
            >
              <textarea
                value={values.note}
                onChange={handleNoteChange}
                placeholder="Catatan opsional..."
                rows={3}
                maxLength={255}
                aria-label="Catatan (opsional)"
                aria-invalid={!!errors.note}
                disabled={submitting}
                style={{
                  ...(errors.note ? inputErrorStyle : inputStyle),
                  resize: 'vertical',
                  minHeight: '72px',
                }}
              />
            </Field>
          </div>

          {/* ── Footer ── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg2)',
              borderRadius: '0 0 12px 12px',
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              style={{
                padding: '8px 18px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '7px',
                fontSize: '13px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                color: 'var(--text2)',
                transition: 'background .12s',
              }}
              onMouseEnter={(e) => {
                if (!submitting) e.currentTarget.style.background = 'var(--bg3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '8px 18px',
                background: 'var(--accent)',
                color: 'var(--accent-f, #fff)',
                border: 'none',
                borderRadius: '7px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: submitting ? 0.7 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'opacity .15s',
              }}
              onMouseEnter={(e) => {
                if (!submitting) e.currentTarget.style.opacity = '0.85';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = submitting ? '0.7' : '1';
              }}
            >
              {submitting && <Loader2 size={13} className="animate-spin" />}
              {submitting ? 'Menyimpan...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
