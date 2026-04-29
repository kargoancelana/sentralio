import { render, screen, waitFor, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';
import { userEvent } from '@testing-library/user-event';

// Test component that uses the toast hook
function TestComponent() {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast('Success message', 'success')}>
        Show Success
      </button>
      <button onClick={() => toast('Error message', 'error')}>
        Show Error
      </button>
      <button onClick={() => toast('Warning message', 'warn')}>
        Show Warning
      </button>
      <button onClick={() => toast('Info message', 'info')}>
        Show Info
      </button>
    </div>
  );
}

describe('Toast Notification System', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Success Toasts', () => {
    it('should display success toast with order_sn', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Success');
      await user.click(button);

      expect(screen.getByText('Success message')).toBeInTheDocument();
    });

    it('should auto-dismiss success toast after 3000ms', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Success');
      await user.click(button);

      expect(screen.getByText('Success message')).toBeInTheDocument();

      // Fast-forward time by 3000ms
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Toast should be dismissed
      await waitFor(() => {
        expect(screen.queryByText('Success message')).not.toBeInTheDocument();
      });
    });

    it('should not show dismiss button for success toast', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Success');
      await user.click(button);

      // Success toast should not have a dismiss button
      const dismissButtons = screen.queryAllByLabelText('Dismiss notification');
      expect(dismissButtons).toHaveLength(0);
    });
  });

  describe('Error Toasts', () => {
    it('should display error toast with error message', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Error');
      await user.click(button);

      expect(screen.getByText('Error message')).toBeInTheDocument();
    });

    it('should NOT auto-dismiss error toast', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Error');
      await user.click(button);

      expect(screen.getByText('Error message')).toBeInTheDocument();

      // Fast-forward time by 5000ms (more than success auto-dismiss time)
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Error toast should still be visible
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });

    it('should show dismiss button for error toast', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Error');
      await user.click(button);

      // Error toast should have a dismiss button
      const dismissButton = screen.getByLabelText('Dismiss notification');
      expect(dismissButton).toBeInTheDocument();
    });

    it('should dismiss error toast when dismiss button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const showButton = screen.getByText('Show Error');
      await user.click(showButton);

      expect(screen.getByText('Error message')).toBeInTheDocument();

      const dismissButton = screen.getByLabelText('Dismiss notification');
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('Error message')).not.toBeInTheDocument();
      });
    });
  });

  describe('Warning Toasts', () => {
    it('should display warning toast', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Warning');
      await user.click(button);

      expect(screen.getByText('Warning message')).toBeInTheDocument();
    });

    it('should NOT auto-dismiss warning toast', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Warning');
      await user.click(button);

      expect(screen.getByText('Warning message')).toBeInTheDocument();

      // Fast-forward time
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Warning toast should still be visible
      expect(screen.getByText('Warning message')).toBeInTheDocument();
    });

    it('should show dismiss button for warning toast', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Warning');
      await user.click(button);

      // Warning toast should have a dismiss button
      const dismissButton = screen.getByLabelText('Dismiss notification');
      expect(dismissButton).toBeInTheDocument();
    });
  });

  describe('Info Toasts', () => {
    it('should display info toast', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Info');
      await user.click(button);

      expect(screen.getByText('Info message')).toBeInTheDocument();
    });

    it('should auto-dismiss info toast after 3500ms', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const button = screen.getByText('Show Info');
      await user.click(button);

      expect(screen.getByText('Info message')).toBeInTheDocument();

      // Fast-forward time by 3500ms
      act(() => {
        jest.advanceTimersByTime(3500);
      });

      // Toast should be dismissed
      await waitFor(() => {
        expect(screen.queryByText('Info message')).not.toBeInTheDocument();
      });
    });
  });

  describe('Multiple Toasts', () => {
    it('should display multiple toasts simultaneously', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));
      await user.click(screen.getByText('Show Error'));

      expect(screen.getByText('Success message')).toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });

    it('should auto-dismiss only success toasts while keeping error toasts', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));
      await user.click(screen.getByText('Show Error'));

      expect(screen.getByText('Success message')).toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();

      // Fast-forward time by 3000ms
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Success toast should be dismissed, error toast should remain
      await waitFor(() => {
        expect(screen.queryByText('Success message')).not.toBeInTheDocument();
        expect(screen.getByText('Error message')).toBeInTheDocument();
      });
    });
  });

  describe('Shipment Integration Requirements', () => {
    it('should meet Requirement 8.1: success toast with order_sn', async () => {
      const user = userEvent.setup({ delay: null });
      
      function ShipmentTestComponent() {
        const toast = useToast();
        return (
          <button onClick={() => toast('Pengiriman berhasil diatur untuk pesanan #ABC123', 'success')}>
            Ship Order
          </button>
        );
      }

      render(
        <ToastProvider>
          <ShipmentTestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Ship Order'));
      expect(screen.getByText(/Pengiriman berhasil diatur untuk pesanan #ABC123/)).toBeInTheDocument();
    });

    it('should meet Requirement 8.2: error toast with specific error message', async () => {
      const user = userEvent.setup({ delay: null });
      
      function ShipmentTestComponent() {
        const toast = useToast();
        return (
          <button onClick={() => toast('Shopee API Error: Order already processed', 'error')}>
            Ship Order Error
          </button>
        );
      }

      render(
        <ToastProvider>
          <ShipmentTestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Ship Order Error'));
      expect(screen.getByText('Shopee API Error: Order already processed')).toBeInTheDocument();
    });

    it('should meet Requirement 8.5: auto-dismiss success after 3000ms', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));
      expect(screen.getByText('Success message')).toBeInTheDocument();

      // Verify it dismisses at exactly 3000ms
      act(() => {
        jest.advanceTimersByTime(2999);
      });
      expect(screen.getByText('Success message')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1);
      });

      await waitFor(() => {
        expect(screen.queryByText('Success message')).not.toBeInTheDocument();
      });
    });

    it('should meet Requirement 8.6: error notifications visible until manually dismissed', async () => {
      const user = userEvent.setup({ delay: null });
      
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Error'));
      expect(screen.getByText('Error message')).toBeInTheDocument();

      // Fast-forward a very long time
      act(() => {
        jest.advanceTimersByTime(60000); // 1 minute
      });

      // Error should still be visible
      expect(screen.getByText('Error message')).toBeInTheDocument();

      // Only dismissed when user clicks dismiss button
      const dismissButton = screen.getByLabelText('Dismiss notification');
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('Error message')).not.toBeInTheDocument();
      });
    });
  });
});
