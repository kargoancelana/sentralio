/**
 * SubscriptionGate — redirect user authenticated yang langganannya BELUM aktif
 * ke /langganan. Dipasang DI DALAM ProtectedRoute, membungkus Layout app.
 * Halaman /langganan sendiri TIDAK dibungkus gate ini (hindari infinite redirect).
 *
 * subscriptionActive === false  -> redirect /langganan
 * null (belum tahu) / true       -> render app seperti biasa
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function SubscriptionGate() {
  const { subscriptionActive } = useAuth();
  if (subscriptionActive === false) {
    return <Navigate to="/langganan" replace />;
  }
  return <Outlet />;
}
