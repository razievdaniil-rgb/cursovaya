import { useQuery } from '@tanstack/react-query'
import { apiClient, isMockMode } from '../api/client'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { categories } from '../data/mockData'
import { Card } from '../components/ui/UI'
import { Icon, type IconName } from '../components/ui/Icon'
import styles from './Pages.module.css'

const demoStats = [
  ['Зарегистрировано', '1 864', '+124 за квартал'], ['Российские изделия', '62,4%', '+4,8 п.п.'],
  ['Производители', '428', 'из 58 регионов'], ['Отзывы о качестве', '6 291', '84% подтверждены'],
]
const iconMap: Record<string, IconName> = { diagnostics: 'diagnostics', heart: 'heart', surgery: 'surgery', lab: 'lab', rehab: 'rehab' }

export function HomePage() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { data: filters } = useQuery({ queryKey: ['catalog-filters'], queryFn: () => apiClient.getCatalogFilters(), enabled: !isMockMode })
  const stats = isMockMode ? demoStats : [
    ['Изделия в каталоге', filters?.totalProducts.toLocaleString('ru-RU') ?? '—', 'загружено в базу'],
    ['Производители', filters?.manufacturers.length.toLocaleString('ru-RU') ?? '—', 'в каталоге'],
    ['Категории', String(filters?.categories.length ?? '—'), 'с указанной категорией'],
    ['Страны', String(filters?.countries.length ?? '—'), 'с указанной страной'],
  ]
  const visibleCategories = isMockMode ? categories : (filters?.categories ?? []).map((item) => ({ name: item.name, count: item.productCount, icon: 'diagnostics' }))
  const submit = (event: React.FormEvent) => { event.preventDefault(); navigate(`/catalog${search ? `?search=${encodeURIComponent(search)}` : ''}`) }
  return <div className={styles.home}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}>КАТАЛОГ · РЕГИСТРАЦИЯ · АНАЛОГИ</span><h1>Выбор медицинских изделий<br/>по данным реестра</h1><p>Регистрация, характеристики, цены, аналоги и опыт применения — в одном проверяемом контуре.</p>
        <form className={styles.heroSearch} onSubmit={submit}><Icon name="search"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название, производитель или регистрационный номер" aria-label="Поиск изделия"/><button>Найти</button></form>
      </div>
      <Card className={styles.registryCard}>
        <header><span>Состояние данных</span><b><i/>{isMockMode ? 'Демонстрация' : 'Данные каталога'}</b></header>
        <div className={styles.registryMain}><span>Последняя загрузка</span><strong>{isMockMode ? 'Демонстрационные данные' : 'Журнал загрузок'}</strong><p>Дата проверки указана в карточке каждого изделия</p></div>
        <div className={styles.registryFacts}><div><span>Изменений</span><strong>{isMockMode ? '14' : '—'}</strong><small>в текущей версии</small></div><div><span>Ошибок</span><strong>{isMockMode ? '0' : '—'}</strong><small>при обработке</small></div></div>
        <footer><Icon name="shield" size={20}/><span><b>Контроль свежести</b>Показывает, когда сведения проверялись в последний раз</span></footer>
      </Card>
    </section>
    <section className={styles.homeSection}><h2>Рынок в цифрах</h2><div className={styles.stats}>{stats.map(([label,value,delta]) => <Card className={styles.stat} key={label}><span>{label}</span><strong>{value}</strong><small>{delta}</small></Card>)}</div></section>
    <section className={styles.homeSection}><h2>Популярные категории</h2><div className={styles.categories}>{visibleCategories.map((item, index) => <button key={item.name} className={index === 0 ? styles.categoryActive : ''} onClick={() => navigate(`/catalog?search=${encodeURIComponent(item.name)}`)}><span><Icon name={iconMap[item.icon]}/></span><strong>{item.name}</strong><small>{item.count} изделий</small></button>)}</div></section>
  </div>
}
