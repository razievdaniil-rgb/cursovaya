import { useNavigate } from 'react-router-dom'
import { products } from '../data/mockData'
import { useAppStore } from '../store/appStore'
import { Badge, Button, Card, EmptyState } from '../components/ui/UI'
import { formatPrice } from '../utils/format'
import { Icon } from '../components/ui/Icon'
import styles from './Pages.module.css'

const rows: { label: string; value: (id: string) => string }[] = [
  { label: 'Цена', value: (id) => { const p = products.find((x) => x.id === id)!; return formatPrice(p.priceMin, p.priceMax) } },
  { label: 'Производитель', value: (id) => products.find((x) => x.id === id)!.manufacturer.name },
  { label: 'Страна', value: (id) => products.find((x) => x.id === id)!.manufacturer.country },
  { label: 'Класс риска', value: (id) => products.find((x) => x.id === id)!.riskClass },
  { label: 'Каналы ЭКГ', value: (id) => products.find((x) => x.id === id)!.specs['Каналы ЭКГ'] },
  { label: 'Автономность', value: (id) => products.find((x) => x.id === id)!.specs['Автономность'] },
  { label: 'Гарантия', value: (id) => products.find((x) => x.id === id)!.specs['Гарантия'] },
  { label: 'Сервисных центров', value: (id) => products.find((x) => x.id === id)!.specs['Сервисных центров'] },
  { label: 'Рейтинг', value: (id) => products.find((x) => x.id === id)!.rating.toFixed(1).replace('.', ',') },
]

export function ComparePage() {
  const ids = useAppStore((s) => s.compareIds); const remove = useAppStore((s) => s.removeCompare); const navigate = useNavigate()
  const selected = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as typeof products
  if (!selected.length) return <div className={styles.page}><header className={styles.pageTitle}><span className={styles.eyebrow}>СРАВНЕНИЕ</span><h1>Сравнение изделий</h1></header><EmptyState title="Список сравнения пуст" text="Добавьте от двух до трёх изделий из каталога." action={<Button onClick={() => navigate('/catalog')}>Открыть каталог</Button>}/></div>
  return <div className={styles.page}><header className={styles.compareHeader}><div><span className={styles.eyebrow}>СРАВНЕНИЕ</span><h1>Сравнение изделий</h1><p>{selected.length} из 3 позиций</p></div><Button variant="secondary" icon="back" onClick={() => navigate('/catalog')}>Вернуться в каталог</Button></header>
    <Card className={styles.compareTable}>
      <div className={styles.compareProducts}><div className={styles.compareLabel}>Параметр</div>{selected.map((p) => <div className={styles.compareProduct} key={p.id}><button onClick={() => remove(p.id)} aria-label={`Удалить ${p.name}`}><Icon name="close" size={18}/></button><img src={p.image} alt=""/><Badge tone={p.origin === 'Россия' ? 'accent' : 'violet'}>{p.manufacturer.country}</Badge><strong>{p.shortName}</strong><small>{p.registrationNumber}</small></div>)}</div>
      <div className={styles.compareRows}>{rows.map((row) => { const values = selected.map((p) => row.value(p.id)); const different = new Set(values).size > 1; return <div className={`${styles.compareRow} ${different ? styles.different : ''}`} key={row.label}><strong>{row.label}</strong>{values.map((value,index) => <span key={`${row.label}-${selected[index].id}`}>{value}</span>)}</div> })}<div className={styles.compareRow}><strong>Регистрация</strong>{selected.map((p) => <span key={p.id}><Badge tone="success">Действует</Badge></span>)}</div></div>
    </Card>
    <div className={styles.compareLegend}><i/>Различающиеся характеристики выделены цветом</div>
  </div>
}
