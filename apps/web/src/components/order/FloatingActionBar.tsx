import { useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';

import { useDeferredUnmount } from '../../hooks/useDeferredUnmount';
import { getButtonsForTab, totalSelectionCount } from './floatingActionBar.logic';
import type { FloatingActionBarProps } from './floatingActionBar.types';
import { CetakLabelDropdown } from './CetakLabelDropdown';
import './FloatingActionBar.css';

/**
 * FloatingActionBar — Floating batch-action bar for the Pesanan Saya page.
 *
 * Presentational component: all state lives in the parent (`PesananSaya`).
 * Appears at the bottom-center of the viewport whenever at least one order
 * is selected, and slides out when the selection becomes empty.
 *
 * Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3,
 *               9.1, 9.2, 9.6, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.4
 */
export function FloatingActionBar({
  tab,
  selectedShipOrders,
  selectedLabelOrders,
  isShipping: _isShipping,
  isPrintingLabels,
  isPrintingPickingList,
  onAturPengiriman,
  onCetakLabelCustom,
  onCetakLabelAsli,
  onCetakPesanan,
  onClearSelection,
}: FloatingActionBarProps) {
  // ── Visibility & deferred unmount ──────────────────────────────────────────

  const totalCount = totalSelectionCount(tab, selectedShipOrders, selectedLabelOrders);
  const visible = totalCount > 0;
  const shouldRender = useDeferredUnmount(visible, 200);

  // ── Dropdown open tracking (to gate Escape handling) ──────────────────────
  // We rely on the CetakLabelDropdown handling its own Escape internally;
  // this ref tracks whether the dropdown is considered open so the bar-level
  // Escape only fires when the dropdown is closed.
  const dropdownOpenRef = useRef(false);

  // ── Button list from logic helper + ATUR_PENGIRIMAN filter ────────────────

  const rawButtons = getButtonsForTab(tab);
  const buttons = rawButtons.filter((btnId) => {
    // Req 4.4: ATUR_PENGIRIMAN is only rendered when selectedShipOrders is non-empty
    if (btnId === 'ATUR_PENGIRIMAN' && selectedShipOrders.length === 0) {
      return false;
    }
    return true;
  });

  // ── Escape key handler ────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape' && !dropdownOpenRef.current) {
        e.preventDefault();
        onClearSelection();
      }
    },
    [onClearSelection],
  );

  // ── Dropdown open/close tracking ──────────────────────────────────────────
  // We wrap the CetakLabelDropdown in a div that tracks focus to infer open
  // state — but since CetakLabelDropdown handles its own Escape, we need a
  // lighter approach: track via data attribute on the container.
  // The simplest reliable way: listen for a custom event from CetakLabelDropdown
  // or use a callback. Instead, we observe the aria-expanded attribute of the
  // trigger button via a MutationObserver or just accept that Escape on the
  // FAB is only fired when no native dropdown focus-trap is active.
  //
  // Implementation: We wrap CetakLabelDropdown and intercept its keydown events.
  // When the dropdown is open, CetakLabelDropdown's own handler will consume
  // Escape before it bubbles. Therefore, if Escape reaches the FAB's onKeyDown,
  // the dropdown is already closed — the dropdownOpenRef is not strictly needed
  // but kept for clarity.

  if (!shouldRender) return null;

  const isAnyLoading = isPrintingLabels || isPrintingPickingList;

  return (
    <div
      role="toolbar"
      aria-label="Aksi batch pesanan"
      data-state={visible ? 'open' : 'closed'}
      className="floating-action-bar"
      onKeyDown={handleKeyDown}
    >
      {/* ── Summary text (Req 2.1) ────────────────────────────────────────── */}
      <span
        className="floating-action-bar__summary"
        aria-live="polite"
        aria-atomic="true"
      >
        {totalCount} pesanan dipilih
      </span>

      <div className="floating-action-bar__divider" aria-hidden="true" />

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="floating-action-bar__buttons">
        {buttons.map((btnId) => {
          switch (btnId) {
            case 'ATUR_PENGIRIMAN': {
              const count = selectedShipOrders.length;
              const isLoading = false; // No dedicated loading flag for shipment
              const isDisabled = isAnyLoading || isLoading;
              return (
                <button
                  key="atur-pengiriman"
                  type="button"
                  className="floating-action-bar__btn floating-action-bar__btn--primary"
                  disabled={isDisabled}
                  aria-label={`Atur Pengiriman, ${count} pesanan dipilih`}
                  onClick={onAturPengiriman}
                >
                  {`Atur Pengiriman (${count})`}
                </button>
              );
            }

            case 'CETAK_LABEL': {
              const count = selectedLabelOrders.length;
              return (
                <CetakLabelDropdown
                  key="cetak-label"
                  count={count}
                  disabled={isPrintingPickingList}
                  loading={isPrintingLabels}
                  onPickAsli={onCetakLabelAsli}
                  onPickCustom={onCetakLabelCustom}
                />
              );
            }

            case 'CETAK_PESANAN': {
              const count = totalCount;
              const isLoading = isPrintingPickingList;
              const isDisabled = isPrintingLabels || isLoading;
              return (
                <button
                  key="cetak-pesanan"
                  type="button"
                  className="floating-action-bar__btn floating-action-bar__btn--secondary"
                  disabled={isDisabled}
                  aria-label={`Cetak Pesanan, ${count} pesanan dipilih`}
                  onClick={onCetakPesanan}
                >
                  {isLoading && (
                    <Loader2
                      size={14}
                      aria-hidden="true"
                      className="floating-action-bar__spinner"
                    />
                  )}
                  {`Cetak Pesanan (${count})`}
                </button>
              );
            }

            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
