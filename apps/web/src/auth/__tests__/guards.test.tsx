/**
 * Component tests for ProtectedRoute and RoleGate guards.
 *
 * Requirements: 4.2, 5.8
 *
 * Test 1: Anonymous user redirected to /login with pathname+search preserved (Req 4.2)
 * Test 2: Staff user on Admin-only route sees "403 - Akses ditolak" — no API request (Req 5.8)
 * Test 3: Admin user on Admin-only route sees the content (Req 5.8)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom'
import { ProtectedRoute } from '../ProtectedRoute'
import { RoleGate } from '../RoleGate'
import type { AuthApi, AuthState } from '../../context/AuthContext'

// ─── Mock AuthContext ─────────────────────────────────────────────────────────

let mockAuthState: AuthState = { status: 'anonymous' }

vi.mock('../../context/AuthContext', () => ({
  useAuth: (): AuthApi => ({
    state: mockAuthState,
    login: vi.fn(),
    logout: vi.fn(),
    refreshMe: vi.fn(),
  }),
}))

// ─── Mock useNavigate ─────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Child component that renders visible text so we can assert it is shown. */
function AdminContent() {
  return <div data-testid="admin-content">Admin page content</div>
}

/** Child component that makes an "API call" on mount (for RoleGate no-request test). */
function ApiCallingChild({ onMount }: { onMount: () => void }) {
  // Simulate an API call side-effect on mount
  vi.spyOn(global, 'fetch').mockImplementation((..._args) => {
    onMount()
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
  })
  return <div data-testid="api-content">API child content</div>
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  // ── Test 1 ──────────────────────────────────────────────────────────────────

  it(
    'Test 1: anonymous user is redirected to /login and pathname+search are stored (Req 4.2)',
    () => {
      mockAuthState = { status: 'anonymous' }

      let capturedLocation: ReturnType<typeof import('react-router-dom').useLocation> | null = null

      function LocationCapture() {
        const { useLocation } = require('react-router-dom')
        capturedLocation = useLocation()
        return null
      }

      render(
        <MemoryRouter initialEntries={['/pesanan/saya?filter=unshipped']}>
          <Routes>
            {/* Login route — capture location to verify redirect */}
            <Route
              path="/login"
              element={
                <>
                  <div data-testid="login-page">Login Page</div>
                  <LocationCapture />
                </>
              }
            />
            {/* Protected route wrapping a child */}
            <Route
              element={
                <ProtectedRoute />
              }
            >
              <Route path="/pesanan/saya" element={<div>Protected Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      )

      // The login page should be rendered (redirect happened)
      expect(screen.getByTestId('login-page')).toBeTruthy()

      // sessionStorage should have the original path + query preserved
      expect(sessionStorage.getItem('wms.postLoginRedirect')).toBe(
        '/pesanan/saya?filter=unshipped',
      )
    },
  )

  it(
    'Test 1b: anonymous user with just pathname (no query string) stores only the pathname (Req 4.2)',
    () => {
      mockAuthState = { status: 'anonymous' }

      render(
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/orders" element={<div>Orders</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      )

      expect(screen.getByTestId('login-page')).toBeTruthy()
      expect(sessionStorage.getItem('wms.postLoginRedirect')).toBe('/orders')
    },
  )

  it('Test 1c: loading state renders nothing (does not redirect) (Req 4.2)', () => {
    mockAuthState = { status: 'loading' }

    const { container } = render(
      <MemoryRouter initialEntries={['/orders']}>
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/orders" element={<div data-testid="protected">Orders</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    // Nothing rendered and no redirect
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('login-page')).toBeNull()
    expect(sessionStorage.getItem('wms.postLoginRedirect')).toBeNull()
  })
})

describe('RoleGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  // ── Test 2 ──────────────────────────────────────────────────────────────────

  it(
    'Test 2: Staff user on Admin-only route sees "403 - Akses ditolak" and no API request is made (Req 5.8)',
    () => {
      mockAuthState = {
        status: 'authenticated',
        user: { id: 2, email: 'staff@example.com', name: 'Staff User', role: 'staff' },
      }

      const apiCallMock = vi.fn()

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route element={<RoleGate allow={['admin']} />}>
              <Route
                path="/admin"
                element={<ApiCallingChild onMount={apiCallMock} />}
              />
            </Route>
          </Routes>
        </MemoryRouter>,
      )

      // "403 - Akses ditolak" view is rendered
      expect(screen.getByText('403 - Akses ditolak')).toBeTruthy()

      // The child component (which would trigger the API call) is NOT rendered
      expect(screen.queryByTestId('api-content')).toBeNull()

      // The mock API function was not called
      expect(apiCallMock).not.toHaveBeenCalled()
    },
  )

  // ── Test 3 ──────────────────────────────────────────────────────────────────

  it(
    'Test 3: Admin user on Admin-only route sees the content (Req 5.8)',
    () => {
      mockAuthState = {
        status: 'authenticated',
        user: { id: 1, email: 'admin@example.com', name: 'Admin User', role: 'admin' },
      }

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route element={<RoleGate allow={['admin']} />}>
              <Route path="/admin" element={<AdminContent />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      )

      // The child content is rendered for admin
      expect(screen.getByTestId('admin-content')).toBeTruthy()
      expect(screen.getByText('Admin page content')).toBeTruthy()

      // The 403 view is NOT rendered
      expect(screen.queryByText('403 - Akses ditolak')).toBeNull()
    },
  )

  it(
    'Test 3b: Staff user on Staff-allowed route sees the content (Req 5.8)',
    () => {
      mockAuthState = {
        status: 'authenticated',
        user: { id: 2, email: 'staff@example.com', name: 'Staff User', role: 'staff' },
      }

      render(
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route element={<RoleGate allow={['admin', 'staff']} />}>
              <Route path="/orders" element={<div data-testid="orders-content">Orders Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      )

      expect(screen.getByTestId('orders-content')).toBeTruthy()
      expect(screen.queryByText('403 - Akses ditolak')).toBeNull()
    },
  )

  it(
    'Test 3c: unauthenticated user on RoleGate route renders fallback (not Outlet) (Req 5.8)',
    () => {
      mockAuthState = { status: 'anonymous' }

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route element={<RoleGate allow={['admin']} />}>
              <Route path="/admin" element={<AdminContent />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      )

      // Admin content not shown
      expect(screen.queryByTestId('admin-content')).toBeNull()
    },
  )
})
