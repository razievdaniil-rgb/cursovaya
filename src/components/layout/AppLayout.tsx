import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { mockApi } from '../../api/mockApi'
import { Button, Badge } from '../ui/UI'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import styles from './Layout.module.css'

const publicNav = [
  { to: '/catalog', label: 'Каталог' }, { to: '/compare', label: 'Сравнение' },
  { to: '/products/mp-12/review', label: 'Отзывы' },
]

function GlobalHeader() {
  const [open, setOpen] = useState(false)
  const session = useAppStore((s) => s.session)
  const setSession = useAppStore((s) => s.setSession)
  const navigate = useNavigate()
  const location = useLocation()
  const roleItem = session?.role === 'organization' ? { to: '/organization', label: 'Кабинет' } : { to: '/government/analytics', label: 'Аналитика' }
  const navigation = [...publicNav, roleItem]
  const logout = async () => { await mockApi.logout(); setSession(null); navigate('/') }
  return <>
    <header className={styles.header}>
      <Logo/>
      <nav className={styles.desktopNav} aria-label="Основная навигация">{navigation.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? styles.active : ''}>{item.label}</NavLink>)}</nav>
      <div className={styles.headerActions}>
        <Badge tone="success">Данные обновлены</Badge>
        {session ? <button className={styles.profile} onClick={() => navigate(session.role === 'government' ? '/government/analytics' : session.role === 'organization' ? '/organization' : '/catalog')}><Icon name="user" size={20}/><span>{session.displayName}</span></button> : <Button variant="secondary" onClick={() => navigate('/auth/login', { state: { from: location.pathname } })}>Войти</Button>}
        {session && <button className={styles.logout} onClick={logout} aria-label="Выйти"><Icon name="back" size={20}/></button>}
      </div>
      <button className={styles.menuButton} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Открыть меню"><Icon name={open ? 'close' : 'menu'}/></button>
    </header>
    {open && <div className={styles.mobileMenu}><nav>{navigation.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}>{item.label}</NavLink>)}</nav>{session ? <Button variant="secondary" onClick={() => { setOpen(false); void logout() }}>Выйти</Button> : <Button onClick={() => { setOpen(false); navigate('/auth/login') }}>Войти</Button>}</div>}
  </>
}

export function AppLayout() {
  return <div className={styles.shell}>
    <GlobalHeader/>
    <main><Outlet/></main>
  </div>
}

const orgNav = [
  { to: '/organization', label: 'Обзор', icon: 'diagnostics' as const }, { to: '/catalog', label: 'Каталог', icon: 'search' as const },
  { to: '/compare', label: 'Сравнения', icon: 'sliders' as const }, { to: '/products/mp-12/review', label: 'Отзывы', icon: 'star' as const },
]
const govNav = [
  { to: '/government/analytics', label: 'Аналитика', icon: 'diagnostics' as const }, { to: '/catalog', label: 'Каталог', icon: 'search' as const },
  { to: '/compare', label: 'Сравнения', icon: 'sliders' as const }, { to: '/government/sync', label: 'Синхронизация', icon: 'arrow' as const },
]

export function CabinetLayout({ type }: { type: 'organization' | 'government' }) {
  const session = useAppStore((s) => s.session)!
  const items = type === 'government' ? govNav : orgNav
  return <div className={styles.cabinetShell}>
    <GlobalHeader/>
    <div className={styles.cabinet}>
      <aside className={styles.sidebar}>
      <div className={styles.sideContext}><Icon name={type === 'government' ? 'shield' : 'building'} size={20}/><span><small>Рабочее пространство</small><strong>{type === 'government' ? 'Госаналитика' : 'Медорганизация'}</strong></span></div>
      <nav>{items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? styles.sideActive : ''}><Icon name={item.icon} size={18}/><span>{item.label}</span></NavLink>)}</nav>
      <div className={styles.sideProfile}><strong>{session.displayName}</strong><span>{type === 'government' ? 'Государственный орган' : 'Подтверждённая организация'}</span></div>
      </aside>
      <div className={styles.cabinetMain}><nav className={styles.mobileCabinetNav} aria-label="Навигация кабинета">{items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? styles.sideActive : ''}>{item.label}</NavLink>)}</nav><Outlet/></div>
    </div>
  </div>
}
