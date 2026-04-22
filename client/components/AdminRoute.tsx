import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthState } from '@/lib/hooks/useAuthState';

interface AdminRouteProps {
  children: ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { hasAuthCookie, isAuthenticated, isAdmin, isLoading } = useAuthState();

  if (!hasAuthCookie) {
    return <Navigate to="/login" replace />;
  }
  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
