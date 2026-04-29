import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PesananSaya } from '../PesananSaya';

// Mock the hooks and API
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
        }
      ]
    },
    loading: false,
    refetch: vi.fn()
  }))
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: vi.fn(() => vi.fn())
}));

vi.mock('../lib/api', () => ({
  api: {
    orderShip: vi.fn(() => Promise.resolve({ success: true })),
    orderShipBatch: vi.fn(() => Promise.resolve({ 
      success: true, 
      data: { total: 2, successful: 2, failed: 0, results: [] }
    })),
    orderSync: vi.fn(() => Promise.resolve({ success: true }))
  }
}));

describe('PesananSaya - Batch Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display checkboxes for READY_TO_SHIP orders only', () => {
    render(<PesananSaya />);
    
    // Should have checkboxes for READY_TO_SHIP orders
    const checkboxes = screen.getAllByRole('checkbox');
    // One for select all + two for individual READY_TO_SHIP orders
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
});