/**
 * Shared types for the Floating Action Bar feature.
 *
 * These types are intentionally kept in their own module (no React imports)
 * so that pure helpers (`deriveTab`, `getButtonsForTab`, `totalSelectionCount`)
 * and property tests can consume them without pulling in component code.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

/**
 * Active tab derived from `(mainFilter, subFilter)` on `PesananSaya`.
 *
 * - `READY_TO_SHIP` — `mainFilter='NEED_SHIP'` AND `subFilter='READY_TO_SHIP'`
 * - `PROCESSED`    — `mainFilter='NEED_SHIP'` AND `subFilter='PROCESSED'`
 * - `OTHER`        — every other combination (Semua / UNPAID / SHIPPED / etc.)
 */
export type Tab = 'READY_TO_SHIP' | 'PROCESSED' | 'OTHER';

/**
 * Identifier for each button that the Floating Action Bar can render.
 * Order in this union does not imply rendering order — see `getButtonsForTab`.
 */
export type ButtonId = 'ATUR_PENGIRIMAN' | 'CETAK_LABEL' | 'CETAK_PESANAN';

/**
 * Props consumed by the `FloatingActionBar` component.
 *
 * All state lives in `PesananSaya`; the bar is presentational.
 */
export interface FloatingActionBarProps {
  /** Active tab derived from `(mainFilter, subFilter)`. */
  tab: Tab;
  /** Selection_Pengiriman — `orderSn`s checked on the Ready to Ship tab. */
  selectedShipOrders: string[];
  /** Selection_Label — `orderSn`s checked on the Processed tab. */
  selectedLabelOrders: string[];
  /** Reserved for parity with the shipment dialog open flag. */
  isShipping: boolean;
  /** True while `handleBatchPrintLabels` / `handleBatchPrintOfficialLabels` runs. */
  isPrintingLabels: boolean;
  /** True while the picking-list-only flow runs. */
  isPrintingPickingList: boolean;
  /** Activate the batch shipment flow (Tombol_Atur_Pengiriman). */
  onAturPengiriman: () => void;
  /** User picked "Label Custom" from the Cetak Label dropdown. */
  onCetakLabelCustom: () => void;
  /** User picked "Label Asli" from the Cetak Label dropdown. */
  onCetakLabelAsli: () => void;
  /** Activate the picking-list-only print flow (Tombol_Cetak_Pesanan). */
  onCetakPesanan: () => void;
  /** Pressed when the user hits Escape with no dropdown open (Req 9.6). */
  onClearSelection: () => void;
}
