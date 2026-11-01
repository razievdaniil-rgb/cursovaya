import { expect, it } from 'vitest'
import { formatPrice } from '../utils/format'

it('не показывает отсутствие предложений как бесплатное изделие', () => {
  expect(formatPrice(0, 0)).toBe('Цена не указана')
  expect(formatPrice(284000, 319000)).toContain('₽')
})
