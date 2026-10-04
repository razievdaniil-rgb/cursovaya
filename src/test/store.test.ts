import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../store/appStore'

describe('comparison store', () => {
  beforeEach(() => { localStorage.clear(); useAppStore.getState().resetDemo() })

  it('persists comparison and limits it to three products', () => {
    expect(useAppStore.getState().toggleCompare('vector-8').ok).toBe(true)
    expect(useAppStore.getState().compareIds).toHaveLength(3)
    const result = useAppStore.getState().toggleCompare('mitar-01')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('не более трёх')
  })

  it('creates and clears a demo session', () => {
    useAppStore.getState().setSession({ role: 'organization', email: 'test@example.ru', displayName: 'ГКБ', verified: true })
    expect(useAppStore.getState().session?.role).toBe('organization')
    useAppStore.getState().setSession(null)
    expect(useAppStore.getState().session).toBeNull()
  })
})
