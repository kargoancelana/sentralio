/**
 * Pure helper functions for the Floating Action Bar.
 *
 * These functions are intentionally free of React and side-effects
 * (except the `console.warn` fallback in `getButtonsForTab`) so they
 * can be imported by both the component and property-based tests.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 4.4, 5.7
 */

import type { Tab, ButtonId } from './floatingActionBar.types';

/**
 * Returns the ordered list of buttons the Floating Action Bar should render
 * for the given `tab`.
 *
 * - `READY_TO_SHIP` → `['ATUR_PENGIRIMAN', 'CETAK_PESANAN']`  (Req 3.1, 3.6)
 * - `PROCESSED`     → `['CETAK_LABEL', 'CETAK_PESANAN']`       (Req 3.2, 3.6)
 * - `OTHER`         → `['CETAK_PESANAN']`                       (Req 3.3, 3.6)
 * - unknown tab     → `['CETAK_PESANAN']` + `console.warn`      (Req 3.5)
 *
 * Note: `ATUR_PENGIRIMAN` is filtered out by the component when
 * `selectedShipOrders.length === 0` (Req 4.4). `CETAK_LABEL` is always
 * included for `PROCESSED`; the component prevents opening the dropdown
 * when `selectedLabelOrders` is empty (Req 5.7).
 */
export function getButtonsForTab(tab: Tab): ButtonId[] {
  switch (tab) {
    case 'READY_TO_SHIP':
      return ['ATUR_PENGIRIMAN', 'CETAK_PESANAN'];
    case 'PROCESSED':
      return ['CETAK_LABEL', 'CETAK_PESANAN'];
    case 'OTHER':
      return ['CETAK_PESANAN'];
    default: {
      // Req 3.5: unknown tab — log a warning and fall back to Cetak Pesanan only
      console.warn('[FloatingActionBar] Unknown tab:', tab);
      return ['CETAK_PESANAN'];
    }
  }
}

/**
 * Returns the total number of selected orders to display in the FAB summary
 * and on the Tombol_Cetak_Pesanan label.
 *
 * Aggregation rules (Req 2.1, 2.2):
 * - `READY_TO_SHIP` → count only ship selection  (ship orders are the active selection)
 * - `PROCESSED`     → count only label selection (label orders are the active selection)
 * - `OTHER` / default → ship + label (both selections are active)
 *
 * @param tab   - The currently derived tab.
 * @param ship  - `selectedShipOrders` (Selection_Pengiriman).
 * @param label - `selectedLabelOrders` (Selection_Label).
 */
export function totalSelectionCount(tab: Tab, ship: string[], label: string[]): number {
  switch (tab) {
    case 'READY_TO_SHIP':
      return ship.length;
    case 'PROCESSED':
      return label.length;
    case 'OTHER':
      return ship.length + label.length;
    default:
      return ship.length + label.length;
  }
}
