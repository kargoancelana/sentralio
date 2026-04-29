import { render, screen } from '@testing-library/react';
import { BatchProgress, type BatchProgressItem } from '../BatchProgress';

describe('BatchProgress', () => {
  const mockItems: BatchProgressItem[] = [
    { id: '1', label: 'Order #1', status: 'success', message: 'Shipped successfully' },
    { id: '2', label: 'Order #2', status: 'processing' },
    { id: '3', label: 'Order #3', status: 'error', error: 'Failed to ship' },
    { id: '4', label: 'Order #4', status: 'pending' },
  ];

  it('should render with basic props', () => {
    render(<BatchProgress items={mockItems} />);
    
    expect(screen.getByText('Processing Orders')).toBeInTheDocument();
  });

  it('should show correct completion stats', () => {
    render(<BatchProgress items={mockItems} />);
    
    // 2 completed (1 success + 1 error), 1 success, 1 failed
    expect(screen.getByText('✓ 1 successful')).toBeInTheDocument();
    expect(screen.getByText('✗ 1 failed')).toBeInTheDocument();
    expect(screen.getByText('⏳ 2 pending')).toBeInTheDocument();
  });

  it('should show detailed items when showDetails is true', () => {
    render(<BatchProgress items={mockItems} showDetails />);
    
    expect(screen.getByText('Order #1')).toBeInTheDocument();
    expect(screen.getByText('Order #2')).toBeInTheDocument();
    expect(screen.getByText('Order #3')).toBeInTheDocument();
    expect(screen.getByText('Order #4')).toBeInTheDocument();
    
    expect(screen.getByText('Shipped successfully')).toBeInTheDocument();
    expect(screen.getByText('Failed to ship')).toBeInTheDocument();
  });

  it('should show completion message when all items are processed', () => {
    const completedItems: BatchProgressItem[] = [
      { id: '1', label: 'Order #1', status: 'success' },
      { id: '2', label: 'Order #2', status: 'error' },
    ];

    render(<BatchProgress items={completedItems} />);
    
    expect(screen.getByText('Completed: 1 success, 1 failed')).toBeInTheDocument();
  });

  it('should limit visible items when maxVisibleItems is set', () => {
    const manyItems: BatchProgressItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `${i + 1}`,
      label: `Order #${i + 1}`,
      status: 'pending' as const
    }));

    render(<BatchProgress items={manyItems} showDetails maxVisibleItems={3} />);
    
    // Should show first 3 items
    expect(screen.getByText('Order #1')).toBeInTheDocument();
    expect(screen.getByText('Order #2')).toBeInTheDocument();
    expect(screen.getByText('Order #3')).toBeInTheDocument();
    
    // Should not show 4th item
    expect(screen.queryByText('Order #4')).not.toBeInTheDocument();
    
    // Should show "... and X more items" message
    expect(screen.getByText('... and 7 more items')).toBeInTheDocument();
  });

  it('should use custom title when provided', () => {
    render(<BatchProgress items={mockItems} title="Custom Title" />);
    
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });
});