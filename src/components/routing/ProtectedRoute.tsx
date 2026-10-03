import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function ProtectedRoute() {
  const { loading } = useAuth();

  if (loading) {
    return <div className="min-h-[40vh] flex items-center justify-center text-sm text-slate-500" role="status">Memuat sesi...</div>;
  }

  return <Outlet />;
}

export function RoleRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, isAdmin } = useAuth();

  if (loading) {
    return <div className="min-h-[40vh] flex items-center justify-center text-sm text-slate-500" role="status">Memuat sesi...</div>;
  }

  if (!currentUser || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
