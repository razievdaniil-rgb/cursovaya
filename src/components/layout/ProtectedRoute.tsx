import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import type { UserRole } from '../../types'
import { Spinner } from '../ui/UI'

export function ProtectedRoute({
  roles,
  children,
  ready = true,
}: {
  roles: UserRole[]
  children: ReactNode
  /**
   * Завершена ли проверка сессии через `/auth/me`. Пока она идёт, решение о
   * доступе не принимается: иначе обновление страницы в кабинете
   * выбрасывало бы вошедшего пользователя на страницу входа.
   */
  ready?: boolean
}) {
  const session = useAppStore((s) => s.session)
  const location = useLocation()
  if (!ready) return <div style={{ padding: 64 }}><Spinner/></div>
  if (!session) return <Navigate to="/auth/login" replace state={{ from: location.pathname }}/>
  // Роль пользователя может быть не одна: доступ есть, если подходит любая.
  const granted = session.roles?.length
    ? session.roles.some((role) => roles.includes(role))
    : roles.includes(session.role)
  if (!granted) return <Navigate to={session.role === 'government' ? '/government/analytics' : session.role === 'organization' ? '/organization' : '/catalog'} replace/>
  return children
}
