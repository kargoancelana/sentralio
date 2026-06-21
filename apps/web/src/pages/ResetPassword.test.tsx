import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ResetPassword } from './ResetPassword';

// Mock fetchApi and ApiError
const mockFetchApi = vi.fn();

vi.mock('../lib/api', () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  }
}));

// Mock useSearchParams
const mockSearchParams = new URLSearchParams();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [mockSearchParams],
  };
});

function renderResetPassword() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <ResetPassword />
    </MemoryRouter>
  );
}

describe('ResetPassword Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('token');
  });

  it('a. token valid -> verify valid:true -> form muncul -> isi 2 field sama -> submit -> complete -> pesan sukses muncul', async () => {
    mockSearchParams.set('token', 'valid-token-xyz');
    mockFetchApi.mockResolvedValueOnce({ valid: true }); // verification call
    mockFetchApi.mockResolvedValueOnce({ ok: true }); // complete call

    const user = userEvent.setup({ delay: null });
    renderResetPassword();

    // Verification in progress first
    expect(screen.getByText(/Memverifikasi link reset password.../i)).toBeTruthy();

    // Wait for form to appear
    await waitFor(() => {
      expect(screen.getByLabelText('Password Baru')).toBeTruthy();
      expect(screen.getByLabelText('Konfirmasi Password')).toBeTruthy();
    });

    // Verify token was checked
    expect(mockFetchApi).toHaveBeenCalledWith('/auth/reset-password/verify', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid-token-xyz' }),
    });

    const passwordInput = screen.getByLabelText('Password Baru');
    const confirmInput = screen.getByLabelText('Konfirmasi Password');
    const submitBtn = screen.getByRole('button', { name: /Simpan Password/i });

    await user.type(passwordInput, 'NewSecretPassword123');
    await user.type(confirmInput, 'NewSecretPassword123');
    await user.click(submitBtn);

    // Wait for complete API to be called
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith('/auth/reset-password/complete', {
        method: 'POST',
        body: JSON.stringify({ token: 'valid-token-xyz', newPassword: 'NewSecretPassword123' }),
      });
    });

    // Success message should appear
    await waitFor(() => {
      expect(screen.getByText(/Password Berhasil Diubah/i)).toBeTruthy();
      expect(screen.getByRole('link', { name: /Kembali ke Halaman Login/i })).toBeTruthy();
    });
  });

  it('b. token invalid -> verify valid:false -> pesan link tidak valid', async () => {
    mockSearchParams.set('token', 'invalid-token-xyz');
    mockFetchApi.mockResolvedValueOnce({ valid: false }); // verification call

    renderResetPassword();

    // Wait for validation error to appear
    await waitFor(() => {
      expect(screen.getByText(/Link reset tidak valid atau sudah kadaluarsa/i)).toBeTruthy();
    });

    // Form should not be rendered
    expect(screen.queryByLabelText('Password Baru')).toBeNull();
    expect(screen.queryByLabelText('Konfirmasi Password')).toBeNull();
  });

  it('c. konfirmasi beda -> complete TIDAK dipanggil', async () => {
    mockSearchParams.set('token', 'valid-token-xyz');
    mockFetchApi.mockResolvedValueOnce({ valid: true }); // verification call

    const user = userEvent.setup({ delay: null });
    renderResetPassword();

    await waitFor(() => {
      expect(screen.getByLabelText('Password Baru')).toBeTruthy();
    });

    const passwordInput = screen.getByLabelText('Password Baru');
    const confirmInput = screen.getByLabelText('Konfirmasi Password');
    const submitBtn = screen.getByRole('button', { name: /Simpan Password/i });

    await user.type(passwordInput, 'NewSecretPassword123');
    await user.type(confirmInput, 'DifferentPassword123');
    await user.click(submitBtn);

    // Assert that complete is NOT called because passwords differ
    expect(screen.getByText(/Konfirmasi password tidak cocok/i)).toBeTruthy();
    expect(mockFetchApi).not.toHaveBeenCalledWith('/auth/reset-password/complete', expect.any(Object));
  });
});
