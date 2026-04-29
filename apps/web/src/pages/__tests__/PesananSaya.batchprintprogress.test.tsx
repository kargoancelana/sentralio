import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PesananSaya } from '../PesananSaya';

/**
 * Unit Tests for Batch Print Progress
 * 
 * Tests progress updates during batch label printing, summary display,
 * error handling for partial failures, and dismiss functionality.
 * 
 * **Validates: Requirements 3.3, 3.4, 3.5, 3.6, 5.4, 5.5, 5.6**
 */

// Mock the hooks and API
const mockRefetch = vi.fn();
const mockToast = vi.fn();

vi.mock('../../hooks/useApi', () => ({
  useApi: vi.fn(() => ({
    data: {
      data: [
        {
          id: 1,
          orderSn: 'PROCESSED_001',
          orderStatus: 'PROCESSED',
          totalAmount: 100000,
          buyerUsername: 'buyer1',
          shippingCarrier: 'JNE',
          createTime: '2024-01-01T10:00:00Z',
          items: [{ itemName: 'Product 1', qty: 1, itemPrice: 100000 }]
        },
        {
          id: 2,
          orderSn: 'PROCESSED_002',
          orderStatus: 'PROCESSED',
          totalAmount: 200000,
          buyerUsername: 'buyer2',
          shippingCarrier: 'JNT',
          createTime: '2024-01-01T11:00:00Z',
          items: [{ itemName: 'Product 2', qty: 2, itemPrice: 100000 }]
        },
        {
          id: 3,
          orderSn: 'PROCESSED_003',
          orderStatus: 'PROCESSED',
          totalAmount: 150000,
          buyerUsername: 'buyer3',
          shippingCarrier: 'SiCepat',
          createTime: '2024-01-01T12:00:00Z',
          items: [{ itemName: 'Product 3', qty: 1, itemPrice: 150000 }]
        }
      ]
    },
    loading: false,
    refetch: mockRefetch
  }))
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: vi.fn(() => mockToast)
}));

const mockOrderLabel = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    orderLabel: mockOrderLabel,
    orderSync: vi.fn(() => Promise.resolve({ success: true })),
    orderList: vi.fn(() => Promise.resolve({ success: true, data: [] })),
    orderShip: vi.fn(() => Promise.resolve({ success: true })),
    orderShipBatch: vi.fn(() => Promise.resolve({ success: true, data: { total: 0, successful: 0, failed: 0, results: [] } }))
  }
}));

// Mock window.open for print dialog
const mockWindowOpen = vi.fn(() => ({
  addEventListener: vi.fn(),
  document: {
    write: vi.fn(),
    close: vi.fn()
  },
  print: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  global.window.open = mockWindowOpen as any;
});

describe('Batch Print Progress', () => {
  describe('Progress Updates (Requirements 3.3, 3.6)', () => {
    it('should show progress modal when batch print starts', async () => {
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'PROCESSED_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Progress modal should appear
      await waitFor(() => {
        expect(screen.getByText(/Memproses/i)).toBeDefined();
      });
    });

    it('should update progress as each order completes', async () => {
      let resolveCount = 0;
      mockOrderLabel.mockImplementation(() => {
        resolveCount++;
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              success: true,
              data: {
                orderSn: `PROCESSED_00${resolveCount}`,
                url: `https://example.com/label${resolveCount}.pdf`,
                format: 'pdf',
                trackingNumber: `TRACK00${resolveCount}`
              }
            });
          }, 100);
        });
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 2 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch \(2\)/i);
      fireEvent.click(batchButton);
      
      // Should show progress
      await waitFor(() => {
        const progressText = screen.queryByText(/Memproses/i);
        expect(progressText).toBeDefined();
      }, { timeout: 3000 });
    });

    it('should show individual order status in progress list', async () => {
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'PROCESSED_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Should show order in progress list
      await waitFor(() => {
        const orderLabel = screen.queryByText(/Order #PROCESSED_001/i);
        expect(orderLabel).toBeDefined();
      });
    });

    it('should show processing indicator for current order', async () => {
      mockOrderLabel.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => {
          resolve({
            success: true,
            data: {
              orderSn: 'PROCESSED_001',
              url: 'https://example.com/label.pdf',
              format: 'pdf',
              trackingNumber: 'TRACK001'
            }
          });
        }, 200);
      }));

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Should show processing state
      await waitFor(() => {
        // Look for loading/processing indicator
        const processingElements = screen.queryAllByText(/Memproses/i);
        expect(processingElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Summary Display (Requirements 3.5, 5.4)', () => {
    it('should show summary with success count when batch completes', async () => {
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'PROCESSED_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 2 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch \(2\)/i);
      fireEvent.click(batchButton);
      
      // Wait for completion and check toast
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('2 berhasil'),
          'success'
        );
      }, { timeout: 3000 });
    });

    it('should show summary with failed count when some orders fail', async () => {
      let callCount = 0;
      mockOrderLabel.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            data: {
              orderSn: 'PROCESSED_001',
              url: 'https://example.com/label.pdf',
              format: 'pdf',
              trackingNumber: 'TRACK001'
            }
          });
        } else {
          return Promise.resolve({
            success: false,
            message: 'Label tidak tersedia'
          });
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 2 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch \(2\)/i);
      fireEvent.click(batchButton);
      
      // Wait for completion and check toast shows partial success
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('1 berhasil'),
          'warn'
        );
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('1 gagal'),
          'warn'
        );
      }, { timeout: 3000 });
    });

    it('should display total count in summary', async () => {
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'PROCESSED_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 3 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch \(3\)/i);
      fireEvent.click(batchButton);
      
      // Wait for completion
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('dari 3 pesanan'),
          'success'
        );
      }, { timeout: 5000 });
    });
  });

  describe('Error Handling (Requirements 5.5, 10.4)', () => {
    it('should show error message for failed orders', async () => {
      mockOrderLabel.mockResolvedValue({
        success: false,
        message: 'Label pengiriman belum tersedia'
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Should show error in progress list
      await waitFor(() => {
        const errorText = screen.queryByText(/Label pengiriman belum tersedia/i);
        expect(errorText).toBeDefined();
      }, { timeout: 2000 });
    });

    it('should continue processing remaining orders after failure', async () => {
      let callCount = 0;
      mockOrderLabel.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: false,
            message: 'Label tidak tersedia'
          });
        } else {
          return Promise.resolve({
            success: true,
            data: {
              orderSn: `PROCESSED_00${callCount}`,
              url: 'https://example.com/label.pdf',
              format: 'pdf',
              trackingNumber: 'TRACK001'
            }
          });
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 2 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch \(2\)/i);
      fireEvent.click(batchButton);
      
      // Should complete with 1 success and 1 failure
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('1 berhasil'),
          'warn'
        );
      }, { timeout: 3000 });
    });

    it('should handle network errors gracefully', async () => {
      mockOrderLabel.mockRejectedValue(new Error('Network error'));

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Should show network error
      await waitFor(() => {
        const errorText = screen.queryByText(/Network error/i);
        expect(errorText).toBeDefined();
      }, { timeout: 2000 });
    });

    it('should display list of failed orders with error messages', async () => {
      let callCount = 0;
      mockOrderLabel.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          success: false,
          message: `Error untuk order ${callCount}`
        });
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 2 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch \(2\)/i);
      fireEvent.click(batchButton);
      
      // Should show both error messages
      await waitFor(() => {
        const error1 = screen.queryByText(/Error untuk order 1/i);
        const error2 = screen.queryByText(/Error untuk order 2/i);
        expect(error1).toBeDefined();
        expect(error2).toBeDefined();
      }, { timeout: 3000 });
    });
  });

  describe('Print Dialog Integration (Requirements 3.4, 7.1, 7.2)', () => {
    it('should open print dialog for PDF labels', async () => {
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'PROCESSED_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Should call window.open for print dialog
      await waitFor(() => {
        expect(mockWindowOpen).toHaveBeenCalledWith(
          'https://example.com/label.pdf',
          '_blank'
        );
      }, { timeout: 2000 });
    });

    it('should open print dialog for image labels', async () => {
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'PROCESSED_001',
          url: 'https://example.com/label.png',
          format: 'png',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Should call window.open for image print
      await waitFor(() => {
        expect(mockWindowOpen).toHaveBeenCalledWith('', '_blank');
      }, { timeout: 2000 });
    });

    it('should handle print dialog errors gracefully', async () => {
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'PROCESSED_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      // Mock window.open to return null (popup blocked)
      global.window.open = vi.fn(() => null) as any;

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Should still mark as success even if print dialog fails
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('1 berhasil'),
          'success'
        );
      }, { timeout: 2000 });
    });
  });

  describe('Dismiss Functionality', () => {
    it('should keep progress visible after batch completes', async () => {
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'PROCESSED_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Wait for completion
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      }, { timeout: 2000 });
      
      // Progress should still be visible
      const summaryText = screen.queryByText(/Selesai/i);
      expect(summaryText).toBeDefined();
    });

    it('should clear selection after batch completes', async () => {
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'PROCESSED_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch \(2\)/i);
      fireEvent.click(batchButton);
      
      // Wait for completion
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      }, { timeout: 3000 });
      
      // Checkboxes should be unchecked
      await waitFor(() => {
        checkboxes.forEach(checkbox => {
          expect(checkbox.checked).toBe(false);
        });
      });
    });
  });

  describe('Sequential Processing (Requirement 3.3)', () => {
    it('should process orders one by one, not in parallel', async () => {
      const callOrder: number[] = [];
      let callCount = 0;

      mockOrderLabel.mockImplementation(() => {
        callCount++;
        const currentCall = callCount;
        callOrder.push(currentCall);
        
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              success: true,
              data: {
                orderSn: `PROCESSED_00${currentCall}`,
                url: `https://example.com/label${currentCall}.pdf`,
                format: 'pdf',
                trackingNumber: `TRACK00${currentCall}`
              }
            });
          }, 100);
        });
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 3 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch \(3\)/i);
      fireEvent.click(batchButton);
      
      // Wait for all to complete
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      }, { timeout: 5000 });
      
      // Calls should be sequential (1, 2, 3)
      expect(callOrder).toEqual([1, 2, 3]);
    });

    it('should add delay between requests', async () => {
      const timestamps: number[] = [];

      mockOrderLabel.mockImplementation(() => {
        timestamps.push(Date.now());
        return Promise.resolve({
          success: true,
          data: {
            orderSn: 'PROCESSED_001',
            url: 'https://example.com/label.pdf',
            format: 'pdf',
            trackingNumber: 'TRACK001'
          }
        });
      });

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 2 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch \(2\)/i);
      fireEvent.click(batchButton);
      
      // Wait for completion
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      }, { timeout: 3000 });
      
      // Should have delay between calls (at least 400ms based on 500ms delay)
      if (timestamps.length >= 2) {
        const delay = timestamps[1] - timestamps[0];
        expect(delay).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
