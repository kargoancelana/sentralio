/**
 * Component tests untuk PlatformProtectedRoute (guard portal Super Admin).
 *
 * Test 1: state loading -> tidak render apa-apa (tidak redirect).
 * Test 2: anonim -> redirect ke /platform/login dan path+search tersimpan di
 *         'platform.postLoginRedirect'.
 * Test 3: authenticated -> konten terproteksi (Outlet) tampil.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlatformProtectedRoute } from '../PlatformProtectedRoute';
import type {
  PlatformAuthApi,
  PlatformAuthState,
} from '../../context/PlatformAuthContext';

let mockState: PlatformAuthState = { status: 'anonymous' };

vi.mock('../../context/PlatformAuthContext', () => ({
  usePlatformAuth: (): PlatformAuthApi => ({
    state: mockState,
    login: vi.fn(),
    logout: vi.fn(),
    refreshMe: vi.fn(),
  }),
}));

describe('PlatformProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('Test 1: loading -> render null (tidak redirect)', () => {
    mockState = { status: 'loading' };

    const { container } = render(
      <MemoryRouter initialEntries={['/platform']}>
        <Routes>
          <Route path="/platform/login" element={<div data-testid="platform-login">Login</div>} />
          <Route element={<PlatformProtectedRoute />}>
            <Route path="/platform" element={<div data-testid="protected">Portal</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('platform-login')).toBeNull();
    expect(sessionStorage.getItem('platform.postLoginRedirect')).toBeNull();
  });

  it('Test 2: anonim -> redirect /platform/login + path tersimpan', () => {
    mockState = { status: 'anonymous' };

    render(
      <MemoryRouter initialEntries={['/platform/companies?status=active']}>
        <Routes>
          <Route path="/platform/login" element={<div data-testid="platform-login">Login</div>} />
          <Route element={<PlatformProtectedRoute />}>
            <Route path="/platform/companies" element={<div data-testid="protected">Companies</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('platform-login')).toBeTruthy();
    expect(screen.queryByTestId('protected')).toBeNull();
    expect(sessionStorage.getItem('platform.postLoginRedirect')).toBe(
      '/platform/companies?status=active',
    );
  });

  it('Test 3: authenticated -> konten terproteksi tampil', () => {
    mockState = {
      status: 'authenticated',
      admin: { id: 1, email: 'super@admin.test', name: 'Super Admin' },
    };

    render(
      <MemoryRouter initialEntries={['/platform']}>
        <Routes>
          <Route path="/platform/login" element={<div data-testid="platform-login">Login</div>} />
          <Route element={<PlatformProtectedRoute />}>
            <Route path="/platform" element={<div data-testid="protected">Portal</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('protected')).toBeTruthy();
    expect(screen.queryByTestId('platform-login')).toBeNull();
  });
});
