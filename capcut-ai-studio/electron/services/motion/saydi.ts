// SAYDIVOICE (voice.saydi.ai) — giong doc tieng Viet cho "Tao video" / "Automation Video" (2026-10-14).
// API (da goi that 2026-10-14):
//   GET  /samples                    giong co san (~1000, cong khai, khong can key) — voice_id, display_name, language...
//   GET  /samples/<voice_id>/audio   file nghe thu giong co san (wav)
//   GET  /v1/voices          (key)   giong rieng cua tai khoan (id vc_..., preview_url)
//   GET  /v1/voices/<id>/preview (key) nghe thu giong rieng (mp3)
//   GET  /v1/models          (key)   kiem key: 200 = hop le, 401 = sai / het han
//   POST /v1/audio/speech    (key)   tao giong doc — skill goi qua scripts/voice.py (env SAYDI_API_KEY)
// Key luu MA HOA bang safeStorage (Keychain macOS / DPAPI Windows) trong <userData>/saydi.enc — file rieng, khong
// dung secrets.enc cua Gemini / GPT / Claude (khong lam doi cau hinh cac AI kia).
import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { MOTION_HOME } from './paths'

export const SAYDI_API = 'https://voice.saydi.ai/api'
export const SAYDI_SITE = 'https://voice.saydi.ai'

function keyPath(): string {
  return join(app.getPath('userData'), 'saydi.enc')
}

export function getSaydiKey(): string {
  const p = keyPath()
  if (!existsSync(p)) return ''
  try {
    const raw = readFileSync(p)
    const s = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf-8')
    return s.trim()
  } catch {
    return ''
  }
}

export function setSaydiKey(key: string): void {
  const k = key.trim()
  if (!k) {
    rmSync(keyPath(), { force: true })
    return
  }
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(k) : Buffer.from(k, 'utf-8')
  writeFileSync(keyPath(), data)
}

export function saydiMasked(): { has_key: boolean; key_hint: string } {
  const k = getSaydiKey()
  return { has_key: !!k, key_hint: k.length >= 6 ? '••••' + k.slice(-4) : k ? 'đã lưu' : '' }
}

async function call(path: string, key?: string, timeoutMs = 20000): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    return await fetch(SAYDI_API + path, {
      signal: ctl.signal,
      headers: { ...(key ? { Authorization: 'Bearer ' + key } : {}), 'User-Agent': 'AgentEdit/1.0', Accept: '*/*' }
    })
  } catch (e) {
    throw new Error((e as Error)?.name === 'AbortError' ? 'SaydiVoice không phản hồi (quá thời gian chờ)' : 'Không kết nối được SaydiVoice: ' + String((e as Error)?.message || e))
  } finally {
    clearTimeout(t)
  }
}

async function errText(r: Response): Promise<string> {
  const t = await r.text().catch(() => '')
  try {
    const j = JSON.parse(t)
    return String(j?.error?.message || j?.detail || t).slice(0, 300)
  } catch {
    return t.slice(0, 300) || `HTTP ${r.status}`
  }
}

/** Kiem key (key truyen vao = key dang go chua luu; khong truyen = key da luu). */
export async function testSaydiKey(key?: string): Promise<{ ok: boolean; detail?: string; error?: string }> {
  const k = (key ?? getSaydiKey()).trim()
  if (!k) return { ok: false, error: 'Chưa nhập API key SaydiVoice.' }
  try {
    const r = await call('/v1/models', k)
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'API key không hợp lệ, đã bị thu hồi hoặc hết hạn.' }
    if (!r.ok) return { ok: false, error: `SaydiVoice báo lỗi: ${await errText(r)}` }
    const j: any = await r.json().catch(() => ({}))
    const models = Array.isArray(j?.data) ? j.data.map((m: any) => m.id).filter(Boolean) : []
    let custom = 0
    try {
      const v = await call('/v1/voices', k)
      if (v.ok) custom = ((await v.json()) as any)?.data?.length || 0
    } catch {
      /* khong quan trong */
    }
    return { ok: true, detail: `Key hợp lệ${models.length ? ` · model ${models.join(', ')}` : ''}${custom ? ` · ${custom} giọng riêng` : ''}` }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) }
  }
}

export interface SaydiVoice {
  id: string
  name: string
  language: string
  gender?: string
  age?: string
  description?: string
  sample?: string
  featured?: boolean
  /** giong rieng cua tai khoan (vc_...) */
  custom?: boolean
}

const CACHE_DIR = join(MOTION_HOME, 'cache')
const VOICES_CACHE = join(CACHE_DIR, 'saydi-voices.json')
const VOICES_TTL = 6 * 3600 * 1000

async function publicVoices(force: boolean): Promise<SaydiVoice[]> {
  if (!force && existsSync(VOICES_CACHE)) {
    try {
      const c = JSON.parse(readFileSync(VOICES_CACHE, 'utf-8'))
      if (Date.now() - c.at < VOICES_TTL && Array.isArray(c.voices) && c.voices.length) return c.voices
    } catch {
      /* tai lai */
    }
  }
  const r = await call('/samples', undefined, 30000)
  if (!r.ok) throw new Error('Không lấy được danh sách giọng: ' + (await errText(r)))
  const arr: any[] = (await r.json()) as any[]
  const voices: SaydiVoice[] = (Array.isArray(arr) ? arr : [])
    .filter((v) => v && v.voice_id)
    .map((v) => ({
      id: String(v.voice_id),
      name: String(v.display_name || v.name || v.voice_id),
      language: String(v.language || (Array.isArray(v.languages) ? v.languages[0] : '') || ''),
      gender: v.gender || undefined,
      age: v.age || undefined,
      description: v.description || undefined,
      sample: v.transcript_preview || undefined,
      featured: !!v.featured
    }))
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(VOICES_CACHE, JSON.stringify({ at: Date.now(), voices }))
  return voices
}

async function customVoices(key: string): Promise<SaydiVoice[]> {
  const r = await call('/v1/voices', key)
  if (!r.ok) throw new Error(await errText(r))
  const j: any = await r.json()
  return (Array.isArray(j?.data) ? j.data : [])
    .filter((v: any) => v?.id && (!v.status || v.status === 'ready'))
    .map((v: any) => ({
      id: String(v.id),
      name: String(v.name || v.id),
      language: String(v.language || ''),
      description: 'Giọng riêng của tài khoản',
      sample: v.ref_text || undefined,
      custom: true
    }))
}

/** Giong rieng (neu co key) + giong co san. */
export async function listSaydiVoices(force = false): Promise<{ voices: SaydiVoice[]; customError?: string }> {
  const key = getSaydiKey()
  let custom: SaydiVoice[] = []
  let customError: string | undefined
  if (key) {
    try {
      custom = await customVoices(key)
    } catch (e) {
      customError = String((e as Error)?.message || e)
    }
  }
  const pub = await publicVoices(force)
  return { voices: [...custom, ...pub], customError }
}

/** Tai file nghe thu ve cache (lan sau dung lai) -> duong dan file. */
export async function saydiPreviewFile(id: string, custom: boolean): Promise<string> {
  const safe = id.replace(/[^A-Za-z0-9_.-]/g, '_')
  const dir = join(CACHE_DIR, 'voice-preview')
  mkdirSync(dir, { recursive: true })
  for (const ext of ['.wav', '.mp3']) {
    const p = join(dir, safe + ext)
    if (existsSync(p)) return p
  }
  const key = getSaydiKey()
  if (custom && !key) throw new Error('Cần API key SaydiVoice để nghe thử giọng riêng.')
  const r = custom
    ? await call(`/v1/voices/${encodeURIComponent(id)}/preview`, key, 30000)
    : await call(`/samples/${encodeURIComponent(id)}/audio`, undefined, 30000)
  if (!r.ok) throw new Error('Không tải được giọng nghe thử: ' + (await errText(r)))
  const type = r.headers.get('content-type') || ''
  if (!/audio\//i.test(type)) throw new Error('SaydiVoice không trả về file âm thanh.')
  const p = join(dir, safe + (/mpeg|mp3/i.test(type) ? '.mp3' : '.wav'))
  writeFileSync(p, Buffer.from(await r.arrayBuffer()))
  return p
}
