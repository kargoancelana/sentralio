/**
 * Component tests for AuthContext session expiry behaviour.
 *
 * Requirements: 4.7, 10.2
 *
 * Test 1: GET /auth/me non-2xx → state is anonymous
 * Test 2: GET /auth/me 200     → state is authenticated with user data
 * Test 3: wms.session-expired event → clears user within 1s and navigates to /login
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '../AuthContext'

// ─── Mock the fetchApi module ─────────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
  fetchApi: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
      this.name = 'ApiError'
    }
  },
}))

// Import after vi.mock so we get the mocked version
import { fetchApi } from '../../lib/api'
const mockFetchApi = fetchApi as ReturnType<typeof vi.fn>

// ─── Mock useNavigate ─────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ─── Helper consumer components ───────────────────────────────────────────────

/** Renders the current auth status as text so assertions can query it. */
function AuthStatusDisplay() {
  const { state } = useAuth()
  if (state.status === 'loading') return <div data-testid="status">loading</div>
  if (state.status === 'anonymous') return <div data-testid="status">anonymous</div>
  return (
    <div data-testid="status">
      authenticated:{state.user.id}:{state.user.email}:{state.user.role}
    </div>
  )
}

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      {ui}
    </MemoryRouter>,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Test 1 ──────────────────────────────────────────────────────────────────

  it('Test 1: GET /auth/me returning a non-2xx error → state is anonymous (Req 4.7)', async () => {
    // Simulate a network/server error so /auth/me rejects
    mockFetchApi.mockRejectedValueOnce(new Error('Network error'))

    renderWithRouter(
      <AuthProvider>
        <AuthStatusDisplay />
      </AuthProvider>,
    )

    // Initial state is loading
    expect(screen.getByTestId('status').textContent).toBe('loading')

    // After the rejected /auth/me resolves, state should become anonymous
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    })
  })

  // ── Test 2 ──────────────────────────────────────────────────────────────────

  it('Test 2: GET /auth/me returning 200 with user data → state is authenticated (Req 4.7)', async () => {
    const user = { id: 1, email: 'a@b.com', name: 'Test', role: 'admin' as const }
    mockFetchApi.mockResolvedValueOnce(user)

    renderWithRouter(
      <AuthProvider>
        <AuthStatusDisplay />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe(
        `authenticated:${user.id}:${user.email}:${user.role}`,
      )
    })
  })

  // ── Test 3 ──────────────────────────────────────────────────────────────────

  it(
    'Test 3: wms.session-expired event → clears user within 1s and navigates to /login (Req 10.2)',
    async () => {
      const user = { id: 1, email: 'a@b.com', name: 'Test', role: 'admin' as const }
      // First call: /auth/me succeeds → authenticated state
      mockFetchApi.mockResolvedValueOnce(user)

      renderWithRouter(
        <AuthProvider>
          <AuthStatusDisplay />
        </AuthProvider>,
      )

      // Wait for the /auth/me to resolve with real timers so the promise settles naturally
      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toContain('authenticated')
      })

      // Now switch to fake timers to control the 1s timeout
      vi.useFakeTimers()

      // Dispatch the session-expired event (mimics a 401 from a non-auth endpoint)
      act(() => {
        window.dispatchEvent(new CustomEvent('wms.session-expired'))
      })

      // State should still be authenticated immediately (the 1s timeout has not elapsed)
      expect(screen.getByTestId('status').textContent).toContain('authenticated')

      // Advance past the 1-second timeout — this fires the setTimeout callback
      act(() => {
        vi.advanceTimersByTime(1001)
      })

      // Now state must be anonymous (user cleared within 1 second — Req 10.2)
      expect(screen.getByTestId('status').textContent).toBe('anonymous')

      // And navigate('/login') must have been called (Req 4.5, 10.2)
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    },
  )
})
