import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout, CabinetLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { ProductPage } from './pages/ProductPage'
import { ComparePage } from './pages/ComparePage'
import { ReviewPage } from './pages/ReviewPage'
import { OrganizationPage } from './pages/OrganizationPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { SyncPage } from './pages/SyncPage'
import { LoginPage, RecoveryPage, RegisterPage } from './pages/AuthPages'
import { Button, EmptyState } from './components/ui/UI'

function NotFound() { return <div style={{ maxWidth: 760, margin: '80px auto', padding: 16 }}><EmptyState title="Страница не найдена" text="Адрес страницы изменён или введён неверно." action={<Button onClick={() => location.assign('/')}>На главную</Button>}/></div> }

export function AppRouter() {
  return <BrowserRouter><Routes>
    <Route element={<AppLayout/>}>
      <Route index element={<HomePage/>}/>
      <Route path="catalog" element={<CatalogPage/>}/>
      <Route path="products/:id" element={<ProductPage/>}/>
      <Route path="products/:id/review" element={<ReviewPage/>}/>
      <Route path="compare" element={<ComparePage/>}/>
    </Route>
    <Route path="organization" element={<ProtectedRoute roles={['organization']}><CabinetLayout type="organization"/></ProtectedRoute>}><Route index element={<OrganizationPage/>}/></Route>
    <Route path="government" element={<ProtectedRoute roles={['government']}><CabinetLayout type="government"/></ProtectedRoute>}><Route index element={<Navigate to="analytics" replace/>}/><Route path="analytics" element={<AnalyticsPage/>}/><Route path="sync" element={<SyncPage/>}/></Route>
    <Route path="auth/login" element={<LoginPage/>}/><Route path="auth/register" element={<RegisterPage/>}/><Route path="auth/recovery" element={<RecoveryPage/>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></BrowserRouter>
}
