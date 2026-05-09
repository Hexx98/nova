import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

export function ProtectedRoute() {
  const { isAuthenticated, isInitializing } = useAuthStore()

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-nova-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-nova-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-nova-muted">Loading...</span>
        </div>
      </div>
    )
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
