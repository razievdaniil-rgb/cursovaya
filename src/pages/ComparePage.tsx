import { registryStatusPresentation } from '../utils/registryStatus'
import { useQueries } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import { CollectionSelector } from '../components/product/CollectionSelector'
import { useProductSelections } from '../api/useProductSelections'
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
  { label: 'Рейтинг', value: (p) => p.rating.toFixed(1).replace('.', ',') },
]

export function ComparePage() {
  const comparison = useProductSelections('comparison')
  const selector = <CollectionSelector selection={comparison} label="Список сравнения"/>
  const ids = comparison.ids
  const navigate = useNavigate()
  // Авторизованные HTTP-пользователи читают состав сравнения с сервера.
  const queries = useQueries({
    queries: ids.map((id) => ({ queryKey: ['product', id], queryFn: () => apiClient.getProduct(id) })),
  })
  const loading = queries.some((query) => query.isLoading)
  const selected = queries
    .map((query) => query.data)
    .filter((product): product is Product => Boolean(product))
  const dynamicRows = [...new Set(selected.flatMap((p) => Object.keys(p.specs)))].map((label) => ({
    label, value: (p: Product) => p.specs[label] ?? '—',
  }))
  if (comparison.error) return <div className={styles.page}>{selector}<EmptyState title="Не удалось загрузить сравнение" text="Повторите попытку." action={<Button onClick={comparison.retry}>Повторить</Button>}/></div>
  if ((loading || comparison.pending) && selected.length === 0) return <div className={styles.page}><Spinner/></div>
  if (queries.some((q) => q.isError)) return <div className={styles.page}>{selector}<EmptyState title="Не удалось загрузить изделия" text="Выбранные позиции сохранены." action={<Button onClick={() => queries.forEach((q) => { void q.refetch() })}>Повторить</Button>}/></div>
  if (!selected.length) return <div className={styles.page}><header className={styles.pageTitle}><span className={styles.eyebrow}>СРАВНЕНИЕ</span><h1>Сравнение изделий</h1></header>{selector}<EmptyState title="Список сравнения пуст" text="Добавьте от двух до трёх изделий из каталога." action={<Button onClick={() => navigate('/catalog')}>Открыть каталог</Button>}/></div>
  return <div className={styles.page}><header className={styles.compareHeader}><div><span className={styles.eyebrow}>СРАВНЕНИЕ</span><h1>Сравнение изделий</h1><p>{selected.length} из 3 позиций</p></div><Button variant="secondary" icon="back" onClick={() => navigate('/catalog')}>Вернуться в каталог</Button></header>
    {selector}
    {comparison.message && <p role="alert">{comparison.message}</p>}
    <Card className={styles.compareTable}>
      <div className={styles.compareProducts}><div className={styles.compareLabel}>Параметр</div>{selected.map((p) => <div className={styles.compareProduct} key={p.id}><button disabled={comparison.pending} onClick={() => void comparison.change(p.id, false)} aria-label={`Удалить ${p.name}`}><Icon name="close" size={18}/></button>{p.image ? <img src={p.image} alt=""/> : <span role="img" aria-label="Изображение отсутствует"><Icon name="diagnostics" size={48}/></span>}<Badge tone={p.origin === 'Россия' ? 'accent' : p.origin === 'Импорт' ? 'violet' : 'neutral'}>{p.manufacturer.country}</Badge><strong>{p.shortName}</strong><small>{p.registrationNumber}</small></div>)}</div>
      <div className={styles.compareRows}>{[...rows, ...dynamicRows].map((row) => { const values = selected.map((p) => row.value(p)); const different = new Set(values).size > 1; return <div className={`${styles.compareRow} ${different ? styles.different : ''}`} key={row.label}><strong>{row.label}</strong>{values.map((value,index) => <span key={`${row.label}-${selected[index].id}`}>{value}</span>)}</div> })}<div className={styles.compareRow}><strong>Регистрация</strong>{selected.map((p) => <span key={p.id}><Badge tone={registryStatusPresentation(p.registryStatus).tone}>{registryStatusPresentation(p.registryStatus).label}</Badge></span>)}</div></div>
    </Card>
    <div className={styles.compareLegend}><i/>Различающиеся характеристики выделены цветом</div>
  </div>
}
