import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useAppStore } from '../store/appStore'
import { apiClient } from './client'

/**
 * Восстановление сессии при загрузке приложения.
 *
 * Сессия больше не считается достоверной только потому, что она лежала в
 * localStorage: HTTP-адаптер спрашивает `/auth/me` по refresh-cookie и
 * устанавливает либо сбрасывает пользователя по ответу сервера. В
 * демонстрационном режиме запрос возвращает сессию из памяти страницы, то
 * есть вход после перезагрузки просто теряется.
 *
 * Возвращает `true`, когда проверка завершена: до этого защищённые маршруты
 * не должны принимать решение о доступе, иначе вошедшего пользователя
 * выбросило бы на страницу входа при каждом обновлении страницы.
 */
export function useSessionBootstrap(): boolean {
  const queryClient = useQueryClient()
  const setSession = useAppStore((state) => state.setSession)
  const [ready, setReady] = useState(false)

  useEffect(() => useAppStore.subscribe((state, previous) => {
    if (state.sessionRevision === previous.sessionRevision) return
    void queryClient.cancelQueries({ queryKey: ['product-selections'] })
    queryClient.removeQueries({ queryKey: ['product-selections'] })
    queryClient.removeQueries({ queryKey: ['organization'] })
  }), [queryClient])

  useEffect(() => {
    let cancelled = false
    const revision = useAppStore.getState().sessionRevision

    void (async () => {
      try {
        const session = await apiClient.getSession()
        if (!cancelled && useAppStore.getState().sessionRevision === revision) setSession(session)
      } catch {
        // Недоступный API не должен мешать работе публичных разделов.
        if (!cancelled && useAppStore.getState().sessionRevision === revision) setSession(null)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [setSession])

  return ready
}
