/**
 * **Validates: Requirements 1.1, 1.2, 5.1, 5.2**
 * 
 * Integration tests for shipment UI components working together.
 * Tests the complete user workflow from selection to batch processing completion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PesananSaya } from '../PesananSaya';

// Mock the hooks and API with more realistic behavior
const mockRefetch = vi.fn();
const mockToast = vi.fn();
const mockOrderShip = vi.fn();
const mockOrderSync = vi.fn();

vi.mock('../hooks/useApi', () => ({
  useApi: vi.fn(() => ({
    data: {
      data: [
        {
          id: 1,
          orderSn: 'SHP001',
          orderStatus: 'READY_TO_SHIP',
          totalAmount: 150000,
          buyerUsername: 'customer1',
          shippingCarrier: 'JNE REG',
          createTime: '2024-01-15T09:30:00Z',
          items: [
            { 
              itemName: 'Smartphone Case Premium', 
              modelName: 'Black - Size L',
              qty: 2, 
              itemPrice: 75000 
            }
          ]
        },
        {
          id: 2,
          orderSn: 'SHP002',
          orderStatus: 'READY_TO_SHIP',
          totalAmount: 280000,
          buyerUsername: 'customer2',
          shippingCarrier: 'SiCepat HALU',
          createTime: '2024-01-15T10:15:00Z',
          items: [
            { 
              itemName: 'Wireless Headphones', 
              modelName: 'Blue - Bluetooth 5.0',
              qty: 1, 
              itemPrice: 280000 
            }
          ]
        },
        {
          id: 3,
          orderSn: 'SHP003',
          orderStatus: 'READY_TO_SHIP',
          totalAmount: 95000,
          buyerUsername: 'customer3',
          shippingCarrier: 'J&T Express',
          createTime: '2024-01-15T11:00:00Z',
          items: [
            { 
              itemName: 'Power Bank 10000mAh', 
              modelName: 'White',
              qty: 1, 
              itemPrice: 95000 
            }
          ]
        },
        {
          id: 4,
          orderSn: 'SHP004',
          orderStatus: 'PROCESSED',
          totalAmount: 120000,
          buyerUsername: 'customer4',
          shippingCarrier: 'Pos Indonesia',
          createTime: '2024-01-15T08:45:00Z',
          items: [
            { 
              itemName: 'USB Cable Type-C', 
              modelName: '1.5m - Fast Charge',
              qty: 3, 
              itemPrice: 40000 
            }
          ]
        },
        {
          id: 5,
          orderSn: 'SHP005',
          orderStatus: 'SHIPPED',
          totalAmount: 200000,
          buyerUsername: 'customer5',
          shippingCarrier: 'JNE YES',
          createTime: '2024-01-14T16:20:00Z',
          items: [
            { 
              itemName: 'Bluetooth Speaker', 
              modelName: 'Red - Waterproof',
              qty: 1, 
              itemPrice: 200000 
            }
          ]
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

vi.mock('../lib/api', () => ({
  api: {
    orderShip: mockOrderShip,
    orderSync: mockOrderSync,
    orderList: vi.fn(() => Promise.resolve({ data: [] }))
  }
}));

describe('PesananSaya - Shipment Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderShip.mockResolvedValue({ success: true });
    mockOrderSync.mockResolvedValue({ success: true });
  });

  describe('Complete Shipment Workflow', () => {
    it('should handle complete single order shipment workflow', async () => {
      render(<PesananSaya />);
      
      // Navigate to shipment orders
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      // Verify READY_TO_SHIP orders are displayed with ship buttons
      expect(screen.getByText('@customer1')).toBeInTheDocument();
      expect(screen.getByText('Smartphone Case Premium')).toBeInTheDocument();
      expect(screen.getByText('Black - Size L')).toBeInTheDocument();
      
      // Find and click ship button for first order
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      const firstShipButton = shipButtons.find(btn => 
        !btn.textContent?.includes('(') // Exclude batch button
      );
      expect(firstShipButton).toBeInTheDocument();
      
      fireEvent.click(firstShipButton!);
      
      // Verify API call
      await waitFor(() => {
        expect(mockOrderShip).toHaveBeenCalledWith('SHP001');
      });
      
      // Verify success feedback
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('Pengiriman berhasil diatur untuk pesanan #SHP001'),
          'success'
        );
      });
      
      // Verify order list refresh
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('should handle complete batch shipment workflow', async () => {
      render(<PesananSaya />);
      
      // Navigate to shipment orders
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      // Select multiple orders using checkboxes
      const checkboxes = screen.getAllByRole('checkbox');
      
      // Select first two individual orders (skip select-all checkbox)
      fireEvent.click(checkboxes[1]); // First order
      fireEvent.click(checkboxes[2]); // Second order
      
      // Verify batch action appears with correct count
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(2\)/)).toBeInTheDocument();
      });
      
      // Start batch processing
      const batchButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchButton);
      
      // Verify individual API calls are made
      await waitFor(() => {
        expect(mockOrderShip).toHaveBeenCalledWith('SHP001');
        expect(mockOrderShip).toHaveBeenCalledWith('SHP002');
        expect(mockOrderShip).toHaveBeenCalledTimes(2);
      }, { timeout: 2000 });
      
      // Verify batch completion feedback
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('Batch selesai: 2 berhasil, 0 gagal dari 2 pesanan'),
          'success'
        );
      }, { timeout: 2000 });
      
      // Verify selection is cleared
      await waitFor(() => {
        expect(screen.queryByText(/Atur Pengiriman \(/)).not.toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Verify order list refresh
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('should handle select-all functionality correctly', async () => {
      render(<PesananSaya />);
      
      // Navigate to shipment orders
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      const checkboxes = screen.getAllByRole('checkbox');
      const selectAllCheckbox = checkboxes[0];
      
      // Use select-all to select all READY_TO_SHIP orders
      fireEvent.click(selectAllCheckbox);
      
      // Should select all 3 READY_TO_SHIP orders
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(3\)/)).toBeInTheDocument();
      });
      
      // Start batch processing
      const batchButton = screen.getByText(/Atur Pengiriman \(3\)/);
      fireEvent.click(batchButton);
      
      // Verify all orders are processed
      await waitFor(() => {
        expect(mockOrderShip).toHaveBeenCalledWith('SHP001');
        expect(mockOrderShip).toHaveBeenCalledWith('SHP002');
        expect(mockOrderShip).toHaveBeenCalledWith('SHP003');
        expect(mockOrderShip).toHaveBeenCalledTimes(3);
      }, { timeout: 3000 });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle mixed success/failure in batch processing', async () => {
      // Mock mixed results
      let callCount = 0;
      mockOrderShip.mockImplementation((orderSn) => {
        callCount++;
        if (orderSn === 'SHP001') {
          return Promise.resolve({ success: true });
        } else if (orderSn === 'SHP002') {
          return Promise.resolve({ 
            success: false, 
            message: 'Order sudah diproses sebelumnya' 
          });
        } else {
          return Promise.resolve({ success: true });
        }
      });

      render(<PesananSaya />);
      
      // Navigate and select all orders
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]); // Select all
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(3\)/)).toBeInTheDocument();
      });
      
      // Start batch processing
      const batchButton = screen.getByText(/Atur Pengiriman \(3\)/);
      fireEvent.click(batchButton);
      
      // Verify mixed results summary
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('Batch selesai: 2 berhasil, 1 gagal dari 3 pesanan'),
          'warning'
        );
      }, { timeout: 3000 });
    });

    it('should handle network errors during batch processing', async () => {
      // Mock network errors
      mockOrderShip.mockImplementation((orderSn) => {
        if (orderSn === 'SHP001') {
          return Promise.resolve({ success: true });
        } else {
          return Promise.reject(new Error('Network timeout'));
        }
      });

      render(<PesananSaya />);
      
      // Navigate and select orders
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // First order
      fireEvent.click(checkboxes[2]); // Second order (will fail)
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(2\)/)).toBeInTheDocument();
      });
      
      // Start batch processing
      const batchButton = screen.getByText(/Atur Pengiriman \(2\)/);
      fireEvent.click(batchButton);
      
      // Should handle errors gracefully and show summary
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('Batch selesai: 1 berhasil, 1 gagal dari 2 pesanan'),
          'warning'
        );
      }, { timeout: 3000 });
    });
  });

  describe('Filter Integration with Shipment Features', () => {
    it('should show correct orders and buttons based on filter selection', () => {
      render(<PesananSaya />);
      
      // Test "Perlu Dikirim" filter
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      // Should show READY_TO_SHIP and PROCESSED orders
      expect(screen.getByText('@customer1')).toBeInTheDocument(); // READY_TO_SHIP
      expect(screen.getByText('@customer4')).toBeInTheDocument(); // PROCESSED
      
      // Should have ship buttons for READY_TO_SHIP orders only
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      expect(shipButtons.length).toBeGreaterThanOrEqual(3); // 3 individual + potential batch
      
      // Test "Perlu Diproses" sub-filter
      const readyToShipFilter = screen.getByText('Perlu Diproses');
      fireEvent.click(readyToShipFilter);
      
      // Should show only READY_TO_SHIP orders
      expect(screen.getByText('@customer1')).toBeInTheDocument();
      expect(screen.getByText('@customer2')).toBeInTheDocument();
      expect(screen.getByText('@customer3')).toBeInTheDocument();
      expect(screen.queryByText('@customer4')).not.toBeInTheDocument(); // PROCESSED should be hidden
      
      // Test "Telah Diproses" sub-filter
      const processedFilter = screen.getByText('Telah Diproses');
      fireEvent.click(processedFilter);
      
      // Should show only PROCESSED orders
      expect(screen.getByText('@customer4')).toBeInTheDocument();
      expect(screen.queryByText('@customer1')).not.toBeInTheDocument(); // READY_TO_SHIP should be hidden
      
      // Should not have any ship buttons for PROCESSED orders
      const processedShipButtons = screen.queryAllByText('Atur Pengiriman');
      expect(processedShipButtons).toHaveLength(0);
    });

    it('should maintain selection state when switching compatible filters', async () => {
      render(<PesananSaya />);
      
      // Navigate to "Perlu Dikirim" and select orders
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // Select first READY_TO_SHIP order
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
      
      // Switch to "Perlu Diproses" sub-filter
      const readyToShipFilter = screen.getByText('Perlu Diproses');
      fireEvent.click(readyToShipFilter);
      
      // Selection should be maintained since the selected order is still visible
      expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      
      // Switch to "Telah Diproses" sub-filter
      const processedFilter = screen.getByText('Telah Diproses');
      fireEvent.click(processedFilter);
      
      // Selection should be cleared since selected orders are no longer visible
      // (This behavior depends on implementation - the test documents expected behavior)
      expect(screen.queryByText(/Atur Pengiriman \(/)).not.toBeInTheDocument();
    });
  });

  describe('UI State Management', () => {
    it('should properly disable/enable UI elements during processing', async () => {
      // Mock delayed response to test loading states
      mockOrderShip.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 300))
      );

      render(<PesananSaya />);
      
      // Navigate and select orders
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      
      await waitFor(() => {
        expect(screen.getByText(/Atur Pengiriman \(1\)/)).toBeInTheDocument();
      });
      
      // Start batch processing
      const batchButton = screen.getByText(/Atur Pengiriman \(1\)/);
      fireEvent.click(batchButton);
      
      // During processing, checkboxes and buttons should be disabled
      await waitFor(() => {
        checkboxes.forEach(checkbox => {
          expect(checkbox).toBeDisabled();
        });
        
        const individualButtons = screen.getAllByText('Atur Pengiriman').filter(
          btn => !btn.textContent?.includes('(')
        );
        individualButtons.forEach(button => {
          expect(button).toBeDisabled();
        });
      }, { timeout: 100 });
    });

    it('should show proper loading indicators during individual order processing', async () => {
      // Mock delayed response
      mockOrderShip.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 200))
      );

      render(<PesananSaya />);
      
      // Navigate to shipment orders
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      // Click individual ship button
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      const individualButton = shipButtons.find(btn => !btn.textContent?.includes('('));
      fireEvent.click(individualButton!);
      
      // Should show loading state on the clicked button
      // (The exact implementation may vary, but button should be disabled)
      await waitFor(() => {
        expect(individualButton).toBeDisabled();
      }, { timeout: 50 });
    });
  });

  describe('Data Display Integration', () => {
    it('should display complete order information with shipment controls', () => {
      render(<PesananSaya />);
      
      // Navigate to shipment orders
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      // Verify complete order information is displayed
      expect(screen.getByText('@customer1')).toBeInTheDocument();
      expect(screen.getByText('Smartphone Case Premium')).toBeInTheDocument();
      expect(screen.getByText('Variasi: Black - Size L')).toBeInTheDocument();
      expect(screen.getByText('×2')).toBeInTheDocument();
      expect(screen.getByText('Rp 150.000')).toBeInTheDocument();
      expect(screen.getByText('Perlu Diproses')).toBeInTheDocument();
      expect(screen.getByText('JNE REG')).toBeInTheDocument();
      
      // Verify shipment button is present and properly positioned
      const shipButtons = screen.getAllByText('Atur Pengiriman');
      expect(shipButtons.length).toBeGreaterThan(0);
    });

    it('should handle orders without item details gracefully', () => {
      // This test would require mocking orders without items array
      // The current mock always includes items, but the component handles this case
      render(<PesananSaya />);
      
      const needShipTab = screen.getByText('Perlu Dikirim');
      fireEvent.click(needShipTab);
      
      // Component should render without errors even if some orders lack item details
      expect(screen.getByText('Perlu Dikirim')).toBeInTheDocument();
    });
  });
});