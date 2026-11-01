import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, useIsMutating } from '@tanstack/react-query'
import { apiClient } from './client'
import { useAppStore } from '../store/appStore'

const collectionApi = apiClient

/** Serial mutation scopes are shared across hook instances in the same QueryClient. */
export function useProductSelections(kind: 'saved' | 'comparison') {
  const session = useAppStore((s) => s.session)
  const revision = useAppStore((s) => s.sessionRevision)
  const ready = useAppStore((s) => s.selectionReady) || apiClient.mode === 'mock'
  const localIds = useAppStore((s) => kind === 'saved' ? s.savedIds : s.compareIds)
  const requestedId = useAppStore((s) => kind === 'saved' ? s.selectedSavedCollectionId : s.selectedComparisonCollectionId)
  const remote = apiClient.mode === 'http' && !!session
  const client = useQueryClient()
  const base = ['product-selections', session?.email ?? 'guest', revision, kind]
  const getCollections = kind === 'saved' ? collectionApi.getSavedCollections : collectionApi.getComparisonCollections
  const collectionQuery = useQuery({
    queryKey: [...base, 'collections'],
    queryFn: () => getCollections!.call(collectionApi),
    enabled: remote && !!getCollections,
  })
  const collections = collectionQuery.data ?? []
  // A deleted/stale selected ID falls back to the first available collection.
  const collectionId = collections.find((c) => c.id === requestedId)?.id ?? collections[0]?.id
  const collectionsReady = !getCollections || collectionQuery.isSuccess
  const key = [...base, 'items', collectionId ?? 'default']
  const [notice, setNotice] = useState({ revision, collectionId, text: '' })
  const setMessage = (text: string) => setNotice({ revision, collectionId, text })
  const message = notice.revision === revision && notice.collectionId === collectionId ? notice.text : ''
  const read = (id?: string) => kind === 'saved'
    ? collectionApi.getSavedProducts(id) : collectionApi.getComparisonProducts(id)
  const query = useQuery({ queryKey: key, queryFn: () => read(collectionId), enabled: remote && collectionsReady })
  const ids = remote ? query.data ?? [] : localIds
  const mutationKey = ['selection-action', session?.email ?? 'guest', revision, kind]
  const busy = useIsMutating({ mutationKey }) > 0
  const mutation = useMutation({
    mutationKey,
    scope: { id: JSON.stringify(mutationKey) },
    mutationFn: async ({ id, selected, target }: { id: string; selected?: boolean; target?: string }) => {
      if (useAppStore.getState().sessionRevision !== revision) throw new Error('Сессия изменилась')
      // Resolve again at execution time: a preceding queued write may have created the first collection.
      const resolved = target ?? (getCollections ? (await getCollections.call(collectionApi))[0]?.id : undefined)
      const current = await read(resolved)
      if (useAppStore.getState().sessionRevision !== revision) throw new Error('Сессия изменилась')
      const next = selected ?? !current.includes(id)
      if (kind === 'comparison' && next && !current.includes(id) && current.length >= 3)
        throw new Error('Для сравнения можно выбрать не более трёх изделий')
      if (next === current.includes(id)) return { ids: current, target: resolved }
      const data = kind === 'saved'
        ? await collectionApi.setProductSaved(id, next, resolved)
        : await collectionApi.setProductCompared(id, next, resolved)
      return { ids: data, target: resolved }
    },
    onSuccess: async (data) => {
      if (useAppStore.getState().sessionRevision !== revision) return
      const targetKey = [...base, 'items', data.target ?? 'default']
      await client.cancelQueries({ queryKey: targetKey })
      client.setQueryData(targetKey, data.ids)
      await client.invalidateQueries({ queryKey: base })
      if (kind === 'saved') void client.invalidateQueries({ queryKey: ['organization'] })
    },
  })
  const change = async (id: string, selected?: boolean) => {
    setMessage('')
    if (!ready || useAppStore.getState().sessionRevision !== revision || (remote && (!collectionsReady || !query.isSuccess))) return
    try {
      if (remote) await mutation.mutateAsync({ id, selected, target: collectionId })
      else {
        const store = useAppStore.getState()
        const current = kind === 'saved' ? store.savedIds : store.compareIds
        if ((selected ?? !current.includes(id)) !== current.includes(id)) {
          if (kind === 'saved') store.toggleSaved(id)
          else {
            const result = store.toggleCompare(id)
            if (!result.ok) setMessage(result.message ?? '')
          }
        }
      }
    } catch (error) {
      if (useAppStore.getState().sessionRevision === revision)
        setMessage(error instanceof Error ? error.message : 'Не удалось сохранить изменения')
    }
  }
  return { ids, change, message, collections: remote ? collections : [], collectionId,
    selectCollection: (id: string) => { if (!busy && collections.some((c) => c.id === id)) useAppStore.getState().selectCollection(kind, id) },
    pending: !ready || busy || (remote && (!collectionsReady || query.isPending) && !collectionQuery.isError),
    error: remote && (query.isError || (!!getCollections && collectionQuery.isError)),
    retry: () => { void (collectionQuery.isError ? collectionQuery.refetch() : query.refetch()) } }
}
