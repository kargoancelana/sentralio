import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PesananSaya } from '../PesananSaya';

// Mock the hooks and API
const mockRefetch = vi.fn();
const mockToast = vi.fn();

vi.mock('../hooks/useApi', () => ({
  useApi: vi.fn(() => ({
    data: {
      data: [
        {
          id: 1,
          orderSn: 'ORDER001',
          orderStatus: 'READY_TO_SHIP',
          totalAmount: 100000,
          buyerUsername: 'buyer1',
          createTime: '2024-01-01T10:00:00Z',
          items: [{ itemName: 'Product 1', qty: 1, itemPrice: 100000 }]
        },
        {
          id: 2,
          orderSn: 'ORDER002',
          orderStatus: 'READY_TO_SHIP',
          totalAmount: 200000,
          buyerUsername: 'buyer2',
          createTime: '2024-01-01T11:00:00Z',
          items: [{ itemName: 'Product 2', qty: 2, itemPrice: 100000 }]
        },
        {
          id: 3,
          orderSn: 'ORDER003',
          orderStatus: 'PROCESSED',
          totalAmount: 150000,
          buyerUsername: 'buyer3',
          createTime: '2024-01-01T12:00:00Z',
          items: [{ itemName: 'Product 3', qty: 1, itemPrice: 150000 }]
        },
        {
          id: 4,
          orderSn: 'ORDER004',
          orderStatus: 'SHIPPED',
          totalAmount: 300000,
          buyerUsername: 'buyer4',
          createTime: '2024-01-01T13:00:00Z',
          items: [{ itemName: 'Product 4', qty: 1, itemPrice: 300000 }]
        }
      ]
    },
    loading: false,
    refetch: mockRefetch
  }))
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: vi.fn(() => mockToast)
}));

const mockOrderShip = vi.fn();
const mockOrderShipBatch = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    orderShip: mockOrderShip,
    orderShipBatch: mockOrderShipBatch,
    orderSync: vi.fn(() => Promise.resolve({ success: true })),
    orderList: vi.fn(() => Promise.resolve({ success: true, data: [] }))
  }
}));

describe('PesananSaya - Shipment UI Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderShip.mockResolvedValue({ success: true });
    mockOrderShipBatch.mockResolvedValue({ 
      success: true, 
      data: { total: 2, successful: 2, failed: 0, results: [] }
    });
  });

  describe('Button Visibility (Requirements 1.1, 1.2)', () => {
    it('should display "Atur Pengiriman" button only for READY_TO_SHIP orders', () => {
      render(<PesananSaya />);
      
      // Should have "Atur Pengiriman" buttons for READY_TO_SHIP orders
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      // 2 individual buttons + 1 potential batch button = at least 2
      expect(shipButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('should not display "Atur Pengiriman" button for non-READY_TO_SHIP orders', () => {
      render(<PesananSaya />);
      
      // Check that PROCESSED and SHIPPED orders don't have ship buttons
      // This is implicit in the component logic - only READY_TO_SHIP orders get buttons
      const allButtons = screen.getAllByRole('button');
      const shipButtons = allButtons.filter(button => 
        button.textContent?.includes('Atur Pengiriman') && 
        !button.textContent?.includes('(') // Exclude batch button
      );
      
      // Should have exactly 2 ship buttons (for 2 READY_TO_SHIP orders)
      expect(shipButtons).toHaveLength(2);
    });

    it('should show loading state on button during processing', async () => {
      // Mock a delayed response
      mockOrderShip.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );

      render(<PesananSaya />);
      
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      const firstShipButton = shipButtons[0];
      
      // Click the button
      fireEvent.click(firstShipButton);
      
      // Should show loading state immediately
      await waitFor(() => {
        expect(firstShipButton).toBeDisabled();
      });
    });

    it('should disable buttons during batch processing', async () => {
      render(<PesananSaya />);
      
      // Select orders first
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // Select first order
      
      // Wait for batch button to appear
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
      
      // Mock delayed batch processing
      mockOrderShipBatch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ 
          success: true, 
          data: { total: 1, successful: 1, failed: 0, results: [] }
        }), 100))
      );
      
      // Click batch button
      const batchButton = screen.getByText(/Atur Pengiriman \(1\)/);
      fireEvent.click(batchButton);
      
      // All ship buttons should be disabled during batch processing
      await waitFor(() => {
        const allShipButtons = screen.getAllByText('Atur Pengiriman');
        allShipButtons.forEach(button => {
          if (!button.textContent?.includes('(')) { // Individual buttons
            expect(button).toBeDisabled();
          }
        });
      });
    });
  });

  describe('Batch Selection Functionality (Requirements 5.1, 5.2)', () => {
    it('should display checkboxes for READY_TO_SHIP orders only', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      // Should have: 1 select-all + 2 individual checkboxes for READY_TO_SHIP orders
      expect(checkboxes).toHaveLength(3);
    });

    it('should show batch action button when orders are selected', async () => {
      render(<PesananSaya />);
      
      // Initially no batch action should be visible
      expect(screen.queryByText(/Atur Pengiriman \(/)).not.toBeInTheDocument();
      
      // Select first order
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // Skip select-all checkbox
      
      // Batch action should appear
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
    });

    it('should update batch button count when multiple orders are selected', async () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      
      // Select first order
      fireEvent.click(checkboxes[1]);
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
      
      // Select second order
      fireEvent.click(checkboxes[2]);
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(2\)/)).toBeInTheDocument();
      });
    });

    it('should select all READY_TO_SHIP orders when select-all is clicked', async () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      const selectAllCheckbox = checkboxes[0];
      
      // Click select all
      fireEvent.click(selectAllCheckbox);
      
      // Should show batch action for 2 orders (both READY_TO_SHIP)
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(2\)/)).toBeInTheDocument();
      });
    });

    it('should deselect all when select-all is clicked again', async () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      const selectAllCheckbox = checkboxes[0];
      
      // Select all first
      fireEvent.click(selectAllCheckbox);
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(2\)/)).toBeInTheDocument();
      });
      
      // Deselect all
      fireEvent.click(selectAllCheckbox);
      await waitFor(() => {
        expect(screen.queryByText(/Atur Pengiriman \(/)).not.toBeInTheDocument();
      });
    });

    it('should clear selection when cancel button is clicked', async () => {
      render(<PesananSaya />);
      
      // Select an order first
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      
      // Wait for batch action to appear
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
      
      // Click cancel button
      const cancelButton = screen.getByText('Batal');
      fireEvent.click(cancelButton);
      
      // Batch action should disappear
      await waitFor(() => {
        expect(screen.queryByText(/Atur Pengiriman \(/)).not.toBeInTheDocument();
      });
    });

    it('should maintain selection state when toggling individual orders', async () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      
      // Select first order
      fireEvent.click(checkboxes[1]);
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
      
      // Select second order
      fireEvent.click(checkboxes[2]);
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(2\)/)).toBeInTheDocument();
      });
      
      // Deselect first order
      fireEvent.click(checkboxes[1]);
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
    });
  });

  describe('Progress Indicator Updates', () => {
    it('should show progress bar during batch processing', async () => {
      render(<PesananSaya />);
      
      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(2\)/)).toBeInTheDocument();
      });
      
      // Mock delayed batch processing to see progress
      mockOrderShipBatch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ 
          success: true, 
          data: { total: 2, successful: 2, failed: 0, results: [] }
        }), 200))
      );
      
      // Start batch processing
      const batchButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchButton);
      
      // Should show progress indicator
      await waitFor(() => {
        expect(screen.getByText('0 / 2')).toBeInTheDocument();
      });
    });

    it('should clear selection after successful batch processing', async () => {
      render(<PesananSaya />);
      
      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
      
      // Process batch
      const batchButton = screen.getByText(/Atur Pengiriman \(1\)/);
      fireEvent.click(batchButton);
      
      // Wait for completion
      await waitFor(() => {
        expect(mockOrderShipBatch).toHaveBeenCalledWith(['ORDER001']);
      });
      
      // Selection should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/Atur Pengiriman \(/)).not.toBeInTheDocument();
      });
    });
  });

  describe('API Integration', () => {
    it('should call orderShip API when individual button is clicked', async () => {
      render(<PesananSaya />);
      
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      const firstShipButton = shipButtons[0];
      
      fireEvent.click(firstShipButton);
      
      await waitFor(() => {
        expect(mockOrderShip).toHaveBeenCalledWith('ORDER001');
      });
    });

    it('should call orderShipBatch API when batch button is clicked', async () => {
      render(<PesananSaya />);
      
      // Select orders
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(2\)/)).toBeInTheDocument();
      });
      
      // Click batch button
      const batchButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchButton);
      
      await waitFor(() => {
        expect(mockOrderShipBatch).toHaveBeenCalledWith(['ORDER001', 'ORDER002']);
      });
    });

    it('should show success toast on successful shipment', async () => {
      render(<PesananSaya />);
      
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      const firstShipButton = shipButtons[0];
      
      fireEvent.click(firstShipButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Pengiriman berhasil diatur untuk pesanan #ORDER001',
          'success'
        );
      });
    });

    it('should show error toast on failed shipment', async () => {
      mockOrderShip.mockResolvedValueOnce({ 
        success: false, 
        message: 'Order tidak dapat diproses' 
      });
      
      render(<PesananSaya />);
      
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      const firstShipButton = shipButtons[0];
      
      fireEvent.click(firstShipButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Order tidak dapat diproses',
          'error'
        );
      });
    });

    it('should refetch orders after successful shipment', async () => {
      render(<PesananSaya />);
      
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      const firstShipButton = shipButtons[0];
      
      fireEvent.click(firstShipButton);
      
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockOrderShip.mockRejectedValueOnce(new Error('Network error'));
      
      render(<PesananSaya />);
      
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      const firstShipButton = shipButtons[0];
      
      fireEvent.click(firstShipButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Network error',
          'error'
        );
      });
    });

    it('should handle batch processing errors', async () => {
      mockOrderShipBatch.mockRejectedValueOnce(new Error('Batch failed'));
      
      render(<PesananSaya />);
      
      // Select and process batch
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
      
      const batchButton = screen.getByText(/Atur Pengiriman \(1\)/);
      fireEvent.click(batchButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Batch failed',
          'error'
        );
      });
    });

    it('should show warning toast for partial batch success', async () => {
      mockOrderShipBatch.mockResolvedValueOnce({ 
        success: true, 
        data: { total: 2, successful: 1, failed: 1, results: [] }
      });
      
      render(<PesananSaya />);
      
      // Select and process batch
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(2\)/)).toBeInTheDocument();
      });
      
      const batchButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Batch selesai: 1 berhasil, 1 gagal dari 2 pesanan',
          'warning'
        );
      });
    });
  });

  describe('UI State Management', () => {
    it('should disable checkboxes during batch processing', async () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
      
      // Mock delayed processing
      mockOrderShipBatch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ 
          success: true, 
          data: { total: 1, successful: 1, failed: 0, results: [] }
        }), 100))
      );
      
      const batchButton = screen.getByText(/Atur Pengiriman \(1\)/);
      fireEvent.click(batchButton);
      
      // Checkboxes should be disabled during processing
      await waitFor(() => {
        checkboxes.forEach(checkbox => {
          expect(checkbox).toBeDisabled();
        });
      });
    });

    it('should maintain filter state during shipment operations', async () => {
      render(<PesananSaya />);
      
      // Verify we're on the "Perlu Dikirim" filter by default
      expect(screen.getByText('Perlu Dikirim')).toHaveClass('active');
      
      // Process a shipment
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      fireEvent.click(shipButtons[0]);
      
      await waitFor(() => {
        expect(mockOrderShip).toHaveBeenCalled();
      });
      
      // Filter should still be active
      expect(screen.getByText('Perlu Dikirim')).toHaveClass('active');
    });
  });
});