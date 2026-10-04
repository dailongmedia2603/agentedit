// Dung chung cho 2 Worker (api.js = app goi, admin.js = trang quan tri).

const enc = new TextEncoder()
const dec = new TextDecoder()

// ---------- base64 ----------
export function b64(bytes) {
  let s = ''
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
  return btoa(s)
}
export function unb64(str) {
  const s = atob(str)
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u
}
export const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export function unb64url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  return unb64(s + '='.repeat((4 - (s.length % 4)) % 4))
}
export const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')

export async function sha256hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

// ---------- KEY ----------
// 25 ky tu Crockford base32 chia 5 nhom: 24 ky tu ngau nhien (120 bit) + 1 ky tu kiem tra (go sai 1 ky tu -> bao ngay).
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function checkChar(chars) {
  let s = 0
  for (let i = 0; i < chars.length; i++) s += ALPHA.indexOf(chars[i]) * (i + 1)
  return ALPHA[s % 32]
}

export function newKey() {
  const rnd = crypto.getRandomValues(new Uint8Array(24))
  const body = [...rnd].map((x) => ALPHA[x & 31]).join('')
  const all = body + checkChar(body)
  return all.match(/.{5}/g).join('-')
}

/** Chuan hoa key nguoi dung go (thuong/hoa, dau gach, O->0, I/L->1). Sai dinh dang / sai ky tu kiem tra -> null. */
export function normalizeKey(input) {
  if (typeof input !== 'string') return null
  const s = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (s.length !== 25 || [...s].some((c) => !ALPHA.includes(c))) return null
  if (checkChar(s.slice(0, 24)) !== s[24]) return null
  return s.match(/.{5}/g).join('-')
}

export const keyHash = (normKey) => sha256hex('agent-edit-key:' + normKey)

// ---------- Ma hoa key de trang quan tri xem lai (AES-GCM) ----------
async function aesKey(secretB64) {
  return crypto.subtle.importKey('raw', unb64(secretB64), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function encryptText(secretB64, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secretB64), enc.encode(text))
  return b64(iv) + '.' + b64(ct)
}
export async function decryptText(secretB64, packed) {
  const [iv, ct] = packed.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(secretB64), unb64(ct))
  return dec.decode(pt)
}

// ---------- Han dung ----------
/** Han dung tinh tu ngay kich hoat: thang = cung ngay thang sau, nam = cung ngay nam sau, vinh vien = null. */
export function addPlan(fromMs, plan, times = 1) {
  if (plan === 'lifetime') return null
  const d = new Date(fromMs)
  if (plan === 'month') d.setUTCMonth(d.getUTCMonth() + times)
  else d.setUTCFullYear(d.getUTCFullYear() + times)
  return d.getTime()
}

// ---------- Ma may ----------
// fp = {platform: 'darwin'|'win32', c: {ten_thanh_phan: bam_hex32}}. Cung may = cung he dieu hanh va
// khop >= min(2, so thanh phan da luu) thanh phan (Windows cai lai doi MachineGuid nhung bo mach van giu).
export function validFp(fp) {
  if (!fp || typeof fp !== 'object') return false
  if (fp.platform !== 'darwin' && fp.platform !== 'win32') return false
  if (!fp.c || typeof fp.c !== 'object') return false
  const ks = Object.keys(fp.c)
  if (ks.length > 8) return false
  return ks.every((k) => /^[a-z]+\.[a-z]+$/.test(k) && /^[0-9a-f]{32}$/.test(fp.c[k]))
}
export function fpMatch(stored, given) {
  if (!stored || !given || stored.platform !== given.platform) return false
  const ks = Object.keys(stored.c || {})
  if (!ks.length) return true // may khong doc duoc ma phan cung nao -> chi dua vao khoa thiet bi
  const m = ks.filter((k) => given.c && given.c[k] === stored.c[k]).length
  return m >= Math.min(2, ks.length)
}

// ---------- Chu ky ----------
export async function importDevicePub(rawB64) {
  const raw = unb64(rawB64)
  if (raw.length !== 32) throw new Error('bad device key')
  return crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify'])
}
export async function verifyDevice(pubKey, text, sigB64) {
  try {
    return await crypto.subtle.verify({ name: 'Ed25519' }, pubKey, unb64(sigB64), enc.encode(text))
  } catch {
    return false
  }
}

let signKeyCache = null
async function signKey(env) {
  if (!signKeyCache) {
    signKeyCache = await crypto.subtle.importKey('pkcs8', unb64(env.TICKET_SK), { name: 'Ed25519' }, false, ['sign'])
  }
  return signKeyCache
}
/** Ve = "v1.<payload base64url>.<chu ky Ed25519 base64url>". App + sidecar kiem bang khoa cong khai nhung san. */
export async function signTicket(env, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, await signKey(env), enc.encode('v1.' + body))
  return 'v1.' + body + '.' + b64url(sig)
}

// ---------- HMAC (token tai file kho) ----------
async function hmacKey(secretB64) {
  return crypto.subtle.importKey('raw', unb64(secretB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}
export async function hmacSign(secretB64, text) {
  return b64url(await crypto.subtle.sign('HMAC', await hmacKey(secretB64), enc.encode(text)))
}
export async function hmacVerify(secretB64, text, sigB64url) {
  try {
    return await crypto.subtle.verify('HMAC', await hmacKey(secretB64), unb64url(sigB64url), enc.encode(text))
  } catch {
    return false
  }
}

// ---------- Nho ----------
export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  })
}
export const clientIp = (req) => req.headers.get('cf-connecting-ip') || ''
export const clientCountry = (req) => (req.cf && req.cf.country) || ''
export function newId(prefix) {
  return prefix + hex(crypto.getRandomValues(new Uint8Array(9)))
}
export async function logEvent(env, licenseId, type, req, detail) {
  await env.DB.prepare('INSERT INTO events (license_id, at, type, ip, country, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(licenseId, Date.now(), type, req ? clientIp(req) : null, req ? clientCountry(req) : null, detail ? String(detail).slice(0, 500) : null)
    .run()
}
