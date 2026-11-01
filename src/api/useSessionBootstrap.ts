import { useEffect, useState } from 'react'

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
  const setSession = useAppStore((state) => state.setSession)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const session = await apiClient.getSession()
        if (!cancelled) setSession(session)
      } catch {
        // Недоступный API не должен мешать работе публичных разделов.
        if (!cancelled) setSession(null)
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
