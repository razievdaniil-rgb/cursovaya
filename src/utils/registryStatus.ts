import type { RegistryStatus } from '../types'

/** Общая подпись для каталога, карточки и сравнения. */
const statuses: Record<RegistryStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  active: { label: 'Действует', tone: 'success' },
  changed: { label: 'Изменён', tone: 'warning' },
  expiring: { label: 'Истекает', tone: 'warning' },
  expired: { label: 'Истёк', tone: 'danger' },
  suspended: { label: 'Приостановлено', tone: 'danger' },
  invalid: { label: 'Недействительно', tone: 'danger' },
  cancelled: { label: 'Отменено', tone: 'danger' },
}

export function registryStatusPresentation(status: RegistryStatus) {
  return statuses[status] ?? { label: 'Статус неизвестен', tone: 'warning' as const }
}
