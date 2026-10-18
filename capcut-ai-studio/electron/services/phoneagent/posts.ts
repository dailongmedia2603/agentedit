// DANG VIDEO QUA PHONE AGENT — hang doi + lich dang (2026-10-19).
//
// 1 lan dang = 1 PostJob (~/.capcut-studio/phoneagent/posts.json): video MP4 tren may + iPhone + kich ban + bien + gio dang.
// Toi gio (app phai dang mo — External API khong co endpoint tao lich, nen lich nam o app):
//   1. tai MP4 len may chu ban quyen (R2, link cong khai .mp4 48h) — iPhone chi tai duoc link cong khai
//   2. POST /videos/register {url} -> videoId
//   3. cho iPhone 'online' (Phone Agent chan /run khi may 'running' / 'offline'); moi iPhone 1 video 1 luc
//   4. chup danh sach execution -> POST /scripts/:id/run {deviceId, variables: {<bien video>: videoId, caption...}}
//      (/run KHONG tra executionId -> tim execution MOI co scheduleName "API: <ten kich ban>" + targetName = ten iPhone)
//   5. hoi /executions/:id moi 20s toi khi xong. Phone Agent bao "success" ca khi buoc send_file loi (chi buoc launch loi
//      moi dung) -> THANH CONG = status success VA khong buoc nao loi.
//   6. don: DELETE /videos/:id (tra han muc) + xoa file tam tren R2.
// Automation Video: du an bat "Tu dong dang" -> video tao xong tu len lich (ngay / sau X phut / theo khung gio).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { ENGINE_HOME } from '../paths'
import { writeJson } from '../motion/store'
import { postVideoUpload, postVideoDelete } from '../license'
import { PhoneAgentError, getToken } from './client'
import type { AutoPostConfig } from '../motion/types'
import { paDeleteVideo, paDevice, paExecution, paExecutions, paRegisterVideo, paRunScript, paScriptFields, type PaExecution } from './api'

export const PA_HOME = join(ENGINE_HOME, 'phoneagent')
const FILE = join(PA_HOME, 'posts.json')
const SHOTS = join(PA_HOME, 'shots')
/** Test (tests/test_phoneagent.mts): STUDIO_PA_TIME_SCALE=100 -> moi khoang cho nhanh 100 lan */
const SCALE = Math.max(1, Number(process.env.STUDIO_PA_TIME_SCALE) || 1)
const TICK_MS = (15 * 1000) / SCALE
/** iPhone offline / dang ban qua lau -> bao loi */
const MAX_WAIT_DEVICE_MS = 6 * 3600 * 1000
/** 1 lan chay kich ban (send_file toi da 20 phut + cac buoc) */
const MAX_RUN_MS = 75 * 60 * 1000
const POLL_MS = (20 * 1000) / SCALE
const KEEP_DONE = 300

export type PostStatus = 'scheduled' | 'uploading' | 'registering' | 'waiting' | 'starting' | 'running' | 'success' | 'error' | 'cancelled'

export interface PostOrigin {
  /** edit = du an Edit Video; motion = Tao video; auto = Automation Video */
  kind: 'edit' | 'motion' | 'auto'
  /** id du an / id job */
  refId: string
  automationId?: string
}

export interface PostStep {
  index: number
  type: string
  description?: string
  status: string
  error?: string
}

export interface PostJob {
  id: string
  createdAt: number
  title: string
  /** MP4 tren may */
  video: string
  origin: PostOrigin
  deviceId: string
  deviceName: string
  scriptId: string
  scriptName: string
  /** ten bien chua id video (send_file) */
  videoVar?: string
  /** cac bien khac (caption, hashtags...) — da dien xong */
  variables: Record<string, string>
  scheduledAt: number
  status: PostStatus
  /** dong mo ta trang thai hien tai (tieng Viet) */
  message?: string
  attempts: number
  waitingSince?: number
  hostedId?: string
  hostedUrl?: string
  hostedExp?: number
  videoId?: string
  executionId?: string
  runAt?: number
  steps?: PostStep[]
  /** anh chup man hinh cuoi cung (buoc screenshot cua kich ban) */
  shot?: string
  startedAt?: number
  finishedAt?: number
  error?: string
}

export interface NewPost {
  video: string
  title: string
  origin: PostOrigin
  deviceId: string
  deviceName?: string
  scriptId: string
  scriptName?: string
  videoVar?: string
  variables?: Record<string, string>
  /** ms; trong / qua khu = dang ngay */
  scheduledAt?: number
}

/** Noi luu tam video (may chu ban quyen). Test thay bang ban gia (setVideoHost). */
let host = { upload: postVideoUpload, remove: postVideoDelete }
export function setVideoHost(h: typeof host): void {
  host = h
}

let posts: PostJob[] | null = null
const active = new Set<string>()
const deviceBusy = new Set<string>()
let uploading = 0
let registerChain: Promise<unknown> = Promise.resolve()
const lastTry = new Map<string, number>()
let timer: ReturnType<typeof setInterval> | null = null
let stopping = false
type Listener = (list: PostJob[]) => void
const listeners = new Set<Listener>()

export function onPostsChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function load(): PostJob[] {
  if (posts) return posts
  posts = []
  if (existsSync(FILE)) {
    try {
      const d = JSON.parse(readFileSync(FILE, 'utf-8'))
      if (Array.isArray(d?.posts)) posts = d.posts
    } catch {
      /* hong -> rong */
    }
  }
  return posts!
}

function save(): void {
  const list = load()
  // giu toi da KEEP_DONE ban ghi da xong (cu nhat bo truoc)
  const done = list.filter((p) => ['success', 'error', 'cancelled'].includes(p.status))
  if (done.length > KEEP_DONE) {
    const drop = new Set(done.sort((a, b) => (a.finishedAt || a.createdAt) - (b.finishedAt || b.createdAt)).slice(0, done.length - KEEP_DONE).map((p) => p.id))
    posts = list.filter((p) => !drop.has(p.id))
  }
  writeJson(FILE, { posts: load() })
  const snap = listPosts()
  for (const fn of listeners) {
    try {
      fn(snap)
    } catch {
      /* bo qua */
    }
  }
}

function patch(id: string, p: Partial<PostJob>): PostJob | undefined {
  const cur = load().find((x) => x.id === id)
  if (!cur) return undefined
  Object.assign(cur, p)
  save()
  return cur
}

export function listPosts(filter: { refId?: string; automationId?: string } = {}): PostJob[] {
  return load()
    .filter((p) => (!filter.refId || p.origin.refId === filter.refId) && (!filter.automationId || p.origin.automationId === filter.automationId))
    .slice()
    .sort((a, b) => b.scheduledAt - a.scheduledAt)
}

/** Caption: bo ky tu dieu khien (tru xuong dong / tab) — Phone Agent chi escape \ " \n \r \t, ky tu khac lam hong JSON. */
export function cleanText(s: string): string {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

export function createPost(input: NewPost): PostJob {
  if (!getToken()) throw new Error('Chưa nhập API token Phone Agent (Cài đặt API > Phone Agent).')
  const video = String(input.video || '')
  if (!video || !existsSync(video)) throw new Error('Không thấy file video trên máy: ' + video)
  if (!statSync(video).size) throw new Error('File video rỗng.')
  if (!input.deviceId) throw new Error('Chọn iPhone để đăng.')
  if (!input.scriptId) throw new Error('Chọn kịch bản đăng.')
  const vars: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.variables || {})) {
    if (!k || k === input.videoVar) continue
    vars[k] = cleanText(String(v ?? ''))
  }
  const now = Date.now()
  const job: PostJob = {
    id: 'post_' + now.toString(36) + randomBytes(3).toString('hex'),
    createdAt: now,
    title: String(input.title || 'Video').slice(0, 200),
    video,
    origin: input.origin,
    deviceId: String(input.deviceId),
    deviceName: String(input.deviceName || input.deviceId),
    scriptId: String(input.scriptId),
    scriptName: String(input.scriptName || input.scriptId),
    videoVar: input.videoVar || undefined,
    variables: vars,
    scheduledAt: input.scheduledAt && input.scheduledAt > now ? input.scheduledAt : now,
    status: 'scheduled',
    message: input.scheduledAt && input.scheduledAt > now ? 'Đã lên lịch' : 'Chờ đăng',
    attempts: 0
  }
  load().unshift(job)
  save()
  setTimeout(tick, 300)
  return job
}

function cleanupRemote(p: PostJob): void {
  const vid = p.videoId
  const hosted = p.hostedId
  if (vid) paDeleteVideo(vid).catch(() => undefined)
  if (hosted) host.remove(hosted).catch(() => undefined)
}

export function cancelPost(id: string): { ok: boolean; error?: string } {
  const p = load().find((x) => x.id === id)
  if (!p) return { ok: false, error: 'Không thấy lượt đăng.' }
  if (p.status === 'starting' || p.status === 'running') {
    return { ok: false, error: 'Kịch bản đang chạy trên iPhone — Phone Agent chưa cho dừng qua API, dừng ở dashboard Phone Agent (Lịch sử > Đang chạy).' }
  }
  if (['success', 'error', 'cancelled'].includes(p.status)) return { ok: true }
  if (active.has(id)) return { ok: false, error: 'Đang tải video lên — đợi vài giây rồi huỷ lại.' }
  cleanupRemote(p)
  patch(id, { status: 'cancelled', message: 'Đã huỷ', finishedAt: Date.now(), videoId: undefined, hostedId: undefined, hostedUrl: undefined })
  return { ok: true }
}

export function deletePost(id: string): { ok: boolean; error?: string } {
  const p = load().find((x) => x.id === id)
  if (!p) return { ok: true }
  if (active.has(id) || p.status === 'starting' || p.status === 'running') return { ok: false, error: 'Lượt đăng đang chạy — đợi xong rồi xoá.' }
  if (!['success', 'error', 'cancelled'].includes(p.status)) cleanupRemote(p)
  posts = load().filter((x) => x.id !== id)
  save()
  return { ok: true }
}

/** Dang lai (loi / da huy / thanh cong muon dang them lan nua): tai lai tu dau, gio dang = bay gio hoac `at`. */
export function retryPost(id: string, at?: number): { ok: boolean; error?: string } {
  const p = load().find((x) => x.id === id)
  if (!p) return { ok: false, error: 'Không thấy lượt đăng.' }
  if (!['success', 'error', 'cancelled'].includes(p.status)) return { ok: false, error: 'Lượt đăng chưa xong.' }
  if (!existsSync(p.video)) return { ok: false, error: 'File video không còn trên máy.' }
  patch(id, {
    status: 'scheduled',
    message: 'Chờ đăng lại',
    scheduledAt: at && at > Date.now() ? at : Date.now(),
    attempts: 0,
    error: undefined,
    executionId: undefined,
    videoId: undefined,
    hostedId: undefined,
    hostedUrl: undefined,
    hostedExp: undefined,
    steps: undefined,
    shot: undefined,
    runAt: undefined,
    waitingSince: undefined,
    startedAt: undefined,
    finishedAt: undefined
  })
  setTimeout(tick, 300)
  return { ok: true }
}

/** Doi gio / bien cua luot chua chay */
export function reschedulePost(id: string, at: number): { ok: boolean; error?: string } {
  const p = load().find((x) => x.id === id)
  if (!p || !['scheduled', 'waiting'].includes(p.status) || active.has(id)) return { ok: false, error: 'Chỉ đổi giờ được lượt đang chờ.' }
  patch(id, { scheduledAt: Math.max(Date.now(), Number(at) || Date.now()), message: 'Đã lên lịch' })
  return { ok: true }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms / SCALE))
const statusVi: Record<string, string> = { offline: 'ngoại tuyến', running: 'đang chạy kịch bản khác', connecting: 'đang kết nối' }

/** Luu anh chup man hinh (data URL base64) cua buoc screenshot moi nhat */
function saveShot(postId: string, steps: PaExecution['steps']): string | undefined {
  const last = [...(steps || [])].reverse().find((s) => typeof s.screenshotUrl === 'string' && s.screenshotUrl.startsWith('data:image/'))
  if (!last) return undefined
  const m = /^data:image\/(\w+);base64,(.+)$/s.exec(last.screenshotUrl!)
  if (!m) return undefined
  mkdirSync(SHOTS, { recursive: true })
  const f = join(SHOTS, `${postId}.${m[1] === 'png' ? 'png' : 'jpg'}`)
  try {
    writeFileSync(f, Buffer.from(m[2], 'base64'))
    return f
  } catch {
    return undefined
  }
}

function stepsOf(ex: PaExecution): PostStep[] {
  return (ex.steps || []).map((s) => ({ index: s.index, type: s.type, description: s.description, status: s.status, error: s.error || undefined }))
}

function failure(ex: PaExecution): string | null {
  const bad = (ex.steps || []).find((s) => s.status === 'error')
  if (ex.status === 'success' && !bad) return null
  if (bad) {
    const what = bad.type === 'send_file' ? 'Chuyển video vào iPhone' : bad.description || bad.type
    return `${what}: ${bad.error || 'lỗi'}`
  }
  return ex.error || 'Kịch bản báo lỗi.'
}

/** Theo doi execution toi khi xong (hoi moi 20s) roi ghi ket qua. */
async function follow(id: string): Promise<void> {
  let netErr = 0
  for (;;) {
    if (stopping) return
    const p = load().find((x) => x.id === id)
    if (!p || !p.executionId) return
    let ex: PaExecution
    try {
      ex = await paExecution(p.executionId)
      netErr = 0
    } catch (e) {
      const pe = e as PhoneAgentError
      if (pe.status === 404) {
        finish(id, false, 'Phone Agent không còn lượt chạy này (đã bị xoá khỏi lịch sử).')
        return
      }
      if (++netErr > 30) {
        finish(id, false, 'Mất kết nối Phone Agent quá lâu khi theo dõi: ' + String(pe?.message || e))
        return
      }
      await sleep(POLL_MS)
      continue
    }
    const steps = stepsOf(ex)
    const shot = saveShot(id, ex.steps) || p.shot
    const curStep = [...steps].reverse().find((s) => s.status === 'running')
    if (ex.status === 'running' && !ex.finishedAt) {
      if (Date.now() - (p.runAt || Date.now()) > MAX_RUN_MS) {
        patch(id, { steps, shot })
        finish(id, false, 'Kịch bản chạy quá 75 phút chưa xong — kiểm tra iPhone / dashboard Phone Agent.')
        return
      }
      patch(id, {
        steps,
        shot,
        message: curStep ? `Đang chạy: ${curStep.type === 'send_file' ? 'chuyển video vào iPhone' : curStep.description || curStep.type}` : 'Đang chạy kịch bản trên iPhone'
      })
      await sleep(POLL_MS)
      continue
    }
    patch(id, { steps, shot })
    const err = failure(ex)
    finish(id, !err, err || undefined)
    return
  }
}

function finish(id: string, ok: boolean, error?: string): void {
  const p = load().find((x) => x.id === id)
  if (!p) return
  cleanupRemote(p)
  patch(id, {
    status: ok ? 'success' : 'error',
    message: ok ? 'Đã đăng xong' : 'Lỗi',
    error: ok ? undefined : error,
    finishedAt: Date.now(),
    videoId: undefined,
    hostedId: undefined,
    hostedUrl: undefined
  })
}

/** Loi tam thoi -> thu lai sau (toi da 5 lan), con lai -> loi. */
function softFail(id: string, e: unknown, phase: string): void {
  const p = load().find((x) => x.id === id)
  if (!p) return
  const pe = e as PhoneAgentError
  const msg = String(pe?.message || e)
  const retry = pe instanceof PhoneAgentError ? pe.retry : /kết nối|thời gian|timeout|ECONN|fetch/i.test(msg)
  if (retry && p.attempts < 5) {
    const wait = Math.min(30, 2 ** p.attempts) * 60 * 1000
    patch(id, { status: 'scheduled', attempts: p.attempts + 1, scheduledAt: Date.now() + wait, message: `${phase} lỗi tạm thời — thử lại lúc ${new Date(Date.now() + wait).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`, error: msg })
  } else {
    if (p.hostedId || p.videoId) cleanupRemote(p)
    patch(id, { status: 'error', message: 'Lỗi', error: `${phase}: ${msg}`, finishedAt: Date.now(), videoId: undefined, hostedId: undefined, hostedUrl: undefined })
  }
}

async function process1(id: string): Promise<void> {
  let p = load().find((x) => x.id === id)
  if (!p) return
  let lockedDevice = false
  try {
    // 1-2. file tam + dang ky voi Phone Agent
    if (!p.videoId) {
      if (!existsSync(p.video)) throw Object.assign(new Error('File video không còn trên máy: ' + p.video), { fatal: true })
      if (!p.hostedUrl || !p.hostedExp || p.hostedExp < Date.now() + 3 * 3600 * 1000) {
        if (uploading >= 2) return // cho luot sau (tick)
        uploading++
        try {
          patch(id, { status: 'uploading', message: 'Đang tải video lên máy chủ…', startedAt: p.startedAt || Date.now() })
          let last = 0
          const h = await host.upload(p.video, (sent, total) => {
            const pct = Math.floor((sent / total) * 100)
            if (pct - last >= 10 || pct === 100) {
              last = pct
              patch(id, { message: `Đang tải video lên máy chủ… ${pct}%` })
            }
          })
          p = patch(id, { hostedId: h.id, hostedUrl: h.url, hostedExp: h.expires_at })!
        } catch (e) {
          softFail(id, e, 'Tải video lên')
          return
        } finally {
          uploading--
        }
      }
      patch(id, { status: 'registering', message: 'Đang gửi link video cho Phone Agent…' })
      // dang ky TUAN TU (Phone Agent doc-sua-ghi ca danh sach video -> goi dong thoi co the mat ban ghi)
      const reg = (registerChain = registerChain.catch(() => undefined).then(() => paRegisterVideo(p!.hostedUrl!, p!.title, statSync(p!.video).size)))
      try {
        const r = (await reg) as { id: string }
        p = patch(id, { videoId: r.id })!
      } catch (e) {
        softFail(id, e, 'Đăng ký video với Phone Agent')
        return
      }
    }
    // 3. iPhone ranh
    if (deviceBusy.has(p.deviceId)) {
      patch(id, { status: 'waiting', message: 'Chờ video khác đăng xong trên iPhone này', waitingSince: p.waitingSince || Date.now() })
      return
    }
    deviceBusy.add(p.deviceId)
    lockedDevice = true
    let dev
    try {
      dev = await paDevice(p.deviceId)
    } catch (e) {
      if ((e as PhoneAgentError).status === 404) throw Object.assign(new Error('iPhone không còn trong tài khoản Phone Agent.'), { fatal: true })
      softFail(id, e, 'Kiểm tra iPhone')
      return
    }
    if (dev.status !== 'online') {
      const since = p.waitingSince || Date.now()
      if (Date.now() - since > MAX_WAIT_DEVICE_MS) throw Object.assign(new Error(`iPhone “${dev.name}” ${statusVi[dev.status] || dev.status} quá 6 giờ.`), { fatal: true })
      patch(id, { status: 'waiting', message: `Chờ iPhone “${dev.name}” sẵn sàng (đang ${statusVi[dev.status] || dev.status})`, waitingSince: since, deviceName: dev.name })
      return
    }
    // 4. chay kich ban
    let info
    try {
      info = await paScriptFields(p.scriptId)
    } catch (e) {
      if ((e as PhoneAgentError).status === 404) throw Object.assign(new Error('Kịch bản không còn trên Phone Agent.'), { fatal: true })
      softFail(id, e, 'Đọc kịch bản')
      return
    }
    const videoVar = p.videoVar || info.videoVar
    if (!videoVar) throw Object.assign(new Error('Kịch bản không có biến video ({{video_id}}) ở bước “Truyền file” — không truyền được video vào iPhone.'), { fatal: true })
    const variables: Record<string, string> = { ...p.variables, [videoVar]: p.videoId! }
    let before: Set<string>
    try {
      before = new Set((await paExecutions(10)).map((e) => e.id))
    } catch (e) {
      softFail(id, e, 'Đọc lịch sử Phone Agent')
      return
    }
    const runAt = Date.now()
    p = patch(id, { status: 'starting', message: 'Đang gửi lệnh chạy kịch bản…', runAt, deviceName: dev.name, scriptName: info.name, videoVar })!
    try {
      await paRunScript(p.scriptId, p.deviceId, variables)
    } catch (e) {
      const pe = e as PhoneAgentError
      // may chu tu choi ro rang (4xx) -> chua chay gi; mat ket noi -> KHONG biet da chay chua -> bao loi, khong tu chay lai
      if (pe.status === 400 && /must be online/i.test(pe.message)) {
        patch(id, { status: 'waiting', message: 'iPhone vừa bận — chờ lượt sau', waitingSince: p.waitingSince || Date.now() })
        return
      }
      throw Object.assign(new Error(pe.status ? pe.message : `Mất kết nối khi gửi lệnh (${pe.message}) — kiểm tra lịch sử Phone Agent trước khi đăng lại để tránh đăng trùng.`), {
        fatal: true
      })
    }
    // tim execution vua tao
    const wantName = 'API: ' + info.name
    let found: PaExecution | undefined
    for (let i = 0; i < 12 && !found; i++) {
      await sleep(i < 4 ? 3000 : 6000)
      try {
        const list = await paExecutions(10)
        found = list.find((e) => !before.has(e.id) && e.scheduleName === wantName && e.targetName === dev.name && Date.parse(e.startedAt) >= runAt - 120000)
      } catch {
        /* thu lai */
      }
    }
    if (!found) {
      throw Object.assign(new Error('Phone Agent đã nhận lệnh nhưng không thấy lượt chạy trong lịch sử — kiểm tra dashboard Phone Agent (kịch bản dùng chung cần có biến).'), { fatal: true })
    }
    patch(id, { status: 'running', executionId: found.id, message: 'Đang chạy kịch bản trên iPhone', steps: stepsOf(found) })
    // 5. theo doi toi khi xong
    await follow(id)
  } catch (e) {
    const err = e as Error & { fatal?: boolean }
    if (err.fatal) {
      const cur = load().find((x) => x.id === id)
      if (cur) cleanupRemote(cur)
      patch(id, { status: 'error', message: 'Lỗi', error: err.message, finishedAt: Date.now(), videoId: undefined, hostedId: undefined, hostedUrl: undefined })
    } else softFail(id, e, 'Đăng video')
  } finally {
    if (lockedDevice) deviceBusy.delete(p!.deviceId)
  }
}

function tick(): void {
  if (stopping || !getToken()) return
  const now = Date.now()
  for (const p of load()) {
    if (active.has(p.id)) continue
    const due = (p.status === 'scheduled' && p.scheduledAt <= now) || p.status === 'waiting'
    if (!due) continue
    // dang cho iPhone: hoi lai moi phut (khong ton han muc goi API — Phone Agent gioi han 60 lan / phut)
    if (p.status === 'waiting' && now - (lastTry.get(p.id) || 0) < 60000 / SCALE) continue
    lastTry.set(p.id, now)
    active.add(p.id)
    process1(p.id)
      .catch(() => undefined)
      .finally(() => active.delete(p.id))
  }
}

/** Mo app: luot dang do dang -> tiep tuc dung buoc (khong chay lai kich ban da gui lenh -> tranh dang trung). */
export function startPosts(): void {
  if (timer) return
  stopping = false
  let changed = false
  for (const p of load()) {
    if (p.status === 'uploading' || p.status === 'registering') {
      p.status = 'scheduled'
      p.message = 'Tiếp tục sau khi mở lại app'
      changed = true
    } else if (p.status === 'starting') {
      p.status = 'error'
      p.error = 'App tắt đúng lúc đang gửi lệnh chạy — kiểm tra lịch sử Phone Agent trước khi bấm “Đăng lại” để tránh đăng trùng.'
      p.finishedAt = Date.now()
      changed = true
    } else if (p.status === 'running' && !p.executionId) {
      p.status = 'error'
      p.error = 'Mất dấu lượt chạy khi app tắt — kiểm tra lịch sử Phone Agent.'
      p.finishedAt = Date.now()
      changed = true
    }
  }
  if (changed) save()
  // theo doi tiep luot dang chay
  for (const p of load()) {
    if (p.status === 'running' && p.executionId && !active.has(p.id)) {
      active.add(p.id)
      deviceBusy.add(p.deviceId)
      follow(p.id)
        .catch(() => undefined)
        .finally(() => {
          active.delete(p.id)
          deviceBusy.delete(p.deviceId)
        })
    }
  }
  timer = setInterval(tick, TICK_MS)
  setTimeout(tick, 5000)
}

export function stopPosts(): void {
  stopping = true
  if (timer) clearInterval(timer)
  timer = null
}

/** So luot dang dang tai len (chan cap nhat app giua chung neu can) */
export const busyPosts = (): number => load().filter((p) => ['uploading', 'registering', 'starting'].includes(p.status)).length

// ---------- Lich cho Automation ----------


/** Khung gio trong tiep theo (moi khung 1 video / du an / ngay; luot loi / huy khong giu cho). */
export type { AutoPostConfig }

export function nextSlot(automationId: string, slots: string[], from = Date.now()): number {
  const mins = [...new Set(slots.map((s) => /^(\d{1,2}):(\d{2})$/.exec(String(s).trim())).filter(Boolean).map((m) => Number(m![1]) * 60 + Number(m![2])))]
    .filter((m) => m >= 0 && m < 24 * 60)
    .sort((a, b) => a - b)
  if (!mins.length) return from
  const taken = new Set(
    load()
      .filter((p) => p.origin.automationId === automationId && !['error', 'cancelled'].includes(p.status))
      .map((p) => Math.round(p.scheduledAt / 60000))
  )
  const d0 = new Date(from)
  for (let day = 0; day < 60; day++) {
    for (const m of mins) {
      const t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + day, Math.floor(m / 60), m % 60, 0, 0).getTime()
      if (t < from + 60000) continue
      if (!taken.has(Math.round(t / 60000))) return t
    }
  }
  return from
}

export function fillTemplate(tpl: string, ctx: Record<string, string>): string {
  return cleanText(String(tpl ?? '').replace(/\{(\w+)\}/g, (all, k) => (k in ctx ? ctx[k] : all))).trim()
}
