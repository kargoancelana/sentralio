Closes #146

## Ringkasan

Optimasi alur Pesanan (atur kirim, cetak label, reprint) sesuai Issue #146. Semua task dikerjakan dalam commit terpisah.

---

## Task 2 — Persist `package_number` di DB (prioritas tinggi)

**File diubah:** `apps/api/src/db/schema.ts`, `apps/api/src/services/shipment.service.ts`, `apps/api/src/services/label.service.ts`, `apps/api/drizzle/0001_jazzy_grey_gargoyle.sql`

- Tambah kolom `package_number VARCHAR(100) NULL` di `shopee_orders`
- Migrasi Drizzle baru: `0001_jazzy_grey_gargoyle.sql`
- `shipBatchOrders` Phase 4: persist `packageNumber` bersama `trackingNumber` ke DB setelah `getMassTrackingNumber`
- `getSingleLabel` Step 3c: jika `order.packageNumber` sudah ada di DB → **skip `get_order_detail` API call**. Hemat ~1-2s per label cache-miss
- Jika tidak ada di DB, tetap fetch dari `get_order_detail` dan persist untuk reuse berikutnya

---

## Task 4 — Picking list pakai data lokal di `printOfficialLabels`

**File diubah:** `apps/web/src/utils/printLabel.ts`

- Tambah optional parameter `localOrders` ke `printOfficialLabels`
- Jika `localOrders` ada → build picking list dari data lokal (pola `printPickingListOnly`), **skip API call ke `/label-data/batch`**. Hemat ~1-3s per klik cetak
- Jika tidak ada → fallback ke API (backward compatible)
- Output picking list **identik**: menggunakan `aggregatePickingItems` yang sama, urutan/format/halaman tidak berubah
- Anti-regression guard dari PR #145 **dipertahankan** (blok picking list tetap ada sebelum `mergedPdf.save()`)

**Verifikasi picking list:** Halaman picking list tetap muncul di akhir PDF karena blok PDF append (`if (pickingItems.length > 0) { ... mergedPdf.addPage(...) }`) tidak diubah, hanya sumber data `pickingItems` yang berubah.

---

## Task 1 — Batch ship validasi jadi 1 query IN

**File diubah:** `apps/api/src/services/shipment.service.ts`

- Phase 1 `shipBatchOrders`: ganti loop `for...of` dengan `await validateOrderEligibility(orderSn)` (N sequential DB queries) menjadi satu `db.select().where(inArray(...))` batch query
- Hasil dan pesan error per-order **identik** dengan sebelumnya
- Fallback ke per-order sequential jika batch query exception
- Hemat ~7s untuk batch 500 order

---

## Task 5 — Bundle JsBarcode & QRious lokal

**File diubah:** `apps/web/src/utils/printLabel.ts`, `apps/web/package.json`, `bun.lock`

- Install `jsbarcode@3.12.3` dan `qrious@4.0.2` via bun
- Import dengan `?raw` (Vite raw import) → embed sebagai inline `<script>` di HTML Blob
- CDN load dari jsdelivr dihapus → tidak ada dependency eksternal saat offline
- Render barcode/QR tetap identik (fungsi `renderBarcodes`/`renderQRCodes` tidak berubah logikanya)

---

## Task 3 — Dead code cleanup (partial)

**File diubah:** `apps/api/src/services/shipment.service.ts`, `apps/api/src/services/label.service.ts`

### Yang dihapus:
- **R2** `getShipmentList` dari import `shipment.service.ts` — sudah tidak dipakai di logic (digantikan `searchPackageList`)
  - Grep: `getShipmentList` masih ada di `shopee-raw.ts` (definisi) dan test `batch-dropoff-bug-exploration.test.ts`, `batch-ship-stale-status.test.ts`. **Fungsi di shopee-raw.ts TIDAK dihapus** karena masih dirujuk test.
- **R5** `classifyChunkFreshness` function + `FreshnessDecision` type — deprecated sejak v2, tidak dipanggil di runtime
  - Grep: hanya ada di komentar test (`label.arbitraries.ts`), tidak ada runtime caller

### Yang TIDAK dihapus (perlu follow-up terpisah):
- **R1** `getBatchLabels` + endpoint `/shipping-labels/batch` — masih diimport dan dipakai di `label.route.ts`, masih ada banyak test di `label.batch-retrieval.test.ts`. Tidak aman dihapus tanpa review lebih lanjut.
- **R3** `apps/web/src/utils/print.ts` (`openPrintDialog`) — masih diimport di `apps/web/src/utils/__tests__/print.test.ts`. Tidak dihapus karena ada test file yang depend.
- **R4** Unify signing HMAC — follow-up terpisah sesuai issue.

---

## Task 6 — Mark-printed batch jadi 1 query (opsional)

**File diubah:** `apps/api/src/modules/order/order.route.ts`

- `PATCH /orders/batch/label-printed`: ganti `for...of` N sequential `db.update` dengan satu `db.update().where(inArray(...) AND companyId = ...)` 

---

## Verifikasi

- `tsc --noEmit` pada semua file yang diubah: **0 errors**
- Picking list: blok append PDF di `printOfficialLabels` tetap ada — output halaman picking list identik sebelum dan sesudah (hanya sumber data yang berubah dari API ke lokal jika tersedia)
- Dead code grep dilakukan sebelum setiap penghapusan
