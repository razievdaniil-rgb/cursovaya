import { useState, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/appStore'
import type { UserRole } from '../types'

// Роли, доступные в форме регистрации. government и admin сервер
// самостоятельной регистрацией не выдаёт (ADR 0005).
type RegistrationRole = Extract<UserRole, 'user' | 'organization' | 'government'>
import { Badge, Button, Card, Field, SelectField } from '../components/ui/UI'
import { Icon } from '../components/ui/Icon'
import { Logo } from '../components/ui/Logo'
import styles from './Pages.module.css'

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className={styles.authPage}><aside><Logo dark/><div><h2>Доступ к данным<br/>медицинского рынка</h2><p>Единый контур для работы с реестром, сравнения изделий и контроля качества.</p><div className={styles.authPulse}><i/><i/><i/><i/></div><Card className={styles.authTrust}><Icon name="shield" size={28}/><strong>Защищённый доступ</strong><p>Права определяются ролью и подтверждением организации.</p><Badge tone="accent">Защита персональных данных</Badge></Card></div></aside><main><div className={styles.authMobileLogo}><Logo/></div><header><h1>{title}</h1><p>{subtitle}</p></header>{children}</main></div>
}

const loginSchema = z.object({ role: z.enum(['user','organization','government']), email: z.string().email('Введите корректную почту'), password: z.string().min(6, 'Введите не менее 6 символов'), remember: z.boolean() })
type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const current = useAppStore((s) => s.session); const setSession = useAppStore((s) => s.setSession); const navigate = useNavigate(); const location = useLocation()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { role: 'organization', email: 'name@hospital.ru', password: '1234567890', remember: true } })
  if (current) return <Navigate to={current.role === 'government' ? '/government/analytics' : current.role === 'organization' ? '/organization' : '/catalog'} replace/>
  // role передаётся для демонстрационного адаптера; HTTP-адаптер её
  // игнорирует — роли приходят с сервера из user_roles.
  const submit = handleSubmit(async (values) => { const session = await apiClient.login({ email: values.email, password: values.password, role: values.role }); setSession(session); const requested = (location.state as { from?: string } | null)?.from; navigate(requested || (session.role === 'government' ? '/government/analytics' : session.role === 'organization' ? '/organization' : '/catalog'), { replace: true }) })
  return <AuthShell title="Вход в систему" subtitle="Используйте рабочую учётную запись."><Card className={styles.authCard}><form onSubmit={submit}><SelectField label="Тип учётной записи" {...register('role')}><option value="user">Пользователь</option><option value="organization">Медицинская организация</option><option value="government">Государственный орган</option></SelectField><Field label="Электронная почта" icon="mail" error={errors.email?.message} {...register('email')}/><Field label="Пароль" icon="lock" type="password" error={errors.password?.message} {...register('password')}/><div className={styles.authOptions}><label><input type="checkbox" {...register('remember')}/>Запомнить меня</label><Link to="/auth/recovery">Восстановить пароль</Link></div><Button disabled={isSubmitting}>{isSubmitting ? 'Вход…' : 'Войти'}</Button><div className={styles.authDivider}/><div className={styles.authRegister}><span>Нет учётной записи?</span><Button type="button" variant="secondary" onClick={() => navigate('/auth/register')}>Зарегистрироваться</Button></div><div className={styles.authInfo}><Icon name="shield" size={20}/>Доступ к разделам зависит от выбранной роли</div></form></Card></AuthShell>
}

const registerSchema = z.object({ role: z.enum(['user','organization','government']), organization: z.string().min(3, 'Введите наименование'), inn: z.string().regex(/^\d{10,12}$/, 'ИНН содержит 10 или 12 цифр'), email: z.string().email('Введите корректную почту'), password: z.string().min(10, 'Введите не менее 10 символов'), consent: z.literal(true, { message: 'Необходимо согласие' }) })
type RegisterValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const [role, setRole] = useState<RegistrationRole>('organization'); const setSession = useAppStore((s) => s.setSession); const navigate = useNavigate()
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema), defaultValues: { role, organization: 'ГБУЗ «ГКБ № 52 ДЗМ»', inn: '7734253700', email: 'name@hospital.ru', password: '1234567890', consent: true } })
  const changeRole = (next: RegistrationRole) => { setRole(next); setValue('role', next) }
  const submit = handleSubmit(async (values) => { const session = await apiClient.register({ email: values.email, password: values.password, role: values.role, organization: values.organization, inn: values.inn }); setSession(session); navigate(session.role === 'government' ? '/government/analytics' : session.role === 'organization' ? '/organization' : '/catalog') })
  return <AuthShell title="Создание учётной записи" subtitle="Укажите роль и сведения для проверки доступа."><Card className={`${styles.authCard} ${styles.registerCard}`}><form onSubmit={submit}><fieldset className={styles.rolePicker}><legend>Роль пользователя</legend><div>{([['user','Пользователь','user'],['organization','Медорганизация','building'],['government','Государственный орган','shield']] as const).map(([value,label,icon]) => <button type="button" key={value} className={role === value ? styles.roleActive : ''} onClick={() => changeRole(value)}><Icon name={icon}/><span>{label}</span></button>)}</div><input type="hidden" {...register('role')}/></fieldset><Field label="Наименование организации" icon="building" error={errors.organization?.message} {...register('organization')}/><div className={styles.formColumns}><Field label="ИНН организации" icon="shield" error={errors.inn?.message} {...register('inn')}/><Field label="Рабочая почта" icon="mail" error={errors.email?.message} {...register('email')}/></div><Field label="Пароль" icon="lock" type="password" error={errors.password?.message} {...register('password')}/><label className={styles.checkbox}><input type="checkbox" {...register('consent')}/><span>Принимаю условия обработки персональных данных</span></label>{errors.consent && <small className={styles.error}>{errors.consent.message}</small>}<Button disabled={isSubmitting}>{isSubmitting ? 'Создание…' : 'Создать учётную запись'}</Button><p className={styles.authCaption}>Проверка организации выполняется после регистрации</p></form></Card></AuthShell>
}

const recoverySchema = z.object({ email: z.string().email('Введите корректную почту') })
export function RecoveryPage() {
  const [sent, setSent] = useState(false); const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(recoverySchema), defaultValues: { email: 'name@hospital.ru' } })
  const submit = handleSubmit(async ({ email }) => { await apiClient.recover(email); setSent(true) })
  return <AuthShell title="Восстановление доступа" subtitle="Ссылка для смены пароля будет направлена на рабочую почту."><Card className={`${styles.authCard} ${styles.recoveryCard}`}><form onSubmit={submit}><Field label="Электронная почта" icon="mail" error={errors.email?.message} {...register('email')}/><Button disabled={isSubmitting}>{isSubmitting ? 'Отправка…' : 'Отправить ссылку'}</Button>{sent && <div className={styles.recoveryNote} role="status"><Icon name="mail"/><div><strong>Проверьте входящие сообщения</strong><span>Ссылка действительна 30 минут. При необходимости проверьте папку «Спам».</span></div></div>}<Link className={styles.backLink} to="/auth/login"><Icon name="back" size={20}/>Вернуться ко входу</Link></form></Card></AuthShell>
}
