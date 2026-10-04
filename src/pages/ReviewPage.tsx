import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useNavigate, useParams } from 'react-router-dom'
import { products } from '../data/mockData'
import { mockApi } from '../api/mockApi'
import { useAppStore } from '../store/appStore'
import { Badge, Button, Card, Field } from '../components/ui/UI'
import { Icon } from '../components/ui/Icon'
import styles from './Pages.module.css'

const schema = z.object({ title: z.string().min(5, 'Введите заголовок от 5 символов'), body: z.string().min(20, 'Опишите опыт подробнее — минимум 20 символов'), experience: z.string().min(1), authorType: z.enum(['user','organization']), consent: z.literal(true, { message: 'Подтвердите достоверность отзыва' }) })
type FormValues = z.infer<typeof schema>

export function ReviewPage() {
  const { id = 'mp-12' } = useParams(); const product = products.find((p) => p.id === id) ?? products[0]
  const [rating, setRating] = useState(5); const [done, setDone] = useState(false); const navigate = useNavigate()
  const addReview = useAppStore((s) => s.addReview); const session = useAppStore((s) => s.session)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { experience: 'Более 6 месяцев', authorType: session?.role === 'organization' ? 'organization' : 'user', consent: true } })
  const submit = handleSubmit(async (values) => { const review = await mockApi.submitReview({ productId: product.id, title: values.title, body: values.body, experience: values.experience, authorType: values.authorType, rating }); addReview(review); setDone(true) })
  if (done) return <div className={styles.narrowPage}><Card className={styles.successState}><span><Icon name="check" size={32}/></span><Badge tone="warning">На модерации</Badge><h1>Отзыв отправлен</h1><p>После проверки отзыв появится в карточке изделия. Статус можно отслеживать в кабинете.</p><div><Button onClick={() => navigate(`/products/${product.id}`)}>Вернуться к изделию</Button><Button variant="secondary" onClick={() => navigate('/catalog')}>Открыть каталог</Button></div></Card></div>
  return <div className={styles.reviewPage}><header><button onClick={() => navigate(`/products/${product.id}`)}><Icon name="back"/>Карточка изделия</button><span className={styles.eyebrow}>ОБРАТНАЯ СВЯЗЬ</span><h1>Новый отзыв</h1><p>{product.name} · {product.manufacturer.name}</p></header><Card className={styles.reviewForm}><form onSubmit={submit}>
    <fieldset className={styles.ratingField}><legend>Общая оценка</legend><div>{[1,2,3,4,5].map((star) => <button type="button" key={star} className={star <= rating ? styles.starActive : ''} onClick={() => setRating(star)} aria-label={`${star} из 5`}><Icon name="star" size={28}/></button>)}</div></fieldset>
    <Field label="Заголовок" placeholder="Кратко сформулируйте основное впечатление" error={errors.title?.message} {...register('title')}/><label className={styles.textareaField}><span>Ваш опыт</span><textarea placeholder="Опишите условия и продолжительность использования" {...register('body')}/><small>{errors.body?.message}</small></label>
    <div className={styles.formColumns}><label><span>Опыт применения</span><select {...register('experience')}><option>1–6 месяцев</option><option>Более 6 месяцев</option><option>Более 2 лет</option></select></label><label><span>Тип автора</span><select {...register('authorType')}><option value="user">Пользователь</option><option value="organization">Медицинская организация</option></select></label></div>
    <label className={styles.checkbox}><input type="checkbox" {...register('consent')}/><span>Подтверждаю, что отзыв основан на реальном опыте использования</span></label>{errors.consent && <small className={styles.error}>{errors.consent.message}</small>}
    <div className={styles.formFooter}><Badge tone="warning">После отправки: На модерации</Badge><Button disabled={isSubmitting}>{isSubmitting ? 'Отправка…' : 'Отправить отзыв'}</Button></div>
  </form></Card></div>
}
