/**
 * Label Cache Service
 * 
 * Persistent database cache for label documents with TTL management.
 * Caches label documents for 14 days to improve performance
 * and reduce Shopee API calls.
 * 
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.4**
 */

import type { LabelDocument } from "./label.service";
import { db } from "../db/client";
import { labelCacheTable } from "../db/schema";
import { eq, lt, inArray } from "drizzle-orm";

/**
 * Cache entry interface with expiration tracking
 */
export interface CacheEntry {
  label: LabelDocument;
  expiresAt: Date;
}

/**
 * Label cache class with TTL management
 * 
 * Features:
 * - Database-backed persistent storage (survives server restart)
 * - 14-day TTL for cached labels
 * - Automatic expiration checking
 * - Manual cache invalidation
 * - Periodic cleanup of expired entries
 */
export class LabelCache {
  private readonly TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds
  private cleanupInterval: Timer | null = null;

  constructor() {
    this.startCleanup();
  }

  /**
   * Get label from cache
   * 
   * Returns null if:
   * - Label not in cache
   * - Label has expired
   * 
   * @param orderSn - Order serial number (cache key)
   * @returns Cached label document or null
   * 
   * **Validates: Requirements 13.1, 13.2**
   */
  async get(orderSn: string): Promise<LabelDocument | null> {
    try {
      const entries = await db.select()
        .from(labelCacheTable)
        .where(eq(labelCacheTable.orderSn, orderSn))
        .limit(1);
      
      if (entries.length === 0) {
        return null;
      }

      const entry = entries[0];

      // Check if entry has expired
      if (Date.now() >= entry.expiresAt.getTime()) {
        // Remove expired entry
        await db.delete(labelCacheTable)
          .where(eq(labelCacheTable.orderSn, orderSn));
        return null;
      }

      // Convert database entry to LabelDocument
      // CRITICAL: Skip entries that are from label-data service (format: json, labelUrl: empty)
      // Those are custom label data caches, not official PDF labels
      if (!entry.labelUrl || entry.format === 'json') {
        return null;
      }

      const label: LabelDocument = {
        orderSn: entry.orderSn,
        url: entry.labelUrl,
        format: entry.format as 'pdf' | 'png',
        trackingNumber: entry.trackingNumber || undefined,
        retrievedAt: entry.createdAt
      };

      return label;
    } catch (error: any) {
      console.error('[label-cache] Error getting from cache:', error.message);
      return null;
    }
  }

  /**
   * Get multiple labels from cache
   * 
   * Returns a map of orderSn to LabelDocument.
   * Skips expired entries and non-PDF caches.
   * 
   * @param orderSns - Array of order serial numbers
   * @returns Map of cached labels
   */
  async getMany(orderSns: string[]): Promise<Map<string, LabelDocument>> {
    const result = new Map<string, LabelDocument>();
    if (orderSns.length === 0) return result;

    try {
      const entries = await db.select()
        .from(labelCacheTable)
        .where(inArray(labelCacheTable.orderSn, orderSns));

      const now = Date.now();
      for (const entry of entries) {
        if (now >= entry.expiresAt.getTime()) {
          // Note: we don't delete expired entries here to keep it simple and fast,
          // they will be cleaned up by the periodic cleanup or when accessed via get()
          continue;
        }

        if (!entry.labelUrl || entry.format === 'json') {
          continue;
        }

        result.set(entry.orderSn, {
          orderSn: entry.orderSn,
          url: entry.labelUrl,
          format: entry.format as 'pdf' | 'png',
          trackingNumber: entry.trackingNumber || undefined,
          retrievedAt: entry.createdAt
        });
      }
      return result;
    } catch (error: any) {
      console.warn('[label-cache] Error getting many from cache:', error.message);
      return result;
    }
  }

  /**
   * Store label in cache with 14-day TTL
   * 
   * @param orderSn - Order serial number (cache key)
   * @param label - Label document to cache
   * 
   * **Validates: Requirements 13.1, 13.3**
   */
  async set(orderSn: string, label: LabelDocument): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + this.TTL_MS);
      
      // Upsert: update if exists, insert if not
      const existing = await db.select()
        .from(labelCacheTable)
        .where(eq(labelCacheTable.orderSn, orderSn))
        .limit(1);

      if (existing.length > 0) {
        // Update existing entry - don't update createdAt
        await db.update(labelCacheTable)
          .set({
            labelUrl: label.url,
            format: label.format,
            trackingNumber: label.trackingNumber || null,
            expiresAt
          })
          .where(eq(labelCacheTable.orderSn, orderSn));
      } else {
        // Insert new entry - createdAt will use DEFAULT (now())
        await db.insert(labelCacheTable).values({
          orderSn,
          labelUrl: label.url,
          format: label.format,
          trackingNumber: label.trackingNumber || null,
          expiresAt
        });
      }
    } catch (error: any) {
      console.error('[label-cache] ❌ Error setting cache for order:', orderSn);
      console.error('[label-cache] Error message:', error.message);
      console.error('[label-cache] Error stack:', error.stack);
      // Don't throw - cache failure shouldn't break label retrieval
    }
  }

  /**
   * Remove label from cache
   * 
   * Used for cache invalidation when order status changes
   * 
   * @param orderSn - Order serial number (cache key)
   * 
   * **Validates: Requirements 13.4**
   */
  async delete(orderSn: string): Promise<void> {
    try {
      await db.delete(labelCacheTable)
        .where(eq(labelCacheTable.orderSn, orderSn));
    } catch (error: any) {
      console.error('[label-cache] Error deleting from cache:', error.message);
    }
  }

  /**
   * Clear expired entries from cache
   * 
   * Called periodically by cleanup interval
   * 
   * **Validates: Requirements 13.1**
   */
  async cleanup(): Promise<void> {
    try {
      const now = new Date();
      
      // Delete all expired entries
      const result = await db.delete(labelCacheTable)
        .where(lt(labelCacheTable.expiresAt, now));

      console.log('[label-cache]', {
        timestamp: new Date().toISOString(),
        operation: 'cleanup',
        message: 'Expired cache entries removed'
      });
    } catch (error: any) {
      console.error('[label-cache] Error during cleanup:', error.message);
    }
  }

  /**
   * Clear all cache entries
   * 
   * Used for testing and manual cache reset
   */
  async clear(): Promise<void> {
    try {
      await db.delete(labelCacheTable);
    } catch (error: any) {
      console.error('[label-cache] Error clearing cache:', error.message);
    }
  }

  /**
   * Get current cache size
   * 
   * @returns Number of entries in cache
   */
  async size(): Promise<number> {
    try {
      const entries = await db.select().from(labelCacheTable);
      return entries.length;
    } catch (error: any) {
      console.error('[label-cache] Error getting cache size:', error.message);
      return 0;
    }
  }

  /**
   * Start periodic cleanup of expired entries
   * 
   * Runs cleanup every hour
   */
  private startCleanup(): void {
    // Run cleanup every hour
    const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop periodic cleanup
   * 
   * Used for testing and graceful shutdown
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Singleton instance of label cache
 * 
 * Shared across all label service operations
 */
export const labelCache = new LabelCache();
