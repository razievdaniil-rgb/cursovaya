import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'
import styles from './UI.module.css'

export function Button({ variant = 'primary', icon, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName }) {
  return <button className={`${styles.button} ${styles[variant]} ${className}`} {...props}>{icon && <Icon name={icon} size={20}/>}<span>{children}</span></button>
}
export function Badge({ tone = 'neutral', children, className = '' }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'violet'; children: ReactNode; className?: string }) {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]} ${className}`}>{children}</span>
}
export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={`${styles.card} ${className}`} {...props}>{children}</div> }
export function Field({ label, icon, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: IconName; error?: string }) {
  return <label className={styles.field}><span>{label}</span><span className={`${styles.inputWrap} ${error ? styles.inputError : ''}`}>{icon && <Icon name={icon} size={20}/>}<input {...props}/></span>{error && <small role="alert">{error}</small>}</label>
}
export function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span><span className={styles.selectWrap}><select {...props}>{children}</select><Icon name="chevron" size={20}/></span></label>
}
export function Spinner({ label = 'Загрузка данных' }: { label?: string }) { return <div className={styles.spinnerWrap} role="status"><span className={styles.spinner}/><span>{label}</span></div> }
export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <Card className={styles.stateCard}><Icon name="search" size={30}/><h2>{title}</h2><p>{text}</p>{action}</Card> }
