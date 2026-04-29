import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BatchProgress, type BatchProgressItem } from '../BatchProgress';

describe('BatchProgress - Summary Notifications', () => {
  it('should display real-time progress during batch processing', () => {
    const items: BatchProgressItem[] = [
      { id: '1', label: 'Order #1', status: 'success' },
      { id: '2', label: 'Order #2', status: 'processing' },
      { id: '3', label: 'Order #3', status: 'pending' },
    ];

    render(<BatchProgress items={items} showDetails={true} />);

    // Should show progress indicator
    expect(screen.getByText(/Memproses\.\.\./i)).toBeInTheDocument();
    expect(screen.getByText(/1\/3/i)).toBeInTheDocument();
  });

  it('should show final summary with successful and failed counts', () => {
    const items: BatchProgressItem[] = [
      { id: '1', label: 'Order #1', status: 'success', message: 'Berhasil diatur' },
      { id: '2', label: 'Order #2', status: 'success', message: 'Berhasil diatur' },
      { id: '3', label: 'Order #3', status: 'error', error: 'Gagal diproses' },
    ];

    render(<BatchProgress items={items} showDetails={true} />);

    // Should show completion summary
    expect(screen.getByText(/Selesai: 2 berhasil, 1 gagal/i)).toBeInTheDocument();
    expect(screen.getByText(/100% selesai/i)).toBeInTheDocument();
  });

  it('should display detailed results for failed orders', () => {
    const items: BatchProgressItem[] = [
      { id: '1', label: 'Order #123', status: 'success', message: 'Berhasil diatur' },
      { id: '2', label: 'Order #456', status: 'error', error: 'Order tidak dapat diproses' },
      { id: '3', label: 'Order #789', status: 'error', error: 'Koneksi gagal' },
    ];

    render(<BatchProgress items={items} showDetails={true} />);

    // Should show warning about failed orders
    expect(screen.getByText(/2 pesanan gagal diproses/i)).toBeInTheDocument();

    // Should show error details
    expect(screen.getByText(/Order tidak dapat diproses/i)).toBeInTheDocument();
    expect(screen.getByText(/Koneksi gagal/i)).toBeInTheDocument();
  });

  it('should sort failed orders first in the list', () => {
    const items: BatchProgressItem[] = [
      { id: '1', label: 'Order #1', status: 'success' },
      { id: '2', label: 'Order #2', status: 'error', error: 'Failed' },
      { id: '3', label: 'Order #3', status: 'success' },
      { id: '4', label: 'Order #4', status: 'error', error: 'Failed' },
    ];

    const { container } = render(<BatchProgress items={items} showDetails={true} />);

    // Get all item labels in order
    const itemElements = container.querySelectorAll('[style*="flex: 1"]');
    const labels = Array.from(itemElements).map(el => el.textContent);

    // Failed orders should appear first
    expect(labels[0]).toContain('Order #2');
    expect(labels[1]).toContain('Order #4');
  });

  it('should show success-only summary when no failures', () => {
    const items: BatchProgressItem[] = [
      { id: '1', label: 'Order #1', status: 'success' },
      { id: '2', label: 'Order #2', status: 'success' },
      { id: '3', label: 'Order #3', status: 'success' },
    ];

    render(<BatchProgress items={items} showDetails={true} />);

    // Should show success summary without failed count
    expect(screen.getByText(/Selesai: 3 berhasil/i)).toBeInTheDocument();
    expect(screen.queryByText(/gagal/i)).not.toBeInTheDocument();
  });

  it('should display progress percentage correctly', () => {
    const items: BatchProgressItem[] = [
      { id: '1', label: 'Order #1', status: 'success' },
      { id: '2', label: 'Order #2', status: 'success' },
      { id: '3', label: 'Order #3', status: 'pending' },
      { id: '4', label: 'Order #4', status: 'pending' },
    ];

    render(<BatchProgress items={items} showDetails={true} />);

    // 2 out of 4 completed = 50%
    expect(screen.getByText(/50% selesai/i)).toBeInTheDocument();
  });

  it('should show detailed error messages for each failed order', () => {
    const items: BatchProgressItem[] = [
      { 
        id: '1', 
        label: 'Order #123', 
        status: 'error', 
        error: 'Autentikasi gagal. Silakan hubungkan ulang toko Shopee Anda.' 
      },
      { 
        id: '2', 
        label: 'Order #456', 
        status: 'error', 
        error: 'Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat.' 
      },
    ];

    render(<BatchProgress items={items} showDetails={true} />);

    // Should show specific error messages
    expect(screen.getByText(/Autentikasi gagal/i)).toBeInTheDocument();
    expect(screen.getByText(/Terlalu banyak permintaan/i)).toBeInTheDocument();
  });

  it('should limit visible items based on maxVisibleItems prop', () => {
    const items: BatchProgressItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: `${i}`,
      label: `Order #${i}`,
      status: 'success' as const,
    }));

    render(<BatchProgress items={items} showDetails={true} maxVisibleItems={5} />);

    // Should show message about hidden items
    expect(screen.getByText(/dan 10 pesanan lainnya/i)).toBeInTheDocument();
  });

  it('should highlight failed orders with background color', () => {
    const items: BatchProgressItem[] = [
      { id: '1', label: 'Order #1', status: 'success' },
      { id: '2', label: 'Order #2', status: 'error', error: 'Failed' },
    ];

    const { container } = render(<BatchProgress items={items} showDetails={true} />);

    // Find the error item container
    const errorItems = container.querySelectorAll('[style*="rgba(239, 68, 68, 0.05)"]');
    expect(errorItems.length).toBeGreaterThan(0);
  });
});
