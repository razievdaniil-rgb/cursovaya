import { useQueries } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/appStore'
import type { Product } from '../types'
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui/UI'
import { formatPrice } from '../utils/format'
import { Icon } from '../components/ui/Icon'
import styles from './Pages.module.css'

/**
 * Строки таблицы сравнения. Характеристики читаются из `specs` загруженного
 * изделия: их состав задаёт источник данных, а не этот файл.
 */
const rows: { label: string; value: (product: Product) => string }[] = [
  { label: 'Цена', value: (p) => formatPrice(p.priceMin, p.priceMax) },
  { label: 'Производитель', value: (p) => p.manufacturer.name },
  { label: 'Страна', value: (p) => p.manufacturer.country },
  { label: 'Класс риска', value: (p) => p.riskClass },
  { label: 'Каналы ЭКГ', value: (p) => p.specs['Каналы ЭКГ'] ?? '—' },
  { label: 'Автономность', value: (p) => p.specs['Автономность'] ?? '—' },
  { label: 'Гарантия', value: (p) => p.specs['Гарантия'] ?? '—' },
  { label: 'Сервисных центров', value: (p) => p.specs['Сервисных центров'] ?? '—' },
  { label: 'Рейтинг', value: (p) => p.rating.toFixed(1).replace('.', ',') },
]

export function ComparePage() {
  const ids = useAppStore((s) => s.compareIds); const remove = useAppStore((s) => s.removeCompare); const navigate = useNavigate()
  // Карточки берутся из источника данных по идентификаторам из черновика
  // сравнения, который остаётся в локальном состоянии.
  const queries = useQueries({
    queries: ids.map((id) => ({ queryKey: ['product', id], queryFn: () => apiClient.getProduct(id) })),
  })
  const loading = queries.some((query) => query.isLoading)
  const selected = queries
    .map((query) => query.data)
    .filter((product): product is Product => Boolean(product))
  if (loading && selected.length === 0) return <div className={styles.page}><Spinner/></div>
  if (!selected.length) return <div className={styles.page}><header className={styles.pageTitle}><span className={styles.eyebrow}>СРАВНЕНИЕ</span><h1>Сравнение изделий</h1></header><EmptyState title="Список сравнения пуст" text="Добавьте от двух до трёх изделий из каталога." action={<Button onClick={() => navigate('/catalog')}>Открыть каталог</Button>}/></div>
  return <div className={styles.page}><header className={styles.compareHeader}><div><span className={styles.eyebrow}>СРАВНЕНИЕ</span><h1>Сравнение изделий</h1><p>{selected.length} из 3 позиций</p></div><Button variant="secondary" icon="back" onClick={() => navigate('/catalog')}>Вернуться в каталог</Button></header>
    <Card className={styles.compareTable}>
      <div className={styles.compareProducts}><div className={styles.compareLabel}>Параметр</div>{selected.map((p) => <div className={styles.compareProduct} key={p.id}><button onClick={() => remove(p.id)} aria-label={`Удалить ${p.name}`}><Icon name="close" size={18}/></button><img src={p.image} alt=""/><Badge tone={p.origin === 'Россия' ? 'accent' : 'violet'}>{p.manufacturer.country}</Badge><strong>{p.shortName}</strong><small>{p.registrationNumber}</small></div>)}</div>
      <div className={styles.compareRows}>{rows.map((row) => { const values = selected.map((p) => row.value(p)); const different = new Set(values).size > 1; return <div className={`${styles.compareRow} ${different ? styles.different : ''}`} key={row.label}><strong>{row.label}</strong>{values.map((value,index) => <span key={`${row.label}-${selected[index].id}`}>{value}</span>)}</div> })}<div className={styles.compareRow}><strong>Регистрация</strong>{selected.map((p) => <span key={p.id}><Badge tone="success">Действует</Badge></span>)}</div></div>
    </Card>
    <div className={styles.compareLegend}><i/>Различающиеся характеристики выделены цветом</div>
  </div>
}
