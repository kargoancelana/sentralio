/**
 * Platform_Companies_Service — data tenant untuk portal Super Admin (read-only).
 *
 * Dipakai route /platform/companies (list & detail). Semua query GLOBAL
 * (lintas company) karena ini sudut pandang Super Admin, BUKAN tenant-scoped.
 *
 * Catatan: kolom sensitif (password_hash, tokens_valid_from, token Shopee)
 * TIDAK pernah di-select / dikembalikan. Info langganan (subscriptions) belum
 * ada tabelnya (Fase 3), jadi belum disertakan di sini.
 */

import { eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { companies, users, shopeeCredentials } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

export interface CompanyListItem {
  id: number;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  userCount: number;
  activeShopCount: number;
}

export interface CompanyUser {
  id: number;
  name: string;
  email: string;
  username: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface CompanyShop {
  id: number;
  shopId: number;
  shopName: string | null;
  status: string;
  updatedAt: string;
}

export interface CompanyDetail {
  id: number;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  users: CompanyUser[];
  shops: CompanyShop[];
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Semua company + jumlah user & toko aktif (connected). Diurut id naik. */
export async function listCompanies(db: DrizzleDb = defaultDb): Promise<CompanyListItem[]> {
  const companyRows = await db.select().from(companies).orderBy(companies.id);

  const userCountRows = await db
    .select({ companyId: users.companyId, count: sql<number>`count(*)` })
    .from(users)
    .groupBy(users.companyId);

  const shopCountRows = await db
    .select({ companyId: shopeeCredentials.companyId, count: sql<number>`count(*)` })
    .from(shopeeCredentials)
    .where(eq(shopeeCredentials.status, 'connected'))
    .groupBy(shopeeCredentials.companyId);

  const userCountByCompany = new Map<number, number>();
  for (const row of userCountRows) {
    userCountByCompany.set(row.companyId, toNumber(row.count));
  }

  const shopCountByCompany = new Map<number, number>();
  for (const row of shopCountRows) {
    shopCountByCompany.set(row.companyId, toNumber(row.count));
  }

  return companyRows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    userCount: userCountByCompany.get(c.id) ?? 0,
    activeShopCount: shopCountByCompany.get(c.id) ?? 0,
  }));
}

/** Detail satu company + daftar user & toko (read-only). null kalau tidak ada. */
export async function getCompanyDetail(
  companyId: number,
  db: DrizzleDb = defaultDb,
): Promise<CompanyDetail | null> {
  const companyRows = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const company = companyRows[0];
  if (!company) {
    return null;
  }

  const userRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.companyId, companyId))
    .orderBy(users.id);

  const shopRows = await db
    .select({
      id: shopeeCredentials.id,
      shopId: shopeeCredentials.shopId,
      shopName: shopeeCredentials.shopName,
      status: shopeeCredentials.status,
      updatedAt: shopeeCredentials.updatedAt,
    })
    .from(shopeeCredentials)
    .where(eq(shopeeCredentials.companyId, companyId))
    .orderBy(shopeeCredentials.id);

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    status: company.status,
    createdAt: company.createdAt.toISOString(),
    users: userRows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username ?? null,
      role: u.role,
      isActive: u.isActive === 1,
      createdAt: u.createdAt.toISOString(),
    })),
    shops: shopRows.map((s) => ({
      id: s.id,
      shopId: s.shopId,
      shopName: s.shopName ?? null,
      status: s.status,
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
}
