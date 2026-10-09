#!/usr/bin/env node
// TU KIEM TU CAP NHAT TREN BAN DONG GOI THAT (sau `npm run dist` / `dist:win`): cai app vao CHO THU, chay app voi
// --update-selftest -> app tu tai goi cap nhat tu may chu HTTP local (co cat giua chung de thu tai tiep), kiem chu ky phieu
// (khoa that) + SHA-512, (macOS) giai nen + kiem chu ky ma, chay script thay app THAT, mo lai ban moi -> ban moi ghi ket qua.
//
//   node scripts/selftest-update.mjs [--install-dir <thu muc>] [--keep]
//
// macOS: cai vao /Applications/Agent Edit Update Selftest.app (khong dung toi "Agent Edit.app" that), --user-data-dir tam.
// Windows: CHI chay tren may CI (env CI=true hoac --ci): bo cai NSIS ghi registry + loi tat cho user hien tai.
// Khoa ky phieu: env UPDATE_SIGNING_KEY hoac ~/.capcut-studio/update-signing.json (giong publish-update.mjs).
// Kiem them: phieu SAI chu ky -> app tu choi, khong dung toi app da cai.
import { execFileSync, spawn } from 'node:child_process'
import { createHash, createPrivateKey, sign } from 'node:crypto'
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const KEEP = argv.includes('--keep')
const IS_MAC = process.platform === 'darwin'
const IS_WIN = process.platform === 'win32'
const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + String(detail).replace(/\s+/g, ' ').slice(0, 500) : ''}`)
}
const die = (m) => {
  console.error('[selftest-update] ' + m)
  process.exit(2)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!IS_MAC && !IS_WIN) die('chi macOS / Windows')
if (IS_WIN && !(process.env.CI === 'true' || argv.includes('--ci'))) {
  die('Windows: chi chay tren may CI (bo cai ghi registry + loi tat). Them --ci neu that su muon chay tren may nay.')
}
const info = JSON.parse(readFileSync(join(root, 'release', `build-info-${IS_MAC ? 'mac' : 'win'}.json`), 'utf-8'))
if (info.fullUi) die('ban day du khong tu cap nhat — build ban khach (npm run dist / dist:win)')

function signingKey() {
  if (process.env.UPDATE_SIGNING_KEY) return process.env.UPDATE_SIGNING_KEY.trim()
  const f = join(homedir(), '.capcut-studio', 'update-signing.json')
  if (!existsSync(f)) die(`thieu khoa ky (${f} hoac env UPDATE_SIGNING_KEY)`)
  return JSON.parse(readFileSync(f, 'utf-8')).sk
}
const sk = createPrivateKey({ key: Buffer.from(signingKey(), 'base64'), format: 'der', type: 'pkcs8' })

const work = mkdtempSync(join(tmpdir(), 'ae-updtest-'))
const ud = join(work, 'ud')
let installed // macOS: .app da cai; Windows: thu muc cai
let exe
let pkgFile // goi cap nhat phuc vu qua HTTP
let pkgName
const cleanups = []

// ---- 1. cai app vao cho thu + chuan bi goi cap nhat ----
if (IS_MAC) {
  const src = join(root, 'release', 'mac-arm64', 'Agent Edit.app')
  if (!existsSync(src)) die(`khong thay ${src}`)
  let dir = opt('--install-dir')
  if (!dir) {
    try {
      execFileSync('/bin/test', ['-w', '/Applications'])
      dir = '/Applications'
    } catch {
      dir = join(homedir(), 'Applications')
    }
  }
  installed = join(dir, 'Agent Edit Update Selftest.app')
  if (existsSync(installed)) rmSync(installed, { recursive: true, force: true })
  execFileSync('/usr/bin/ditto', [src, installed])
  cleanups.push(() => rmSync(installed, { recursive: true, force: true }))
  exe = join(installed, 'Contents', 'MacOS', 'Agent Edit')
  pkgName = `Agent-Edit-${info.version}-b${info.build}-mac-arm64.zip`
  pkgFile = join(work, pkgName)
  console.log(`[selftest-update] cai thu: ${installed}\n[selftest-update] nen goi cap nhat (ditto)…`)
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', src, pkgFile])
} else {
  const setup = join(root, 'release', `Agent Edit-Setup-${info.version}-b${info.build}-x64.exe`)
  if (!existsSync(setup)) die(`khong thay ${setup}`)
  // Cai NHU KHACH (`/S`, khong /D): bo cai NSIS cua electron-builder dung thu muc trong registry / mac dinh
  // (%LOCALAPPDATA%\\Programs\\Agent Edit) — lan chay CI 2026-10-09 cho thay /D= bi bo qua.
  console.log('[selftest-update] cai im lang (nhu khach)…')
  execFileSync(setup, ['/S'], { stdio: 'inherit', timeout: 15 * 60000 })
  const findInstall = () => {
    try {
      const ps = "Get-ItemProperty HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Agent Edit*' } | Select-Object -First 1 -ExpandProperty InstallLocation"
      return execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf-8' }).trim()
    } catch {
      return ''
    }
  }
  installed = ''
  for (let i = 0; i < 120 && !(installed && existsSync(join(installed, 'Agent Edit.exe'))); i++) {
    installed = findInstall() || join(process.env.LOCALAPPDATA || '', 'Programs', 'Agent Edit')
    if (!existsSync(join(installed, 'Agent Edit.exe'))) await sleep(1000)
  }
  exe = join(installed, 'Agent Edit.exe')
  if (!existsSync(exe)) {
    console.log('[selftest-update] registry InstallLocation:', JSON.stringify(findInstall()))
    die(`cai xong nhung khong thay Agent Edit.exe (thu ${installed})`)
  }
  console.log(`[selftest-update] da cai: ${installed}`)
  cleanups.push(() => {
    try {
      execFileSync(join(installed, 'Uninstall Agent Edit.exe'), ['/S'], { timeout: 10 * 60000 })
    } catch {
      /* bo qua */
    }
  })
  pkgName = `Agent-Edit-Setup-${info.version}-b${info.build}-x64.exe`
  pkgFile = setup
}
const exeBefore = statSync(exe)
const size = statSync(pkgFile).size
const sha512 = await new Promise((res, rej) => {
  const h = createHash('sha512')
  createReadStream(pkgFile).on('data', (d) => h.update(d)).on('error', rej).on('end', () => res(h.digest('base64')))
})
console.log(`[selftest-update] goi ${pkgName}: ${(size / 1048576).toFixed(1)} MB`)

// ---- 2. may chu HTTP local: lan dau cat ket noi o ~40% (thu tai tiep bang Range) ----
const ranges = []
let dropped = false
const srv = createServer((req, res) => {
  ranges.push(String(req.headers.range || ''))
  const m = /^bytes=(\d+)-$/.exec(String(req.headers.range || ''))
  const start = m ? Number(m[1]) : 0
  const headers = { 'content-length': size - start, 'accept-ranges': 'bytes', 'content-type': 'application/octet-stream' }
  if (m) headers['content-range'] = `bytes ${start}-${size - 1}/${size}`
  res.writeHead(m ? 206 : 200, headers)
  const cut = !dropped ? Math.floor(size * 0.4) : Infinity
  const rs = createReadStream(pkgFile, { start, ...(cut !== Infinity ? { end: cut } : {}) })
  rs.pipe(res, { end: cut === Infinity })
  if (cut !== Infinity) {
    dropped = true
    rs.on('end', () => setTimeout(() => res.socket?.destroy(), 100))
  }
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${srv.address().port}/v1/update/${pkgName}`

const offerFor = (patch = {}) => {
  const m = JSON.stringify({
    v: 1,
    channel: 'test',
    platform: process.platform,
    arch: IS_MAC ? 'arm64' : 'x64',
    version: info.version,
    build: info.build,
    file: pkgName,
    size,
    sha512,
    notes: 'Tự kiểm cập nhật',
    released_at: Date.now(),
    ...patch
  })
  return { m, sig: sign(null, Buffer.from(m), sk).toString('base64'), url }
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

function launch(cfg) {
  const p = spawn(exe, [`--user-data-dir=${ud}`, `--update-selftest=${cfg}`], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let out = ''
  p.stdout.on('data', (d) => (out += d))
  p.stderr.on('data', (d) => (out += d))
  return { p, out: () => out }
}
async function waitResult(file, want, ms) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const j = JSON.parse(readFileSync(file, 'utf-8'))
      if (want.includes(j.phase)) return j
    } catch {
      /* chua co */
    }
    await sleep(500)
  }
  return null
}

try {
  // ---- 3. phieu SAI chu ky -> app tu choi, khong dung toi app ----
  {
    const cfg = join(work, 'bad.json')
    const result = join(work, 'bad-result.json')
    const bad = offerFor()
    writeFileSync(cfg, JSON.stringify({ offer: { ...bad, m: bad.m.replace('Tự kiểm', 'Tu kiem') }, result, force: true }))
    const run = launch(cfg)
    const r = await waitResult(result, ['error', 'applying', 'updated'], 120000)
    record('phieu sai chu ky -> tu choi', r?.phase === 'error' && /Chữ ký/.test(r.error || ''), r ? JSON.stringify(r) : run.out().slice(-400))
    await new Promise((res) => (run.p.exitCode !== null ? res() : run.p.on('exit', res)))
    record('app da cai khong bi dung toi', statSync(exe).ino === exeBefore.ino && statSync(exe).mtimeMs === exeBefore.mtimeMs)
  }

  // ---- 4. luong that: tai (rot mang -> tai tiep) -> kiem -> thay app -> mo lai ----
  {
    const cfg = join(work, 'ok.json')
    const result = join(work, 'ok-result.json')
    writeFileSync(cfg, JSON.stringify({ offer: offerFor(), result, force: true }))
    const t0 = Date.now()
    const run = launch(cfg)
    const first = await waitResult(result, ['applying', 'error', 'updated'], 20 * 60000)
    record('tai + kiem SHA-512' + (IS_MAC ? ' + giai nen + kiem chu ky ma' : '') + ' -> ap dung', first?.phase === 'applying' || first?.phase === 'updated', first ? JSON.stringify(first) : run.out().slice(-600))
    record('rot mang giua chung -> tai tiep bang Range', ranges.length >= 2 && ranges[0] === '' && /^bytes=\d+-$/.test(ranges[1] || ''), JSON.stringify(ranges))
    const fin = await waitResult(result, ['updated', 'failed'], (IS_MAC ? 5 : 15) * 60000)
    const applyLog = join(ud, 'updates', 'apply.log')
    const logText = existsSync(applyLog) ? readFileSync(applyLog, 'utf-8') : ''
    const newProc = first?.phase === 'updated' || fin?.pid !== first?.pid
    record('ban moi tu mo lai (co --agent-edit-updated) + ghi ket qua', fin?.phase === 'updated' && newProc, fin ? JSON.stringify(fin) : logText.slice(-800))
    // script ghi "OK" SAU khi thay dau khoi dong cua ban moi -> cho them chut
    let okLog = false
    for (let i = 0; i < 60 && !okLog; i++) {
      okLog = existsSync(applyLog) && /OK: (ban moi|app) da mo/.test(readFileSync(applyLog, 'utf-8'))
      if (!okLog) await sleep(1000)
    }
    record('script thay app bao OK', okLog, existsSync(applyLog) ? readFileSync(applyLog, 'utf-8').slice(-800) : 'khong co apply.log')
    record('app da cai la file MOI (da thay that)', existsSync(exe) && statSync(exe).ino !== exeBefore.ino, `ino ${exeBefore.ino} -> ${existsSync(exe) ? statSync(exe).ino : 'mat'}`)
    if (IS_MAC) {
      let sigOk = true
      let dr = ''
      try {
        execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', installed], { stdio: 'pipe' })
        dr = execFileSync('/usr/bin/codesign', ['-dr', '-', installed], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (e) {
        sigOk = false
        dr = String(e.message)
      }
      record('app sau cap nhat: chu ky ma hop le', sigOk, dr.trim().split('\n').pop())
      record('khong de lai ban cu / ban giai nen', !existsSync(join(ud, 'updates', `stage-${info.version}-${info.build}`, 'old.app')))
    } else {
      record('xoa bo cai da tai sau khi cap nhat OK', !existsSync(join(ud, 'updates', pkgName)))
    }
    console.log(`[selftest-update] tong thoi gian luong that: ${Math.round((Date.now() - t0) / 1000)}s`)
  }
} finally {
  srv.close()
  if (!KEEP) {
    await sleep(2000)
    for (const c of cleanups) c()
    rmSync(work, { recursive: true, force: true })
  } else console.log(`[selftest-update] giu lai: ${work} ${installed}`)
}
const fails = results.filter((r) => !r.ok)
console.log(fails.length ? `\n[selftest-update] ${fails.length} FAIL` : `\n[selftest-update] TAT CA PASS (${results.length})`)
process.exit(fails.length ? 1 : 0)
