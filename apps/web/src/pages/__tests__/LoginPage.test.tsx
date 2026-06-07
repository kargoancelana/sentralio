/**
 * Component tests for LoginPage.
 *
 * Requirements: 1.1, 1.2, 1.4, 1.8
 *
 * Test 1: Renders labeled email + masked password + submit (Req 1.1)
 * Test 2: Rapid double-submit fires exactly one POST /auth/login and disables the form (Req 1.2)
 * Test 3: On 401 failure shows "Email atau password salah" (Req 1.4)
 * Test 4: On success: reads stored redirect, applies safeRedirectPath, navigates (Req 1.8)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../Login'

// ─── Mock AuthContext ─────────────────────────────────────────────────────────

const mockLogin = vi.fn()

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    state: { status: 'anonymous' },
    login: mockLogin,
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
  })

  // ── Test 1 ──────────────────────────────────────────────────────────────────

  it('Test 1: renders labeled email input, masked password input, and submit button (Req 1.1)', () => {
    renderLoginPage()

    // Label "Email" is present
    expect(screen.getByLabelText('Email')).toBeTruthy()

    // Input associated with email label has type="email"
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement
    expect(emailInput.type).toBe('email')

    // Label "Password" is present
    expect(screen.getByLabelText('Password')).toBeTruthy()

    // Password input has type="password" (masked — NOT "text")
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement
    expect(passwordInput.type).toBe('password')

    // Submit button is present
    expect(screen.getByRole('button', { name: /masuk/i })).toBeTruthy()
  })

  // ── Test 2 ──────────────────────────────────────────────────────────────────

  it('Test 2: rapid double-submit fires exactly one login call and disables the form (Req 1.2)', async () => {
    // login resolves after a short delay to simulate an in-flight request
    mockLogin.mockImplementation(
      () => new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve({ ok: true }), 100)),
    )

    const user = userEvent.setup({ delay: null })
    renderLoginPage()

    const emailInput = screen.getByLabelText('Email')
    const passwordInput = screen.getByLabelText('Password')
    const submitButton = screen.getByRole('button', { name: /masuk/i })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'secret123')

    // First submit
    await user.click(submitButton)

    // Attempt a second submit immediately — form should be disabled
    await user.click(submitButton)

    // Wait for the delayed login to settle
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1)
    })

    // login was called exactly once despite two clicks
    expect(mockLogin).toHaveBeenCalledTimes(1)
    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'secret123')
  })

  it('Test 2b: submit button is disabled while login is in-flight (Req 1.2)', async () => {
    let resolveLogin!: (v: { ok: boolean }) => void
    mockLogin.mockImplementation(
      () => new Promise<{ ok: boolean }>((resolve) => { resolveLogin = resolve }),
    )

    const user = userEvent.setup({ delay: null })
    renderLoginPage()

    await user.type(screen.getByLabelText('Email'), 'a@b.com')
    await user.type(screen.getByLabelText('Password'), 'pass')

    await user.click(screen.getByRole('button', { name: /masuk/i }))

    // While login is pending the button should be disabled
    const btn = screen.getByRole('button', { name: /memproses/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)

    // Resolve the login promise
    resolveLogin({ ok: true })

    // After resolution the form re-enables
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /masuk/i })).toBeTruthy()
    })
  })

  // ── Test 3 ──────────────────────────────────────────────────────────────────

  it('Test 3: on 401/failure shows "Email atau password salah" and no navigation (Req 1.4)', async () => {
    mockLogin.mockResolvedValue({ ok: false, error: 'invalid_credentials' })

    const user = userEvent.setup({ delay: null })
    renderLoginPage()

    await user.type(screen.getByLabelText('Email'), 'wrong@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /masuk/i }))

    // Error message is shown
    await waitFor(() => {
      expect(screen.getByText('Email atau password salah')).toBeTruthy()
    })

    // No navigation occurred
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  // ── Test 4 ──────────────────────────────────────────────────────────────────

  it(
    'Test 4: on success reads stored redirect, applies safeRedirectPath, navigates and clears key (Req 1.8)',
    async () => {
      // Store a valid same-origin redirect path
      sessionStorage.setItem('wms.postLoginRedirect', '/pesanan/saya')
      mockLogin.mockResolvedValue({ ok: true })

      const user = userEvent.setup({ delay: null })
      renderLoginPage()

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /masuk/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/pesanan/saya', { replace: true })
      })

      // sessionStorage key was cleared
      expect(sessionStorage.getItem('wms.postLoginRedirect')).toBeNull()
    },
  )

  it(
    'Test 4b: on success with unsafe stored path falls back to "/" via safeRedirectPath (Req 1.8)',
    async () => {
      // Scheme-relative URL — must be sanitised to "/"
      sessionStorage.setItem('wms.postLoginRedirect', '//evil.example.com/steal')
      mockLogin.mockResolvedValue({ ok: true })

      const user = userEvent.setup({ delay: null })
      renderLoginPage()

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /masuk/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
      })

      expect(sessionStorage.getItem('wms.postLoginRedirect')).toBeNull()
    },
  )

  it(
    'Test 4c: on success with no stored redirect path navigates to "/" (Req 1.8)',
    async () => {
      // No item in sessionStorage
      mockLogin.mockResolvedValue({ ok: true })

      const user = userEvent.setup({ delay: null })
      renderLoginPage()

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /masuk/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
      })
    },
  )
})
