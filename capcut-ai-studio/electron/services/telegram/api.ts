// TELEGRAM BOT API — client toi thieu cho bot Agent Edit (2026-10-21). Tai lieu: https://core.telegram.org/bots/api
// Goi qua Electron net.fetch (mang Chromium: theo proxy / VPN cua he thong — Telegram bi chan o vai mang VN).
// Gioi han that cua Bot API (dung quen): bot chi TAI VE duoc file <= 20 MB (getFile), GUI LEN toi da 50 MB / file;
// callback_data <= 64 byte; tin nhan <= 4096 ky tu; getUpdates chi 1 noi goi 1 luc (noi khac -> 409 Conflict).
import { app, net } from 'electron'
import { createWriteStream, readFileSync, rmSync, statSync } from 'fs'
import { basename } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

/** Bot API chi cho bot tai file toi 20 MB */
export const TG_DOWNLOAD_MAX = 20 * 1024 * 1024
/** Gui file len toi da 50 MB — chua le cho phan multipart */
export const TG_UPLOAD_MAX = 49 * 1024 * 1024

// ban dev (chua dong goi): STUDIO_TELEGRAM_API = may chu Telegram gia de tu kiem tren app that
let apiBase = (!app.isPackaged && process.env.STUDIO_TELEGRAM_API) || 'https://api.telegram.org'
/** CHI cho test (may chu Telegram gia o tests/test_telegram.mts) */
export function setTelegramApiBase(b: string): void {
  apiBase = b.replace(/\/+$/, '')
}

export class TgError extends Error {
  code: number
  /** loi tam (mang / 429 / 5xx) — thu lai sau */
  retry: boolean
  retryAfter?: number
  constructor(msg: string, code: number, retry: boolean, retryAfter?: number) {
    super(msg)
    this.code = code
    this.retry = retry
    this.retryAfter = retryAfter
  }
}

export interface TgUser {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}
export interface TgChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  first_name?: string
  last_name?: string
  username?: string
  title?: string
}
export interface TgFileRef {
  file_id: string
  file_unique_id?: string
  file_size?: number
  file_name?: string
  mime_type?: string
  duration?: number
  width?: number
  height?: number
}
export interface TgMessage {
  message_id: number
  from?: TgUser
  chat: TgChat
  date: number
  text?: string
  caption?: string
  media_group_id?: string
  video?: TgFileRef
  document?: TgFileRef
  photo?: TgFileRef[]
  animation?: TgFileRef
  video_note?: TgFileRef
}
export interface TgCallback {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}
export interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallback
}

export type InlineButton = { text: string; callback_data: string }
export type InlineKeyboard = InlineButton[][]
export interface ReplyMarkup {
  inline_keyboard?: InlineKeyboard
  keyboard?: { text: string }[][]
  resize_keyboard?: boolean
  is_persistent?: boolean
  input_field_placeholder?: string
  remove_keyboard?: boolean
}

const MSG: Record<number, string> = {
  401: 'Token bot không đúng (Telegram từ chối). Lấy lại token ở @BotFather.',
  404: 'Token bot không đúng (Telegram từ chối). Lấy lại token ở @BotFather.',
  409: 'Bot đang được một nơi khác dùng (máy khác / app khác đang chạy cùng token). Tắt nơi đó hoặc tạo bot mới.'
}

/** Goi 1 phuong thuc Bot API (JSON). Loi -> TgError co cau tieng Viet. */
export async function tgCall<T = unknown>(token: string, method: string, params: Record<string, unknown> = {}, timeoutMs = 30000, signal?: AbortSignal): Promise<T> {
  let res: Response
  const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
  try {
    res = await net.fetch(`${apiBase}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: sig
    })
  } catch (e) {
    if (signal?.aborted) throw new TgError('aborted', 0, false)
    throw new TgError('Không kết nối được Telegram (mạng chặn / mất mạng — thử bật VPN): ' + String((e as Error)?.message || e), 0, true)
  }
  return parseReply<T>(res)
}

async function parseReply<T>(res: Response): Promise<T> {
  const j = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } } | null
  if (j?.ok) return j.result as T
  const code = j?.error_code || res.status
  const retryAfter = j?.parameters?.retry_after
  const retry = code === 429 || code >= 500 || !j
  throw new TgError(MSG[code] || j?.description || `Telegram lỗi HTTP ${res.status}`, code, retry, retryAfter)
}

/** Gui file (sendVideo / sendDocument / sendPhoto) dang multipart — tu dung than (Buffer) de chay duoc ca net.fetch lan fetch. */
export async function tgUpload<T = unknown>(token: string, method: string, field: string, file: string,
  params: Record<string, unknown> = {}, fileName?: string, contentType = 'application/octet-stream'): Promise<T> {
  const boundary = '----agentedit' + Math.random().toString(16).slice(2)
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${val}\r\n`, 'utf-8'))
  }
  const name = (fileName || basename(file)).replace(/["\r\n]/g, '_')
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: ${contentType}\r\n\r\n`, 'utf-8'))
  parts.push(readFileSync(file))
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'))
  let res: Response
  try {
    res = await net.fetch(`${apiBase}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat(parts),
      signal: AbortSignal.timeout(15 * 60000)
    })
  } catch (e) {
    throw new TgError('Không gửi được file lên Telegram: ' + String((e as Error)?.message || e), 0, true)
  }
  return parseReply<T>(res)
}

/** Tai file nguoi dung gui (<= 20 MB) ve `dest`. */
export async function tgDownload(token: string, fileId: string, dest: string): Promise<number> {
  const f = await tgCall<{ file_path?: string; file_size?: number }>(token, 'getFile', { file_id: fileId })
  if (!f.file_path) throw new TgError('Telegram không cho tải file này (file quá 20 MB?).', 400, false)
  const res = await net.fetch(`${apiBase}/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(10 * 60000) })
  if (!res.ok || !res.body) throw new TgError(`Tải file từ Telegram lỗi HTTP ${res.status}`, res.status, res.status >= 500)
  try {
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest))
  } catch (e) {
    rmSync(dest, { force: true })
    throw new TgError('Tải file từ Telegram bị ngắt: ' + String((e as Error)?.message || e), 0, true)
  }
  return statSync(dest).size
}

// ---------------------------------------------------------------------------
// Link tai truc tiep (file > 20 MB: Google Drive / Dropbox / link .mp4) — Bot API khong tai duoc file lon
// ---------------------------------------------------------------------------
/** Link chia se -> link tai thang (Google Drive, Dropbox). Khac -> giu nguyen. */
export function directLink(raw: string): string {
  const u = raw.trim()
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/.exec(u)
  if (drive) return `https://drive.usercontent.google.com/download?id=${drive[1]}&export=download&confirm=t`
  if (/^https?:\/\/(www\.)?dropbox\.com\//i.test(u)) return /[?&]dl=\d/.test(u) ? u.replace(/([?&])dl=\d/, '$1dl=1') : u + (u.includes('?') ? '&' : '?') + 'dl=1'
  return u
}

/** Tai link ve `dest` (toi da maxBytes). Trang web (HTML) -> loi "khong phai link tai truc tiep". Tra ten file goi y. */
export async function downloadUrl(url: string, dest: string, maxBytes: number): Promise<{ size: number; name?: string; type: string }> {
  let res: Response
  try {
    res = await net.fetch(directLink(url), { redirect: 'follow', signal: AbortSignal.timeout(60 * 60000) })
  } catch (e) {
    throw new Error('Không tải được link: ' + String((e as Error)?.message || e))
  }
  if (!res.ok || !res.body) throw new Error(`Không tải được link (HTTP ${res.status}).`)
  const type = (res.headers.get('content-type') || '').toLowerCase()
  if (type.startsWith('text/html')) throw new Error('Link này là trang web, không phải link tải file trực tiếp. Với Google Drive: chia sẻ "Bất kỳ ai có đường liên kết" rồi gửi lại link.')
  const len = Number(res.headers.get('content-length') || 0)
  if (len && len > maxBytes) throw new Error(`File quá lớn (${(len / 1048576).toFixed(0)} MB).`)
  const cd = res.headers.get('content-disposition') || ''
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd)
  const name = m ? decodeURIComponent(m[1] || m[2] || '') : undefined
  let got = 0
  const body = Readable.fromWeb(res.body as never)
  body.on('data', (c: Buffer) => {
    got += c.length
    if (got > maxBytes) body.destroy(new Error(`File quá lớn (hơn ${(maxBytes / 1048576).toFixed(0)} MB).`))
  })
  try {
    await pipeline(body, createWriteStream(dest))
  } catch (e) {
    rmSync(dest, { force: true })
    throw new Error(String((e as Error)?.message || e))
  }
  return { size: statSync(dest).size, name, type }
}
