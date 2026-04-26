import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentUser } from '../context/UserContext';

export default function ProtectedRoute() {
  const { currentUser } = useCurrentUser();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Outlet />;
}
