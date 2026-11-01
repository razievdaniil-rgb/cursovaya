import { act, renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { apiClient } from './client'
import { useProductSelections } from './useProductSelections'
import { useAppStore } from '../store/appStore'

vi.mock('./client', () => ({ apiClient: {
  mode: 'http', getSavedProducts: vi.fn(), setProductSaved: vi.fn(),
  getComparisonProducts: vi.fn(), setProductCompared: vi.fn(),
  getComparisonCollections: vi.fn(), getSavedCollections: vi.fn(),
} }))
const session = (email: string) => ({ email, role: 'user' as const, displayName: email, verified: true })
function setup(kind: 'saved' | 'comparison' = 'comparison') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => useProductSelections(kind), { wrapper }), client }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(apiClient.getComparisonCollections).mockResolvedValue([])
  vi.mocked(apiClient.getSavedCollections).mockResolvedValue([])
  useAppStore.getState().resetDemo()
  useAppStore.getState().setSession(session('a@test.ru'))
  vi.mocked(apiClient.getComparisonProducts).mockResolvedValue(['one'])
  vi.mocked(apiClient.getSavedProducts).mockResolvedValue(['one'])
})
afterEach(cleanup)
describe('server product selections', () => {
  it('loads server selection, removes through API and invalidates dependent queries', async () => {
    vi.mocked(apiClient.setProductSaved).mockResolvedValue([])
    const { result, client } = setup('saved')
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await waitFor(() => expect(result.current.ids).toEqual(['one']))
    vi.mocked(apiClient.getSavedProducts).mockResolvedValueOnce(['one']).mockResolvedValue([])
    await act(() => result.current.change('one', false))
    expect(apiClient.setProductSaved).toHaveBeenCalledWith('one', false, undefined)
    await waitFor(() => expect(result.current.ids).toEqual([]))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['organization'] })
  })
  it('preserves server selection and exposes a mutation failure', async () => {
    vi.mocked(apiClient.setProductCompared).mockRejectedValue(new Error('Сервер недоступен'))
    const { result } = setup()
    await waitFor(() => expect(result.current.ids).toEqual(['one']))
    await act(() => result.current.change('two'))
    expect(result.current.ids).toEqual(['one'])
    expect(result.current.message).toBe('Сервер недоступен')
  })
  it('limits additions to three while allowing removal', async () => {
    vi.mocked(apiClient.getComparisonProducts).mockResolvedValue(['one', 'two', 'three'])
    vi.mocked(apiClient.setProductCompared).mockResolvedValue(['two', 'three'])
    const { result } = setup()
    await waitFor(() => expect(result.current.ids).toHaveLength(3))
    await act(() => result.current.change('four'))
    expect(result.current.message).toContain('не более трёх')
    expect(apiClient.setProductCompared).not.toHaveBeenCalled()
    await act(() => result.current.change('one', false))
    expect(apiClient.setProductCompared).toHaveBeenCalledWith('one', false, undefined)
  })
  it('ignores a mutation that completes after switching accounts', async () => {
    let finish!: (ids: string[]) => void
    vi.mocked(apiClient.setProductCompared).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { result } = setup()
    await waitFor(() => expect(result.current.ids).toEqual(['one']))
    let pending!: Promise<void>
    act(() => { pending = result.current.change('two') })
    await waitFor(() => expect(apiClient.setProductCompared).toHaveBeenCalled())
    vi.mocked(apiClient.getComparisonProducts).mockResolvedValue(['other-account'])
    act(() => useAppStore.getState().setSession(session('b@test.ru')))
    await waitFor(() => expect(result.current.ids).toEqual(['other-account']))
    await act(async () => { finish(['one', 'two']); await pending })
    expect(result.current.ids).toEqual(['other-account'])
  })
  it('uses local draft as a guest and clears it on account transitions', async () => {
    useAppStore.getState().setSession(null)
    const { result } = setup()
    await act(() => result.current.change('guest-product'))
    expect(result.current.ids).toEqual(['guest-product'])
    expect(apiClient.setProductCompared).not.toHaveBeenCalled()
    expect(apiClient.getComparisonProducts).not.toHaveBeenCalled()
    act(() => useAppStore.getState().setSession(session('new@test.ru')))
    expect(useAppStore.getState().compareIds).toEqual([])
    expect(JSON.parse(localStorage.getItem('medizdeliya-russia')!).state.compareIds).toEqual([])
  })
})

it.each(['saved', 'comparison'] as const)('targets the selected %s collection and resets it across accounts', async (kind) => {
  const list = kind === 'saved' ? apiClient.getSavedCollections : apiClient.getComparisonCollections
  const read = kind === 'saved' ? apiClient.getSavedProducts : apiClient.getComparisonProducts
  const write = kind === 'saved' ? apiClient.setProductSaved : apiClient.setProductCompared
  vi.mocked(list).mockResolvedValue([{ id: 'first', name: 'Первый' }, { id: 'second', name: 'Второй' }])
  const state: Record<string, string[]> = { first: ['a'], second: ['b'] }
  vi.mocked(read).mockImplementation(async (id) => state[id ?? 'first'])
  vi.mocked(write).mockImplementation(async (id, selected, collectionId) => {
    const target = collectionId ?? 'first'
    state[target] = selected ? [...state[target], id] : state[target].filter((p) => p !== id)
    return state[target]
  })
  const { result } = setup(kind)
  await waitFor(() => expect(result.current.ids).toEqual(['a']))
  act(() => result.current.selectCollection('second'))
  await waitFor(() => expect(result.current.ids).toEqual(['b']))
  await act(() => result.current.change('new', true))
  expect(write).toHaveBeenCalledWith('new', true, 'second')
  expect(result.current.ids).toEqual(['b', 'new'])
  expect(state.first).toEqual(['a'])
  act(() => useAppStore.getState().setSession(session('another@test.ru')))
  await waitFor(() => expect(result.current.collectionId).toBe('first'))
  expect(useAppStore.getState().selectedComparisonCollectionId).toBeUndefined()
  expect(useAppStore.getState().selectedSavedCollectionId).toBeUndefined()
})

it.each(['saved', 'comparison'] as const)('serializes first %s writes across hook instances and reuses the created collection', async (kind) => {
  const list = kind === 'saved' ? apiClient.getSavedCollections : apiClient.getComparisonCollections
  const read = kind === 'saved' ? apiClient.getSavedProducts : apiClient.getComparisonProducts
  const write = kind === 'saved' ? apiClient.setProductSaved : apiClient.setProductCompared
  let created = 0
  let active = 0
  let peak = 0
  let ids: string[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  vi.mocked(list).mockImplementation(async () => created ? [{ id: 'created', name: 'Первый' }] : [])
  vi.mocked(read).mockImplementation(async () => [...ids])
  vi.mocked(write).mockImplementation(async (id, selected, target) => {
    active++
    peak = Math.max(peak, active)
    if (!target) { await gate; created++ }
    ids = selected ? [...ids, id] : ids.filter((p) => p !== id)
    active--
    return [...ids]
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => ({ first: useProductSelections(kind), second: useProductSelections(kind) }), { wrapper })
  await waitFor(() => expect(result.current.first.pending).toBe(false))
  let first!: Promise<void>, second!: Promise<void>
  act(() => {
    first = result.current.first.change('a', true)
    second = result.current.second.change('b', true)
  })
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  await act(async () => { release(); await Promise.all([first, second]) })
  expect(created).toBe(1)
  expect(peak).toBe(1)
  expect(write).toHaveBeenNthCalledWith(2, 'b', true, 'created')
  await waitFor(() => expect(result.current.first.ids).toEqual(['a', 'b']))
  expect(result.current.second.ids).toEqual(['a', 'b'])
})
