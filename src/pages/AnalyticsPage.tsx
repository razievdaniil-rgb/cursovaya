import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiClient } from '../api/client'
import type { ProblemProduct } from '../types'
import { Badge, Button, Card, SelectField, Spinner } from '../components/ui/UI'
import styles from './Pages.module.css'

function describeReason(item: ProblemProduct): string {
  if (item.reasons.registrationExpired) return 'Регистрация истекла'
  if (item.reasons.statusBlocking) return 'Регистрация приостановлена'
  if (item.reasons.registrationExpiring) return 'Истекает регистрация'
  if (item.reasons.criticalReviews) return 'Критические отзывы'
  if (item.reasons.withoutActiveOffers) return 'Нет действующих предложений'
  return 'Требует проверки'
}

export function AnalyticsPage() {
  const [period, setPeriod] = useState('2020–2026'); const [category, setCategory] = useState('Все категории'); const navigate = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ['analytics', period, category], queryFn: () => apiClient.getAnalytics(period, category) })
  const { data: problems = [] } = useQuery({ queryKey: ['problem-products'], queryFn: () => apiClient.getProblemProducts() })
  const { data: catalogFilters } = useQuery({ queryKey: ['catalog-filters'], queryFn: () => apiClient.getCatalogFilters() })
  if (isLoading || !data) return <Spinner/>
  return <div className={styles.cabinetPage}><header className={styles.analyticsTitle}><div><h1>Государственная аналитика</h1><p>Минздрав · Минпромторг</p></div><div><SelectField label="Период" value={period} onChange={(e) => setPeriod(e.target.value)}><option>2020–2026</option><option>2024–2026</option><option>2026</option></SelectField><SelectField label="Категория" value={category} onChange={(e) => setCategory(e.target.value)}><option>Все категории</option><option>Диагностика</option><option>Реанимация</option></SelectField></div></header>
    <div className={styles.cabinetStats}><Card className={styles.dashboardStat}><span>Российские изделия</span><strong>{data.domesticShare}%</strong><small>+{data.domesticDelta} п.п. за период</small></Card><Card className={styles.dashboardStat}><span>Зарегистрировано</span><strong>{(catalogFilters?.totalProducts ?? 0).toLocaleString('ru-RU')}</strong><small>в каталоге</small></Card><Card className={styles.dashboardStat}><span>Производители</span><strong>{catalogFilters?.manufacturers.length ?? 0}</strong><small>{catalogFilters?.countries.length ?? 0} стран</small></Card><Card className={styles.dashboardStat}><span>Сигналы качества</span><strong>{data.signals}</strong><small className={styles.dangerText}>{data.criticalSignals} критических</small></Card></div>
    <div className={styles.analyticsGrid}><Card className={styles.chartCard}><div className={styles.sectionHead}><h2>Динамика импортозамещения</h2><Badge tone="accent">Цель 70%</Badge></div><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><LineChart data={data.importSubstitution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}><CartesianGrid stroke="#e9f0f0" vertical={false}/><XAxis dataKey="year" tickLine={false} axisLine={false}/><YAxis domain={[30,80]} tickLine={false} axisLine={false}/><Tooltip/><Line dataKey="value" type="monotone" stroke="#17b7a8" strokeWidth={3} dot={{ fill:'#fff',stroke:'#17b7a8',strokeWidth:3,r:4 }}/></LineChart></ResponsiveContainer></div></Card><Card className={styles.dependency}><h2>Высокая импортозависимость</h2>{data.dependencies.map((item) => <div key={item.category}><span>{item.category}</span><i><b style={{ width: `${item.value}%` }}/></i><strong>{item.value}%</strong></div>)}<Button variant="secondary" onClick={() => navigate('/catalog?state=default')}>Показать категории</Button></Card></div>
    <Card className={styles.problemTable}><div className={styles.sectionHead}><h2>Позиции с отклонениями</h2><Badge tone="danger">{data.criticalSignals} критических</Badge></div><div className={styles.tableHead}><span>Изделие</span><span>Рег. номер</span><span>Сигнал</span><span>Отзывы</span><span>Статус</span></div>{problems.map((item) => <button key={item.id} onClick={() => navigate(`/products/${item.id}`)}><strong>{item.name}</strong><span>{item.registrationNumber}</span><span>{describeReason(item)}</span><span>{item.criticalReviewCount ? `${item.criticalReviewCount} критических` : '—'}</span><Badge tone={item.reasons.registrationExpired || item.reasons.statusBlocking ? 'danger' : 'warning'}>{item.reasons.registrationExpired || item.reasons.statusBlocking ? 'Критично' : 'Контроль'}</Badge></button>)}{problems.length === 0 && <p className={styles.emptyRow}>Отклонений не найдено</p>}</Card>
  </div>
}
