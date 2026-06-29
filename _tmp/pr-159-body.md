Closes #159

## Tujuan
Logging diagnostik SEMENTARA untuk mencari penyebab signature mismatch pada Shopee push webhook. Semua push masuk tapi semua gagal verifikasi signature → log `signature invalid -- ack 200`.

## Perubahan
Satu-satunya perubahan: tambah blok `DEBUG-SIG` di `shopee-push.route.ts` tepat setelah baris `authHeader`, sebelum `verifyPushSignature`. Blok ini log dua perhitungan HMAC:
- `expectedKeyAsUtf8` — key dipakai as-is (UTF-8 string)
- `expectedKeyAsHexDecoded` — key di-decode dari hex dulu sebelum HMAC

Plus: `callbackUrl`, panjang & 6 char pertama key, potongan raw body, header received, dan hasil `match*`.

**Tidak ada perubahan logika.** `verifyPushSignature`, blok `setImmediate`, dan respons 2xx tetap identik.

## Cara baca output setelah deploy
```bash
sudo journalctl -u sentralio-api -f | grep DEBUG-SIG
```
- `matchKeyAsUtf8: true` → key benar as-is
- `matchKeyAsHexDecoded: true` → key di `.env` tersimpan sebagai HEX, perlu di-decode
- Keduanya `false` → masalah di `callbackUrl` (cek field `callbackUrl` di log vs URL di Shopee Console)

## Cleanup
Blok debug ini HARUS dihapus setelah penyebab ditemukan dan fix beneran di-merge.
