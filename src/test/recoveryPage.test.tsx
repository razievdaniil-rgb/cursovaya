import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { RecoveryPage } from '../pages/AuthPages'
import { apiClient } from '../api/client'

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

it('сохраняет token из fragment в StrictMode, очищает URL и меняет пароль', async () => {
  window.history.replaceState(null, '', '/auth/recovery#token=one-time-test-token')
  const confirm = vi.spyOn(apiClient, 'confirmRecovery').mockResolvedValue()
  render(<StrictMode><MemoryRouter><RecoveryPage/></MemoryRouter></StrictMode>)
  expect(window.location.hash).toBe('')
  fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'New-Password-2026' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }))
  expect(await screen.findByText('Пароль изменён. Войдите с новым паролем.')).toBeInTheDocument()
  expect(confirm).toHaveBeenCalledWith('one-time-test-token', 'New-Password-2026')
})

it('показывает ошибку доставки вместо ложного подтверждения отправки', async () => {
  vi.spyOn(apiClient, 'recover').mockRejectedValue(new Error('Доставка недоступна'))
  render(<MemoryRouter><RecoveryPage/></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Электронная почта'), { target: { value: 'user@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Доставка недоступна'))
  expect(screen.queryByText(/письмо со ссылкой отправлено/)).not.toBeInTheDocument()
})
