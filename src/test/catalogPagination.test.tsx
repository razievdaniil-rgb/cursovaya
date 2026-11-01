import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { CatalogPage } from '../pages/CatalogPage'
import { apiClient } from '../api/client'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('uses URL pagination, server totals, and resets the page for changed filters and size', async () => {
  const getPage = vi.spyOn(apiClient, 'getCatalogPage').mockImplementation(async (query) => ({
    items: [], page: query?.page ?? 1, limit: query?.limit ?? 20, total: 1864, totalPages: 187,
  }))
  vi.spyOn(apiClient, 'getCatalogFilters').mockResolvedValue({ totalProducts: 1864 } as Awaited<ReturnType<typeof apiClient.getCatalogFilters>>)
  const legacy = vi.spyOn(apiClient, 'getCatalog')
  const router = createMemoryRouter([{ path: '/catalog', element: <CatalogPage /> }], { initialEntries: ['/catalog?page=3&limit=10&country=Россия'] })
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>)
  await screen.findByText('Найдено 1864 изделий')
  expect(getPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, limit: 10, countries: ['Россия'] }))
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
  await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('page')).toBe('4'))
  expect(new URLSearchParams(router.state.location.search).get('country')).toBe('Россия')
  fireEvent.change(screen.getByLabelText('Сортировка'), { target: { value: 'price-asc' } })
  await waitFor(() => expect(getPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, sort: 'price-asc' })))
  fireEvent.change(screen.getByLabelText('Изделий на странице'), { target: { value: '50' } })
  await waitFor(() => expect(getPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 50 })))
  expect(legacy).not.toHaveBeenCalled()
})

it('normalizes invalid URL pagination without requesting unbounded records', async () => {
  const getPage = vi.spyOn(apiClient, 'getCatalogPage').mockResolvedValue({ items: [], page: 1, limit: 100, total: 0, totalPages: 1 })
  vi.spyOn(apiClient, 'getCatalogFilters').mockResolvedValue({ totalProducts: 0 } as Awaited<ReturnType<typeof apiClient.getCatalogFilters>>)
  const router = createMemoryRouter([{ path: '/catalog', element: <CatalogPage /> }], { initialEntries: ['/catalog?page=-2&limit=1000'] })
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>)
  await waitFor(() => expect(router.state.location.search).toBe('?page=1&limit=100'))
  expect(getPage).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 100 }))
  expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()
})
