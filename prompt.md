Buat branch baru dari main lalu kerjakan 4 perubahan UI berikut:
  git checkout main && git pull
  git checkout -b feat/naikkan-produk-ui

ATURAN PENTING:
- JANGAN ubah route path "/promosi/auto-boost".
- JANGAN ubah feature key "auto_boost" (dipakai FeatureGate, permission staff, & backend).
- JANGAN ganti nama komponen/file (AutoBoost.tsx tetap).
- Hanya ganti label/teks yang DILIHAT user.
- Setelah selesai: jalankan `bun run build` di apps/web sampai lolos type-check.

──────────────────────────────────────────────
1) RENAME "Auto Boost" → "Naikkan Produk" (label UI saja)
- apps/web/src/components/layout/Sidebar.tsx: ganti teks nav item "Auto Boost"
  menjadi "Naikkan Produk".
- apps/web/src/pages/AutoBoost.tsx:
    • .page-title "Auto Boost" → "Naikkan Produk"
    • banner OFF "Auto Boost nonaktif — ..." → "Naikkan Produk nonaktif — ..."
    • toast di handleToggle: "Auto Boost diaktifkan/dinonaktifkan"
      → "Naikkan Produk diaktifkan/dinonaktifkan"
- Periksa string "Auto Boost" lain yang TERLIHAT user di file ini & ganti juga.

──────────────────────────────────────────────
2) FIX modal "Hapus dari Antrian" — tombol Hapus tak terlihat di light mode
- Di AutoBoost.tsx, tombol konfirmasi hapus saat ini pakai
  className="btn btn-primary" + inline style warna yang bikin kontras buruk di light mode.
- Buat class .btn-danger di apps/web/src/styles/globals.css dengan warna EKSPLISIT
  (jangan bergantung ke CSS var tema):
    background: #dc2626; color: #fff;
    hover: background #b91c1c;
- Ganti tombol "Hapus" jadi className="btn btn-danger" dan HAPUS inline style warnanya.
- Verifikasi tombol "Batal" (btn-ghost) juga kebaca jelas di light mode.

──────────────────────────────────────────────
3) Antrian Rotasi: tampilkan THUMBNAIL + JUDUL produk (bukan cuma "Item ID")
- Data produk tersedia via api.shopeeCatalog() → array {shopeeItemId, shopId, name, imageUrl}.
  Saat ini catalog HANYA di-fetch ketika pickerOpen.
- Ubah agar catalog di-fetch begitu shopId tersedia (tidak tergantung pickerOpen):
    useApi(() => shopId ? api.shopeeCatalog() : Promise.resolve({success:true,data:[]}), [shopId])
- Bikin lookup map:
    const catalogMap = new Map(
      catalog.filter(p => p.shopId === shopId)
             .map(p => [Number(p.shopeeItemId), p])
    );
- Di render tiap item antrian, ganti "Item ID: {shopeeItemId}" menjadi:
    • thumbnail kecil <img src={prod.imageUrl}> ~40x40 rounded objectFit:cover,
      dengan fallback kotak abu kalau imageUrl kosong;
    • judul produk (prod.name) sebagai teks utama;
    • "ID: {shopeeItemId}" sebagai subteks kecil di bawah judul.
  Kalau produk tidak ketemu di map, fallback ke "Item ID: {shopeeItemId}".
- Pakai pola thumbnail yang SAMA seperti di Modal picker (sudah pakai p.imageUrl).
- Jangan ubah logika reorder/hapus; cuma bagian tampilan kiri tiap baris.

──────────────────────────────────────────────
4) Jam Aktif: input number → dropdown pilihan
- Di tab Pengaturan AutoBoost.tsx, ganti kedua <input type="number"> (Jam Aktif Mulai
  & Jam Aktif Selesai) menjadi <select className="form-input">.
- Opsi: angka 0..23, label format "HH:00" (mis. value={h}, teks={String(h).padStart(2,'0')+':00'}).
- value={config.activeHourStart} / {config.activeHourEnd};
  onChange tetap panggil handleConfigChange({ activeHourStart: Number(e.target.value) }) dst.

──────────────────────────────────────────────
Setelah lolos build, push branch & buat PR ke main.
Commit message:
feat(naikkan-produk): rename label, fix delete-modal light mode, queue thumbnail+title, jam aktif dropdown