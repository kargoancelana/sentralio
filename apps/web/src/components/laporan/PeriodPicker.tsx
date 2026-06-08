/**
 * PeriodPicker — Shopee-style period selector for Laporan Keuangan.
 *
 * A button shows the current selection; clicking it opens a dropdown with:
 *   - Left: quick presets (Hari ini, Kemarin, 7 hari, 30 hari, 3 bulan)
 *   - Right: a two-month calendar for picking a custom range
 *
 * Dates after "today" (WIB) are disabled — those periods have no data yet.
 * Themed with the app's CSS tokens so it matches light/dark mode.
 *
 * All date math is done on "YYYY-MM-DD" strings anchored to WIB (Asia/Jakarta)
 * to stay consistent with the report backend, regardless of browser timezone.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── WIB date helpers (string-based, timezone-safe) ───────────────────────────

const WIB_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function wibToday(): string {
  const parts = WIB_PARTS.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m: m - 1, d };
}

/** Offset a YYYY-MM-DD string by N days (negative = back). */
function offsetDays(s: string, days: number): string {
  const { y, m, d } = parseYmd(s);
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

function offsetMonths(s: string, months: number): string {
  const { y, m, d } = parseYmd(s);
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

function formatDisplay(s: string): string {
  const { y, m, d } = parseYmd(s);
  return `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export type PresetKey = 'today' | 'yesterday' | '7d' | '30d' | '3m' | 'custom';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: 'yesterday', label: 'Kemarin' },
  { key: '7d', label: '7 Hari Terakhir' },
  { key: '30d', label: '30 Hari Terakhir' },
  { key: '3m', label: '3 Bulan Terakhir' },
];

export function getPresetRange(preset: PresetKey): { start: string; end: string } {
  const today = wibToday();
  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'yesterday': {
      const y = offsetDays(today, -1);
      return { start: y, end: y };
    }
    case '7d':
      return { start: offsetDays(today, -6), end: today };
    case '30d':
      return { start: offsetDays(today, -29), end: today };
    case '3m':
      return { start: offsetMonths(today, -3), end: today };
    default:
      return { start: today, end: today };
  }
}

// ─── Calendar grid ─────────────────────────────────────────────────────────────

const WEEKDAYS = ['M', 'S', 'S', 'R', 'K', 'J', 'S']; // Minggu..Sabtu
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

interface MonthGridProps {
  year: number;
  month: number; // 0-based
  start: string | null;
  end: string | null;
  hover: string | null;
  today: string;
  onPick: (date: string) => void;
  onHover: (date: string | null) => void;
}

function MonthGrid({ year, month, start, end, hover, today, onPick, onHover }: MonthGridProps) {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // The effective end for range highlighting (use hover while picking the 2nd date)
  const effEnd = end ?? (start && hover ? hover : null);
  const rangeLo = start && effEnd ? (start <= effEnd ? start : effEnd) : null;
  const rangeHi = start && effEnd ? (start <= effEnd ? effEnd : start) : null;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ width: 230 }}>
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 8 }}>
        {MONTH_NAMES[month]} {year}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text4)', padding: '2px 0' }}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ds = ymd(year, month, d);
          const disabled = ds > today;
          const isStart = ds === start;
          const isEnd = ds === end;
          const inRange = rangeLo && rangeHi && ds >= rangeLo && ds <= rangeHi;
          const isEdge = isStart || isEnd || (start && !end && ds === start);

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onPick(ds)}
              onMouseEnter={() => !disabled && onHover(ds)}
              style={{
                height: 28,
                border: 'none',
                borderRadius: isEdge ? 6 : 0,
                fontSize: 12,
                fontFamily: 'inherit',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: disabled
                  ? 'var(--text4)'
                  : isEdge
                  ? 'var(--accent-f, #fff)'
                  : 'var(--text1)',
                background: isEdge
                  ? 'var(--accent)'
                  : inRange
                  ? 'var(--accent-soft, rgba(59,130,246,0.15))'
                  : 'transparent',
                opacity: disabled ? 0.4 : 1,
                transition: 'background .1s',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface PeriodPickerProps {
  startDate: string;
  endDate: string;
  preset: PresetKey;
  onChange: (preset: PresetKey, start: string, end: string) => void;
}

export function PeriodPicker({ startDate, endDate, preset, onChange }: PeriodPickerProps) {
  const today = useMemo(() => wibToday(), []);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Calendar view: left month. Defaults to the month before "today" so the
  // current month sits on the right (both are within range).
  const initialView = useMemo(() => {
    const { y, m } = parseYmd(today);
    const prev = new Date(Date.UTC(y, m - 1, 1));
    return { y: prev.getUTCFullYear(), m: prev.getUTCMonth() };
  }, [today]);
  const [viewYear, setViewYear] = useState(initialView.y);
  const [viewMonth, setViewMonth] = useState(initialView.m);

  // Custom-range picking state (local until both ends chosen)
  const [pickStart, setPickStart] = useState<string | null>(null);
  const [pickEnd, setPickEnd] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // When opening, seed the picking state from current selection.
  useEffect(() => {
    if (open) {
      setPickStart(startDate);
      setPickEnd(endDate);
      setHover(null);
    }
  }, [open, startDate, endDate]);

  const buttonLabel = useMemo(() => {
    const p = PRESETS.find((x) => x.key === preset);
    if (p) return p.label;
    if (startDate === endDate) return formatDisplay(startDate);
    return `${formatDisplay(startDate)} - ${formatDisplay(endDate)}`;
  }, [preset, startDate, endDate]);

  function applyPreset(key: PresetKey) {
    const { start, end } = getPresetRange(key);
    onChange(key, start, end);
    setOpen(false);
  }

  function handlePick(date: string) {
    if (!pickStart || (pickStart && pickEnd)) {
      // Start a new range
      setPickStart(date);
      setPickEnd(null);
      return;
    }
    // Second click: complete the range (swap if needed)
    const start = date < pickStart ? date : pickStart;
    const end = date < pickStart ? pickStart : date;
    setPickStart(start);
    setPickEnd(end);
    onChange('custom', start, end);
    setOpen(false);
  }

  const leftYear = viewYear;
  const leftMonth = viewMonth;
  const right = new Date(Date.UTC(viewYear, viewMonth + 1, 1));
  const rightYear = right.getUTCFullYear();
  const rightMonth = right.getUTCMonth();

  function prevMonth() {
    const d = new Date(Date.UTC(viewYear, viewMonth - 1, 1));
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  }
  function nextMonth() {
    // Don't allow navigating the left month past the current month.
    const d = new Date(Date.UTC(viewYear, viewMonth + 1, 1));
    const todayParts = parseYmd(today);
    const limit = new Date(Date.UTC(todayParts.y, todayParts.m, 1));
    if (d.getTime() > limit.getTime()) return;
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  }

  const rightIsFuture = (() => {
    const t = parseYmd(today);
    return new Date(Date.UTC(rightYear, rightMonth, 1)).getTime() > new Date(Date.UTC(t.y, t.m, 1)).getTime();
  })();

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="laporan-period-btn"
      >
        <Calendar size={14} />
        <span>{buttonLabel}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            display: 'flex',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}
        >
          {/* Presets */}
          <div
            style={{
              width: 150,
              borderRight: '1px solid var(--border)',
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              background: 'var(--bg2)',
            }}
          >
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 6,
                  background: preset === p.key ? 'var(--accent)' : 'transparent',
                  color: preset === p.key ? 'var(--accent-f, #fff)' : 'var(--text2)',
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (preset !== p.key) e.currentTarget.style.background = 'var(--bg3)';
                }}
                onMouseLeave={(e) => {
                  if (preset !== p.key) e.currentTarget.style.background = 'transparent';
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendars */}
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <button type="button" onClick={prevMonth} className="laporan-cal-nav" aria-label="Bulan sebelumnya">
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="laporan-cal-nav"
                aria-label="Bulan berikutnya"
                disabled={rightIsFuture}
                style={rightIsFuture ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              <MonthGrid
                year={leftYear}
                month={leftMonth}
                start={pickStart}
                end={pickEnd}
                hover={hover}
                today={today}
                onPick={handlePick}
                onHover={setHover}
              />
              <MonthGrid
                year={rightYear}
                month={rightMonth}
                start={pickStart}
                end={pickEnd}
                hover={hover}
                today={today}
                onPick={handlePick}
                onHover={setHover}
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text4)' }}>
              {pickStart && !pickEnd
                ? 'Pilih tanggal akhir periode…'
                : 'Klik tanggal untuk memilih rentang custom. Tanggal setelah hari ini tidak tersedia.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
