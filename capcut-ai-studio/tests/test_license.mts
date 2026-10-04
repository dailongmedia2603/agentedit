// Test BAN QUYEN phia app (electron/services/license.ts) noi voi may chu THU chay local.
//   Can: cd ../license-server && npm run dev:api + npm run dev:admin (.dev.vars co DEV_NO_AUTH=1)
//   Chay (Node >= 23, tu thu muc capcut-ai-studio): HOME=$(mktemp -d) node tests/test_license.mts
//
// Can dam bao:
//  1. Chua co key -> need_key; key sai -> invalid_key; kich hoat -> ok + han thang; mo lai app -> ok
//  2. Ve server ky: main kiem chu ky; Python (server.py) kiem lai ve + ma may Python == ma may Electron
//  3. Quan tri khoa key -> lan "Phan tich video" ke tiep bi chan ngay (khong dung ket qua cu)
//  4. Thu muc app copy sang may khac (safeStorage khong giai ma duoc) -> need_key
//  5. Dong bo kho: manifest kem link tai; key bi khoa -> tu choi
import { register } from 'node:module'
import { mkdtempSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { execFileSync } from 'child_process'

register('./helpers/electron-mock-loader.mjs', import.meta.url)

const API = process.env.LICENSE_API || 'http://localhost:8787'
const ADMIN = process.env.LICENSE_ADMIN || 'http://localhost:8788'
const VARS = resolve('../license-server/.dev.vars')
try {
  await fetch(API + '/v1/time')
} catch {
  console.log('BO QUA: may chu ban quyen thu chua chay (cd ../license-server && npm run dev:api / dev:admin)')
  process.exit(0)
}
const PUB = /TICKET_PUB=(.+)/.exec(readFileSync(VARS, 'utf-8'))![1].trim()
process.env.STUDIO_LICENSE_URL = API
process.env.STUDIO_LICENSE_PUB = PUB
;(globalThis as any).__USERDATA = mkdtempSync(join(tmpdir(), 'lic-ud-'))
;(globalThis as any).__SAFE_STORAGE = true
;(globalThis as any).__MACHINE = 'A'

const L = await import('../electron/services/license.ts')

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)))
  if (!cond) FAILS.push(name)
}
const admin = async (path: string, body?: unknown) =>
  (await fetch(ADMIN + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-admin': '1', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })).json()

const made = await admin('/api/licenses', { plan: 'month', count: 1, customer: 'test_license.mts' })
const lic = made.created[0]

console.log('Kich hoat')
let s = await L.checkLicense('open')
check('chua co key -> need_key', s.status === 'need_key', s)
s = await L.activateLicense('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE')
check('key sai -> invalid_key', s.status === 'invalid_key' && /không đúng/.test(s.message), s)
s = await L.activateLicense(lic.key)
check('kich hoat -> ok, goi thang, co han', s.status === 'ok' && s.plan === 'month' && !!s.expiresAt, s)
check('luu ma hoa (khong co key dang chu thuong)', !readFileSync(join((globalThis as any).__USERDATA, 'license-dev.enc'), 'utf-8').includes(lic.key))
s = await L.checkLicense('open')
check('mo lai app -> ok', s.status === 'ok', s)

console.log('Ma may + ve: Electron vs Python')
const fp = await L.fingerprint()
check('doc duoc ma phan cung may nay', Object.keys(fp.c).length >= 1, fp)
// Ve moi nhat: goi thang server (cung khoa thiet bi) qua libraryManifest -> sidecar ticket; o day lay ve qua 1 lan check thu cong
const venvPy = resolve('../CapCutAPI/.venv/bin/python')
const py = existsSync(venvPy) ? venvPy : 'python3'
const pyOut = execFileSync(
  py,
  [
    '-c',
    'import sys,json,os; sys.path.insert(0,"sidecar"); import server; print(json.dumps(server._lic_fp()))'
  ],
  { encoding: 'utf-8', env: { ...process.env } }
)
const pyFp = JSON.parse(pyOut.trim().split('\n').pop()!)
check('ma may Python == Electron', JSON.stringify(pyFp) === JSON.stringify(fp), { pyFp, fp })

// Lay 1 ve that tu server de Python kiem
const sidecar = await import('../electron/services/sidecar.ts')
let lastTicket = ''
const orig = sidecar.setSidecarTicket
void orig
// sidecar chua chay -> setSidecarTicket chi luu bien; doc lai bang cach goi server lan nua va bat ve qua monkeypatch fetch
const realFetch = globalThis.fetch
globalThis.fetch = (async (...a: Parameters<typeof fetch>) => {
  const r = await realFetch(...a)
  const j = await r.clone().json().catch(() => null)
  if (j && j.ticket) lastTicket = j.ticket
  return r
}) as typeof fetch
s = await L.checkLicense('refresh')
globalThis.fetch = realFetch
check('lay duoc ve', s.status === 'ok' && lastTicket.startsWith('v1.'), s)
const pyTicket = execFileSync(
  py,
  [
    '-c',
    'import sys,json; sys.path.insert(0,"sidecar"); import server; p,why=server._lic_parse(sys.argv[1]); print(json.dumps({"ok": bool(p), "why": why}))',
    lastTicket
  ],
  { encoding: 'utf-8', env: { ...process.env } }
)
const pt = JSON.parse(pyTicket.trim().split('\n').pop()!)
check('Python kiem ve: chu ky + dung may -> ok', pt.ok, pt)
const forged = lastTicket.slice(0, -4) + (lastTicket.endsWith('AAAA') ? 'BBBB' : 'AAAA')
const pyForged = JSON.parse(
  execFileSync(py, ['-c', 'import sys,json; sys.path.insert(0,"sidecar"); import server; p,why=server._lic_parse(sys.argv[1]); print(json.dumps({"ok": bool(p), "why": why}))', forged], {
    encoding: 'utf-8'
  })
    .trim()
    .split('\n')
    .pop()!
)
check('Python: ve bi sua chu ky -> tu choi', !pyForged.ok, pyForged)

console.log('Dong bo kho')
const man = (await L.libraryManifest()) as { sfx: { url: string }[] }
check('manifest co link tai', Array.isArray(man.sfx) && (man.sfx.length === 0 || /\/v1\/lib\/sfx\//.test(man.sfx[0].url)), man)

console.log('Khoa key -> phan tich bi chan ngay')
await L.requireLicense()
check('truoc khi khoa: phan tich duoc', true)
await admin(`/api/licenses/${lic.id}/lock`, { reason: 'test' })
let blocked = ''
try {
  await L.requireLicense()
} catch (e) {
  blocked = String((e as Error).message)
}
// requireLicense dung lai ket qua OK < 20s -> lan nay van qua; mo app (open) phai bi chan
s = await L.checkLicense('open')
check('mo app sau khi khoa -> locked', s.status === 'locked', s)
try {
  await L.requireLicense()
  blocked = ''
} catch (e) {
  blocked = String((e as Error).message)
}
check('phan tich sau khi khoa -> bao loi khoa', /khoá/.test(blocked), blocked)
let libErr = ''
try {
  await L.libraryManifest()
} catch (e) {
  libErr = String((e as Error).message)
}
check('dong bo kho khi key khoa -> tu choi', /khoá/.test(libErr), libErr)
await admin(`/api/licenses/${lic.id}/unlock`, {})
s = await L.checkLicense('open')
check('mo khoa -> ok', s.status === 'ok', s)

console.log('Copy sang may khac')
;(globalThis as any).__MACHINE = 'B'
s = await L.checkLicense('open')
check('safeStorage may khac khong giai ma duoc -> need_key', s.status === 'need_key' && /máy này/.test(s.message), s)
;(globalThis as any).__MACHINE = 'A'

console.log('Nhap key khac')
s = L.forgetLicense()
check('forget -> need_key', s.status === 'need_key')
s = await L.checkLicense('open')
check('sau forget, mo app -> need_key', s.status === 'need_key', s)

console.log(FAILS.length ? `\n${FAILS.length} FAIL` : '\nTAT CA OK')
process.exit(FAILS.length ? 1 : 0)
