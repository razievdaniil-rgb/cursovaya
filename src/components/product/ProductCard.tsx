import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Product } from '../../types'
import { useAppStore } from '../../store/appStore'
import { Badge, Button, Card } from '../ui/UI'
import { formatPrice } from '../../utils/format'
import { Icon } from '../ui/Icon'
import styles from './ProductCard.module.css'

export function ProductCard({ product }: { product: Product }) {
  const navigate = useNavigate()
  const compareIds = useAppStore((s) => s.compareIds)
  const toggleCompare = useAppStore((s) => s.toggleCompare)
  const [message, setMessage] = useState('')
  const selected = compareIds.includes(product.id)
  const onCompare = () => { const result = toggleCompare(product.id); setMessage(result.message ?? (selected ? 'Удалено из сравнения' : 'Добавлено к сравнению')); setTimeout(() => setMessage(''), 2200) }
  return <Card className={styles.card}>
    <button className={styles.open} onClick={() => navigate(`/products/${product.id}`)} aria-label={`Открыть ${product.name}`}><img src={product.image} alt={product.name}/></button>
    <div className={styles.content}>
      <Badge tone={product.origin === 'Россия' ? 'accent' : 'violet'}>{product.origin}</Badge>
      <button className={styles.title} onClick={() => navigate(`/products/${product.id}`)}>{product.name}</button>
      <p>{product.manufacturer.name} · {product.manufacturer.city}</p>
    </div>
    <div className={styles.registry}><span>Рег. № {product.registrationNumber}</span><Badge tone={product.registryStatus === 'active' ? 'success' : 'warning'}>{product.registryStatus === 'active' ? 'Действует' : 'Изменён'}</Badge></div>
    <div className={styles.bottom}><strong>{formatPrice(product.priceMin, product.priceMax)}</strong><span className={styles.rating}><Icon name="star" size={16}/>{product.rating.toFixed(1).replace('.', ',')}</span><Button variant={selected ? 'primary' : 'secondary'} onClick={onCompare}>{selected ? 'Выбрано' : 'Сравнить'}</Button></div>
    {message && <span className={styles.toast} role="status">{message}</span>}
  </Card>
}
