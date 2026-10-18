// LUU TAM VIDEO DE DANG QUA PHONE AGENT (2026-10-19). Phone Agent (iPhone) chi tai video tu 1 link CONG KHAI
// (node send_file -> iPhone tu tai URL ve Photos), External API khong co cho upload file -> app Agent Edit day MP4 len
// day (R2 posts/<license id>/<id>.mp4) roi dang ky link voi Phone Agent.
//
//   POST /v1/post/start     {p, s} ky bang khoa thiet bi (op post_start)  -> {id, upload_id, ut, part_size}
//   PUT  /v1/post/part?ut=&u=&n=   than = 1 phan (R2 multipart, moi phan part_size, phan cuoi nho hon)
//   POST /v1/post/complete  {ut, u, parts:[{n, etag}]}                    -> {url, size, expires_at}
//   GET|HEAD /v1/post/f/<lid>/<id>/<exp>/<sig>/video.mp4   link cong khai (HMAC, het han 48h), ho tro Range
//   POST /v1/post/delete    {p, s} (op post_delete, id)                    -> xoa file (dang xong)
// Tu don: moi lan start xoa file cua key do da qua 3 ngay. Gioi han 300 lan tai len / key / ngay, 2 GB / video.
import { normalizeKey, keyHash, validFp, fpMatch, importDevicePub, verifyDevice, hmacSign, hmacVerify, json, clientIp, logEvent } from './shared.js'

export const POST_PART_SIZE = 16 * 1024 * 1024 // R2: moi phan (tru phan cuoi) phai bang nhau, >= 5 MiB
const POST_MAX_SIZE = 2 * 1024 * 1024 * 1024
const POST_DAILY_LIMIT = 300
const POST_KEEP_MS = 3 * 24 * 3600 * 1000
const POST_UPLOAD_TTL_MS = 6 * 3600 * 1000
const POST_LINK_TTL_MS = 48 * 3600 * 1000
const ID_RE = /^[0-9a-f]{20}$/
const LID_RE = /^[A-Za-z0-9_-]{1,64}$/

const objKey = (lid, id) => `posts/${lid}/${id}.mp4`

/** Kiem goi {p, s} cua app (nhu fx_upload): chu ky thiet bi, gio, key dang kich hoat dung may nay. */
async function authSigned(req, env, op, ctx) {
  let body
  try {
    body = await req.json()
  } catch {
    return { res: ctx.fail('bad_request', {}, 400) }
  }
  const rawP = body && body.p
  const sig = body && body.s
  if (typeof rawP !== 'string' || typeof sig !== 'string' || rawP.length > 8000) return { res: ctx.fail('bad_request', {}, 400) }
  let p
  try {
    p = JSON.parse(rawP)
  } catch {
    return { res: ctx.fail('bad_request', {}, 400) }
  }
  if (p.op !== op || typeof p.dev !== 'string' || !validFp(p.fp)) return { res: ctx.fail('bad_request', {}, 400) }
  const ip = clientIp(req)
  if (await ctx.throttled(env, ip)) return { res: ctx.fail('throttled') }
  let devKey
  try {
    devKey = await importDevicePub(p.dev)
  } catch {
    return { res: ctx.fail('bad_request', {}, 400) }
  }
  if (!(await verifyDevice(devKey, rawP, sig))) return { res: ctx.fail('bad_signature') }
  const now = Date.now()
  if (typeof p.ts !== 'number' || Math.abs(now - p.ts) > ctx.CLOCK_SKEW_MS) return { res: ctx.fail('clock') }
  const norm = normalizeKey(p.key)
  if (!norm) {
    await ctx.addFail(env, ip)
    return { res: ctx.fail('invalid_key') }
  }
  const lic = await env.DB.prepare('SELECT * FROM licenses WHERE key_hash = ?').bind(await keyHash(norm)).first()
  if (!lic) {
    await ctx.addFail(env, ip)
    return { res: ctx.fail('invalid_key') }
  }
  if (lic.status !== 'active') return { res: ctx.fail('locked') }
  if (lic.expires_at && now > lic.expires_at) return { res: ctx.fail('expired', { expires_at: lic.expires_at }) }
  if (!lic.device_pub) return { res: ctx.fail('not_activated') }
  if (lic.device_pub !== p.dev || !fpMatch(lic.fp ? JSON.parse(lic.fp) : null, p.fp)) return { res: ctx.fail('other_machine') }
  return { p, lic }
}

/** ut = <lid>.<id>.<exp>.<sig(pup.lid.id.uploadId.exp)> — cho phep gui phan / hoan tat dung 1 lan tai len. */
async function checkUt(env, ut, uploadId) {
  const [lid, id, expStr, sig] = String(ut || '').split('.')
  const exp = Number(expStr)
  if (!LID_RE.test(lid || '') || !ID_RE.test(id || '') || !exp || !sig || !uploadId || Date.now() > exp) return null
  if (!(await hmacVerify(env.DL_SECRET, `pup.${lid}.${id}.${uploadId}.${expStr}`, sig))) return null
  return { lid, id }
}

async function cleanup(env, lid) {
  const cutoff = Date.now() - POST_KEEP_MS
  let cursor
  for (let i = 0; i < 5; i++) {
    const l = await env.LIB.list({ prefix: `posts/${lid}/`, cursor, limit: 500 })
    const old = l.objects.filter((o) => o.uploaded && o.uploaded.getTime() < cutoff).map((o) => o.key)
    if (old.length) await env.LIB.delete(old)
    if (!l.truncated) break
    cursor = l.cursor
  }
}

export async function handlePostStart(req, env, ctx) {
  const a = await authSigned(req, env, 'post_start', ctx)
  if (a.res) return a.res
  const { p, lic } = a
  const size = Number(p.size)
  if (!Number.isFinite(size) || size <= 0) return ctx.fail('bad_request', {}, 400)
  if (size > POST_MAX_SIZE) return ctx.fail('post_big')
  const now = Date.now()
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE license_id = ? AND type = 'post_upload' AND at > ?")
    .bind(lic.id, now - 24 * 3600 * 1000)
    .first()
  if ((n?.n || 0) >= POST_DAILY_LIMIT) return ctx.fail('post_limit')
  try {
    await cleanup(env, lic.id)
  } catch (e) {
    console.error('post cleanup', e)
  }
  const id = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const mpu = await env.LIB.createMultipartUpload(objKey(lic.id, id), { httpMetadata: { contentType: 'video/mp4' } })
  const exp = now + POST_UPLOAD_TTL_MS
  const ut = `${lic.id}.${id}.${exp}.${await hmacSign(env.DL_SECRET, `pup.${lic.id}.${id}.${mpu.uploadId}.${exp}`)}`
  return json({ ok: true, id, upload_id: mpu.uploadId, ut, part_size: POST_PART_SIZE })
}

export async function handlePostPart(req, env, ctx) {
  const u = new URL(req.url)
  const uploadId = u.searchParams.get('u') || ''
  const n = Number(u.searchParams.get('n'))
  const t = await checkUt(env, u.searchParams.get('ut'), uploadId)
  if (!t) return ctx.fail('forbidden', {}, 403)
  const len = Number(req.headers.get('content-length') || 0)
  if (!Number.isInteger(n) || n < 1 || n > 10000 || !len || len > POST_PART_SIZE || !req.body) return ctx.fail('bad_request', {}, 400)
  const mpu = env.LIB.resumeMultipartUpload(objKey(t.lid, t.id), uploadId)
  const part = await mpu.uploadPart(n, req.body)
  return json({ ok: true, n: part.partNumber, etag: part.etag })
}

export async function handlePostComplete(req, env, ctx) {
  let b
  try {
    b = await req.json()
  } catch {
    return ctx.fail('bad_request', {}, 400)
  }
  const t = await checkUt(env, b && b.ut, b && b.u)
  if (!t) return ctx.fail('forbidden', {}, 403)
  const parts = Array.isArray(b.parts) ? b.parts : []
  if (!parts.length || parts.length > 10000 || parts.some((x) => !Number.isInteger(x?.n) || typeof x?.etag !== 'string')) {
    return ctx.fail('bad_request', {}, 400)
  }
  const mpu = env.LIB.resumeMultipartUpload(objKey(t.lid, t.id), b.u)
  const obj = await mpu.complete(parts.map((x) => ({ partNumber: x.n, etag: x.etag })))
  const exp = Date.now() + POST_LINK_TTL_MS
  const sig = await hmacSign(env.DL_SECRET, `pf.${t.lid}.${t.id}.${exp}`)
  const origin = new URL(req.url).origin
  await logEvent(env, t.lid, 'post_upload', req, `${t.id} ${obj.size}B`)
  return json({ ok: true, id: t.id, size: obj.size, expires_at: exp, url: `${origin}/v1/post/f/${t.lid}/${t.id}/${exp}/${sig}/video.mp4` })
}

export async function handlePostDelete(req, env, ctx) {
  const a = await authSigned(req, env, 'post_delete', ctx)
  if (a.res) return a.res
  const id = String(a.p.id || '')
  if (!ID_RE.test(id)) return ctx.fail('bad_request', {}, 400)
  await env.LIB.delete(objKey(a.lic.id, id))
  return json({ ok: true })
}

/** Link cong khai cho iPhone tai (GET / HEAD, Range). */
export async function handlePostFile(req, env, lid, id, expStr, sig) {
  const exp = Number(expStr)
  if (!LID_RE.test(lid) || !ID_RE.test(id) || !exp || Date.now() > exp || !(await hmacVerify(env.DL_SECRET, `pf.${lid}.${id}.${expStr}`, sig))) {
    return new Response('forbidden', { status: 403 })
  }
  const key = objKey(lid, id)
  const base = { 'accept-ranges': 'bytes', 'cache-control': 'private, no-store', 'content-type': 'video/mp4' }
  const head = await env.LIB.head(key)
  if (!head) return new Response('not found', { status: 404 })
  const rh = req.headers.get('range')
  const isHead = req.method === 'HEAD'
  if (rh) {
    const mr = /^bytes=(\d*)-(\d*)$/.exec(rh.trim())
    let offset
    let end
    if (mr && mr[1] === '' && mr[2] !== '') {
      // bytes=-N (N byte cuoi)
      const n = Math.min(Number(mr[2]), head.size)
      offset = head.size - n
      end = head.size - 1
    } else if (mr && mr[1] !== '') {
      offset = Number(mr[1])
      end = mr[2] ? Math.min(Number(mr[2]), head.size - 1) : head.size - 1
    }
    if (offset === undefined || offset >= head.size || end < offset) {
      return new Response('bad range', { status: 416, headers: { ...base, 'content-range': `bytes */${head.size}` } })
    }
    const length = end - offset + 1
    const headers = { ...base, 'content-length': String(length), 'content-range': `bytes ${offset}-${end}/${head.size}`, etag: head.httpEtag }
    if (isHead) return new Response(null, { status: 206, headers })
    const obj = await env.LIB.get(key, { range: { offset, length } })
    if (!obj) return new Response('not found', { status: 404 })
    return new Response(obj.body, { status: 206, headers })
  }
  const headers = { ...base, 'content-length': String(head.size), etag: head.httpEtag }
  if (isHead) return new Response(null, { headers })
  const obj = await env.LIB.get(key)
  if (!obj) return new Response('not found', { status: 404 })
  return new Response(obj.body, { headers })
}
