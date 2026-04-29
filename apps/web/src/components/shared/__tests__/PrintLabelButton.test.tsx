import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PrintLabelButton } from '../PrintLabelButton';
import { api } from '../../../lib/api';

/**
 * Unit Tests for PrintLabelButton Component
 * 
 * Tests button rendering, loading states, error handling, and print dialog functionality.
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 */

// Mock the API
vi.mock('../../../lib/api', () => ({
  api: {
    orderLabel: vi.fn()
  }
}));

// Mock the Toast hook
const mockToast = vi.fn();
vi.mock('../../ui/Toast', () => ({
  useToast: () => mockToast
}));

// Mock window.open
const mockWindowOpen = vi.fn();
global.window.open = mockWindowOpen;

describe('PrintLabelButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowOpen.mockReturnValue({
      addEventListener: vi.fn(),
      document: {
        write: vi.fn(),
        close: vi.fn()
      },
      print: vi.fn()
    });
  });

  describe('Button Rendering (Requirements 8.1, 8.2)', () => {
    it('should render button with printer icon', () => {
      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDefined();
      expect(button.textContent).toContain('Cetak Label');
    });

    it('should have correct title attribute', () => {
      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      expect(button.getAttribute('title')).toBe('Cetak Label Pengiriman');
    });

    it('should render for PROCESSED orders', () => {
      // This test verifies the button can be rendered
      // Integration with OrderCard is tested separately
      render(<PrintLabelButton orderSn="ORDER_PROCESSED" />);
      
      const button = screen.getByRole('button');
      expect(button).toBeDefined();
    });

    it('should not render loading indicator initially', () => {
      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      // Should show printer icon, not loader
      expect(button.textContent).toContain('Cetak Label');
    });
  });

  describe('Button Disabled State (Requirement 8.3)', () => {
    it('should be enabled by default', () => {
      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button') as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it('should be disabled when disabled prop is true', () => {
      render(<PrintLabelButton orderSn="ORDER_001" disabled={true} />);
      
      const button = screen.getByRole('button') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it('should be disabled during processing', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({
          success: true,
          data: {
            orderSn: 'ORDER_001',
            url: 'https://example.com/label.pdf',
            format: 'pdf' as const,
            trackingNumber: 'TRACK001'
          }
        }), 100);
      }));

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button') as HTMLButtonElement;
      
      // Click button
      fireEvent.click(button);
      
      // Should be disabled during processing
      await waitFor(() => {
        expect(button.disabled).toBe(true);
      });
    });

    it('should have not-allowed cursor when disabled', () => {
      render(<PrintLabelButton orderSn="ORDER_001" disabled={true} />);
      
      const button = screen.getByRole('button');
      expect(button.style.cursor).toBe('not-allowed');
    });

    it('should have reduced opacity when disabled', () => {
      render(<PrintLabelButton orderSn="ORDER_001" disabled={true} />);
      
      const button = screen.getByRole('button');
      expect(button.style.opacity).toBe('0.6');
    });
  });

  describe('Loading Indicator (Requirement 8.4)', () => {
    it('should show loading indicator during label retrieval', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({
          success: true,
          data: {
            orderSn: 'ORDER_001',
            url: 'https://example.com/label.pdf',
            format: 'pdf' as const,
            trackingNumber: 'TRACK001'
          }
        }), 100);
      }));

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      
      // Click button
      fireEvent.click(button);
      
      // Should show loading indicator
      await waitFor(() => {
        // Button should be disabled and show loading state
        expect((button as HTMLButtonElement).disabled).toBe(true);
      });
    });

    it('should hide loading indicator after successful retrieval', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf' as const,
          trackingNumber: 'TRACK001'
        }
      });

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button') as HTMLButtonElement;
      
      // Click button
      fireEvent.click(button);
      
      // Wait for completion
      await waitFor(() => {
        expect(button.disabled).toBe(false);
      });
    });

    it('should hide loading indicator after error', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockRejectedValue(new Error('Network error'));

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button') as HTMLButtonElement;
      
      // Click button
      fireEvent.click(button);
      
      // Wait for error handling
      await waitFor(() => {
        expect(button.disabled).toBe(false);
      });
    });
  });

  describe('Error Handling (Requirement 8.5)', () => {
    it('should show error toast on 404 (order not found)', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      const error: any = new Error('Order not found');
      error.status = 404;
      mockOrderLabel.mockRejectedValue(error);

      render(<PrintLabelButton orderSn="ORDER_999" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Pesanan #ORDER_999 tidak ditemukan',
          'error'
        );
      });
    });

    it('should show error toast on 422 (label not available)', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      const error: any = new Error('Label not available');
      error.status = 422;
      mockOrderLabel.mockRejectedValue(error);

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Label pengiriman belum tersedia untuk pesanan ini',
          'error'
        );
      });
    });

    it('should show error toast on network failure', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockRejectedValue(new Error('Network error'));

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Network error',
          'error'
        );
      });
    });

    it('should show generic error toast on unknown error', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockRejectedValue(new Error());

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Terjadi kesalahan saat mencetak label',
          'error'
        );
      });
    });

    it('should call onPrintError callback on error', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockRejectedValue(new Error('Test error'));
      const onPrintError = vi.fn();

      render(<PrintLabelButton orderSn="ORDER_001" onPrintError={onPrintError} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(onPrintError).toHaveBeenCalledWith('Test error');
      });
    });
  });

  describe('Print Dialog Opening (Requirement 8.6)', () => {
    it('should open print dialog for PDF format', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockWindowOpen).toHaveBeenCalledWith(
          'https://example.com/label.pdf',
          '_blank'
        );
      });
    });

    it('should open print dialog for PNG format', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_002',
          url: 'data:image/png;base64,iVBORw0KGgo...',
          format: 'png',
          trackingNumber: 'TRACK002'
        }
      });

      render(<PrintLabelButton orderSn="ORDER_002" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockWindowOpen).toHaveBeenCalledWith('', '_blank');
      });
    });

    it('should open print dialog for JPG format', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_003',
          url: 'data:image/jpg;base64,/9j/4AAQSkZJRg...',
          format: 'jpg',
          trackingNumber: 'TRACK003'
        }
      });

      render(<PrintLabelButton orderSn="ORDER_003" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockWindowOpen).toHaveBeenCalledWith('', '_blank');
      });
    });

    it('should show success toast after opening print dialog', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Label berhasil dicetak untuk pesanan #ORDER_001',
          'success'
        );
      });
    });
  });

  describe('Callback Props', () => {
    it('should call onPrintStart when printing starts', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });
      const onPrintStart = vi.fn();

      render(<PrintLabelButton orderSn="ORDER_001" onPrintStart={onPrintStart} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(onPrintStart).toHaveBeenCalled();
      });
    });

    it('should call onPrintComplete when printing succeeds', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });
      const onPrintComplete = vi.fn();

      render(<PrintLabelButton orderSn="ORDER_001" onPrintComplete={onPrintComplete} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(onPrintComplete).toHaveBeenCalled();
      });
    });

    it('should not call onPrintComplete when printing fails', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockRejectedValue(new Error('Test error'));
      const onPrintComplete = vi.fn();

      render(<PrintLabelButton orderSn="ORDER_001" onPrintComplete={onPrintComplete} />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });
      
      expect(onPrintComplete).not.toHaveBeenCalled();
    });
  });

  describe('API Integration', () => {
    it('should call api.orderLabel with correct orderSn', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_123',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK123'
        }
      });

      render(<PrintLabelButton orderSn="ORDER_123" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockOrderLabel).toHaveBeenCalledWith('ORDER_123');
      });
    });

    it('should handle API response with success=false', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: false,
        message: 'Custom error message',
        data: {
          orderSn: 'ORDER_001',
          url: '',
          format: 'pdf',
          trackingNumber: ''
        }
      });

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Custom error message',
          'error'
        );
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid clicks gracefully', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({
          success: true,
          data: {
            orderSn: 'ORDER_001',
            url: 'https://example.com/label.pdf',
            format: 'pdf' as const,
            trackingNumber: 'TRACK001'
          }
        }), 100);
      }));

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      
      // Click multiple times rapidly
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      
      // Should only call API once (button is disabled after first click)
      await waitFor(() => {
        expect(mockOrderLabel).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle empty orderSn', async () => {
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: '',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PrintLabelButton orderSn="" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockOrderLabel).toHaveBeenCalledWith('');
      });
    });

    it('should handle window.open returning null', async () => {
      mockWindowOpen.mockReturnValue(null);
      
      const mockOrderLabel = vi.mocked(api.orderLabel);
      mockOrderLabel.mockResolvedValue({
        success: true,
        data: {
          orderSn: 'ORDER_001',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK001'
        }
      });

      render(<PrintLabelButton orderSn="ORDER_001" />);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      // Should not throw error
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          'Label berhasil dicetak untuk pesanan #ORDER_001',
          'success'
        );
      });
    });
  });
});
