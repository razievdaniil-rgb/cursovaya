import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import { ApiError } from '../api/httpApi'
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui/UI'
import { useAppStore } from '../store/appStore'
import type { Review } from '../types'
import styles from './Pages.module.css'

const statuses = {
  moderation: { label: 'На модерации', tone: 'warning' },
  published: { label: 'Опубликован', tone: 'success' },
  rejected: { label: 'Отклонён', tone: 'danger' },
  hidden: { label: 'Скрыт', tone: 'neutral' },
} as const

export function MyReviewsPage({ sessionReady = true }: { sessionReady?: boolean }) {
  const session = useAppStore(s => s.session)
  const revision = useAppStore(s => s.sessionRevision)
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-reviews', session?.email, revision],
    queryFn: () => apiClient.getMyReviews(),
    enabled: sessionReady && Boolean(session),
    retry: false,
  })
  const signIn = () => navigate('/auth/login', { state: { from: '/reviews' } })
  const unauthenticated = error instanceof ApiError && error.status === 401

  if (!sessionReady) return <div className={styles.narrowPage}><Spinner label="Проверка сессии"/></div>
  if (!session || unauthenticated) return <div className={styles.narrowPage}><EmptyState title="Мои отзывы" text="Войдите, чтобы увидеть свои отзывы и их статус модерации." action={<Button onClick={signIn}>Войти</Button>}/></div>
  if (isLoading) return <div className={styles.narrowPage}><Spinner label="Загрузка отзывов"/></div>
  if (isError || !data) return <div className={styles.narrowPage}><EmptyState title="Не удалось загрузить отзывы" text="Проверьте соединение и повторите попытку." action={<Button onClick={() => void refetch()}>Повторить</Button>}/></div>

  return <div className={styles.page}>
    <header className={styles.pageTitle}><h1>Мои отзывы</h1><p>Ваш опыт использования изделий и статус публикации.</p></header>
    {data.length === 0 ? <EmptyState title="Вы ещё не оставляли отзывов" text="Выберите изделие в каталоге и расскажите об опыте его использования." action={<Button onClick={() => navigate('/catalog')}>Открыть каталог</Button>}/> :
      <div style={{ display: 'grid', gap: 16 }}>{data.map((review: Review) => <Card key={review.id} className={styles.reviews}>
        <article>
          <Badge tone={statuses[review.status].tone}>{statuses[review.status].label}</Badge>
          <h2>{review.title}</h2>
          <p>Оценка: {review.rating} из 5 · {review.experience}</p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{review.body}</p>
          <p>{review.authorType === 'organization' ? 'От имени организации' : 'Личный отзыв'} · <time dateTime={review.createdAt}>{review.createdAt}</time></p>
          <Link to={`/products/${review.productId}`}>Карточка изделия</Link>
        </article>
      </Card>)}</div>}
  </div>
}
