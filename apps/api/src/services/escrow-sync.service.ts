/**
 * Escrow Sync Service
 *
 * Handles manual sinkronisasi data escrow dari Shopee Payment API.
 * Memanggil get_escrow_list untuk mendapatkan escrow_release_time per order,
 * kemudian memanggil get_escrow_detail untuk mendapatkan rincian biaya (fee breakdown).
 *
 * Fitur utama:
 * - Lock system menggunakan tabel sync_state (job_name = "escrow_sync")
 * - Pagination otomatis saat get_escrow_list mengembalikan more=true
 * - Rate limit handling: jeda 1 detik antar request, 60 detik saat error_rate_limit
 * - Error resilience: non-rate-limit errors di-skip, sync tetap berlanjut
 *
 * Requirements: 8.1, 8.3, 8.4, 8.5
 */

import { db } from "../db/client";
import { shopeeCredentials, shopeeOrders, shopeeOrderItems, shopeeOrderFees, syncState } from "../db/schema";
import { getEscrowList, getEscrowDetail, getEscrowDetailBatch, getShopeeOrderDetails } from "./shopee-raw";
import { eq, and, inArray } from "drizzle-orm";
import { aggregateOrderItems, collectRawItems } from "./order-items.util";

// ─── Interfaces ───────────────────────────────────────────────

export interface EscrowSyncResult {
  totalSynced: number;
  totalSkipped: number;
  errors: number;
  shops: Array<{
    shopId: number;
    synced: number;
    skipped: number;
    errors: number;
  }>;
}

export interface EscrowListItem {
  order_sn: string;
  escrow_release_time: number; // Unix timestamp
}

// ─── Job Name Constant ────────────────────────────────────────

/** Default job name (manual sync via /sync/escrow endpoint) */
const DEFAULT_JOB_NAME = "escrow_sync";

// Digunakan sebagai shopId sentinel di sync_state untuk lock global
// (escrow sync berjalan untuk semua toko sekaligus, bukan per toko)
const GLOBAL_SHOP_ID = 0;

// ─── EscrowSyncService ────────────────────────────────────────

export class EscrowSyncService {
  private readonly jobName: string;

  /**
   * @param jobName - Lock identifier untuk sync_state. Default `"escrow_sync"`
   *                  (manual sync). Background scheduler dapat mengirim
   *                  `"escrow_sync_hot"` / `"escrow_sync_cold"` agar tier
   *                  yang berbeda punya lock terpisah dan tidak saling
   *                  mem-blokir.
   */
  constructor(jobName: string = DEFAULT_JOB_NAME) {
    this.jobName = jobName;
  }

  /**
   * Entry point utama untuk sinkronisasi escrow.
   * Dipanggil dari endpoint POST /sync/escrow.
   *
   * @param daysBack - Jumlah hari ke belakang untuk range escrow_release_time (default: 30)
   * @returns EscrowSyncResult berisi statistik sync per toko
   * @throws Error dengan message 'SYNC_IN_PROGRESS' jika sync sedang berjalan (untuk 409)
   */
  async startEscrowSync(daysBack: number = 30): Promise<EscrowSyncResult> {
    console.log(`[${this.jobName}] Starting escrow sync (daysBack=${daysBack})`);

    // Coba acquire lock; tolak jika sudah berjalan
    const locked = await this.acquireLock();
    if (!locked) {
      console.warn(`[${this.jobName}] Sync already in progress, rejecting new request`);
      throw new Error("SYNC_IN_PROGRESS");
    }

    const result: EscrowSyncResult = {
      totalSynced: 0,
      totalSkipped: 0,
      errors: 0,
      shops: [],
    };

    try {
      // Ambil semua toko yang terdaftar
      const shops = await db
        .select({ shopId: shopeeCredentials.shopId })
        .from(shopeeCredentials)
        .where(eq(shopeeCredentials.status, "connected"));

      if (shops.length === 0) {
        console.warn("[escrow-sync] No shops found, nothing to sync");
        return result;
      }

      console.log(`[escrow-sync] Found ${shops.length} shop(s) to sync`);

      // Hitung range waktu berdasarkan daysBack
      const now = Math.floor(Date.now() / 1000);
      const releaseTimeFrom = now - daysBack * 24 * 60 * 60;
      const releaseTimeTo = now;

      // Update last_sync_time saat mulai
      await this.updateSyncTime(new Date());

      // Proses setiap toko secara sekuensial
      for (const shop of shops) {
        const shopResult = await this.syncShopEscrow(
          shop.shopId,
          releaseTimeFrom,
          releaseTimeTo
        );

        result.shops.push({ shopId: shop.shopId, ...shopResult });
        result.totalSynced += shopResult.synced;
        result.totalSkipped += shopResult.skipped;
        result.errors += shopResult.errors;
      }

      // Log hasil akhir (Requirement 7.3)
      console.log(
        `[escrow-sync] Sync completed — synced: ${result.totalSynced}, skipped: ${result.totalSkipped}, errors: ${result.errors}`
      );
    } finally {
      // Selalu release lock, bahkan saat terjadi error
      await this.releaseLock();
    }

    return result;
  }

  /**
   * Sinkronisasi escrow untuk satu toko.
   * Memanggil fetchEscrowList untuk mendapatkan semua order_sn + escrow_release_time,
   * kemudian update DB dan memanggil getEscrowDetailBatch (batch 20) untuk fee breakdown.
   */
  private async syncShopEscrow(
    shopId: number,
    releaseTimeFrom: number,
    releaseTimeTo: number
  ): Promise<{ synced: number; skipped: number; errors: number }> {
    console.log(
      `[escrow-sync] Syncing shop ${shopId} (from=${new Date(releaseTimeFrom * 1000).toISOString()}, to=${new Date(releaseTimeTo * 1000).toISOString()})`
    );

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    // Ambil semua halaman escrow list
    let escrowItems: EscrowListItem[];
    try {
      escrowItems = await this.fetchEscrowList(shopId, releaseTimeFrom, releaseTimeTo);
    } catch (err: any) {
      console.error(`[escrow-sync] Failed to fetch escrow list for shop ${shopId}:`, err.message);
      errors++;
      return { synced, skipped, errors };
    }

    console.log(`[escrow-sync] Shop ${shopId}: got ${escrowItems.length} escrow items`);

    // Step 1a: Self-heal — fetch detail dari Shopee untuk:
    //   (1) order yang BELUM ada di DB sama sekali (escrow released, tapi
    //       order_sync window terlalu sempit untuk menangkapnya), dan
    //   (2) order yang ADA di DB tapi statusnya STALE — yaitu masih dalam
    //       state non-final (READY_TO_SHIP / SHIPPED / TO_RETURN / IN_CANCEL /
    //       UNPAID / dll) padahal Shopee sudah meliris escrow. Status final
    //       yang diharapkan adalah COMPLETED atau CANCELLED. Ini terjadi
    //       ketika order sempat berubah status (mis. "Pembatalan Diajukan
    //       → Pembatalan Ditarik → Selesai") di luar window order-sync, dan
    //       state IN_CANCEL nyangkut di DB.
    //
    // Kalau dilewatkan, order kategori (2) akan hilang dari Laporan Keuangan
    // (filter `WHERE order_status = 'COMPLETED'`) walaupun escrow + fees-nya
    // sudah lengkap.
    const FINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED']);
    const allSns = escrowItems.map((it) => it.order_sn);
    const existingRows = allSns.length > 0
      ? await db
          .select({ orderSn: shopeeOrders.orderSn, orderStatus: shopeeOrders.orderStatus })
          .from(shopeeOrders)
          .where(inArray(shopeeOrders.orderSn, allSns))
      : [];
    const existingMap = new Map<string, string>();
    for (const row of existingRows) {
      existingMap.set(row.orderSn, row.orderStatus);
    }
    const existingSet = new Set(existingMap.keys());
    const missingSns = allSns.filter((sn) => !existingSet.has(sn));
    const staleStatusSns = allSns.filter((sn) => {
      const status = existingMap.get(sn);
      return status !== undefined && !FINAL_STATUSES.has(status);
    });

    // Heal both categories in the same batch loop. Insert vs update is
    // disambiguated inside the loop (re-check existence before INSERT).
    const healSns = [...missingSns, ...staleStatusSns];

    if (healSns.length > 0) {
      console.log(
        `[escrow-sync] Shop ${shopId}: ${missingSns.length} missing + ${staleStatusSns.length} stale-status order_sn need heal`
      );
      if (staleStatusSns.length > 0) {
        const stalePreview = staleStatusSns.slice(0, 5).map((sn) => `${sn}(${existingMap.get(sn)})`).join(', ');
        console.log(`[escrow-sync] Stale-status sample: ${stalePreview}${staleStatusSns.length > 5 ? '...' : ''}`);
      }
      const HEAL_BATCH = 50;
      for (let i = 0; i < healSns.length; i += HEAL_BATCH) {
        const batch = healSns.slice(i, i + HEAL_BATCH);
        try {
          const detailRes: any = await getShopeeOrderDetails(shopId, batch);
          if (detailRes?.error && detailRes.error !== "") {
            console.warn(`[escrow-sync] Heal batch ${Math.floor(i / HEAL_BATCH) + 1} error: ${detailRes.error} — ${detailRes.message}`);
            continue;
          }
          const orders: any[] = detailRes?.response?.order_list ?? [];
          for (const order of orders) {
            const shippingCarrier =
              order.shipping_carrier
              || order.package_list?.[0]?.shipping_carrier
              || null;

            // Race-safe upsert: re-check existence right before INSERT/UPDATE.
            // For stale-status case, the row exists → we just refresh status.
            // For missing case, the row may have been concurrently inserted
            // by active-orders sync between our IN-list check and now — if so,
            // we still want to refresh its status from this fresh detail.
            const reCheck = await db
              .select({ id: shopeeOrders.id, orderStatus: shopeeOrders.orderStatus })
              .from(shopeeOrders)
              .where(eq(shopeeOrders.orderSn, order.order_sn))
              .limit(1);

            if (reCheck.length > 0) {
              // Order already in DB. If status differs from Shopee's authoritative
              // value, update it. This is the core fix for the IN_CANCEL → COMPLETED
              // (or other late-flip) case.
              if (reCheck[0].orderStatus !== order.order_status) {
                await db
                  .update(shopeeOrders)
                  .set({
                    orderStatus: order.order_status,
                    updatedAt: new Date(),
                  })
                  .where(eq(shopeeOrders.orderSn, order.order_sn));
                console.log(`[escrow-sync] Refreshed status ${order.order_sn}: ${reCheck[0].orderStatus} → ${order.order_status}`);
              }
              existingSet.add(order.order_sn);
              continue;
            }

            try {
              await db.insert(shopeeOrders).values({
                shopId,
                orderSn: order.order_sn,
                orderStatus: order.order_status,
                totalAmount: order.total_amount ? Math.round(order.total_amount) : 0,
                buyerUsername: order.buyer_username || "",
                shippingCarrier,
                trackingNumber: null,
                payTime: order.pay_time ? new Date(order.pay_time * 1000) : null,
                createTime: new Date(order.create_time * 1000),
                updatedAt: new Date(),
              });
            } catch (insertErr: any) {
              // Concurrent insert from order-sync — treat as healed.
              if (insertErr?.code === 'ER_DUP_ENTRY') {
                console.log(`[escrow-sync] Healing race for ${order.order_sn} — already inserted by another sync, continuing`);
                existingSet.add(order.order_sn);
                continue;
              }
              throw insertErr;
            }

            // Insert items (aggregated by item_id+model_id so duplicate variant
            // rows have their qty summed — see order-items.util.ts).
            const aggregated = aggregateOrderItems(collectRawItems(order));
            // Only write items if the order had no items yet (avoid duplicates).
            const existingItems = await db
              .select({ id: shopeeOrderItems.id })
              .from(shopeeOrderItems)
              .where(eq(shopeeOrderItems.orderSn, order.order_sn))
              .limit(1);
            if (existingItems.length === 0) {
              for (const item of aggregated) {
                try {
                  await db.insert(shopeeOrderItems).values({
                    orderSn: order.order_sn,
                    itemId: item.itemId,
                    modelId: item.modelId,
                    itemName: item.itemName,
                    modelName: item.modelName,
                    modelSku: item.modelSku,
                    qty: item.qty,
                    itemPrice: item.itemPrice,
                  });
                } catch (itemErr: any) {
                  // Race with order-sync inserting items concurrently — just skip
                  if (itemErr?.code === 'ER_DUP_ENTRY') continue;
                  throw itemErr;
                }
              }
            }

            existingSet.add(order.order_sn);
          }
          console.log(`[escrow-sync] Healed ${orders.length}/${batch.length} orders in batch ${Math.floor(i / HEAL_BATCH) + 1}`);
        } catch (err: any) {
          console.warn(`[escrow-sync] Heal batch ${Math.floor(i / HEAL_BATCH) + 1} threw:`, err?.message);
        }
        // Small delay between batches to avoid rate limit
        if (i + HEAL_BATCH < healSns.length) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    // Step 1b: Update escrow_release_time for every escrow item whose order
    // exists in DB (after self-heal). Orders that still don't exist
    // (e.g. Shopee detail API returned nothing) are counted as skipped.
    const validItems: EscrowListItem[] = [];
    for (const item of escrowItems) {
      if (!existingSet.has(item.order_sn)) {
        skipped++;
        continue;
      }

      await db
        .update(shopeeOrders)
        .set({
          escrowReleaseTime: new Date(item.escrow_release_time * 1000),
          updatedAt: new Date(),
        })
        .where(eq(shopeeOrders.orderSn, item.order_sn));

      validItems.push(item);
    }

    if (skipped > 0) {
      console.log(`[escrow-sync] Shop ${shopId}: skipped ${skipped} orders even after self-heal (Shopee detail API returned no data)`);
    }

    // Step 2: Batch fetch fee breakdown (chunk 20, recommended by Shopee)
    const BATCH_SIZE = 20;
    for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
      const batch = validItems.slice(i, i + BATCH_SIZE);
      const orderSnList = batch.map(item => item.order_sn);

      console.log(`[escrow-sync] Shop ${shopId}: fetching escrow detail batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validItems.length / BATCH_SIZE)} (${orderSnList.length} orders)`);

      try {
        const response = await getEscrowDetailBatch(shopId, orderSnList);

        if (response?.error && response.error !== "") {
          if (response.error === "error_rate_limit") {
            console.warn(`[escrow-sync] Rate limit hit on batch detail, waiting 60s...`);
            await new Promise((resolve) => setTimeout(resolve, 60000));
            i -= BATCH_SIZE; // Retry this batch
            continue;
          }
          console.error(`[escrow-sync] Batch detail error: ${response.error} — ${response.message}`);
          errors += orderSnList.length;
          continue;
        }

        // Process each order in the batch response
        const escrowDetailList = response?.response || [];
        for (const item of escrowDetailList) {
          const detail = item?.escrow_detail;
          if (!detail || !detail.order_income) {
            // Check for per-order failure
            if (item?.fail_error) {
              console.warn(`[escrow-sync] Order ${item?.escrow_detail?.order_sn || 'unknown'}: ${item.fail_error} — ${item.fail_message}`);
              errors++;
            }
            continue;
          }

          const orderSn = detail.order_sn;
          const orderIncome = detail.order_income;

          const fees = {
            commissionFee: Math.round(orderIncome.commission_fee ?? 0),
            serviceFee: Math.round(orderIncome.service_fee ?? 0),
            sellerOrderProcessingFee: Math.round(orderIncome.seller_order_processing_fee ?? 0),
            actualShippingFee: Math.round(orderIncome.actual_shipping_fee ?? 0),
            shopeeShippingRebate: Math.round(orderIncome.shopee_shipping_rebate ?? 0),
            sellerVoucher: Math.round(orderIncome.voucher_from_seller ?? 0),
            escrowAmount: Math.round(orderIncome.escrow_amount ?? 0),
            amsCommissionFee: Math.round(orderIncome.order_ams_commission_fee ?? 0),
            // Shopee returns seller_return_refund as negative (uang yang ditarik
            // balik dari seller). Store as absolute value so the deductions
            // panel can display & sum it as a positive potongan, matching the
            // Excel "Jumlah Pengembalian Dana ke Pembeli" column.
            sellerReturnRefund: Math.round(Math.abs(orderIncome.seller_return_refund ?? 0)),
            // Signed: negative = seller bears shipping, positive = seller gets refund.
            // Stored as-is for correct grand-total computation in deductions panel.
            finalShippingFee: Math.round(orderIncome.final_shipping_fee ?? 0),
            updatedAt: new Date(),
          };

          // Upsert ke shopee_order_fees
          try {
            const existing = await db
              .select({ id: shopeeOrderFees.id })
              .from(shopeeOrderFees)
              .where(eq(shopeeOrderFees.orderSn, orderSn))
              .limit(1);

            if (existing.length > 0) {
              await db.update(shopeeOrderFees).set(fees).where(eq(shopeeOrderFees.orderSn, orderSn));
            } else {
              await db.insert(shopeeOrderFees).values({ orderSn, ...fees });
            }
            synced++;
          } catch (dbErr: any) {
            console.error(`[escrow-sync] DB error for ${orderSn}:`, dbErr.message);
            errors++;
          }
        }
      } catch (err: any) {
        if (err.message?.includes("error_rate_limit")) {
          console.warn(`[escrow-sync] Rate limit hit, waiting 60s...`);
          await new Promise((resolve) => setTimeout(resolve, 60000));
          i -= BATCH_SIZE; // Retry
          continue;
        }
        console.error(`[escrow-sync] Batch error:`, err.message);
        errors += orderSnList.length;
      }

      // Jeda 1 detik antar batch
      if (i + BATCH_SIZE < validItems.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(
      `[escrow-sync] Shop ${shopId} done — synced: ${synced}, skipped: ${skipped}, errors: ${errors}`
    );
    return { synced, skipped, errors };
  }

  /**
   * Ambil semua halaman dari get_escrow_list untuk satu toko.
   * Melakukan pagination selama more=true (Requirement 1.2).
   */
  private async fetchEscrowList(
    shopId: number,
    releaseTimeFrom: number,
    releaseTimeTo: number
  ): Promise<EscrowListItem[]> {
    const allItems: EscrowListItem[] = [];
    let pageNo = 1;
    let hasMore = true;

    while (hasMore) {
      console.log(`[escrow-sync] Shop ${shopId}: fetching escrow list page ${pageNo}`);

      const response = await getEscrowList(shopId, releaseTimeFrom, releaseTimeTo, pageNo);

      if (response?.error && response.error !== "") {
        // Rate limit handling (Requirement 2.4)
        if (response.error === "error_rate_limit") {
          console.warn(
            `[escrow-sync] Shop ${shopId}: rate limit hit on get_escrow_list, waiting 60s...`
          );
          await new Promise((resolve) => setTimeout(resolve, 60000));
          // Retry halaman yang sama
          continue;
        }
        throw new Error(`get_escrow_list error: ${response.error} — ${response.message}`);
      }

      const escrowList: EscrowListItem[] = response?.response?.escrow_list ?? [];
      allItems.push(...escrowList);

      hasMore = response?.response?.more === true;
      pageNo++;

      // Jeda antar halaman
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return allItems;
  }

  /**
   * Ambil detail escrow (fee breakdown) untuk satu order dan simpan ke shopee_order_fees.
   * Upsert: jika record sudah ada, akan di-update dengan data terbaru (Requirement 2.3).
   *
   * @returns true jika berhasil, false jika terjadi error
   */
  private async syncEscrowDetail(shopId: number, orderSn: string): Promise<boolean> {
    try {
      const response = await getEscrowDetail(shopId, orderSn);

      if (response?.error && response.error !== "") {
        // Rate limit handling (Requirement 2.4)
        if (response.error === "error_rate_limit") {
          console.warn(
            `[escrow-sync] Rate limit hit on get_escrow_detail (order ${orderSn}), waiting 60s...`
          );
          await new Promise((resolve) => setTimeout(resolve, 60000));
          // Retry sekali setelah tunggu
          return this.syncEscrowDetail(shopId, orderSn);
        }

        // Non-rate-limit error: log dan lanjutkan (Requirement 2.5)
        console.error(
          `[escrow-sync] get_escrow_detail error for ${orderSn}: ${response.error} — ${response.message}`
        );
        return false;
      }

      const orderIncome = response?.response?.order_income ?? {};

      // Nilai default 0 untuk field yang tidak ada
      const fees = {
        commissionFee: Math.round(orderIncome.commission_fee ?? 0),
        serviceFee: Math.round(orderIncome.service_fee ?? 0),
        sellerOrderProcessingFee: Math.round(
          orderIncome.seller_order_processing_fee ?? 0
        ),
        actualShippingFee: Math.round(orderIncome.actual_shipping_fee ?? 0),
        shopeeShippingRebate: Math.round(orderIncome.shopee_shipping_rebate ?? 0),
        sellerVoucher: Math.round(orderIncome.voucher_from_seller ?? 0),
        escrowAmount: Math.round(orderIncome.escrow_amount ?? 0),
        amsCommissionFee: Math.round(orderIncome.order_ams_commission_fee ?? 0),
        // Shopee returns negative; store absolute (see comment in batch path).
        sellerReturnRefund: Math.round(Math.abs(orderIncome.seller_return_refund ?? 0)),
        // Signed: negative = seller bears shipping, positive = seller gets refund.
        finalShippingFee: Math.round(orderIncome.final_shipping_fee ?? 0),
        updatedAt: new Date(),
      };

      // Cek apakah record sudah ada (untuk upsert manual)
      const existing = await db
        .select({ id: shopeeOrderFees.id })
        .from(shopeeOrderFees)
        .where(eq(shopeeOrderFees.orderSn, orderSn))
        .limit(1);

      if (existing.length > 0) {
        // Update record yang sudah ada (Requirement 2.3)
        await db
          .update(shopeeOrderFees)
          .set(fees)
          .where(eq(shopeeOrderFees.orderSn, orderSn));
      } else {
        // Insert record baru (Requirement 2.2)
        await db.insert(shopeeOrderFees).values({
          orderSn,
          ...fees,
        });
      }

      return true;
    } catch (err: any) {
      // Non-rate-limit error: log dan lanjutkan (Requirement 2.5)
      console.error(
        `[escrow-sync] Unexpected error in syncEscrowDetail for ${orderSn}:`,
        err.message
      );
      return false;
    }
  }

  /**
   * Coba acquire lock di tabel sync_state dengan job_name = this.jobName.
   * Jika sync_in_progress = 1 sudah ada, kembalikan false (lock tidak bisa didapat).
   * Requirement 8.3, 8.4
   */
  private async acquireLock(): Promise<boolean> {
    // Cek apakah record sync_state sudah ada
    const existing = await db
      .select()
      .from(syncState)
      .where(
        and(
          eq(syncState.jobName, this.jobName),
          eq(syncState.shopId, GLOBAL_SHOP_ID)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      // Belum pernah sync, buat record baru dengan lock
      await db.insert(syncState).values({
        jobName: this.jobName,
        shopId: GLOBAL_SHOP_ID,
        lastSyncTime: new Date(),
        lastSyncEndTime: new Date(),
        syncInProgress: 1,
        totalSynced: 0,
        errors: 0,
        updatedAt: new Date(),
      });
      console.log(`[${this.jobName}] Lock acquired (new record created)`);
      return true;
    }

    const state = existing[0];

    // Jika sudah terkunci, tolak (Requirement 8.4)
    if (state.syncInProgress === 1) {
      return false;
    }

    // Set lock
    await db
      .update(syncState)
      .set({
        syncInProgress: 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(syncState.jobName, this.jobName),
          eq(syncState.shopId, GLOBAL_SHOP_ID)
        )
      );

    console.log(`[${this.jobName}] Lock acquired`);
    return true;
  }

  /**
   * Release lock dan update last_sync_end_time di tabel sync_state.
   * Requirement 8.5
   */
  private async releaseLock(): Promise<void> {
    await db
      .update(syncState)
      .set({
        syncInProgress: 0,
        lastSyncEndTime: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(syncState.jobName, this.jobName),
          eq(syncState.shopId, GLOBAL_SHOP_ID)
        )
      );

    console.log(`[${this.jobName}] Lock released`);
  }

  /**
   * Update last_sync_time di tabel sync_state saat sync dimulai.
   * Requirement 8.5
   */
  private async updateSyncTime(syncTime: Date): Promise<void> {
    await db
      .update(syncState)
      .set({
        lastSyncTime: syncTime,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(syncState.jobName, this.jobName),
          eq(syncState.shopId, GLOBAL_SHOP_ID)
        )
      );
  }
}
