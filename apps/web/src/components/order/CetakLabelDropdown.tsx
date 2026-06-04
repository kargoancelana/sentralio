import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Loader2, FileText, Palette } from 'lucide-react';

/**
 * CetakLabelDropdown — Tombol_Cetak_Label component for the Floating Action Bar.
 *
 * Renders a trigger button labeled "Cetak Label (N)" that, when clicked,
 * opens a richer menu with two options ("Label Asli" / "Label Custom"), each
 * with an icon and a short description so the menu reads as a polished card
 * rather than a plain list.
 *
 * Accessibility behaviour:
 * - ArrowDown / ArrowUp cycle focus through menu items (Req 9.4)
 * - Mouseenter syncs `focusedIndex` so hover and keyboard share one highlight
 *   state — no more "two items highlighted at once" flash.
 * - Enter / Space on a focused item activates it and closes the dropdown (Req 9.3)
 * - Escape closes the dropdown and returns focus to the trigger button (Req 9.5)
 * - Mousedown outside the component closes the dropdown
 * - When count === 0 or loading === true the trigger is disabled and the
 *   dropdown never opens (Req 5.6)
 *
 * Requirements: 5.1, 5.6, 9.3, 9.4, 9.5
 */

export interface CetakLabelDropdownProps {
  /** Number of currently selected label orders. */
  count: number;
  /** When true, the trigger button is disabled (e.g. count === 0). */
  disabled: boolean;
  /** When true, shows a loading indicator and disables interaction. */
  loading: boolean;
  /** Called when user picks "Label Asli". */
  onPickAsli: () => void;
  /** Called when user picks "Label Custom". */
  onPickCustom: () => void;
}

interface MenuItem {
  id: 'asli' | 'custom';
  label: string;
  description: string;
  icon: typeof Palette;
  iconColor: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'custom',
    label: 'Label Custom',
    description: 'Ada info item & SKU',
    icon: Palette,
    iconColor: 'var(--accent)',
  },
  {
    id: 'asli',
    label: 'Label Asli',
    description: 'PDF resmi dari Shopee',
    icon: FileText,
    iconColor: 'var(--warning, #f59e0b)',
  },
];

export function CetakLabelDropdown({
  count,
  disabled,
  loading,
  onPickAsli,
  onPickCustom,
}: CetakLabelDropdownProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDisabled = disabled || loading || count === 0;

  // ── Close helper ────────────────────────────────────────────────────────────
  const close = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  const closeAndRestoreFocus = useCallback(() => {
    close();
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, [close]);

  // ── Click-outside listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleMousedown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleMousedown);
    return () => document.removeEventListener('mousedown', handleMousedown);
  }, [open, close]);

  // ── Move focus into menu when it opens ─────────────────────────────────────
  useEffect(() => {
    if (open) setFocusedIndex(0);
  }, [open]);

  // ── Sync DOM focus with focusedIndex ───────────────────────────────────────
  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  // ── Trigger click handler ──────────────────────────────────────────────────
  const handleTriggerClick = () => {
    if (isDisabled) return;
    setOpen((prev) => !prev);
  };

  // ── Trigger keydown handler ────────────────────────────────────────────────
  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  // ── Menu keydown handler ───────────────────────────────────────────────────
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const itemCount = MENU_ITEMS.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % itemCount);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + itemCount) % itemCount);
        break;
      case 'Escape':
        e.preventDefault();
        closeAndRestoreFocus();
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  };

  // ── Item activation ────────────────────────────────────────────────────────
  const activateItem = (id: 'asli' | 'custom') => {
    close();
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
    if (id === 'asli') onPickAsli();
    else onPickCustom();
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {/* ── Trigger button ──────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Cetak Label, ${count} pesanan dipilih`}
        disabled={isDisabled}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          fontSize: 14,
          fontWeight: 600,
          color: isDisabled ? 'var(--text3)' : 'var(--accent-f, #fff)',
          background: isDisabled ? 'var(--bg2)' : 'var(--accent, #2563eb)',
          border: '1px solid transparent',
          borderColor: isDisabled ? 'var(--border)' : 'var(--accent, #2563eb)',
          borderRadius: 'var(--radius, 8px)',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.6 : 1,
          transition: 'opacity .15s, background .15s',
          minHeight: 44,
          minWidth: 44,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          outline: 'none',
        }}
        onFocus={(e) => {
          if (!isDisabled) {
            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent, #2563eb)55';
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {loading ? (
          <Loader2
            size={14}
            aria-hidden="true"
            style={{ animation: 'spin 1s linear infinite' }}
          />
        ) : null}
        <span>{`Cetak Label (${count})`}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform .15s',
          }}
        />
      </button>

      {/* ── Dropdown menu ───────────────────────────────────────────────────── */}
      {open && (
        <ul
          ref={menuRef}
          role="menu"
          aria-label="Pilihan cetak label"
          onKeyDown={handleMenuKeyDown}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: 0,
            margin: 0,
            padding: 6,
            listStyle: 'none',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
            minWidth: 220,
            zIndex: 110,
            animation: 'cetak-label-menu-in 140ms ease-out',
          }}
        >
          {MENU_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const isActive = focusedIndex === index;
            return (
              <li
                key={item.id}
                role="menuitem"
                tabIndex={isActive ? 0 : -1}
                onClick={() => activateItem(item.id)}
                onMouseEnter={() => setFocusedIndex(index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateItem(item.id);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  outline: 'none',
                  background: isActive ? 'var(--bg2)' : 'transparent',
                  transition: 'background 120ms ease',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isActive ? 'var(--bg)' : 'var(--bg2)',
                    border: '1px solid var(--border)',
                    color: item.iconColor,
                    flexShrink: 0,
                    transition: 'background 120ms ease',
                  }}
                >
                  <Icon size={16} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', lineHeight: 1.2 }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text4)', lineHeight: 1.2 }}>
                    {item.description}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Animations (injected once) ──────────────────────────────────────── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cetak-label-menu-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
