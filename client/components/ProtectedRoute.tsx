import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthState } from '@/lib/hooks/useAuthState';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { hasAuthCookie, isAuthenticated, isLoading } = useAuthState();

  if (!hasAuthCookie) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
