import { registryStatusPresentation } from '../utils/registryStatus'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/appStore'
import { Badge, Card, Spinner } from '../components/ui/UI'
import { formatPrice } from '../utils/format'
import styles from './Pages.module.css'

export function OrganizationPage() {
  const session = useAppStore((s) => s.session)!
  const submitted = useAppStore((s) => s.submittedReviews)
  const { data, isLoading } = useQuery({ queryKey: ['organization'], queryFn: () => apiClient.getOrganizationDashboard() })
  if (isLoading || !data) return <Spinner/>
  const stats = [['Сохранено','18 изделий','3 списка'],['Сравнения','6','2 обновлены'],['Отзывы',String(14 + submitted.length),'12 опубликованы'],['Уведомления','4','2 требуют внимания']]
  return <div className={styles.cabinetPage}><header className={styles.cabinetTitle}><div><h1>Кабинет медорганизации</h1><p>{session.displayName} · Москва</p></div><Badge tone="success">Профиль подтверждён</Badge></header>
    <div className={styles.cabinetStats}>{stats.map(([label,value,caption],index) => <Card className={styles.dashboardStat} key={label}><span>{label}</span><strong>{value}</strong><small className={index === 3 ? styles.warningText : ''}>{caption}</small></Card>)}</div>
    <Card className={styles.notifications}><h2>Изменения в реестре</h2>{data.notifications.map((item) => <div key={item.id}><Badge tone={item.severity === 'info' ? 'neutral' : item.severity}>{item.severity === 'success' ? 'Обновлено' : item.severity === 'warning' ? 'Изменение' : 'Риск'}</Badge><strong>{item.title}</strong><span>{item.productName}</span><time>{item.date}</time></div>)}</Card>
    <div className={styles.orgGrid}><Card className={styles.saved}><h2>Сохранённые изделия</h2>{data.saved.map((product) => <article key={product.id}><img src={product.image} alt=""/><div><strong>{product.name}</strong><span>{formatPrice(product.priceMin, product.priceMax)}</span></div><Badge tone={registryStatusPresentation(product.registryStatus).tone}>{registryStatusPresentation(product.registryStatus).label}</Badge></article>)}</Card><Card className={styles.activity}><h2>Активность</h2><div className={styles.miniChart}>{[34,42,38,58,52,72,82].map((value,index) => <i key={index} style={{ height: `${value}%` }}/>)}</div><strong>128</strong><span>просмотров сохранённых списков</span><small>+18% за месяц</small></Card></div>
  </div>
}
