import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { mockApi } from '../api/mockApi'
import type { CatalogQuery, RegistryStatus } from '../types'
import { useAppStore } from '../store/appStore'
import { ProductCard } from '../components/product/ProductCard'
import { Badge, Button, EmptyState, SelectField, Spinner } from '../components/ui/UI'
import { Icon } from '../components/ui/Icon'
import styles from './Pages.module.css'

const filterGroups = [
  { key: 'countries', title: 'Страна', values: [['Россия','Россия'],['Япония','Япония'],['Китай','Китай']] },
  { key: 'statuses', title: 'Статус', values: [['active','Действует'],['changed','Изменён'],['expired','Истёк']] },
  { key: 'risks', title: 'Класс риска', values: [['1','1'],['2а','2а'],['2б','2б']] },
  { key: 'price', title: 'Цена', values: [['under-300','До 300 000 ₽'],['300-600','300–600 тыс.'],['over-600','Более 600 тыс.']] },
] as const

export function CatalogPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const compareIds = useAppStore((s) => s.compareIds)
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [mobileFilters, setMobileFilters] = useState(false)
  const filters = useMemo(() => ({
    countries: params.getAll('country'), statuses: params.getAll('status') as RegistryStatus[], risks: params.getAll('risk'), price: params.getAll('price'),
  }), [params])
  const sort = (params.get('sort') as CatalogQuery['sort']) ?? 'recommended'
  const state = (params.get('state') as CatalogQuery['state']) ?? 'default'
  const query: CatalogQuery = { search: params.get('search') ?? '', ...filters, sort, state }
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ['catalog', query], queryFn: () => mockApi.getCatalog(query) })
  const setFilter = (key: string, value: string, checked: boolean) => { const next = new URLSearchParams(params); const paramKey = key === 'countries' ? 'country' : key === 'statuses' ? 'status' : key === 'risks' ? 'risk' : 'price'; if (checked) next.append(paramKey, value); else { const values = next.getAll(paramKey).filter((item) => item !== value); next.delete(paramKey); values.forEach((item) => next.append(paramKey, item)) } setParams(next) }
  const submit = (event: React.FormEvent) => { event.preventDefault(); const next = new URLSearchParams(params); if (search) next.set('search', search); else next.delete('search'); setParams(next) }
  const reset = () => { setSearch(''); setParams({}) }
  const filterPanel = <div className={styles.filterPanel}><div className={styles.filterTitle}><h2>Фильтры</h2><button onClick={() => setMobileFilters(false)} aria-label="Закрыть фильтры"><Icon name="close"/></button></div>{filterGroups.map((group) => <fieldset key={group.key}><legend>{group.title}</legend>{group.values.map(([value,label]) => { const list = filters[group.key]; return <label key={value}><input type="checkbox" checked={list.includes(value as never)} onChange={(e) => setFilter(group.key, value, e.target.checked)}/><span>{label}</span></label> })}</fieldset>)}<Button variant="secondary" onClick={reset}>Сбросить фильтры</Button></div>
  return <div className={styles.page}><header className={styles.pageTitle}><span className={styles.eyebrow}>КАТАЛОГ</span><h1>1 864 зарегистрированных изделия</h1><p>Данные реестра и предложения поставщиков</p></header>
    <form className={styles.catalogSearch} onSubmit={submit}><label><span>Поиск</span><span><Icon name="search" size={19}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название или регистрационный номер"/></span></label><Button>Найти</Button><Button variant="ghost" type="button" onClick={reset}>Сбросить</Button></form>
    <div className={styles.catalogToolbar}><Button variant="secondary" icon="sliders" onClick={() => setMobileFilters(true)} className={styles.mobileFilterButton}>Фильтры · {Object.values(filters).flat().length}</Button><span>Найдено {data.length} изделий</span><SelectField label="Сортировка" value={sort} onChange={(e) => { const next = new URLSearchParams(params); next.set('sort', e.target.value); setParams(next) }}><option value="recommended">Сначала рекомендуемые</option><option value="price-asc">Сначала дешевле</option><option value="rating-desc">По рейтингу</option></SelectField></div>
    <div className={styles.chips}>{filters.countries.map((value) => <Badge tone="accent" key={value}>{value} ×</Badge>)}{filters.statuses.map((value) => <Badge tone="success" key={value}>{value === 'active' ? 'Регистрация действует' : value} ×</Badge>)}</div>
    <div className={styles.catalogLayout}><aside className={`${styles.filters} ${mobileFilters ? styles.filtersOpen : ''}`}>{filterPanel}</aside><section>{isLoading ? <Spinner/> : isError ? <EmptyState title="Каталог временно недоступен" text="Повторите запрос. Выбранные позиции сравнения сохранены." action={<Button onClick={() => refetch()}>Повторить</Button>}/> : data.length === 0 ? <EmptyState title="Изделия не найдены" text="Измените поисковый запрос или сбросьте выбранные фильтры." action={<Button variant="secondary" onClick={reset}>Сбросить фильтры</Button>}/> : <div className={styles.productGrid}>{data.map((product) => <ProductCard product={product} key={product.id}/>)}</div>}</section></div>
    {compareIds.length > 0 && <div className={styles.compareDock}><strong>Выбрано для сравнения: {compareIds.length}</strong><Button onClick={() => navigate('/compare')}>Сравнить</Button></div>}
  </div>
}
