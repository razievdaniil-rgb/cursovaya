import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import type { SyncStatus } from '../types'
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui/UI'
import styles from './Pages.module.css'

export function SyncPage() {
  const [params, setParams] = useSearchParams(); const state = (params.get('state') as SyncStatus['state']) || 'current'
  const { data, isLoading, isError, refetch, isFetching } = useQuery({ queryKey: ['sync', state], queryFn: () => apiClient.getSyncStatus(state) })
  if (isLoading) return <Spinner label="Проверка источников данных"/>
  if (isError || !data) return <div className={styles.cabinetPage}><header className={styles.cabinetTitle}><div><h1>Синхронизация данных</h1><p>Импорт сведений из государственного реестра</p></div></header><EmptyState title="Источник данных недоступен" text="Последняя успешно загруженная версия остаётся доступной пользователям." action={<Button onClick={() => { setParams({ state: 'current' }); refetch() }}>Повторить проверку</Button>}/></div>
  return <div className={styles.cabinetPage}><header className={styles.cabinetTitle}><div><h1>Синхронизация данных</h1><p>Импорт сведений из государственного реестра</p></div></header>
    <Card className={styles.syncHero}><div><Badge tone={state === 'stale' ? 'warning' : 'success'}>{state === 'stale' ? 'Требуется обновление' : 'Данные актуальны'}</Badge><h2>Последняя загрузка: {data.lastUpdatedAt}</h2><p>Обработано {data.records.toLocaleString('ru-RU')} записи · {data.changes} изменений · 0 ошибок</p></div><Button onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Проверка…' : 'Проверить обновления'}</Button></Card>
    <Card className={styles.syncStates}><h2>Состояния данных</h2><div><button className={state === 'current' ? styles.selectedState : ''} onClick={() => setParams({ state:'current' })}><Badge tone="success">Актуально</Badge><span>Обновлено 18 минут назад</span></button><button className={state === 'stale' ? styles.selectedState : ''} onClick={() => setParams({ state:'stale' })}><Badge tone="warning">Устарело</Badge><span>Последнее обновление более 24 часов назад</span></button><button onClick={() => setParams({ state:'error' })}><Badge tone="danger">Ошибка</Badge><span>Источник временно недоступен</span></button></div></Card>
    <Card className={styles.syncLog}><h2>Журнал загрузок</h2><div className={styles.tableHead}><span>Время</span><span>Набор данных</span><span>Записей</span><span>Результат</span></div>{data.sources.map((source,index) => <div key={source.name}><time>{index < 2 ? '09:42' : index === 2 ? 'Вчера, 18:00' : '8 сен, 12:04'}</time><strong>{source.name}</strong><span>{source.records.toLocaleString('ru-RU')}</span><Badge tone={source.state === 'success' ? 'success' : source.state === 'stale' ? 'warning' : 'danger'}>{source.state === 'success' ? 'Успешно' : source.state === 'stale' ? 'Устарело' : 'Ошибка'}</Badge></div>)}</Card>
  </div>
}
