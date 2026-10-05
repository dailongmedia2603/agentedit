// Kiem tra may chu ban quyen chay LOCAL (npm run dev:api + dev:admin, .dev.vars co DEV_NO_AUTH=1).
//   node scripts/smoke.mjs [api=http://localhost:8787] [admin=http://localhost:8788]
import { generateKeyPairSync, sign, verify, createPublicKey, createHmac, createHash } from 'crypto'
import { readFileSync } from 'fs'
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
const fontUrl = tx && tx.files.find((f) => f.path === 'fonts/a.ttf').url
dl = await fetch(fontUrl)
check('tai file con cua mau chu -> 200', dl.status === 200 && (await dl.text()).includes('fake-font'))
dl = await fetch(fontUrl.replace('fonts/a.ttf', '..%2F..%2Fsfx%2Fboom.mp3'))
check('mau chu duong dan .. -> 400', dl.status === 400)
dl = await fetch(fontUrl.replace('/smoke-tpl/fonts/a.ttf', '/..%2Fsfx/boom.mp3'))
check('mau chu id .. -> 400', dl.status === 400)
dl = await fetch(fontUrl.replace(/t=[^&]+/, 't=abc'))
check('mau chu token gia -> 403', dl.status === 403)
r = await call(B, fpB, L1.key, 'library')
check('may khac xin kho -> other_machine', r.code === 'other_machine', r)

console.log('Kho hieu ung chung')
{
  const { fxIdOf } = await import('../src/fx.js')
  const sha = (b) => createHash('sha256').update(b).digest('hex')
  async function fxUp(dev, fp, key, code, { tamper, idOverride, kind = 'overlay' } = {}) {
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
    form.append('meta', meta)
    form.append('code', tamper ? code + '//x' : code)
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
  const id2 = await fxIdOf('overlay', CODE2)
  await admin(`/api/fx/${id2}/reject`, { note: 'go' })
  r = await call(A2, fpA2, L1.key, 'library')
  check('go muc da duyet -> mat khoi manifest', !r.manifest.fx.some((x) => x.id === id2), r.manifest.fx.map((x) => x.id))
}

console.log('Khoa / mo / het han')
let a = await admin(`/api/licenses/${L1.id}/lock`, { reason: 'test' })
check('admin khoa', a.ok && a.license.status === 'locked', a)
r = await call(A2, fpA2, L1.key, 'check')
check('key bi khoa -> locked', r.code === 'locked', r)
dl = await fetch(url)
check('link tai cu sau khi khoa -> 403', dl.status === 403)
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
