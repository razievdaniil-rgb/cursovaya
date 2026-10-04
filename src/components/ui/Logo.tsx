import { Link } from 'react-router-dom'
import styles from './UI.module.css'

export function Logo({ dark = false }: { dark?: boolean }) {
  return <Link to="/" className={`${styles.logo} ${dark ? styles.logoDark : ''}`} aria-label="Медицинские изделия России — главная">
    <svg width="38" height="38" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 2 42 9v13c0 11.7-7.3 20.5-18 24C13.3 42.5 6 33.7 6 22V9l18-7Z" fill={dark ? '#17b7a8' : '#075e63'}/>
      <path d="M13 25h5l3-8 5 15 3-9 3 4h4" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="24" cy="13" r="2" fill="#fff"/>
    </svg>
    <span><strong>МЕДИЗДЕЛИЯ</strong><small>РОССИИ</small></span>
  </Link>
}
