import { registryStatusPresentation } from '../utils/registryStatus'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/appStore'
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui/UI'
import { formatPrice } from '../utils/format'
import styles from './Pages.module.css'

export function OrganizationPage() {
  const session = useAppStore((s) => s.session)!
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['organization', session.email], queryFn: () => apiClient.getOrganizationDashboard() })
  if (isLoading) return <Spinner/>
  if (isError || !data) return <EmptyState title="Кабинет недоступен" text="Не удалось загрузить данные организации." action={<Button onClick={() => void refetch()}>Повторить</Button>}/>
  const counters = data.counters
  const stats = [['Сохранено', String(counters?.savedProducts ?? data.saved.length), 'изделий'], ['Сравнения', String(counters?.comparisons ?? 0), 'сравнений'], ['Отзывы', String(counters?.reviews ?? 0), String(counters?.reviewsOnModeration ?? 0) + ' на модерации'], ['Уведомления', String(counters?.unreadNotifications ?? 0), 'непрочитанных']]
  return <div className={styles.cabinetPage}><header className={styles.cabinetTitle}><div><h1>Кабинет медорганизации</h1><p>{data.organization?.name ?? session.displayName}{data.organization?.city ? ` · ${data.organization.city}` : ''}</p></div><Badge tone={data.organization?.verified ? 'success' : 'warning'}>{data.organization?.verificationStatusName ?? 'Ожидает подтверждения'}</Badge></header>
    <div className={styles.cabinetStats}>{stats.map(([label,value,caption],index) => <Card className={styles.dashboardStat} key={label}><span>{label}</span><strong>{value}</strong><small className={index === 3 ? styles.warningText : ''}>{caption}</small></Card>)}</div>
    <Card className={styles.notifications}><h2>Изменения в реестре</h2>{data.notifications.map((item) => <div key={item.id}><Badge tone={item.severity === 'info' ? 'neutral' : item.severity}>{item.severity === 'success' ? 'Обновлено' : item.severity === 'warning' ? 'Изменение' : 'Риск'}</Badge><strong>{item.title}</strong><span>{item.productName}</span><time>{item.date}</time></div>)}</Card>
    <div className={styles.orgGrid}><Card className={styles.saved}><h2>Сохранённые изделия</h2>{data.saved.map((product) => <article key={product.id}><img src={product.image} alt=""/><div><strong>{product.name}</strong><span>{formatPrice(product.priceMin, product.priceMax)}</span></div><Badge tone={registryStatusPresentation(product.registryStatus).tone}>{registryStatusPresentation(product.registryStatus).label}</Badge></article>)}</Card><Card className={styles.activity}><h2>Сотрудники</h2><strong>{counters?.members ?? '—'}</strong><span>участников организации</span></Card></div>
  </div>
}
