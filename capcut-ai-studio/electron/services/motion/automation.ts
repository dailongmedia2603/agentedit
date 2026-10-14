// AUTOMATION VIDEO (2026-10-14): du an = thong tin chung (khung, thoi luong, giong doc, loai video...) + 1..n nguon tin
// (website / RSS / trang Facebook). App dang mo thi moi `intervalMin` phut kiem tin moi; tin moi -> tu tao video bang
// skill (runner.ts, KHONG can duyet). Lan dau kiem 1 nguon (skipExisting) chi ghi nhan tin dang co — chi tin dang SAU do
// moi thanh video (khong tao hang loat video tu tin cu). Tran: maxPerCheck / lan kiem, maxPerDay / ngay; tin vuot tran
// giu lai cho lan sau. Luu ~/.capcut-studio/motion/automation.json; token Facebook ma hoa safeStorage.
import { safeStorage } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { MOTION_HOME } from './paths'
import { writeJson } from './store'
import { createMotionJob, listMotionJobs } from './runner'
import { downloadImage, enrichItem, fetchFacebookItems, fetchWebItems } from './sources'
import { clampDuration, validateBrief } from './prompt'
import { licenseDisabled, licenseState } from '../license'
import type { AutoProject, AutoSource, MotionSourceItem } from './types'

const FILE = join(MOTION_HOME, 'automation.json')
const SEEN_MAX = 500
const TICK_MS = 60 * 1000

let projects: AutoProject[] | null = null
const checking = new Set<string>()
let timer: ReturnType<typeof setInterval> | null = null
type Listener = (list: PublicProject[]) => void
const listeners = new Set<Listener>()

export function onAutomationChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function load(): AutoProject[] {
  if (projects) return projects
  projects = []
  if (existsSync(FILE)) {
    try {
      const d = JSON.parse(readFileSync(FILE, 'utf-8'))
      if (Array.isArray(d?.projects)) projects = d.projects
    } catch {
      /* hong -> rong */
    }
  }
  return projects!
}

function save(): void {
  writeJson(FILE, { projects: load() })
  const pub = publicProjects()
  for (const fn of listeners) {
    try {
      fn(pub)
    } catch {
      /* bo qua */
    }
  }
}

const enc = (s: string) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s).toString('base64') : 'plain:' + Buffer.from(s).toString('base64'))
function dec(s?: string): string {
  if (!s) return ''
  try {
    if (s.startsWith('plain:')) return Buffer.from(s.slice(6), 'base64').toString()
    return safeStorage.decryptString(Buffer.from(s, 'base64'))
  } catch {
    return ''
  }
}

/** Ban cho renderer: khong co token, chi co has_token. */
export interface PublicSource extends Omit<AutoSource, 'tokenEnc'> {
  has_token: boolean
}
export type PublicProject = Omit<AutoProject, 'sources' | 'seen'> & {
  sources: PublicSource[]
  seenCount: number
  videoCount: number
  running: number
}

export function publicProjects(): PublicProject[] {
  const jobs = listMotionJobs({ kind: 'auto' })
  return load().map((p) => {
    const mine = jobs.filter((j) => j.automationId === p.id)
    const { seen, sources, ...rest } = p
    return {
      ...rest,
      sources: sources.map(({ tokenEnc, ...s }) => ({ ...s, has_token: !!tokenEnc })),
      seenCount: Object.values(seen || {}).reduce((n, a) => n + a.length, 0),
      videoCount: mine.length,
      running: mine.filter((j) => j.status === 'running' || j.status === 'queued').length
    }
  })
}

/** Ngay theo gio MAY (tran / ngay tinh lai luc 0h dia phuong) */
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const licenseOk = () => licenseDisabled() || licenseState().status === 'ok'
const clampInt = (v: unknown, lo: number, hi: number, def: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def
}

/** Tao / sua du an. Nguon gui len co `token` (moi nhap) -> ma hoa; khong co -> giu token cu cung id. */
export function saveAutoProject(input: Partial<AutoProject> & { sources?: (Partial<AutoSource> & { token?: string })[] }): PublicProject {
  const list = load()
  const old = input.id ? list.find((p) => p.id === input.id) : undefined
  const name = String(input.name || '').trim()
  if (!name) throw new Error('Nhập tên dự án.')
  const srcs: AutoSource[] = []
  for (const s of input.sources || []) {
    const url = String(s.url || '').trim()
    if (!url) continue
    const type = s.type === 'facebook' ? 'facebook' : 'web'
    if (type === 'web' && !/^https?:\/\/\S+\.\S+/i.test(url)) throw new Error('Link nguồn phải bắt đầu bằng http:// hoặc https:// — ' + url)
    const prev = s.id ? old?.sources.find((x) => x.id === s.id) : undefined
    // doi link / loai nguon = nguon MOI (id moi -> bo tin da xem + lam lai buoc "chi ghi nhan lan dau")
    const same = !!prev && prev.url === url && prev.type === type
    const id = same ? prev!.id : !prev && s.id ? s.id : 'src_' + randomBytes(4).toString('hex')
    const token = String(s.token || '').trim()
    srcs.push({ id, type, url, label: String(s.label || '').trim() || undefined, tokenEnc: token ? enc(token) : type === 'facebook' ? prev?.tokenEnc : undefined })
  }
  if (!srcs.length) throw new Error('Thêm ít nhất một nguồn tin (website hoặc trang Facebook).')
  const d = input.defaults || old?.defaults
  if (!d) throw new Error('Thiếu thông tin chung của dự án.')
  if (!String(d.name || '').trim()) throw new Error('Nhập tên kênh / thương hiệu trong thông tin chung.')
  if (d.voice?.enabled && !d.voice.voiceId) throw new Error('Chọn giọng đọc (hoặc tắt lời đọc).')
  const p: AutoProject = {
    id: old?.id || 'auto_' + Date.now().toString(36) + randomBytes(2).toString('hex'),
    name,
    enabled: input.enabled ?? old?.enabled ?? true,
    createdAt: old?.createdAt || Date.now(),
    defaults: { ...d, duration: clampDuration(d.duration), videoType: d.videoType || 'news' },
    sources: srcs,
    intervalMin: clampInt(input.intervalMin ?? old?.intervalMin, 5, 24 * 60, 30),
    maxPerCheck: clampInt(input.maxPerCheck ?? old?.maxPerCheck, 1, 10, 2),
    maxPerDay: clampInt(input.maxPerDay ?? old?.maxPerDay, 1, 100, 10),
    skipExisting: input.skipExisting ?? old?.skipExisting ?? true,
    lastCheckAt: old?.lastCheckAt,
    nextCheckAt: old?.nextCheckAt,
    lastResult: old?.lastResult,
    lastError: old?.lastError,
    // nguon bi bo -> bo luon tin da xem cua nguon do
    seen: Object.fromEntries(Object.entries(old?.seen || {}).filter(([k]) => srcs.some((s) => s.id === k))),
    primed: Object.fromEntries(Object.entries(old?.primed || {}).filter(([k]) => srcs.some((s) => s.id === k))),
    daily: old?.daily
  }
  // du an moi: kiem sau 5s; doi chu ky: tinh lai tu bay gio; sua cac muc khac: giu lich cu
  if (!old || !p.nextCheckAt) p.nextCheckAt = Date.now() + 5000
  else if (p.intervalMin !== old.intervalMin) p.nextCheckAt = Date.now() + p.intervalMin * 60000
  if (old) list[list.indexOf(old)] = p
  else list.unshift(p)
  save()
  return publicProjects().find((x) => x.id === p.id)!
}

export function deleteAutoProject(id: string): void {
  const list = load()
  projects = list.filter((p) => p.id !== id)
  save()
}

export function toggleAutoProject(id: string, enabled: boolean): void {
  const p = load().find((x) => x.id === id)
  if (!p) return
  p.enabled = enabled
  if (enabled) p.nextCheckAt = Date.now() + 3000
  save()
}

async function fetchSource(s: AutoSource): Promise<{ items: MotionSourceItem[]; via: string }> {
  return s.type === 'facebook' ? fetchFacebookItems(s.url, dec(s.tokenEnc)) : fetchWebItems(s.url)
}

/** Thu lay tin cua 1 nguon (nut "Thử lấy tin" trong form — chua luu). */
export async function testAutoSource(s: Partial<AutoSource> & { token?: string; projectId?: string }): Promise<{ ok: boolean; via?: string; items?: MotionSourceItem[]; error?: string }> {
  try {
    let token = String(s.token || '').trim()
    if (!token && s.type === 'facebook' && s.projectId && s.id) {
      token = dec(load().find((p) => p.id === s.projectId)?.sources.find((x) => x.id === s.id)?.tokenEnc)
    }
    const r = s.type === 'facebook' ? await fetchFacebookItems(String(s.url || ''), token) : await fetchWebItems(String(s.url || ''))
    return { ok: true, via: r.via, items: r.items.slice(0, 8) }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) }
  }
}

/** Kiem tin moi cua 1 du an + tao video cho tin moi (trong tran).
 *  Lam tren BAN SAO du an luc bat dau; cuoi cung gop ket qua (tin da xem, dem / ngay) vao du an HIEN TAI (nguoi dung co
 *  the luu du an trong luc dang kiem — khong duoc mat tin da xem -> video trung). */
export async function checkAutoProject(id: string, manual = false): Promise<{ ok: boolean; created: number; message: string }> {
  const p = load().find((x) => x.id === id)
  if (!p) return { ok: false, created: 0, message: 'Không thấy dự án' }
  if (!licenseOk()) return { ok: false, created: 0, message: 'Bản quyền không hợp lệ — kiểm tra key rồi thử lại.' }
  if (checking.has(id)) return { ok: true, created: 0, message: 'Đang kiểm tin…' }
  checking.add(id)
  let created = 0
  const errors: string[] = []
  let primedNow = 0
  let stopped = false
  const day = today()
  // ket qua theo nguon (id + url + loai luc kiem)
  const done: { src: AutoSource; seen: Set<string> }[] = []
  try {
    const usedToday = (p.daily || {})[day] || 0
    let budget = Math.min(p.maxPerCheck, Math.max(0, p.maxPerDay - usedToday))
    for (const s of p.sources) {
      if (stopped) break
      let items: MotionSourceItem[]
      try {
        items = (await fetchSource(s)).items
      } catch (e) {
        errors.push(`${s.label || s.url}: ${String((e as Error)?.message || e)}`)
        continue
      }
      const seen = new Set(p.seen[s.id] || [])
      done.push({ src: s, seen })
      if (!p.primed[s.id] && p.skipExisting) {
        // lan dau: chi ghi nhan
        for (const it of items) seen.add(it.id)
        primedNow += items.length
        continue
      }
      // tin moi nhat truoc (feed / trang: moi nhat o tren)
      for (const it of items.filter((x) => !seen.has(x.id))) {
        if (budget <= 0) break
        const full = await enrichItem(it)
        const brief = { ...p.defaults, message: p.defaults.message || '', source: { ...full, sourceName: s.label || full.sourceName } }
        const bad = validateBrief(brief)
        if (bad) {
          // brief hong vi chinh tin (khong lap lai moi lan)
          errors.push(`${it.title}: ${bad}`)
          seen.add(it.id)
          continue
        }
        try {
          await createMotionJob(brief, {
            kind: 'auto',
            automationId: p.id,
            prepare: async (dir) => {
              if (full.image) await downloadImage(full.image, join(dir, 'inputs', 'anh-bai-viet'))
            }
          })
          created++
          budget--
          seen.add(it.id)
        } catch (e) {
          // ban quyen / o dia / loi tam thoi: DUNG, giu tin chua xem cho lan sau
          errors.push(`${it.title}: ${String((e as Error)?.message || e)}`)
          stopped = true
          break
        }
      }
    }
  } finally {
    checking.delete(id)
    void manual
  }
  // gop vao du an hien tai
  const cur = load().find((x) => x.id === id)
  if (!cur) return { ok: false, created, message: 'Dự án đã bị xoá.' }
  for (const { src, seen } of done) {
    const now = cur.sources.find((x) => x.id === src.id)
    if (!now || now.url !== src.url || now.type !== src.type) continue // nguon da doi / bi bo
    const merged = new Set([...(cur.seen[src.id] || []), ...seen])
    cur.seen[src.id] = [...merged].slice(-SEEN_MAX)
    cur.primed[src.id] = true
  }
  cur.daily = Object.fromEntries(Object.entries(cur.daily || {}).filter(([k]) => k >= day))
  cur.daily[day] = (cur.daily[day] || 0) + created
  cur.lastCheckAt = Date.now()
  cur.nextCheckAt = Date.now() + cur.intervalMin * 60000
  cur.lastError = errors.length ? errors.join(' · ').slice(0, 800) : undefined
  const left = cur.maxPerDay - (cur.daily[day] || 0)
  cur.lastResult = primedNow
    ? `Lần đầu: ghi nhận ${primedNow} tin đang có (không tạo video) — tin đăng sau đó sẽ tự thành video.`
    : created
      ? `Đã tạo ${created} video từ tin mới.`
      : left <= 0
        ? `Đã đủ ${cur.maxPerDay} video hôm nay — tin mới để dành cho ngày mai.`
        : stopped
          ? 'Chưa tạo được video — tin giữ lại cho lần sau.'
          : 'Không có tin mới.'
  save()
  return { ok: !errors.length, created, message: cur.lastResult + (errors.length ? ' Lỗi: ' + cur.lastError : '') }
}

/** Bat chu ky kiem tin (moi phut xem du an nao toi gio). */
export function startAutomation(): void {
  if (timer) return
  const tick = () => {
    // key het han / bi khoa / chua kich hoat -> tam dung (khong lay tin, khong tao video)
    if (!licenseOk()) return
    const now = Date.now()
    for (const p of load()) {
      if (!p.enabled || checking.has(p.id)) continue
      if (!p.nextCheckAt || p.nextCheckAt <= now) checkAutoProject(p.id).catch(() => undefined)
    }
  }
  timer = setInterval(tick, TICK_MS)
  setTimeout(tick, 15000)
}

export function stopAutomation(): void {
  if (timer) clearInterval(timer)
  timer = null
}
