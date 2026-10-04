const numberFormatter = new Intl.NumberFormat('ru-RU')

export function formatPrice(min: number, max: number) {
  return `${numberFormatter.format(min)}–${numberFormatter.format(max)} ₽`
}
