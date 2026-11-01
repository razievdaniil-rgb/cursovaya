import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Review, Session } from '../types'

const httpMode = !!import.meta.env.VITE_API_URL && import.meta.env.VITE_USE_MOCK_API !== 'true'

interface AppState {
  session: Session | null
  sessionRevision: number
  selectionReady: boolean
  selectedSavedCollectionId: string | undefined
  selectedComparisonCollectionId: string | undefined
  selectCollection: (kind: 'saved' | 'comparison', id: string) => void
  compareIds: string[]
  savedIds: string[]
  submittedReviews: Review[]
  setSession: (session: Session | null) => void
  toggleCompare: (id: string) => { ok: boolean; message?: string }
  removeCompare: (id: string) => void
  toggleSaved: (id: string) => void
  addReview: (review: Review) => void
  resetDemo: () => void
}

/**
 * Локальное состояние интерфейса.
 *
 * В localStorage сохраняются только UI-предпочтения: черновик сравнения,
 * отметки «сохранено» и отправленные отзывы. Сессия в хранилище не
 * сохраняется и токены сюда не попадают: при загрузке приложение
 * спрашивает `/auth/me` (см. useSessionBootstrap в AppRouter).
 */
export const useAppStore = create<AppState>()(persist((set, get) => ({
  session: null,
  sessionRevision: 0,
  selectionReady: false,
  selectedSavedCollectionId: undefined,
  selectedComparisonCollectionId: undefined,
  selectCollection: (kind, id) => set(kind === 'saved' ? { selectedSavedCollectionId: id } : { selectedComparisonCollectionId: id }),
  compareIds: httpMode ? [] : ['mp-12', 'vismo'],
  savedIds: httpMode ? [] : ['mp-12', 'vector-8'],
  submittedReviews: [],
  setSession: (session) => set((state) => state.session?.email === session?.email
    ? { session, selectionReady: true }
    : { session, selectionReady: true, sessionRevision: state.sessionRevision + 1, selectedSavedCollectionId: undefined, selectedComparisonCollectionId: undefined, compareIds: [], savedIds: [], submittedReviews: [] }),
  toggleCompare: (id) => {
    const current = get().compareIds
    if (current.includes(id)) { set({ compareIds: current.filter((item) => item !== id) }); return { ok: true } }
    if (current.length >= 3) return { ok: false, message: 'Для сравнения можно выбрать не более трёх изделий' }
    set({ compareIds: [...current, id] }); return { ok: true }
  },
  removeCompare: (id) => set((state) => ({ compareIds: state.compareIds.filter((item) => item !== id) })),
  toggleSaved: (id) => set((state) => ({ savedIds: state.savedIds.includes(id) ? state.savedIds.filter((item) => item !== id) : [...state.savedIds, id] })),
  addReview: (review) => set((state) => ({ submittedReviews: [review, ...state.submittedReviews] })),
  resetDemo: () => set((state) => ({ selectedSavedCollectionId: undefined, selectedComparisonCollectionId: undefined, session: null, selectionReady: true, sessionRevision: state.sessionRevision + 1, compareIds: httpMode ? [] : ['mp-12', 'vismo'], savedIds: httpMode ? [] : ['mp-12', 'vector-8'], submittedReviews: [] })),
}), {
  name: httpMode ? 'medizdeliya-russia-http-draft' : 'medizdeliya-russia',
  // session намеренно исключена: источник истины о входе — сервер.
  partialize: (state) => ({
    compareIds: state.session ? [] : state.compareIds,
    savedIds: state.session ? [] : state.savedIds,
    submittedReviews: state.session ? [] : state.submittedReviews,
  }),
}))
