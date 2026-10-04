// Worker CONG KHAI cho app Agent Edit: kich hoat key, kiem key, cap ve, phat kho SFX + Meme.
//
// Moi yeu cau tu app = {p: "<JSON>", s: "<chu ky Ed25519 cua khoa thiet bi tren chuoi p>"}.
// Khoa thiet bi sinh tren may khach luc kich hoat, giu bang safeStorage (Keychain / DPAPI) -> copy
// thu muc app sang may khac khong dung duoc. 1 key gan DUNG 1 may; chi trang quan tri moi reset.
import {
  normalizeKey,
  keyHash,
  validFp,
  fpMatch,
  importDevicePub,
  verifyDevice,
  signTicket,
  hmacSign,
  hmacVerify,
  addPlan,
  sha256hex,
  json,
  clientIp,
  clientCountry,
  logEvent
} from './shared.js'

const CLOCK_SKEW_MS = 10 * 60 * 1000 // gio may khach lech qua 10 phut -> bao gio server de app tu bu
const TICKET_TTL_MS = 3 * 24 * 3600 * 1000 // ve cho sidecar; app lay ve moi moi lan mo + moi lan phan tich
const DL_TTL_MS = 2 * 3600 * 1000 // link tai file kho
const THROTTLE_WINDOW_MS = 3600 * 1000
const THROTTLE_MAX_FAILS = 20 // nhap sai key 20 lan / gio / IP -> chan
const REKEY_LIMIT = 3 // kich hoat lai (cung may, khoa thiet bi moi) >= 3 lan / 7 ngay -> tu khoa
const REKEY_WINDOW_MS = 7 * 24 * 3600 * 1000

const MSG = {
  bad_request: 'Yêu cầu không hợp lệ.',
  bad_signature: 'Chữ ký thiết bị không hợp lệ.',
  clock: 'Giờ trên máy bị lệch.',
  invalid_key: 'Key không đúng.',
  throttled: 'Nhập sai key quá nhiều lần. Thử lại sau 1 giờ.',
  locked: 'Key đã bị khoá. Liên hệ người bán để được hỗ trợ.',
  expired: 'Key đã hết hạn. Liên hệ người bán để gia hạn.',
  not_activated: 'Key chưa được kích hoạt trên máy này.',
  other_machine: 'Key này đã được kích hoạt trên một máy khác. Mỗi key chỉ dùng cho 1 máy.',
  no_library: 'Kho chưa sẵn sàng trên máy chủ.',
  server: 'Máy chủ bản quyền gặp lỗi. Thử lại sau.'
}

function fail(code, extra = {}, status = 200) {
  return json({ ok: false, code, message: MSG[code] || code, server_time: Date.now(), ...extra }, status)
}

async function throttled(env, ip) {
  if (!ip) return false
  const row = await env.DB.prepare('SELECT window_start, fails FROM throttle WHERE ip = ?').bind(ip).first()
  return !!row && Date.now() - row.window_start < THROTTLE_WINDOW_MS && row.fails >= THROTTLE_MAX_FAILS
}
async function addFail(env, ip) {
  if (!ip) return
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO throttle (ip, window_start, fails) VALUES (?1, ?2, 1)
     ON CONFLICT(ip) DO UPDATE SET
       fails = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE fails + 1 END,
       window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END`
  )
    .bind(ip, now, THROTTLE_WINDOW_MS)
    .run()
}

async function ticketFor(env, lic, fp, devPub) {
  const now = Date.now()
  return signTicket(env, {
    v: 1,
    lid: lic.id,
    plan: lic.plan,
    exp: lic.expires_at ?? null,
    iat: now,
    until: now + TICKET_TTL_MS,
    fp,
    dev: (await sha256hex(devPub)).slice(0, 32)
  })
}

function publicLicense(lic) {
  return {
    plan: lic.plan,
    expires_at: lic.expires_at ?? null,
    activated_at: lic.activated_at ?? null,
    key_hint: lic.key_hint,
    customer: lic.customer || ''
  }
}

async function handleLicense(req, env) {
  let body
  try {
    body = await req.json()
  } catch {
    return fail('bad_request', {}, 400)
  }
  if (!body || typeof body.p !== 'string' || typeof body.s !== 'string' || body.p.length > 8000) {
    return fail('bad_request', {}, 400)
  }
  let p
  try {
    p = JSON.parse(body.p)
  } catch {
    return fail('bad_request', {}, 400)
  }
  const op = p.op
  if (!['activate', 'check', 'library'].includes(op) || typeof p.dev !== 'string' || !validFp(p.fp)) {
    return fail('bad_request', {}, 400)
  }
  const ip = clientIp(req)
  if (await throttled(env, ip)) return fail('throttled')

  // Chu ky: chung minh may nay giu khoa bi mat cua khoa thiet bi p.dev
  let devKey
  try {
    devKey = await importDevicePub(p.dev)
  } catch {
    return fail('bad_request', {}, 400)
  }
  if (!(await verifyDevice(devKey, body.p, body.s))) return fail('bad_signature')
  const now = Date.now()
  if (typeof p.ts !== 'number' || Math.abs(now - p.ts) > CLOCK_SKEW_MS) return fail('clock')

  const norm = normalizeKey(p.key)
  if (!norm) {
    await addFail(env, ip)
    return fail('invalid_key')
  }
  const lic = await env.DB.prepare('SELECT * FROM licenses WHERE key_hash = ?').bind(await keyHash(norm)).first()
  if (!lic) {
    await addFail(env, ip)
    return fail('invalid_key')
  }
  const host = typeof p.host === 'string' ? p.host.slice(0, 80) : ''
  const appVer = typeof p.app === 'string' ? p.app.slice(0, 40) : ''
  const who = `${p.fp.platform} ${host} v${appVer}`.trim()

  if (lic.status !== 'active') {
    await logEvent(env, lic.id, 'reject_locked', req, who)
    return fail('locked')
  }
  if (lic.expires_at && now > lic.expires_at) {
    await logEvent(env, lic.id, 'reject_expired', req, who)
    return fail('expired', { expires_at: lic.expires_at })
  }

  const storedFp = lic.fp ? JSON.parse(lic.fp) : null
  let event = op
  let detail = who + (p.reason ? ` (${String(p.reason).slice(0, 20)})` : '')

  if (!lic.device_pub) {
    // Key chua gan may nao: chi lenh kich hoat moi duoc gan
    if (op !== 'activate') return fail('not_activated')
    lic.activated_at = lic.activated_at || now
    if (!lic.expires_at) lic.expires_at = addPlan(lic.activated_at, lic.plan)
    if (lic.expires_at && now > lic.expires_at) return fail('expired', { expires_at: lic.expires_at })
    lic.device_pub = p.dev
    lic.fp = JSON.stringify(p.fp)
    event = 'activate_new'
  } else if (lic.device_pub === p.dev) {
    // Dung khoa thiet bi nhung phan cung khac han -> khoa bi lay ra dem sang may khac
    if (!fpMatch(storedFp, p.fp)) {
      await env.DB.prepare('UPDATE licenses SET conflicts = conflicts + 1 WHERE id = ?').bind(lic.id).run()
      await logEvent(env, lic.id, 'other_machine', req, 'cung khoa thiet bi, khac phan cung: ' + who)
      return fail('other_machine')
    }
  } else if (op === 'activate' && fpMatch(storedFp, p.fp) && Object.keys(storedFp?.c || {}).length) {
    // Cung may (cai lai app / cai lai Windows -> mat khoa thiet bi cu) -> nhan khoa thiet bi moi
    const since = now - REKEY_WINDOW_MS
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE license_id = ? AND type = 'rekey' AND at > ?")
      .bind(lic.id, since)
      .first()
    if ((n?.n || 0) + 1 >= REKEY_LIMIT) {
      const reason = 'Tự khoá: key bị kích hoạt lại quá nhiều lần trong 7 ngày (nghi chia sẻ)'
      await env.DB.prepare("UPDATE licenses SET status = 'locked', locked_reason = ? WHERE id = ?").bind(reason, lic.id).run()
      await logEvent(env, lic.id, 'auto_lock', req, reason + ' — ' + who)
      return fail('locked')
    }
    lic.device_pub = p.dev
    lic.fp = JSON.stringify(p.fp) // giu ma moi nhat (vd MachineGuid sau khi cai lai Windows)
    event = 'rekey'
  } else {
    await env.DB.prepare('UPDATE licenses SET conflicts = conflicts + 1 WHERE id = ?').bind(lic.id).run()
    await logEvent(env, lic.id, 'other_machine', req, who)
    return fail('other_machine')
  }

  await env.DB.prepare(
    `UPDATE licenses SET activated_at = ?, expires_at = ?, device_pub = ?, fp = ?, platform = ?, hostname = ?,
       app_version = ?, last_seen_at = ?, last_ip = ?, last_country = ? WHERE id = ?`
  )
    .bind(lic.activated_at, lic.expires_at ?? null, lic.device_pub, lic.fp, p.fp.platform, host, appVer, now, ip, clientCountry(req), lic.id)
    .run()

  const boundFp = JSON.parse(lic.fp)
  const out = {
    ok: true,
    server_time: now,
    license: publicLicense(lic),
    ticket: await ticketFor(env, lic, boundFp, lic.device_pub)
  }

  if (op === 'library') {
    const obj = await env.LIB.get('library-manifest.json')
    if (!obj) return fail('no_library')
    const manifest = await obj.json()
    const exp = now + DL_TTL_MS
    const t = `${lic.id}.${exp}`
    const token = t + '.' + (await hmacSign(env.DL_SECRET, t))
    const base = new URL(req.url).origin
    const withUrl = (rows, kind) =>
      (Array.isArray(rows) ? rows : []).map((m) => ({
        ...m,
        url: `${base}/v1/lib/${kind}/${encodeURIComponent(String(m.file || '').split('/').pop())}?t=${encodeURIComponent(token)}`
      }))
    out.manifest = { ...manifest, sfx: withUrl(manifest.sfx, 'sfx'), memes: withUrl(manifest.memes, 'memes') }
    detail += ` — ${out.manifest.sfx.length} SFX, ${out.manifest.memes.length} meme`
  }
  await logEvent(env, lic.id, event, req, detail)
  return json(out)
}

async function handleDownload(req, env, kind, rawName) {
  const t = new URL(req.url).searchParams.get('t') || ''
  const [lid, expStr, sig] = t.split('.')
  const exp = Number(expStr)
  if (!lid || !exp || !sig || Date.now() > exp || !(await hmacVerify(env.DL_SECRET, `${lid}.${expStr}`, sig))) {
    return new Response('forbidden', { status: 403 })
  }
  // Key bi khoa giua chung -> dung tai ngay
  const lic = await env.DB.prepare('SELECT status, expires_at FROM licenses WHERE id = ?').bind(lid).first()
  if (!lic || lic.status !== 'active' || (lic.expires_at && Date.now() > lic.expires_at)) {
    return new Response('forbidden', { status: 403 })
  }
  let name
  try {
    name = decodeURIComponent(rawName)
  } catch {
    return new Response('bad name', { status: 400 })
  }
  if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    return new Response('bad name', { status: 400 })
  }
  const obj = await env.LIB.get(`${kind}/${name}`)
  if (!obj) return new Response('not found', { status: 404 })
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('content-length', String(obj.size))
  headers.set('cache-control', 'private, no-store')
  return new Response(obj.body, { headers })
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    try {
      if (url.pathname === '/v1/license' && req.method === 'POST') return await handleLicense(req, env)
      const m = url.pathname.match(/^\/v1\/lib\/(sfx|memes)\/([^/]+)$/)
      if (m && req.method === 'GET') return await handleDownload(req, env, m[1], m[2])
      if (url.pathname === '/v1/time') return json({ ok: true, server_time: Date.now() })
      return new Response('Not found', { status: 404 })
    } catch (e) {
      console.error('license api error', e && e.stack ? e.stack : e)
      return fail('server', {}, 500)
    }
  }
}
