import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import type { UserRole } from '../../types'

export function ProtectedRoute({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const session = useAppStore((s) => s.session)
  const location = useLocation()
  if (!session) return <Navigate to="/auth/login" replace state={{ from: location.pathname }}/>
  if (!roles.includes(session.role)) return <Navigate to={session.role === 'government' ? '/government/analytics' : session.role === 'organization' ? '/organization' : '/catalog'} replace/>
  return children
}
