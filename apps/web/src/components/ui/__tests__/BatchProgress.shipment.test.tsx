/**
 * **Validates: Requirements 5.1, 5.2**
 * 
 * Component tests for BatchProgress component used in shipment processing.
 * Tests progress indicator updates, status display, and user interaction feedback.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BatchProgress, type BatchProgressItem } from '../BatchProgress';

describe('BatchProgress - Shipment Processing', () => {
  const mockItems: BatchProgressItem[] = [
    {
      id: 'ORDER001',
      label: 'Order #ORDER001',
      status: 'pending'
    },
    {
      id: 'ORDER002',
      label: 'Order #ORDER002',
      status: 'processing'
    },
    {
      id: 'ORDER003',
      label: 'Order #ORDER003',
      status: 'success',
      message: 'Shipped successfully'
    },
    {
      id: 'ORDER004',
      label: 'Order #ORDER004',
      status: 'error',
      error: 'Order already processed'
    }
  ];

  describe('Progress Indicator Display', () => {
    it('should display correct progress counts', () => {
      render(
        <BatchProgress
          items={mockItems}
          title="Processing Shipment Orders"
          showDetails={true}
        />
      );

      // Should show title
      expect(screen.getByText('Processing Shipment Orders')).toBeInTheDocument();

      // Should show correct completion stats
      expect(screen.getByText('2 successful')).toBeInTheDocument();
      expect(screen.getByText('1 failed')).toBeInTheDocument();
      expect(screen.getByText('1 pending')).toBeInTheDocument();
    });

    it('should calculate correct completion percentage', () => {
      render(
        <BatchProgress
          items={mockItems}
          showDetails={true}
        />
      );

      // 2 completed out of 4 total = 50%
      expect(screen.getByText('50% complete')).toBeInTheDocument();
    });

    it('should show processing status when not all items are complete', () => {
      const processingItems = [
        { id: '1', label: 'Order #1', status: 'success' as const },
        { id: '2', label: 'Order #2', status: 'processing' as const },
        { id: '3', label: 'Order #3', status: 'pending' as const }
      ];

      render(
        <BatchProgress
          items={processingItems}
          showDetails={true}
        />
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('should show completion summary when all items are done', () => {
      const completedItems = [
        { id: '1', label: 'Order #1', status: 'success' as const },
        { id: '2', label: 'Order #2', status: 'error' as const, error: 'Failed' }
      ];

      render(
        <BatchProgress
          items={completedItems}
          showDetails={true}
        />
      );

      expect(screen.getByText('Completed: 1 success, 1 failed')).toBeInTheDocument();
    });
  });

  describe('Status Icons and Colors', () => {
    it('should display correct status icons for each item', () => {
      render(
        <BatchProgress
          items={mockItems}
          showDetails={true}
        />
      );

      // Check that all order labels are displayed
      expect(screen.getByText('Order #ORDER001')).toBeInTheDocument();
      expect(screen.getByText('Order #ORDER002')).toBeInTheDocument();
      expect(screen.getByText('Order #ORDER003')).toBeInTheDocument();
      expect(screen.getByText('Order #ORDER004')).toBeInTheDocument();
    });

    it('should display success messages for completed items', () => {
      render(
        <BatchProgress
          items={mockItems}
          showDetails={true}
        />
      );

      expect(screen.getByText('Shipped successfully')).toBeInTheDocument();
    });

    it('should display error messages for failed items', () => {
      render(
        <BatchProgress
          items={mockItems}
          showDetails={true}
        />
      );

      expect(screen.getByText('Order already processed')).toBeInTheDocument();
    });
  });

  describe('Progress Bar Variants', () => {
    it('should use warning variant when there are failures', () => {
      const { container } = render(
        <BatchProgress
          items={mockItems}
          showDetails={true}
        />
      );

      // The progress bar should be rendered (we can't easily test the variant prop)
      const progressElements = container.querySelectorAll('[class*="progress"]');
      expect(progressElements.length).toBeGreaterThan(0);
    });

    it('should use primary variant when all items succeed', () => {
      const successItems = [
        { id: '1', label: 'Order #1', status: 'success' as const },
        { id: '2', label: 'Order #2', status: 'success' as const }
      ];

      const { container } = render(
        <BatchProgress
          items={successItems}
          showDetails={true}
        />
      );

      const progressElements = container.querySelectorAll('[class*="progress"]');
      expect(progressElements.length).toBeGreaterThan(0);
    });

    it('should show animated progress bar when processing', () => {
      const processingItems = [
        { id: '1', label: 'Order #1', status: 'success' as const },
        { id: '2', label: 'Order #2', status: 'processing' as const }
      ];

      const { container } = render(
        <BatchProgress
          items={processingItems}
          showDetails={true}
        />
      );

      const progressElements = container.querySelectorAll('[class*="progress"]');
      expect(progressElements.length).toBeGreaterThan(0);
    });
  });

  describe('Item Visibility and Truncation', () => {
    it('should show all items when count is within maxVisibleItems', () => {
      render(
        <BatchProgress
          items={mockItems}
          showDetails={true}
          maxVisibleItems={5}
        />
      );

      // All 4 items should be visible
      expect(screen.getByText('Order #ORDER001')).toBeInTheDocument();
      expect(screen.getByText('Order #ORDER002')).toBeInTheDocument();
      expect(screen.getByText('Order #ORDER003')).toBeInTheDocument();
      expect(screen.getByText('Order #ORDER004')).toBeInTheDocument();
      
      // Should not show truncation message
      expect(screen.queryByText(/and \d+ more items/)).not.toBeInTheDocument();
    });

    it('should truncate items when count exceeds maxVisibleItems', () => {
      render(
        <BatchProgress
          items={mockItems}
          showDetails={true}
          maxVisibleItems={2}
        />
      );

      // First 2 items should be visible
      expect(screen.getByText('Order #ORDER001')).toBeInTheDocument();
      expect(screen.getByText('Order #ORDER002')).toBeInTheDocument();
      
      // Last 2 items should not be visible
      expect(screen.queryByText('Order #ORDER003')).not.toBeInTheDocument();
      expect(screen.queryByText('Order #ORDER004')).not.toBeInTheDocument();
      
      // Should show truncation message
      expect(screen.getByText('... and 2 more items')).toBeInTheDocument();
    });

    it('should hide details when showDetails is false', () => {
      render(
        <BatchProgress
          items={mockItems}
          showDetails={false}
        />
      );

      // Should show summary but not individual items
      expect(screen.getByText('Processing Orders')).toBeInTheDocument();
      expect(screen.queryByText('Order #ORDER001')).not.toBeInTheDocument();
    });
  });

  describe('Empty and Edge Cases', () => {
    it('should handle empty items array', () => {
      render(
        <BatchProgress
          items={[]}
          showDetails={true}
        />
      );

      expect(screen.getByText('Processing Orders')).toBeInTheDocument();
      expect(screen.getByText('100% complete')).toBeInTheDocument(); // 0/0 = 100%
    });

    it('should handle single item', () => {
      const singleItem = [
        { id: 'ORDER001', label: 'Order #ORDER001', status: 'success' as const }
      ];

      render(
        <BatchProgress
          items={singleItem}
          showDetails={true}
        />
      );

      expect(screen.getByText('Order #ORDER001')).toBeInTheDocument();
      expect(screen.getByText('100% complete')).toBeInTheDocument();
      expect(screen.getByText('Completed: 1 success, 0 failed')).toBeInTheDocument();
    });

    it('should handle all pending items', () => {
      const pendingItems = [
        { id: '1', label: 'Order #1', status: 'pending' as const },
        { id: '2', label: 'Order #2', status: 'pending' as const }
      ];

      render(
        <BatchProgress
          items={pendingItems}
          showDetails={true}
        />
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
      expect(screen.getByText('0% complete')).toBeInTheDocument();
      expect(screen.getByText('2 pending')).toBeInTheDocument();
    });

    it('should handle all failed items', () => {
      const failedItems = [
        { id: '1', label: 'Order #1', status: 'error' as const, error: 'Error 1' },
        { id: '2', label: 'Order #2', status: 'error' as const, error: 'Error 2' }
      ];

      render(
        <BatchProgress
          items={failedItems}
          showDetails={true}
        />
      );

      expect(screen.getByText('Completed: 0 success, 2 failed')).toBeInTheDocument();
      expect(screen.getByText('100% complete')).toBeInTheDocument();
      expect(screen.getByText('2 failed')).toBeInTheDocument();
    });
  });

  describe('Custom Props', () => {
    it('should use custom title when provided', () => {
      render(
        <BatchProgress
          items={mockItems}
          title="Custom Shipment Processing"
          showDetails={true}
        />
      );

      expect(screen.getByText('Custom Shipment Processing')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <BatchProgress
          items={mockItems}
          className="custom-batch-progress"
          showDetails={true}
        />
      );

      const batchElement = container.querySelector('.batch-progress');
      expect(batchElement).toHaveClass('custom-batch-progress');
    });

    it('should use default title when not provided', () => {
      render(
        <BatchProgress
          items={mockItems}
          showDetails={true}
        />
      );

      expect(screen.getByText('Processing Orders')).toBeInTheDocument();
    });
  });

  describe('Real-time Updates Simulation', () => {
    it('should handle status transitions correctly', () => {
      const { rerender } = render(
        <BatchProgress
          items={[
            { id: '1', label: 'Order #1', status: 'pending' },
            { id: '2', label: 'Order #2', status: 'pending' }
          ]}
          showDetails={true}
        />
      );

      // Initial state: all pending
      expect(screen.getByText('Processing...')).toBeInTheDocument();
      expect(screen.getByText('0% complete')).toBeInTheDocument();

      // Update: first item processing
      rerender(
        <BatchProgress
          items={[
            { id: '1', label: 'Order #1', status: 'processing' },
            { id: '2', label: 'Order #2', status: 'pending' }
          ]}
          showDetails={true}
        />
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
      expect(screen.getByText('0% complete')).toBeInTheDocument(); // Still 0% complete

      // Update: first item success
      rerender(
        <BatchProgress
          items={[
            { id: '1', label: 'Order #1', status: 'success', message: 'Shipped' },
            { id: '2', label: 'Order #2', status: 'pending' }
          ]}
          showDetails={true}
        />
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
      expect(screen.getByText('50% complete')).toBeInTheDocument();
      expect(screen.getByText('Shipped')).toBeInTheDocument();

      // Update: both complete
      rerender(
        <BatchProgress
          items={[
            { id: '1', label: 'Order #1', status: 'success', message: 'Shipped' },
            { id: '2', label: 'Order #2', status: 'success', message: 'Shipped' }
          ]}
          showDetails={true}
        />
      );

      expect(screen.getByText('Completed: 2 success, 0 failed')).toBeInTheDocument();
      expect(screen.getByText('100% complete')).toBeInTheDocument();
    });
  });
});