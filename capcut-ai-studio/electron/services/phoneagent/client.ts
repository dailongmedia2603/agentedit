// PHONE AGENT — dieu khien iPhone de DANG VIDEO len TikTok / Facebook (2026-10-19). Tai lieu: API-v2.md (External API v1)
// + source github.com/dailongmedia2603/phoneclaw-dashboard. Base mac dinh https://phoneagent.io.vn/api/v1/external,
// xac thuc header X-API-Token: pa_live_... Moi response JSON {success, data | error}; 429 kem Retry-After.
// Token luu MA HOA bang safeStorage trong <userData>/phoneagent.enc (file rieng, khong dung secrets.enc cua cac AI).
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

export const PHONEAGENT_DEFAULT_BASE = 'https://phoneagent.io.vn/api/v1/external'
export const PHONEAGENT_SITE = 'https://phoneagent.io.vn'

interface Stored {
  token: string
  base?: string
}

function keyPath(): string {
  return join(app.getPath('userData'), 'phoneagent.enc')
}

function readStored(): Stored {
  const p = keyPath()
  if (!existsSync(p)) return { token: '' }
  try {
    const raw = readFileSync(p)
    const s = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf-8')
    const j = JSON.parse(s)
    return { token: String(j?.token || '').trim(), base: j?.base ? String(j.base) : undefined }
  } catch {
    return { token: '' }
  }
}

function writeStored(s: Stored): void {
  if (!s.token && !s.base) {
    rmSync(keyPath(), { force: true })
    return
  }
  const txt = JSON.stringify(s)
  writeFileSync(keyPath(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, 'utf-8'))
}

/** Base URL: bo "/" cuoi; nguoi dung dan link trang chu (https://x.vn) -> tu them /api/v1/external. */
export function normalizeBase(raw?: string): string {
  let b = String(raw || '').trim().replace(/\/+$/, '')
  if (!b) return PHONEAGENT_DEFAULT_BASE
  if (!/^https?:\/\//i.test(b)) b = 'https://' + b
  if (!/\/api\/v1\/external$/i.test(b)) b = b.replace(/\/api(\/v1)?$/i, '') + '/api/v1/external'
  return b
}

export const getToken = (): string => readStored().token
export const getBase = (): string => normalizeBase(readStored().base)

export function setPhoneAgentConfig(cfg: { token?: string; base?: string }): void {
  const cur = readStored()
  const token = cfg.token === undefined ? cur.token : String(cfg.token).trim()
  const base = cfg.base === undefined ? cur.base : String(cfg.base).trim()
  writeStored({ token, base: base && normalizeBase(base) !== PHONEAGENT_DEFAULT_BASE ? normalizeBase(base) : undefined })
}

export function phoneAgentMasked(): { has_key: boolean; key_hint: string; base: string; default_base: string } {
  const s = readStored()
  const k = s.token
  return {
    has_key: !!k,
    key_hint: k.length >= 12 ? k.slice(0, 8) + '••••' + k.slice(-4) : k ? 'đã lưu' : '',
    base: normalizeBase(s.base),
    default_base: PHONEAGENT_DEFAULT_BASE
  }
}

export class PhoneAgentError extends Error {
  status: number
  field?: string
  /** loi tam thoi (mang / 429 / 5xx) — nen thu lai sau */
  retry: boolean
  constructor(msg: string, status: number, retry: boolean, field?: string) {
    super(msg)
    this.status = status
    this.retry = retry
    this.field = field
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Doi loi cua may chu sang cau tieng Viet de hieu (giu nguyen chi tiet goc). */
function friendly(status: number, err: string): string {
  if (status === 401) {
    if (/required/i.test(err)) return 'Chưa nhập API token Phone Agent.'
    if (/format/i.test(err)) return 'API token sai định dạng — token phải bắt đầu bằng pa_live_.'
    return 'API token không hợp lệ hoặc đã bị thu hồi / đổi mới — tạo token mới ở Phone Agent > Cài đặt > API Token.'
  }
  if (status === 403 && /api token|apiTokens|gói|plan/i.test(err)) return 'Gói Phone Agent của bạn chưa bật API token. (' + err + ')'
  if (status === 429) return 'Phone Agent đang giới hạn số lần gọi (60 lần/phút) — thử lại sau ít phút.'
  return err || `Phone Agent báo lỗi HTTP ${status}`
}

export interface CallOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  /** token / base dang go (chua luu) — nut "Kiểm tra" */
  token?: string
  base?: string
  timeoutMs?: number
  /** so lan thu lai khi 429 / 5xx / mat mang (mac dinh 2) */
  retries?: number
  /** tra ve Buffer (screenshot PNG) thay vi JSON */
  binary?: boolean
}

/** Goi External API. Thanh cong -> `data`; loi -> PhoneAgentError (message tieng Viet). */
export async function paCall<T = unknown>(path: string, opts: CallOpts = {}): Promise<T> {
  const token = (opts.token ?? getToken()).trim()
  if (!token) throw new PhoneAgentError('Chưa nhập API token Phone Agent (Cài đặt API > Phone Agent).', 401, false)
  const base = opts.base ? normalizeBase(opts.base) : getBase()
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : ''
  const url = base + path + (qs.length > 1 ? qs : '')
  const retries = opts.retries ?? 2
  let lastErr: PhoneAgentError | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 30000)
    let r: Response
    try {
      r = await fetch(url, {
        method: opts.method || 'GET',
        signal: ctl.signal,
        headers: {
          'X-API-Token': token,
          Accept: opts.binary ? 'image/png,*/*' : 'application/json',
          'User-Agent': 'AgentEdit/1.0',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      })
    } catch (e) {
      clearTimeout(t)
      const msg =
        (e as Error)?.name === 'AbortError'
          ? 'Phone Agent không phản hồi (quá thời gian chờ).'
          : 'Không kết nối được Phone Agent (' + base.replace(/^https?:\/\//, '').split('/')[0] + '): ' + String((e as Error)?.message || e)
      lastErr = new PhoneAgentError(msg, 0, true)
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt)
        continue
      }
      throw lastErr
    }
    clearTimeout(t)
    if (opts.binary && r.ok) return Buffer.from(await r.arrayBuffer()) as unknown as T
    const text = await r.text().catch(() => '')
    let j: { success?: boolean; data?: unknown; error?: string; field?: string } | null = null
    try {
      j = JSON.parse(text)
    } catch {
      j = null
    }
    if (r.ok && j && j.success !== false) return (j.data ?? (j as unknown)) as T
    const raw = j?.error || (j ? '' : text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200))
    const retry = r.status === 429 || r.status >= 500 || r.status === 0
    lastErr = new PhoneAgentError(friendly(r.status, String(raw || '')), r.status, retry, j?.field)
    if (retry && attempt < retries) {
      const ra = Number(r.headers.get('retry-after'))
      await sleep(r.status === 429 ? Math.min(90, Number.isFinite(ra) && ra > 0 ? ra : 20) * 1000 : 1000 * 2 ** attempt)
      continue
    }
    throw lastErr
  }
  throw lastErr || new PhoneAgentError('Lỗi không xác định', 0, true)
}
