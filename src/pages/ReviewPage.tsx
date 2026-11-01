import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/httpApi'
import { apiClient } from '../api/client'
import { useAppStore } from '../store/appStore'
import { Badge, Button, Card, EmptyState, Field, Spinner } from '../components/ui/UI'
import { Icon } from '../components/ui/Icon'
import styles from './Pages.module.css'

const schema = z.object({ title: z.string().min(5, 'Введите заголовок от 5 символов'), body: z.string().min(20, 'Опишите опыт подробнее — минимум 20 символов'), experience: z.string().min(1), authorType: z.enum(['user','organization']), consent: z.literal(true, { message: 'Подтвердите достоверность отзыва' }) })
type FormValues = z.infer<typeof schema>

export function ReviewPage({ sessionReady = true }: { sessionReady?: boolean }) {
  const { id = '' } = useParams()
  const [rating, setRating] = useState(5); const [done, setDone] = useState(false); const navigate = useNavigate()
  const addReview = useAppStore((s) => s.addReview); const session = useAppStore((s) => s.session)
  const [submitError, setSubmitError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const canReviewAsOrganization = Boolean(session?.organizationId)
  const queryClient = useQueryClient()
  const { data: product, isLoading, isError, refetch } = useQuery({ queryKey: ['product', id], queryFn: () => apiClient.getProduct(id), enabled: Boolean(id), retry: false })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { experience: 'Более 6 месяцев', authorType: 'user', consent: true } })
  const submit = handleSubmit(async (values) => {
    setSubmitError('')
    if (!session && apiClient.mode === 'http') { setNeedsLogin(true); return }
    if (!product) return
    if (values.authorType === 'organization' && !session?.organizationId) {
      setSubmitError('Для отзыва от организации необходимо членство в организации.')
      return
    }
    try {
      const review = await apiClient.submitReview({
        productId: product.id, title: values.title, body: values.body,
        experience: values.experience, authorType: values.authorType, rating,
        ...(values.authorType === 'organization' ? { organizationId: session?.organizationId ?? undefined } : {}),
      })
      addReview(review)
      setDone(true)
      // Refetch failures must not turn successful submissions into duplicates.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-reviews', product.id] }),
        queryClient.invalidateQueries({ queryKey: ['my-reviews'] }),
      ]).catch(() => {})
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setNeedsLogin(true)
      } else {
        setSubmitError(error instanceof ApiError ? error.message : 'Не удалось отправить отзыв. Проверьте соединение и повторите попытку.')
      }
    }
  })
  const signIn = () => navigate('/auth/login', { state: { from: '/products/' + id + '/review' } })
  if (!sessionReady) return <div className={styles.narrowPage}><Spinner label="Проверка сессии"/></div>
  if ((!session && apiClient.mode === 'http') || needsLogin) return <div className={styles.narrowPage}><EmptyState title="Войдите, чтобы оставить отзыв" text="Для отправки отзыва нужна действующая учётная запись." action={<Button onClick={signIn}>Войти</Button>}/></div>
  if (isLoading) return <div className={styles.narrowPage}><Spinner/></div>
  if (isError || !product) return <div className={styles.narrowPage}><EmptyState title="Изделие недоступно" text="Не удалось загрузить изделие. Проверьте адрес или повторите попытку." action={<><Button onClick={() => void refetch()}>Повторить</Button><Button variant="secondary" onClick={() => navigate('/catalog')}>Открыть каталог</Button></>}/></div>
  if (done) return <div className={styles.narrowPage}><Card className={styles.successState}><span><Icon name="check" size={32}/></span><Badge tone="warning">На модерации</Badge><h1>Отзыв отправлен</h1><p>После проверки отзыв появится в карточке изделия. Статус можно отслеживать в кабинете.</p><div><Button onClick={() => navigate(`/products/${product.id}`)}>Вернуться к изделию</Button><Button variant="secondary" onClick={() => navigate('/reviews')}>Мои отзывы</Button></div></Card></div>
  return <div className={styles.reviewPage}><header><button onClick={() => navigate(`/products/${product.id}`)}><Icon name="back"/>Карточка изделия</button><span className={styles.eyebrow}>ОБРАТНАЯ СВЯЗЬ</span><h1>Новый отзыв</h1><p>{product.name} · {product.manufacturer.name}</p></header><Card className={styles.reviewForm}><form onSubmit={submit}>
    <fieldset className={styles.ratingField}><legend>Общая оценка</legend><div>{[1,2,3,4,5].map((star) => <button type="button" key={star} className={star <= rating ? styles.starActive : ''} onClick={() => setRating(star)} aria-label={`${star} из 5`}><Icon name="star" size={28}/></button>)}</div></fieldset>
    <Field label="Заголовок" placeholder="Кратко сформулируйте основное впечатление" error={errors.title?.message} {...register('title')}/><label className={styles.textareaField}><span>Ваш опыт</span><textarea placeholder="Опишите условия и продолжительность использования" {...register('body')}/><small>{errors.body?.message}</small></label>
    <div className={styles.formColumns}><label><span>Опыт применения</span><select {...register('experience')}><option>1–6 месяцев</option><option>Более 6 месяцев</option><option>Более 2 лет</option></select></label><label><span>Тип автора</span><select {...register('authorType')}><option value="user">Пользователь</option>{canReviewAsOrganization && <option value="organization">Медицинская организация</option>}</select></label></div>
    <label className={styles.checkbox}><input type="checkbox" {...register('consent')}/><span>Подтверждаю, что отзыв основан на реальном опыте использования</span></label>{errors.consent && <small className={styles.error}>{errors.consent.message}</small>}
    {submitError && <p role="alert" className={styles.error}>{submitError}</p>}
    <div className={styles.formFooter}><Badge tone="warning">После отправки: На модерации</Badge><Button disabled={isSubmitting}>{isSubmitting ? 'Отправка…' : 'Отправить отзыв'}</Button></div>
  </form></Card></div>
}
