import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ProductPage } from '../pages/ProductPage'
import { ComparePage } from '../pages/ComparePage'
import { products } from '../data/mockData'
import { useAppStore } from '../store/appStore'
import type { Product } from '../types'

vi.mock('../api/client', () => ({ apiClient: { mode: 'mock', getProduct: vi.fn(), getProductReviews: vi.fn(), getProductAnalogues: vi.fn(),
  getComparisonCollections: vi.fn(), getSavedCollections: vi.fn(), getComparisonProducts: vi.fn(), getSavedProducts: vi.fn(),
  setProductCompared: vi.fn(), setProductSaved: vi.fn() } }))
import { apiClient } from '../api/client'
afterEach(() => { cleanup(); Object.defineProperty(apiClient, 'mode', { value: 'mock', configurable: true }) })
it('compares the union of actual characteristics, missing values and actual registry statuses', async () => {
  useAppStore.getState().resetDemo()
  useAppStore.setState({ compareIds: ['a', 'b'] })
  vi.mocked(apiClient.getProduct).mockImplementation(async (id): Promise<Product> => ({
    ...products[0], id, shortName: id,
    registryStatus: id === 'a' ? 'suspended' : 'cancelled',
    specs: id === 'a' ? { 'Мощность лазера': '12 Вт' } : { 'Время стерилизации': '8 мин' },
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><ComparePage/></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByText('Мощность лазера')).toBeInTheDocument()
  expect(screen.getByText('Время стерилизации')).toBeInTheDocument()
  expect(screen.getByText('12 Вт')).toBeInTheDocument()
  expect(screen.getByText('8 мин')).toBeInTheDocument()
  expect(screen.getAllByText('—')).toHaveLength(2)
  expect(screen.queryByText('Каналы ЭКГ')).not.toBeInTheDocument()
  expect(screen.getByText('Приостановлено')).toBeInTheDocument()
  expect(screen.getByText('Отменено')).toBeInTheDocument()
})


it('keeps the comparison selector available for empty collections and loads the chosen collection', async () => {
  Object.defineProperty(apiClient, 'mode', { value: 'http', configurable: true })
  useAppStore.getState().resetDemo()
  useAppStore.getState().setSession({ email: 'ui@test.ru', role: 'user', displayName: 'Test', verified: true })
  vi.mocked(apiClient.getComparisonCollections).mockResolvedValue([{ id: 'empty', name: 'Пустой' }, { id: 'full', name: 'Заполненный' }])
  vi.mocked(apiClient.getComparisonProducts).mockImplementation(async (id) => id === 'full' ? ['a'] : [])
  vi.mocked(apiClient.getProduct).mockResolvedValue({ ...products[0], id: 'a', shortName: 'Выбранное изделие' })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><ComparePage/></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByText('Список сравнения пуст')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Список сравнения' }), { target: { value: 'full' } })
  expect(await screen.findByText('Выбранное изделие')).toBeInTheDocument()
  expect(apiClient.getComparisonProducts).toHaveBeenCalledWith('full')
})

it('uses the saved collection chosen on ProductPage for a save action', async () => {
  Object.defineProperty(apiClient, 'mode', { value: 'http', configurable: true })
  useAppStore.getState().resetDemo()
  useAppStore.getState().setSession({ email: 'save-ui@test.ru', role: 'user', displayName: 'Test', verified: true })
  vi.mocked(apiClient.getComparisonCollections).mockResolvedValue([])
  vi.mocked(apiClient.getComparisonProducts).mockResolvedValue([])
  vi.mocked(apiClient.getSavedCollections).mockResolvedValue([{ id: 'first', name: 'Первый' }, { id: 'chosen', name: 'Нужный' }])
  vi.mocked(apiClient.getSavedProducts).mockResolvedValue([])
  vi.mocked(apiClient.setProductSaved).mockResolvedValue(['mp-12'])
  vi.mocked(apiClient.getProduct).mockResolvedValue({ ...products[0], id: 'mp-12' })
  vi.mocked(apiClient.getProductReviews).mockResolvedValue([])
  vi.mocked(apiClient.getProductAnalogues).mockResolvedValue([])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><ProductPage/></MemoryRouter></QueryClientProvider>)
  const selector = await screen.findByRole('combobox', { name: 'Сохранить в список' })
  await waitFor(() => expect(selector).not.toBeDisabled())
  fireEvent.change(selector, { target: { value: 'chosen' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
  await waitFor(() => expect(apiClient.setProductSaved).toHaveBeenCalledWith('mp-12', true, 'chosen'))
})


