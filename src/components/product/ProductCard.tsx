import { registryStatusPresentation } from '../../utils/registryStatus'

import { useNavigate } from 'react-router-dom'
import type { Product } from '../../types'
import { useProductSelections } from '../../api/useProductSelections'
import { Badge, Button, Card } from '../ui/UI'
import { formatPrice } from '../../utils/format'
import { Icon } from '../ui/Icon'
import styles from './ProductCard.module.css'

export function ProductCard({ product }: { product: Product }) {
  const navigate = useNavigate()
  const comparison = useProductSelections('comparison')
  const selected = comparison.ids.includes(product.id)
  const status = registryStatusPresentation(product.registryStatus)
  return <Card className={styles.card}>
    <button className={styles.open} onClick={() => navigate(`/products/${product.id}`)} aria-label={`Открыть ${product.name}`}><span>{product.image ? <img src={product.image} alt={product.name}/> : <span role="img" aria-label="Изображение отсутствует"><Icon name="diagnostics" size={72}/></span>}</span></button>
    <div className={styles.content}>
      <Badge tone={product.origin === 'Россия' ? 'accent' : product.origin === 'Импорт' ? 'violet' : 'neutral'}>{product.origin}</Badge>
      <button className={styles.title} onClick={() => navigate(`/products/${product.id}`)}>{product.name}</button>
      <p>{product.manufacturer.name} · {product.manufacturer.city}</p>
    </div>
    <div className={styles.registry}><span>Рег. № {product.registrationNumber}</span><Badge tone={status.tone}>{status.label}</Badge></div>
    <div className={styles.bottom}><strong>{formatPrice(product.priceMin, product.priceMax)}</strong><span className={styles.rating}><Icon name="star" size={16}/>{product.rating.toFixed(1).replace('.', ',')}</span><Button variant={selected ? 'primary' : 'secondary'} disabled={comparison.pending || comparison.error} onClick={() => void comparison.change(product.id)}>{selected ? 'Выбрано' : 'Сравнить'}</Button></div>
    {comparison.message && <span className={styles.toast} role="status">{comparison.message}</span>}{comparison.error && <button onClick={comparison.retry}>Повторить загрузку сравнения</button>}
  </Card>
}
