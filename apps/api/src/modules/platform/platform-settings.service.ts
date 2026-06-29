/**
 * Platform_Settings_Service — CRUD system settings (payment info + maintenance mode).
 *
 * Dipakai di:
 *  - Route /platform/settings (portal Super Admin)
 *  - Route /subscription/payment-info (tenant, baca payment info)
 *  - Route /system/status (public, baca maintenance status)
 *  - Middleware maintenance-guard (cek level maintenance)
 *
 * Settings = key-value global (tanpa company_id). Key yang dipakai:
 *  - 'payment_info' -> { bankName, accountNumber, accountHolder, instructions, supportContact, note }
 *  - 'maintenance' -> { level: 'off'|'banner'|'full', message }
 *
 * Maintenance status di-cache pendek (10-15 detik) karena dipanggil tiap request di middleware.
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { systemSettings } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

// ── Types & Defaults ──────────────────────────────────────────

export interface PaymentInfo {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  instructions: string;   // teks bebas, multi-line
  supportContact: string; // WA/email
  note: string;           // catatan tambahan / nominal unik
}

export type MaintenanceLevel = 'off' | 'banner' | 'full';

export interface MaintenanceSetting {
  level: MaintenanceLevel;
  message: string;
}

export interface SystemSettings {
  paymentInfo: PaymentInfo;
  maintenance: MaintenanceSetting;
}

export const DEFAULT_PAYMENT_INFO: PaymentInfo = {
  bankName: '',
  accountNumber: '',
  accountHolder: '',
  instructions: '',
  supportContact: '',
  note: '',
};

export const DEFAULT_MAINTENANCE: MaintenanceSetting = {
  level: 'off',
  message: '',
};

// ── Cache (maintenance status) ────────────────────────────────

interface CacheEntry {
  value: MaintenanceSetting;
  expiresAt: number; // epoch ms
}

let maintenanceCache: CacheEntry | null = null;
const CACHE_TTL_MS = 12_000; // 12 detik

export function invalidateSettingsCache(): void {
  maintenanceCache = null;
}

// ── Helpers ───────────────────────────────────────────────────

function parsePaymentInfo(raw: string | null | undefined): PaymentInfo {
  if (!raw || raw === '') return { ...DEFAULT_PAYMENT_INFO };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PAYMENT_INFO };
    return {
      bankName: typeof parsed.bankName === 'string' ? parsed.bankName.trim() : '',
      accountNumber: typeof parsed.accountNumber === 'string' ? parsed.accountNumber.trim() : '',
      accountHolder: typeof parsed.accountHolder === 'string' ? parsed.accountHolder.trim() : '',
      instructions: typeof parsed.instructions === 'string' ? parsed.instructions.trim() : '',
      supportContact: typeof parsed.supportContact === 'string' ? parsed.supportContact.trim() : '',
      note: typeof parsed.note === 'string' ? parsed.note.trim() : '',
    };
  } catch {
    return { ...DEFAULT_PAYMENT_INFO };
  }
}

function parseMaintenance(raw: string | null | undefined): MaintenanceSetting {
  if (!raw || raw === '') return { ...DEFAULT_MAINTENANCE };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_MAINTENANCE };
    const level = ['off', 'banner', 'full'].includes(parsed.level) ? parsed.level : 'off';
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    return { level: level as MaintenanceLevel, message };
  } catch {
    return { ...DEFAULT_MAINTENANCE };
  }
}

function trimPaymentInfo(info: PaymentInfo): PaymentInfo {
  return {
    bankName: info.bankName.trim(),
    accountNumber: info.accountNumber.trim(),
    accountHolder: info.accountHolder.trim(),
    instructions: info.instructions.trim(),
    supportContact: info.supportContact.trim(),
    note: info.note.trim(),
  };
}

function trimMaintenance(m: MaintenanceSetting): MaintenanceSetting {
  return {
    level: m.level,
    message: m.message.trim(),
  };
}

// ── Service Functions ─────────────────────────────────────────

/**
 * Baca semua settings (payment_info + maintenance). Merge dgn default kalau row hilang / JSON corrupt.
 */
export async function getSettings(db: DrizzleDb = defaultDb): Promise<SystemSettings> {
  try {
    const rows = await db.select().from(systemSettings).where(
      eq(systemSettings.key, 'payment_info')
    ).union(
      db.select().from(systemSettings).where(eq(systemSettings.key, 'maintenance'))
    );

    const paymentRow = rows.find((r) => r.key === 'payment_info');
    const maintenanceRow = rows.find((r) => r.key === 'maintenance');

    return {
      paymentInfo: parsePaymentInfo(paymentRow?.valueJson),
      maintenance: parseMaintenance(maintenanceRow?.valueJson),
    };
  } catch {
    // Fallback ke default kalau query error (tabel belum ada / network issue, dll).
    return {
      paymentInfo: { ...DEFAULT_PAYMENT_INFO },
      maintenance: { ...DEFAULT_MAINTENANCE },
    };
  }
}

/**
 * Baca payment info saja (convenience untuk endpoint tenant).
 */
export async function getPaymentInfo(db: DrizzleDb = defaultDb): Promise<PaymentInfo> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'payment_info'));
    if (rows.length === 0) return { ...DEFAULT_PAYMENT_INFO };
    return parsePaymentInfo(rows[0]?.valueJson);
  } catch {
    return { ...DEFAULT_PAYMENT_INFO };
  }
}

/**
 * Baca maintenance setting saja (convenience untuk middleware / status endpoint).
 * Pakai cache pendek (dipanggil tiap request).
 */
export async function getMaintenance(db: DrizzleDb = defaultDb): Promise<MaintenanceSetting> {
  const now = Date.now();
  if (maintenanceCache && maintenanceCache.expiresAt > now) {
    return maintenanceCache.value;
  }

  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'maintenance'));
    const parsed = rows.length > 0 ? parseMaintenance(rows[0]?.valueJson) : { ...DEFAULT_MAINTENANCE };
    maintenanceCache = { value: parsed, expiresAt: now + CACHE_TTL_MS };
    return parsed;
  } catch {
    const fallback = { ...DEFAULT_MAINTENANCE };
    maintenanceCache = { value: fallback, expiresAt: now + CACHE_TTL_MS };
    return fallback;
  }
}

/**
 * Update settings (upsert per key yang dikirim). Minimal salah satu (paymentInfo / maintenance) harus ada.
 */
export async function updateSettings(
  input: { paymentInfo?: PaymentInfo; maintenance?: MaintenanceSetting },
  db: DrizzleDb = defaultDb,
): Promise<void> {
  const updates: Array<{ key: string; valueJson: string }> = [];

  if (input.paymentInfo) {
    const trimmed = trimPaymentInfo(input.paymentInfo);
    updates.push({ key: 'payment_info', valueJson: JSON.stringify(trimmed) });
  }

  if (input.maintenance) {
    const trimmed = trimMaintenance(input.maintenance);
    updates.push({ key: 'maintenance', valueJson: JSON.stringify(trimmed) });
  }

  // Upsert per key (MySQL onDuplicateKeyUpdate).
  for (const { key, valueJson } of updates) {
    await db
      .insert(systemSettings)
      .values({ key, valueJson })
      .onDuplicateKeyUpdate({ set: { valueJson, updatedAt: new Date() } });
  }

  // Invalidate cache setelah update.
  invalidateSettingsCache();
}
