// Lenh cua dich vu nen (protocol.ts) — goi DUNG cac ham ma giao dien app goi qua IPC (motion-ipc.ts, phoneagent-ipc.ts,
// ipc.ts) -> CLI / ky nang GetTime lam duoc moi viec nhu bam tren app, chung du lieu + hang doi voi app dang mo.
// Ket qua tra ve GON (khong dua anh base64 / nhat ky dai) — AI trong chat doc.
import { app, BrowserWindow } from 'electron'
import { existsSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { findBinary } from '../services/env'
import { maskedProviders, providersConfigured, saveProviders, type ProviderConfig } from '../services/secrets'
import { pushConfig, sidecarInfo, sidecarRequest, startSidecar } from '../services/sidecar'
import { CLI_PACKAGES, agyFailureText, startCliLogout } from '../services/cli-login'
import { jobLimitsOf, readState, saveJobLimits } from '../services/state'
import { checkLicense, licenseDisabled, licenseState } from '../services/license'
import { deleteProject, getProject, listProjects } from '../services/projects'
import { renderStatus } from '../services/remotion'
import {
  busyMotionIds,
  cancelMotionJob,
  createMotionJob,
  deleteMotionJob,
  getMotionJob,
  listMotionJobs,
  motionLimit,
  rerunMotionJob,
  setMotionLimit
} from '../services/motion/runner'
import { STAGES, stageLabel } from '../services/motion/stages'
import { ASPECT_SIZE, VIDEO_TYPES, clampDuration } from '../services/motion/prompt'
import { mvdStatus } from '../services/motion/mvd'
import { DEFAULT_CLAUDE_MODEL, chromeStatus, ffmpegPath, pythonStatus } from '../services/motion/tools'
import { listSaydiVoices, saydiMasked, setSaydiKey, testSaydiKey } from '../services/motion/saydi'
import {
  checkAutoProject,
  deleteAutoProject,
  getAutoProject,
  publicProjects,
  saveAutoProject,
  testAutoSource,
  toggleAutoProject
} from '../services/motion/automation'
import type { AutoPostConfig, MotionBrief } from '../services/motion/types'
import { getToken, phoneAgentMasked, setPhoneAgentConfig } from '../services/phoneagent/client'
import { paDevices, paMe, paScriptFields, paScripts } from '../services/phoneagent/api'
import { cancelPost, createPost, deletePost, listPosts, reschedulePost, retryPost, type PostJob } from '../services/phoneagent/posts'
import { templateContext } from '../services/phoneagent/auto'
import { readJson, writeJsonAtomic } from '../cli/util'
import { MOTION_OUT_FILE, motionStatusFile, motionView, postStatusView } from './motion-status'
import type { SvcHandler } from './server'
import type { SvcResponse } from './protocol'

const errOf = (e: unknown) => String((e as Error)?.message || e)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim())
const num = (v: unknown): number | undefined => {
  const n = Number(v)
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? undefined : n
}
const bool = (v: unknown): boolean | undefined => (v === undefined || v === null || v === '' ? undefined : v === true || v === 'true' || v === '1' || v === 1)
const fail = (error: string, hint?: string): SvcResponse => ({ ok: false, error, ...(hint ? { hint } : {}) })

async function ensureSidecar(): Promise<{ ok: boolean; error?: string }> {
  if (sidecarInfo().ready) return { ok: true }
  return startSidecar()
}

/** id cli_status cua tung tai khoan (gpt = Codex) */
const accountId = (a: unknown) => (a === 'gemini' ? 'gemini' : a === 'claude' ? 'claude' : a === 'codex' || a === 'gpt' || a === 'openai' ? 'gpt' : '')

async function cliStatusOf(id: string, fresh = false): Promise<Record<string, any> | null> {
  const s = await ensureSidecar()
  if (!s.ok) return null
  const r = await sidecarRequest('/cli_status', fresh ? { name: id, fresh: true } : { name: id }, 120000).catch(() => null)
  return r?.status?.[id] || null
}

// ---------------------------------------------------------------------------
// Brief Tao video tu tham so CLI (giong form "Tao video")
// ---------------------------------------------------------------------------
export function briefFrom(a: Record<string, unknown>, base?: Partial<MotionBrief>): MotionBrief {
  const voiceOff = bool(a.noVoice) === true || bool(a.voice) === false
  const prevVoice = base?.voice || { enabled: true, speed: 1 }
  const voiceId = str(a.voiceId) || (prevVoice.voiceId as string) || ''
  const brief: MotionBrief = {
    name: str(a.name) || str(base?.name),
    website: str(a.website) || base?.website || undefined,
    videoType: str(a.videoType) || base?.videoType || 'promo',
    message: str(a.message) || str(base?.message),
    audience: str(a.audience) || base?.audience || undefined,
    goal: str(a.goal) || base?.goal || undefined,
    cta: str(a.cta) || base?.cta || undefined,
    tone: str(a.tone) || base?.tone || undefined,
    aspect: ((str(a.aspect) || base?.aspect || '9:16') as MotionBrief['aspect']),
    duration: clampDuration(num(a.duration) ?? base?.duration ?? 20),
    language: str(a.language) || base?.language || 'vi',
    colors: str(a.colors) || base?.colors || undefined,
    fonts: str(a.fonts) || base?.fonts || undefined,
    assets: Array.isArray(a.assets) && a.assets.length ? (a.assets as unknown[]).map(str).filter(Boolean) : base?.assets || [],
    notes: str(a.notes) || base?.notes || undefined,
    engine: (str(a.engine) || base?.engine || undefined) as MotionBrief['engine'],
    voice: voiceOff
      ? { enabled: false, speed: 1 }
      : {
          enabled: true,
          voiceId,
          voiceName: str(a.voiceName) || (voiceId === prevVoice.voiceId ? prevVoice.voiceName : undefined) || undefined,
          speed: Math.min(1.3, Math.max(0.7, num(a.speed) ?? prevVoice.speed ?? 1)),
          script: str(a.script) || prevVoice.script || undefined
        }
  }
  if (brief.engine && brief.engine !== 'mvd' && brief.engine !== 'motionmaxxing') throw new Error('Quy trình dựng chỉ nhận motionmaxxing hoặc mvd.')
  if (!ASPECT_SIZE[brief.aspect]) throw new Error('Khung hình chỉ nhận 9:16, 16:9 hoặc 1:1.')
  if (!VIDEO_TYPES.some((t) => t.id === brief.videoType)) throw new Error(`Loại video không hợp lệ (${VIDEO_TYPES.map((t) => t.id).join(', ')}).`)
  return brief
}

// ---------------------------------------------------------------------------
// Tinh trang san sang + "lam duoc gi"
// ---------------------------------------------------------------------------
function motionReadiness() {
  const cfg = providersConfigured() as Record<string, any>
  const claude = (cfg.claude || {}) as Partial<ProviderConfig>
  const mvd = mvdStatus()
  return {
    claude: {
      installed: !!findBinary('claude'),
      mode: claude.auth_mode === 'api_key' ? 'api_key' : 'subscription',
      model: (claude.auth_mode === 'api_key' ? claude.model : claude.sub_model) || DEFAULT_CLAUDE_MODEL
    },
    saydi: saydiMasked().has_key,
    python: pythonStatus().ok,
    ffmpeg: !!ffmpegPath(),
    chrome: chromeStatus().ok,
    mvd: { available: mvd.available, version: mvd.version, elevenlabs: mvd.elevenlabs }
  }
}

function capabilities(): SvcResponse {
  const ready = motionReadiness()
  const lic = licenseState()
  return {
    ok: true,
    app: { version: app.getVersion(), license: licenseDisabled() ? 'ok' : lic.status },
    features: [
      { id: 'edit', name: 'Edit Video', what: 'Dựng/edit video từ video quay sẵn: cắt khoảng lặng, hook, phụ đề karaoke, chữ hiệu ứng, ảnh AI, SFX, nhạc nền; theo yêu cầu edit, Brand Guideline (font, màu), tư liệu chèn, video mẫu. Sửa lại từ video đã tạo (lập lại kế hoạch, render lại, đổi tư liệu).', time: '10–40 phút', needs: 'Gemini (phân tích video) + Claude (lập kế hoạch) đăng nhập; Codex tuỳ chọn (ảnh AI)' },
      { id: 'motion', name: 'Tạo video', what: 'Video motion graphics từ ý tưởng (không cần video quay): giới thiệu sản phẩm, ra mắt, quảng cáo mạng xã hội, chữ động, tin tức… có giọng đọc AI (SaydiVoice), nhạc/SFX; khung 9:16 / 16:9 / 1:1, 6–90 giây; dùng logo/ảnh sản phẩm.', time: ready.mvd.available ? 'motionmaxxing 15–40 phút · motion-video-director 60–90 phút' : '15–40 phút', needs: 'Claude đăng nhập; key SaydiVoice nếu có lời đọc' },
      { id: 'automation', name: 'Automation Video', what: 'Theo dõi nguồn tin (website/RSS hoặc trang Facebook) theo chu kỳ, mỗi tin mới tự thành 1 video Tạo video, có thể tự đăng qua iPhone (Phone Agent) ngay / sau X phút / theo khung giờ.', time: 'chạy liên tục', needs: 'như Tạo video; Phone Agent nếu tự đăng' },
      { id: 'projects', name: 'Video đã tạo', what: 'Xem / xoá video Edit Video và Tạo video đã làm; lấy file video.' },
      { id: 'post', name: 'Đăng video (Phone Agent)', what: 'Đăng video có sẵn lên TikTok/Facebook/… qua iPhone chạy kịch bản Phone Agent: chọn iPhone + kịch bản, điền caption/biến, đăng ngay hoặc hẹn giờ; xem / huỷ / thử lại / đổi giờ.', needs: 'token Phone Agent (pa_live_…)' },
      { id: 'settings', name: 'Cài đặt', what: 'Đăng nhập / đăng xuất tài khoản AI, API key, chọn model + mức suy nghĩ, số video chạy cùng lúc, key SaydiVoice, token Phone Agent, kiểm tra kết nối; Doctor tự cài công cụ.' }
    ],
    motion: {
      videoTypes: VIDEO_TYPES.map(({ id, label }) => ({ id, label })),
      aspects: Object.entries(ASPECT_SIZE).map(([id, v]) => ({ id, label: v.label })),
      duration: { min: 6, max: 90, default: 20 },
      languages: [{ id: 'vi', label: 'Tiếng Việt' }, { id: 'en', label: 'English' }],
      engines: [
        { id: 'motionmaxxing', label: 'motionmaxxing — motion graphics thương hiệu, chữ động, UI (mặc định)', available: true },
        { id: 'mvd', label: `motion-video-director${ready.mvd.version ? ' ' + ready.mvd.version : ''} — ảnh AI nhân vật + đạo cụ, cắt theo nhịp nhạc`, available: ready.mvd.available }
      ],
      voice: { provider: 'SaydiVoice', keySet: ready.saydi, speed: { min: 0.7, max: 1.3, default: 1 } }
    },
    edit: {
      orientations: ['portrait (dọc 9:16, mặc định)', 'landscape (ngang 16:9)'],
      insertUses: { show: 'Chèn vào video', ai_ref: 'Chỉ làm mẫu cho ảnh AI', both: 'Cả hai' },
      insertPlacements: { auto: 'AI tự chọn', overlay: 'Khung nổi (người nói vẫn hiện)', cutout: 'Tách nền như sticker (ảnh)', split: 'Nửa trên màn hình', fullscreen: 'Toàn màn hình' },
      fonts: 'Tải file .ttf/.otf/.woff hoặc chọn font đã có (fonts)'
    },
    phoneAgent: { tokenSet: !!getToken() },
    readiness: ready
  }
}

// ---------------------------------------------------------------------------
// Tao video: chep video xong ra thu muc --out (GetTime: thu muc dinh kem -> the video trong chat)
// ---------------------------------------------------------------------------
export function rememberOut(id: string, out: string): void {
  const m = readJson<Record<string, string>>(MOTION_OUT_FILE, {})
  m[id] = out
  writeJsonAtomic(MOTION_OUT_FILE, m)
}

// ---------------------------------------------------------------------------
// Phone Agent
// ---------------------------------------------------------------------------
function postView(p: PostJob) {
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    message: p.message,
    error: p.error,
    scheduledAt: new Date(p.scheduledAt).toISOString(),
    finishedAt: p.finishedAt ? new Date(p.finishedAt).toISOString() : undefined,
    device: p.deviceName,
    script: p.scriptName,
    video: p.video,
    origin: p.origin
  }
}

function parseVars(v: unknown): Record<string, string> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, String(x ?? '')]))
  const out: Record<string, string> = {}
  for (const s of Array.isArray(v) ? v : []) {
    const t = String(s)
    const i = t.indexOf('=')
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1)
  }
  return out
}

/** "2026-10-21 19:30" / ISO / so ms -> ms; trong = ngay */
function parseWhen(v: unknown): number | undefined {
  const s = str(v)
  if (!s || s === 'now') return undefined
  if (/^\d{12,}$/.test(s)) return Number(s)
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(s)
  const t = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : Date.parse(s)
  if (!Number.isFinite(t)) throw new Error('Giờ đăng không hợp lệ — dùng "YYYY-MM-DD HH:MM" (giờ máy) hoặc để trống để đăng ngay.')
  return t
}

function postConfigFrom(a: Record<string, unknown>, prev?: AutoPostConfig): AutoPostConfig | undefined {
  const touched = ['postEnabled', 'postDevice', 'postScript', 'postVars', 'postTiming', 'postDelay', 'postSlots'].some((k) => a[k] !== undefined)
  if (!touched) return prev
  const slots = a.postSlots === undefined ? prev?.slots : str(a.postSlots).split(/[,\s]+/).filter(Boolean)
  return {
    enabled: bool(a.postEnabled) ?? prev?.enabled ?? true,
    deviceId: str(a.postDevice) || prev?.deviceId || '',
    deviceName: prev?.deviceName,
    scriptId: str(a.postScript) || prev?.scriptId || '',
    scriptName: prev?.scriptName,
    videoVar: prev?.videoVar,
    variables: a.postVars === undefined ? prev?.variables || {} : { ...(prev?.variables || {}), ...parseVars(a.postVars) },
    timing: (str(a.postTiming) || prev?.timing || 'now') as AutoPostConfig['timing'],
    delayMin: num(a.postDelay) ?? prev?.delayMin,
    slots
  }
}

/** Ten iPhone / kich ban + bien video cua kich ban (giong form dang tren app tu dien). */
async function enrichPost(cfg: { deviceId: string; scriptId: string; deviceName?: string; scriptName?: string; videoVar?: string }) {
  const [devs, scripts, fields] = await Promise.all([
    paDevices().catch(() => []),
    paScripts().catch(() => []),
    paScriptFields(cfg.scriptId).catch(() => null)
  ])
  const dev = devs.find((d) => d.id === cfg.deviceId || d.name === cfg.deviceId)
  const sc = scripts.find((s) => s.id === cfg.scriptId || s.name === cfg.scriptId)
  if (!dev) throw new Error(`Không thấy iPhone "${cfg.deviceId}" trong tài khoản Phone Agent — gọi post-devices để xem danh sách.`)
  if (!sc) throw new Error(`Không thấy kịch bản "${cfg.scriptId}" — gọi post-scripts để xem danh sách.`)
  const f = sc.id === cfg.scriptId ? fields : await paScriptFields(sc.id).catch(() => null)
  return { deviceId: dev.id, deviceName: dev.name, scriptId: sc.id, scriptName: sc.name, videoVar: cfg.videoVar || f?.videoVar, fields: f }
}

// ---------------------------------------------------------------------------
// Lenh
// ---------------------------------------------------------------------------
export function serviceHandlers(opts: { mode: 'service' | 'gui'; quit: () => void }): Record<string, SvcHandler> {
  return {
    ping: () => ({
      ok: true,
      version: app.getVersion(),
      pid: process.pid,
      mode: opts.mode,
      windows: BrowserWindow.getAllWindows().length,
      busy: { motion: busyMotionIds().length, posts: listPosts({}).filter((p) => !['success', 'error', 'cancelled'].includes(p.status)).length }
    }),
    /** Thoat dich vu chay nen (cap nhat app / doi phien ban) — app co cua so hoac dang ban thi khong thoat */
    quit: (a) => {
      if (BrowserWindow.getAllWindows().length) return fail('App Agent Edit đang mở cửa sổ — đóng app rồi thử lại.')
      if (busyMotionIds().length && !bool(a.force)) return fail(`Đang tạo ${busyMotionIds().length} video — đợi xong (hoặc huỷ) rồi thử lại.`)
      setTimeout(opts.quit, 300)
      return { ok: true }
    },
    capabilities: () => capabilities(),

    // ---- Tao video ----
    'motion.create': async (a) => {
      let brief: MotionBrief
      try {
        brief = briefFrom(a)
      } catch (e) {
        return fail(errOf(e))
      }
      for (const f of brief.assets || []) {
        if (!existsSync(f) || !statSync(f).isFile()) return fail('Không thấy file ảnh: ' + f)
      }
      if (brief.voice.enabled && !saydiMasked().has_key) return fail('Chưa có key SaydiVoice cho lời đọc.', 'Nhập key SaydiVoice (trường saydi-key) rồi gọi lại, hoặc tạo video không lời (no_voice).')
      try {
        const job = await createMotionJob(brief, { kind: 'single' })
        if (str(a.out)) rememberOut(job.id, str(a.out))
        return { ok: true, id: job.id, status: job.status, job: motionView(job) }
      } catch (e) {
        return fail(errOf(e))
      }
    },
    'motion.list': (a) => {
      const kind = a.kind === 'auto' || a.kind === 'single' ? (a.kind as 'auto' | 'single') : undefined
      const list = listMotionJobs({ ...(kind ? { kind } : {}), ...(str(a.automationId) ? { automationId: str(a.automationId) } : {}) })
      const n = Math.min(50, Math.max(1, num(a.limit) ?? 10))
      return { ok: true, total: list.length, jobs: list.slice(0, n).map((j) => motionView(j, false)) }
    },
    'motion.get': (a) => {
      const j = getMotionJob(str(a.id))
      return j ? { ok: true, job: motionView(j, true) } : fail('Không thấy video ' + str(a.id))
    },
    'motion.brief': (a) => {
      const j = getMotionJob(str(a.id))
      return j ? { ok: true, brief: j.brief } : fail('Không thấy video ' + str(a.id))
    },
    'motion.cancel': (a) => ({ ok: cancelMotionJob(str(a.id)), ...(getMotionJob(str(a.id)) ? {} : { error: 'Không thấy video' }) }),
    'motion.rerun': async (a) => {
      try {
        const j = rerunMotionJob(str(a.id))
        if (str(a.out)) rememberOut(j.id, str(a.out))
        return { ok: true, id: j.id, status: j.status }
      } catch (e) {
        return fail(errOf(e))
      }
    },
    /** "Tao ban khac": brief cu + thay doi -> video MOI */
    'motion.again': async (a) => {
      const old = getMotionJob(str(a.id))
      if (!old) return fail('Không thấy video ' + str(a.id))
      let brief: MotionBrief
      try {
        brief = briefFrom(a, { ...old.brief, assets: [] })
      } catch (e) {
        return fail(errOf(e))
      }
      // tu lieu cu da chep vao inputs/ cua video cu -> dung lai (tru khi gui tu lieu moi)
      if (!(Array.isArray(a.assets) && a.assets.length)) {
        const dir = join(old.dir, 'inputs')
        brief.assets = (old.brief.assets || []).map((p) => (existsSync(p) ? p : join(dir, basename(p)))).filter((p) => existsSync(p))
      }
      if (brief.voice.enabled && !saydiMasked().has_key) return fail('Chưa có key SaydiVoice cho lời đọc.')
      try {
        const job = await createMotionJob(brief, { kind: old.kind === 'auto' ? 'single' : old.kind })
        if (str(a.out)) rememberOut(job.id, str(a.out))
        return { ok: true, id: job.id, status: job.status, job: motionView(job) }
      } catch (e) {
        return fail(errOf(e))
      }
    },
    'motion.delete': (a) => deleteMotionJob(str(a.id)),
    'motion.status': (a) => {
      const j = getMotionJob(str(a.id))
      return j ? { ok: true, ...readJson<Record<string, unknown>>(motionStatusFile(j.id), {}), ...motionView(j) } : fail('Không thấy video ' + str(a.id))
    },
    'motion.check': () => ({ ok: true, ...motionReadiness(), stages: STAGES.map((s) => s.label) }),

    // ---- SaydiVoice ----
    'saydi.status': () => ({ ok: true, ...saydiMasked() }),
    'saydi.setKey': async (a) => {
      const key = str(a.key)
      if (key) {
        const t = await testSaydiKey(key)
        if (!t.ok) return fail('Key SaydiVoice không dùng được: ' + (t.error || ''))
      }
      setSaydiKey(key)
      return { ok: true, ...saydiMasked() }
    },
    'saydi.test': async () => testSaydiKey(),
    'saydi.voices': async (a) => {
      try {
        const r = await listSaydiVoices(bool(a.refresh) === true)
        const q = str(a.q).toLowerCase()
        const lang = str(a.language).toLowerCase()
        const gender = str(a.gender).toLowerCase()
        let v = r.voices
        if (bool(a.custom) === true) v = v.filter((x) => x.custom)
        if (lang) v = v.filter((x) => (x.language || '').toLowerCase().startsWith(lang))
        if (gender) v = v.filter((x) => (x.gender || '').toLowerCase().startsWith(gender))
        if (q) v = v.filter((x) => `${x.name} ${x.description || ''} ${x.age || ''} ${x.id}`.toLowerCase().includes(q))
        v = [...v].sort((x, y) => Number(!!y.custom) - Number(!!x.custom) || Number(!!y.featured) - Number(!!x.featured))
        const n = Math.min(40, Math.max(1, num(a.limit) ?? 15))
        return {
          ok: true,
          total: v.length,
          voices: v.slice(0, n).map((x) => ({ id: x.id, name: x.name, language: x.language, gender: x.gender, age: x.age, description: x.description?.slice(0, 160), custom: x.custom || undefined, featured: x.featured || undefined })),
          ...(r.customError ? { customError: r.customError } : {})
        }
      } catch (e) {
        return fail(errOf(e), saydiMasked().has_key ? undefined : 'Chưa có key SaydiVoice.')
      }
    },

    // ---- Automation Video ----
    'auto.list': () => ({ ok: true, projects: publicProjects().map(autoView) }),
    'auto.get': (a) => {
      const p = publicProjects().find((x) => x.id === str(a.id))
      return p ? { ok: true, project: p } : fail('Không thấy dự án Automation ' + str(a.id))
    },
    /** tao (khong id) / sua (co id: chi doi muc duoc gui) */
    'auto.save': async (a) => {
      const id = str(a.id)
      const old = id ? getAutoProject(id) : undefined
      if (id && !old) return fail('Không thấy dự án Automation ' + id)
      try {
        const { message: _m, source: _s, ...baseDefaults } = briefFrom(a, { videoType: 'news', duration: 30, ...(old?.defaults || {}), message: str(old?.defaults.message) || ' ' } as Partial<MotionBrief>)
        void _m
        void _s
        const defaults = { ...baseDefaults, message: str(a.message) || old?.defaults.message || undefined }
        // nguon: "web|<link>" / "facebook|<link>" (token Facebook dung chung tu bien AGENT_EDIT_FB_TOKEN cua CLI)
        let sources: { id?: string; type: string; url: string; token?: string }[] | undefined
        if (Array.isArray(a.sources) && a.sources.length) {
          sources = (a.sources as unknown[]).map((s) => {
            const t = String(s)
            const m = /^(web|facebook|fb)\s*[|:]\s*(.+)$/i.exec(t)
            const type = m && m[1].toLowerCase() !== 'web' ? 'facebook' : 'web'
            const url = (m ? m[2] : t).trim()
            const prev = old?.sources.find((x) => x.url === url && x.type === type)
            return { ...(prev ? { id: prev.id } : {}), type, url, ...(type === 'facebook' && str(a.fbToken) ? { token: str(a.fbToken) } : {}) }
          })
        }
        const post = postConfigFrom(a, old?.post)
        if (post?.enabled && post.deviceId && post.scriptId) {
          const e = await enrichPost(post)
          Object.assign(post, { deviceId: e.deviceId, deviceName: e.deviceName, scriptId: e.scriptId, scriptName: e.scriptName, videoVar: post.videoVar || e.videoVar })
        }
        const project = saveAutoProject({
          ...(old ? { id: old.id } : {}),
          name: str(a.projectName) || old?.name || str(a.name),
          enabled: bool(a.enabled) ?? old?.enabled ?? true,
          defaults,
          sources: sources || (old?.sources.map(({ tokenEnc: _t, ...s }) => s) as never) || [],
          intervalMin: num(a.interval) ?? old?.intervalMin,
          maxPerCheck: num(a.maxPerCheck) ?? old?.maxPerCheck,
          maxPerDay: num(a.maxPerDay) ?? old?.maxPerDay,
          skipExisting: bool(a.skipExisting) ?? old?.skipExisting ?? true,
          post
        } as never)
        return { ok: true, project }
      } catch (e) {
        return fail(errOf(e))
      }
    },
    'auto.delete': (a) => {
      if (!getAutoProject(str(a.id))) return fail('Không thấy dự án Automation ' + str(a.id))
      deleteAutoProject(str(a.id))
      return { ok: true }
    },
    'auto.toggle': (a) => {
      if (!getAutoProject(str(a.id))) return fail('Không thấy dự án Automation ' + str(a.id))
      toggleAutoProject(str(a.id), bool(a.enabled) !== false)
      return { ok: true, enabled: bool(a.enabled) !== false }
    },
    'auto.check': async (a) => {
      if (!getAutoProject(str(a.id))) return fail('Không thấy dự án Automation ' + str(a.id))
      return checkAutoProject(str(a.id), true) as unknown as SvcResponse
    },
    'auto.testSource': async (a) => {
      const m = /^(web|facebook|fb)\s*[|:]\s*(.+)$/i.exec(str(a.source))
      const type = m && m[1].toLowerCase() !== 'web' ? 'facebook' : 'web'
      const r = await testAutoSource({ type, url: (m ? m[2] : str(a.source)).trim(), token: str(a.fbToken) } as never)
      return r.ok
        ? { ok: true, via: r.via, items: (r.items || []).map((x) => ({ title: x.title, url: x.url, published: x.published, summary: x.summary?.slice(0, 200) })) }
        : fail(r.error || 'Không lấy được tin.')
    },

    // ---- Phone Agent ----
    'post.config': () => ({ ok: true, ...phoneAgentMasked() }),
    'post.setToken': async (a) => {
      const token = str(a.token)
      if (token && !token.startsWith('pa_live_')) return fail('API token Phone Agent phải bắt đầu bằng pa_live_ (Phone Agent > Cài đặt > Profile > API Token).')
      if (token) {
        try {
          await paMe(token, str(a.base) || undefined)
        } catch (e) {
          return fail('Token Phone Agent không dùng được: ' + errOf(e))
        }
      }
      setPhoneAgentConfig({ token, ...(str(a.base) ? { base: str(a.base) } : {}) })
      return { ok: true, ...phoneAgentMasked() }
    },
    'post.test': async () => {
      if (!getToken()) return fail('Chưa nhập API token Phone Agent.')
      try {
        const me = await paMe()
        return { ok: true, name: me.name, email: me.email, stats: me.stats }
      } catch (e) {
        return fail(errOf(e))
      }
    },
    'post.devices': async () => {
      try {
        return { ok: true, devices: (await paDevices()).map(({ id, name, status, model, battery, account, currentScript }) => ({ id, name, status, model, battery, account, currentScript })) }
      } catch (e) {
        return fail(errOf(e), getToken() ? undefined : 'Chưa nhập token Phone Agent.')
      }
    },
    'post.scripts': async () => {
      try {
        return { ok: true, scripts: (await paScripts()).map(({ id, name, description, channel, shared }) => ({ id, name, description, channel, shared })) }
      } catch (e) {
        return fail(errOf(e), getToken() ? undefined : 'Chưa nhập token Phone Agent.')
      }
    },
    'post.fields': async (a) => {
      try {
        const f = await paScriptFields(str(a.script))
        return {
          ok: true,
          script: f.name,
          videoVar: f.videoVar,
          hasSendFile: f.hasSendFile,
          warnings: f.warnings,
          fields: f.fields.filter((x) => x.role !== 'video').map(({ name, label, type, required, default: d, description, options, role }) => ({ name, label, type, required, default: d, description, options, role }))
        }
      } catch (e) {
        return fail(errOf(e))
      }
    },
    'post.create': async (a) => {
      if (!getToken()) return fail('Chưa nhập API token Phone Agent.', 'Nhập token Phone Agent (trường phoneagent-token) rồi gọi lại.')
      // video: file / video Tao video (mv-...) / video Edit Video (r_...)
      let video = str(a.video)
      let title = str(a.title)
      let origin: { kind: 'edit' | 'motion' | 'auto'; refId: string; automationId?: string } = { kind: 'edit', refId: 'cli' }
      let ctx: Record<string, string> = {}
      const ref = str(a.ref)
      if (ref) {
        const mj = getMotionJob(ref)
        const pj = mj ? null : getProject(ref)
        if (mj) {
          if (!mj.output) return fail('Video này chưa có file MP4 hoàn chỉnh.')
          video = mj.output
          title ||= mj.title
          origin = { kind: mj.kind === 'auto' ? 'auto' : 'motion', refId: mj.id, ...(mj.automationId ? { automationId: mj.automationId } : {}) }
          ctx = templateContext(mj)
        } else if (pj) {
          const out = (pj.rmRender as { output?: string } | undefined)?.output
          if (!out) return fail('Dự án này chưa render ra video.')
          video = out
          title ||= String(pj.topic || 'Video')
          origin = { kind: 'edit', refId: pj.id }
        } else return fail('Không thấy video / dự án ' + ref)
      }
      if (!video || !existsSync(video) || !['.mp4', '.mov', '.m4v'].includes(extname(video).toLowerCase())) return fail('File video không hợp lệ hoặc không còn trên máy: ' + video)
      try {
        const e = await enrichPost({ deviceId: str(a.device), scriptId: str(a.script) })
        const vars = parseVars(a.vars)
        // bien con trong -> dien mau {title} {summary}... cua video (giong tu dong dang)
        for (const [k, v] of Object.entries(vars)) if (Object.keys(ctx).length && v.includes('{')) vars[k] = v.replace(/\{(\w+)\}/g, (m, n) => ctx[n] ?? m)
        const missing = (e.fields?.fields || []).filter((f) => f.role !== 'video' && f.required && !vars[f.name] && (f.default === undefined || f.default === ''))
        if (missing.length) return fail('Kịch bản cần điền: ' + missing.map((f) => `${f.name} (${f.label || f.type})`).join(', '), 'Gọi post-fields để xem các biến, rồi gửi vars dạng ten=giá trị.')
        const p = createPost({
          video,
          title: title || basename(video),
          origin,
          deviceId: e.deviceId,
          deviceName: e.deviceName,
          scriptId: e.scriptId,
          scriptName: e.scriptName,
          videoVar: e.videoVar,
          variables: vars,
          scheduledAt: parseWhen(a.at)
        })
        return { ok: true, id: p.id, status: p.status, post: postView(p) }
      } catch (e) {
        return fail(errOf(e))
      }
    },
    'post.list': (a) => {
      const list = listPosts({ ...(str(a.ref) ? { refId: str(a.ref) } : {}), ...(str(a.automationId) ? { automationId: str(a.automationId) } : {}) })
      const n = Math.min(50, Math.max(1, num(a.limit) ?? 10))
      return { ok: true, total: list.length, posts: list.slice(0, n).map(postView) }
    },
    'post.get': (a) => {
      const p = listPosts({}).find((x) => x.id === str(a.id))
      return p ? { ok: true, post: { ...postView(p), steps: p.steps?.map((s) => ({ type: s.type, status: s.status, error: s.error })) } } : fail('Không thấy bài đăng ' + str(a.id))
    },
    /** dang job (status running/done/error/cancelled) — GetTime theo doi bai dang */
    'post.status': (a) => {
      const p = listPosts({}).find((x) => x.id === str(a.id))
      return p ? { ok: true, ...postStatusView(p) } : fail('Không thấy bài đăng ' + str(a.id))
    },
    'post.cancel': (a) => cancelPost(str(a.id)),
    'post.retry': (a) => {
      try {
        return retryPost(str(a.id), parseWhen(a.at))
      } catch (e) {
        return fail(errOf(e))
      }
    },
    'post.reschedule': (a) => {
      try {
        const at = parseWhen(a.at)
        return reschedulePost(str(a.id), at ?? Date.now())
      } catch (e) {
        return fail(errOf(e))
      }
    },
    'post.delete': (a) => deletePost(str(a.id)),

    // ---- Video da tao (Edit Video) ----
    'projects.list': (a) => {
      const n = Math.min(50, Math.max(1, num(a.limit) ?? 10))
      const all = listProjects().filter((p) => p.mode === 'remotion')
      return {
        ok: true,
        total: all.length,
        projects: all.slice(0, n).map((p) => {
          const r = p.rmRender as { output?: string; size?: number } | undefined
          return {
            id: p.id,
            topic: p.topic,
            status: p.status,
            updatedAt: new Date(p.updatedAt).toISOString(),
            orientation: p.orientation || 'portrait',
            video: r?.output && existsSync(r.output) ? r.output : undefined,
            error: (p.error as { message?: string } | null)?.message,
            createdBy: p.createdBy === 'cli' ? 'chat/CLI' : 'app'
          }
        })
      }
    },
    'projects.get': (a) => {
      const p = getProject(str(a.id))
      if (!p) return fail('Không thấy dự án ' + str(a.id))
      const r = p.rmRender as { output?: string; size?: number; seconds?: number } | undefined
      return {
        ok: true,
        project: {
          id: p.id,
          topic: p.topic,
          status: p.status,
          orientation: p.orientation || 'portrait',
          videos: (p.videos || []).map((v) => ({ name: v.name, path: v.path, duration: v.duration })),
          referenceVideo: p.referenceVideo ? { name: p.referenceVideo.name, path: p.referenceVideo.path } : null,
          editRequest: p.editRequest,
          brandGuide: p.brandGuide,
          userMedia: ((p.userMedia as Record<string, unknown>[]) || []).map((m) => ({ name: m.name, path: m.path, use: m.use, placement: m.placement, note: m.note })),
          summary: p.rmSummary,
          video: r?.output,
          error: (p.error as { message?: string } | null)?.message
        }
      }
    },
    'projects.delete': async (a) => {
      const id = str(a.id)
      if (!getProject(id)) return fail('Không thấy dự án ' + id)
      const withFiles = bool(a.withFiles) === true
      if (withFiles) {
        const r = renderStatus() as { running: boolean; output?: string }
        const wd = getProject(id)?.workDir
        if (r.running && r.output && wd && r.output.startsWith(wd)) return fail('Dự án đang render — đợi render xong rồi xoá.')
      }
      return (await deleteProject(id, { withFiles })) as unknown as SvcResponse
    },

    // ---- Cai dat ----
    'settings.get': () => {
      const m = maskedProviders() as Record<string, any>
      const view = Object.fromEntries(
        ['gemini', 'claude', 'gpt'].map((k) => [k === 'gpt' ? 'codex' : k, { mode: m[k]?.auth_mode, apiKey: m[k]?.has_key ? m[k].key_hint : '', model: m[k]?.model, subModel: m[k]?.sub_model, effort: m[k]?.sub_effort, baseUrl: m[k]?.base_url }])
      )
      const lim = jobLimitsOf(readState())
      return { ok: true, providers: view, limits: { analyze: lim.gemini, plan: lim.claude, motion: motionLimit() }, saydi: saydiMasked(), phoneAgent: phoneAgentMasked() }
    },
    'settings.models': async (a) => {
      const id = accountId(a.account)
      if (!id) return fail('Tài khoản: gemini | claude | codex')
      const st = await cliStatusOf(id)
      if (!st) return fail('Chưa kiểm được ' + id + ' (bộ xử lý chưa sẵn sàng).')
      const reasoning = (st.reasoning || {}) as Record<string, { default?: string; levels?: string[] }>
      return {
        ok: true,
        account: a.account,
        installed: !!st.installed,
        loggedIn: !!st.logged_in,
        version: st.version,
        defaultModel: st.default_model,
        models: ((st.models || []) as { id: string; label?: string; note?: string; min_cli?: string }[]).map((m) => ({
          id: m.id,
          label: m.label,
          note: m.note,
          ...(m.min_cli ? { needsCliVersion: m.min_cli } : {}),
          ...(reasoning[m.id]?.levels?.length ? { efforts: reasoning[m.id].levels } : {})
        }))
      }
    },
    'settings.set': async (a) => {
      const id = accountId(a.account)
      if (!id) return fail('Tài khoản: gemini | claude | codex')
      const patch: Partial<ProviderConfig> = {}
      if (a.mode !== undefined) {
        if (a.mode !== 'subscription' && a.mode !== 'api_key') return fail('Chế độ: subscription (đăng nhập tài khoản) | api_key')
        patch.auth_mode = a.mode as ProviderConfig['auth_mode']
      }
      if (a.apiKey !== undefined) {
        patch.api_key = str(a.apiKey)
        if (a.mode === undefined) patch.auth_mode = patch.api_key ? 'api_key' : 'subscription'
      }
      if (a.model !== undefined) {
        // model theo che do dang dung (giong o chon model tren app)
        const mode = patch.auth_mode || (maskedProviders() as Record<string, any>)[id]?.auth_mode
        if (mode === 'api_key') patch.model = str(a.model)
        else patch.sub_model = str(a.model)
      }
      if (a.effort !== undefined) patch.sub_effort = str(a.effort)
      if (a.baseUrl !== undefined) patch.base_url = str(a.baseUrl)
      if (!Object.keys(patch).length) return fail('Không có gì để đổi.')
      saveProviders({ [id]: patch } as never)
      if (sidecarInfo().ready) await pushConfig().catch(() => undefined)
      return { ok: true, changed: Object.keys(patch).filter((k) => k !== 'api_key').concat(a.apiKey !== undefined ? ['api_key'] : []) }
    },
    'settings.limits': (a) => {
      const lim = saveJobLimits({ ...(num(a.analyze) !== undefined ? { gemini: num(a.analyze) } : {}), ...(num(a.plan) !== undefined ? { claude: num(a.plan) } : {}) })
      const motion = num(a.motion) !== undefined ? setMotionLimit(num(a.motion)!) : motionLimit()
      return { ok: true, limits: { analyze: lim.gemini, plan: lim.claude, motion } }
    },
    'settings.test': async (a) => {
      const id = accountId(a.account)
      if (!id) return fail('Tài khoản: gemini | claude | codex')
      const s = await ensureSidecar()
      if (!s.ok) return fail('Bộ xử lý chưa sẵn sàng: ' + s.error)
      return (await sidecarRequest('/test_connection', { name: id }, 180000)) as SvcResponse
    },
    'settings.logout': async (a) => {
      const id = accountId(a.account)
      if (!id) return fail('Tài khoản: gemini | claude | codex')
      const label = CLI_PACKAGES[id].label
      const st = await cliStatusOf(id)
      if (!st?.installed || !st?.path) return fail(`Chưa cài ${label} trên máy.`)
      if (!st.logged_in) return { ok: true, already: true }
      const res = await startCliLogout(id, st.path, st.workdir, () => undefined)
      const now = await cliStatusOf(id, true)
      if (now && !now.logged_in) return { ok: true }
      const err = res.ok ? `${label} vẫn báo đang đăng nhập.` : res.error || 'Đăng xuất không thành công.'
      return fail(id === 'gemini' ? agyFailureText(err, now?.version || st.version, 'logout') : err)
    },

    // ---- Font (Brand Guideline) ----
    'fonts.list': async () => {
      const s = await ensureSidecar()
      if (!s.ok) return fail('Bộ xử lý chưa sẵn sàng: ' + s.error)
      const r = await sidecarRequest('/fonts/list', {}, 60000)
      return { ok: true, fonts: ((r?.fonts || []) as Record<string, any>[]).map((f) => ({ id: f.id, name: f.label || f.family, scope: f.scope === 'shared' ? 'kho chung' : 'máy này', weights: f.weights, viMissing: f.vi_missing || undefined })) }
    },

    // ---- Ban quyen (kiem lai — app chay nen lau ngay) ----
    'license.check': async () => {
      const s = await checkLicense('open')
      return { ok: s.status === 'ok', status: s.status, message: s.message }
    }
  }
}

function autoView(p: ReturnType<typeof publicProjects>[number]) {
  return {
    id: p.id,
    name: p.name,
    enabled: p.enabled,
    channel: p.defaults.name,
    sources: p.sources.map((s) => `${s.type}|${s.url}`),
    intervalMin: p.intervalMin,
    maxPerCheck: p.maxPerCheck,
    maxPerDay: p.maxPerDay,
    lastCheckAt: p.lastCheckAt ? new Date(p.lastCheckAt).toISOString() : undefined,
    nextCheckAt: p.nextCheckAt ? new Date(p.nextCheckAt).toISOString() : undefined,
    lastResult: p.lastResult,
    lastError: p.lastError,
    videoCount: p.videoCount,
    running: p.running,
    post: p.post?.enabled ? { device: p.post.deviceName, script: p.post.scriptName, timing: p.post.timing, delayMin: p.post.delayMin, slots: p.post.slots } : undefined
  }
}

