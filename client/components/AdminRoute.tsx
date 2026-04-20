import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated, isAdmin } from '@/lib/auth';

interface AdminRouteProps {
  children: ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
