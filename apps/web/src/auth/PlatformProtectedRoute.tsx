/**
 * PlatformProtectedRoute - guard untuk route portal Super Admin.
 *
 * Cermin ProtectedRoute tenant tapi untuk sesi platform:
 *  - loading       -> render null
 *  - anonymous     -> simpan path tujuan di sessionStorage, redirect ke
 *                     /platform/login
 *  - authenticated -> render <Outlet/>
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { usePlatformAuth } from '../context/PlatformAuthContext';

/** Key sessionStorage untuk target redirect setelah login (portal platform). */
export const PLATFORM_REDIRECT_KEY = 'platform.postLoginRedirect';

export function PlatformProtectedRoute() {
  const { state } = usePlatformAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return null;
  }

  if (state.status === 'anonymous') {
    const target = `${location.pathname}${location.search}`;
    sessionStorage.setItem(PLATFORM_REDIRECT_KEY, target);
    return <Navigate to="/platform/login" replace />;
  }

  return <Outlet />;
}
