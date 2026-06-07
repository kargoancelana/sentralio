/**
 * RoleGate — layout route guard that enforces role-based access.
 *
 * Renders <Outlet /> when the authenticated user's role is in `allow`.
 * Renders `fallback` (defaults to <Forbidden />) when the role is not
 * allowed — WITHOUT rendering the child page component, so no API requests
 * are issued for that route (Req 5.8).
 *
 * Requirements: 5.8
 */

import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from './matrix';
import { Forbidden } from '../pages/Forbidden';

interface RoleGateProps {
  /** Roles that are allowed to render the child routes. */
  allow: Role[];
  /** Optional custom fallback. Defaults to <Forbidden />. */
  fallback?: ReactNode;
}

/**
 * Use as a layout route to gate child routes by role:
 *
 *   <Route element={<RoleGate allow={['admin']} />}>
 *     <Route path="/admin-only" element={<AdminPage />} />
 *   </Route>
 */
export function RoleGate({ allow, fallback }: RoleGateProps) {
  const { state } = useAuth();

  if (state.status !== 'authenticated') {
    // Not authenticated — show nothing (ProtectedRoute handles the redirect).
    return fallback !== undefined ? <>{fallback}</> : null;
  }

  if (!allow.includes(state.user.role)) {
    // Role not permitted — render the forbidden view WITHOUT touching <Outlet />.
    return fallback !== undefined ? <>{fallback}</> : <Forbidden />;
  }

  return <Outlet />;
}
