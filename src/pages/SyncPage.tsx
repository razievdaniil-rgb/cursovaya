import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { apiClient, isMockMode } from '../api/client'
import type { SyncStatus } from '../types'
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui/UI'
import styles from './Pages.module.css'

const sourceOptions = [
  ['roszdravnadzor-registry', 'Реестр медицинских изделий'],
  ['roszdravnadzor-nomenclature', 'Номенклатурная классификация'],
  ['mock-registry', 'Демонстрационный источник'],
] as const
const runLabels: Record<string, string> = { success: 'Успешно', partial: 'Частично', failed: 'Ошибка', running: 'Выполняется' }
const date = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU') : '—'

export function SyncPage() {
  const [params, setParams] = useSearchParams()
  const demoState = isMockMode ? (params.get('state') as SyncStatus['state']) || 'current' : undefined
  const requestedSource = params.get('source') ?? 'roszdravnadzor-registry'
  const source = sourceOptions.some(([code]) => code === requestedSource) ? requestedSource : 'roszdravnadzor-registry'
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['sync', demoState, source],
    queryFn: () => apiClient.getSyncStatus(demoState, source),
    refetchInterval: (query) => query.state.data?.runs?.some((run) => run.status === 'running') ? 2000 : false,
  })
  const run = useMutation({ mutationFn: () => apiClient.runSync(source), onSettled: () => void refetch() })
  if (isLoading) return <Spinner label="Проверка источников данных"/>
  if (isError || !data) return <div className={styles.cabinetPage}><h1>Синхронизация данных</h1><EmptyState title="Источник данных недоступен" text="Последняя успешно загруженная версия остаётся доступной пользователям." action={<Button onClick={() => { if (isMockMode) setParams({ state: 'current' }); void refetch() }}>Повторить проверку</Button>}/></div>
  const stale = data.state === 'stale'
  const failed = data.state === 'error'
  const running = run.isPending || data.runs?.some((item) => item.status === 'running')
  return <div className={styles.cabinetPage}>
    <header className={styles.cabinetTitle}><div><h1>Синхронизация данных</h1><p>{data.sourceName ?? 'Источники медицинских изделий'}</p></div><Badge tone={data.sourceIsReal ? 'accent' : 'warning'}>{data.sourceIsReal ? 'Внешний источник' : 'Демонстрационные данные'}</Badge></header>
    {!isMockMode && <label>Источник данных <select aria-label="Источник данных" value={source} onChange={(event) => setParams({ source: event.target.value })}>{sourceOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>}
    <Card className={styles.syncHero}><div><Badge tone={failed ? 'danger' : stale ? 'warning' : 'success'}>{failed ? 'Последняя загрузка завершилась ошибкой' : stale ? 'Требуется обновление' : 'Данные актуальны'}</Badge><h2>Последняя успешная загрузка: {data.lastUpdatedAt}</h2><p>Обработано {data.records.toLocaleString('ru-RU')} записей · {data.changes} изменений · {data.errorCount ?? 0} ошибок последнего запуска</p></div><div><Button onClick={() => void refetch()} disabled={isFetching}>{isFetching ? 'Проверка…' : 'Проверить обновления'}</Button>{!isMockMode && <Button onClick={() => run.mutate()} disabled={Boolean(running)}>{running ? 'Загрузка выполняется…' : 'Загрузить данные'}</Button>}</div></Card>
    {run.isError && <p role="alert">{run.error instanceof Error ? run.error.message : 'Не удалось запустить загрузку'}</p>}
    {isMockMode && <Card className={styles.syncStates}><h2>Демонстрационные состояния</h2><div><button onClick={() => setParams({ state:'current' })}><Badge tone="success">Актуально</Badge></button><button onClick={() => setParams({ state:'stale' })}><Badge tone="warning">Устарело</Badge></button><button onClick={() => setParams({ state:'error' })}><Badge tone="danger">Ошибка</Badge></button></div></Card>}
    <Card className={styles.syncLog}><h2>Журнал загрузок</h2><div className={styles.tableHead}><span>Время</span><span>Результат</span><span>Записей</span><span>Ошибки</span></div>{data.runs ? data.runs.map((item) => <div key={item.id}><time>{date(item.startedAt)}</time><Badge tone={item.status === 'failed' ? 'danger' : item.status === 'success' ? 'success' : 'warning'}>{runLabels[item.status] ?? item.status}</Badge><span>{item.recordsRead.toLocaleString('ru-RU')}</span><span>{item.errorCount}{item.errorMessage && <small>{item.errorMessage}</small>}</span></div>) : data.sources.map((item, index) => <div key={`${item.name}-${index}`}><span>Демонстрация</span><strong>{item.name}</strong><span>{item.records.toLocaleString('ru-RU')}</span><Badge tone={item.state === 'success' ? 'success' : item.state === 'error' ? 'danger' : 'warning'}>{item.state === 'success' ? 'Успешно' : item.state === 'error' ? 'Ошибка' : 'Устарело'}</Badge></div>)}{data.runs?.length === 0 && <p>Загрузок этого источника ещё не было.</p>}</Card>
  </div>
}
