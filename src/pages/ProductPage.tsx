import { registryStatusPresentation } from '../utils/registryStatus'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/appStore'
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui/UI'
import { formatPrice } from '../utils/format'
import { Icon } from '../components/ui/Icon'
import { ProductCard } from '../components/product/ProductCard'
import styles from './Pages.module.css'

export function ProductPage() {
  const { id = 'mp-12' } = useParams()
  const navigate = useNavigate()
  const { data: product, isLoading, isError } = useQuery({ queryKey: ['product', id], queryFn: () => apiClient.getProduct(id) })
  // Отзывы и аналоги приходят из того же источника, что и карточка.
  const { data: fetchedReviews = [] } = useQuery({ queryKey: ['product-reviews', id], queryFn: () => apiClient.getProductReviews(id) })
  const { data: analogs = [] } = useQuery({ queryKey: ['product-analogues', id], queryFn: () => apiClient.getProductAnalogues(id) })
  const compareIds = useAppStore((s) => s.compareIds); const toggleCompare = useAppStore((s) => s.toggleCompare)
  const savedIds = useAppStore((s) => s.savedIds); const toggleSaved = useAppStore((s) => s.toggleSaved)
  const submitted = useAppStore((s) => s.submittedReviews)
  if (isLoading) return <div className={styles.page}><Spinner/></div>
  if (isError || !product) return <div className={styles.page}><EmptyState title="Изделие не найдено" text="Проверьте адрес страницы или вернитесь в каталог." action={<Button onClick={() => navigate('/catalog')}>В каталог</Button>}/></div>
  // Локально отправленные отзывы показываются сразу, до модерации.
  const reviews = [...submitted.filter((review) => review.productId === product.id), ...fetchedReviews]
  const selected = compareIds.includes(product.id); const saved = savedIds.includes(product.id)
  return <div className={styles.page}>
    <div className={styles.breadcrumbs}><button onClick={() => navigate('/catalog')}>Каталог</button><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span></div>
    <Card className={styles.productHero}><img src={product.image} alt={product.name}/><div className={styles.productInfo}><div className={styles.row}><Badge tone={product.origin === 'Россия' ? 'accent' : product.origin === 'Импорт' ? 'violet' : 'neutral'}>{product.origin}</Badge><Badge tone={registryStatusPresentation(product.registryStatus).tone}>{registryStatusPresentation(product.registryStatus).label}</Badge></div><h1>{product.name}</h1><p>{product.manufacturer.name} · {product.manufacturer.city}</p><div className={styles.regNumber}><strong>{product.registrationNumber}</strong><span>проверено {product.verifiedAt}</span></div><strong className={styles.bigPrice}>{formatPrice(product.priceMin, product.priceMax)}</strong></div><div className={styles.productActions}><Button variant={selected ? 'primary' : 'secondary'} onClick={() => toggleCompare(product.id)}>{selected ? 'Добавлено к сравнению' : 'Добавить к сравнению'}</Button><Button onClick={() => navigate(`/products/${product.id}/review`)}>Оставить отзыв</Button><Button variant="ghost" icon="bookmark" onClick={() => toggleSaved(product.id)}>{saved ? 'Сохранено' : 'Сохранить'}</Button></div></Card>
    <div className={styles.detailGrid}><Card className={styles.specs}><h2>Основные характеристики</h2><dl><div><dt>Класс риска</dt><dd>{product.riskClass}</dd></div>{Object.entries(product.specs).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></Card><Card className={styles.quality}><h2>Оценка качества</h2><div className={styles.ratingBig}><strong>{product.rating.toFixed(1).replace('.', ',')}</strong><span>{[1,2,3,4,5].map((star) => <Icon key={star} name="star" size={19}/>)}</span></div><p>{product.reviewCount} отзывов · {product.organizationReviewCount} от медорганизаций</p>{[['Надёжность',92],['Удобство',86],['Сервис',78]].map(([label,value]) => <div className={styles.progressRow} key={label}><span>{label}</span><i><b style={{ width: `${value}%` }}/></i><em>{value}%</em></div>)}</Card></div>
    <section className={styles.productSection}><h2>Подходящие аналоги</h2><div className={styles.analogGrid}>{analogs.map((item) => <ProductCard key={item.id} product={item}/>)}</div></section>
    <div className={styles.productBottom}><Card className={styles.documents}><h2>Документы</h2>{product.documents.map((document) => <button key={document}><Icon name="file" size={21}/><span>{document}</span><Icon name="arrow" size={18}/></button>)}</Card><Card className={styles.reviews}><div className={styles.sectionHead}><h2>Отзывы</h2><Button variant="secondary" onClick={() => navigate(`/products/${product.id}/review`)}>Оставить отзыв</Button></div>{reviews.slice(0,3).map((review) => <article key={review.id}><div><strong>{review.title}</strong>{review.verifiedOrganization && <Badge tone="success">Медорганизация</Badge>}{review.status === 'moderation' && <Badge tone="warning">На модерации</Badge>}</div><p>{review.body}</p></article>)}</Card></div>
  </div>
}
