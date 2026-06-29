/**
 * Unit tests untuk platform-settings.service.ts
 *
 * Test coverage:
 *  - parsePaymentInfo / parseMaintenance (JSON parse + defaults)
 *  - getSettings, getPaymentInfo, getMaintenance (query + fallback)
 *  - updateSettings (upsert logic)
 *  - cache invalidation
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import {
  getSettings,
  getPaymentInfo,
  getMaintenance,
  updateSettings,
  invalidateSettingsCache,
  DEFAULT_PAYMENT_INFO,
  DEFAULT_MAINTENANCE,
  type PaymentInfo,
  type MaintenanceSetting,
} from './platform-settings.service';

// Mock DB
const mockDb = {
  select: mock(() => ({
    from: mock(() => ({
      where: mock(() => ({
        union: mock(() => []), // default: empty rows
        limit: mock(() => []),
      })),
    })),
  })),
  insert: mock(() => ({
    values: mock(() => ({
      onDuplicateKeyUpdate: mock(() => Promise.resolve()),
    })),
  })),
};

describe('platform-settings.service', () => {
  beforeEach(() => {
    // Reset mocks
    mock.restore();
    invalidateSettingsCache();
  });

  describe('getSettings', () => {
    it('should return default settings when no rows exist', async () => {
      // Mock empty result
      const settings = await getSettings(mockDb as any);
      expect(settings.paymentInfo).toEqual(DEFAULT_PAYMENT_INFO);
      expect(settings.maintenance).toEqual(DEFAULT_MAINTENANCE);
    });

    it('should parse valid payment_info JSON', async () => {
      const paymentJson = JSON.stringify({
        bankName: 'BCA',
        accountNumber: '1234567890',
        accountHolder: 'PT Test',
        instructions: 'Transfer ke rekening',
        supportContact: '08123456789',
        note: 'Konfirmasi via WA',
      });

      const mockDbWithData = {
        select: () => ({
          from: () => ({
            where: () => ({
              union: () => [
                { key: 'payment_info', valueJson: paymentJson },
                { key: 'maintenance', valueJson: JSON.stringify({ level: 'off', message: '' }) },
              ],
            }),
          }),
        }),
      };

      const settings = await getSettings(mockDbWithData as any);
      expect(settings.paymentInfo.bankName).toBe('BCA');
      expect(settings.paymentInfo.accountNumber).toBe('1234567890');
    });

    it('should parse valid maintenance JSON', async () => {
      const maintenanceJson = JSON.stringify({
        level: 'banner',
        message: 'Maintenance dijadwalkan besok',
      });

      const mockDbWithData = {
        select: () => ({
          from: () => ({
            where: () => ({
              union: () => [
                { key: 'payment_info', valueJson: null },
                { key: 'maintenance', valueJson: maintenanceJson },
              ],
            }),
          }),
        }),
      };

      const settings = await getSettings(mockDbWithData as any);
      expect(settings.maintenance.level).toBe('banner');
      expect(settings.maintenance.message).toBe('Maintenance dijadwalkan besok');
    });

    it('should fallback to defaults on corrupt JSON', async () => {
      const mockDbWithData = {
        select: () => ({
          from: () => ({
            where: () => ({
              union: () => [
                { key: 'payment_info', valueJson: 'invalid json{' },
                { key: 'maintenance', valueJson: '[]' },
              ],
            }),
          }),
        }),
      };

      const settings = await getSettings(mockDbWithData as any);
      expect(settings.paymentInfo).toEqual(DEFAULT_PAYMENT_INFO);
      expect(settings.maintenance).toEqual(DEFAULT_MAINTENANCE);
    });

    it('should fallback to defaults on query error', async () => {
      const mockDbWithError = {
        select: () => {
          throw new Error('DB connection lost');
        },
      };

      const settings = await getSettings(mockDbWithError as any);
      expect(settings.paymentInfo).toEqual(DEFAULT_PAYMENT_INFO);
      expect(settings.maintenance).toEqual(DEFAULT_MAINTENANCE);
    });
  });

  describe('getPaymentInfo', () => {
    it('should return default when no row exists', async () => {
      const mockDbEmpty = {
        select: () => ({
          from: () => ({
            where: () => [],
          }),
        }),
      };

      const paymentInfo = await getPaymentInfo(mockDbEmpty as any);
      expect(paymentInfo).toEqual(DEFAULT_PAYMENT_INFO);
    });

    it('should parse valid payment_info row', async () => {
      const paymentJson = JSON.stringify({
        bankName: 'Mandiri',
        accountNumber: '9876543210',
        accountHolder: 'PT Example',
        instructions: 'Kirim bukti transfer',
        supportContact: 'admin@example.com',
        note: '',
      });

      const mockDbWithData = {
        select: () => ({
          from: () => ({
            where: () => [{ key: 'payment_info', valueJson: paymentJson }],
          }),
        }),
      };

      const paymentInfo = await getPaymentInfo(mockDbWithData as any);
      expect(paymentInfo.bankName).toBe('Mandiri');
      expect(paymentInfo.accountNumber).toBe('9876543210');
    });
  });

  describe('getMaintenance', () => {
    it('should cache maintenance status', async () => {
      const maintenanceJson = JSON.stringify({ level: 'full', message: 'System maintenance' });
      let queryCount = 0;

      const mockDbWithData = {
        select: () => {
          queryCount++;
          return {
            from: () => ({
              where: () => [{ key: 'maintenance', valueJson: maintenanceJson }],
            }),
          };
        },
      };

      // First call - query DB
      const m1 = await getMaintenance(mockDbWithData as any);
      expect(m1.level).toBe('full');
      expect(queryCount).toBe(1);

      // Second call within TTL - use cache
      const m2 = await getMaintenance(mockDbWithData as any);
      expect(m2.level).toBe('full');
      expect(queryCount).toBe(1); // tidak query lagi

      // Invalidate cache
      invalidateSettingsCache();

      // Third call - query DB again
      const m3 = await getMaintenance(mockDbWithData as any);
      expect(m3.level).toBe('full');
      expect(queryCount).toBe(2);
    });

    it('should handle invalid maintenance level', async () => {
      const mockDbWithData = {
        select: () => ({
          from: () => ({
            where: () => [{ key: 'maintenance', valueJson: JSON.stringify({ level: 'invalid', message: 'test' }) }],
          }),
        }),
      };

      const maintenance = await getMaintenance(mockDbWithData as any);
      expect(maintenance.level).toBe('off'); // fallback to 'off'
    });
  });

  describe('updateSettings', () => {
    it('should upsert payment_info', async () => {
      const insertMock = mock(() => ({
        values: mock(() => ({
          onDuplicateKeyUpdate: mock(() => Promise.resolve()),
        })),
      }));

      const mockDbUpdate = {
        insert: insertMock,
      };

      const newPaymentInfo: PaymentInfo = {
        bankName: 'BRI',
        accountNumber: '1111222233334444',
        accountHolder: 'PT Baru',
        instructions: 'Transfer ke BRI',
        supportContact: '081234567890',
        note: 'Konfirmasi dalam 1x24 jam',
      };

      await updateSettings({ paymentInfo: newPaymentInfo }, mockDbUpdate as any);

      expect(insertMock).toHaveBeenCalled();
    });

    it('should upsert maintenance', async () => {
      const insertMock = mock(() => ({
        values: mock(() => ({
          onDuplicateKeyUpdate: mock(() => Promise.resolve()),
        })),
      }));

      const mockDbUpdate = {
        insert: insertMock,
      };

      const newMaintenance: MaintenanceSetting = {
        level: 'banner',
        message: 'Maintenance pada 1 Juli 2026',
      };

      await updateSettings({ maintenance: newMaintenance }, mockDbUpdate as any);

      expect(insertMock).toHaveBeenCalled();
    });

    it('should upsert both payment_info and maintenance', async () => {
      const insertMock = mock(() => ({
        values: mock(() => ({
          onDuplicateKeyUpdate: mock(() => Promise.resolve()),
        })),
      }));

      const mockDbUpdate = {
        insert: insertMock,
      };

      await updateSettings(
        {
          paymentInfo: { ...DEFAULT_PAYMENT_INFO, bankName: 'Test Bank' },
          maintenance: { level: 'off', message: '' },
        },
        mockDbUpdate as any,
      );

      // Should be called twice (once per key)
      expect(insertMock.mock.calls.length).toBe(2);
    });

    it('should trim whitespace from all fields', async () => {
      let capturedPayload: any = null;

      const mockDbUpdate = {
        insert: () => ({
          values: (payload: any) => {
            capturedPayload = payload;
            return {
              onDuplicateKeyUpdate: () => Promise.resolve(),
            };
          },
        }),
      };

      const paymentWithSpaces: PaymentInfo = {
        bankName: '  BCA  ',
        accountNumber: '  123456  ',
        accountHolder: '  PT Test  ',
        instructions: '  Transfer via BCA  ',
        supportContact: '  08123456789  ',
        note: '  Note with spaces  ',
      };

      await updateSettings({ paymentInfo: paymentWithSpaces }, mockDbUpdate as any);

      const parsedValue = JSON.parse(capturedPayload.valueJson);
      expect(parsedValue.bankName).toBe('BCA');
      expect(parsedValue.accountNumber).toBe('123456');
      expect(parsedValue.note).toBe('Note with spaces');
    });
  });
});
