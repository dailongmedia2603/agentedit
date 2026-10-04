// Worker TRANG QUAN TRI key. Dat sau Cloudflare Access (chi email ADMIN_EMAIL vao duoc); Worker tu kiem
// lai JWT cua Access (khong tin moi header) -> cau hinh Access sai cung khong lo trang.
import html from './admin.html'
import { newKey, normalizeKey, keyHash, encryptText, decryptText, addPlan, json, newId, logEvent, unb64url } from './shared.js'

// ---------- Cloudflare Access ----------
let jwksCache = { at: 0, keys: [] }
async function accessKeys(team) {
  if (Date.now() - jwksCache.at < 3600 * 1000 && jwksCache.keys.length) return jwksCache.keys
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`)
  const j = await r.json()
  jwksCache = { at: Date.now(), keys: j.keys || [] }
  return jwksCache.keys
}

async function verifyAccess(req, env) {
  const host = new URL(req.url).hostname
  if (env.DEV_NO_AUTH === '1' && (host === 'localhost' || host === '127.0.0.1')) return 'dev@localhost'
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) return null
  let token = req.headers.get('cf-access-jwt-assertion')
  if (!token) {
    const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/)
    token = m && m[1]
  }
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  let header, claims
  try {
    header = JSON.parse(new TextDecoder().decode(unb64url(parts[0])))
    claims = JSON.parse(new TextDecoder().decode(unb64url(parts[1])))
  } catch {
    return null
  }
  if (header.alg !== 'RS256') return null
  const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid)
  if (!jwk) return null
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    unb64url(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  )
  if (!ok) return null
  const now = Date.now() / 1000
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(env.ACCESS_AUD) || !claims.exp || claims.exp < now) return null
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null
  const email = String(claims.email || '').toLowerCase()
  const allowed = String(env.ADMIN_EMAIL).toLowerCase().split(',').map((s) => s.trim())
  return allowed.includes(email) ? email : null
}

// ---------- API ----------
const PLANS = ['month', 'year', 'lifetime']

function licenseRow(r) {
  let fp = null
  try {
    fp = r.fp ? JSON.parse(r.fp) : null
  } catch {
    /* bo qua */
  }
  return {
    id: r.id,
    key_hint: r.key_hint,
    plan: r.plan,
    status: r.status,
    customer: r.customer || '',
    contact: r.contact || '',
    note: r.note || '',
    created_at: r.created_at,
    activated_at: r.activated_at,
    expires_at: r.expires_at,
    bound: !!r.device_pub,
    platform: r.platform || (fp && fp.platform) || '',
    hostname: r.hostname || '',
    app_version: r.app_version || '',
    last_seen_at: r.last_seen_at,
    last_ip: r.last_ip || '',
    last_country: r.last_country || '',
    conflicts: r.conflicts || 0,
    locked_reason: r.locked_reason || ''
  }
}

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function listLicenses(env, url) {
  const q = str(url.searchParams.get('q') || '', 80)
  const status = url.searchParams.get('status') || ''
  const where = []
  const args = []
  if (q) {
    const norm = normalizeKey(q)
    if (norm) {
      where.push('key_hash = ?')
      args.push(await keyHash(norm))
    } else {
      where.push('(customer LIKE ? OR contact LIKE ? OR note LIKE ? OR key_hint LIKE ? OR hostname LIKE ? OR id = ?)')
      const like = `%${q}%`
      args.push(like, like, like, `%${q.toUpperCase().replace(/[^0-9A-Z]/g, '')}%`, like, q)
    }
  }
  if (status === 'active') where.push("status = 'active' AND (expires_at IS NULL OR expires_at > " + Date.now() + ')')
  else if (status === 'locked') where.push("status = 'locked'")
  else if (status === 'expired') where.push('expires_at IS NOT NULL AND expires_at <= ' + Date.now())
  else if (status === 'unused') where.push('device_pub IS NULL AND activated_at IS NULL')
  else if (status === 'conflict') where.push('conflicts > 0')
  const sql = `SELECT * FROM licenses ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`
  const rows = await env.DB.prepare(sql).bind(...args).all()
  return (rows.results || []).map(licenseRow)
}

async function stats(env) {
  const now = Date.now()
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN device_pub IS NOT NULL AND status = 'active' AND (expires_at IS NULL OR expires_at > ?1) THEN 1 ELSE 0 END) AS in_use,
       SUM(CASE WHEN device_pub IS NULL AND activated_at IS NULL THEN 1 ELSE 0 END) AS unused,
       SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END) AS locked,
       SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= ?1 THEN 1 ELSE 0 END) AS expired,
       SUM(CASE WHEN conflicts > 0 THEN 1 ELSE 0 END) AS conflict
     FROM licenses`
  )
    .bind(now)
    .first()
  return r
}

async function createLicenses(env, req, admin, b) {
  const plan = PLANS.includes(b.plan) ? b.plan : null
  if (!plan) return json({ ok: false, error: 'Gói không hợp lệ' }, 400)
  const count = Math.max(1, Math.min(100, Number(b.count) || 1))
  const out = []
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const key = newKey()
    const id = newId('L')
    await env.DB.prepare(
      `INSERT INTO licenses (id, key_hash, key_enc, key_hint, plan, status, customer, contact, note, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
    )
      .bind(id, await keyHash(key), await encryptText(env.KEY_ENC_SECRET, key), key.slice(-5), plan, str(b.customer), str(b.contact), str(b.note, 1000), now)
      .run()
    await logEvent(env, id, 'admin_create', req, `${admin}: gói ${plan}`)
    out.push({ id, key, plan })
  }
  return json({ ok: true, created: out })
}

async function licenseDetail(env, id) {
  const r = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?').bind(id).first()
  if (!r) return json({ ok: false, error: 'Không tìm thấy key' }, 404)
  const ev = await env.DB.prepare('SELECT at, type, ip, country, detail FROM events WHERE license_id = ? ORDER BY at DESC LIMIT 200')
    .bind(id)
    .all()
  let key = ''
  try {
    key = await decryptText(env.KEY_ENC_SECRET, r.key_enc)
  } catch {
    key = '(không giải mã được)'
  }
  return json({ ok: true, license: { ...licenseRow(r), key }, events: ev.results || [] })
}

async function licenseAction(env, req, admin, id, action, b) {
  const r = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?').bind(id).first()
  if (!r) return json({ ok: false, error: 'Không tìm thấy key' }, 404)
  const run = (sql, ...a) => env.DB.prepare(sql).bind(...a).run()
  if (action === 'lock') {
    const reason = str(b.reason, 300) || 'Khoá bởi quản trị'
    await run("UPDATE licenses SET status = 'locked', locked_reason = ? WHERE id = ?", reason, id)
    await logEvent(env, id, 'admin_lock', req, `${admin}: ${reason}`)
  } else if (action === 'unlock') {
    await run("UPDATE licenses SET status = 'active', locked_reason = NULL WHERE id = ?", id)
    await logEvent(env, id, 'admin_unlock', req, admin)
  } else if (action === 'reset') {
    // Go key khoi may dang gan (khach doi may / thay phan cung). Han dung giu nguyen.
    await run(
      'UPDATE licenses SET device_pub = NULL, fp = NULL, platform = NULL, hostname = NULL, app_version = NULL, conflicts = 0 WHERE id = ?',
      id
    )
    await logEvent(env, id, 'admin_reset', req, `${admin}: gỡ máy ${r.platform || ''} ${r.hostname || ''}`)
  } else if (action === 'extend') {
    // Gia han them 1 ky cua goi (hoac doi goi roi gia han). Tinh tu han cu neu con, het roi thi tu hom nay.
    const plan = PLANS.includes(b.plan) ? b.plan : r.plan
    const times = Math.max(1, Math.min(10, Number(b.times) || 1))
    const now = Date.now()
    const from = r.expires_at && r.expires_at > now ? r.expires_at : now
    const exp = plan === 'lifetime' ? null : r.activated_at || r.expires_at ? addPlan(from, plan, times) : null
    await run('UPDATE licenses SET plan = ?, expires_at = ? WHERE id = ?', plan, exp, id)
    await logEvent(env, id, 'admin_extend', req, `${admin}: gói ${plan} x${times} → ${exp ? new Date(exp).toISOString().slice(0, 10) : 'không hạn / tính từ lúc kích hoạt'}`)
  } else if (action === 'set_expiry') {
    const exp = b.expires_at === null ? null : Number(b.expires_at)
    if (exp !== null && !(exp > 0)) return json({ ok: false, error: 'Ngày không hợp lệ' }, 400)
    await run('UPDATE licenses SET expires_at = ? WHERE id = ?', exp, id)
    await logEvent(env, id, 'admin_set_expiry', req, `${admin}: ${exp ? new Date(exp).toISOString().slice(0, 10) : 'không hạn'}`)
  } else if (action === 'update') {
    await run('UPDATE licenses SET customer = ?, contact = ?, note = ? WHERE id = ?', str(b.customer), str(b.contact), str(b.note, 1000), id)
    await logEvent(env, id, 'admin_update', req, admin)
  } else if (action === 'delete') {
    // Chi xoa key CHUA tung kich hoat (tao nham). Key da ban thi khoa, khong xoa (giu lich su).
    if (r.activated_at || r.device_pub) return json({ ok: false, error: 'Key đã kích hoạt — hãy khoá thay vì xoá.' }, 400)
    await run('DELETE FROM licenses WHERE id = ?', id)
    await run('DELETE FROM events WHERE license_id = ?', id)
    return json({ ok: true, deleted: true })
  } else {
    return json({ ok: false, error: 'Thao tác không hợp lệ' }, 400)
  }
  return licenseDetail(env, id)
}

async function recentEvents(env) {
  const r = await env.DB.prepare(
    `SELECT e.at, e.type, e.ip, e.country, e.detail, e.license_id, l.key_hint, l.customer
     FROM events e LEFT JOIN licenses l ON l.id = e.license_id ORDER BY e.at DESC LIMIT 200`
  ).all()
  return r.results || []
}

const SEC_HEADERS = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const admin = await verifyAccess(req, env)
    if (!admin) {
      return new Response('Không có quyền truy cập. Đăng nhập Cloudflare Access bằng email quản trị.', {
        status: 403,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      })
    }
    try {
      if (url.pathname === '/' && req.method === 'GET') {
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS } })
      }
      if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })
      // Chong CSRF: moi lenh API phai co header rieng (form / trang khac khong gui duoc khi khong co CORS)
      if (req.headers.get('x-admin') !== '1') return json({ ok: false, error: 'forbidden' }, 403)
      const b = req.method === 'POST' ? await req.json().catch(() => ({})) : {}

      if (url.pathname === '/api/me') return json({ ok: true, email: admin })
      if (url.pathname === '/api/stats') return json({ ok: true, stats: await stats(env) })
      if (url.pathname === '/api/events') return json({ ok: true, events: await recentEvents(env) })
      if (url.pathname === '/api/licenses' && req.method === 'GET') return json({ ok: true, licenses: await listLicenses(env, url) })
      if (url.pathname === '/api/licenses' && req.method === 'POST') return await createLicenses(env, req, admin, b)
      const m = url.pathname.match(/^\/api\/licenses\/(L[0-9a-f]+)(?:\/([a-z_]+))?$/)
      if (m && !m[2] && req.method === 'GET') return await licenseDetail(env, m[1])
      if (m && m[2] && req.method === 'POST') return await licenseAction(env, req, admin, m[1], m[2], b)
      return json({ ok: false, error: 'not found' }, 404)
    } catch (e) {
      console.error('admin error', e && e.stack ? e.stack : e)
      return json({ ok: false, error: 'Lỗi máy chủ: ' + String(e && e.message ? e.message : e).slice(0, 200) }, 500)
    }
  }
}
