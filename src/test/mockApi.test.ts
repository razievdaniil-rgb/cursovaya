import { describe, expect, it } from 'vitest'
import { mockApi } from '../api/mockApi'

describe('mockApi catalog', () => {
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
