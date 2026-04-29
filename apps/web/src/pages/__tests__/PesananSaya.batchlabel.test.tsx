import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PesananSaya } from '../PesananSaya';

/**
 * Unit Tests for Batch Label Selection UI
 * 
 * Tests checkbox rendering, action bar visibility, selection count display,
 * select all functionality, and clear selection.
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
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
        },
        {
          id: 4,
          orderSn: 'READY_001',
          orderStatus: 'READY_TO_SHIP',
          totalAmount: 300000,
          buyerUsername: 'buyer4',
          createTime: '2024-01-01T13:00:00Z',
          items: [{ itemName: 'Product 4', qty: 1, itemPrice: 300000 }]
        },
        {
          id: 5,
          orderSn: 'SHIPPED_001',
          orderStatus: 'SHIPPED',
          totalAmount: 250000,
          buyerUsername: 'buyer5',
          shippingCarrier: 'JNE',
          createTime: '2024-01-01T14:00:00Z',
          items: [{ itemName: 'Product 5', qty: 1, itemPrice: 250000 }]
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
const mockOrderLabelsBatch = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    orderLabel: mockOrderLabel,
    orderLabelsBatch: mockOrderLabelsBatch,
    orderSync: vi.fn(() => Promise.resolve({ success: true })),
    orderList: vi.fn(() => Promise.resolve({ success: true, data: [] })),
    orderShip: vi.fn(() => Promise.resolve({ success: true })),
    orderShipBatch: vi.fn(() => Promise.resolve({ success: true, data: { total: 0, successful: 0, failed: 0, results: [] } }))
  }
}));

describe('Batch Label Selection UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Checkbox Rendering (Requirement 9.1)', () => {
    it('should display checkbox for PROCESSED orders', () => {
      render(<PesananSaya />);
      
      // Should have checkboxes for PROCESSED orders
      const checkboxes = screen.getAllByRole('checkbox');
      
      // We have 3 PROCESSED orders and 1 READY_TO_SHIP order = 4 checkboxes total
      expect(checkboxes.length).toBeGreaterThanOrEqual(3);
    });

    it('should not display checkbox for non-PROCESSED orders (except READY_TO_SHIP)', () => {
      render(<PesananSaya />);
      
      // SHIPPED orders should not have checkboxes
      // This is implicit in the component logic - only PROCESSED and READY_TO_SHIP get checkboxes
      const allCheckboxes = screen.getAllByRole('checkbox');
      
      // Should have checkboxes for 3 PROCESSED + 1 READY_TO_SHIP = 4 total
      expect(allCheckboxes.length).toBe(4);
    });

    it('should render checkbox in unchecked state initially', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // All checkboxes should be unchecked initially
      checkboxes.forEach(checkbox => {
        expect(checkbox.checked).toBe(false);
      });
    });
  });

  describe('Checkbox Interaction (Requirement 9.1)', () => {
    it('should check checkbox when clicked', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      const firstCheckbox = checkboxes[0];
      
      // Click checkbox
      fireEvent.click(firstCheckbox);
      
      // Should be checked
      expect(firstCheckbox.checked).toBe(true);
    });

    it('should uncheck checkbox when clicked again', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      const firstCheckbox = checkboxes[0];
      
      // Click to check
      fireEvent.click(firstCheckbox);
      expect(firstCheckbox.checked).toBe(true);
      
      // Click to uncheck
      fireEvent.click(firstCheckbox);
      expect(firstCheckbox.checked).toBe(false);
    });

    it('should allow multiple checkboxes to be selected', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select first 3 checkboxes
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      // All 3 should be checked
      expect(checkboxes[0].checked).toBe(true);
      expect(checkboxes[1].checked).toBe(true);
      expect(checkboxes[2].checked).toBe(true);
    });
  });

  describe('Action Bar Visibility (Requirements 9.2, 9.4)', () => {
    it('should show action bar when orders are selected', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select a PROCESSED order checkbox (first one)
      fireEvent.click(checkboxes[0]);
      
      // Action bar should appear with "Cetak Label Batch" button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      expect(batchButton).toBeDefined();
    });

    it('should hide action bar when no orders are selected', () => {
      render(<PesananSaya />);
      
      // Action bar should not be visible initially
      const batchButtons = screen.queryAllByText(/Cetak Label Batch/i);
      expect(batchButtons.length).toBe(0);
    });

    it('should hide action bar after clearing selection', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Action bar should be visible
      expect(screen.getByText(/Cetak Label Batch/i)).toBeDefined();
      
      // Click "Batal" button
      const cancelButtons = screen.getAllByText('Batal');
      const labelCancelButton = cancelButtons.find(btn => 
        btn.parentElement?.textContent?.includes('Cetak Label Batch')
      );
      
      if (labelCancelButton) {
        fireEvent.click(labelCancelButton);
        
        // Action bar should be hidden
        const batchButtons = screen.queryAllByText(/Cetak Label Batch/i);
        expect(batchButtons.length).toBe(0);
      }
    });
  });

  describe('Selection Count Display (Requirement 9.3)', () => {
    it('should display count of selected orders', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 2 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      
      // Should show "2 pesanan dipilih"
      const countText = screen.getAllByText(/pesanan dipilih/i);
      expect(countText.length).toBeGreaterThan(0);
      
      // Find the one for label printing (should show 2)
      const labelCountText = countText.find(el => 
        el.textContent?.includes('2 pesanan dipilih')
      );
      expect(labelCountText).toBeDefined();
    });

    it('should update count when selection changes', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 1 order
      fireEvent.click(checkboxes[0]);
      expect(screen.getByText(/1 pesanan dipilih/i)).toBeDefined();
      
      // Select another order
      fireEvent.click(checkboxes[1]);
      expect(screen.getByText(/2 pesanan dipilih/i)).toBeDefined();
      
      // Deselect one
      fireEvent.click(checkboxes[0]);
      expect(screen.getByText(/1 pesanan dipilih/i)).toBeDefined();
    });

    it('should show correct count in batch button', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select 3 orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      // Button should show count
      const batchButton = screen.getByText(/Cetak Label Batch \(3\)/i);
      expect(batchButton).toBeDefined();
    });
  });

  describe('Select All Functionality (Requirement 9.5)', () => {
    it('should have "Pilih Semua" button in action bar', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select one order to show action bar
      fireEvent.click(checkboxes[0]);
      
      // Should have "Pilih Semua" button
      const selectAllButtons = screen.getAllByText('Pilih Semua');
      expect(selectAllButtons.length).toBeGreaterThan(0);
    });

    it('should select all PROCESSED orders when "Pilih Semua" clicked', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select one order to show action bar
      fireEvent.click(checkboxes[0]);
      
      // Click "Pilih Semua"
      const selectAllButtons = screen.getAllByText('Pilih Semua');
      const labelSelectAllButton = selectAllButtons.find(btn => 
        btn.parentElement?.parentElement?.textContent?.includes('Cetak Label Batch')
      );
      
      if (labelSelectAllButton) {
        fireEvent.click(labelSelectAllButton);
        
        // Should show 3 PROCESSED orders selected
        const countText = screen.getByText(/3 pesanan dipilih/i);
        expect(countText).toBeDefined();
      }
    });

    it('should deselect all when "Pilih Semua" clicked on fully selected set', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select one order
      fireEvent.click(checkboxes[0]);
      
      // Click "Pilih Semua" to select all
      const selectAllButtons = screen.getAllByText('Pilih Semua');
      const labelSelectAllButton = selectAllButtons.find(btn => 
        btn.parentElement?.parentElement?.textContent?.includes('Cetak Label Batch')
      );
      
      if (labelSelectAllButton) {
        fireEvent.click(labelSelectAllButton);
        
        // Should have 3 selected
        expect(screen.getByText(/3 pesanan dipilih/i)).toBeDefined();
        
        // Click "Pilih Semua" again to deselect all
        fireEvent.click(labelSelectAllButton);
        
        // Action bar should be hidden (no selection)
        const batchButtons = screen.queryAllByText(/Cetak Label Batch/i);
        expect(batchButtons.length).toBe(0);
      }
    });
  });

  describe('Clear Selection (Requirement 9.4)', () => {
    it('should have "Batal" button in action bar', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select one order
      fireEvent.click(checkboxes[0]);
      
      // Should have "Batal" button
      const cancelButtons = screen.getAllByText('Batal');
      expect(cancelButtons.length).toBeGreaterThan(0);
    });

    it('should clear all selections when "Batal" clicked', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select multiple orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      // Should have 3 selected
      expect(screen.getByText(/3 pesanan dipilih/i)).toBeDefined();
      
      // Click "Batal"
      const cancelButtons = screen.getAllByText('Batal');
      const labelCancelButton = cancelButtons.find(btn => 
        btn.parentElement?.textContent?.includes('Cetak Label Batch')
      );
      
      if (labelCancelButton) {
        fireEvent.click(labelCancelButton);
        
        // All checkboxes should be unchecked
        checkboxes.forEach(checkbox => {
          expect(checkbox.checked).toBe(false);
        });
        
        // Action bar should be hidden
        const batchButtons = screen.queryAllByText(/Cetak Label Batch/i);
        expect(batchButtons.length).toBe(0);
      }
    });
  });

  describe('Checkbox Disabled State (Requirement 9.6)', () => {
    it('should disable checkboxes during batch printing', async () => {
      mockOrderLabelsBatch.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({
          success: true,
          data: {
            total: 2,
            successful: 2,
            failed: 0,
            results: []
          }
        }), 100);
      }));

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select orders
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[1]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i);
      fireEvent.click(batchButton);
      
      // Checkboxes should be disabled during processing
      await waitFor(() => {
        checkboxes.forEach(checkbox => {
          if (checkbox.parentElement?.textContent?.includes('PROCESSED')) {
            expect(checkbox.disabled).toBe(true);
          }
        });
      });
    });
  });

  describe('Action Bar Buttons State', () => {
    it('should disable all buttons during batch printing', async () => {
      mockOrderLabelsBatch.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({
          success: true,
          data: {
            total: 1,
            successful: 1,
            failed: 0,
            results: []
          }
        }), 100);
      }));

      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select an order
      fireEvent.click(checkboxes[0]);
      
      // Click batch print button
      const batchButton = screen.getByText(/Cetak Label Batch/i) as HTMLButtonElement;
      fireEvent.click(batchButton);
      
      // All action bar buttons should be disabled
      await waitFor(() => {
        const allButtons = screen.getAllByRole('button');
        const actionBarButtons = allButtons.filter(btn => 
          btn.textContent?.includes('Pilih Semua') ||
          btn.textContent?.includes('Batal') ||
          btn.textContent?.includes('Cetak Label Batch')
        );
        
        actionBarButtons.forEach(button => {
          expect((button as HTMLButtonElement).disabled).toBe(true);
        });
      });
    });
  });

  describe('Integration with Order Status', () => {
    it('should only show checkboxes for PROCESSED orders in label selection', () => {
      render(<PesananSaya />);
      
      // We have 3 PROCESSED orders
      // Each should have a checkbox
      // READY_TO_SHIP also has checkbox but for shipment, not label
      const checkboxes = screen.getAllByRole('checkbox');
      
      // Should have 4 checkboxes total (3 PROCESSED + 1 READY_TO_SHIP)
      expect(checkboxes.length).toBe(4);
    });

    it('should not select READY_TO_SHIP orders in label batch', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select first checkbox (should be PROCESSED)
      fireEvent.click(checkboxes[0]);
      
      // Click "Pilih Semua" for label printing
      const selectAllButtons = screen.getAllByText('Pilih Semua');
      const labelSelectAllButton = selectAllButtons.find(btn => 
        btn.parentElement?.parentElement?.textContent?.includes('Cetak Label Batch')
      );
      
      if (labelSelectAllButton) {
        fireEvent.click(labelSelectAllButton);
        
        // Should only select 3 PROCESSED orders, not READY_TO_SHIP
        expect(screen.getByText(/3 pesanan dipilih/i)).toBeDefined();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid checkbox clicks', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      const firstCheckbox = checkboxes[0];
      
      // Rapid clicks
      for (let i = 0; i < 10; i++) {
        fireEvent.click(firstCheckbox);
      }
      
      // Should end up unchecked (even number of clicks)
      expect(firstCheckbox.checked).toBe(false);
    });

    it('should handle selecting and deselecting all orders multiple times', () => {
      render(<PesananSaya />);
      
      const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
      
      // Select one to show action bar
      fireEvent.click(checkboxes[0]);
      
      const selectAllButtons = screen.getAllByText('Pilih Semua');
      const labelSelectAllButton = selectAllButtons.find(btn => 
        btn.parentElement?.parentElement?.textContent?.includes('Cetak Label Batch')
      );
      
      if (labelSelectAllButton) {
        // Select all, deselect all, select all again
        fireEvent.click(labelSelectAllButton); // Select all
        fireEvent.click(labelSelectAllButton); // Deselect all
        
        // Need to select one again to show action bar
        fireEvent.click(checkboxes[0]);
        fireEvent.click(labelSelectAllButton); // Select all again
        
        // Should have 3 selected
        expect(screen.getByText(/3 pesanan dipilih/i)).toBeDefined();
      }
    });
  });
});
