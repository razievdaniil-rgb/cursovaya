import { describe, expect, it } from 'vitest'
import { mockApi } from '../api/mockApi'

describe('mockApi catalog', () => {
  it('paginates after filtering and sorting while preserving the array API', async () => {
    const query = { countries: ['Россия'], sort: 'price-asc' as const }
    const all = await mockApi.getCatalog(query)
    const page = await mockApi.getCatalogPage({ ...query, page: 2, limit: 1 })
    expect(page).toEqual({ items: all.slice(1, 2), page: 2, limit: 1, total: all.length, totalPages: Math.max(1, all.length) })
    await expect(mockApi.getCatalogPage({ state: 'empty' })).resolves.toMatchObject({ items: [], total: 0, totalPages: 1 })
    await expect(mockApi.getCatalogPage({ state: 'error' })).rejects.toThrow('Не удалось получить данные каталога')
  })

  it('filters products by search and country', async () => {
    const result = await mockApi.getCatalog({ search: 'монитор', countries: ['Россия'] })
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((item) => item.manufacturer.country === 'Россия')).toBe(true)
  })

  it('returns an empty state on request', async () => {
    await expect(mockApi.getCatalog({ state: 'empty' })).resolves.toEqual([])
  })

  it('returns an error state on request', async () => {
    await expect(mockApi.getCatalog({ state: 'error' })).rejects.toThrow('Не удалось получить данные каталога')
  })
})
