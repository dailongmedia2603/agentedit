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
import { FX_ID_RE, FX_FILES, FX_MAX_CODE, FX_MAX_PREVIEW, FX_MAX_META, FX_DAILY_LIMIT, sha256bytes, fxIdOf, cleanMeta } from './fx.js'

const CLOCK_SKEW_MS = 10 * 60 * 1000 // gio may khach lech qua 10 phut -> bao gio server de app tu bu
const TICKET_TTL_MS = 3 * 24 * 3600 * 1000 // ve cho sidecar; app lay ve moi moi lan mo + moi lan phan tich
const DL_TTL_MS = 2 * 3600 * 1000 // link tai file kho
const THROTTLE_WINDOW_MS = 3600 * 1000
const THROTTLE_MAX_FAILS = 20 // nhap sai key 20 lan / gio / IP -> chan
const REKEY_LIMIT = 3 // kich hoat lai (cung may, khoa thiet bi moi) >= 3 lan / 7 ngay -> tu khoa
const REKEY_WINDOW_MS = 7 * 24 * 3600 * 1000
const UPD_TTL_MS = 24 * 3600 * 1000 // link tai ban cap nhat (~300 MB, mang cham tai tiep duoc trong 1 ngay)
const UPD_CHANNELS = ['stable', 'test']

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
  fx_bad: 'Gói hiệu ứng không hợp lệ.',
  fx_limit: 'Đã gửi quá nhiều hiệu ứng hôm nay — thử lại ngày mai.',
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
  if (!['activate', 'check', 'library', 'update'].includes(op) || typeof p.dev !== 'string' || !validFp(p.fp)) {
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

  // TU CAP NHAT: app ban cai cho khach gui kem p.upd {arch, build, channel} o lan kiem luc mo app / phan tich video
  // (khong hoi them dinh ky) + nut "Kiem tra cap nhat" (op=update). App cu khong gui p.upd -> khong co truong update.
  if ((op === 'check' || op === 'update') && p.upd && typeof p.upd === 'object') {
    out.update = await updateOffer(req, env, lic, p, appVer)
    if (out.update) detail += ` — co ban moi ${out.update.version} (${out.update.build})`
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
    // Kho Text: 1 mau = 1 thu muc nhieu file -> moi file 1 link tai tam (cung token)
    // Mau co minApp (can renderer moi, vd LE VIP2 02-20 can 1.2.0) -> CHI gui cho app >= minApp (app cu ve sai / loi)
    const verOf = (v) => (String(v || '0').match(/\d+/g) || ['0']).slice(0, 3).map(Number)
    const verGe = (a, b) => {
      const x = verOf(a)
      const y = verOf(b)
      for (let i = 0; i < 3; i++) {
        if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
      }
      return true
    }
    const withTextUrls = (rows) =>
      (Array.isArray(rows) ? rows : [])
        .filter((m) => safeSeg(String(m.id || '')))
        .filter((m) => !m.minApp || verGe(appVer, m.minApp))
        .map((m) => ({
          ...m,
          files: (Array.isArray(m.files) ? m.files : [])
            .filter((f) => safeRel(String(f.path || '')))
            .map((f) => ({
              ...f,
              url: `${base}/v1/lib/texts/${encodeURIComponent(m.id)}/${String(f.path).split('/').map(encodeURIComponent).join('/')}?t=${encodeURIComponent(token)}`
            }))
        }))
    // Kho hieu ung chung: lay tu D1 (muc DA DUYET), khong nam trong library-manifest.json -> publish-library.mjs
    // (sfx/memes/texts) va may gui hieu ung khong ghi de len nhau
    const fxRows = await env.DB.prepare(
      "SELECT id, meta, code_sha, preview_sha, code_size, preview_size FROM fx_items WHERE status = 'approved' ORDER BY decided_at LIMIT 3000"
    ).all()
    const fxUrl = (id, f) => `${base}/v1/lib/fx/${id}/${f}?t=${encodeURIComponent(token)}`
    const fx = (fxRows.results || []).map((r) => {
      let meta = {}
      try {
        meta = JSON.parse(r.meta)
      } catch {
        /* bo qua */
      }
      return {
        ...meta,
        id: r.id,
        code_sha: r.code_sha,
        files: [
          { path: 'code.js', sha256: r.code_sha, size: r.code_size, url: fxUrl(r.id, 'code.js') },
          { path: 'preview.mp4', sha256: r.preview_sha, size: r.preview_size, url: fxUrl(r.id, 'preview.mp4') }
        ]
      }
    })
    out.manifest = {
      ...manifest,
      sfx: withUrl(manifest.sfx, 'sfx'),
      memes: withUrl(manifest.memes, 'memes'),
      texts: withTextUrls(manifest.texts),
      music: withUrl(manifest.music, 'music'),
      fx
    }
    detail += ` — ${out.manifest.sfx.length} SFX, ${out.manifest.memes.length} meme, ${out.manifest.texts.length} mau chu, ${out.manifest.music.length} nhac nen, ${fx.length} hieu ung`
  }
  await logEvent(env, lic.id, event, req, detail)
  return json(out)
}

// ---------------------------------------------------------------------------
// TU CAP NHAT APP. R2: updates/<kenh>/<darwin|win32>-<arm64|x64>.json = {m: "<JSON phieu>", sig} (scripts/publish-update.mjs
// cua app tao + KY bang khoa rieng — Worker KHONG giu khoa ky, chi chuyen tiep; app tu kiem chu ky), file o updates/files/.
// ---------------------------------------------------------------------------
const verNums = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0]
}
/** (aV, aB) moi hon (bV, bB)? So version truoc, bang nhau thi so ma build ngay-gio (sai dang = cu nhat). Giong update-core.ts. */
function releaseNewer(aV, aB, bV, bB) {
  const a = verNums(aV)
  const b = verNums(bV)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  const re = /^\d{8}-\d{4}$/
  const ab = re.test(aB || '') ? aB : ''
  const bb = re.test(bB || '') ? bB : ''
  return ab > bb
}
const UPD_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/

async function updateOffer(req, env, lic, p, appVer) {
  const arch = p.upd.arch === 'arm64' || p.upd.arch === 'x64' ? p.upd.arch : null
  const channel = UPD_CHANNELS.includes(p.upd.channel) ? p.upd.channel : 'stable'
  if (!arch) return null
  const obj = await env.LIB.get(`updates/${channel}/${p.fp.platform}-${arch}.json`)
  if (!obj) return null
  let rec
  let m
  try {
    rec = await obj.json()
    m = JSON.parse(rec.m)
  } catch {
    return null
  }
  if (!m || typeof rec.sig !== 'string' || !UPD_FILE_RE.test(String(m.file || '')) || m.file.includes('..')) return null
  if (!releaseNewer(m.version, m.build, appVer, String(p.upd.build || ''))) return null
  const exp = Date.now() + UPD_TTL_MS
  const t = `${lic.id}.${exp}`
  // tien to 'upd.' -> token tai kho (sfx/meme...) khong dung duoc cho file cap nhat va nguoc lai
  const token = t + '.' + (await hmacSign(env.DL_SECRET, 'upd.' + t))
  return {
    m: rec.m,
    sig: rec.sig,
    url: `${new URL(req.url).origin}/v1/update/${encodeURIComponent(m.file)}?t=${encodeURIComponent(token)}`,
    version: m.version,
    build: m.build
  }
}

/** Tai file cap nhat (link tam tu updateOffer). Ho tro Range "bytes=N-" / "bytes=N-M" -> app tai tiep khi rot mang. */
async function handleUpdateDownload(req, env, rawName) {
  const t = new URL(req.url).searchParams.get('t') || ''
  const [lid, expStr, sig] = t.split('.')
  const exp = Number(expStr)
  if (!lid || !exp || !sig || Date.now() > exp || !(await hmacVerify(env.DL_SECRET, `upd.${lid}.${expStr}`, sig))) {
    return new Response('forbidden', { status: 403 })
  }
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
  if (!UPD_FILE_RE.test(name) || name.includes('..')) return new Response('bad name', { status: 400 })
  const key = `updates/files/${name}`
  const base = { 'accept-ranges': 'bytes', 'cache-control': 'private, no-store', 'content-type': 'application/octet-stream' }
  const rh = req.headers.get('range')
  if (rh) {
    const mr = /^bytes=(\d+)-(\d*)$/.exec(rh.trim())
    const head = await env.LIB.head(key)
    if (!head) return new Response('not found', { status: 404 })
    if (!mr) return new Response('bad range', { status: 416, headers: { ...base, 'content-range': `bytes */${head.size}` } })
    const offset = Number(mr[1])
    const end = mr[2] ? Math.min(Number(mr[2]), head.size - 1) : head.size - 1
    if (offset >= head.size || end < offset) {
      return new Response('bad range', { status: 416, headers: { ...base, 'content-range': `bytes */${head.size}` } })
    }
    const length = end - offset + 1
    const obj = await env.LIB.get(key, { range: { offset, length } })
    if (!obj) return new Response('not found', { status: 404 })
    return new Response(obj.body, {
      status: 206,
      headers: { ...base, 'content-length': String(length), 'content-range': `bytes ${offset}-${end}/${head.size}`, etag: obj.httpEtag }
    })
  }
  const obj = await env.LIB.get(key)
  if (!obj) return new Response('not found', { status: 404 })
  return new Response(obj.body, { headers: { ...base, 'content-length': String(obj.size), etag: obj.httpEtag } })
}

/** 1 doan ten an toan (khong /, \\, ., ..) */
function safeSeg(x) {
  return !!x && !x.includes('/') && !x.includes('\\') && x !== '.' && x !== '..'
}
/** duong dan tuong doi an toan cho file trong thu muc mau chu (vd fonts/a.ttf) */
function safeRel(x) {
  if (!x || x.startsWith('/') || x.includes('\\')) return false
  return x.split('/').every(safeSeg)
}

/**
 * May khach GUI 1 hieu ung tu viet vao kho chung. multipart: p (JSON ky), s (chu ky khoa thiet bi), meta (JSON),
 * code (chuoi), preview (mp4). p = {op:'fx_upload', key, dev, fp, ts, id, meta_sha, code_sha, preview_sha}.
 * Key phai dang dung duoc + DUNG may da gan (khong kich hoat moi o day). May trong trusted_licenses -> tu duyet.
 * Gui lai muc da co -> tra trang thai hien tai (khong ghi de file / meta cua muc da duyet).
 */
async function handleFxUpload(req, env) {
  const len = Number(req.headers.get('content-length') || 0)
  if (!len || len > FX_MAX_PREVIEW + FX_MAX_CODE * 4 + FX_MAX_META * 4 + 64 * 1024) return fail('fx_bad', {}, 413)
  let form
  try {
    form = await req.formData()
  } catch {
    return fail('bad_request', {}, 400)
  }
  const rawP = form.get('p')
  const sig = form.get('s')
  if (typeof rawP !== 'string' || typeof sig !== 'string' || rawP.length > 8000) return fail('bad_request', {}, 400)
  let p
  try {
    p = JSON.parse(rawP)
  } catch {
    return fail('bad_request', {}, 400)
  }
  if (p.op !== 'fx_upload' || typeof p.dev !== 'string' || !validFp(p.fp) || !FX_ID_RE.test(String(p.id || ''))) {
    return fail('bad_request', {}, 400)
  }
  const ip = clientIp(req)
  if (await throttled(env, ip)) return fail('throttled')
  let devKey
  try {
    devKey = await importDevicePub(p.dev)
  } catch {
    return fail('bad_request', {}, 400)
  }
  if (!(await verifyDevice(devKey, rawP, sig))) return fail('bad_signature')
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
  if (lic.status !== 'active') return fail('locked')
  if (lic.expires_at && now > lic.expires_at) return fail('expired', { expires_at: lic.expires_at })
  if (!lic.device_pub) return fail('not_activated')
  if (lic.device_pub !== p.dev || !fpMatch(lic.fp ? JSON.parse(lic.fp) : null, p.fp)) return fail('other_machine')

  // meta / code: app moi gui dang FILE (byte giu nguyen); app 20261005-1100 gui dang CHUOI -> multipart/form-data
  // (chuan HTML) doi moi "\n" thanh "\r\n" -> sha lech voi chu ky -> doi lai "\r\n" -> "\n" roi moi kiem (chu ky phu
  // ban GOC nen van chan duoc moi sua doi khac)
  const asText = async (v) => (typeof v === 'string' ? v : v && typeof v.text === 'function' && v.size <= FX_MAX_META * 4 ? await v.text() : null)
  const metaRaw = await asText(form.get('meta'))
  const codeRaw = await asText(form.get('code'))
  const preview = form.get('preview')
  if (typeof metaRaw !== 'string' || metaRaw.length > FX_MAX_META || typeof codeRaw !== 'string' || !codeRaw.trim() || codeRaw.length > FX_MAX_CODE * 1.2) {
    return fail('fx_bad', { why: 'meta/code' })
  }
  if (!preview || typeof preview === 'string' || !preview.size || preview.size > FX_MAX_PREVIEW) return fail('fx_bad', { why: 'preview' })
  const enc = new TextEncoder()
  const pick = async (raw, want) => {
    if ((await sha256bytes(enc.encode(raw))) === want) return raw
    const lf = raw.replace(/\r\n/g, '\n')
    return lf !== raw && (await sha256bytes(enc.encode(lf))) === want ? lf : null
  }
  const meta = await pick(metaRaw, p.meta_sha)
  const code = await pick(codeRaw, p.code_sha)
  const prevBuf = await preview.arrayBuffer()
  const prevSha = await sha256bytes(prevBuf)
  // chu ky phu ca 3 phan (khong ai chen code / preview khac vao goi da ky)
  if (meta === null || code === null || prevSha !== p.preview_sha) {
    return fail('fx_bad', { why: meta === null ? 'sha_meta' : code === null ? 'sha_code' : 'sha_preview' })
  }
  if (code.length > FX_MAX_CODE) return fail('fx_bad', { why: 'meta/code' })
  const codeBuf = enc.encode(code)
  const codeSha = p.code_sha
  let m
  try {
    m = JSON.parse(meta)
  } catch {
    return fail('fx_bad', { why: 'meta' })
  }
  const kind = m?.kind === 'transform' ? 'transform' : m?.kind === 'overlay' ? 'overlay' : null
  if (!kind || m.id !== p.id || (await fxIdOf(kind, code)) !== p.id) return fail('fx_bad', { why: 'id' })

  const have = await env.DB.prepare('SELECT status FROM fx_items WHERE id = ?').bind(p.id).first()
  if (have) return json({ ok: true, status: have.status, existed: true })
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM fx_items WHERE license_id = ? AND created_at > ?')
    .bind(lic.id, now - 24 * 3600 * 1000)
    .first()
  if ((n?.n || 0) >= FX_DAILY_LIMIT) return fail('fx_limit')
  const trusted = await env.DB.prepare('SELECT 1 AS t FROM trusted_licenses WHERE license_id = ?').bind(lic.id).first()
  const status = trusted ? 'approved' : 'pending'
  const clean = cleanMeta(m, p.id, kind)
  await env.LIB.put(`fx/${p.id}/code.js`, codeBuf, { httpMetadata: { contentType: 'text/javascript; charset=utf-8' } })
  await env.LIB.put(`fx/${p.id}/preview.mp4`, prevBuf, { httpMetadata: { contentType: 'video/mp4' } })
  await env.DB.prepare(
    `INSERT INTO fx_items (id, license_id, status, kind, meta, code_sha, preview_sha, code_size, preview_size, created_at, decided_at, decided_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(p.id, lic.id, status, kind, JSON.stringify(clean), codeSha, prevSha, codeBuf.length, prevBuf.byteLength, now,
      trusted ? now : null, trusted ? 'tu duyet (may tin cay)' : null)
    .run()
  await logEvent(env, lic.id, 'fx_upload', req, `${p.id} ${clean.label.name || ''} -> ${status}`)
  return json({ ok: true, status })
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
  if (kind === 'texts' || kind === 'fx' ? !safeRel(name) || name.split('/').length < 2 : !safeSeg(name)) {
    return new Response('bad name', { status: 400 })
  }
  if (kind === 'fx') {
    // fx/<id>/<code.js|preview.mp4> va CHI muc da duyet (muc cho duyet / bi tu choi khong tai duoc)
    const [fid, f, ...rest] = name.split('/')
    if (rest.length || !FX_ID_RE.test(fid) || !FX_FILES.includes(f)) return new Response('bad name', { status: 400 })
    const row = await env.DB.prepare("SELECT status FROM fx_items WHERE id = ?").bind(fid).first()
    if (!row || row.status !== 'approved') return new Response('not found', { status: 404 })
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
      const m = url.pathname.match(/^\/v1\/lib\/(sfx|memes|music)\/([^/]+)$/)
      if (m && req.method === 'GET') return await handleDownload(req, env, m[1], m[2])
      // Kho Text: /v1/lib/texts/<id>/<duong dan tuong doi> — giai ma TUNG doan roi kiem an toan
      const mt = url.pathname.match(/^\/v1\/lib\/texts\/(.+)$/)
      if (mt && req.method === 'GET') {
        let rel
        try {
          rel = mt[1].split('/').map(decodeURIComponent).join('/')
        } catch {
          return new Response('bad name', { status: 400 })
        }
        return await handleDownload(req, env, 'texts', encodeURIComponent(rel))
      }
      // Kho hieu ung: /v1/lib/fx/<id>/<file>
      const mf = url.pathname.match(/^\/v1\/lib\/fx\/(fx-[0-9a-f]{12})\/(code\.js|preview\.mp4)$/)
      if (mf && req.method === 'GET') return await handleDownload(req, env, 'fx', encodeURIComponent(`${mf[1]}/${mf[2]}`))
      if (url.pathname === '/v1/fx/upload' && req.method === 'POST') return await handleFxUpload(req, env)
      // File cap nhat app: /v1/update/<ten file>?t=<token 24h>
      const mu = url.pathname.match(/^\/v1\/update\/([^/]+)$/)
      if (mu && (req.method === 'GET' || req.method === 'HEAD')) return await handleUpdateDownload(req, env, mu[1])
      if (url.pathname === '/v1/time') return json({ ok: true, server_time: Date.now() })
      return new Response('Not found', { status: 404 })
    } catch (e) {
      console.error('license api error', e && e.stack ? e.stack : e)
      return fail('server', {}, 500)
    }
  }
}
