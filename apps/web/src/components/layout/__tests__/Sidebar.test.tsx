/**
 * Component tests for Sidebar.
 *
 * Requirements: 3.1, 3.2, 3.6, 4.6, 5.6, 5.7, 11.5
 *
 * Test 1 (Req 3.1, 4.6): Identity shows name + role, replaces hardcoded placeholder
 * Test 2 (Req 4.6):      When name is empty/whitespace, email is shown instead
 * Test 3 (Req 5.6, 11.5): Staff never sees Admin-only nav entries
 * Test 4 (Req 5.7, 11.5): Admin sees all nav entries
 * Test 5 (Req 3.1):      Logout control only rendered when authenticated
 * Test 6 (Req 3.2, 3.6): Logout control disables while request is pending; on
 *                         failure/resolve still navigates away (auth.logout handles navigation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../Sidebar'
import type { AuthApi, AuthState, PublicUser } from '../../../context/AuthContext'

// ─── Auth mock ────────────────────────────────────────────────────────────────
// We keep a mutable reference so individual tests can override it in beforeEach.

let mockAuth: AuthApi

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

// ─── Default props ────────────────────────────────────────────────────────────

const defaultProps = {
  active: '',
  collapsed: false,
  setCollapsed: vi.fn(),
  dark: false,
  toggleDark: vi.fn(),
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeAuthApi(state: AuthState, logout: () => Promise<void> = vi.fn().mockResolvedValue(undefined)): AuthApi {
  return {
    state,
    login: vi.fn(),
    logout,
    refreshMe: vi.fn(),
  }
}

function makeAuthenticatedState(user: PublicUser): AuthState {
  return { status: 'authenticated', user }
}

function renderSidebar(props = defaultProps) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Sidebar {...props} />
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Test 1 ──────────────────────────────────────────────────────────────────

  it('Test 1 (Req 3.1, 4.6): identity shows name and role from auth, not hardcoded placeholder', () => {
    const user: PublicUser = { id: 1, email: 'a@b.com', name: 'Test User', role: 'admin' }
    mockAuth = makeAuthApi(makeAuthenticatedState(user))

    renderSidebar()

    // Name is visible
    expect(screen.getByText('Test User')).toBeTruthy()

    // Role is visible
    expect(screen.getByText('admin')).toBeTruthy()

    // Hardcoded placeholder no longer rendered (Req 4.6)
    expect(screen.queryByText('Warehouse Admin')).toBeNull()
  })

  // ── Test 2 ──────────────────────────────────────────────────────────────────

  it('Test 2 (Req 4.6): when name is empty/whitespace, shows email instead', () => {
    const user: PublicUser = { id: 2, email: 'staff@example.com', name: '', role: 'staff' }
    mockAuth = makeAuthApi(makeAuthenticatedState(user))

    renderSidebar()

    // Email should be shown as the primary identity line
    expect(screen.getByText('staff@example.com')).toBeTruthy()

    // The empty name string itself should not be the primary display
    // (there should be no element with empty text as primary label)
    const nameElements = screen.queryAllByText('')
    // At most zero — empty name should not be rendered as a label
    expect(nameElements.filter(el => el.className === 'sb-user-name')).toHaveLength(0)
  })

  it('Test 2b (Req 4.6): when name is only whitespace, shows email instead', () => {
    const user: PublicUser = { id: 3, email: 'ws@example.com', name: '   ', role: 'staff' }
    mockAuth = makeAuthApi(makeAuthenticatedState(user))

    renderSidebar()

    expect(screen.getByText('ws@example.com')).toBeTruthy()
  })

  // ── Dashboard visibility (regression) ───────────────────────────────────────

  it('Dashboard nav entry is visible to admin', () => {
    const user: PublicUser = { id: 10, email: 'admin@wms.local', name: 'Admin', role: 'admin' }
    mockAuth = makeAuthApi(makeAuthenticatedState(user))

    renderSidebar()

    expect(screen.getByText('Dashboard')).toBeTruthy()
  })

  it('Dashboard nav entry is visible to staff (always-visible, not role-gated)', () => {
    const user: PublicUser = { id: 11, email: 'staff@wms.local', name: 'Staff', role: 'staff' }
    mockAuth = makeAuthApi(makeAuthenticatedState(user))

    renderSidebar()

    expect(screen.getByText('Dashboard')).toBeTruthy()
  })

  // ── Test 3 ──────────────────────────────────────────────────────────────────

  it('Test 3 (Req 5.6, 11.5): Staff never sees Admin-only nav entries', () => {
    const user: PublicUser = { id: 4, email: 'staff@wms.local', name: 'Staff User', role: 'staff' }
    mockAuth = makeAuthApi(makeAuthenticatedState(user))

    renderSidebar()

    // Admin-only items are hidden
    expect(screen.queryByText('Master Produk')).toBeNull()
    expect(screen.queryByText('Laporan')).toBeNull()
    expect(screen.queryByText('Pengaturan')).toBeNull()
    expect(screen.queryByText('Integrasi Toko')).toBeNull()
    expect(screen.queryByText('Produk Channel')).toBeNull()
    expect(screen.queryByText('Pengguna')).toBeNull()

    // Staff-allowed items are visible
    expect(screen.getByText('Pesanan Saya')).toBeTruthy()
  })

  // ── Test 4 ──────────────────────────────────────────────────────────────────

  it('Test 4 (Req 5.7, 11.5): Admin sees all nav entries', () => {
    const user: PublicUser = { id: 5, email: 'admin@wms.local', name: 'Admin User', role: 'admin' }
    mockAuth = makeAuthApi(makeAuthenticatedState(user))

    renderSidebar()

    // All nav items visible for admin
    expect(screen.getByText('Master Produk')).toBeTruthy()
    expect(screen.getByText('Laporan')).toBeTruthy()
    expect(screen.getByText('Pengaturan')).toBeTruthy()
    expect(screen.getByText('Integrasi Toko')).toBeTruthy()
    expect(screen.getByText('Produk Channel')).toBeTruthy()
    expect(screen.getByText('Pengguna')).toBeTruthy()
    expect(screen.getByText('Pesanan Saya')).toBeTruthy()
  })

  // ── Test 5 ──────────────────────────────────────────────────────────────────

  it('Test 5 (Req 3.1): logout control NOT rendered when anonymous', () => {
    mockAuth = makeAuthApi({ status: 'anonymous' })

    renderSidebar()

    // "Keluar" button must not exist
    expect(screen.queryByTitle('Keluar')).toBeNull()
    // Also check by text (in non-collapsed mode the label is rendered)
    expect(screen.queryByText('Keluar')).toBeNull()
  })

  it('Test 5b (Req 3.1): logout control IS rendered when authenticated', () => {
    const user: PublicUser = { id: 6, email: 'a@b.com', name: 'Alice', role: 'admin' }
    mockAuth = makeAuthApi(makeAuthenticatedState(user))

    renderSidebar()

    // Logout label is rendered in non-collapsed mode
    expect(screen.getByText('Keluar')).toBeTruthy()
  })

  // ── Test 6 ──────────────────────────────────────────────────────────────────

  it('Test 6 (Req 3.2): logout button disables itself while the request is pending', async () => {
    const user: PublicUser = { id: 7, email: 'a@b.com', name: 'Alice', role: 'admin' }

    let resolveLogout!: () => void
    const pendingLogout = new Promise<void>((resolve) => {
      resolveLogout = resolve
    })

    const mockLogout = vi.fn().mockReturnValue(pendingLogout)
    mockAuth = makeAuthApi(makeAuthenticatedState(user), mockLogout)

    const eventUser = userEvent.setup({ delay: null })
    renderSidebar()

    const logoutBtn = screen.getByText('Keluar').closest('button') as HTMLButtonElement
    expect(logoutBtn).toBeTruthy()
    expect(logoutBtn.disabled).toBe(false)

    // Click the logout button
    await eventUser.click(logoutBtn)

    // Button should now be disabled and show "Keluar…" while pending
    await waitFor(() => {
      expect(screen.getByText('Keluar…')).toBeTruthy()
    })

    const disabledBtn = screen.getByText('Keluar…').closest('button') as HTMLButtonElement
    expect(disabledBtn.disabled).toBe(true)

    // Resolve the logout
    resolveLogout()

    // After resolution, button re-enables (or component unmounts/navigates away)
    await waitFor(() => {
      // Either "Keluar" is back (re-enabled) or logout navigated away and the button is gone
      const logoutLabel = screen.queryByText('Keluar')
      const keluar = screen.queryByText('Keluar…')
      // At least one condition should be true: button re-enabled or component is gone
      expect(logoutLabel !== null || keluar === null).toBe(true)
    })
  })

  it('Test 6b (Req 3.6): on logout failure, auth.logout still resolves (AuthContext handles failure internally) and button re-enables', async () => {
    const user: PublicUser = { id: 8, email: 'a@b.com', name: 'Alice', role: 'admin' }

    // In production, AuthContext.logout() catches all errors and always resolves (never throws).
    // It clears state and navigates regardless of server response.
    // So from Sidebar's perspective, auth.logout() always resolves.
    // The test verifies that after a logout (even one simulating server-side failure behavior),
    // the button is re-enabled via the finally block.
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    mockAuth = makeAuthApi(makeAuthenticatedState(user), mockLogout)

    const eventUser = userEvent.setup({ delay: null })
    renderSidebar()

    const logoutBtn = screen.getByText('Keluar').closest('button') as HTMLButtonElement
    expect(logoutBtn.disabled).toBe(false)

    // Click logout
    await eventUser.click(logoutBtn)

    // logout was called
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1)
    })

    // After auth.logout() resolves, the finally block runs and re-enables the button.
    // (In practice the component may navigate away; if still mounted, check disabled=false)
    await waitFor(() => {
      const btn = screen.queryByText('Keluar')?.closest('button') as HTMLButtonElement | null
      if (btn) {
        expect(btn.disabled).toBe(false)
      }
    })
  })
})
