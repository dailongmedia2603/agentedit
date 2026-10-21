// BOT TELEGRAM — du lieu (2026-10-21).
// - Token bot: MA HOA safeStorage o <userData>/telegram.enc (file rieng, nhu phoneagent.enc).
// - Trang thai (khong bi mat): ~/.capcut-studio/telegram/state.json — bat/tat, offset getUpdates, chat da xac thuc (chi giu
//   DAU VAN TAY key, khong giu key), lan nhap sai key, viec dang theo doi, phien hoi dang do (bang hoi tung buoc).
// - File nguoi dung gui: ~/.capcut-studio/telegram/uploads/<chat>/<phien>/ (xoa khi viec xong — app da chep vao du an).
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ENGINE_HOME } from '../paths'
import { readJson, writeJsonAtomic } from '../../cli/util'
import type { Session } from './wizard'

export const TG_HOME = join(ENGINE_HOME, 'telegram')
export const TG_UPLOADS = join(TG_HOME, 'uploads')
const STATE_FILE = join(TG_HOME, 'state.json')

export interface TgChatAuth {
  chatId: number
  name: string
  username?: string
  /** dau van tay key luc xac thuc (license.licenseKeyFingerprint) — khac key hien tai = het quyen */
  keyPrint: string
  authorizedAt: number
  lastSeenAt?: number
}

export interface TgJobRef {
  /** r_... (Edit video, viec nen CLI) | mv-... (Tao video) */
  id: string
  kind: 'edit' | 'motion'
  chatId: number
  title: string
  createdAt: number
  /** tin nhan trang thai (sua tai cho moi khi sang buoc moi) */
  statusMsgId?: number
  /** moc cuoi da bao (doi -> sua tin trang thai) */
  sig?: string
  /** da bao ket qua cuoi (gui video / bao loi) */
  finished?: boolean
  /** thu muc file nguoi dung gui cho viec nay — xoa khi viec ket thuc */
  uploadDir?: string
}

export interface TgState {
  enabled: boolean
  offset: number
  bot?: { id: number; username: string; name: string }
  chats: Record<string, TgChatAuth>
  /** lan nhap sai key theo chat: n lan trong cua so tu `first`; until = bi khoa toi */
  fails: Record<string, { n: number; first: number; until?: number }>
  jobs: TgJobRef[]
  sessions: Record<string, Session>
}

const empty = (): TgState => ({ enabled: false, offset: 0, chats: {}, fails: {}, jobs: [], sessions: {} })

let cache: TgState | null = null

export function tgState(): TgState {
  if (!cache) {
    const s = readJson<Partial<TgState> | null>(STATE_FILE, null)
    cache = { ...empty(), ...(s && typeof s === 'object' ? s : {}) }
    cache.chats ||= {}
    cache.fails ||= {}
    cache.jobs = Array.isArray(cache.jobs) ? cache.jobs : []
    cache.sessions ||= {}
  }
  return cache
}

export function saveTgState(): void {
  const s = tgState()
  // giu 300 viec gan nhat (da xong) — viec chua xong giu het
  const done = s.jobs.filter((j) => j.finished)
  if (done.length > 300) {
    const drop = new Set(done.sort((a, b) => a.createdAt - b.createdAt).slice(0, done.length - 300).map((j) => j.id))
    s.jobs = s.jobs.filter((j) => !drop.has(j.id))
  }
  writeJsonAtomic(STATE_FILE, s)
}

/** CHI cho test: doc lai tu dia */
export function resetTgCache(): void {
  cache = null
}

// ---------------------------------------------------------------------------
// Token bot (ma hoa)
// ---------------------------------------------------------------------------
const tokenPath = () => join(app.getPath('userData'), 'telegram.enc')

export function getBotToken(): string {
  // ban dev: STUDIO_TELEGRAM_TOKEN (tu kiem tren app that voi may chu Telegram gia, khong dung Keychain)
  if (!app.isPackaged && process.env.STUDIO_TELEGRAM_TOKEN) return process.env.STUDIO_TELEGRAM_TOKEN
  const p = tokenPath()
  if (!existsSync(p)) return ''
  try {
    const raw = readFileSync(p)
    const s = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf-8')
    return String(JSON.parse(s)?.token || '').trim()
  } catch {
    return ''
  }
}

export function setBotToken(token: string): void {
  const t = String(token || '').trim()
  if (!t) {
    rmSync(tokenPath(), { force: true })
    return
  }
  const txt = JSON.stringify({ token: t })
  writeFileSync(tokenPath(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, 'utf-8'))
}

/** Token dung dinh dang BotFather: <so>:<35 ky tu> */
export const tokenLooksValid = (t: string) => /^\d{5,15}:[A-Za-z0-9_-]{30,}$/.test(String(t || '').trim())

export function tokenHint(t: string): string {
  return t ? t.split(':')[0] + ':••••' + t.slice(-4) : ''
}
