// Kiem tra may chu ban quyen chay LOCAL (npm run dev:api + dev:admin, .dev.vars co DEV_NO_AUTH=1).
//   node scripts/smoke.mjs [api=http://localhost:8787] [admin=http://localhost:8788]
import { generateKeyPairSync, sign, verify, createPublicKey, createHmac } from 'crypto'
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
r = await call(B, fpB, L1.key, 'library')
check('may khac xin kho -> other_machine', r.code === 'other_machine', r)

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
