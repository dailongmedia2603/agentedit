// BOT TELEGRAM — dieu khien Edit video / Tao video qua Telegram (2026-10-21). Chay trong tien trinh app (giao dien hoac
// dich vu nen --agent-edit-service), KHONG chay trong tien trinh viec nen CLI.
//
// - Nhan tin bang long-polling getUpdates (khong can dia chi cong khai / webhook). 1 token = 1 noi goi (noi khac -> 409).
// - XAC THUC: chi chat RIENG; chat moi phai gui DUNG key ban quyen dang kich hoat tren may nay (so dau van tay, xoa tin
//   chua key). Sai 5 lan / gio -> khoa chat 1 gio. Doi key tren app -> moi chat phai gui lai key.
// - Menu (ban phim co dinh): Edit video · Tao video · Video cua toi · Huy thao tac · Huong dan. Moi luong hoi tung buoc
//   (wizard.ts), nut Bo qua o buoc khong bat buoc, chon tu thu vien / kho font.
// - Edit video = 1 VIEC NEN CLI (r_..., electron/cli/pipeline.ts — giong het `agent-edit make`); Tao video = createMotionJob
//   (mv-...). Moi viec co MA; nguoi dung tao them video khac trong luc cho. Bot sua 1 tin trang thai theo tung buoc, xong
//   gui video (<= 49 MB; lon hon -> ban nen <= 45 MB + link ban goc 48 gio qua may chu ban quyen).
import { execFile } from 'child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { randomBytes } from 'crypto'
import { tmpdir } from 'os'
import {
  downloadUrl, TG_DOWNLOAD_MAX, TG_UPLOAD_MAX, TgError, tgCall, tgDownload, tgUpload,
  type InlineKeyboard, type ReplyMarkup, type TgCallback, type TgFileRef, type TgMessage, type TgUpdate
} from './api'
import { closeMtproto, mtDownload, MT_DOWNLOAD_MAX } from './mtproto'
import { getBotToken, saveTgState, setBotToken, tgState, TG_UPLOADS, tokenHint, tokenLooksValid, type TgJobRef } from './store'
import {
  esc, fmtDur, fmtMb, MAX_ASSETS, MAX_FONTS, MAX_INSERTS, MAX_SOURCES, newSession, nextStep, parseCb, pendingNote, prompt,
  summary, type Flow, type Session, type UpFile
} from './wizard'
import { cancelFile, loadJob, newJobId, saveJob, type Job, type JobInput, type JobStep } from '../../cli/jobs'
import { spawnCliJob } from '../../cli/spawn'
import { checkLicense, licenseDisabled, licenseKeyFingerprint, licenseKeyMatches, postVideoUpload } from '../license'
import { sidecarInfo, sidecarRequest, startSidecar } from '../sidecar'
import { listSaydiVoices, saydiMasked } from '../motion/saydi'
import { cancelMotionJob, createMotionJob, getMotionJob, onMotionJob, rerunMotionJob } from '../motion/runner'
import { stageLabel } from '../motion/stages'
import { validateBrief } from '../motion/prompt'
import type { MotionBrief, MotionJob } from '../motion/types'
import { TOOLS_BIN } from '../paths'
import { exeName } from '../env'

// ---------------------------------------------------------------------------
// Phu thuoc (test thay bang ban gia — tests/test_telegram.mts)
// ---------------------------------------------------------------------------
export interface TgDeps {
  keyPrint(): string | null
  keyMatches(raw: string): boolean
  /** ban quyen may nay dang hop le */
  licenseOk(): Promise<{ ok: boolean; message?: string }>
  libraryList(): Promise<{ path: string; name: string; duration?: number; analyzed?: boolean }[]>
  fontList(): Promise<{ id: string; name: string }[]>
  hasSaydi(): boolean
  voices(): Promise<{ id: string; name: string }[]>
  /** thoi luong video (giay); null = khong doc duoc (khong phai video) */
  probe(path: string): Promise<number | null>
  startEdit(input: JobInput): string
  editJob(id: string): Job | null
  cancelEdit(id: string): void
  createMotion(brief: MotionBrief): Promise<{ id: string }>
  motionJob(id: string): MotionJob | undefined
  rerunMotion(id: string): { id: string }
  cancelMotion(id: string): void
  /** link tai ban goc (48 gio) — null = khong tai len duoc */
  publicLink(file: string): Promise<string | null>
  /** nen video <= maxBytes; null = khong nen duoc */
  compress(file: string, maxBytes: number): Promise<string | null>
  /** tai file > 20 MB qua MTProto (mtproto.ts) — tra so byte */
  downloadBig(token: string, messageId: number, dest: string, size: number, onProgress?: (done: number, total: number) => void): Promise<number>
}

const ffbin = (n: 'ffmpeg' | 'ffprobe') => {
  const p = join(TOOLS_BIN, exeName(n))
  return existsSync(p) ? p : exeName(n)
}

async function ensureSidecar(): Promise<boolean> {
  if (sidecarInfo().ready) return true
  return (await startSidecar()).ok
}

const realDeps: TgDeps = {
  keyPrint: () => licenseKeyFingerprint(),
  keyMatches: (raw) => licenseKeyMatches(raw),
  licenseOk: async () => {
    if (licenseDisabled()) return { ok: true }
    try {
      const s = await checkLicense('open', 30 * 60 * 1000)
      return { ok: s.status === 'ok', message: s.message }
    } catch (e) {
      return { ok: false, message: String((e as Error)?.message || e) }
    }
  },
  libraryList: async () => {
    if (!(await ensureSidecar())) return []
    const r = await sidecarRequest('/library/list', {}, 60000).catch(() => null)
    const items = ((r?.items || []) as { path: string; name: string; exists: boolean; duration?: number; source?: unknown; updated?: string }[])
      .filter((it) => it.exists && it.path && existsSync(it.path))
      .sort((a, b) => Number(!!b.source) - Number(!!a.source) || String(b.updated || '').localeCompare(String(a.updated || '')))
    return items.map((it) => ({ path: it.path, name: it.name || basename(it.path), duration: it.duration, analyzed: !!it.source }))
  },
  fontList: async () => {
    if (!(await ensureSidecar())) return []
    const r = await sidecarRequest('/fonts/list', {}, 60000).catch(() => null)
    return ((r?.fonts || []) as { id: string; label?: string; family?: string }[]).filter((f) => f.id).map((f) => ({ id: f.id, name: f.label || f.family || f.id }))
  },
  hasSaydi: () => saydiMasked().has_key,
  voices: async () => {
    const r = await listSaydiVoices().catch(() => ({ voices: [] as { id: string; name: string; language?: string; custom?: boolean; featured?: boolean }[] }))
    return r.voices
      .filter((v) => v.custom || (v.language || '').toLowerCase().startsWith('vi'))
      .sort((a, b) => Number(!!b.custom) - Number(!!a.custom) || Number(!!b.featured) - Number(!!a.featured))
      .slice(0, 40)
      .map((v) => ({ id: v.id, name: (v.custom ? '⭐ ' : '') + v.name }))
  },
  probe: (path) =>
    new Promise((resolve) => {
      execFile(ffbin('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', path],
        { timeout: 60000 }, (err, stdout) => {
          if (err) {
            // may chua cai ffprobe (Doctor chua chay) -> khong chan nguoi dung, viec nen tu kiem lai
            resolve((err as NodeJS.ErrnoException).code === 'ENOENT' ? 0 : null)
            return
          }
          try {
            const j = JSON.parse(String(stdout))
            if (!j.streams?.length) return resolve(null)
            const d = Number(j.format?.duration)
            resolve(Number.isFinite(d) ? d : 0)
          } catch {
            resolve(null)
          }
        })
    }),
  startEdit: (input) => {
    const id = newJobId()
    const job: Job = { id, createdAt: Date.now(), updatedAt: Date.now(), status: 'queued', step: 'prepare', message: 'Đang khởi động…', input }
    saveJob(job)
    const pid = spawnCliJob(id)
    if (!pid) {
      job.status = 'error'
      job.error = { step: 'prepare', message: 'Không khởi động được tiến trình xử lý.' }
      saveJob(job)
      throw new Error(job.error.message)
    }
    job.pid = pid
    saveJob(job)
    return id
  },
  editJob: (id) => loadJob(id),
  cancelEdit: (id) => {
    try {
      writeFileSync(cancelFile(id), String(Date.now()))
    } catch {
      /* viec da xoa */
    }
  },
  createMotion: (brief) => createMotionJob(brief, { kind: 'single' }),
  motionJob: (id) => getMotionJob(id),
  rerunMotion: (id) => rerunMotionJob(id),
  cancelMotion: (id) => void cancelMotionJob(id),
  publicLink: async (file) => {
    try {
      return (await postVideoUpload(file)).url
    } catch {
      return null
    }
  },
  compress: async (file, maxBytes) => {
    const dur = (await realDeps.probe(file)) || 0
    if (!dur) return null
    const out = join(tmpdir(), `agent-edit-tg-${randomBytes(4).toString('hex')}.mp4`)
    for (const factor of [0.9, 0.7]) {
      const kbps = Math.max(250, Math.floor(((maxBytes * 8) / 1000 / dur) * factor) - 128)
      // bitrate thap -> ha xuong 720p cho net
      const vf = kbps < 2500 ? ['-vf', "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'"] : []
      const ok = await new Promise<boolean>((resolve) => {
        execFile(ffbin('ffmpeg'), ['-y', '-v', 'error', '-i', file, ...vf, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${kbps}k`,
          '-maxrate', `${Math.floor(kbps * 1.3)}k`, '-bufsize', `${kbps * 2}k`, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out],
        { timeout: 30 * 60000 }, (err) => resolve(!err))
      })
      if (ok && existsSync(out) && statSync(out).size <= maxBytes) return out
    }
    rmSync(out, { force: true })
    return null
  },
  downloadBig: mtDownload
}

let deps: TgDeps = realDeps
/** CHI cho test */
export function setTelegramDeps(d: Partial<TgDeps>): void {
  deps = { ...realDeps, ...d }
}

// ---------------------------------------------------------------------------
// Trang thai bot (Cai dat API hien)
// ---------------------------------------------------------------------------
export interface TgBotStatus {
  state: 'off' | 'starting' | 'running' | 'error'
  error?: string
  since?: number
}
let status: TgBotStatus = { state: 'off' }
const statusListeners = new Set<(s: TgBotStatus) => void>()
export function onTelegramStatus(fn: (s: TgBotStatus) => void): () => void {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}
function setStatus(s: TgBotStatus): void {
  if (s.state === status.state && s.error === status.error) return
  status = { ...s, since: Date.now() }
  for (const fn of statusListeners) {
    try {
      fn(status)
    } catch {
      /* bo qua */
    }
  }
}
export const telegramStatus = () => status

let running = false
let abort: AbortController | null = null
let loopP: Promise<void> | null = null
let watchTimer: NodeJS.Timeout | null = null
let offMotion: (() => void) | null = null
let token = ''
const log = (m: string) => {
  if (process.env.STUDIO_TELEGRAM_DEBUG) console.log('[telegram]', m)
}

/** Bot dang bat (dich vu nen khong tu thoat khi bot con chay) */
export const telegramActive = () => running

/** Mo app: bat bot neu da co token + dang bat. */
export function startTelegram(): void {
  const st = tgState()
  token = getBotToken()
  if (running || !st.enabled || !token) {
    if (!st.enabled || !token) setStatus({ state: 'off' })
    return
  }
  running = true
  abort = new AbortController()
  setStatus({ state: 'starting' })
  cleanupUploads()
  loopP = pollLoop(abort.signal)
  watchTimer = setInterval(() => void watchJobs(), 4000)
  offMotion = onMotionJob((j) => {
    if (tgState().jobs.some((r) => r.id === j.id && !r.finished)) void watchJobs()
  })
}

export async function stopTelegram(): Promise<void> {
  running = false
  abort?.abort()
  abort = null
  if (watchTimer) clearInterval(watchTimer)
  watchTimer = null
  offMotion?.()
  offMotion = null
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  await loopP?.catch(() => undefined)
  loopP = null
  await closeMtproto()
  setStatus({ state: 'off' })
}

/** Cai dat: luu token (kiem bang getMe) + bat / tat. Tra bot (ten) khi token dung. */
export async function configureTelegram(cfg: { token?: string; enabled?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const st = tgState()
  if (cfg.token !== undefined) {
    const t = cfg.token.trim()
    if (t) {
      if (!tokenLooksValid(t)) return { ok: false, error: 'Token không đúng dạng (VD 123456789:AAH...). Lấy token ở @BotFather.' }
      try {
        const me = await tgCall<{ id: number; username: string; first_name: string }>(t, 'getMe', {}, 20000)
        st.bot = { id: me.id, username: me.username, name: me.first_name }
      } catch (e) {
        return { ok: false, error: String((e as Error).message || e) }
      }
      // bot moi -> offset cu khong con nghia; chat da xac thuc gan voi bot cu
      if (getBotToken() && getBotToken().split(':')[0] !== t.split(':')[0]) {
        st.offset = 0
        st.chats = {}
        st.sessions = {}
      }
    } else {
      st.bot = undefined
      await closeMtproto(true)
    }
    setBotToken(t)
  }
  if (cfg.enabled !== undefined) st.enabled = !!cfg.enabled
  saveTgState()
  await stopTelegram()
  startTelegram()
  return { ok: true }
}

export async function testTelegram(raw?: string): Promise<{ ok: boolean; detail?: string; error?: string }> {
  const t = (raw || '').trim() || getBotToken()
  if (!t) return { ok: false, error: 'Chưa nhập token bot.' }
  if (!tokenLooksValid(t)) return { ok: false, error: 'Token không đúng dạng (VD 123456789:AAH...). Lấy token ở @BotFather.' }
  try {
    const me = await tgCall<{ username: string; first_name: string }>(t, 'getMe', {}, 20000)
    return { ok: true, detail: `Kết nối OK · @${me.username} (${me.first_name})` }
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) }
  }
}

export function telegramInfo() {
  const st = tgState()
  const t = getBotToken()
  const fp = deps.keyPrint()
  return {
    has_token: !!t,
    token_hint: tokenHint(t),
    enabled: st.enabled,
    bot: st.bot || null,
    status,
    chats: Object.values(st.chats).map((c) => ({ chatId: c.chatId, name: c.name, username: c.username, authorizedAt: c.authorizedAt, lastSeenAt: c.lastSeenAt, valid: !!fp && c.keyPrint === fp })),
    jobs: st.jobs.filter((j) => !j.finished).length
  }
}

/** Viec do bot tao (CLI `telegram jobs`): ma, loai, nguoi yeu cau, trang thai hien tai. */
export function telegramJobs(limit = 20) {
  const st = tgState()
  return st.jobs
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.min(100, Math.max(1, limit)))
    .map((r) => {
      const v = viewOf(r)
      return {
        id: r.id,
        kind: r.kind === 'edit' ? 'edit' : 'motion',
        title: r.title,
        chat: st.chats[String(r.chatId)]?.name || String(r.chatId),
        status: v?.state || 'gone',
        delivered: !!r.finished && v?.state === 'done',
        output: v?.output,
        error: v?.error,
        createdAt: new Date(r.createdAt).toISOString()
      }
    })
}

/** Go quyen 1 chat (Cai dat). */
export function removeTelegramChat(chatId: number): void {
  const st = tgState()
  delete st.chats[String(chatId)]
  delete st.sessions[String(chatId)]
  saveTgState()
  if (running && token) void send(chatId, '🔒 Quyền dùng bot của bạn đã bị gỡ trên máy chủ app. Gửi lại key phần mềm để dùng tiếp.', { remove_keyboard: true }).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Vong nhan tin
// ---------------------------------------------------------------------------
async function pollLoop(signal: AbortSignal): Promise<void> {
  let backoff = 0
  let first = true
  while (running && !signal.aborted) {
    try {
      if (first) {
        await tgCall(token, 'setMyCommands', {
          commands: [
            { command: 'start', description: 'Bắt đầu / mở menu' },
            { command: 'edit', description: 'Edit video từ video nguồn' },
            { command: 'tao', description: 'Tạo video mới bằng AI' },
            { command: 'viec', description: 'Video của tôi (mã + trạng thái)' },
            { command: 'huy', description: 'Huỷ thao tác đang làm' },
            { command: 'thoat', description: 'Đăng xuất khỏi bot' }
          ]
        }).catch(() => undefined)
        first = false
      }
      const st = tgState()
      const ups = await tgCall<TgUpdate[]>(token, 'getUpdates', { offset: st.offset || undefined, timeout: 25, allowed_updates: ['message', 'callback_query'] }, 40000, signal)
      setStatus({ state: 'running' })
      backoff = 0
      for (const u of ups) {
        st.offset = u.update_id + 1
        dispatch(u)
      }
      if (ups.length) saveTgState()
    } catch (e) {
      if (signal.aborted || !running) break
      const err = e as TgError
      log('poll loi: ' + err.message)
      if (err.code === 401 || err.code === 404) {
        setStatus({ state: 'error', error: err.message })
        running = false
        break
      }
      setStatus({ state: 'error', error: err.message })
      backoff = Math.min(60000, err.retryAfter ? err.retryAfter * 1000 : backoff ? backoff * 2 : err.code === 409 ? 15000 : 3000)
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
}

/** Moi chat 1 hang (tin cung chat xu ly lan luot, cac chat song song) */
const queues = new Map<number, Promise<void>>()
const timers = new Map<number, NodeJS.Timeout>()
function enqueue(chatId: number, fn: () => Promise<void>): void {
  const prev = queues.get(chatId) || Promise.resolve()
  const next = prev
    .then(fn)
    .catch((e) => {
      log('xu ly loi: ' + String((e as Error)?.stack || e))
      return send(chatId, '⚠️ Có lỗi khi xử lý: ' + esc(String((e as Error)?.message || e).slice(0, 300))).then(() => undefined, () => undefined)
    })
  queues.set(chatId, next)
  void next.finally(() => {
    if (queues.get(chatId) === next) queues.delete(chatId)
  })
}
/** lan cuoi chat co tin moi (gom album: doi chat im ms roi moi hoi tiep) */
const lastAct = new Map<number, number>()
/** Lam sau khi chat IM ms va da xu ly het tin dang cho — gom nhieu file gui cung luc (album) roi moi hoi tiep */
function later(chatId: number, fn: () => Promise<void>, ms = GATHER_MS): void {
  const t = timers.get(chatId)
  if (t) clearTimeout(t)
  const fire = () => {
    const idle = Date.now() - (lastAct.get(chatId) || 0)
    if (idle < ms || queues.has(chatId)) {
      timers.set(chatId, setTimeout(fire, Math.max(50, ms - idle)))
      return
    }
    timers.delete(chatId)
    enqueue(chatId, fn)
  }
  timers.set(chatId, setTimeout(fire, ms))
}
let GATHER_MS = 1500

function dispatch(u: TgUpdate): void {
  const chatId = u.message?.chat.id ?? u.callback_query?.message?.chat.id
  if (chatId === undefined) return
  lastAct.set(chatId, Date.now())
  enqueue(chatId, async () => {
    if (u.message) await onMessage(u.message)
    else if (u.callback_query) await onCallback(u.callback_query)
  })
}

// ---------------------------------------------------------------------------
// Gui tin
// ---------------------------------------------------------------------------
const MENU: ReplyMarkup = {
  keyboard: [[{ text: '🎬 Edit video' }, { text: '✨ Tạo video' }], [{ text: '📋 Video của tôi' }, { text: '❌ Huỷ thao tác' }], [{ text: '❓ Hướng dẫn' }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Chọn menu nhanh bên dưới'
}

async function send(chatId: number, text: string, markup?: InlineKeyboard | ReplyMarkup, extra: Record<string, unknown> = {}): Promise<number> {
  const reply_markup = Array.isArray(markup) ? (markup.length ? { inline_keyboard: markup } : undefined) : markup
  const m = await tgCall<TgMessage>(token, 'sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(reply_markup ? { reply_markup } : {}),
    ...extra
  })
  return m.message_id
}

async function edit(chatId: number, msgId: number, text: string, kb?: InlineKeyboard): Promise<void> {
  await tgCall(token, 'editMessageText', {
    chat_id: chatId,
    message_id: msgId,
    text: text.slice(0, 4000),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: kb || [] }
  }).catch((e: TgError) => {
    if (!/not modified/i.test(e.message)) throw e
  })
}

// ---------------------------------------------------------------------------
// Xac thuc bang key phan mem
// ---------------------------------------------------------------------------
const FAIL_MAX = 5
const FAIL_WINDOW = 60 * 60 * 1000
const keyish = (t: string) => {
  const n = t.toUpperCase().replace(/[^0-9A-Z]/g, '')
  return n.length >= 20 && n.length <= 30 && !t.trim().startsWith('/')
}

function authorized(chatId: number): boolean {
  const a = tgState().chats[String(chatId)]
  const fp = deps.keyPrint()
  return !!a && !!fp && a.keyPrint === fp
}

async function handleUnauth(m: TgMessage): Promise<void> {
  const chatId = m.chat.id
  const st = tgState()
  const prev = st.chats[String(chatId)]
  if (prev) {
    // key tren may da doi / go -> het quyen
    delete st.chats[String(chatId)]
    delete st.sessions[String(chatId)]
    saveTgState()
  }
  const text = (m.text || '').trim()
  const f = st.fails[String(chatId)]
  if (f?.until && f.until > Date.now()) {
    await send(chatId, `🔒 Nhập sai key quá nhiều lần. Thử lại sau ${Math.ceil((f.until - Date.now()) / 60000)} phút.`)
    return
  }
  if (!keyish(text)) {
    await send(chatId,
      (prev ? '🔑 Key phần mềm trên máy đã đổi — cần xác thực lại.\n\n' : '👋 Chào bạn! Đây là bot của <b>Agent Edit</b>.\n\n') +
      '🔑 Để dùng bot, hãy gửi <b>key phần mềm Agent Edit</b> đang kích hoạt trên máy chạy app (dạng <code>XXXXX-XXXXX-XXXXX-XXXXX-XXXXX</code>).',
      { remove_keyboard: true })
    return
  }
  // xoa tin chua key khoi lich su chat (bot xoa duoc tin trong chat rieng < 48h)
  void tgCall(token, 'deleteMessage', { chat_id: chatId, message_id: m.message_id }).catch(() => undefined)
  const fp = deps.keyPrint()
  if (!fp) {
    await send(chatId, '⚠️ Máy chạy app chưa kích hoạt key bản quyền. Mở app Agent Edit, nhập key rồi thử lại.')
    return
  }
  if (!deps.keyMatches(text)) {
    const now = Date.now()
    const cur = f && now - f.first < FAIL_WINDOW ? f : { n: 0, first: now }
    cur.n++
    if (cur.n >= FAIL_MAX) cur.until = now + FAIL_WINDOW
    st.fails[String(chatId)] = cur
    saveTgState()
    await send(chatId, cur.until ? '🔒 Sai key 5 lần — chat này bị khoá 1 giờ.' : `❌ Key không đúng (còn ${FAIL_MAX - cur.n} lần thử). Gửi lại key phần mềm.`)
    return
  }
  const lic = await deps.licenseOk()
  if (!lic.ok) {
    await send(chatId, '⚠️ Key đúng nhưng bản quyền trên máy chưa hợp lệ: ' + esc(lic.message || '') + '\nMở app Agent Edit để kiểm tra.')
    return
  }
  const u = m.from
  st.chats[String(chatId)] = {
    chatId,
    name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || m.chat.first_name || String(chatId),
    username: u?.username || m.chat.username,
    keyPrint: fp,
    authorizedAt: Date.now(),
    lastSeenAt: Date.now()
  }
  delete st.fails[String(chatId)]
  saveTgState()
  await send(chatId, '✅ Xác thực thành công! (Tin nhắn chứa key đã được xoá.)\n\n' + HELP, MENU)
}

const HELP =
  '<b>Agent Edit bot</b> — chọn menu bên dưới:\n' +
  '🎬 <b>Edit video</b>: gửi video nguồn → mình hỏi từng mục (video mẫu, mục đích, phong cách, khách hàng, độ dài, font, màu, tư liệu) → app dựng + xuất video rồi gửi lại đây.\n' +
  '✨ <b>Tạo video</b>: tạo video motion graphic từ con số 0 bằng AI.\n' +
  '📋 <b>Video của tôi</b>: mã + trạng thái các video. Gửi <b>mã video</b> (VD <code>r_mabc12345</code>) để xem lại / nhận lại video.\n' +
  'Mỗi video có mã riêng — trong lúc chờ bạn cứ tạo thêm video khác.\n' +
  '❌ <b>Huỷ thao tác</b>: bỏ bảng hỏi đang làm. /thoat: đăng xuất khỏi bot.\n' +
  '<i>Máy chạy app cần đang mở thì bot mới trả lời.</i>'

// ---------------------------------------------------------------------------
// Phien hoi
// ---------------------------------------------------------------------------
const SESSION_TTL = 24 * 3600 * 1000
function session(chatId: number): Session | null {
  const st = tgState()
  const s = st.sessions[String(chatId)]
  if (s && Date.now() - s.updatedAt > SESSION_TTL) {
    dropSession(chatId)
    return null
  }
  return s || null
}
function touch(chatId: number, s: Session): void {
  s.updatedAt = Date.now()
  tgState().sessions[String(chatId)] = s
  saveTgState()
}
/** Bo phien; keepFiles = file da giao cho viec tao video */
function dropSession(chatId: number, keepFiles = false): void {
  const st = tgState()
  const s = st.sessions[String(chatId)]
  if (s && !keepFiles) rmSync(uploadDir(chatId, s), { recursive: true, force: true })
  delete st.sessions[String(chatId)]
  saveTgState()
}
const uploadDir = (chatId: number, s: Session) => join(TG_UPLOADS, String(chatId), s.sid)

async function startFlow(chatId: number, flow: Flow): Promise<void> {
  const had = session(chatId)
  if (had) dropSession(chatId)
  const s = newSession(flow, randomBytes(3).toString('hex'))
  touch(chatId, s)
  if (had) await send(chatId, '↩️ Đã bỏ bảng hỏi đang làm dở.')
  await ask(chatId, s)
}

/** Gui cau hoi cua buoc hien tai (tai danh sach chon truoc neu buoc can). */
async function ask(chatId: number, s: Session): Promise<void> {
  s.pick = undefined
  if (s.step === 'font') {
    const fonts = await deps.fontList().catch(() => [])
    s.pick = { kind: 'font', items: fonts.map((f) => ({ label: f.name, value: f.id })), page: 0 }
  } else if (s.step === 'm_voice' && deps.hasSaydi()) {
    const v = await deps.voices().catch(() => [])
    s.pick = { kind: 'voice', items: v.map((x) => ({ label: x.name, value: x.id })), page: 0 }
  }
  const p = prompt(s, { hasSaydi: deps.hasSaydi() })
  const id = await send(chatId, p.text, p.keyboard)
  if (s.pick) s.pick.msgId = id
  touch(chatId, s)
}

async function advance(chatId: number, s: Session): Promise<void> {
  const n = nextStep(s)
  if (!n) return finish(chatId, s)
  s.step = n
  await ask(chatId, s)
}

// ---------------------------------------------------------------------------
// Tin nhan
// ---------------------------------------------------------------------------
const JOB_ID = /^(r_[a-z0-9]{6,24}|mv-\d{8}-\d{6}-[0-9a-f]{4})$/

async function onMessage(m: TgMessage): Promise<void> {
  const chatId = m.chat.id
  if (m.chat.type !== 'private') {
    if (m.text?.startsWith('/')) await send(chatId, 'Bot Agent Edit chỉ dùng trong chat riêng (nhắn trực tiếp cho bot).')
    return
  }
  if (!authorized(chatId)) return handleUnauth(m)
  const st = tgState()
  st.chats[String(chatId)].lastSeenAt = Date.now()
  const text = (m.text || '').trim()
  const cmd = text.toLowerCase().replace(/@\w+$/, '')

  if (cmd === '/start' || cmd === '/menu' || cmd === '❓ hướng dẫn' || cmd === '/help') return void (await send(chatId, HELP, MENU))
  if (cmd === '/edit' || text === '🎬 Edit video') return startFlow(chatId, 'edit')
  if (cmd === '/tao' || text === '✨ Tạo video') return startFlow(chatId, 'motion')
  if (cmd === '/viec' || text === '📋 Video của tôi') return listJobsMsg(chatId)
  if (cmd === '/huy' || text === '❌ Huỷ thao tác') {
    const had = !!session(chatId)
    dropSession(chatId)
    return void (await send(chatId, had ? '✖️ Đã huỷ bảng hỏi. Video đang tạo (nếu có) vẫn chạy tiếp.' : 'Không có thao tác nào đang làm.', MENU))
  }
  if (cmd === '/thoat') {
    dropSession(chatId)
    delete st.chats[String(chatId)]
    saveTgState()
    return void (await send(chatId, '👋 Đã đăng xuất. Gửi lại key phần mềm khi muốn dùng tiếp.', { remove_keyboard: true }))
  }
  if (JOB_ID.test(text)) return jobDetail(chatId, text)

  const s = session(chatId)
  if (!s) return void (await send(chatId, 'Chọn <b>🎬 Edit video</b> hoặc <b>✨ Tạo video</b> ở menu bên dưới để bắt đầu.', MENU))
  const file = fileOf(m)
  if (file) return onMedia(chatId, s, m, file)
  if (/^https?:\/\/\S+$/i.test(text) && mediaKindsFor(s).length) return onLink(chatId, s, m, text)
  if (text) return onText(chatId, s, text)
}

// ---- File ----
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm)$/i
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|heif|tiff?|bmp|avif)$/i
const FONT_EXT = /\.(ttf|otf|woff)$/i
type Kind = UpFile['kind']

interface InFile {
  ref: TgFileRef
  kind: Kind | null
  name: string
}

const MIME_EXT: Record<string, string> = {
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/x-matroska': '.mkv', 'video/x-m4v': '.m4v',
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/gif': '.gif',
  'font/ttf': '.ttf', 'font/otf': '.otf', 'font/woff': '.woff', 'application/x-font-ttf': '.ttf', 'application/x-font-otf': '.otf'
}

function kindOfName(name: string, mime = ''): Kind | null {
  if (VIDEO_EXT.test(name) || mime.startsWith('video/')) return 'video'
  if (IMAGE_EXT.test(name) || mime.startsWith('image/')) return 'image'
  if (FONT_EXT.test(name) || mime.startsWith('font/') || /x-font/.test(mime)) return 'font'
  return null
}

function fileOf(m: TgMessage): InFile | null {
  if (m.video) return { ref: m.video, kind: 'video', name: m.video.file_name || 'video.mp4' }
  if (m.animation) return { ref: m.animation, kind: 'video', name: m.animation.file_name || 'clip.mp4' }
  if (m.video_note) return { ref: m.video_note, kind: 'video', name: 'video-tron.mp4' }
  if (m.photo?.length) return { ref: m.photo[m.photo.length - 1], kind: 'image', name: 'anh.jpg' }
  if (m.document) {
    const name = m.document.file_name || 'file' + (MIME_EXT[m.document.mime_type || ''] || '')
    return { ref: m.document, kind: kindOfName(name, m.document.mime_type), name }
  }
  return null
}

/** Loai file buoc hien tai nhan */
function mediaKindsFor(s: Session): Kind[] {
  switch (s.step) {
    case 'source':
    case 'reference':
      return ['video']
    case 'font':
      return ['font']
    case 'inserts':
      return ['image', 'video']
    case 'm_assets':
      return ['image']
    default:
      return []
  }
}
const KIND_LABEL: Record<Kind, string> = { video: 'video', image: 'ảnh', font: 'file font' }

function wrongKind(s: Session): string {
  const k = mediaKindsFor(s)
  return k.length ? `Bước này cần gửi ${k.map((x) => KIND_LABEL[x]).join(' hoặc ')}.` : 'Bước này cần trả lời bằng chữ hoặc bấm nút ở câu hỏi.'
}

/** Ten file luu: <loai>-<so><duoi> (khong dung ten nguoi dung lam duong dan) */
function destFor(chatId: number, s: Session, kind: Kind, name: string, mime = ''): string {
  const dir = uploadDir(chatId, s)
  mkdirSync(dir, { recursive: true })
  const ext = (extname(name).toLowerCase().match(/^\.[a-z0-9]{2,5}$/)?.[0]) || MIME_EXT[mime] || (kind === 'video' ? '.mp4' : kind === 'image' ? '.jpg' : '.ttf')
  const prefix = s.step === 'source' ? 'nguon' : s.step === 'reference' ? 'mau' : kind === 'font' ? 'font' : s.flow === 'motion' ? 'anh' : 'tu-lieu'
  let n = 1
  while (existsSync(join(dir, `${prefix}-${n}${ext}`))) n++
  return join(dir, `${prefix}-${n}${ext}`)
}

function capacityError(s: Session, kind: Kind): string | null {
  if (s.step === 'source' && s.videos.length >= MAX_SOURCES) return `Tối đa ${MAX_SOURCES} video nguồn.`
  if (s.step === 'inserts' && s.inserts.length >= MAX_INSERTS) return `Tối đa ${MAX_INSERTS} tư liệu.`
  if (s.step === 'm_assets' && s.m.assets.length >= MAX_ASSETS) return `Tối đa ${MAX_ASSETS} ảnh.`
  if (s.step === 'font' && kind === 'font' && s.fonts.length + s.fontFiles.length >= MAX_FONTS) return `Đã đủ ${MAX_FONTS} font — bấm Xong.`
  return null
}

async function onMedia(chatId: number, s: Session, m: TgMessage, f: InFile): Promise<void> {
  const kinds = mediaKindsFor(s)
  if (!f.kind || !kinds.includes(f.kind)) return void (await send(chatId, '⚠️ ' + wrongKind(s), undefined, { reply_to_message_id: m.message_id }))
  const cap = capacityError(s, f.kind)
  if (cap) return void (await send(chatId, '⚠️ ' + cap))
  const total = f.ref.file_size || 0
  const linkHint = 'Hãy gửi <b>link tải</b> (Google Drive để "Bất kỳ ai có đường liên kết", Dropbox, link .mp4…)' +
    (s.step === 'source' || s.step === 'reference' ? ', hoặc bấm <b>📚 Chọn từ thư viện</b> nếu video đã từng dùng trong app.' : '.')
  if (total > MT_DOWNLOAD_MAX) {
    return void (await send(chatId, `⚠️ File <b>${esc(f.name)}</b> nặng ${fmtMb(total)} — Telegram chỉ cho tải file tối đa 4 GB.\n` + linkHint,
      undefined, { reply_to_message_id: m.message_id }))
  }
  const big = total > TG_DOWNLOAD_MAX
  const dest = destFor(chatId, s, f.kind, f.name, f.ref.mime_type)
  const head = `⏳ Đang tải ${KIND_LABEL[f.kind]} <b>${esc(f.name)}</b> lên app`
  const wait = await send(chatId, big ? `${head} (${fmtMb(total)} — file lớn, có thể mất vài phút)…` : `${head}…`, undefined, { reply_to_message_id: m.message_id })
  let size = 0
  try {
    if (big) {
      // Bot API chi tai <= 20 MB -> MTProto (mtproto.ts); sua tin tien do moi ~10% (toi da 1 lan / 5 giay)
      let shown = 0
      let at = Date.now()
      size = await deps.downloadBig(token, m.message_id, dest, total, (done, all) => {
        const pct = all ? Math.floor((done / all) * 100) : 0
        if (pct - shown < 10 || Date.now() - at < 5000 || pct >= 100) return
        shown = pct
        at = Date.now()
        void edit(chatId, wait, `${head}: ${pct}% (${fmtMb(done)} / ${fmtMb(all)})…`).catch(() => undefined)
      })
    } else size = await tgDownload(token, f.ref.file_id, dest)
  } catch (e) {
    rmSync(dest, { force: true })
    return void (await edit(chatId, wait, '❌ Không tải được file: ' + esc((e as Error).message) + (big ? '\n' + linkHint : '')))
  }
  await accept(chatId, s, { path: dest, name: f.name, size, kind: f.kind, msgId: m.message_id }, wait)
}

async function onLink(chatId: number, s: Session, m: TgMessage, url: string): Promise<void> {
  const kinds = mediaKindsFor(s)
  const kind0 = kinds[0]
  const capErr = capacityError(s, kind0)
  if (capErr) return void (await send(chatId, '⚠️ ' + capErr))
  const wait = await send(chatId, '⏳ Đang tải file từ link về app… (file lớn có thể mất vài phút)', undefined, { reply_to_message_id: m.message_id })
  const tmp = join(uploadDir(chatId, s), `tai-${randomBytes(3).toString('hex')}.part`)
  mkdirSync(uploadDir(chatId, s), { recursive: true })
  let got: { size: number; name?: string; type: string }
  try {
    got = await downloadUrl(url, tmp, kind0 === 'video' ? 4 * 1024 ** 3 : 100 * 1048576)
  } catch (e) {
    rmSync(tmp, { force: true })
    return void (await edit(chatId, wait, '❌ ' + esc((e as Error).message)))
  }
  let urlName = ''
  try {
    urlName = decodeURIComponent(basename(new URL(url).pathname || ''))
  } catch {
    /* link la */
  }
  const name = got.name || (extname(urlName) ? urlName : '') || `file${MIME_EXT[got.type.split(';')[0]] || ''}`
  const kind = kindOfName(name, got.type) || (kind0 === 'video' && got.type.startsWith('application/octet-stream') ? 'video' : null)
  if (!kind || !kinds.includes(kind)) {
    rmSync(tmp, { force: true })
    return void (await edit(chatId, wait, '❌ File từ link không phải ' + kinds.map((x) => KIND_LABEL[x]).join(' / ') + '.'))
  }
  const dest = destFor(chatId, s, kind, name, got.type.split(';')[0])
  try {
    renameSync(tmp, dest)
  } catch (e) {
    rmSync(tmp, { force: true })
    return void (await edit(chatId, wait, '❌ ' + esc((e as Error).message)))
  }
  await accept(chatId, s, { path: dest, name, size: got.size, kind, msgId: m.message_id }, wait)
}

/** File da ve may: kiem (video doc duoc), ghi vao phien, bao nhan + hen hoi tiep. */
async function accept(chatId: number, s: Session, f: UpFile, waitMsg: number): Promise<void> {
  if (f.kind === 'video') {
    const d = await deps.probe(f.path)
    if (d === null) {
      rmSync(f.path, { force: true })
      return void (await edit(chatId, waitMsg, `❌ <b>${esc(f.name)}</b> không đọc được như video. Gửi lại file khác.`))
    }
    f.duration = d || undefined
  }
  const meta = [f.duration ? fmtDur(f.duration) : '', fmtMb(f.size)].filter(Boolean).join(' · ')
  switch (s.step) {
    case 'source':
      s.videos.push(f)
      await edit(chatId, waitMsg, `✅ Đã nhận video nguồn ${s.videos.length}: <b>${esc(f.name)}</b> (${meta})`)
      touch(chatId, s)
      later(chatId, () => afterUploads(chatId, s))
      return
    case 'reference':
      if (s.reference && !s.reference.fromLibrary) rmSync(s.reference.path, { force: true })
      s.reference = f
      await edit(chatId, waitMsg, `✅ Đã nhận video mẫu: <b>${esc(f.name)}</b> (${meta})`)
      return advance(chatId, s)
    case 'font':
      s.fontFiles.push(f)
      await edit(chatId, waitMsg, `✅ Đã nhận font: <b>${esc(f.name)}</b> — app sẽ nhập vào kho font khi tạo video.`)
      return ask(chatId, s) // hien lai bang chon kem so font da co
    case 'inserts':
      s.inserts.push(f)
      await edit(chatId, waitMsg, `✅ Đã nhận tư liệu ${s.inserts.length}: <b>${esc(f.name)}</b> (${meta})`)
      touch(chatId, s)
      later(chatId, () => afterUploads(chatId, s))
      return
    case 'm_assets':
      s.m.assets.push(f)
      await edit(chatId, waitMsg, `✅ Đã nhận ảnh ${s.m.assets.length}: <b>${esc(f.name)}</b>`)
      touch(chatId, s)
      later(chatId, () => afterUploads(chatId, s))
      return
  }
}

/** Gom xong cac file vua gui: video nguon -> hoi video mau; tu lieu / anh -> hoi mo ta tung tep. */
async function afterUploads(chatId: number, s0: Session): Promise<void> {
  const s = session(chatId)
  if (!s || s.sid !== s0.sid) return
  // dang mo danh sach thu vien -> cho nguoi dung chon xong
  if (s.step === 'source' && s.videos.length && s.pick?.kind !== 'lib-source') return advance(chatId, s)
  if (s.step === 'inserts' || s.step === 'm_assets') return askNoteOrMore(chatId, s, true)
}

/** fromTimer: lan hoi do hen gom file — cau vua hoi y het thi khong hoi lai (nguoi dung da tra loi nhanh hon hen) */
async function askNoteOrMore(chatId: number, s: Session, fromTimer = false): Promise<void> {
  const p = pendingNote(s)
  const arr = s.flow === 'edit' ? s.inserts : s.m.assets
  const key = p ? 'note:' + p.path : 'more:' + arr.length
  if (fromTimer && s.asked === key) return
  s.asked = key
  if (p) {
    const i = arr.indexOf(p) + 1
    await send(chatId,
      `📝 <b>Mô tả ${s.flow === 'edit' ? 'tư liệu' : 'ảnh'} ${i}/${arr.length}</b> (<i>${esc(p.name)}</i>): đây là gì` +
      (s.flow === 'edit' ? ', muốn chèn lúc nào / ở đoạn nào?' : ', dùng để làm gì trong video?') +
      '\nVD: ' + (s.flow === 'edit' ? '“logo quán, hiện ở cuối video”, “ảnh ly trà sữa, chèn khi nói về menu”' : '“logo thương hiệu”, “ảnh màn hình app trang chủ”'),
      [[{ text: '⏭ Bỏ qua mô tả', callback_data: `${s.sid}|${s.step}|skipnote` }]],
      p.msgId ? { reply_to_message_id: p.msgId, allow_sending_without_reply: true } : {})
    touch(chatId, s)
    return
  }
  await ask(chatId, s)
}

// ---- Chu ----
async function onText(chatId: number, s: Session, text: string): Promise<void> {
  const t = text.slice(0, 1500)
  const need = (min = 2) => t.length >= min
  switch (s.step) {
    case 'source':
    case 'reference':
    case 'font':
      if (s.step === 'font') {
        // go ten font = mo ta font (Brand Guideline "Kieu chu") — AI chon font gan nhat trong kho
        s.typography = t
        await send(chatId, `✅ Ghi nhận font: <b>${esc(t)}</b>`)
        return advance(chatId, s)
      }
      return void (await send(chatId, '⚠️ ' + wrongKind(s) + ' (hoặc gửi link tải file)'))
    case 'purpose':
    case 'style':
    case 'audience':
      if (!need()) return void (await send(chatId, 'Hãy trả lời ngắn gọn bằng chữ nhé.'))
      s[s.step] = t
      return advance(chatId, s)
    case 'duration':
      s.duration = t
      return advance(chatId, s)
    case 'colors':
      s.colors = t
      return advance(chatId, s)
    case 'inserts':
    case 'm_assets': {
      const p = pendingNote(s)
      if (!p) return void (await send(chatId, '⚠️ ' + wrongKind(s) + ' Hoặc bấm Xong ở câu hỏi.'))
      p.note = t.slice(0, 500)
      touch(chatId, s)
      return askNoteOrMore(chatId, s)
    }
    case 'm_name':
      if (!need()) return void (await send(chatId, 'Nhập tên sản phẩm / thương hiệu.'))
      s.m.name = t.slice(0, 120)
      return advance(chatId, s)
    case 'm_message':
      if (!need(5)) return void (await send(chatId, 'Mô tả nội dung chính dài hơn một chút nhé.'))
      s.m.message = t
      return advance(chatId, s)
    case 'm_website': {
      const u = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? 'https://' + t : ''
      if (!u) return void (await send(chatId, 'Website phải là link (VD https://agentedit.vn) — hoặc bấm Bỏ qua.'))
      s.m.website = u
      return advance(chatId, s)
    }
    case 'm_audience':
      s.m.audience = t
      return advance(chatId, s)
    case 'm_duration': {
      const n = Math.round(Number(t.replace(/[^\d.]/g, '')))
      if (!Number.isFinite(n) || n < 6 || n > 90) return void (await send(chatId, 'Gõ số giây từ 6 đến 90 (VD 30).'))
      s.m.duration = n
      return advance(chatId, s)
    }
    case 'm_colors':
      s.m.colors = t
      return advance(chatId, s)
    case 'm_fonts':
      s.m.fonts = t
      return advance(chatId, s)
    case 'm_notes':
      s.m.notes = t
      return finish(chatId, s)
    case 'm_type':
    case 'm_aspect':
    case 'm_voice':
      return void (await send(chatId, 'Bấm chọn một nút ở câu hỏi phía trên nhé.'))
  }
}

// ---------------------------------------------------------------------------
// Nut bam
// ---------------------------------------------------------------------------
async function onCallback(q: TgCallback): Promise<void> {
  const chatId = q.message?.chat.id
  const answer = (text?: string) => tgCall(token, 'answerCallbackQuery', { callback_query_id: q.id, ...(text ? { text } : {}) }).catch(() => undefined)
  if (chatId === undefined || q.message?.chat.type !== 'private') return void (await answer())
  if (!authorized(chatId)) {
    await answer('Cần gửi key phần mềm trước.')
    return
  }
  const data = q.data || ''
  // nut cua viec: job:<id>:retry | job:<id>:cancel
  const jm = /^job:([\w-]+):(retry|cancel)$/.exec(data)
  if (jm) {
    await answer()
    return jobAction(chatId, jm[1], jm[2] as 'retry' | 'cancel')
  }
  const p = parseCb(data)
  const s = session(chatId)
  if (!p || !s || p.sid !== s.sid) return void (await answer('Bảng hỏi này đã cũ — chọn lại ở menu.'))
  if (p.step !== s.step) return void (await answer('Câu hỏi này đã qua rồi.'))
  await answer()
  await action(chatId, s, p.action, q.message!.message_id)
}

async function action(chatId: number, s: Session, a: string, msgId: number): Promise<void> {
  const [verb, arg = ''] = (() => {
    const i = a.indexOf(':')
    return i < 0 ? [a, ''] : [a.slice(0, i), a.slice(i + 1)]
  })()
  const clearButtons = () => tgCall(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } }).catch(() => undefined)
  switch (verb) {
    case 'skip':
      await clearButtons()
      if (s.step === 'reference') s.reference = null
      if (s.step === 'duration') s.duration = undefined
      if (s.step === 'font') {
        s.fonts = []
        s.fontFiles = []
      }
      if (s.step === 'inserts') return finish(chatId, s)
      if (s.step === 'm_notes') return finish(chatId, s)
      return advance(chatId, s)
    case 'skipnote': {
      const p = pendingNote(s)
      await clearButtons()
      if (p) p.note = ''
      touch(chatId, s)
      return askNoteOrMore(chatId, s)
    }
    case 'done':
      await clearButtons()
      if ((s.step === 'inserts' || s.step === 'm_assets') && pendingNote(s)) return askNoteOrMore(chatId, s)
      if (s.step === 'inserts') return finish(chatId, s)
      return advance(chatId, s)
    case 'addsrc':
      await clearButtons()
      s.step = 'source'
      return ask(chatId, s)
    case 'lib':
      return showLibrary(chatId, s)
    case 'back':
      await tgCall(token, 'deleteMessage', { chat_id: chatId, message_id: msgId }).catch(() => undefined)
      s.pick = undefined
      return ask(chatId, s)
    case 'page': {
      if (!s.pick) return
      s.pick.page = Math.max(0, Number(arg) || 0)
      touch(chatId, s)
      return redrawPick(chatId, s)
    }
    case 'pick':
      return pick(chatId, s, Number(arg))
    case 'dur':
      await clearButtons()
      s.duration = arg
      await send(chatId, `✅ Độ dài: <b>${esc(arg)}</b>`)
      return advance(chatId, s)
    case 'type':
      await clearButtons()
      s.m.videoType = arg
      return advance(chatId, s)
    case 'asp':
      await clearButtons()
      s.m.aspect = arg as Session['m']['aspect']
      return advance(chatId, s)
    case 'sec':
      await clearButtons()
      s.m.duration = Number(arg) || 20
      return advance(chatId, s)
    case 'novoice':
      await clearButtons()
      s.m.voice = { enabled: false }
      return advance(chatId, s)
  }
}

async function showLibrary(chatId: number, s: Session): Promise<void> {
  const items = await deps.libraryList().catch(() => [])
  const taken = new Set(s.videos.map((v) => v.path))
  const list = items.filter((it) => !taken.has(it.path))
  if (!list.length) return void (await send(chatId, '📚 Thư viện chưa có video nào dùng được (video đã phân tích trong app sẽ hiện ở đây). Hãy gửi video lên.'))
  s.pick = {
    kind: s.step === 'source' ? 'lib-source' : 'lib-ref',
    items: list.slice(0, 80).map((it) => ({ label: `${it.analyzed ? '✓ ' : ''}${it.name}${it.duration ? ' · ' + fmtDur(it.duration) : ''}`, value: it.path, extra: it.duration })),
    page: 0
  }
  s.pick.msgId = await send(chatId, libText(s), libKeyboard(s))
  touch(chatId, s)
}
const libText = (s: Session) => `📚 <b>Chọn ${s.step === 'source' ? 'video nguồn' : 'video mẫu'} từ thư viện</b> (✓ = đã phân tích, dùng lại không tốn AI):`
function libKeyboard(s: Session): InlineKeyboard {
  const kb = pickRows(s)
  kb.push([{ text: '↩️ Quay lại', callback_data: `${s.sid}|${s.step}|back` }])
  return kb
}
function pickRows(s: Session): InlineKeyboard {
  // 1 nut / hang cho ten video dai
  const pk = s.pick!
  const PAGE = 8
  const start = pk.page * PAGE
  const rows: InlineKeyboard = pk.items.slice(start, start + PAGE).map((it, k) => [{ text: it.label.slice(0, 60), callback_data: `${s.sid}|${s.step}|pick:${start + k}` }])
  const nav = []
  if (pk.page > 0) nav.push({ text: '◀ Trước', callback_data: `${s.sid}|${s.step}|page:${pk.page - 1}` })
  if (start + PAGE < pk.items.length) nav.push({ text: 'Sau ▶', callback_data: `${s.sid}|${s.step}|page:${pk.page + 1}` })
  if (nav.length) rows.push(nav)
  return rows
}

async function redrawPick(chatId: number, s: Session): Promise<void> {
  const pk = s.pick
  if (!pk?.msgId) return
  if (pk.kind === 'lib-source' || pk.kind === 'lib-ref') return edit(chatId, pk.msgId, libText(s), libKeyboard(s))
  const p = prompt(s, { hasSaydi: deps.hasSaydi() })
  return edit(chatId, pk.msgId, p.text, p.keyboard)
}

async function pick(chatId: number, s: Session, i: number): Promise<void> {
  const pk = s.pick
  const it = pk?.items[i]
  if (!pk || !it) return
  if (pk.kind === 'lib-source' || pk.kind === 'lib-ref') {
    if (!existsSync(it.value)) return void (await send(chatId, '⚠️ Video này không còn trên máy.'))
    const f: UpFile = { path: it.value, name: basename(it.value), size: statSync(it.value).size, kind: 'video', duration: it.extra, fromLibrary: true }
    await edit(chatId, pk.msgId!, `✅ Đã chọn từ thư viện: <b>${esc(f.name)}</b>${f.duration ? ' (' + fmtDur(f.duration) + ')' : ''}`)
    s.pick = undefined
    if (pk.kind === 'lib-source') {
      if (s.videos.length >= MAX_SOURCES) return void (await send(chatId, `⚠️ Tối đa ${MAX_SOURCES} video nguồn.`))
      s.videos.push(f)
      touch(chatId, s)
      later(chatId, () => afterUploads(chatId, s))
      return
    }
    s.reference = f
    return advance(chatId, s)
  }
  if (pk.kind === 'font') {
    const had = s.fonts.findIndex((f) => f.id === it.value)
    if (had >= 0) s.fonts.splice(had, 1)
    else if (s.fonts.length + s.fontFiles.length >= MAX_FONTS) return void (await send(chatId, `⚠️ Tối đa ${MAX_FONTS} font — bỏ chọn bớt hoặc bấm Xong.`))
    else s.fonts.push({ id: it.value, name: it.label })
    touch(chatId, s)
    return redrawPick(chatId, s)
  }
  if (pk.kind === 'voice') {
    s.m.voice = { enabled: true, voiceId: it.value, voiceName: it.label.replace(/^⭐ /, '') }
    await edit(chatId, pk.msgId!, `🎙 Giọng đọc: <b>${esc(s.m.voice.voiceName)}</b>`)
    return advance(chatId, s)
  }
}

// ---------------------------------------------------------------------------
// Tao video
// ---------------------------------------------------------------------------
async function finish(chatId: number, s: Session): Promise<void> {
  const dir = uploadDir(chatId, s)
  let id = ''
  let title = ''
  try {
    if (s.flow === 'edit') {
      if (!s.videos.length) {
        s.step = 'source'
        await send(chatId, '⚠️ Chưa có video nguồn.')
        return ask(chatId, s)
      }
      const clean = <T extends Record<string, unknown>>(o: T): T | undefined => {
        const e = Object.fromEntries(Object.entries(o).filter(([, v]) => (Array.isArray(v) ? v.length : !!v)))
        return Object.keys(e).length ? (e as T) : undefined
      }
      const input: JobInput = {
        videos: s.videos.map((v) => v.path),
        reference: s.reference?.path || null,
        inserts: s.inserts.map((f) => ({ path: f.path, use: 'show', placement: 'auto', note: (f.note || '').slice(0, 500) })),
        editRequest: clean({ purpose: s.purpose, style: s.style, audience: s.audience, duration: s.duration }),
        brandGuide: clean({ typography: s.typography, colors: s.colors, fonts: s.fonts.map((f) => f.id).slice(0, MAX_FONTS) }),
        ...(s.fontFiles.length ? { fontFiles: s.fontFiles.map((f) => f.path) } : {}),
        orientation: 'portrait',
        outDir: null,
        name: null,
        fresh: false,
        newPlan: false
      }
      title = (s.purpose || s.videos[0].name).slice(0, 60)
      id = deps.startEdit(input)
    } else {
      const m = s.m
      const notes = [
        m.notes || '',
        ...m.assets.filter((a) => a.note).map((a) => `Ảnh ${basename(a.path)}: ${a.note}`)
      ].filter(Boolean).join('\n')
      const brief: MotionBrief = {
        name: m.name || '',
        website: m.website,
        videoType: m.videoType || 'promo',
        message: m.message || '',
        audience: m.audience,
        aspect: m.aspect || '9:16',
        duration: m.duration || 20,
        language: 'vi',
        colors: m.colors,
        fonts: m.fonts,
        assets: m.assets.map((a) => a.path),
        notes: notes || undefined,
        voice: m.voice?.enabled ? { enabled: true, voiceId: m.voice.voiceId, voiceName: m.voice.voiceName, speed: 1 } : { enabled: false, speed: 1 }
      }
      const err = validateBrief(brief)
      if (err) return void (await send(chatId, '⚠️ ' + esc(err)))
      title = m.name || 'Video'
      id = (await deps.createMotion(brief)).id
    }
  } catch (e) {
    return void (await send(chatId, '❌ Không tạo được video: ' + esc((e as Error).message) + '\nBảng hỏi vẫn giữ — bấm ❌ Huỷ thao tác để làm lại.', MENU))
  }
  const ref: TgJobRef = { id, kind: s.flow === 'edit' ? 'edit' : 'motion', chatId, title, createdAt: Date.now(), uploadDir: dir }
  const st = tgState()
  st.jobs.push(ref)
  dropSession(chatId, true)
  await send(chatId,
    `🚀 <b>Đã nhận yêu cầu!</b> Mã video: <code>${id}</code>\n${summary(s)}\n\n` +
    (s.flow === 'edit' ? 'App đang tạo video (phân tích → dựng → xuất video), thường 10–40 phút.' : 'AI đang tạo video (ý tưởng → dựng → xuất video), thường 20–60 phút.') +
    ' Xong mình gửi video vào đây — trong lúc chờ bạn cứ tạo thêm video khác.', MENU)
  ref.statusMsgId = await send(chatId, `⏳ <code>${id}</code> — đang khởi động…`, [[{ text: '🛑 Huỷ video này', callback_data: `job:${id}:cancel` }]])
  saveTgState()
}

// ---------------------------------------------------------------------------
// Theo doi viec -> sua tin trang thai, xong gui video
// ---------------------------------------------------------------------------
const EDIT_STEP_LABEL: Partial<Record<JobStep, string>> = {
  prepare: 'Chuẩn bị', import: 'Chép video vào dự án', analyze: 'Phân tích video', plan: 'Dựng video', render: 'Xuất video', finish: 'Hoàn tất'
}
const EDIT_ORDER: JobStep[] = ['prepare', 'import', 'analyze', 'plan', 'render', 'finish']

interface View {
  state: 'running' | 'done' | 'error' | 'cancelled'
  sig: string
  text: string
  output?: string
  meta?: { width?: number; height?: number; duration?: number; size?: number }
  error?: string
  warnings?: string[]
}

const bar = (p: number) => '▓'.repeat(Math.round(p * 10)) + '░'.repeat(10 - Math.round(p * 10))

function viewOf(ref: TgJobRef): View | null {
  if (ref.kind === 'edit') {
    const j = deps.editJob(ref.id)
    if (!j) return null
    if (j.status === 'done' && j.result) {
      return { state: 'done', sig: 'done', text: '', output: j.result.output, meta: { width: j.result.width, height: j.result.height, duration: j.result.duration, size: j.result.size }, warnings: j.result.warnings }
    }
    if (j.status === 'error') return { state: 'error', sig: 'error', text: '', error: j.error?.message || j.message || 'Lỗi' }
    if (j.status === 'cancelled') return { state: 'cancelled', sig: 'cancelled', text: '' }
    const step = j.step || 'prepare'
    const n = Math.max(1, EDIT_ORDER.indexOf(step) + 1)
    const quarter = step === 'render' ? Math.floor((j.progress || 0) * 10) : 0
    const lines = [`⏳ <code>${ref.id}</code> — ${esc(ref.title)}`, `Bước ${n}/${EDIT_ORDER.length}: <b>${EDIT_STEP_LABEL[step] || 'Đang xử lý'}</b>`]
    if (j.waiting) lines.push('🕒 Đang chờ lượt (có video khác đang chạy) — tới lượt sẽ tự chạy tiếp')
    else if (j.message) lines.push(esc(j.message))
    if (step === 'render' && j.progress) lines.push(`${bar(j.progress)} ${Math.round(j.progress * 100)}%`)
    return { state: 'running', sig: `${step}|${j.waiting || ''}|${quarter}|${step === 'prepare' ? j.message : ''}`, text: lines.join('\n') }
  }
  const j = deps.motionJob(ref.id)
  if (!j) return null
  if (j.status === 'done' && j.output) {
    return { state: 'done', sig: 'done', text: '', output: j.output, meta: { width: j.meta?.width, height: j.meta?.height, duration: j.meta?.seconds, size: j.meta?.size } }
  }
  if (j.status === 'error' || j.status === 'interrupted' || (j.status === 'done' && !j.output)) return { state: 'error', sig: 'error', text: '', error: j.error || 'Lỗi' }
  if (j.status === 'cancelled') return { state: 'cancelled', sig: 'cancelled', text: '' }
  const lines = [`⏳ <code>${ref.id}</code> — ${esc(ref.title)}`, j.status === 'queued' ? '🕒 Đang chờ lượt (có video khác đang tạo)' : `Bước: <b>${stageLabel(j.stage)}</b>`]
  return { state: 'running', sig: `${j.status}|${j.stage || ''}`, text: lines.join('\n') }
}

let watching = false
async function watchJobs(): Promise<void> {
  if (watching || !running || !token) return
  watching = true
  try {
    const st = tgState()
    for (const ref of st.jobs.filter((r) => !r.finished)) {
      const v = viewOf(ref)
      if (!v) {
        ref.finished = true
        saveTgState()
        continue
      }
      if (v.sig === ref.sig) continue
      // vua tao viec, tin trang thai chua gui xong -> chua ghi moc (lan sau sua tin dung buoc)
      if (v.state === 'running' && !ref.statusMsgId) continue
      ref.sig = v.sig
      saveTgState()
      try {
        if (v.state === 'running') {
          if (ref.statusMsgId) await edit(ref.chatId, ref.statusMsgId, v.text, [[{ text: '🛑 Huỷ video này', callback_data: `job:${ref.id}:cancel` }]])
          continue
        }
        ref.finished = true
        saveTgState()
        if (v.state === 'done') await deliver(ref, v)
        else if (v.state === 'error') {
          if (ref.statusMsgId) await edit(ref.chatId, ref.statusMsgId, `❌ <code>${ref.id}</code> — lỗi`).catch(() => undefined)
          await send(ref.chatId, `❌ Video <code>${ref.id}</code> (${esc(ref.title)}) bị lỗi:\n${esc((v.error || '').slice(0, 800))}`,
            [[{ text: '🔁 Chạy lại', callback_data: `job:${ref.id}:retry` }]])
        } else {
          if (ref.statusMsgId) await edit(ref.chatId, ref.statusMsgId, `✖️ <code>${ref.id}</code> — đã huỷ`).catch(() => undefined)
        }
      } catch (e) {
        log('bao viec loi: ' + String(e))
        // gui hong (mang) -> de lan sau bao lai
        if ((e as TgError).retry) {
          ref.sig = undefined
          ref.finished = false
          saveTgState()
        }
      }
    }
  } finally {
    watching = false
  }
}

async function deliver(ref: TgJobRef, v: View): Promise<void> {
  const file = v.output!
  const m = v.meta || {}
  const info = [m.duration ? fmtDur(m.duration) : '', m.width && m.height ? `${m.width}x${m.height}` : ''].filter(Boolean).join(' · ')
  const caption = `✅ Video <code>${ref.id}</code> xong${info ? ' · ' + info : ''}\n${esc(ref.title)}` +
    (v.warnings?.length ? '\n' + v.warnings.slice(0, 3).map((w) => '⚠️ ' + esc(w)).join('\n') : '')
  if (ref.statusMsgId) await edit(ref.chatId, ref.statusMsgId, `✅ <code>${ref.id}</code> — đã xong, video ở bên dưới`).catch(() => undefined)
  if (!existsSync(file)) {
    await send(ref.chatId, caption + '\n(Không thấy file video trên máy — mở app ở “Video đã tạo”.)')
    return
  }
  await sendVideoFile(ref.chatId, file, caption, m)
  // xong -> bo file nguoi dung gui (app da chep vao du an / thu muc video)
  if (ref.uploadDir) rmSync(ref.uploadDir, { recursive: true, force: true })
}

async function sendVideoFile(chatId: number, file: string, caption: string, m: View['meta'] = {}): Promise<void> {
  void tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'upload_video' }).catch(() => undefined)
  const size = statSync(file).size
  const vparams = { chat_id: chatId, caption, parse_mode: 'HTML', supports_streaming: true, width: m.width, height: m.height, duration: m.duration ? Math.round(m.duration) : undefined }
  if (size <= TG_UPLOAD_MAX) {
    try {
      await tgUpload(token, 'sendVideo', 'video', file, vparams, basename(file), 'video/mp4')
      return
    } catch (e) {
      const err = e as TgError
      if (err.retry) throw err
      // Telegram khong nhan la "video" (codec la...) -> gui dang file
      if (err.code !== 413) {
        await tgUpload(token, 'sendDocument', 'document', file, { chat_id: chatId, caption, parse_mode: 'HTML' }, basename(file), 'video/mp4')
        return
      }
    }
  }
  // > 49 MB: link ban goc (48 gio) + ban nen gui thang
  await send(chatId, `📦 Video nặng ${fmtMb(size)} — vượt giới hạn 50 MB của Telegram. Đang chuẩn bị bản nén + link tải bản gốc…`)
  const [link, small] = await Promise.all([deps.publicLink(file), deps.compress(file, 45 * 1048576)])
  const linkLine = link ? `\n🔗 <a href="${esc(link)}">Tải bản gốc chất lượng cao</a> (link có hạn 48 giờ)` : '\n(Bản gốc nằm trong app: “Video đã tạo”.)'
  if (small) {
    try {
      await tgUpload(token, 'sendVideo', 'video', small, { ...vparams, caption: caption + '\n<i>Bản nén để xem nhanh.</i>' + linkLine }, basename(file), 'video/mp4')
    } finally {
      rmSync(small, { force: true })
    }
    return
  }
  await send(chatId, caption + linkLine)
}

async function jobAction(chatId: number, id: string, act: 'retry' | 'cancel'): Promise<void> {
  const st = tgState()
  const ref = st.jobs.find((r) => r.id === id && r.chatId === chatId)
  if (!ref) return void (await send(chatId, 'Không thấy video này.'))
  if (act === 'cancel') {
    const v = viewOf(ref)
    if (!v || v.state !== 'running') return void (await send(chatId, 'Video này không còn đang chạy.'))
    if (ref.kind === 'edit') deps.cancelEdit(id)
    else deps.cancelMotion(id)
    return void (await send(chatId, `🛑 Đang huỷ video <code>${id}</code>…`))
  }
  // chay lai: Edit video = viec moi cung dau vao (phan tich / ke hoach da luu dung lai), Tao video = chay lai cung thu muc
  let newId = id
  try {
    if (ref.kind === 'edit') {
      const j = deps.editJob(id)
      if (!j) return void (await send(chatId, 'Không còn dữ liệu của video này để chạy lại.'))
      const missing = [...j.input.videos, ...(j.input.reference ? [j.input.reference] : []), ...j.input.inserts.map((x) => x.path)].filter((p) => !existsSync(p))
      if (missing.length) return void (await send(chatId, 'Không chạy lại được: file gửi lên đã bị xoá. Tạo video mới nhé.'))
      newId = deps.startEdit({ ...j.input, fresh: false, newPlan: false })
    } else newId = deps.rerunMotion(id).id
  } catch (e) {
    return void (await send(chatId, '❌ Không chạy lại được: ' + esc((e as Error).message)))
  }
  const nref: TgJobRef = { id: newId, kind: ref.kind, chatId, title: ref.title, createdAt: Date.now(), uploadDir: ref.uploadDir }
  if (newId === id) {
    Object.assign(ref, { finished: false, sig: undefined, createdAt: Date.now() })
  } else {
    ref.uploadDir = undefined
    st.jobs.push(nref)
  }
  const target = newId === id ? ref : nref
  target.statusMsgId = await send(chatId, `🔁 Đang chạy lại — mã <code>${newId}</code>`, [[{ text: '🛑 Huỷ video này', callback_data: `job:${newId}:cancel` }]])
  saveTgState()
}

async function listJobsMsg(chatId: number): Promise<void> {
  const mine = tgState().jobs.filter((r) => r.chatId === chatId).sort((a, b) => b.createdAt - a.createdAt).slice(0, 12)
  if (!mine.length) return void (await send(chatId, 'Bạn chưa tạo video nào qua bot.', MENU))
  const icon: Record<View['state'], string> = { running: '⏳', done: '✅', error: '❌', cancelled: '✖️' }
  const lines = mine.map((r) => {
    const v = viewOf(r)
    const when = new Date(r.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    return `${v ? icon[v.state] : '•'} <code>${r.id}</code> · ${r.kind === 'edit' ? 'Edit' : 'Tạo'} · ${esc(r.title.slice(0, 40))} · ${when}`
  })
  await send(chatId, '<b>📋 Video của bạn</b> (gửi mã để xem chi tiết / nhận lại video):\n' + lines.join('\n'), MENU)
}

async function jobDetail(chatId: number, id: string): Promise<void> {
  const ref = tgState().jobs.find((r) => r.id === id && r.chatId === chatId)
  if (!ref) return void (await send(chatId, 'Không thấy video có mã này trong danh sách của bạn.'))
  const v = viewOf(ref)
  if (!v) return void (await send(chatId, 'Video này không còn trên máy.'))
  if (v.state === 'running') return void (await send(chatId, v.text, [[{ text: '🛑 Huỷ video này', callback_data: `job:${id}:cancel` }]]))
  if (v.state === 'done' && v.output && existsSync(v.output)) {
    const m = v.meta || {}
    return sendVideoFile(chatId, v.output, `✅ Video <code>${id}</code>\n${esc(ref.title)}`, m)
  }
  if (v.state === 'error') return void (await send(chatId, `❌ <code>${id}</code> lỗi: ${esc((v.error || '').slice(0, 800))}`, [[{ text: '🔁 Chạy lại', callback_data: `job:${id}:retry` }]]))
  await send(chatId, `✖️ <code>${id}</code> đã huỷ.`, [[{ text: '🔁 Chạy lại', callback_data: `job:${id}:retry` }]])
}

/** Don thu muc file da gui: phien khong con + viec da xong / qua 7 ngay */
function cleanupUploads(): void {
  try {
    if (!existsSync(TG_UPLOADS)) return
    const st = tgState()
    const keep = new Set<string>()
    for (const [chat, s] of Object.entries(st.sessions)) keep.add(join(TG_UPLOADS, chat, s.sid))
    for (const j of st.jobs) if (j.uploadDir && (!j.finished || Date.now() - j.createdAt < 7 * 86400000)) keep.add(j.uploadDir)
    for (const chat of readdirSync(TG_UPLOADS)) {
      const cdir = join(TG_UPLOADS, chat)
      for (const sid of readdirSync(cdir)) {
        const d = join(cdir, sid)
        if (!keep.has(d) && Date.now() - statSync(d).mtimeMs > 3600000) rmSync(d, { recursive: true, force: true })
      }
    }
  } catch {
    /* bo qua */
  }
}

// het viec dang cho -> dung trong test
export const _test = {
  dispatch,
  watchJobs,
  /** cho moi hang + hen gom file xong */
  idle: async () => {
    for (let i = 0; i < 400 && (queues.size || timers.size); i++) await Promise.all([...queues.values(), new Promise((r) => setTimeout(r, 10))])
  },
  setGather: (ms: number) => {
    GATHER_MS = ms
  }
}
