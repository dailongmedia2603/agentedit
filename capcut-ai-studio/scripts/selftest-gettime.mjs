#!/usr/bin/env node
// TU KIEM KY NANG GETTIME (gettime/agent-edit/scripts) TREN BAN DONG GOI THAT — chay sau `npm run dist` / `dist:win`
// (GitHub Actions release.yml, sau selftest-update). PROJECT_OVERVIEW muc 16.
//
//   node scripts/selftest-gettime.mjs [--ci] [--keep]
//
// May chu tai GIA local (POST /v1/download giong license-server + phat file co Range) -> script ky nang `install --key`
// tai goi, kiem SHA-512 (+ macOS: chu ky ma), CAI THAT -> goi CLI QUA script (version / status / make + wait) -> go.
//   macOS : bash agent-edit, HOME TAM (app cai vao <HOME tam>/Applications, bo qua /Applications that), --user-data-dir tam.
//   Windows: powershell agent-edit.ps1, bo cai NSIS /S cai cho user hien tai -> CHI chay tren may CI (env CI=true / --ci),
//            cuoi cung go cai dat.
// Kiem rieng: `make` tra ma viec NGAY (tien trinh viec nen KHONG giu ong stdout cua lenh goi — neu giu, AI agent se treo
// toi khi video xong), key sai -> loi ro rang.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { macAppPath } from './mac-app-path.mjs'

const root = resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const KEEP = argv.includes('--keep')
const IS_MAC = process.platform === 'darwin'
const IS_WIN = process.platform === 'win32'
const skillDir = resolve(root, '..', 'gettime', 'agent-edit', 'scripts')
const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + String(detail).replace(/\s+/g, ' ').slice(0, 400) : ''}`)
}
const die = (m) => {
  console.error('[selftest-gettime] ' + m)
  process.exit(2)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!IS_MAC && !IS_WIN) die('chi macOS / Windows')
if (IS_WIN && !(process.env.CI === 'true' || argv.includes('--ci'))) {
  die('Windows: chi chay tren may CI (bo cai ghi registry + loi tat). Them --ci neu that su muon chay tren may nay.')
}
const info = JSON.parse(readFileSync(join(root, 'release', `build-info-${IS_MAC ? 'mac' : 'win'}.json`), 'utf-8'))
const work = mkdtempSync(join(tmpdir(), 'ae-gettime-'))
const ud = join(work, 'ud')
const KEY = 'AETST-GETTI-MESEL-FTEST-00001'

// ---- goi cai dat phuc vu qua may chu gia ----
let pkgFile
let pkgName
if (IS_MAC) {
  const app = macAppPath(root, info.arch)
  if (!existsSync(app)) die(`khong thay ${app}`)
  pkgName = `Agent-Edit-${info.version}-b${info.build}-mac-${info.arch}.zip`
  pkgFile = join(work, pkgName)
  console.log(`[selftest-gettime] nen ${app} -> ${pkgName}`)
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, pkgFile])
} else {
  pkgName = `Agent-Edit-Setup-${info.version}-b${info.build}-x64.exe`
  pkgFile = join(root, 'release', `Agent Edit-Setup-${info.version}-b${info.build}-x64.exe`)
  if (!existsSync(pkgFile)) die(`khong thay ${pkgFile}`)
}
const size = statSync(pkgFile).size
const sha512 = await new Promise((res, rej) => {
  const h = createHash('sha512')
  createReadStream(pkgFile).on('data', (d) => h.update(d)).on('error', rej).on('end', () => res(h.digest('base64')))
})

const srv = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (req.method === 'POST' && url.pathname === '/v1/download') {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      let b = {}
      try {
        b = JSON.parse(body)
      } catch {
        /* sai */
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      if (String(b.key || '').toUpperCase() !== KEY) {
        res.end(JSON.stringify({ ok: false, code: 'invalid_key', message: 'Key không đúng.' }))
        return
      }
      const want = IS_MAC ? { platform: 'darwin', arch: info.arch } : { platform: 'win32', arch: 'x64' }
      if (b.platform !== want.platform || b.arch !== want.arch) {
        res.end(JSON.stringify({ ok: false, code: 'no_release', message: `sai nen tang ${b.platform}-${b.arch}` }))
        return
      }
      const port = srv.address().port
      res.end(JSON.stringify({ ok: true, version: info.version, build: info.build, file: pkgName, size, sha512, platform: want.platform,
        arch: want.arch, channel: 'stable', url: `http://127.0.0.1:${port}/v1/update/${pkgName}?t=x` }))
    })
    return
  }
  if (url.pathname === `/v1/update/${pkgName}`) {
    const m = /^bytes=(\d+)-$/.exec(String(req.headers.range || ''))
    const start = m ? Number(m[1]) : 0
    const headers = { 'content-length': size - start, 'accept-ranges': 'bytes', 'content-type': 'application/octet-stream' }
    if (m) headers['content-range'] = `bytes ${start}-${size - 1}/${size}`
    res.writeHead(m ? 206 : 200, headers)
    createReadStream(pkgFile, { start }).pipe(res)
    return
  }
  res.writeHead(404)
  res.end()
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const API = `http://127.0.0.1:${srv.address().port}`

// ---- goi script ky nang ----
const home = IS_MAC ? join(work, 'home') : homedir()
// AGENT_EDIT_MIN_VERSION = chinh ban dang tu kiem (luot CI thu chua nang so phien ban van kiem duoc het luong; luat "ban toi
// thieu" cua script chi la so sanh so, khong phai thu nghiem o day)
// AGENT_EDIT_TEST_JOB_DELAY_MS: viec nen cho 8s truoc khi chay -> `make` phai tra ve truoc khi viec xong it nhat 3s
const baseEnv = { ...process.env, AGENT_EDIT_API: API, AGENT_EDIT_USER_DATA_DIR: ud, AGENT_EDIT_MIN_VERSION: info.version,
  AGENT_EDIT_TEST_JOB_DELAY_MS: '8000' }
delete baseEnv.ELECTRON_RUN_AS_NODE
if (IS_MAC) Object.assign(baseEnv, { HOME: home, AGENT_EDIT_ARCH: info.arch, AGENT_EDIT_NO_SYSTEM_APP: '1', PYTHONPYCACHEPREFIX: join(work, 'pycache') })

function skill(args, timeoutMs = 10 * 60000, extraEnv = {}) {
  const [cmd, pre] = IS_MAC
    ? ['/bin/bash', [join(skillDir, 'agent-edit')]]
    : ['powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(skillDir, 'agent-edit.ps1')]]
  return new Promise((res) => {
    const t0 = Date.now()
    const p = spawn(cmd, [...pre, ...args], { env: { ...baseEnv, ...extraEnv }, windowsHide: true })
    let so = ''
    let se = ''
    p.stdout.on('data', (d) => (so += d.toString('utf-8')))
    p.stderr.on('data', (d) => (se += d.toString('utf-8')))
    const timer = setTimeout(() => {
      se += '\n[HET GIO]'
      try {
        if (IS_WIN) execFileSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
        else p.kill('SIGKILL')
      } catch {
        /* da thoat */
      }
    }, timeoutMs)
    p.on('close', (code) => {
      clearTimeout(timer)
      res({ code, so, se, ms: Date.now() - t0, at: Date.now() })
    })
  })
}
const parse = (t) => {
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}
const both = (r) => (r.so + ' | ' + r.se).trim()

// ---- che do cong cu GetTime (tool.json): moi lenh <= 25 giay (GetTime cat o 25s), key qua bien AGENT_EDIT_KEY ----
const TOOL_LIMIT_MS = 25000
const toolEnv = { GETTIME_TOOL_DATA: join(work, 'tool-data') }
const tool = (args, extra = {}) => skill(['tool', ...args], 60000, { ...toolEnv, ...extra })
/** hoi `tool job <ma>` nhu GetTime (3 giay / lan) toi khi xong / loi — tra cau tra loi cuoi + lan hoi lau nhat */
async function pollTool(id, ms, extra = {}) {
  const t0 = Date.now()
  let last = null
  let slowest = 0
  while (Date.now() - t0 < ms) {
    const r = await tool(['job', id], extra)
    slowest = Math.max(slowest, r.ms)
    last = parse(r.so)
    if (last && ['done', 'error', 'cancelled'].includes(last.status)) break
    await sleep(3000)
  }
  return { last, slowest }
}

let installedExe = ''
let installDir = ''
try {
  console.log(`[selftest-gettime] ${IS_MAC ? 'bash agent-edit' : 'agent-edit.ps1'} · ban ${info.version} (${info.build}) · may chu gia ${API}`)

  // [tool] may chua co app: status -> chua san sang; setup khong key -> loi doi key; key sai / dung -> viec nen i_
  let r = await tool(['status'])
  let j = parse(r.so)
  record('tool status (chua co app): JSON, ready=false, next=setup, < 25s', r.code === 0 && j?.ready === false && j?.installed === false &&
    j?.next?.[0] === 'setup' && r.ms < TOOL_LIMIT_MS, `${r.ms}ms ${both(r).slice(0, 200)}`)
  r = await tool(['setup'])
  j = parse(r.so)
  record('tool setup khong key -> loi (ma 1) bao can key', r.code === 1 && /key/i.test(j?.error?.message || '') && r.ms < TOOL_LIMIT_MS, both(r).slice(0, 200))
  r = await tool(['setup'], { AGENT_EDIT_KEY: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE' })
  j = parse(r.so)
  if (j?.id?.startsWith('i_')) {
    const p = await pollTool(j.id, 3 * 60000)
    record('tool setup key sai: tra ma i_ ngay, viec nen bao "Key không đúng"', r.ms < TOOL_LIMIT_MS && p.last?.status === 'error' &&
      /Key không đúng/.test(p.last?.error?.message || '') && p.slowest < TOOL_LIMIT_MS, `setup ${r.ms}ms, hoi lau nhat ${p.slowest}ms ${JSON.stringify(p.last)}`)
  } else record('tool setup key sai -> tra ma i_', false, both(r))
  r = await tool(['setup'], { AGENT_EDIT_KEY: KEY })
  j = parse(r.so)
  if (j?.id?.startsWith('i_')) {
    // tai + kiem + cai app that qua viec nen; kich hoat key test o may chu ban quyen THAT -> loi kich hoat (dung du kien)
    const p = await pollTool(j.id, 8 * 60000, { AGENT_EDIT_KEY: KEY })
    const exe = IS_MAC ? join(home, 'Applications', 'Agent Edit.app') : join(process.env.LOCALAPPDATA || '', 'Programs', 'Agent Edit', 'Agent Edit.exe')
    record('tool setup key dung: viec nen i_ tai + cai app, roi toi buoc kich hoat key', r.ms < TOOL_LIMIT_MS && existsSync(exe) &&
      !!p.last && (p.last.status === 'error' ? !/tải|SHA|chữ ký|cài được/i.test(p.last.error?.message || '') : !!p.last.status) && p.slowest < TOOL_LIMIT_MS,
      `setup ${r.ms}ms, hoi lau nhat ${p.slowest}ms ${JSON.stringify(p.last).slice(0, 300)}`)
  } else record('tool setup key dung -> tra ma i_', false, both(r))

  r = await skill(['install', '--key', 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE'], 120000)
  record('key sai -> dung, bao "Key không đúng" (ma 2)', r.code === 2 && /Key không đúng/.test(r.se), both(r))

  r = await skill(['install', '--key', KEY.toLowerCase()])
  if (IS_MAC) {
    installedExe = join(home, 'Applications', 'Agent Edit.app')
    let sig = ''
    try {
      execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', installedExe], { stdio: 'pipe' })
      sig = 'ok'
    } catch (e) {
      sig = String(e.stderr || e.message)
    }
    record('install --key: tai + SHA-512 + chu ky -> cai vao ~/Applications (HOME tam)', r.code === 0 && sig === 'ok', both(r) + ' | codesign ' + sig)
  } else {
    installDir = join(process.env.LOCALAPPDATA || '', 'Programs', 'Agent Edit')
    installedExe = join(installDir, 'Agent Edit.exe')
    record('install --key: tai + SHA-512 + bo cai /S -> %LOCALAPPDATA%\\Programs\\Agent Edit', r.code === 0 && existsSync(installedExe), both(r))
  }

  r = await skill(['version', '--json'], 5 * 60000)
  const v = parse(r.so)
  record('version --json qua script (tu tim app vua cai)', r.code === 0 && v?.version === info.version && v?.platform === process.platform, both(r))

  r = await skill(['status', '--json'], 8 * 60000)
  const st = parse(r.so)
  record('status --json: JSON sach + bao chua co key (ma 2)', r.code === 2 && Array.isArray(st?.checks) && st?.license?.status !== 'ok', both(r).slice(0, 300))

  const vid = join(work, 'video thử.mp4')
  writeFileSync(vid, Buffer.alloc(4096))
  r = await skill(['make', '--video', vid, '--request', 'tự kiểm', '--json'], 3 * 60000)
  const mk = parse(r.so)
  const returnedAt = r.at
  if (mk?.id) {
    const w = await skill(['wait', mk.id, '--timeout', '180', '--json'], 5 * 60000)
    const wj = parse(w.so)
    record('make -> viec nen chay, wait doc trang thai (dung o ban quyen + goi y activate)',
      w.code === 1 && wj?.status === 'error' && wj?.error?.step === 'prepare' && /activate/.test(wj?.error?.hint || ''), both(w).slice(0, 300))
    const fin = wj?.finishedAt ? Date.parse(wj.finishedAt) : 0
    record('make tra ma viec NGAY (viec nen khong giu ong stdout cua lenh goi)', !!fin && fin - returnedAt > 3000,
      `make xong ${r.ms}ms, tra truoc khi viec nen xong ${fin - returnedAt}ms (viec nen giu 8s)`)
  } else record('make -> tra ma viec', false, both(r))

  // [tool] app da cai (chua kich hoat): status gon + make / job / jobs nhu GetTime goi
  r = await tool(['status'])
  j = parse(r.so)
  record('tool status (co app, chua key): ban gon, next = setup (kich hoat key), < 25s', r.code === 0 && j?.ready === false &&
    j?.installed === true && (j?.next || []).some((x) => /kích hoạt/.test(x)) && r.so.length < 4000 && r.ms < TOOL_LIMIT_MS, `${r.ms}ms ${r.so.slice(0, 300)}`)
  const ins = join(work, 'logo.png')
  writeFileSync(ins, Buffer.alloc(64))
  const outDir = join(work, 'gettime-out')
  r = await tool(['make', '--video', vid, '--request', 'tự kiểm: công cụ', '--insert', ins, '--insert-notes', 'logo, cuối video\n', '--out', outDir])
  j = parse(r.so)
  if (j?.id) {
    const p = await pollTool(j.id, 3 * 60000)
    record('tool make: tra ma viec < 25s, tool job doc trang thai (dung o ban quyen)', r.ms < TOOL_LIMIT_MS && p.last?.status === 'error' &&
      p.last?.error?.step === 'prepare' && p.slowest < TOOL_LIMIT_MS, `make ${r.ms}ms, hoi lau nhat ${p.slowest}ms`)
    const lj = parse((await tool(['jobs'])).so)
    record('tool jobs: danh sach gon co viec vua tao', !!lj?.jobs?.some((x) => x.id === j.id), JSON.stringify(lj).slice(0, 300))
  } else record('tool make -> tra ma viec', false, both(r))

  // [tool cli] DAY DU CHUC NANG APP qua dich vu nen (app tu chay nen khong cua so — electron/service/)
  const feat = { AGENT_EDIT_FEATURE_MIN_VERSION: info.version }
  r = await tool(['cli', 'capabilities'], feat)
  j = parse(r.so)
  record('tool cli capabilities: tu bat dich vu nen, liet ke 7 nhom chuc nang (co Bot Telegram), < 25s', r.code === 0 && j?.features?.length === 7 && j.features.some((f) => f.id === 'telegram') &&
    j?.motion?.videoTypes?.length >= 8 && r.ms < TOOL_LIMIT_MS, `${r.ms}ms ${r.so.slice(0, 200)}`)
  r = await tool(['cli', 'telegram', 'status'], feat)
  j = parse(r.so)
  record('tool cli telegram status: Bot Telegram qua dich vu nen (chua co token -> tat)', r.code === 0 && j?.has_token === false && j?.status?.state === 'off' && r.ms < TOOL_LIMIT_MS, `${r.ms}ms ${r.so.slice(0, 200)}`)
  r = await tool(['cli', 'settings', 'show'], feat)
  j = parse(r.so)
  record('tool cli settings show (lan 2: dich vu dang chay, nhanh)', r.code === 0 && !!j?.providers?.claude && r.ms < 10000, `${r.ms}ms`)
  r = await tool(['cli', 'auto', 'save', '--project-name', 'Tự kiểm', '--sources', 'web|https://example.com/rss\r\nweb|https://example.org/feed\n',
    '--name', 'Kênh tự kiểm', '--no-voice', '--enabled', 'no', '--interval', '45'], feat)
  j = parse(r.so)
  const autoId = j?.project?.id
  record('tool cli auto save: nguon nhieu dong -> 2 nguon, tat, chu ky 45', r.code === 0 && j?.project?.sources?.length === 2 &&
    j?.project?.enabled === false && j?.project?.intervalMin === 45, r.so.slice(0, 300))
  if (autoId) {
    const l = parse((await tool(['cli', 'auto', 'list'], feat)).so)
    const d = await tool(['cli', 'auto', 'delete', '--id', autoId], feat)
    const l2 = parse((await tool(['cli', 'auto', 'list'], feat)).so)
    record('tool cli auto list / delete', !!l?.projects?.some((p) => p.id === autoId) && d.code === 0 && !l2?.projects?.some((p) => p.id === autoId), d.so.slice(0, 200))
  }
  r = await tool(['cli', 'motion', 'create', '--name', 'Tự kiểm', '--message', 'Thử tạo video', '--no-voice', '--duration', '6'], feat)
  j = parse(r.so)
  record('tool cli motion create: chua kich hoat key -> loi ban quyen ro rang (ma 1), < 25s', r.code === 1 && /quyền|key/i.test(String(j?.error || '')) &&
    r.ms < TOOL_LIMIT_MS, `${r.ms}ms ${r.so.slice(0, 200)}`)
  r = await tool(['cli', 'projects', 'list'], feat)
  record('tool cli projects list', r.code === 0 && Array.isArray(parse(r.so)?.projects), r.so.slice(0, 200))
  r = await tool(['keys'], feat)
  record('tool keys khong co key nao -> loi goi y gettime_ask_field (ma 1)', r.code === 1 && /gettime_ask_field/.test(r.so), r.so.slice(0, 200))
  // dong dich vu nen tu kiem (thu muc HOME tam)
  try {
    const svcDir = join(home, '.capcut-studio', 'cli', 'svc')
    for (const f of (await import('node:fs')).readdirSync(svcDir).filter((x) => x.startsWith('svc-'))) {
      process.kill(JSON.parse(readFileSync(join(svcDir, f), 'utf-8')).pid)
    }
  } catch {
    /* khong co dich vu */
  }
} finally {
  srv.close()
  if (IS_WIN && installDir) {
    try {
      execFileSync(join(installDir, 'Uninstall Agent Edit.exe'), ['/S'], { timeout: 10 * 60000 })
    } catch {
      /* bo qua */
    }
  }
  if (!KEEP) rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

const bad = results.filter((x) => !x.ok)
console.log(bad.length ? `\n[selftest-gettime] LOI ${bad.length}: ${bad.map((x) => x.name).join('; ')}` : `\n[selftest-gettime] TAT CA PASS (${results.length})`)
process.exit(bad.length ? 1 : 0)
