Closes #157

## Masalah
`{ type: "text" }` tidak cukup kalau klien kirim `Content-Type: application/json` (seperti Shopee push). Elysia tetap parse body jadi object → `typeof body === "string"` false → fallback `request.text()` throw karena stream sudah dikonsumsi → **400** → Shopee Console Verify gagal.

## Fix
- Ganti `{ type: "text" }` dengan custom `parse` hook: `parse: async ({ request }) => request.text()`
  - Ini jamin `body` selalu raw string **apapun Content-Type-nya**
- Handler **selalu balas 200** — signature hanya menentukan apakah payload diproses, bukan HTTP status
  - Signature invalid → ack 200 + log, tidak proses DB
  - Config belum lengkap → ack 200 + log, tidak proses DB

## Verifikasi DoD
- [x] Tidak ada `set.status = 4xx/5xx` di handler
- [x] Tidak ada `type: "text"` sebagai config (hanya di komentar)
- [x] `parse: async` terpasang (baris 168)
- [ ] Deploy → `curl -X POST https://sentralio.my.id/api/shopee/webhook -H "Content-Type: application/json" -d '{"code":0}'` harus HTTP 200
- [ ] Klik Verify di Shopee Console → sukses 2xx
