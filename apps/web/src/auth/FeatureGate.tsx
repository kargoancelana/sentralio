/**
 * FeatureGate — layout route guard that enforces feature-based access using the
 * user's effective (dynamic) feature set from the backend.
 *
 * Renders <Outlet /> when the authenticated user can access `feature`.
 * Otherwise renders `fallback` (defaults to <Forbidden />) WITHOUT rendering
 * the child page — so no API requests are issued for a denied route.
 *
 * This replaces static role checks for configurable features so that
 * admin-granted staff permissions take effect on the frontend too.
 */

import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccess, type Feature } from './matrix';
import { Forbidden } from '../pages/Forbidden';

interface FeatureGateProps {
  /** The feature required to access the child routes. */
  feature: Feature;
  /** Optional custom fallback. Defaults to <Forbidden />. */
  fallback?: ReactNode;
}

export function FeatureGate({ feature, fallback }: FeatureGateProps) {
  const { state } = useAuth();

  if (state.status !== 'authenticated') {
    return fallback !== undefined ? <>{fallback}</> : null;
  }

  if (!canAccess(state.user, feature)) {
    return fallback !== undefined ? <>{fallback}</> : <Forbidden />;
  }

  return <Outlet />;
}
