const numberFormatter = new Intl.NumberFormat('ru-RU')

export function formatPrice(min: number, max: number) {
  if (min === 0 && max === 0) return 'Цена не указана'
  return `${numberFormatter.format(min)}–${numberFormatter.format(max)} ₽`
}
