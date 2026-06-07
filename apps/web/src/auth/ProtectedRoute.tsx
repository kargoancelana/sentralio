/**
 * ProtectedRoute — redirects anonymous visitors to /login.
 *
 * When the auth state is `anonymous`, stores the originally-requested
 * `pathname + search` in sessionStorage under key `wms.postLoginRedirect`
 * so the Login page can restore it after a successful sign-in (Req 4.2).
 *
 * Requirements: 4.1, 4.2
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SESSION_KEY = 'wms.postLoginRedirect';

/**
 * Wrap app routes in this component to require authentication.
 *
 * Usage (layout route pattern):
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/" element={<Home />} />
 *   </Route>
 */
export function ProtectedRoute() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    // Do not redirect while we are still resolving the session.
    return null;
  }

  if (state.status === 'anonymous') {
    // Persist the originally-requested path+query for post-login redirect (Req 4.2).
    const redirectTarget = location.pathname + location.search;
    sessionStorage.setItem(SESSION_KEY, redirectTarget);
    return <Navigate to="/login" replace />;
  }

  // state.status === 'authenticated'
  return <Outlet />;
}
