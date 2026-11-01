// Records real HTTP responses and SQL results. No mocked API or prerecorded responses.
// Run only against a dedicated demonstration database; mutations are intentional.
import { chromium, request } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { randomBytes, createHash } from 'node:crypto'
import path from 'node:path'

const output = process.env.DEMO_OUTPUT
const database = new URL(process.env.DATABASE_URL ?? '')
if (!output || !database.pathname.startsWith('/cursovaya_demo_video_'))
  throw new Error('Set DEMO_OUTPUT and DATABASE_URL pointing to a dedicated cursovaya_demo_video_* database')
const password = process.env.DEMO_PASSWORD
const adminPassword = process.env.DEMO_ADMIN_PASSWORD
if (!password || !adminPassword) throw new Error('Set DEMO_PASSWORD and DEMO_ADMIN_PASSWORD')
const api = process.env.DEMO_API_URL ?? 'http://127.0.0.1:3000/api/v1'
const web = process.env.DEMO_WEB_URL ?? 'http://127.0.0.1:4173'
const hold = Number(process.env.DEMO_HOLD_MS ?? 3200)
await mkdir(output, { recursive: true })
const require = createRequire(new URL('../backend/package.json', import.meta.url))
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: output, size: { width: 1600, height: 1000 } } })
const page = await context.newPage()
const video = page.video()
const started = Date.now()
const events = []
const covered = new Set()
const spec = JSON.parse(await readFile(new URL('../backend/docs/openapi.json', import.meta.url), 'utf8'))
const operations = Object.entries(spec.paths).flatMap(([route, ops]) => Object.keys(ops).map(method => ({ route, method: method.toUpperCase(), regex: new RegExp('^' + route.replace(/\{[^}]+\}/g, '[^/]+') + '$') })))
const clients = {}
for (const role of ['guest', 'user', 'clinic', 'admin']) clients[role] = { http: await request.newContext(), token: null }
const clean = (value) => JSON.parse(JSON.stringify(value, (key, val) => /password|token|cookie|authorization|secret/i.test(key) ? '[скрыто]' : typeof val === 'bigint' ? String(val) : val))
function compact(value, depth = 0) {
  if (depth > 5) return '…'
  if (Array.isArray(value)) return [...value.slice(0, 2).map(v => compact(v, depth + 1)), ...(value.length > 2 ? [`… ещё ${value.length - 2} записей`] : [])]
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 18).map(([k,v]) => [k, compact(v, depth + 1)]))
  return typeof value === 'string' && value.length > 230 ? value.slice(0, 230) + '…' : value
}
await page.setContent(`<!doctype html><html lang="ru"><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#0b1220;color:#e7eef9;font:20px Arial,sans-serif}header{padding:28px 44px;border-bottom:1px solid #304156;background:#142238}header small{color:#67ddc0;letter-spacing:2px}h1{font-size:31px;margin:10px 0}#caption{color:#bac9da;font-size:20px;line-height:1.5;max-width:1450px}main{padding:26px 44px}#route{font:22px Consolas,monospace;color:#73e1c2;overflow-wrap:anywhere}#status{padding:10px 0;color:#b7c7dd}section{display:grid;grid-template-columns:38% 62%;gap:22px}article{background:#132036;border:1px solid #2d425f;border-radius:12px;padding:22px;min-height:560px}h2{font-size:17px;letter-spacing:1px;color:#9caec5;margin:0 0 15px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:18px/1.35 Consolas,monospace;margin:0;max-height:555px;overflow:hidden}footer{position:fixed;bottom:0;left:0;right:0;background:#142238;padding:16px 44px;font-size:17px;color:#a2b5ce;display:flex;justify-content:space-between}#history{margin-top:24px;color:#91b3b1;font-size:17px;line-height:1.5}</style><header><small>ЖИВАЯ ДЕМОНСТРАЦИЯ · POSTGRESQL 17 + NESTJS</small><h1 id="title"></h1><div id="caption"></div></header><main><div id="route"></div><div id="status"></div><section><article><h2>ЗАПРОС / ДЕЙСТВИЕ</h2><pre id="input"></pre></article><article><h2>ФАКТИЧЕСКИЙ ОТВЕТ СЕРВЕРА / SQL</h2><pre id="result"></pre></article></section><div id="history"></div></main><footer><span>127.0.0.1:3000/api/v1 · отдельная настоящая БД PostgreSQL</span><span id="coverage">0 / 52 операций API</span></footer></html>`)
const consoleHtml = await page.content()
async function screen(title, caption, route, input, result, status = '') {
  await page.evaluate(({title,caption,route,input,result,status,history,count}) => {
    for (const [id,value] of Object.entries({title,caption,route,input,result,status})) document.getElementById(id).textContent = value
    document.getElementById('history').textContent = history
    document.getElementById('coverage').textContent = `${count} / 52 операций API`
  }, { title, caption, route, input: typeof input === 'string' ? input : JSON.stringify(compact(clean(input)), null, 2), result: typeof result === 'string' ? result : JSON.stringify(compact(clean(result)), null, 2), status, history: events.slice(-3).map(e => e.label + ' · ' + e.status).join('   →   '), count: covered.size })
}
async function card(title, caption, result, ms = hold) {
  await screen(title, caption, 'PostgreSQL · реальные данные', {}, result)
  events.push({ time: (Date.now()-started)/1000, label: title, status: 'SQL / пояснение', result: clean(result) })
  await page.waitForTimeout(ms)
}
async function call(label, method, route, {role='guest', body, expected, note='Запрос выполняется сейчас к запущенному API; результат читается из PostgreSQL.'} = {}) {
  const client = clients[role]
  await screen(label, note, `${method} ${route}`, { role, ...(body ? {body} : {}) }, 'Выполняется HTTP-запрос…', 'Ожидание ответа сервера')
  const begin = Date.now()
  const response = await client.http.fetch(api + route, { method, ...(body !== undefined ? {data:body} : {}), headers: client.token ? {Authorization:`Bearer ${client.token}`} : {}, timeout: 240000 })
  const text = await response.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = {text:text.slice(0,800)} }
  const status = response.status()
  console.log(`${label}: HTTP ${status}`)
  const match = operations.find(op => op.method === method && op.regex.test('/api/v1'+route.split('?')[0]))
  if (match) covered.add(`${method} ${match.route}`)
  events.push({time:(Date.now()-started)/1000,label,method,route,role,status,request:clean(body ?? {}),response:clean(json),durationMs:Date.now()-begin})
  await screen(label,note,`${method} ${route}`,{role,...(body ? {body}: {})},json,`HTTP ${status} · ${Date.now()-begin} мс · ${expected?.includes(status) || (!expected && status < 400) ? 'ожидаемый результат' : 'проверить результат'}`)
  await page.waitForTimeout(hold)
  if (expected && !expected.includes(status)) throw new Error(`${label}: expected ${expected}, got ${status}: ${text.slice(0,250)}`)
  return json
}
async function sql(label, query, note) {
  const rows = await prisma.$queryRawUnsafe(query)
  await screen(label,note,`SQL → ${database.pathname.slice(1)}`,query,rows,'Выполнено непосредственно в PostgreSQL')
  events.push({time:(Date.now()-started)/1000,label,status:'SQL',query,result:clean(rows)})
  await page.waitForTimeout(hold+1300)
}
try {
  await card('Backend: полный обзор на настоящей БД', 'Никаких mock-ответов: реальные HTTP-запросы, реальные транзакции PostgreSQL и обращения к Росздравнадзору. Demo seed обозначен отдельно от внешних данных.', { chapters:['1. PostgreSQL, миграции и 3НФ','2. Каталог и характеристики','3. Авторизация и ограничения доступа','4. Избранное, сравнение, отзывы и модерация','5. Организация и уведомления','6. Внешний реестр, классификация и аналитика','7. Интерфейс, Swagger и результаты'],database:database.pathname.slice(1),email:'Отправка почты не настроена; это будет показано явно.',secrets:'Пароли и токены скрыты'}, 7000)
  await sql('Доказательство: подключён настоящий PostgreSQL', "SELECT current_database() AS database, version() AS postgres, (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS migrations, (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name<>'_prisma_migrations') AS domain_tables", 'Прямой SQL-запрос. Миграции применены к отдельной базе, созданной для демонстрации.')
  await sql('Нормализованная схема: характеристики и справочники', "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('products','manufacturers','countries','characteristic_definitions','product_characteristic_values','reviews','review_statuses','sync_runs') ORDER BY table_name", 'Производители, страны, определения характеристик, значения и статусы хранятся в связанных таблицах. ERD и зависимости описаны в backend/docs/database.md.')
  await call('Готовность API и соединение с БД','GET','/health',{expected:[200]})
  await call('Фильтры и справочники каталога','GET','/catalog/filters',{expected:[200]})
  const products = await call('Каталог: сортировка и пагинация','GET','/products?limit=4&sort=price-asc',{expected:[200],note:'Начальные четыре изделия — помеченные seed-данные в настоящих таблицах. Реальные записи ведомства импортируем далее.'})
  const ids = products.data.map(p=>p.id), productId = ids[0]
  await call('Поиск по регистрационному номеру','GET','/products?search=21851',{expected:[200]})
  await call('Комбинация фильтров','GET','/products?countryIso2=RU&originType=domestic&riskClass=2b&page=1&limit=2',{expected:[200]})
  await call('Карточка: характеристики, рейтинг и цены','GET',`/products/${productId}`,{expected:[200]})
  await call('Подходящие аналоги','GET',`/products/${productId}/analogues`,{expected:[200]})
  await call('Документы изделия','GET',`/products/${productId}/documents`,{expected:[200],note:'Метаданные документов читаются из product_documents. Здесь демонстрируются документы начального seed.'})
  await call('Опубликованные отзывы','GET',`/products/${productId}/reviews`,{expected:[200]})
  await call('Валидация: отрицательная цена отклоняется','GET','/products?priceMin=-1',{expected:[422,400]})
  await call('Без токена закрытый кабинет недоступен','GET','/organization/dashboard',{expected:[401]})
  const stamp=Date.now(), email=`viewer-${stamp}@video.example.test`
  const user=await call('Регистрация нового пользователя','POST','/auth/register',{body:{email,password,displayName:'Участник видеодемонстрации'},expected:[201]})
  clients.user.token=user.data.accessToken
  await call('Текущий пользователь и роли','GET','/auth/me',{role:'user',expected:[200]})
  await call('RBAC: пользователь не получает госаналитику','GET','/government/analytics',{role:'user',expected:[403]})
  await call('Членство: чужая организация недоступна','GET','/organization/dashboard',{role:'user',expected:[403]})
  const login=await call('Вход по email и паролю','POST','/auth/login',{body:{email,password},role:'user',expected:[200]});clients.user.token=login.data.accessToken
  const refreshed=await call('Ротация refresh-cookie','POST','/auth/refresh',{role:'user',expected:[200],note:'HttpOnly refresh-cookie хранится в cookie jar клиента. Сервер отзывает использованный токен и создаёт следующий; сами токены скрыты.'});clients.user.token=refreshed.data.accessToken
  const clinic=await call('Вход сотрудника медорганизации','POST','/auth/login',{body:{email:'clinic@medizdeliya.local',password},role:'clinic',expected:[200]});clients.clinic.token=clinic.data.accessToken
  const admin=await call('Вход администратора','POST','/auth/login',{body:{email:'admin@video.example.test',password:adminPassword},role:'admin',expected:[200]});clients.admin.token=admin.data.accessToken
  const list=await call('Создать сохранённый список','POST','/saved-lists',{role:'user',body:{name:'Закупка — видеодемонстрация'},expected:[201]});const listId=list.data.id
  await call('Все сохранённые списки пользователя','GET','/saved-lists',{role:'user',expected:[200]})
  await call('Добавить изделие в список','POST',`/saved-lists/${listId}/products/${productId}`,{role:'user',expected:[201]})
  await call('Прочитать список из БД','GET',`/saved-lists/${listId}`,{role:'user',expected:[200]})
  await call('Переименовать список','PATCH',`/saved-lists/${listId}`,{role:'user',body:{name:'План закупки 2027'},expected:[200]})
  await call('Удалить изделие из списка','DELETE',`/saved-lists/${listId}/products/${productId}`,{role:'user',expected:[200,204]})
  await call('Удалить временный список','DELETE',`/saved-lists/${listId}`,{role:'user',expected:[204]})
  const comparison=await call('Создать сравнение','POST','/comparisons',{role:'user',body:{name:'Выбор оборудования'},expected:[201]});const comparisonId=comparison.data.id
  await call('Все сравнения пользователя','GET','/comparisons',{role:'user',expected:[200]})
  for(let i=0;i<3;i++)await call(`Добавить в сравнение: позиция ${i+1}`,'POST',`/comparisons/${comparisonId}/products/${ids[i]}`,{role:'user',expected:[201]})
  await call('Четвёртое изделие: ограничение на уровне сервера','POST',`/comparisons/${comparisonId}/products/${ids[3]}`,{role:'user',expected:[409,422],note:'В сравнении максимум три изделия. Ограничение защищено транзакцией и блокировкой строки, а не только интерфейсом.'})
  await call('Сравнение с актуальными характеристиками','GET',`/comparisons/${comparisonId}`,{role:'user',expected:[200]})
  await call('Переименовать сравнение','PATCH',`/comparisons/${comparisonId}`,{role:'user',body:{name:'Мониторы: итоговый выбор'},expected:[200]})
  await call('Удалить позицию сравнения','DELETE',`/comparisons/${comparisonId}/products/${productId}`,{role:'user',expected:[200,204]})
  await call('Удалить временное сравнение','DELETE',`/comparisons/${comparisonId}`,{role:'user',expected:[204]})
  const review=await call('Создать отзыв: только на модерацию','POST',`/products/${productId}/reviews`,{role:'user',body:{rating:5,title:'Проверено в видеодемонстрации',body:'Отзыв создан настоящим HTTP-запросом и сохранён в PostgreSQL.',experience:'over_6_months'},expected:[201]});const reviewId=review.data.id
  await call('Мои отзывы и их статусы','GET','/me/reviews',{role:'user',expected:[200]})
  await call('Очередь модерации администратора','GET','/admin/reviews?status=moderation',{role:'admin',expected:[200]})
  await call('Публикация отзыва модератором','PATCH',`/admin/reviews/${reviewId}/status`,{role:'admin',body:{status:'published',comment:'Проверено во время записи'},expected:[200]})
  await call('История модерации','GET',`/admin/reviews/${reviewId}/history`,{role:'admin',expected:[200]})
  await call('Опубликованный отзыв доступен всем','GET',`/products/${productId}/reviews`,{expected:[200],note:'После публикации отзыв участвует в вычисляемом рейтинге. Рейтинг не хранится как произвольное число в products.'})
  await sql('Доказательство записи отзыва в БД',`SELECT r.title, r.rating, s.code AS status FROM reviews r JOIN review_statuses s ON s.id=r.review_status_id WHERE r.id='${reviewId}'::uuid`, 'Данные HTTP mutation сразу видны прямому SQL-запросу к PostgreSQL.')
  await call('Сводка кабинета организации','GET','/organization/dashboard',{role:'clinic',expected:[200]})
  await call('Сотрудники и членство организации','GET','/organization/members',{role:'clinic',expected:[200]})
  const notifications=await call('Личные уведомления','GET','/me/notifications',{role:'clinic',expected:[200]})
  const notificationId=notifications.data[0]?.id
  if(!notificationId)throw new Error('Seed clinic notification missing')
  await call('Отметить одно уведомление прочитанным','PATCH',`/me/notifications/${notificationId}/read`,{role:'clinic',expected:[200]})
  await call('Уведомления сотрудника организации','GET','/organization/notifications',{role:'clinic',expected:[200]})
  await call('Отметить уведомление через кабинет','PATCH',`/organization/notifications/${notificationId}/read`,{role:'clinic',expected:[200]})
  await call('Отметить все личные уведомления','PATCH','/me/notifications/read-all',{role:'clinic',expected:[200]})
  await call('Аналитика из вычисляемых представлений','GET','/government/analytics',{role:'admin',expected:[200]})
  await call('Обновление materialized views','POST','/government/analytics/refresh',{role:'admin',expected:[200,201]})
  await call('Проблемные изделия: серверная пагинация','GET','/government/problem-products?page=1&limit=3',{role:'admin',expected:[200]})
  await call('Демонстрационный источник явно помечен mock','POST','/government/sync/run',{role:'admin',body:{scenario:'partial'},expected:[200,201],note:'Это отдельно обозначенный MockRegistryProvider, а не внешний API. Следующим запросом запустим настоящий Росздравнадзор.'})
  await call('Журнал демонстрационного источника','GET','/government/sync?source=mock-registry',{role:'admin',expected:[200]})
  const registry=await call('Настоящий внешний API Росздравнадзора','POST','/government/sync/registry/run',{role:'admin',body:{pageSize:5,maxPages:1},expected:[202],note:'Реальная сеть, проверка TLS включена. Ограничиваем импорт пятью записями; итог partial ожидаем, это не полный реестр.'})
  for(let i=0;i<40;i++){
    const state=await clients.admin.http.get(api+'/government/sync?source=roszdravnadzor-registry',{headers:{Authorization:`Bearer ${clients.admin.token}`}});const j=await state.json()
    if(!JSON.stringify(j).includes('"running"'))break
    await page.waitForTimeout(1000)
  }
  await call('Результат и журнал настоящего импорта','GET','/government/sync?source=roszdravnadzor-registry',{role:'admin',expected:[200]})
  await call('Замечания конкретного запуска','GET',`/government/sync/runs/${registry.data.runId}/errors`,{role:'admin',expected:[200]})
  await sql('Доказательство: записи Росздравнадзора находятся в БД', 'SELECT external_registry_id, name, registration_number, verified_at FROM products WHERE external_registry_id IS NOT NULL ORDER BY external_registry_id LIMIT 5', 'Это не seed: external_registry_id получен из настоящего ответа ведомства и сохранён backend в products.')
  await call('Импорт официальной номенклатуры','POST','/government/sync/nomenclature/run',{role:'admin',expected:[200,201,502],note:'Запрос к официальному ZIP/XML источнику. Загрузка может занять время. Статус partial означает замечания в самой выгрузке; ошибки источника показываются честно.'})
  await call('Сводка номенклатуры и версии источника','GET','/nomenclature/summary',{expected:[200]})
  const types=await call('Поиск и пагинация видов изделий','GET','/nomenclature?limit=2',{expected:[200]})
  await call('Дерево разделов классификации','GET','/nomenclature/sections',{expected:[200]})
  await call('Детали вида и пути разделов','GET',`/nomenclature/${types.data[0]?.code ?? 100010}`,{expected:types.data.length?[200]:[404]})
  await call('Восстановление: почта не настроена','POST','/auth/recovery/request',{body:{email},expected:[503],note:'Почтовые credentials оператора не заданы. Backend честно возвращает 503, не обещает отправленное письмо и не раскрывает токен.'})
  const resetToken=randomBytes(32).toString('base64url')
  await prisma.passwordResetToken.create({data:{userId:user.data.user.id,tokenHash:createHash('sha256').update(resetToken).digest('hex'),expiresAt:new Date(Date.now()+600000)}})
  await card('Демонстрация смены пароля без отправки письма','Для следующего шага оператор подготовил одноразовый токен непосредственно в отдельной demo БД. Это тестовая подготовка, не имитация успешной доставки email.', {stored:'В PostgreSQL записан только SHA-256 hash токена',emailDelivery:'Не настроена; реального письма нет',next:'Настоящий endpoint подтверждения сменит пароль и отзовёт refresh-сессии'},5000)
  await call('Подтверждение смены пароля','POST','/auth/recovery/confirm',{body:{token:resetToken,password},expected:[200,204]})
  await call('Повторное использование токена запрещено','POST','/auth/recovery/confirm',{body:{token:resetToken,password},expected:[400,401,422]})
  await call('Выход и отзыв refresh-cookie','POST','/auth/logout',{role:'user',expected:[200,204]})
  await call('После выхода refresh больше не работает','POST','/auth/refresh',{role:'user',expected:[401]})
  await card('Переходим в интерфейс приложения','Следующие экраны работают через HttpApiClient. Данные поступают с того же запущенного API и настоящего PostgreSQL.', {frontend:web,backend:api,database:database.pathname.slice(1),covered:`${covered.size} / 52 операций API`},5000)
  async function banner(text){await page.evaluate(text=>{document.getElementById('video-banner')?.remove();const el=document.createElement('div');el.id='video-banner';el.textContent=text;el.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#10243a;color:#fff;padding:17px 32px;font:20px Arial;border-top:3px solid #43ceab';document.body.append(el)},text)}
  await page.goto(web+'/catalog');await page.getByText('Монитор пациента МП-12').first().waitFor();await banner('Каталог через настоящий HTTP API · seed и импортированные записи в PostgreSQL');await page.waitForTimeout(5000)
  await page.goto(web+'/products/'+productId);await page.waitForTimeout(2000);await banner('Карточка: связанные характеристики, документы, аналоги и вычисляемый рейтинг');await page.waitForTimeout(5000);await page.mouse.wheel(0,620);await page.waitForTimeout(4000)
  await page.goto(web+'/auth/login');await page.getByLabel('Электронная почта').fill('clinic@medizdeliya.local');await page.getByLabel('Пароль').fill(password);await page.getByRole('button',{name:'Войти',exact:true}).click();await page.waitForURL('**/organization');await banner('Кабинет медорганизации · реальные счётчики, членство и списки');await page.waitForTimeout(5000)
  await page.goto(web+'/compare');await page.waitForTimeout(1800);await banner('Сравнение: серверная коллекция и нормализованные характеристики');await page.waitForTimeout(5000)
  await page.goto(web+'/government/analytics');await page.waitForTimeout(1800);await banner('Проверка RBAC: сотрудник клиники не получает доступ к госразделу');await page.waitForTimeout(3500)
  await page.goto(api+'/docs');await page.waitForTimeout(2000);await banner('Swagger / OpenAPI · 52 операции · http://127.0.0.1:3000/api/v1/docs');await page.waitForTimeout(4500);await page.mouse.wheel(0,600);await page.waitForTimeout(3000)
  await page.setContent(consoleHtml)
  const missing=operations.filter(o=>!covered.has(`${o.method} ${o.route}`)).map(o=>`${o.method} ${o.route}`)
  await card('Результат видеодемонстрации', 'Все показанные ответы получены с работающего backend. Приложение и БД остаются запущенными. Запись без звука; пояснения встроены в кадр.', {apiOperations:`${covered.size} / ${operations.length}`,notDemonstrated:missing,sql:'Реальные запросы к PostgreSQL; 53 таблицы и 9 миграций',externalRegistry:'Настоящий сетевой запрос и проверка записей SQL',email:'Доставка не настроена; 503 показан, подтверждение проверено с подготовленным токеном',web,swagger:api+'/docs'},9000)
  if(missing.length)throw new Error('Missing API operations: '+missing.join(', '))
} catch(error) {
  events.push({error:String(error),time:(Date.now()-started)/1000})
  console.error(String(error));process.exitCode=1
} finally {
  await writeFile(path.join(output,'backend-demo-transcript.json'),JSON.stringify({database:database.pathname.slice(1),started:new Date(started).toISOString(),durationSeconds:(Date.now()-started)/1000,operations:covered.size,events},null,2))
  await writeFile(path.join(output,'chapters.txt'),events.map(e=>`${Math.floor((e.time??0)/60).toString().padStart(2,'0')}:${Math.floor((e.time??0)%60).toString().padStart(2,'0')}  ${e.label??e.error} ${e.status??''}`).join('\n'))
  await page.screenshot({path:path.join(output,'final-frame.png')})
  await context.close();await video.saveAs(path.join(output,'backend-full-demo.webm'));await browser.close()
  for(const client of Object.values(clients))await client.http.dispose()
  await prisma.$disconnect()
  console.log(JSON.stringify({output,operations:covered.size,total:operations.length,seconds:Math.round((Date.now()-started)/1000)}))
}
