#!/usr/bin/env bash
# deploy.sh — one-shot deploy ke VPS
# Jalankan dari direktori manapun: ./deploy.sh
# Kalau ada step yang gagal, script BERHENTI dan API TIDAK di-restart (set -euo pipefail).
set -euo pipefail

cd "$(dirname "$0")"

echo "==> git pull"
git pull origin main

echo "==> bun install"
bun install

echo "==> db:migrate (apply pending migrations)"
# WAJIB jalan sebelum restart API.
# Kalau migration gagal, script exit non-zero di sini dan API TIDAK di-restart.
# Untuk DB baru / fresh clone dari skema prod lama, jalankan sekali sebelum
# db:migrate pertama:
#   bun run apps/api/src/scripts/reconcile-baseline.ts
bun run --filter api db:migrate

echo "==> build web"
bun run --filter web build

echo "==> restart api"
sudo systemctl restart sentralio-api

echo "==> Done. Verifikasi: sudo systemctl status sentralio-api --no-pager"
