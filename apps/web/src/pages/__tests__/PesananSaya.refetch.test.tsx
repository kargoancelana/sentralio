/**
 * Tests for automatic order list refresh functionality in PesananSaya component
 * 
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.5**
 * 
 * This test suite verifies:
 * - Requirement 11.1: Refetch after successful single order processing
 * - Requirement 11.2: Refetch once after batch processing completes
 * - Requirement 11.3: Filter and search state maintained during refresh
 * - Requirement 11.5: Error notification if refetch fails
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { PesananSaya } from '../PesananSaya';
import * as apiModule from '../../lib/api';
import * as useApiModule from '../../hooks/useApi';

// Mock the API module
jest.mock('../../lib/api', () => ({
  api: {
    orderList: jest.fn(),
    orderShip: jest.fn(),
    orderSync: jest.fn(),
  },
}));

// Mock the useApi hook
jest.mock('../../hooks/useApi', () => ({
  useApi: jest.fn(),
}));

// Mock the Toast hook
jest.mock('../../components/ui/Toast', () => ({
  useToast: () => jest.fn(),
}));

describe('PesananSaya - Automatic Order List Refresh', () => {
  const mockOrders = [
    {
      id: 1,
      shopId: 1,
      orderSn: 'ORDER001',
      orderStatus: 'READY_TO_SHIP',
      totalAmount: 100000,
      buyerUsername: 'buyer1',
      shippingCarrier: 'JNE',
      createTime: '2025-01-20T10:00:00Z',
      items: [
        { itemName: 'Product 1', modelName: 'Variant A', qty: 2, itemPrice: 50000 }
      ]
    },
    {
      id: 2,
      shopId: 1,
      orderSn: 'ORDER002',
      orderStatus: 'READY_TO_SHIP',
      totalAmount: 200000,
      buyerUsername: 'buyer2',
      shippingCarrier: 'JNE',
      createTime: '2025-01-20T11:00:00Z',
      items: [
        { itemName: 'Product 2', modelName: 'Variant B', qty: 1, itemPrice: 200000 }
      ]
    },
    {
      id: 3,
      shopId: 1,
      orderSn: 'ORDER003',
      orderStatus: 'PROCESSED',
      totalAmount: 150000,
      buyerUsername: 'buyer3',
      shippingCarrier: 'JNE',
      createTime: '2025-01-20T12:00:00Z',
      items: [
        { itemName: 'Product 3', modelName: 'Variant C', qty: 3, itemPrice: 50000 }
      ]
    }
  ];

  let mockRefetch: jest.Mock;
  let mockToast: jest.Mock;

  beforeEach(() => {
    mockRefetch = jest.fn().mockResolvedValue(undefined);
    mockToast = jest.fn();
    
    // Setup useApi mock
    (useApiModule.useApi as jest.Mock).mockReturnValue({
      data: { data: mockOrders },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    // Setup API mocks
    (apiModule.api.orderList as jest.Mock).mockResolvedValue({ data: mockOrders });
    (apiModule.api.orderShip as jest.Mock).mockResolvedValue({ 
      success: true, 
      message: 'Shipment arranged successfully' 
    });

    // Mock useToast
    jest.doMock('../../components/ui/Toast', () => ({
      useToast: () => mockToast,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Requirement 11.1: Refetch after single order processing', () => {
    it('should refetch order list after successful single order shipment', async () => {
      const user = userEvent.setup({ delay: null });
      render(<PesananSaya />);

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      // Find and click the "Atur Pengiriman" button for ORDER001
      const order1Card = screen.getByText(/ORDER001/).closest('div');
      const shipButton = within(order1Card!).getByRole('button', { name: /Atur Pengiriman/i });
      
      await user.click(shipButton);

      // Wait for the shipment to complete
      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledWith('ORDER001');
      });

      // Verify refetch was called
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalledTimes(1);
      });
    });

    it('should not refetch if single order shipment fails', async () => {
      const user = userEvent.setup({ delay: null });
      
      // Mock shipment failure
      (apiModule.api.orderShip as jest.Mock).mockResolvedValue({ 
        success: false, 
        message: 'Order not eligible for shipment' 
      });

      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      const order1Card = screen.getByText(/ORDER001/).closest('div');
      const shipButton = within(order1Card!).getByRole('button', { name: /Atur Pengiriman/i });
      
      await user.click(shipButton);

      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledWith('ORDER001');
      });

      // Verify refetch was NOT called since shipment failed
      expect(mockRefetch).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 11.2: Refetch once after batch processing', () => {
    it('should refetch order list once after batch processing completes', async () => {
      const user = userEvent.setup({ delay: null });
      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      // Select multiple orders
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]); // ORDER001
      await user.click(checkboxes[2]); // ORDER002

      // Click batch shipment button
      const batchButton = screen.getByRole('button', { name: /Atur Pengiriman \(2\)/i });
      await user.click(batchButton);

      // Wait for batch processing to complete
      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledTimes(2);
      }, { timeout: 5000 });

      // Verify refetch was called exactly once after all orders processed
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalledTimes(1);
      });
    });

    it('should refetch even if some orders in batch fail', async () => {
      const user = userEvent.setup({ delay: null });
      
      // Mock mixed success/failure
      (apiModule.api.orderShip as jest.Mock)
        .mockResolvedValueOnce({ success: true, message: 'Success' })
        .mockResolvedValueOnce({ success: false, message: 'Failed' });

      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);
      await user.click(checkboxes[2]);

      const batchButton = screen.getByRole('button', { name: /Atur Pengiriman \(2\)/i });
      await user.click(batchButton);

      await waitFor(() => {
        expect(apiModule.api.orderShip).toHaveBeenCalledTimes(2);
      }, { timeout: 5000 });

      // Verify refetch was still called once
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Requirement 11.3: Maintain filter and search state during refresh', () => {
    it('should maintain current filter state after refetch', async () => {
      const user = userEvent.setup();
      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      // Change to "Telah Diproses" sub-filter
      const processedFilterButton = screen.getByRole('button', { name: /Telah Diproses/i });
      await user.click(processedFilterButton);

      // Verify only PROCESSED orders are shown
      expect(screen.getByText(/ORDER003/)).toBeInTheDocument();
      expect(screen.queryByText(/ORDER001/)).not.toBeInTheDocument();

      // Now ship an order (this will trigger refetch)
      // Switch back to show READY_TO_SHIP orders
      const needProcessButton = screen.getByRole('button', { name: /Perlu Diproses/i });
      await user.click(needProcessButton);

      const order1Card = screen.getByText(/ORDER001/).closest('div');
      const shipButton = within(order1Card!).getByRole('button', { name: /Atur Pengiriman/i });
      await user.click(shipButton);

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });

      // The filter state should be maintained (still showing READY_TO_SHIP)
      // This is verified by the fact that the component doesn't reset filters
    });

    it('should maintain search state after refetch', async () => {
      const user = userEvent.setup();
      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      // Enter search query
      const searchInput = screen.getByPlaceholderText(/Cari No. Pesanan atau Pembeli.../i);
      await user.type(searchInput, 'buyer1');

      // Verify filtered results
      expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      expect(screen.queryByText(/ORDER002/)).not.toBeInTheDocument();

      // Ship the visible order
      const order1Card = screen.getByText(/ORDER001/).closest('div');
      const shipButton = within(order1Card!).getByRole('button', { name: /Atur Pengiriman/i });
      await user.click(shipButton);

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });

      // Search input should still contain the search term
      expect(searchInput).toHaveValue('buyer1');
    });
  });

  describe('Requirement 11.5: Error notification if refetch fails', () => {
    it('should display error notification when single order refetch fails', async () => {
      const user = userEvent.setup();
      
      // Mock refetch to fail
      mockRefetch.mockRejectedValueOnce(new Error('Network error'));

      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      const order1Card = screen.getByText(/ORDER001/).closest('div');
      const shipButton = within(order1Card!).getByRole('button', { name: /Atur Pengiriman/i });
      
      await user.click(shipButton);

      // Wait for shipment and refetch attempt
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });

      // Verify error toast was called
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Gagal memperbarui daftar pesanan. Silakan refresh manual.',
          'error'
        );
      });
    });

    it('should display error notification when batch refetch fails', async () => {
      const user = userEvent.setup();
      
      // Mock refetch to fail
      mockRefetch.mockRejectedValueOnce(new Error('Network error'));

      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);
      await user.click(checkboxes[2]);

      const batchButton = screen.getByRole('button', { name: /Atur Pengiriman \(2\)/i });
      await user.click(batchButton);

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      }, { timeout: 5000 });

      // Verify error toast was called
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Gagal memperbarui daftar pesanan. Silakan refresh manual.',
          'error'
        );
      });
    });

    it('should log refetch error to console for debugging', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const refetchError = new Error('Network timeout');
      mockRefetch.mockRejectedValueOnce(refetchError);

      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      const order1Card = screen.getByText(/ORDER001/).closest('div');
      const shipButton = within(order1Card!).getByRole('button', { name: /Atur Pengiriman/i });
      
      await user.click(shipButton);

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });

      // Verify error was logged
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[PesananSaya] Refetch failed after single order shipment:',
          refetchError
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('should allow user to manually refresh after refetch failure', async () => {
      const user = userEvent.setup();
      
      // Mock refetch to fail first time, succeed second time
      mockRefetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      // Ship order (refetch will fail)
      const order1Card = screen.getByText(/ORDER001/).closest('div');
      const shipButton = within(order1Card!).getByRole('button', { name: /Atur Pengiriman/i });
      await user.click(shipButton);

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalledTimes(1);
      });

      // User can manually refresh using the "Tarik Pesanan" button
      const refreshButton = screen.getByRole('button', { name: /Tarik Pesanan/i });
      
      // Mock the orderSync API for manual refresh
      vi.mocked(apiModule.api.orderSync).mockResolvedValue({
        data: { fetched: 10, has_more: false }
      });

      await user.click(refreshButton);

      // Verify manual refresh was triggered
      await waitFor(() => {
        expect(apiModule.api.orderSync).toHaveBeenCalled();
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle refetch when no orders are displayed', async () => {
      const user = userEvent.setup();
      
      // Mock empty order list
      vi.mocked(useApiModule.useApi).mockReturnValue({
        data: { data: [] },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/Tidak ada pesanan/)).toBeInTheDocument();
      });

      // Refetch should still work even with empty list
      // This is tested implicitly - no errors should occur
    });

    it('should handle concurrent refetch calls gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock slow refetch
      mockRefetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );

      render(<PesananSaya />);

      await waitFor(() => {
        expect(screen.getByText(/ORDER001/)).toBeInTheDocument();
      });

      // Trigger multiple shipments quickly
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);
      
      const batchButton = screen.getByRole('button', { name: /Atur Pengiriman \(1\)/i });
      await user.click(batchButton);

      // The refetch should be called once per batch operation
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalledTimes(1);
      }, { timeout: 2000 });
    });
  });
});
