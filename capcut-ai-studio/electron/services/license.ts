// BAN QUYEN: 1 key = 1 may. May chu: license-server/ (Cloudflare Worker + D1).
//
// - Ma may: bam (HMAC) cac ma phan cung (macOS IOPlatformUUID + serial; Windows UUID bo mach + serial bo mach +
//   MachineGuid). Server coi la cung may khi khop >= 2 thanh phan (cai lai Windows doi MachineGuid van qua).
// - Khoa thiet bi: cap Ed25519 sinh tren may nay, khoa bi mat giu bang safeStorage (Keychain / DPAPI) -> copy thu
//   muc app sang may khac khong giai ma duoc. Moi yeu cau len server deu ky bang khoa nay.
// - Kiem ONLINE dung 2 luc (yeu cau cua chu app): mo app + bam "Phan tich video". Khong mang = khong dung.
// - Server tra "ve" ky Ed25519 (khoa bi mat chi o Worker) -> main kiem chu ky truoc khi tin; sidecar Python
//   tu kiem lai ve (server.py) va tu choi moi viec AI neu khong co ve hop le.
import { app, net, safeStorage } from 'electron'
import { createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, KeyObject } from 'crypto'
import { execFile } from 'child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { hostname } from 'os'
import { join } from 'path'
import { setSidecarTicket, setTicketRefresher } from './sidecar'

// ---- Cau hinh ban that (doi khoa / dia chi = phai build lai app) ----
const PROD_API = 'https://agent-edit-license.agent-edit-license-server.workers.dev'
const PROD_PUB = 'qsPtITJCcT/BcJQIVP0p4ILdenDc34yJ+8sA8txQeTA='

// Ban dev (npm run dev, chua dong goi): tro toi may chu thu (wrangler dev) hoac tat han de lam viec.
const DEV = !app.isPackaged
const devEnv = (k: string) => (DEV ? process.env[k] || '' : '')
/** Dev: STUDIO_LICENSE=off -> bo qua ban quyen (sidecar chay tu source .py cung bo qua). */
export const licenseDisabled = (): boolean => devEnv('STUDIO_LICENSE') === 'off'
const apiUrl = () => (devEnv('STUDIO_LICENSE_URL') || PROD_API).replace(/\/$/, '')
const serverPubB64 = () => devEnv('STUDIO_LICENSE_PUB') || PROD_PUB
// (bien moi truong ban dev cho sidecar: sidecar.ts licenseEnv)

export type LicenseStatus =
  | 'ok'
  | 'need_key'
  | 'invalid_key'
  | 'locked'
  | 'expired'
  | 'other_machine'
  | 'offline'
  | 'error'

export interface LicenseState {
  status: LicenseStatus
  message: string
  plan?: 'month' | 'year' | 'lifetime'
  expiresAt?: number | null
  keyHint?: string
  customer?: string
  checkedAt?: number
  dev?: boolean
}

// ---------------------------------------------------------------------------
// Ma may
// ---------------------------------------------------------------------------
const FP_SALT = 'agent-edit/fp/v1'
const JUNK = new Set([
  'TO BE FILLED BY O.E.M.',
  'DEFAULT STRING',
  'NONE',
  'SYSTEM SERIAL NUMBER',
  'BASE BOARD SERIAL NUMBER',
  'CHASSIS SERIAL NUMBER',
  'SERIAL NUMBER',
  'N/A',
  'NA',
  'NOT APPLICABLE',
  'NOT SPECIFIED',
  'NOT AVAILABLE',
  'INVALID',
  'UNKNOWN',
  'DEFAULT',
  '123456789',
  '0123456789',
  '1234567890',
  '03000200-0400-0500-0006-000700080009'
])
// Python (sidecar/server.py) chay DUNG lenh nay -> 2 ben ra cung ma
const WIN_PS =
  "$ErrorActionPreference='SilentlyContinue';" +
  '$p=Get-CimInstance -ClassName Win32_ComputerSystemProduct | Select-Object -First 1;' +
  '$b=Get-CimInstance -ClassName Win32_BaseBoard | Select-Object -First 1;' +
  "$g=(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid;" +
  '[pscustomobject]@{uuid=[string]$p.UUID;board=[string]$b.SerialNumber;guid=[string]$g} | ConvertTo-Json -Compress'

function cleanId(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase()
  if (s.length < 4 || JUNK.has(s) || /^[0F\-\s]+$/.test(s) || s.includes('O.E.M')) return null
  return s
}
const fpHash = (name: string, value: string) => createHmac('sha256', FP_SALT).update(`${name}=${value}`).digest('hex').slice(0, 32)

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 20000, windowsHide: true, maxBuffer: 1 << 20 }, (_err, stdout) => resolve(String(stdout || '')))
  })
}

export interface Fingerprint {
  platform: 'darwin' | 'win32'
  c: Record<string, string>
}

let fpCache: Promise<Fingerprint> | null = null
export function fingerprint(): Promise<Fingerprint> {
  if (!fpCache) fpCache = readFingerprint()
  return fpCache
}

async function readFingerprint(): Promise<Fingerprint> {
  const raw: Record<string, unknown> = {}
  if (process.platform === 'darwin') {
    const out = await run('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])
    raw['mac.uuid'] = /"IOPlatformUUID" = "([^"]+)"/.exec(out)?.[1]
    raw['mac.serial'] = /"IOPlatformSerialNumber" = "([^"]+)"/.exec(out)?.[1]
  } else if (process.platform === 'win32') {
    const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const out = await run(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_PS])
    try {
      const j = JSON.parse(out.trim() || '{}')
      raw['win.uuid'] = j.uuid
      raw['win.board'] = j.board
      raw['win.guid'] = j.guid
    } catch {
      /* khong doc duoc -> chi dua vao khoa thiet bi */
    }
  }
  const c: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    const val = cleanId(v)
    if (val) c[k] = fpHash(k, val)
  }
  return { platform: process.platform === 'win32' ? 'win32' : 'darwin', c }
}

// ---------------------------------------------------------------------------
// Luu key + khoa thiet bi (ma hoa bang safeStorage)
// ---------------------------------------------------------------------------
interface Stored {
  v: 1
  key: string
  sk: string // pkcs8 DER base64
  pub: string // 32 byte base64
}

// Tu kiem (chua dong goi): luu thuong trong --user-data-dir tam, khong dung Keychain
const PLAIN = DEV && process.env.STUDIO_LICENSE_PLAIN_STORE === '1'
const storePath = () => join(app.getPath('userData'), devEnv('STUDIO_LICENSE_URL') ? 'license-dev.enc' : 'license.enc')
let storeError = ''

function loadStored(): Stored | null {
  storeError = ''
  const p = storePath()
  if (!existsSync(p)) return null
  try {
    const raw = readFileSync(p)
    const text = PLAIN ? raw.toString('utf-8') : safeStorage.decryptString(raw)
    const s = JSON.parse(text) as Stored
    if (s && s.v === 1 && s.key && s.sk && s.pub) return s
  } catch {
    // File cua may khac / user khac (safeStorage khong giai ma duoc) -> phai kich hoat lai tren may nay
    storeError = 'Cần nhập lại key trên máy này.'
  }
  return null
}

function saveStored(s: Stored): void {
  const text = JSON.stringify(s)
  if (PLAIN) {
    writeFileSync(storePath(), text)
    return
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Máy không hỗ trợ lưu trữ mã hoá (Keychain / DPAPI).')
  writeFileSync(storePath(), safeStorage.encryptString(text))
}

function newDevice(): { sk: string; pub: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    sk: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    pub: publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')
  }
}
const privKey = (skB64: string): KeyObject => createPrivateKey({ key: Buffer.from(skB64, 'base64'), format: 'der', type: 'pkcs8' })

// ---------------------------------------------------------------------------
// Ve tu server
// ---------------------------------------------------------------------------
interface TicketPayload {
  v: number
  lid: string
  plan: LicenseState['plan']
  exp: number | null
  iat: number
  until: number
  dev: string
}

function verifyTicket(ticket: string, devPub: string): TicketPayload | null {
  try {
    const [v, body, sig] = String(ticket || '').split('.')
    if (v !== 'v1' || !body || !sig) return null
    const pub = createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(serverPubB64(), 'base64')]),
      format: 'der',
      type: 'spki'
    })
    if (!verify(null, Buffer.from('v1.' + body), pub, Buffer.from(sig, 'base64url'))) return null
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as TicketPayload
    const devHash = createHash('sha256').update(devPub).digest('hex').slice(0, 32)
    return p.v === 1 && p.dev === devHash ? p : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Goi server
// ---------------------------------------------------------------------------
let clockOffset = 0

interface ServerReply {
  ok: boolean
  code?: string
  message?: string
  server_time?: number
  ticket?: string
  license?: { plan: LicenseState['plan']; expires_at: number | null; key_hint: string; customer?: string }
  manifest?: unknown
}

async function post(op: 'activate' | 'check' | 'library', s: Stored, extra: Record<string, unknown> = {}): Promise<ServerReply> {
  if (apiUrl().includes('REPLACE')) return { ok: false, code: 'error', message: 'Chưa cấu hình máy chủ bản quyền.' }
  const fp = await fingerprint()
  const sk = privKey(s.sk)
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = JSON.stringify({
      op,
      key: s.key,
      dev: s.pub,
      fp,
      app: app.getVersion(),
      host: hostname().slice(0, 80),
      ts: Date.now() + clockOffset,
      ...extra
    })
    const sig = sign(null, Buffer.from(p), sk).toString('base64')
    let res: Response
    try {
      res = await net.fetch(apiUrl() + '/v1/license', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ p, s: sig }),
        signal: AbortSignal.timeout(20000)
      })
    } catch {
      return { ok: false, code: 'offline' }
    }
    let j: ServerReply
    try {
      j = (await res.json()) as ServerReply
    } catch {
      return { ok: false, code: 'error', message: `Máy chủ bản quyền lỗi (HTTP ${res.status}).` }
    }
    if (typeof j.server_time === 'number') clockOffset = j.server_time - Date.now()
    if (j.code === 'clock' && attempt === 0) continue // gio may lech -> bu theo gio server roi gui lai
    return j
  }
  return { ok: false, code: 'error', message: 'Giờ trên máy bị lệch quá nhiều.' }
}

// ---------------------------------------------------------------------------
// Trang thai
// ---------------------------------------------------------------------------
let state: LicenseState = { status: 'need_key', message: '' }
const listeners = new Set<(s: LicenseState) => void>()
export function onLicenseChange(cb: (s: LicenseState) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function setState(s: LicenseState): LicenseState {
  state = s
  for (const cb of listeners) cb(s)
  return s
}
export const licenseState = (): LicenseState => state

const OFFLINE_MSG = 'Không kết nối được máy chủ bản quyền. Kiểm tra mạng rồi thử lại.'

/** Ap ket qua server vao trang thai. Thanh cong -> day ve sang sidecar. */
function apply(r: ServerReply, s: Stored): LicenseState {
  if (r.ok && r.ticket) {
    const t = verifyTicket(r.ticket, s.pub)
    if (!t) return setState({ status: 'error', message: 'Máy chủ bản quyền trả về dữ liệu không hợp lệ.' })
    setSidecarTicket(r.ticket)
    return setState({
      status: 'ok',
      message: '',
      plan: r.license?.plan || t.plan,
      expiresAt: r.license ? r.license.expires_at : t.exp,
      keyHint: r.license?.key_hint || s.key.slice(-5),
      customer: r.license?.customer || '',
      checkedAt: Date.now()
    })
  }
  setSidecarTicket('')
  const code = r.code || 'error'
  const base = { keyHint: s.key.slice(-5), checkedAt: Date.now() }
  if (code === 'offline') return setState({ status: 'offline', message: OFFLINE_MSG, ...base })
  if (code === 'not_activated')
    return setState({ status: 'need_key', message: 'Key chưa được kích hoạt trên máy này. Nhập lại key để kích hoạt.', ...base })
  if (code === 'invalid_key' || code === 'throttled') return setState({ status: 'invalid_key', message: r.message || 'Key không đúng.', ...base })
  if (code === 'locked' || code === 'expired' || code === 'other_machine') {
    return setState({ status: code, message: r.message || '', ...base })
  }
  return setState({ status: 'error', message: r.message || 'Lỗi máy chủ bản quyền.', ...base })
}

let inflight: Promise<LicenseState> | null = null

/** Kiem online (mo app / bam phan tich). `maxAgeMs`: vua kiem OK trong khoang nay thi dung lai (nhieu video bam cung luc). */
export function checkLicense(reason: 'open' | 'analyze' | 'refresh', maxAgeMs = 0): Promise<LicenseState> {
  if (licenseDisabled()) return Promise.resolve(setState({ status: 'ok', message: '', dev: true, plan: 'lifetime', expiresAt: null }))
  if (maxAgeMs && state.status === 'ok' && state.checkedAt && Date.now() - state.checkedAt < maxAgeMs) return Promise.resolve(state)
  if (inflight) return inflight
  inflight = (async () => {
    const s = loadStored()
    if (!s) return setState({ status: 'need_key', message: storeError })
    return apply(await post('check', s, { reason }), s)
  })().finally(() => {
    inflight = null
  })
  return inflight
}

/** Nhap key lan dau / nhap lai key tren may nay. */
export async function activateLicense(rawKey: string): Promise<LicenseState> {
  if (licenseDisabled()) return checkLicense('open')
  const key = String(rawKey || '').trim()
  if (!key) return setState({ status: 'need_key', message: 'Hãy nhập key.' })
  const prev = loadStored()
  const dev = prev ? { sk: prev.sk, pub: prev.pub } : newDevice()
  const s: Stored = { v: 1, key, ...dev }
  const r = await post('activate', s)
  if (r.ok) {
    try {
      saveStored(s)
    } catch (e) {
      return setState({ status: 'error', message: String((e as Error).message || e) })
    }
    return apply(r, s)
  }
  // Kich hoat hong: GIU key cu (neu co) — chi bao loi cho lan nhap nay
  if (r.code === 'offline') return setState({ status: 'offline', message: OFFLINE_MSG })
  const st = apply(r, s)
  return prev ? { ...st, keyHint: prev.key.slice(-5) } : st
}

/** "Nhap key khac": xoa key + khoa thiet bi tren may nay (KHONG go may tren server — chi quan tri moi lam duoc). */
export function forgetLicense(): LicenseState {
  try {
    if (existsSync(storePath())) unlinkSync(storePath())
  } catch {
    /* bo qua */
  }
  setSidecarTicket('')
  return setState({ status: 'need_key', message: '' })
}

/** Truoc khi phan tich video: BAT BUOC hoi server (dung lai ket qua < 20s cho nhieu video bam cung luc). */
export async function requireLicense(): Promise<void> {
  const s = await checkLicense('analyze', 20000)
  if (s.status !== 'ok') throw new Error(s.message || 'Bản quyền không hợp lệ.')
}

/** Viec khong hoi server (render...): chi can lan kiem gan nhat la OK. */
export function assertLicensed(): void {
  if (licenseDisabled()) return
  if (state.status !== 'ok') throw new Error(state.message || 'Bản quyền không hợp lệ — mở lại app để kiểm tra key.')
}

/** Manifest kho SFX + Meme kem link tai tam (chi key dang kich hoat dung may nay). */
export async function libraryManifest(): Promise<unknown> {
  const s = loadStored()
  if (!s) throw new Error('Chưa kích hoạt key.')
  const r = await post('library', s)
  apply(r, s)
  if (!r.ok) throw new Error(state.message || r.message || 'Không đồng bộ được kho.')
  return r.manifest
}

// Sidecar tu choi vi ve het han (app mo lien tuc > 3 ngay khong phan tich video) -> lay ve moi 1 lan
setTicketRefresher(async () => (await checkLicense('refresh')).status === 'ok')

/**
 * KHO HIEU UNG CHUNG (2026-10-05): gui 1 hieu ung tu viet (meta da loc + code + preview) len may chu ban quyen.
 * Ky bang khoa thiet bi; chu ky phu bam cua ca 3 phan. Key cua may tin cay -> server tu duyet, con lai cho duyet.
 * retry = loi tam thoi (mat mang, may chu ban, gioi han ngay) -> thu lai o lan mo app sau, khong danh dau loi.
 */
export async function fxUpload(pl: {
  meta: Record<string, unknown>
  code: string
  preview: string
}): Promise<{ ok: boolean; status?: string; code?: string; message?: string; retry?: boolean }> {
  if (licenseDisabled()) return { ok: false, retry: true, message: 'Bản quyền đang tắt (dev) — không gửi kho chung.' }
  const s = loadStored()
  if (!s) return { ok: false, retry: true, message: 'Chưa kích hoạt key.' }
  if (apiUrl().includes('REPLACE')) return { ok: false, retry: true, message: 'Chưa cấu hình máy chủ bản quyền.' }
  const meta = JSON.stringify(pl.meta)
  const code = readFileSync(pl.code, 'utf-8')
  const prev = readFileSync(pl.preview)
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
  const fp = await fingerprint()
  const sk = privKey(s.sk)
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = JSON.stringify({
      op: 'fx_upload',
      key: s.key,
      dev: s.pub,
      fp,
      ts: Date.now() + clockOffset,
      id: pl.meta.id,
      meta_sha: sha(Buffer.from(meta, 'utf-8')),
      code_sha: sha(Buffer.from(code, 'utf-8')),
      preview_sha: sha(prev)
    })
    const form = new FormData()
    form.append('p', p)
    form.append('s', sign(null, Buffer.from(p), sk).toString('base64'))
    form.append('meta', meta)
    form.append('code', code)
    form.append('preview', new Blob([prev], { type: 'video/mp4' }), 'preview.mp4')
    let j: { ok: boolean; status?: string; code?: string; message?: string; server_time?: number }
    try {
      const res = await net.fetch(apiUrl() + '/v1/fx/upload', { method: 'POST', body: form, signal: AbortSignal.timeout(60000) })
      j = (await res.json()) as typeof j
    } catch {
      return { ok: false, retry: true, code: 'offline', message: 'Không kết nối được máy chủ bản quyền.' }
    }
    if (typeof j.server_time === 'number') clockOffset = j.server_time - Date.now()
    if (j.code === 'clock' && attempt === 0) continue
    const temp = ['offline', 'server', 'throttled', 'clock', 'fx_limit'].includes(String(j.code))
    return { ok: !!j.ok, status: j.status, code: j.code, message: j.message, retry: !j.ok && temp }
  }
  return { ok: false, retry: true, code: 'clock', message: 'Giờ trên máy bị lệch quá nhiều.' }
}
