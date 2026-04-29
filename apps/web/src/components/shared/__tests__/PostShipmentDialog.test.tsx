import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PostShipmentDialog } from '../PostShipmentDialog';
import { api } from '../../../lib/api';

/**
 * Unit Tests for PostShipmentDialog Component
 * 
 * Tests dialog rendering, status polling, print functionality, and skip behavior.
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 */

// Mock the API
vi.mock('../../../lib/api', () => ({
  api: {
    orderLabel: vi.fn(),
    orderList: vi.fn()
  }
}));

// Mock the Toast hook
const mockToast = vi.fn();
vi.mock('../../ui/Toast', () => ({
  useToast: () => mockToast
}));

// Mock window.open
const mockWindowOpen = vi.fn();
global.window.open = mockWindowOpen;

describe('PostShipmentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowOpen.mockReturnValue({
      addEventListener: vi.fn(),
      document: {
        write: vi.fn(),
        close: vi.fn()
      },
      print: vi.fn()
    });
  });

  describe('Dialog Rendering (Requirement 4.1)', () => {
    it('should render dialog when isOpen is true', () => {
      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      expect(screen.getByText('Pengiriman Berhasil Diatur')).toBeDefined();
      expect(screen.getByText(/ORDER_001/)).toBeDefined();
    });

    it('should not render dialog when isOpen is false', () => {
      const { container } = render(
        <PostShipmentDialog
          isOpen={false}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      expect(container.firstChild).toBeNull();
    });

    it('should show "Cetak Label Sekarang" button', () => {
      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      expect(screen.getByText('Cetak Label Sekarang')).toBeDefined();
    });

    it('should show "Lewati" button (Requirement 4.5)', () => {
      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      expect(screen.getByText('Lewati')).toBeDefined();
    });

    it('should show close button', () => {
      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const closeButton = screen.getByTitle('Tutup');
      expect(closeButton).toBeDefined();
    });

    it('should display order number in message', () => {
      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_123"
          onClose={vi.fn()}
        />
      );
      
      expect(screen.getByText(/#ORDER_123/)).toBeDefined();
    });
  });

  describe('Skip Functionality (Requirement 4.5)', () => {
    it('should call onClose when Lewati button is clicked', () => {
      const onClose = vi.fn();
      
      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={onClose}
        />
      );
      
      const skipButton = screen.getByText('Lewati');
      fireEvent.click(skipButton);
      
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when close (X) button is clicked', () => {
      const onClose = vi.fn();
      
      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={onClose}
        />
      );
      
      const closeButton = screen.getByTitle('Tutup');
      fireEvent.click(closeButton);
      
      expect(onClose).toHaveBeenCalled();
    });

    it('should show success toast when skipping', () => {
      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const skipButton = screen.getByText('Lewati');
      fireEvent.click(skipButton);
      
      expect(mockToast).toHaveBeenCalledWith(
        'Pengiriman berhasil diatur untuk pesanan #ORDER_001',
        'success'
      );
    });
  });

  describe('Status Polling (Requirement 4.2, 4.4)', () => {
    it('should show loading indicator while waiting for status change', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({
          success: true,
          data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
        }), 100);
      }));

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      // Should show loading indicator
      await waitFor(() => {
        expect(screen.getByText('Menunggu status pesanan berubah...')).toBeDefined();
      });
    });

    it('should poll order status until PROCESSED', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      let callCount = 0;
      mockOrderList.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          success: true,
          data: [{
            orderSn: 'ORDER_001',
            orderStatus: callCount < 3 ? 'READY_TO_SHIP' : 'PROCESSED'
          }]
        });
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      // Wait for polling to complete
      await waitFor(() => {
        expect(mockOrderList).toHaveBeenCalled();
      }, { timeout: 5000 });
      
      // Should have polled multiple times
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('should timeout if status does not change within max attempts', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'READY_TO_SHIP' }]
      });

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      // Should show timeout error
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('Timeout'),
          'error'
        );
      }, { timeout: 15000 });
    });
  });

  describe('Print Label Functionality (Requirement 4.3)', () => {
    it('should call api.orderLabel after status becomes PROCESSED', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(mockOrderLabel).toHaveBeenCalledWith('ORDER_001');
      });
    });

    it('should open print dialog with PDF label', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(mockWindowOpen).toHaveBeenCalledWith(
          'https://example.com/label.pdf',
          '_blank'
        );
      });
    });

    it('should open print dialog with PNG label', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_002', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_002',
          url: 'data:image/png;base64,iVBORw0KGgo...',
          format: 'png',
          trackingNumber: 'TRACK002'
        }
      });

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_002"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(mockWindowOpen).toHaveBeenCalledWith('', '_blank');
      });
    });

    it('should show success toast after printing', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Label berhasil dicetak untuk pesanan #ORDER_001',
          'success'
        );
      });
    });

    it('should call onClose after successful print', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      const onClose = vi.fn();

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={onClose}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should call onPrintComplete callback after successful print', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      const onPrintComplete = vi.fn();

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
          onPrintComplete={onPrintComplete}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(onPrintComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast on 404 (order not found)', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_999', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      const error: any = new Error('Order not found');
      error.status = 404;
      mockOrderLabel.mockRejectedValue(error);

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_999"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Pesanan #ORDER_999 tidak ditemukan',
          'error'
        );
      });
    });

    it('should show error toast on 422 (label not available)', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      const error: any = new Error('Label not available');
      error.status = 422;
      mockOrderLabel.mockRejectedValue(error);

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Label pengiriman belum tersedia untuk pesanan ini',
          'error'
        );
      });
    });

    it('should show error toast on network failure', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockRejectedValue(new Error('Network error'));

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Network error',
          'error'
        );
      });
    });

    it('should not call onClose on error', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockRejectedValue(new Error('Test error'));

      const onClose = vi.fn();

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={onClose}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });
      
      // Should not close dialog on error
      expect(onClose).not.toHaveBeenCalled();
    });

    it('should handle polling errors gracefully', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      let callCount = 0;
      mockOrderList.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          success: true,
          data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
        });
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang');
      fireEvent.click(printButton);
      
      // Should continue polling after error
      await waitFor(() => {
        expect(mockOrderLabel).toHaveBeenCalled();
      }, { timeout: 5000 });
    });
  });

  describe('Button States', () => {
    it('should disable buttons while printing', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({
          success: true,
          data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
        }), 100);
      }));

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang') as HTMLButtonElement;
      const skipButton = screen.getByText('Lewati') as HTMLButtonElement;
      
      fireEvent.click(printButton);
      
      // Buttons should be disabled during processing
      await waitFor(() => {
        expect(printButton.disabled).toBe(true);
        expect(skipButton.disabled).toBe(true);
      });
    });

    it('should re-enable buttons after error', async () => {
      const mockOrderList = vi.mocked(api.orderList);
      mockOrderList.mockResolvedValue({
        success: true,
        data: [{ orderSn: 'ORDER_001', orderStatus: 'PROCESSED' }]
      });

      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockRejectedValue(new Error('Test error'));

      render(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      const printButton = screen.getByText('Cetak Label Sekarang') as HTMLButtonElement;
      
      fireEvent.click(printButton);
      
      // Wait for error
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });
      
      // Button should be re-enabled
      expect(printButton.disabled).toBe(false);
    });
  });

  describe('State Reset', () => {
    it('should reset state when dialog reopens', () => {
      const { rerender } = render(
        <PostShipmentDialog
          isOpen={false}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      // Open dialog
      rerender(
        <PostShipmentDialog
          isOpen={true}
          orderSn="ORDER_001"
          onClose={vi.fn()}
        />
      );
      
      // Should show initial state (no loading indicator)
      expect(screen.queryByText('Menunggu status pesanan berubah...')).toBeNull();
    });
  });
});
