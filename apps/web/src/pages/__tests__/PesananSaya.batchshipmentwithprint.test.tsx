/**
 * Integration tests for batch shipment with label printing
 * Tests Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PesananSaya } from '../PesananSaya';
import * as apiModule from '../../lib/api';

// Mock the API module
vi.mock('../../lib/api', () => ({
  api: {
    orderList: vi.fn(),
    orderSync: vi.fn(),
    orderShip: vi.fn(),
    orderLabel: vi.fn(),
  },
}));

// Mock the hooks
vi.mock('../../hooks/useApi', () => ({
  useApi: (fn: any) => {
    const [data, setData] = vi.fn()();
    vi.fn()(() => {
      fn().then(setData);
    }, []);
    return { data, loading: false, refetch: vi.fn() };
  },
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => vi.fn(),
}));

describe('PesananSaya - Batch Shipment with Label Printing', () => {
  const mockOrders = [
    {
      id: 1,
      orderSn: 'ORDER001',
      orderStatus: 'READY_TO_SHIP',
      totalAmount: 100000,
      buyerUsername: 'buyer1',
      shippingCarrier: null,
      createTime: '2024-01-01T10:00:00Z',
      items: [{ itemName: 'Product 1', qty: 1, modelName: 'Variant 1' }],
    },
    {
      id: 2,
      orderSn: 'ORDER002',
      orderStatus: 'READY_TO_SHIP',
      totalAmount: 200000,
      buyerUsername: 'buyer2',
      shippingCarrier: null,
      createTime: '2024-01-01T11:00:00Z',
      items: [{ itemName: 'Product 2', qty: 2, modelName: 'Variant 2' }],
    },
    {
      id: 3,
      orderSn: 'ORDER003',
      orderStatus: 'READY_TO_SHIP',
      totalAmount: 150000,
      buyerUsername: 'buyer3',
      shippingCarrier: null,
      createTime: '2024-01-01T12:00:00Z',
      items: [{ itemName: 'Product 3', qty: 1, modelName: 'Variant 3' }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock orderList to return test orders
    vi.mocked(apiModule.api.orderList).mockResolvedValue({
      success: true,
      data: mockOrders,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Requirement 5.1: Print option checkbox in shipment method modal', () => {
    it('should show "Cetak Label Setelah Selesai" checkbox when batch shipment is initiated', async () => {
      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Select multiple orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]); // Select first order
      fireEvent.click(checkboxes[1]); // Select second order

      // Click batch shipment button
      const batchShipButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchShipButton);

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.getByText('Pilih Metode Pengiriman')).toBeInTheDocument();
      });

      // Check that the print checkbox is present
      expect(screen.getByText('Cetak Label Setelah Selesai')).toBeInTheDocument();
      expect(screen.getByText(/Label akan dicetak otomatis/)).toBeInTheDocument();
    });

    it('should NOT show print checkbox for single order shipment', async () => {
      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Click single order shipment button
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      fireEvent.click(shipButtons[0]);

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.getByText('Pilih Metode Pengiriman')).toBeInTheDocument();
      });

      // Check that the print checkbox is NOT present
      expect(screen.queryByText('Cetak Label Setelah Selesai')).not.toBeInTheDocument();
    });

    it('should allow user to check/uncheck the print option', async () => {
      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Select multiple orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click batch shipment button
      const batchShipButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchShipButton);

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByText('Cetak Label Setelah Selesai')).toBeInTheDocument();
      });

      // Find the print checkbox
      const printCheckbox = screen.getByRole('checkbox', { name: /Cetak Label Setelah Selesai/i });
      
      // Initially unchecked
      expect(printCheckbox).not.toBeChecked();

      // Check it
      fireEvent.click(printCheckbox);
      expect(printCheckbox).toBeChecked();

      // Uncheck it
      fireEvent.click(printCheckbox);
      expect(printCheckbox).not.toBeChecked();
    });
  });

  describe('Requirement 5.2: Automatic label printing after batch shipment', () => {
    it('should automatically start label printing when print option is enabled', async () => {
      // Mock successful shipment and label retrieval
      vi.mocked(apiModule.api.orderShip).mockResolvedValue({
        success: true,
        message: 'Shipment arranged successfully',
      } as any);

      vi.mocked(apiModule.api.orderLabel).mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001',
        },
      } as any);

      // Mock window.open
      const mockWindowOpen = vi.fn();
      global.window.open = mockWindowOpen;

      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click batch shipment button
      const batchShipButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchShipButton);

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByText('Cetak Label Setelah Selesai')).toBeInTheDocument();
      });

      // Enable print option
      const printCheckbox = screen.getByRole('checkbox', { name: /Cetak Label Setelah Selesai/i });
      fireEvent.click(printCheckbox);

      // Select pickup method
      const pickupButton = screen.getByText(/Pickup/);
      fireEvent.click(pickupButton);

      // Wait for shipment to complete
      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledTimes(2);
      });

      // Wait for label printing to start
      await waitFor(() => {
        expect(apiModule.api.orderLabel).toHaveBeenCalled();
      }, { timeout: 3000 });

      // Verify label API was called for successful shipments
      expect(apiModule.api.orderLabel).toHaveBeenCalledWith('ORDER001');
      expect(apiModule.api.orderLabel).toHaveBeenCalledWith('ORDER002');
    });

    it('should NOT start label printing when print option is disabled', async () => {
      // Mock successful shipment
      vi.mocked(apiModule.api.orderShip).mockResolvedValue({
        success: true,
        message: 'Shipment arranged successfully',
      } as any);

      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click batch shipment button
      const batchShipButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchShipButton);

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByText('Cetak Label Setelah Selesai')).toBeInTheDocument();
      });

      // Do NOT enable print option (leave unchecked)

      // Select pickup method
      const pickupButton = screen.getByText(/Pickup/);
      fireEvent.click(pickupButton);

      // Wait for shipment to complete
      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledTimes(2);
      });

      // Wait a bit to ensure label printing is NOT triggered
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify label API was NOT called
      expect(apiModule.api.orderLabel).not.toHaveBeenCalled();
    });

    it('should only print labels for successfully shipped orders', async () => {
      // Mock mixed success/failure for shipment
      vi.mocked(apiModule.api.orderShip)
        .mockResolvedValueOnce({
          success: true,
          message: 'Shipment arranged successfully',
        } as any)
        .mockResolvedValueOnce({
          success: false,
          message: 'Shipment failed',
        } as any);

      vi.mocked(apiModule.api.orderLabel).mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001',
        },
      } as any);

      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click batch shipment button
      const batchShipButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchShipButton);

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByText('Cetak Label Setelah Selesai')).toBeInTheDocument();
      });

      // Enable print option
      const printCheckbox = screen.getByRole('checkbox', { name: /Cetak Label Setelah Selesai/i });
      fireEvent.click(printCheckbox);

      // Select pickup method
      const pickupButton = screen.getByText(/Pickup/);
      fireEvent.click(pickupButton);

      // Wait for shipment to complete
      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledTimes(2);
      });

      // Wait for label printing
      await waitFor(() => {
        expect(apiModule.api.orderLabel).toHaveBeenCalled();
      }, { timeout: 3000 });

      // Verify label API was called only once (for the successful shipment)
      expect(apiModule.api.orderLabel).toHaveBeenCalledTimes(1);
      expect(apiModule.api.orderLabel).toHaveBeenCalledWith('ORDER001');
      expect(apiModule.api.orderLabel).not.toHaveBeenCalledWith('ORDER002');
    });
  });

  describe('Requirement 5.3: Combined progress display', () => {
    it('should show progress for shipment phase first, then printing phase', async () => {
      // Mock successful operations
      vi.mocked(apiModule.api.orderShip).mockResolvedValue({
        success: true,
        message: 'Shipment arranged successfully',
      } as any);

      vi.mocked(apiModule.api.orderLabel).mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001',
        },
      } as any);

      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click batch shipment button
      const batchShipButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchShipButton);

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByText('Cetak Label Setelah Selesai')).toBeInTheDocument();
      });

      // Enable print option
      const printCheckbox = screen.getByRole('checkbox', { name: /Cetak Label Setelah Selesai/i });
      fireEvent.click(printCheckbox);

      // Select pickup method
      const pickupButton = screen.getByText(/Pickup/);
      fireEvent.click(pickupButton);

      // Check shipment progress title appears
      await waitFor(() => {
        expect(screen.getByText('Memproses Pengiriman Pesanan...')).toBeInTheDocument();
      });

      // Wait for shipment to complete
      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledTimes(2);
      });

      // Check printing progress title appears
      await waitFor(() => {
        expect(screen.getByText('Mencetak Label Pengiriman...')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Requirement 5.4: Final summary with both operations', () => {
    it('should display summary with label printing results', async () => {
      // Mock successful operations
      vi.mocked(apiModule.api.orderShip).mockResolvedValue({
        success: true,
        message: 'Shipment arranged successfully',
      } as any);

      vi.mocked(apiModule.api.orderLabel).mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001',
        },
      } as any);

      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click batch shipment button
      const batchShipButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchShipButton);

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByText('Cetak Label Setelah Selesai')).toBeInTheDocument();
      });

      // Enable print option
      const printCheckbox = screen.getByRole('checkbox', { name: /Cetak Label Setelah Selesai/i });
      fireEvent.click(printCheckbox);

      // Select pickup method
      const pickupButton = screen.getByText(/Pickup/);
      fireEvent.click(pickupButton);

      // Wait for both operations to complete
      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(apiModule.api.orderLabel).toHaveBeenCalledTimes(2);
      }, { timeout: 3000 });

      // Check that summary shows final results
      await waitFor(() => {
        expect(screen.getByText('Ringkasan Batch')).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 5.5: Display failed orders with error messages', () => {
    it('should show error messages for failed label printing', async () => {
      // Mock successful shipment but failed label retrieval
      vi.mocked(apiModule.api.orderShip).mockResolvedValue({
        success: true,
        message: 'Shipment arranged successfully',
      } as any);

      vi.mocked(apiModule.api.orderLabel)
        .mockResolvedValueOnce({
          success: true,
          data: {
            orderSn: 'ORDER001',
            url: 'https://example.com/label.pdf',
            format: 'pdf',
            trackingNumber: 'TRACK001',
          },
        } as any)
        .mockResolvedValueOnce({
          success: false,
          message: 'Label not available yet',
        } as any);

      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click batch shipment button
      const batchShipButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchShipButton);

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByText('Cetak Label Setelah Selesai')).toBeInTheDocument();
      });

      // Enable print option
      const printCheckbox = screen.getByRole('checkbox', { name: /Cetak Label Setelah Selesai/i });
      fireEvent.click(printCheckbox);

      // Select pickup method
      const pickupButton = screen.getByText(/Pickup/);
      fireEvent.click(pickupButton);

      // Wait for operations to complete
      await waitFor(() => {
        expect(apiModule.api.orderLabel).toHaveBeenCalledTimes(2);
      }, { timeout: 3000 });

      // Check that error message is displayed
      await waitFor(() => {
        expect(screen.getByText(/Label not available yet/)).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 5.6: Progress indicator for both processes', () => {
    it('should show progress bar during shipment and printing', async () => {
      // Mock successful operations with delays
      vi.mocked(apiModule.api.orderShip).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          message: 'Shipment arranged successfully',
        } as any), 100))
      );

      vi.mocked(apiModule.api.orderLabel).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          data: {
            orderSn: 'ORDER001',
            url: 'https://example.com/label.pdf',
            format: 'pdf',
            trackingNumber: 'TRACK001',
          },
        } as any), 100))
      );

      render(<PesananSaya />);

      // Wait for orders to load
      await waitFor(() => {
        expect(screen.getByText('ORDER001')).toBeInTheDocument();
      });

      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);

      // Click batch shipment button
      const batchShipButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchShipButton);

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByText('Cetak Label Setelah Selesai')).toBeInTheDocument();
      });

      // Enable print option
      const printCheckbox = screen.getByRole('checkbox', { name: /Cetak Label Setelah Selesai/i });
      fireEvent.click(printCheckbox);

      // Select pickup method
      const pickupButton = screen.getByText(/Pickup/);
      fireEvent.click(pickupButton);

      // Check that progress indicators appear
      await waitFor(() => {
        expect(screen.getByText('Memproses Pengiriman Pesanan...')).toBeInTheDocument();
      });

      // Wait for shipment phase to complete
      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledTimes(2);
      }, { timeout: 3000 });

      // Check that printing progress appears
      await waitFor(() => {
        expect(screen.getByText('Mencetak Label Pengiriman...')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });
});
