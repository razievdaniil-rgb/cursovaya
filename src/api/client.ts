import type { ApiClient } from '../types'
import { createHttpApi } from './httpApi'
import { mockApi } from './mockApi'

/**
 * Выбор реализации ApiClient (ADR 0007).
 *
 * HTTP-адаптер включается, только если задан `VITE_API_URL` и
 * `VITE_USE_MOCK_API` не равен `'true'`. Workflow `deploy-pages.yml` ни одной
 * из этих переменных не задаёт, поэтому демо на GitHub Pages собирается с
 * mock-адаптером и продолжает работать без backend.
 *
 * Страницы импортируют только `apiClient` и не знают, какая реализация
 * активна; отличить их можно по полю `mode`, если это нужно интерфейсу.
 */

const apiUrl = import.meta.env.VITE_API_URL as string | undefined
const forceMock = import.meta.env.VITE_USE_MOCK_API === 'true'

export const apiClient: ApiClient =
  apiUrl && !forceMock ? createHttpApi(apiUrl) : mockApi

/** Работает ли приложение на демонстрационных данных. */
export const isMockMode = apiClient.mode === 'mock'
