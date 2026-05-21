import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { PackingCostEntry } from './PackingCostSection';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiErrorResponse {
  success: false;
  message: string;
  field?: string;
  conflict?: {
    id: number;
    startDate: string;
    endDate: string | null;
    value: number;
  };
}

interface ApiSuccessResponse {
  success: true;
  data: PackingCostEntry;
}

export interface PackingCostEntryFormProps {
  /** The product_groups.id for the channel product */
  productGroupId: number;
  /** If provided, the form is in edit mode; otherwise create mode */
  entry?: PackingCostEntry;
  /** Optional user ID passed as x-user-id header */
  userId?: string;
  /** Called with the created/updated entry on success */
  onSuccess: (entry: PackingCostEntry) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface FormValues {
  packingCost: string;
  startDate: string;
  endDate: string;
  note: string;
}

interface FormErrors {
  packingCost?: string;
  startDate?: string;
  endDate?: string;
  note?: string;
  general?: string;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  // packingCost: required, integer, 0 ≤ value ≤ 999,999,999
  const rawCost = values.packingCost.trim();
  if (rawCost === '') {
    errors.packingCost = 'Biaya packing wajib diisi';
  } else {
    const costNum = Number(rawCost);
    if (!Number.isInteger(costNum) || isNaN(costNum)) {
      errors.packingCost = 'Biaya packing harus berupa bilangan bulat';
    } else if (costNum < 0) {
      errors.packingCost = 'Biaya packing tidak boleh negatif (minimum Rp 0)';
    } else if (costNum > 999_999_999) {
      errors.packingCost = 'Biaya packing maksimum Rp 999.999.999';
    }
  }

  // startDate: required, YYYY-MM-DD
  if (!values.startDate) {
    errors.startDate = 'Tanggal mulai wajib diisi';
  } else if (!DATE_REGEX.test(values.startDate)) {
    errors.startDate = 'Format tanggal harus YYYY-MM-DD';
  }

  // endDate: optional, if provided must be >= startDate
  if (values.endDate) {
    if (!DATE_REGEX.test(values.endDate)) {
      errors.endDate = 'Format tanggal harus YYYY-MM-DD';
    } else if (values.startDate && values.endDate < values.startDate) {
      errors.endDate = 'Tanggal selesai harus sama dengan atau setelah tanggal mulai';
    }
  }

  // note: optional, max 255 chars
  if (values.note.length > 255) {
    errors.note = `Catatan maksimal 255 karakter (saat ini ${values.note.length})`;
  }

  return errors;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRp(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function hasErrors(errors: FormErrors): boolean {
  return Object.values(errors).some((v) => v !== undefined);
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PackingCostEntryForm — modal form for creating or editing a Biaya Packing entry.
 *
 * - Create mode: POST /packing-cost/entries
 * - Edit mode: PUT /packing-cost/entries/:id
 * - Client-side validation before submit (Requirements 6.1, 6.2, 7.1)
 * - Inline error messages including conflict details (Requirement 13.4)
 *
 * Requirements: 13.4, 6.1, 6.2, 7.1
 */
export function PackingCostEntryForm({
  productGroupId,
  entry,
  userId,
  onSuccess,
  onCancel,
}: PackingCostEntryFormProps) {
  const isEditMode = entry !== undefined;

  // ── Form state ─────────────────────────────────────────────────────────────
  const [values, setValues] = useState<FormValues>(() => ({
    packingCost: entry ? String(entry.packingCost) : '',
    startDate: entry?.startDate ?? '',
    endDate: entry?.endDate ?? '',
    note: entry?.note ?? '',
  }));

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<keyof FormValues, boolean>>({
    packingCost: false,
    startDate: false,
    endDate: false,
    note: false,
  });
  const [submitting, setSubmitting] = useState(false);

  // Re-populate when entry prop changes (e.g. parent re-opens with different entry)
  useEffect(() => {
    if (entry) {
      setValues({
        packingCost: String(entry.packingCost),
        startDate: entry.startDate,
        endDate: entry.endDate ?? '',
        note: entry.note ?? '',
      });
    } else {
      setValues({ packingCost: '', startDate: '', endDate: '', note: '' });
    }
    setErrors({});
    setTouched({ packingCost: false, startDate: false, endDate: false, note: false });
  }, [entry]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleChange = useCallback(
    (field: keyof FormValues, value: string) => {
      setValues((prev) => {
        const next = { ...prev, [field]: value };
        // Re-validate touched fields on change
        if (touched[field]) {
          const newErrors = validateForm(next);
          setErrors((prevErrors) => ({ ...prevErrors, [field]: newErrors[field] }));
        }
        return next;
      });
    },
    [touched],
  );

  const handleBlur = useCallback(
    (field: keyof FormValues) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const newErrors = validateForm(values);
      setErrors((prev) => ({ ...prev, [field]: newErrors[field] }));
    },
    [values],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Mark all fields as touched and validate
      setTouched({ packingCost: true, startDate: true, endDate: true, note: true });
      const validationErrors = validateForm(values);
      if (hasErrors(validationErrors)) {
        setErrors(validationErrors);
        return;
      }

      setSubmitting(true);
      setErrors({});

      try {
        const costValue = Number(values.packingCost.trim());
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': userId } : {}),
        };

        const url = isEditMode && entry
          ? `/api/packing-cost/entries/${entry.id}`
          : '/api/packing-cost/entries';

        const body = isEditMode && entry
          ? JSON.stringify({
              packingCost: costValue,
              startDate: values.startDate,
              endDate: values.endDate || null,
              note: values.note || null,
            })
          : JSON.stringify({
              productGroupId,
              packingCost: costValue,
              startDate: values.startDate,
              endDate: values.endDate || null,
              note: values.note || null,
            });

        const res = await fetch(url, {
          method: isEditMode ? 'PUT' : 'POST',
          headers,
          body,
        });

        const data: ApiSuccessResponse | ApiErrorResponse = await res.json();

        if (!res.ok || !data.success) {
          const errData = data as ApiErrorResponse;

          // Field-level validation errors from the API
          if (errData.field) {
            setErrors({ [errData.field]: errData.message } as FormErrors);
            return;
          }

          // Conflict error — show with conflicting entry details (Requirement 13.4)
          if (errData.conflict) {
            const { startDate, endDate, value } = errData.conflict;
            const period = endDate
              ? `${formatDate(startDate)} – ${formatDate(endDate)}`
              : `${formatDate(startDate)} – sekarang`;
            setErrors({
              general: `${errData.message} (${period}, ${formatRp(value)})`,
            });
            return;
          }

          setErrors({ general: errData.message || 'Terjadi kesalahan. Silakan coba lagi.' });
          return;
        }

        onSuccess((data as ApiSuccessResponse).data);
      } catch (err: any) {
        setErrors({ general: err.message || 'Terjadi kesalahan jaringan. Silakan coba lagi.' });
      } finally {
        setSubmitting(false);
      }
    },
    [values, isEditMode, entry, productGroupId, userId, onSuccess],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const title = isEditMode ? 'Edit Biaya Packing' : 'Tambah Biaya Packing';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
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
            disabled={submitting}
            aria-label="Tutup form"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: submitting ? 'not-allowed' : 'pointer',
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
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* General / conflict error banner */}
            {errors.general && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'var(--error-bg, #fff0f0)',
                  border: '1px solid var(--error, #e53e3e)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--error, #e53e3e)',
                  lineHeight: 1.5,
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{errors.general}</span>
              </div>
            )}

            {/* Packing Cost field */}
            <FormField
              label="Biaya Packing"
              htmlFor="packingCost"
              error={errors.packingCost}
              hint="Rp 0 – Rp 999.999.999"
              required
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
                  id="packingCost"
                  type="number"
                  min={0}
                  max={999_999_999}
                  step={1}
                  value={values.packingCost}
                  onChange={(e) => handleChange('packingCost', e.target.value)}
                  onBlur={() => handleBlur('packingCost')}
                  disabled={submitting}
                  aria-invalid={!!errors.packingCost}
                  aria-describedby={errors.packingCost ? 'packingCost-error' : undefined}
                  placeholder="0"
                  style={inputStyle(!!errors.packingCost, submitting, { paddingLeft: '32px' })}
                />
              </div>
            </FormField>

            {/* Start Date field */}
            <FormField
              label="Tanggal Mulai"
              htmlFor="startDate"
              error={errors.startDate}
              required
            >
              <input
                id="startDate"
                type="date"
                value={values.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
                onBlur={() => handleBlur('startDate')}
                disabled={submitting}
                aria-invalid={!!errors.startDate}
                aria-describedby={errors.startDate ? 'startDate-error' : undefined}
                style={inputStyle(!!errors.startDate, submitting)}
              />
            </FormField>

            {/* End Date field */}
            <FormField
              label="Tanggal Selesai"
              htmlFor="endDate"
              error={errors.endDate}
              hint="Opsional — kosongkan untuk periode terbuka"
            >
              <input
                id="endDate"
                type="date"
                value={values.endDate}
                min={values.startDate || undefined}
                onChange={(e) => handleChange('endDate', e.target.value)}
                onBlur={() => handleBlur('endDate')}
                disabled={submitting}
                aria-invalid={!!errors.endDate}
                aria-describedby={errors.endDate ? 'endDate-error' : undefined}
                style={inputStyle(!!errors.endDate, submitting)}
              />
            </FormField>

            {/* Note field */}
            <FormField
              label="Catatan"
              htmlFor="note"
              error={errors.note}
              hint={`Opsional — maks. 255 karakter (${values.note.length}/255)`}
            >
              <textarea
                id="note"
                value={values.note}
                onChange={(e) => handleChange('note', e.target.value)}
                onBlur={() => handleBlur('note')}
                disabled={submitting}
                rows={3}
                maxLength={255}
                aria-invalid={!!errors.note}
                aria-describedby={errors.note ? 'note-error' : undefined}
                placeholder="Catatan opsional..."
                style={{
                  ...inputStyle(!!errors.note, submitting),
                  resize: 'vertical',
                  minHeight: '72px',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                }}
              />
            </FormField>

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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCancel}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
            >
              {isEditMode ? 'Simpan Perubahan' : 'Tambah Entry'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── FormField ────────────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FormField({ label, htmlFor, error, hint, required, children }: FormFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text2)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--error, #e53e3e)', fontSize: '12px' }} aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children}

      {error && (
        <span
          id={`${htmlFor}-error`}
          role="alert"
          style={{
            fontSize: '12px',
            color: 'var(--error, #e53e3e)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <AlertCircle size={12} style={{ flexShrink: 0 }} />
          {error}
        </span>
      )}

      {!error && hint && (
        <span style={{ fontSize: '11px', color: 'var(--text4)' }}>{hint}</span>
      )}
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function inputStyle(
  hasError: boolean,
  disabled: boolean,
  extra?: React.CSSProperties,
): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'inherit',
    color: 'var(--text1)',
    background: disabled ? 'var(--bg2)' : 'var(--bg)',
    border: `1px solid ${hasError ? 'var(--error, #e53e3e)' : 'var(--border)'}`,
    borderRadius: '7px',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'text',
    opacity: disabled ? 0.7 : 1,
    boxSizing: 'border-box',
    transition: 'border-color .12s',
    ...extra,
  };
}
