import { describe, expect, it } from 'vitest'
import { registryStatusPresentation } from '../utils/registryStatus'

describe('статус регистрации в интерфейсе', () => {
  it.each(['invalid', 'cancelled', 'suspended', 'expired'] as const)(
    '%s не отображается как действующая регистрация', (status) => {
      const presentation = registryStatusPresentation(status)
      expect(presentation.tone).toBe('danger')
      expect(presentation.label).not.toBe('Действует')
    },
  )

  it('различает недействительную и отменённую регистрацию', () => {
    expect(registryStatusPresentation('invalid').label).toBe('Недействительно')
    expect(registryStatusPresentation('cancelled').label).toBe('Отменено')
  })
})
