// Kiem tra may chu ban quyen chay LOCAL (npm run dev:api + dev:admin, .dev.vars co DEV_NO_AUTH=1).
//   node scripts/smoke.mjs [api=http://localhost:8787] [admin=http://localhost:8788]
import { generateKeyPairSync, sign, verify, createPublicKey, createHmac, createHash } from 'crypto'
import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = process.argv[2] || 'http://localhost:8787'
const ADMIN = process.argv[3] || 'http://localhost:8788'
const PUB = /TICKET_PUB=(.+)/.exec(readFileSync(join(root, '.dev.vars'), 'utf-8'))[1].trim()

let pass = 0
let failCount = 0
function check(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  ok  ' + name)
  } else {
    failCount++
    console.log('  FAIL ' + name + (extra ? ' :: ' + JSON.stringify(extra).slice(0, 300) : ''))
  }
}

const admin = async (path, body) => {
  const r = await fetch(ADMIN + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-admin': '1', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  return r.json()
}

function device() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return { pub: publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64'), sk: privateKey }
}
const hfp = (k, v) => createHmac('sha256', 'agent-edit/fp/v1').update(`${k}=${v}`).digest('hex').slice(0, 32)
const winFp = (uuid, board, guid) => ({
  platform: 'win32',
  c: { 'win.uuid': hfp('win.uuid', uuid), 'win.board': hfp('win.board', board), 'win.guid': hfp('win.guid', guid) }
})

async function call(dev, fp, key, op, extra = {}) {
  const p = JSON.stringify({ op, key, dev: dev.pub, fp, app: '1.1.0', host: 'test-pc', ts: Date.now(), ...extra })
  const s = sign(null, Buffer.from(p), dev.sk).toString('base64')
  const r = await fetch(API + '/v1/license', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p, s }) })
  return r.json()
}

const serverPub = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(PUB, 'base64')]), format: 'der', type: 'spki' })
function ticketOk(t) {
  const [v, body, sig] = (t || '').split('.')
  if (v !== 'v1') return null
  const good = verify(null, Buffer.from('v1.' + body), serverPub, Buffer.from(sig, 'base64url'))
  return good ? JSON.parse(Buffer.from(body, 'base64url').toString()) : null
}

console.log('Tao key')
const created = await admin('/api/licenses', { plan: 'month', count: 2, customer: 'Khach Test', contact: '0900' })
check('tao 2 key', created.ok && created.created.length === 2, created)
const [L1, L2] = created.created
const typo = L1.key.slice(0, -1) + (L1.key.endsWith('A') ? 'B' : 'A')

const A = device()
const fpA = winFp('4C4C4544-0042-3510-8048-B4C04F4D3233', 'BOARD-111', 'guid-aaa')

console.log('Kich hoat')
let r = await call(A, fpA, L1.key, 'check')
check('check truoc kich hoat -> not_activated', r.code === 'not_activated', r)
r = await call(A, fpA, typo, 'activate')
check('go sai 1 ky tu -> invalid_key', r.code === 'invalid_key', r)
r = await call(A, fpA, L1.key.toLowerCase().replace(/-/g, ' '), 'activate')
check('kich hoat (chu thuong, khoang trang) -> ok', r.ok, r)
const t = ticketOk(r.ticket)
check('ve ky dung khoa cong khai', !!t && t.lid === L1.id && t.plan === 'month', t)
check('han thang ~ 28-31 ngay', r.license && r.license.expires_at - Date.now() > 27 * 864e5 && r.license.expires_at - Date.now() < 32 * 864e5, r.license)
check('ve mang ma may da gan', t && t.fp && t.fp.c['win.board'] === fpA.c['win.board'], t)
r = await call(A, fpA, L1.key, 'check', { reason: 'open' })
check('mo app -> ok', r.ok, r)

console.log('May khac')
const B = device()
const fpB = winFp('11111111-2222-3333-4444-555555555555', 'BOARD-222', 'guid-bbb')
r = await call(B, fpB, L1.key, 'activate')
check('may khac kich hoat -> other_machine', r.code === 'other_machine', r)
r = await call(B, fpA, L1.key, 'check')
check('may khac gia ma may A nhung lenh check -> other_machine', r.code === 'other_machine', r)
r = await call(A, fpB, L1.key, 'check')
check('khoa thiet bi A dem sang phan cung khac -> other_machine', r.code === 'other_machine', r)

console.log('Chu ky / gio')
{
  const p = JSON.stringify({ op: 'check', key: L1.key, dev: A.pub, fp: fpA, ts: Date.now() })
  const s = sign(null, Buffer.from(p + 'x'), A.sk).toString('base64')
  const j = await (await fetch(API + '/v1/license', { method: 'POST', body: JSON.stringify({ p, s }) })).json()
  check('chu ky sai -> bad_signature', j.code === 'bad_signature', j)
}
r = await call(A, fpA, L1.key, 'check', { ts: Date.now() - 3600e3 })
check('gio lech 1h -> clock + server_time', r.code === 'clock' && r.server_time > 0, r)

console.log('Cai lai Windows (doi MachineGuid, mat khoa thiet bi)')
const A2 = device()
const fpA2 = winFp('4C4C4544-0042-3510-8048-B4C04F4D3233', 'BOARD-111', 'guid-NEW')
r = await call(A2, fpA2, L1.key, 'activate')
check('cung may cai lai -> ok (rekey)', r.ok, r)
r = await call(A, fpA, L1.key, 'check')
check('khoa thiet bi cu het dung', r.code === 'other_machine', r)

console.log('Dong bo kho')
r = await call(A2, fpA2, L1.key, 'library')
check('library -> manifest co url', r.ok && r.manifest && r.manifest.sfx[0] && r.manifest.sfx[0].url, r)
const url = r.manifest && r.manifest.sfx[0].url
let dl = await fetch(url)
check('tai file kho -> 200', dl.status === 200)
check('noi dung file dung', (await dl.text()).includes('fake-mp3'))
dl = await fetch(url.replace(/t=[^&]+/, 't=abc'))
check('token gia -> 403', dl.status === 403)
dl = await fetch(url.replace('boom.mp3', '..%2Fsecret'))
check('ten file co / -> 400', dl.status === 400)
// Kho Text: 1 mau = nhieu file, moi file 1 link tam; loc id/duong dan nguy hiem
const tx = (r.manifest.texts || [])[0]
check('manifest co texts (loc id ..)', r.manifest.texts && r.manifest.texts.length === 1 && tx.id === 'smoke-tpl', r.manifest.texts)
check('texts loc file ../', tx && tx.files.length === 2 && tx.files.every((f) => f.url), tx)
// mau can renderer moi (minApp > phien ban app gui len 1.1.0) -> khong ky link (manifest local co the co muc 'smoke-future' minApp 9.0.0)
check('mau minApp > app -> bi loc', !(r.manifest.texts || []).some((t) => t.minApp && t.minApp > '1.1.0'), r.manifest.texts)
const fontUrl = tx && tx.files.find((f) => f.path === 'fonts/a.ttf').url
dl = await fetch(fontUrl)
check('tai file con cua mau chu -> 200', dl.status === 200 && (await dl.text()).includes('fake-font'))
dl = await fetch(fontUrl.replace('fonts/a.ttf', '..%2F..%2Fsfx%2Fboom.mp3'))
check('mau chu duong dan .. -> 400', dl.status === 400)
dl = await fetch(fontUrl.replace('/smoke-tpl/fonts/a.ttf', '/..%2Fsfx/boom.mp3'))
check('mau chu id .. -> 400', dl.status === 400)
dl = await fetch(fontUrl.replace(/t=[^&]+/, 't=abc'))
check('mau chu token gia -> 403', dl.status === 403)
// Kho nhac nen (2026-10-05): cung khuon SFX (1 muc = 1 file, link tam)
check('manifest co music (mang)', Array.isArray(r.manifest.music), r.manifest.music)
const mu = (r.manifest.music || [])[0]
if (mu) {
  dl = await fetch(mu.url)
  check('tai nhac nen -> 200', dl.status === 200)
  dl = await fetch(mu.url.replace(/t=[^&]+/, 't=abc'))
  check('nhac nen token gia -> 403', dl.status === 403)
} else console.log('  (R2 local chua co nhac nen mau — bo qua buoc tai)')
r = await call(B, fpB, L1.key, 'library')
check('may khac xin kho -> other_machine', r.code === 'other_machine', r)

console.log('Kho hieu ung chung')
{
  const { fxIdOf } = await import('../src/fx.js')
  const sha = (b) => createHash('sha256').update(b).digest('hex')
  async function fxUp(dev, fp, key, code, { tamper, idOverride, kind = 'overlay', asBlob = false } = {}) {
    const id = idOverride || (await fxIdOf(kind, code))
    const meta = JSON.stringify({ id, kind, layer: 'front', duration: 1.5, params: { colors: ['#ffcc00', 'javascript:x'], intensity: 0.8 },
      works: { portrait: true, landscape: true }, label: { name: '<b>Tia</b> sang', summary: 'tia sang', quality: 4, tags: ['tia'] },
      design: { context: 'RIENG TU' } })
    const prev = Buffer.from('fake-mp4-' + id)
    const p = JSON.stringify({ op: 'fx_upload', key, dev: dev.pub, fp, ts: Date.now(), id,
      meta_sha: sha(Buffer.from(meta)), code_sha: sha(Buffer.from(code)), preview_sha: sha(prev) })
    const form = new FormData()
    form.append('p', p)
    form.append('s', sign(null, Buffer.from(p), dev.sk).toString('base64'))
    const sent = tamper ? code + '//x' : code
    if (asBlob) {
      form.append('meta', new Blob([meta], { type: 'application/json' }), 'meta.json')
      form.append('code', new Blob([sent], { type: 'text/javascript' }), 'code.js')
    } else {
      form.append('meta', meta)
      form.append('code', sent)
    }
    form.append('preview', new Blob([prev], { type: 'video/mp4' }), 'preview.mp4')
    const res = await fetch(API + '/v1/fx/upload', { method: 'POST', body: form })
    return { ...(await res.json()), id }
  }
  const stamp = Date.now()
  const CODE1 = `function render(ctx){ return h('svg', {width: ctx.W, height: ctx.H}, h('rect', {x: ${stamp % 900}, y: 10, width: 9, height: 9})) }`
  const CODE2 = CODE1.replace('y: 10', 'y: 20')
  const CODE3 = CODE1.replace('y: 10', 'y: 30')
  let u = await fxUp(A2, fpA2, L1.key, CODE1)
  check('may khach gui hieu ung -> cho duyet', u.ok && u.status === 'pending', u)
  r = await call(A2, fpA2, L1.key, 'library')
  check('hieu ung cho duyet KHONG vao manifest', r.ok && Array.isArray(r.manifest.fx) && !r.manifest.fx.some((x) => x.id === u.id), r.manifest && r.manifest.fx)
  const tok = new URL(r.manifest.sfx[0].url).searchParams.get('t')
  dl = await fetch(`${API}/v1/lib/fx/${u.id}/code.js?t=${encodeURIComponent(tok)}`)
  check('tai hieu ung chua duyet -> 404', dl.status === 404)
  let l = await admin('/api/fx?status=pending')
  const it = l.items && l.items.find((x) => x.id === u.id)
  check('quan tri thay hieu ung cho duyet', !!it && l.counts.pending >= 1, l)
  check('meta da loc: bo design, bo mau la', it && !it.meta.design && it.meta.params.colors.join() === '#ffcc00', it && it.meta)
  const cd = await admin(`/api/fx/${u.id}/code`)
  check('quan tri xem code', cd.ok && cd.code === CODE1, cd)
  let a1 = await admin(`/api/fx/${u.id}/approve`, { note: 'ok' })
  check('quan tri duyet', a1.ok, a1)
  r = await call(A2, fpA2, L1.key, 'library')
  const mf = r.manifest.fx.find((x) => x.id === u.id)
  check('da duyet -> vao manifest kem 2 file', mf && mf.files.length === 2 && mf.files.every((f) => f.url && f.sha256), mf)
  dl = await fetch(mf.files.find((f) => f.path === 'code.js').url)
  check('tai code da duyet -> dung noi dung', dl.status === 200 && (await dl.text()) === CODE1)
  dl = await fetch(mf.files.find((f) => f.path === 'preview.mp4').url)
  check('tai preview -> 200', dl.status === 200)
  dl = await fetch(`${API}/v1/lib/fx/${u.id}/secret.txt?t=${encodeURIComponent(tok)}`)
  check('file la trong muc fx -> 404/400', dl.status === 404 || dl.status === 400)
  dl = await fetch(ADMIN + `/media/fx/${u.id}/preview.mp4`)
  check('trang quan tri phat preview', dl.status === 200)
  u = await fxUp(A2, fpA2, L1.key, CODE1)
  check('gui lai muc da co -> tra trang thai, khong ghi de', u.ok && u.existed && u.status === 'approved', u)
  u = await fxUp(A2, fpA2, L1.key, CODE2, { tamper: true })
  check('code bi doi sau khi ky -> fx_bad', u.code === 'fx_bad', u)
  u = await fxUp(A2, fpA2, L1.key, CODE2, { idOverride: 'fx-' + '0'.repeat(12) })
  check('id khong khop bam code -> fx_bad', u.code === 'fx_bad', u)
  u = await fxUp(B, fpB, L1.key, CODE2)
  check('may khac gui bang key nay -> other_machine', u.code === 'other_machine', u)
  a1 = await admin(`/api/licenses/${L1.id}/trust`, {})
  check('dat may tin cay', a1.ok && a1.license.trusted, a1.license)
  u = await fxUp(A2, fpA2, L1.key, CODE2)
  check('may tin cay gui -> tu duyet', u.ok && u.status === 'approved', u)
  await admin(`/api/licenses/${L1.id}/untrust`, {})
  u = await fxUp(A2, fpA2, L1.key, CODE3)
  check('bo tin cay -> lai cho duyet', u.ok && u.status === 'pending', u)
  a1 = await admin(`/api/fx/${u.id}/reject`, { note: 'xau' })
  check('tu choi', a1.ok, a1)
  const cd3 = await admin(`/api/fx/${u.id}/code`)
  check('tu choi -> xoa file', !cd3.ok, cd3)
  u = await fxUp(A2, fpA2, L1.key, CODE3)
  check('gui lai muc bi tu choi -> van rejected (khong vao hang cho lai)', u.ok && u.status === 'rejected', u)
  // code NHIEU DONG (loi that 10-05: truong chuoi multipart doi \n -> \r\n -> sha lech -> fx_bad)
  const ML = `function render(ctx) {\n  const k = ${stamp % 97};\n  return h('svg', {width: ctx.W, height: ctx.H},\n    h('rect', {x: k, y: 40, width: 9, height: 9}))\n}`
  await admin(`/api/licenses/${L1.id}/trust`, {})
  u = await fxUp(A2, fpA2, L1.key, ML)
  check('code nhieu dong gui kieu CU (chuoi) -> van nhan', u.ok && u.status === 'approved', u)
  r = await call(A2, fpA2, L1.key, 'library')
  dl = await fetch(r.manifest.fx.find((x) => x.id === u.id).files.find((f) => f.path === 'code.js').url)
  check('code luu dung ban goc (\n, khong \r\n)', (await dl.text()) === ML)
  const ML2 = ML.replace('y: 40', 'y: 50')
  u = await fxUp(A2, fpA2, L1.key, ML2, { asBlob: true })
  check('code nhieu dong gui kieu MOI (file) -> nhan', u.ok && u.status === 'approved', u)
  u = await fxUp(A2, fpA2, L1.key, ML.replace('y: 40', 'y: 60'), { asBlob: true, tamper: true })
  check('code nhieu dong bi sua sau khi ky -> van chan', u.code === 'fx_bad', u)
  await admin(`/api/licenses/${L1.id}/untrust`, {})
  const id2 = await fxIdOf('overlay', CODE2)
  await admin(`/api/fx/${id2}/reject`, { note: 'go' })
  r = await call(A2, fpA2, L1.key, 'library')
  check('go muc da duyet -> mat khoi manifest', !r.manifest.fx.some((x) => x.id === id2), r.manifest.fx.map((x) => x.id))
}

console.log('Tu cap nhat app')
// Dat phieu + file vao R2 LOCAL (wrangler dev --persist-to .wrangler/state). Worker khong kiem chu ky phieu (app kiem) ->
// chu ky gia van chuyen tiep nguyen ven.
const r2tmp = mkdtempSync(join(tmpdir(), 'upd-smoke-'))
function r2put(key, content) {
  const f = join(r2tmp, key.replace(/\//g, '_'))
  writeFileSync(f, content)
  const r = spawnSync('npx', ['wrangler', 'r2', 'object', 'put', `agent-edit/${key}`, '--file', f, '--local', '--persist-to', '.wrangler/state'], { cwd: root, encoding: 'utf-8' })
  if (r.status !== 0) throw new Error('r2 put loi: ' + (r.stderr || r.stdout))
}
function r2del(key) {
  spawnSync('npx', ['wrangler', 'r2', 'object', 'delete', `agent-edit/${key}`, '--local', '--persist-to', '.wrangler/state'], { cwd: root, encoding: 'utf-8' })
}
const updBody = Buffer.from('0123456789'.repeat(1000)) // 10000 byte
const updFile = 'Agent-Edit-Setup-9.0.0-b20991231-2359-x64.exe'
const mkRec = (version, build, file = updFile) => {
  const m = JSON.stringify({ v: 1, channel: 'stable', platform: 'win32', arch: 'x64', version, build, file, size: updBody.length, sha512: 'x', notes: 'Ghi chú thử ✓', released_at: 1 })
  return JSON.stringify({ m, sig: 'c2lnLWdpYQ==' })
}
r2del('updates/stable/win32-x64.json')
r2del('updates/test/win32-x64.json')
r = await call(A2, fpA2, L1.key, 'check')
check('app cu (khong gui upd) -> khong co truong update', r.ok && !('update' in r), r)
r = await call(A2, fpA2, L1.key, 'check', { upd: { arch: 'x64', build: '20261009-1000', channel: 'stable' } })
check('chua co phieu -> update null', r.ok && r.update === null, r)
r2put(`updates/files/${updFile}`, updBody)
const rec900 = mkRec('9.0.0', '20991231-2359')
r2put('updates/stable/win32-x64.json', rec900)
r = await call(A2, fpA2, L1.key, 'check', { upd: { arch: 'x64', build: '20261009-1000', channel: 'stable' } })
check('co ban moi -> offer kem link tai', r.ok && r.update && r.update.url && r.update.version === '9.0.0', r)
check('phieu chuyen tiep NGUYEN chuoi da ky', r.update && r.update.m === JSON.parse(rec900).m && r.update.sig === 'c2lnLWdpYQ==')
const updUrl = r.update && r.update.url
r = await call(A2, fpA2, L1.key, 'update', { upd: { arch: 'x64', build: '20261009-1000', channel: 'stable' } })
check('op=update (nut Kiem tra cap nhat) -> offer', r.ok && r.update && r.update.version === '9.0.0', r)
r = await call(A2, fpA2, L1.key, 'check', { app: '9.0.0', upd: { arch: 'x64', build: '20991231-2359', channel: 'stable' } })
check('dang dung dung ban do -> null', r.ok && r.update === null, r)
r = await call(A2, fpA2, L1.key, 'check', { app: '9.0.0', upd: { arch: 'x64', build: '20991231-2358', channel: 'stable' } })
check('cung so phien ban, ma build cu hon -> offer', r.ok && r.update && r.update.build === '20991231-2359', r)
r = await call(A2, fpA2, L1.key, 'check', { app: '9.1.0', upd: { arch: 'x64', build: '20200101-0000', channel: 'stable' } })
check('app moi hon phieu -> null (khong ha cap)', r.ok && r.update === null, r)
r = await call(A2, fpA2, L1.key, 'check', { upd: { arch: 'arm64', build: '20261009-1000', channel: 'stable' } })
check('khac kien truc (win32-arm64 chua co) -> null', r.ok && r.update === null, r)
r = await call(A2, fpA2, L1.key, 'check', { upd: { arch: 'x64', build: '20261009-1000', channel: 'test' } })
check('kenh test chua co phieu -> null', r.ok && r.update === null, r)
r2put('updates/test/win32-x64.json', mkRec('9.0.1', '20991231-2359'))
r = await call(A2, fpA2, L1.key, 'check', { upd: { arch: 'x64', build: '20261009-1000', channel: 'test' } })
check('kenh test -> phieu kenh test', r.ok && r.update && r.update.version === '9.0.1', r)
r = await call(A2, fpA2, L1.key, 'check', { upd: { arch: 'x64', build: '20261009-1000', channel: 'la-hoac' } })
check('kenh la -> ve stable', r.ok && r.update && r.update.version === '9.0.0', r)
r2put('updates/test/win32-x64.json', mkRec('9.0.2', '20991231-2359', '../evil.exe'))
r = await call(A2, fpA2, L1.key, 'check', { upd: { arch: 'x64', build: '20261009-1000', channel: 'test' } })
check('phieu co ten file ../ -> bo qua', r.ok && r.update === null, r)
r2del('updates/test/win32-x64.json')
dl = await fetch(updUrl)
check('tai file cap nhat -> 200 + du byte', dl.status === 200 && Buffer.from(await dl.arrayBuffer()).equals(updBody) && dl.headers.get('accept-ranges') === 'bytes')
dl = await fetch(updUrl, { headers: { range: 'bytes=9990-' } })
check('tai tiep Range bytes=9990- -> 206 + 10 byte cuoi', dl.status === 206 && dl.headers.get('content-range') === 'bytes 9990-9999/10000' && (await dl.text()) === '0123456789')
dl = await fetch(updUrl, { headers: { range: 'bytes=10-19' } })
check('Range bytes=10-19 -> 10 byte', dl.status === 206 && (await dl.text()) === '0123456789')
dl = await fetch(updUrl, { headers: { range: 'bytes=10000-' } })
check('Range qua cuoi file -> 416', dl.status === 416 && dl.headers.get('content-range') === 'bytes */10000')
dl = await fetch(updUrl.replace(/t=[^&]+/, 't=abc'))
check('token gia -> 403', dl.status === 403)
{
  // token tai KHO (cung bi mat HMAC) khong dung cho file cap nhat
  r = await call(A2, fpA2, L1.key, 'library')
  const libTok = new URL(r.manifest.sfx[0].url).searchParams.get('t')
  dl = await fetch(updUrl.replace(/t=[^&]+/, 't=' + encodeURIComponent(libTok)))
  check('token kho dung cho file cap nhat -> 403', dl.status === 403)
}
dl = await fetch(updUrl.replace(encodeURIComponent(updFile), '..%2Fsecret'))
check('ten file co ../ -> 400', dl.status === 400)
dl = await fetch(updUrl.replace(encodeURIComponent(updFile), 'khong-co.exe'))
check('file khong co -> 404', dl.status === 404)

console.log('Khoa / mo / het han')
let a = await admin(`/api/licenses/${L1.id}/lock`, { reason: 'test' })
check('admin khoa', a.ok && a.license.status === 'locked', a)
r = await call(A2, fpA2, L1.key, 'check')
check('key bi khoa -> locked', r.code === 'locked', r)
dl = await fetch(url)
check('link tai cu sau khi khoa -> 403', dl.status === 403)
dl = await fetch(updUrl)
check('link tai ban cap nhat sau khi khoa -> 403', dl.status === 403)
r = await call(A2, fpA2, L1.key, 'update', { upd: { arch: 'x64', build: '20261009-1000', channel: 'stable' } })
check('key bi khoa -> op=update bi chan', r.code === 'locked', r)
a = await admin(`/api/licenses/${L1.id}/unlock`, {})
r = await call(A2, fpA2, L1.key, 'check')
check('mo khoa -> ok', r.ok, r)
a = await admin(`/api/licenses/${L1.id}/set_expiry`, { expires_at: Date.now() - 1000 })
r = await call(A2, fpA2, L1.key, 'check')
check('het han -> expired', r.code === 'expired', r)
a = await admin(`/api/licenses/${L1.id}/extend`, { plan: 'year', times: 1 })
r = await call(A2, fpA2, L1.key, 'check')
check('gia han nam -> ok, han ~1 nam', r.ok && r.license.plan === 'year' && r.license.expires_at - Date.now() > 360 * 864e5, r)

console.log('Reset may')
a = await admin(`/api/licenses/${L1.id}/reset`, {})
check('admin reset', a.ok && !a.license.bound, a)
r = await call(B, fpB, L1.key, 'activate')
check('sau reset may B kich hoat -> ok', r.ok, r)
r = await call(A2, fpA2, L1.key, 'check')
check('may A het dung', r.code === 'other_machine', r)

console.log('Tu khoa khi kich hoat lai lien tuc')
const M = winFp('AAAA0000-1111-2222-3333-444455556666', 'BOARD-M', 'guid-m')
let last
for (let i = 0; i < 4; i++) last = await call(device(), M, L2.key, 'activate')
check('lan 4 (3 lan rekey / 7 ngay) -> locked', last.code === 'locked', last)
const d2 = await admin(`/api/licenses/${L2.id}`)
check('ly do tu khoa ghi lai', d2.license.status === 'locked' && /Tự khoá/.test(d2.license.locked_reason), d2.license)
check('admin xem lai key day du', d2.license.key === L2.key)

console.log('Chong do key')
const X = device()
let thr
for (let i = 0; i < 22; i++) thr = await call(X, fpA, 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE', 'activate')
check('nhap sai nhieu lan -> throttled', thr.code === 'throttled', thr)

console.log(`\n${pass} ok, ${failCount} fail`)
process.exit(failCount ? 1 : 0)
