// Test DANG VIDEO QUA PHONE AGENT (electron/services/phoneagent/*). Chay (Node >= 23):
//   node tests/test_phoneagent.mts
// HOME tam + may chu Phone Agent GIA (http cuc bo) mo phong DUNG hanh vi da doc trong source phoneclaw-dashboard:
//  - /run chi nhan iPhone 'online' (running / offline -> 400); KHONG tra executionId; execution tao SAU khi tra loi,
//    scheduleName "API: <ten kich ban>"; kich ban dung chung + khong bien -> khong tao execution (loi cua may chu).
//  - send_file: iPhone TU TAI url cua video da dang ky (o day: may chu gia GET that link video).
//  - execution ket thuc "success" ca khi buoc send_file loi (chi launch loi moi dung).
// Can dam bao:
//  1. Ket noi: /me, token sai -> cau tieng Viet; base URL chuan hoa.
//  2. Bien kich ban: inputs khai bao (video / caption), kich ban cu (do {{bien}}), canh bao thieu send_file / video co dinh.
//  3. Luong dang: tai len -> dang ky -> chay dung bien (id video, caption bo ky tu dieu khien) -> theo doi -> thanh cong;
//     don video Phone Agent + file tam.
//  4. send_file loi nhung execution "success" -> luot dang = LOI.
//  5. iPhone dang ban -> cho, ranh -> chay; moi iPhone 1 luot 1 luc.
//  6. Hen gio: chua toi gio khong chay; huy; doi gio; dang lai.
//  7. Kich ban khong co bien video (send_file) -> loi ro rang truoc khi chay (luon gui bien video -> tranh loi kich ban
//     dung chung khong bien cua may chu).
//  8. Automation: video xong -> tu len lich (khung gio / bien mau tu tin); video xong truoc khi bat -> khong dang; 1 lan / video.
//  9. Mo lai app: luot 'starting' -> loi (khong dang trung); 'running' + executionId -> theo doi tiep.
import { register } from 'node:module'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

register('./helpers/electron-mock-loader.mjs', import.meta.url)

const HOME = mkdtempSync(join(tmpdir(), 'phoneagent-test-'))
process.env.HOME = HOME
process.env.USERPROFILE = HOME
process.env.STUDIO_LICENSE = 'off'
process.env.STUDIO_PA_TIME_SCALE = '100'
;(globalThis as any).__USERDATA = join(HOME, 'userdata')
mkdirSync((globalThis as any).__USERDATA, { recursive: true })

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)?.slice(0, 700)))
  if (!cond) FAILS.push(name)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(fn: () => boolean, ms = 8000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (fn()) return true
    await sleep(25)
  }
  return fn()
}

// ------------------------------------------------------------------ may chu Phone Agent gia
const TOKEN = 'pa_live_' + 'a'.repeat(64)
let nid = 0
const gid = () => Date.now().toString(36) + String(++nid).padStart(6, '0')
type Dev = { id: string; name: string; status: string; battery: number; model: string }
const devices: Dev[] = [
  { id: 'd1', name: 'iPhone A', status: 'online', battery: 90, model: 'iPhone 12' },
  { id: 'd2', name: 'iPhone B', status: 'running', battery: 50, model: 'iPhone 11' }
]
const scripts: any[] = [
  {
    id: 's1',
    name: 'Đăng TikTok',
    channel: 'tiktok_vn',
    inputs: [
      { name: 'video_id', label: 'Video', type: 'video', required: true },
      { name: 'caption', label: 'Caption', type: 'text', required: true, maxLength: 2200 },
      { name: 'hashtags', label: 'Hashtags', type: 'string', default: '#fyp' }
    ],
    steps: [
      { id: 'n1', type: 'launch', params: { bundleId: 'com.ss.iphone.ugc.Ame' } },
      { id: 'n2', type: 'send_file', params: { videoId: '{{video_id}}' } },
      { id: 'n3', type: 'type', params: { text: '{{caption}} {{hashtags}}' } },
      { id: 'n4', type: 'screenshot', params: {} }
    ]
  },
  {
    id: 's2',
    name: 'Đăng cũ',
    steps: [
      { type: 'launch', params: { bundleId: 'x' } },
      { type: 'repeat', params: { count: 1 }, children: [{ type: 'send_file', params: { videoId: '{{video_id}}' } }] },
      { type: 'type', params: { text: '{{caption}}' } },
      { type: 'type', params: { text: '{{Hashtag}}' } }
    ]
  },
  { id: 's3', name: 'Không truyền file', steps: [{ type: 'type', params: { text: '{{caption}}' } }] },
  { id: 's4', name: 'Video cố định', steps: [{ type: 'send_file', params: { videoId: 'abc123' } }] }
]
const sharedScripts: any[] = [{ id: 'sh1', name: 'Dùng chung', steps: [{ type: 'launch', params: {} }], isShared: true }]
const videos = new Map<string, any>()
const deletedVideos: string[] = []
const executions: any[] = []
const runs: { scriptId: string; deviceId: string; variables: Record<string, string> }[] = []
/** kich ban s1: buoc send_file loi (gia lap iPhone khong tai duoc) */
let failSendFile = false
let execDelayMs = 150

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
async function bodyOf(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}')
  } catch {
    return {}
  }
}
function inject(steps: any[], vars: Record<string, string>): any[] {
  let s = JSON.stringify(steps)
  for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(JSON.stringify(v).slice(1, -1))
  return JSON.parse(s)
}
function flat(steps: any[]): any[] {
  const out: any[] = []
  for (const st of steps) {
    if (st.type === 'repeat') out.push(...flat(st.children || []))
    else out.push(st)
  }
  return out
}
async function runExec(ex: any, steps: any[], dev: Dev) {
  dev.status = 'running'
  for (const [i, st] of flat(steps).entries()) {
    const step: any = { index: i, type: st.type, description: st.type, status: 'running', startedAt: new Date().toISOString() }
    ex.steps.push(step)
    await sleep(40)
    if (st.type === 'send_file') {
      const v = videos.get(String(st.params.videoId))
      if (!v) {
        step.status = 'error'
        step.error = 'Video not found: ' + st.params.videoId
        continue
      }
      if (failSendFile) {
        step.status = 'error'
        step.error = 'Timeout tải file'
        continue
      }
      // iPhone tai that link video
      try {
        const r = await fetch(v.url)
        const b = Buffer.from(await r.arrayBuffer())
        ex._downloaded = b.length
        if (!r.ok || !b.length) throw new Error('HTTP ' + r.status)
      } catch (e) {
        step.status = 'error'
        step.error = 'Gửi file thất bại: ' + String(e)
        continue
      }
    }
    if (st.type === 'screenshot') step.screenshotUrl = 'data:image/jpeg;base64,' + Buffer.from('JPEGDATA').toString('base64')
    step.status = 'success'
    step.finishedAt = new Date().toISOString()
  }
  ex.status = 'success'
  ex.finishedAt = new Date().toISOString()
  dev.status = 'online'
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://x')
  const path = u.pathname.replace(/^\/api\/v1\/external/, '')
  if (req.headers['x-api-token'] !== TOKEN) {
    return send(res, 401, { success: false, error: req.headers['x-api-token'] ? 'Invalid or revoked API token' : 'API token required. Use header: X-API-Token: pa_live_xxx' })
  }
  const ok = (data: unknown) => send(res, 200, { success: true, data })
  let m: RegExpMatchArray | null
  if (path === '/me') return ok({ id: 'u1', name: 'Test User', email: 't@x.vn', role: 'user', stats: { totalDevices: 2, onlineDevices: 1, totalScripts: 4, totalSchedules: 0 } })
  if (path === '/devices') return ok(devices)
  if ((m = path.match(/^\/devices\/([^/]+)$/))) {
    const d = devices.find((x) => x.id === m![1])
    return d ? ok(d) : send(res, 404, { success: false, error: 'Device not found' })
  }
  if (path === '/scripts') return ok({ own: scripts.map(({ inputs, ...s }) => (void inputs, s)), shared: sharedScripts })
  if ((m = path.match(/^\/scripts\/([^/]+)\/inputs$/))) {
    const s = scripts.find((x) => x.id === m![1]) || sharedScripts.find((x) => x.id === m![1])
    return s ? ok({ scriptId: s.id, name: s.name, inputs: s.inputs || [] }) : send(res, 404, { success: false, error: 'Script not found' })
  }
  if ((m = path.match(/^\/scripts\/([^/]+)$/))) {
    const s = scripts.find((x) => x.id === m![1]) || sharedScripts.find((x) => x.id === m![1])
    return s ? ok(s) : send(res, 404, { success: false, error: 'Script not found' })
  }
  if ((m = path.match(/^\/scripts\/([^/]+)\/run$/)) && req.method === 'POST') {
    const b = await bodyOf(req)
    const dev = devices.find((x) => x.id === b.deviceId)
    if (!b.deviceId) return send(res, 400, { success: false, error: 'deviceId is required' })
    if (!dev) return send(res, 403, { success: false, error: 'Device not found or not owned by you' })
    if (dev.status !== 'online') return send(res, 400, { success: false, error: `Device is ${dev.status}, must be online` })
    const own = scripts.find((x) => x.id === m![1])
    const shared = sharedScripts.find((x) => x.id === m![1])
    const s = own || shared
    if (!s) return send(res, 404, { success: false, error: 'Script not found' })
    const vars: Record<string, string> = {}
    for (const [k, v] of Object.entries(b.variables || {})) if (/^[a-z_][a-z0-9_]{0,63}$/.test(k) && v != null) vars[k] = String(v)
    for (const inp of s.inputs || []) if ((vars[inp.name] === undefined || vars[inp.name] === '') && inp.default !== undefined) vars[inp.name] = String(inp.default)
    for (const inp of s.inputs || []) {
      if (inp.required && !vars[inp.name]) return send(res, 400, { success: false, error: `Input "${inp.name}": bắt buộc nhưng không có giá trị`, field: inp.name })
      if (inp.type === 'video' && !videos.has(vars[inp.name])) return send(res, 400, { success: false, error: `Input "${inp.name}": video không tồn tại`, field: inp.name })
    }
    runs.push({ scriptId: s.id, deviceId: dev.id, variables: vars })
    const hasVars = Object.keys(vars).length > 0
    setTimeout(() => {
      // bug that cua may chu: kich ban dung chung + khong bien -> khong tao execution
      if (shared && !hasVars) return
      const ex: any = { id: gid(), scheduleId: '', scheduleName: 'API: ' + s.name, scriptName: s.name, targetName: dev.name, startedAt: new Date().toISOString(), status: 'running', steps: [] }
      executions.push(ex)
      runExec(ex, inject(s.steps, vars), dev)
    }, execDelayMs)
    return ok({ message: 'started', scriptId: s.id, deviceId: dev.id, hasVariables: hasVars, resolvedVariables: Object.keys(vars) })
  }
  if (path === '/executions') {
    const lim = Number(u.searchParams.get('limit')) || 50
    return ok(executions.slice(-lim).reverse().map(({ _downloaded, ...e }) => (void _downloaded, e)))
  }
  if ((m = path.match(/^\/executions\/([^/]+)$/))) {
    const e = executions.find((x) => x.id === m![1])
    if (!e) return send(res, 404, { success: false, error: 'Execution not found' })
    const { _downloaded, ...rest } = e
    void _downloaded
    return ok(rest)
  }
  if (path === '/videos/register' && req.method === 'POST') {
    const b = await bodyOf(req)
    if (!/^https?:\/\//i.test(String(b.url || ''))) return send(res, 400, { success: false, error: 'url must start with http:// or https://' })
    let reachable = false
    try {
      reachable = (await fetch(b.url, { method: 'HEAD' })).ok
    } catch {
      /* */
    }
    const v = { id: gid(), name: b.name, url: b.url, size: b.size || 0, mimeType: b.mimeType, source: 'url', urlReachable: reachable }
    videos.set(v.id, v)
    return ok(v)
  }
  if ((m = path.match(/^\/videos\/([^/]+)$/)) && req.method === 'DELETE') {
    videos.delete(m[1])
    deletedVideos.push(m[1])
    return send(res, 200, { success: true })
  }
  send(res, 404, { success: false, error: 'not found' })
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
const PORT = (server.address() as any).port
const BASE = `http://127.0.0.1:${PORT}/api/v1/external`

// ------------------------------------------------------------------ noi luu tam video gia (thay may chu ban quyen)
const hosted = new Map<string, string>()
const removed: string[] = []
const fileSrv = createServer((req, res) => {
  const id = (req.url || '').split('/')[2]
  const f = hosted.get(id)
  if (!f) {
    res.writeHead(404)
    return res.end()
  }
  const b = readFileSync(f)
  res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(b.length) })
  res.end(req.method === 'HEAD' ? undefined : b)
})
await new Promise<void>((r) => fileSrv.listen(0, '127.0.0.1', () => r()))
const FPORT = (fileSrv.address() as any).port
let uploads = 0

const C = await import('../electron/services/phoneagent/client.ts')
const A = await import('../electron/services/phoneagent/api.ts')
const P = await import('../electron/services/phoneagent/posts.ts')
P.setVideoHost({
  upload: async (file: string, onProgress?: (s: number, t: number) => void) => {
    uploads++
    const id = 'h' + uploads
    hosted.set(id, file)
    const size = readFileSync(file).length
    onProgress?.(size, size)
    return { id, url: `http://127.0.0.1:${FPORT}/f/${id}/video.mp4`, size, expires_at: Date.now() + 48 * 3600e3 }
  },
  remove: async (id: string) => {
    removed.push(id)
    hosted.delete(id)
  }
})

const VIDEO = join(HOME, 'final.mp4')
writeFileSync(VIDEO, Buffer.alloc(50000, 7))
const find = (id: string) => P.listPosts().find((p) => p.id === id)!

// ------------------------------------------------------------------ 1. ket noi
console.log('[1] ket noi')
{
  check('base mac dinh', C.normalizeBase('') === 'https://phoneagent.io.vn/api/v1/external')
  check('base: trang chu -> them /api/v1/external', C.normalizeBase('phone.example.com/') === 'https://phone.example.com/api/v1/external')
  check('base: da du -> giu', C.normalizeBase('https://x.vn/api/v1/external/') === 'https://x.vn/api/v1/external')
  let e: any = null
  try {
    await A.paMe('pa_live_wrong', BASE)
  } catch (x) {
    e = x
  }
  check('token sai -> 401 + cau tieng Viet', e?.status === 401 && /thu hồi|không hợp lệ/.test(e.message), e?.message)
  const me = await A.paMe(TOKEN, BASE)
  check('/me ok', me.name === 'Test User' && me.stats?.onlineDevices === 1)
  // fetch cua Node loi mang ("fetch failed", nguyen nhan trong cause) -> tu thu lai bang net.fetch cua Electron
  const realFetch = globalThis.fetch
  let undiciFails = 1
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => {
    if (undiciFails-- > 0) throw new TypeError('fetch failed', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })
    return realFetch(...a)
  }) as typeof fetch
  const me2 = await A.paMe(TOKEN, BASE).catch((e) => e)
  check('undici loi mang -> net.fetch thu lai thanh cong', (me2 as any)?.name === me.name, me2)
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('unable to get local issuer certificate'), { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' }) })
  }) as typeof fetch
  const bad = await A.paMe(TOKEN, BASE).catch((e) => e)
  globalThis.fetch = realFetch
  check('loi mang hien nguyen nhan that', /UNABLE_TO_GET_ISSUER_CERT_LOCALLY/.test(String((bad as Error)?.message)) && /Chromium/.test(String((bad as Error)?.message)), String((bad as Error)?.message))
  C.setPhoneAgentConfig({ token: TOKEN, base: BASE })
  const mk = C.phoneAgentMasked()
  check('luu token + base (che token)', mk.has_key && mk.base === BASE && !mk.key_hint.includes('aaaaaaaaaaaa'), mk)
  const devs = await A.paDevices()
  check('/devices', devs.length === 2 && devs[0].status === 'online')
  const sc = await A.paScripts()
  check('/scripts own + shared', sc.length === 5 && sc.find((s) => s.id === 'sh1')?.shared)
}

// ------------------------------------------------------------------ 2. bien kich ban
console.log('[2] bien kich ban')
{
  const f1 = await A.paScriptFields('s1')
  check('inputs khai bao: video_id = video', f1.declared && f1.videoVar === 'video_id' && f1.fields.find((f) => f.name === 'video_id')?.role === 'video', f1)
  check('inputs khai bao: caption = caption', f1.fields.find((f) => f.name === 'caption')?.role === 'caption' && !f1.warnings.length, f1)
  check('chi 1 o caption (hashtags la bien thuong)', f1.fields.filter((f) => f.role === 'caption').length === 1 && f1.fields.find((f) => f.name === 'hashtags')?.role === 'other', f1.fields)
  const f2 = await A.paScriptFields('s2')
  check('kich ban cu: do {{bien}} ca trong repeat', !f2.declared && f2.videoVar === 'video_id' && f2.fields.some((f) => f.name === 'caption' && f.role === 'caption'), f2)
  check('kich ban cu: canh bao bien CHU HOA', f2.warnings.some((w) => w.includes('Hashtag')), f2.warnings)
  const f3 = await A.paScriptFields('s3')
  check('khong co send_file -> canh bao + khong co bien video', !f3.videoVar && f3.warnings.some((w) => /Truyền file/.test(w)), f3)
  const f4 = await A.paScriptFields('s4')
  check('send_file chon video co dinh -> canh bao sua {{video_id}}', !f4.videoVar && f4.warnings.some((w) => /cố định/.test(w)), f4)
}

P.startPosts()

// ------------------------------------------------------------------ 3. luong dang thanh cong
console.log('[3] dang ngay — thanh cong')
{
  const job = P.createPost({
    video: VIDEO,
    title: 'Video test',
    origin: { kind: 'edit', refId: 'proj1' },
    deviceId: 'd1',
    deviceName: 'iPhone A',
    scriptId: 's1',
    variables: { caption: 'Xin chào\u0007 "TikTok" 🔥\nDòng 2', video_id: 'BI_GHI_DE' }
  })
  check('tao luot -> scheduled', job.status === 'scheduled')
  const done = await until(() => ['success', 'error'].includes(find(job.id).status), 15000)
  const p = find(job.id)
  check('luot dang -> success', done && p.status === 'success', p)
  const run = runs[runs.length - 1]
  const vid = run?.variables.video_id
  check('chay dung kich ban + iPhone', run?.scriptId === 's1' && run.deviceId === 'd1')
  check('bien video = id video da dang ky (khong bi caption ghi de)', !!vid && vid !== 'BI_GHI_DE' && deletedVideos.includes(vid), run)
  check('caption bo ky tu dieu khien, giu xuong dong + emoji', run?.variables.caption === 'Xin chào "TikTok" 🔥\nDòng 2', run?.variables.caption)
  check('hashtags lay mac dinh cua kich ban', run?.variables.hashtags === '#fyp')
  const ex = executions[executions.length - 1]
  check('iPhone tai duoc link video (du byte)', ex?._downloaded === 50000, ex?._downloaded)
  check('tim dung execution', p.executionId === ex?.id)
  check('don: xoa video Phone Agent + file tam', deletedVideos.includes(vid) && removed.includes('h1') && !p.videoId)
  check('luu buoc + anh man hinh', (p.steps?.length || 0) === 4 && !!p.shot && existsSync(p.shot!) && readFileSync(p.shot!).toString() === 'JPEGDATA', p.steps)
}

// ------------------------------------------------------------------ 4. send_file loi nhung execution "success"
console.log('[4] send_file loi')
{
  failSendFile = true
  const job = P.createPost({ video: VIDEO, title: 'Loi tai', origin: { kind: 'motion', refId: 'mv1' }, deviceId: 'd1', scriptId: 's1', variables: { caption: 'x' } })
  await until(() => ['success', 'error'].includes(find(job.id).status), 15000)
  const p = find(job.id)
  const ex = executions[executions.length - 1]
  check('may chu bao success', ex?.status === 'success')
  check('luot dang -> LOI (buoc chuyen video loi)', p.status === 'error' && /Chuyển video vào iPhone: Timeout tải file/.test(p.error || ''), p)
  failSendFile = false
  const r = P.retryPost(job.id)
  check('dang lai', r.ok)
  await until(() => ['success', 'error'].includes(find(job.id).status) && find(job.id).attempts === 0 && !!find(job.id).finishedAt, 15000)
  check('dang lai -> success', find(job.id).status === 'success', find(job.id))
}

// ------------------------------------------------------------------ 5. iPhone ban
console.log('[5] iPhone dang ban')
{
  const job = P.createPost({ video: VIDEO, title: 'Cho may', origin: { kind: 'edit', refId: 'proj2' }, deviceId: 'd2', scriptId: 's1', variables: { caption: 'c' } })
  await until(() => find(job.id).status === 'waiting', 8000)
  check('may running -> waiting', find(job.id).status === 'waiting' && /Chờ iPhone/.test(find(job.id).message || ''), find(job.id))
  const before = runs.length
  await sleep(300)
  check('chua gui lenh chay', runs.length === before)
  devices[1].status = 'online'
  await until(() => find(job.id).status === 'success', 15000)
  check('may ranh -> dang xong', find(job.id).status === 'success', find(job.id))

  // 2 luot cung 1 may -> tuan tu
  execDelayMs = 100
  const a = P.createPost({ video: VIDEO, title: 'A', origin: { kind: 'edit', refId: 'pa' }, deviceId: 'd1', scriptId: 's1', variables: { caption: 'a' } })
  const b = P.createPost({ video: VIDEO, title: 'B', origin: { kind: 'edit', refId: 'pb' }, deviceId: 'd1', scriptId: 's1', variables: { caption: 'b' } })
  let overlap = false
  await until(() => {
    const pa = find(a.id)
    const pb = find(b.id)
    if (['starting', 'running'].includes(pa.status) && ['starting', 'running'].includes(pb.status)) overlap = true
    return pa.status === 'success' && pb.status === 'success'
  }, 20000)
  check('2 luot cung iPhone: khong chay chong', !overlap && find(a.id).status === 'success' && find(b.id).status === 'success', [find(a.id), find(b.id)])
}

// ------------------------------------------------------------------ 6. hen gio / huy / doi gio
console.log('[6] hen gio')
{
  const later = Date.now() + 3600e3
  const job = P.createPost({ video: VIDEO, title: 'Hen gio', origin: { kind: 'edit', refId: 'p6' }, deviceId: 'd1', scriptId: 's1', variables: { caption: 'h' }, scheduledAt: later })
  await sleep(500)
  check('chua toi gio -> van scheduled', find(job.id).status === 'scheduled' && find(job.id).scheduledAt === later)
  check('doi gio', P.reschedulePost(job.id, later + 60000).ok && find(job.id).scheduledAt === later + 60000)
  check('huy', P.cancelPost(job.id).ok && find(job.id).status === 'cancelled')
  check('xoa', P.deletePost(job.id).ok && !P.listPosts().some((x) => x.id === job.id))
  let err = ''
  try {
    P.createPost({ video: join(HOME, 'khong-co.mp4'), title: 'x', origin: { kind: 'edit', refId: 'x' }, deviceId: 'd1', scriptId: 's1' })
  } catch (e) {
    err = String(e)
  }
  check('file khong ton tai -> tu choi', /Không thấy file video/.test(err), err)
}

// ------------------------------------------------------------------ 7. kich ban dung chung khong tao execution
console.log('[7] kich ban khong co bien video')
{
  const job = P.createPost({ video: VIDEO, title: 'Shared', origin: { kind: 'edit', refId: 'p7' }, deviceId: 'd1', scriptId: 's3', variables: { caption: '' } })
  await until(() => find(job.id).status === 'error', 15000)
  check('kich ban khong co bien video -> loi ro rang', find(job.id).status === 'error' && /biến video/.test(find(job.id).error || ''), find(job.id))
}

// ------------------------------------------------------------------ 8. Automation tu dong dang
console.log('[8] automation tu dong dang')
{
  const AU = await import('../electron/services/motion/automation.ts')
  const AP = await import('../electron/services/phoneagent/auto.ts')
  const proj = AU.saveAutoProject({
    name: 'Tin',
    sources: [{ type: 'web', url: 'https://example.com/rss' }],
    defaults: { name: 'Kênh Tin', videoType: 'news', aspect: '9:16', duration: 30, language: 'vi', voice: { enabled: false } } as any,
    post: { enabled: true, deviceId: 'd1', deviceName: 'iPhone A', scriptId: 's1', variables: { caption: '{title} — {source}\n{link}' }, timing: 'slots', slots: ['08:00', '19:30'] }
  } as any)
  const raw = AU.getAutoProject(proj.id)!
  check('luu cau hinh tu dong dang + moc bat', raw.post?.enabled && raw.post.timing === 'slots' && (raw.post.enabledAt || 0) > 0, raw.post)
  let saveErr = ''
  try {
    AU.saveAutoProject({ id: proj.id, name: 'Tin', sources: [{ type: 'web', url: 'https://example.com/rss' }], post: { enabled: true, deviceId: '', scriptId: 's1', variables: {}, timing: 'now' } } as any)
  } catch (e) {
    saveErr = String(e)
  }
  check('bat tu dong dang thieu iPhone -> tu choi', /chọn iPhone/.test(saveErr), saveErr)
  const mkJob = (id: string, finishedAt: number): any => ({
    id,
    kind: 'auto',
    automationId: proj.id,
    title: 'Tin nóng',
    status: 'done',
    output: VIDEO,
    finishedAt,
    createdAt: finishedAt - 1000,
    dir: HOME,
    brief: { name: 'Kênh Tin', source: { id: 'n1', title: 'Giá vàng tăng', url: 'https://example.com/a', sourceName: 'VnE' } }
  })
  AP.maybeQueue(mkJob('mv-old', (raw.post!.enabledAt || 0) - 5000))
  check('video xong TRUOC khi bat -> khong dang', !P.listPosts({ refId: 'mv-old' }).length)
  AP.maybeQueue(mkJob('mv-new', Date.now()))
  AP.maybeQueue(mkJob('mv-new', Date.now()))
  const lst = P.listPosts({ refId: 'mv-new' })
  check('video moi -> 1 luot dang (khong trung)', lst.length === 1, lst)
  const post = lst[0]
  const d = new Date(post?.scheduledAt || 0)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  check('gio dang = khung gio', ['08:00', '19:30'].includes(hm) && post.scheduledAt > Date.now(), hm)
  check('bien mau thay theo tin', post?.variables.caption === 'Giá vàng tăng — VnE\nhttps://example.com/a', post?.variables)
  AP.maybeQueue(mkJob('mv-new2', Date.now()))
  const p2 = P.listPosts({ refId: 'mv-new2' })[0]
  check('video thu 2 -> khung gio KHAC', !!p2 && p2.scheduledAt !== post.scheduledAt, [post?.scheduledAt, p2?.scheduledAt])
  // nextSlot / fillTemplate
  const from = new Date(2026, 0, 1, 10, 0).getTime()
  const ns = P.nextSlot('khong-co', ['08:00', '19:30', 'sai'], from)
  check('nextSlot: khung trong tiep theo', ns === new Date(2026, 0, 1, 19, 30).getTime())
  check('fillTemplate: giu {la}', P.fillTemplate('{title} {la}', { title: 'A' }) === 'A {la}')
  for (const x of P.listPosts({ automationId: proj.id })) P.cancelPost(x.id)
}

// ------------------------------------------------------------------ 9. mo lai app
console.log('[9] mo lai app')
{
  P.stopPosts()
  await sleep(200)
  const file = join(HOME, '.capcut-studio', 'phoneagent', 'posts.json')
  const d = JSON.parse(readFileSync(file, 'utf-8'))
  // execution dang chay tren may chu gia
  const ex: any = { id: gid(), scheduleName: 'API: Đăng TikTok', scriptName: 'Đăng TikTok', targetName: 'iPhone A', startedAt: new Date().toISOString(), status: 'running', steps: [] }
  executions.push(ex)
  const base = { createdAt: Date.now(), title: 'r', video: VIDEO, origin: { kind: 'edit', refId: 'r' }, deviceId: 'd1', deviceName: 'iPhone A', scriptId: 's1', scriptName: 'Đăng TikTok', variables: {}, scheduledAt: Date.now(), attempts: 0 }
  d.posts.unshift({ ...base, id: 'post_starting', status: 'starting' }, { ...base, id: 'post_running', status: 'running', executionId: ex.id, runAt: Date.now() })
  writeFileSync(file, JSON.stringify(d))
  const P2 = await import('../electron/services/phoneagent/posts.ts?reload=1')
  P2.startPosts()
  const f2 = (id: string) => P2.listPosts().find((p: any) => p.id === id)!
  check('starting -> loi (khong tu chay lai -> khong dang trung)', f2('post_starting').status === 'error' && /tránh đăng trùng/.test(f2('post_starting').error || ''))
  ex.steps.push({ index: 0, type: 'launch', status: 'success' })
  ex.status = 'success'
  ex.finishedAt = new Date().toISOString()
  await until(() => f2('post_running').status === 'success', 8000)
  check('running + executionId -> theo doi tiep toi khi xong', f2('post_running').status === 'success', f2('post_running'))
  P2.stopPosts()
}

server.close()
fileSrv.close()
console.log(FAILS.length ? `\nFAIL ${FAILS.length}: ${FAILS.join(' | ')}` : '\nPASS')
process.exit(FAILS.length ? 1 : 0)
