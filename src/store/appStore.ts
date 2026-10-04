import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Review, Session } from '../types'

interface AppState {
  session: Session | null
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

export const useAppStore = create<AppState>()(persist((set, get) => ({
  session: null,
  compareIds: ['mp-12', 'vismo'],
  savedIds: ['mp-12', 'vector-8'],
  submittedReviews: [],
  setSession: (session) => set({ session }),
  toggleCompare: (id) => {
    const current = get().compareIds
    if (current.includes(id)) { set({ compareIds: current.filter((item) => item !== id) }); return { ok: true } }
    if (current.length >= 3) return { ok: false, message: 'Для сравнения можно выбрать не более трёх изделий' }
    set({ compareIds: [...current, id] }); return { ok: true }
  },
  removeCompare: (id) => set((state) => ({ compareIds: state.compareIds.filter((item) => item !== id) })),
  toggleSaved: (id) => set((state) => ({ savedIds: state.savedIds.includes(id) ? state.savedIds.filter((item) => item !== id) : [...state.savedIds, id] })),
  addReview: (review) => set((state) => ({ submittedReviews: [review, ...state.submittedReviews] })),
  resetDemo: () => set({ session: null, compareIds: ['mp-12', 'vismo'], savedIds: ['mp-12', 'vector-8'], submittedReviews: [] }),
}), { name: 'medizdeliya-russia' }))
