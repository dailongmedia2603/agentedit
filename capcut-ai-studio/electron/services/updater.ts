// TU CAP NHAT APP (ban cai cho khach: macOS arm64 + Windows x64) — PROJECT_OVERVIEW muc 15.
//
// Luong: lan kiem key luc mo app / bam "Phan tich video" (license.ts, KHONG hoi them dinh ky) gui kem {arch, build,
// channel} -> may chu tra phieu ban moi (ky Ed25519, update-core.ts kiem) + link tai tam 24h -> app TU TAI NEN (tai tiep
// khi rot mang, kiem SHA-512) -> macOS giai nen + kiem chu ky ma san -> "San sang" -> nguoi dung bam "Cap nhat" ->
// script rieng (update-core.ts MAC_APPLY_SH / WIN_APPLY_PS1) cho app thoat roi thay app + mo lai ban moi.
// Khong tu cai khi tat app (tat may / dang xuat Windows ma chay bo cai la hong) — chi khi nguoi dung bam.
import { app, net } from 'electron'
import { execFile, spawn } from 'child_process'
import { once } from 'events'
import {
  accessSync,
  constants as fsc,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync
} from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { compareRelease, MAC_APPLY_SH, relaunchArgs, sha512File, verifyOffer, WIN_APPLY_PS1 } from './update-core'
import type { UpdateManifest, UpdateOffer } from './update-core'
import { requestUpdateOffer, setUpdateHooks } from './license'
import { stopSidecarAndWait } from './sidecar'
import { renderStatus } from './remotion'

declare const __APP_BUILD__: string
declare const __CLIENT_UI__: boolean
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : ''
const CLIENT_UI = typeof __CLIENT_UI__ !== 'undefined' && __CLIENT_UI__
const IS_MAC = process.platform === 'darwin'
const IS_WIN = process.platform === 'win32'
const BUNDLE_ID = 'app.autocapcut.desktop'

export const UPDATED_FLAG = '--agent-edit-updated='
export const UPDATE_FAILED_FLAG = '--agent-edit-update-failed='
/** ban script MONG DOI mo len (version+build) — app tu so voi chinh no */
export const UPDATE_TO_FLAG = '--agent-edit-update-to='
export const SELFTEST_FLAG = '--update-selftest='
const argOf = (flag: string) => process.argv.find((a) => a.startsWith(flag))?.slice(flag.length)

/** Ban nay tu cap nhat duoc: da dong goi + ban cai cho khach (khong phai ban day du / dev) + co ma build + nen tang ho tro. */
export function updaterEnabled(): boolean {
  const plat = (IS_MAC && process.arch === 'arm64') || (IS_WIN && process.arch === 'x64')
  return app.isPackaged && CLIENT_UI && /^\d{8}-\d{4}$/.test(APP_BUILD) && plat
}

const updDir = () => join(app.getPath('userData'), 'updates')
const markerPath = () => join(updDir(), 'launched.ok')
const stateFile = () => join(updDir(), 'state.json')
const logFile = () => join(updDir(), 'apply.log')
const releaseKey = (version: string, build: string) => `${version}+${build}`

/**
 * Goi o DAU main.ts (truoc app ready): app vua duoc script cap nhat mo lai (--agent-edit-updated=...) -> ghi MARKER ngay
 * de script biet ban moi da khoi dong (khong thi 120s sau script tra ban cu ve). Ghi truoc moi thu co the treo (vd hop
 * thoai Keychain chan luong chinh).
 */
export function markLaunchedIfUpdated(): void {
  if (!argOf(UPDATED_FLAG) && !argOf(UPDATE_FAILED_FLAG)) return
  try {
    mkdirSync(updDir(), { recursive: true })
    writeFileSync(markerPath(), `${app.getVersion()}+${APP_BUILD} pid=${process.pid} ${new Date().toISOString()}`)
  } catch {
    /* khong ghi duoc -> script se tra ban cu sau 120s */
  }
}

// ---------------------------------------------------------------------------
// Trang thai (renderer doc qua IPC update:state / su kien update:changed)
// ---------------------------------------------------------------------------
export type UpdatePhase = 'disabled' | 'idle' | 'available' | 'downloading' | 'ready' | 'applying' | 'error'
export interface UpdateState {
  phase: UpdatePhase
  current: { version: string; build: string }
  channel: string
  offer?: { version: string; build: string; notes: string; size: number; releasedAt: number }
  progress?: { received: number; total: number }
  /** loi (phase error) / ly do chua cap nhat duoc (vd app dang chay tu .dmg) */
  message?: string
  /** macOS: thu muc chua app khong ghi duoc -> luc cap nhat may hoi mat khau quan tri */
  needsAdmin?: boolean
  /** vua cap nhat xong o lan mo nay */
  justUpdated?: { from: string; to: string }
  /** lan cap nhat truoc LOI, da giu ban cu (ban do khong tu tai lai, nguoi dung bam moi thu lai) */
  updateFailed?: string
  checkedAt?: number
  checking?: boolean
}

let st: UpdateState = {
  phase: 'disabled',
  current: { version: app.getVersion(), build: APP_BUILD },
  channel: 'stable'
}
const listeners = new Set<(s: UpdateState) => void>()
export function onUpdateChange(cb: (s: UpdateState) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function setSt(patch: Partial<UpdateState>): void {
  st = { ...st, ...patch }
  for (const cb of listeners) cb(st)
}
export const updateState = (): UpdateState => st

let offer: UpdateOffer | null = null
let manifest: UpdateManifest | null = null
let downloadPath = ''
let stagedApp = '' // macOS: Agent Edit.app moi da giai nen + kiem chu ky
let job: Promise<void> | null = null
let forceSelftest = false

interface Persist {
  skip: string[] // releaseKey cac ban da cap nhat LOI (khong tu tai lai)
}
function readPersist(): Persist {
  try {
    const j = JSON.parse(readFileSync(stateFile(), 'utf-8'))
    return { skip: Array.isArray(j.skip) ? j.skip.filter((x: unknown) => typeof x === 'string').slice(-20) : [] }
  } catch {
    return { skip: [] }
  }
}
function writePersist(p: Persist): void {
  try {
    mkdirSync(updDir(), { recursive: true })
    writeFileSync(stateFile(), JSON.stringify(p))
  } catch {
    /* bo qua */
  }
}

function readChannel(): string {
  try {
    const c = readFileSync(join(app.getPath('userData'), 'update-channel'), 'utf-8').trim()
    return /^[a-z0-9-]{1,20}$/.test(c) ? c : 'stable'
  } catch {
    return 'stable'
  }
}

const log = (msg: string) => {
  try {
    mkdirSync(updDir(), { recursive: true })
    writeFileSync(logFile(), `${new Date().toISOString()} [app ${app.getVersion()}+${APP_BUILD}] ${msg}\n`, { flag: 'a' })
  } catch {
    /* bo qua */
  }
}

function run(cmd: string, args: string[], timeoutMs = 300000): Promise<string> {
  return new Promise((res, rej) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 << 20, windowsHide: true }, (err, stdout, stderr) => {
      if (err) rej(new Error(`${basename(cmd)}: ${String(stderr || err.message).trim().slice(0, 400)}`))
      else res(String(stdout))
    })
  })
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Khoi dong
// ---------------------------------------------------------------------------
/** Goi 1 lan khi app ready. Dang ky voi license.ts, doc co "vua cap nhat", don file cu. */
export function initUpdater(): void {
  let from = argOf(UPDATED_FLAG)
  let failed = argOf(UPDATE_FAILED_FLAG)
  const expected = argOf(UPDATE_TO_FLAG)
  // Script bao "da cap nhat" nhung app dang chay KHONG phai ban mong doi (vd bo cai Windows ghi nham thu muc) -> la LOI
  if (from && expected && expected !== releaseKey(app.getVersion(), APP_BUILD)) {
    log(`mo len van la ${app.getVersion()}+${APP_BUILD}, khong phai ban mong doi ${expected} -> cap nhat LOI`)
    from = undefined
    failed = expected
  }
  const patch: Partial<UpdateState> = {}
  if (from) patch.justUpdated = { from: from.split('+')[0], to: app.getVersion() }
  if (failed) {
    patch.updateFailed = failed.split('+')[0]
    const p = readPersist()
    if (!p.skip.includes(failed)) writePersist({ skip: [...p.skip, failed] })
    log(`mo lai ban cu sau khi cap nhat ${failed} LOI`)
  }
  // XEM GIAO DIEN (chi ban dev chua dong goi): STUDIO_UPDATE_FAKE=downloading|ready|available|error|updated|failed
  const fake = !app.isPackaged ? process.env.STUDIO_UPDATE_FAKE : undefined
  if (fake) {
    const offer = { version: '1.3.0', build: '20261010-0900', notes: 'Sửa lỗi xuất video bị mờ.\nThêm 12 mẫu chữ mới vào Kho Text.\nNhanh hơn khi phân tích video dài.', size: 279e6, releasedAt: Date.now() }
    if (fake === 'updated') setSt({ phase: 'idle', justUpdated: { from: '1.2.2', to: app.getVersion() } })
    else if (fake === 'failed') setSt({ phase: 'idle', updateFailed: '1.3.0' })
    else
      setSt({
        phase: fake as UpdatePhase,
        offer,
        progress: fake === 'downloading' ? { received: 120e6, total: 279e6 } : undefined,
        message: fake === 'error' ? 'Không tải được bản cập nhật: Mạng không phản hồi quá 60 giây.' : undefined
      })
    return
  }
  if (!updaterEnabled()) {
    setSt({ ...patch, phase: 'disabled' })
    return
  }
  setSt({ ...patch, phase: 'idle', channel: readChannel() })
  setUpdateHooks({
    payload: () => ({ arch: process.arch, build: APP_BUILD, channel: st.channel }),
    offer: (u, manual) => {
      void handleOffer(u, manual)
    }
  })
  setTimeout(cleanupOld, from ? 20000 : 5000)
}

/** Xoa file tai / thu muc giai nen cua ban <= ban dang chay (giu file dang tai do cho ban moi hon de tai tiep). */
function cleanupOld(): void {
  try {
    if (!existsSync(updDir())) return
    // dang tai / giai nen / cho cap nhat -> de lan mo sau (xoa giua chung = ban giai nen thieu file)
    if (job || ['downloading', 'ready', 'applying'].includes(st.phase)) return
    const keep = new Set<string>()
    if (manifest) {
      keep.add(manifest.file)
      keep.add(manifest.file + '.part')
      keep.add(`stage-${manifest.version}-${manifest.build}`)
    }
    for (const name of readdirSync(updDir())) {
      if (keep.has(name)) continue
      const m = /-(\d+\.\d+\.\d+)-b(\d{8}-\d{4})-/.exec(name) || /^stage-(\d+\.\d+\.\d+)-(\d{8}-\d{4})$/.exec(name)
      if (m && compareRelease(m[1], m[2], app.getVersion(), APP_BUILD) <= 0) rmSync(join(updDir(), name), { recursive: true, force: true })
    }
    // nhat ky script: giu gon (< 512 KB)
    if (existsSync(logFile()) && statSync(logFile()).size > 512 * 1024) {
      const t = readFileSync(logFile(), 'utf-8')
      writeFileSync(logFile(), t.slice(-128 * 1024))
    }
  } catch {
    /* bo qua */
  }
}

// ---------------------------------------------------------------------------
// Phieu tu may chu -> tai nen
// ---------------------------------------------------------------------------
/** Nhan phieu tu may chu (qua license.ts) hoac tu kiem. Export cho test. */
export async function handleOffer(raw: unknown, manual: boolean): Promise<void> {
  if (!updaterEnabled()) return
  const now = Date.now()
  if (raw === null || raw === undefined) {
    // may chu: khong co ban moi. Dang tai / da san sang ban moi hon (da ky) -> giu nguyen.
    if (!['downloading', 'ready', 'applying'].includes(st.phase)) {
      offer = null
      manifest = null
      setSt({ phase: 'idle', offer: undefined, progress: undefined, message: undefined, checkedAt: now })
    } else setSt({ checkedAt: now })
    return
  }
  const v = verifyOffer(raw, {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    build: APP_BUILD,
    force: forceSelftest
  })
  if (!v.ok) {
    if (v.notNewer) {
      if (!['downloading', 'ready', 'applying'].includes(st.phase)) setSt({ phase: 'idle', checkedAt: now })
      return
    }
    // phieu hong / sai chu ky: KHONG hien loi dai dang cho khach (khong co gi de bam) — chi ghi nhat ky + dong
    // "Kiem tra cap nhat" hien ly do
    log(`phieu bi tu choi: ${v.error}`)
    if (!['downloading', 'ready', 'applying'].includes(st.phase)) setSt({ message: v.error, checkedAt: now })
    return
  }
  const m = v.manifest
  const o = raw as UpdateOffer
  if (manifest && manifest.version === m.version && manifest.build === m.build) {
    offer = o // cung ban -> chi lay link tai moi (link cu co the het han)
    setSt({ checkedAt: now })
    if (manual && st.phase === 'error') startDownload()
    return
  }
  if (manifest && compareRelease(m.version, m.build, manifest.version, manifest.build) < 0) return // dang co ban moi hon
  if (st.phase === 'applying') return
  offer = o
  manifest = m
  stagedApp = ''
  downloadPath = join(updDir(), m.file)
  const skipped = readPersist().skip.includes(releaseKey(m.version, m.build))
  setSt({
    phase: 'available',
    offer: { version: m.version, build: m.build, notes: String(m.notes || ''), size: m.size, releasedAt: m.released_at },
    progress: undefined,
    message: skipped ? 'Lần cập nhật trước lên bản này bị lỗi (đã giữ bản cũ). Bấm "Tải lại" để thử lại.' : undefined,
    checkedAt: now
  })
  log(`co ban moi ${m.version}+${m.build} (${(m.size / 1048576).toFixed(0)} MB)${skipped ? ' — da loi truoc do, cho nguoi dung' : ''}`)
  if (!skipped || manual) startDownload()
}

/** Bat dau / thu lai tai nen (nut "Tai lai"). */
export function startDownload(): void {
  if (!manifest || job || st.phase === 'applying') return
  job = runDownload()
    .catch((e) => {
      const msg = String((e as Error).message || e)
      log(`tai / chuan bi LOI: ${msg}`)
      setSt({ phase: 'error', message: msg, progress: undefined })
    })
    .finally(() => {
      job = null
    })
}

async function runDownload(): Promise<void> {
  const m = manifest!
  mkdirSync(updDir(), { recursive: true })
  setSt({ phase: 'downloading', message: undefined, progress: { received: 0, total: m.size } })
  const dest = downloadPath
  let ok = existsSync(dest) && statSync(dest).size === m.size && (await sha512File(dest)) === m.sha512
  for (let round = 0; !ok && round < 2; round++) {
    // dung luong trong: file tai + (macOS) ban giai nen + du phong
    try {
      const fsInfo = statfsSync(updDir())
      const free = Number(fsInfo.bavail) * Number(fsInfo.bsize)
      const need = m.size * (IS_MAC ? 3.5 : 2.5) + 500 * 1048576
      if (free < need) {
        throw new Error(`Ổ đĩa còn trống ${(free / 1073741824).toFixed(1)} GB — cần khoảng ${(need / 1073741824).toFixed(1)} GB để cập nhật.`)
      }
    } catch (e) {
      if (String((e as Error).message).startsWith('Ổ đĩa')) throw e
    }
    await fetchToFile(dest + '.part', m)
    const got = await sha512File(dest + '.part')
    if (got === m.sha512) {
      rmSync(dest, { force: true })
      renameSync(dest + '.part', dest)
      ok = true
    } else {
      log(`SHA-512 sai (lan ${round + 1}) -> tai lai tu dau`)
      rmSync(dest + '.part', { force: true })
    }
  }
  if (!ok) throw new Error('File tải về bị hỏng (sai mã kiểm tra). Thử lại sau.')
  setSt({ progress: { received: m.size, total: m.size } })
  if (IS_MAC) stagedApp = await stageMac(dest, m)
  log(`san sang cap nhat ${m.version}+${m.build}`)
  setSt({ phase: 'ready', progress: undefined, message: undefined, ...preflight() })
}

/** Tai ve file .part: tai tiep (Range) khi rot mang, link het han (403) -> xin link moi, toi da 6 lan. */
async function fetchToFile(part: string, m: UpdateManifest): Promise<void> {
  let lastErr = ''
  let lastEmit = 0
  for (let attempt = 0; attempt < 6; attempt++) {
    let have = existsSync(part) ? statSync(part).size : 0
    if (have > m.size) {
      rmSync(part, { force: true })
      have = 0
    }
    if (have === m.size) return
    const ac = new AbortController()
    let idle = setTimeout(() => ac.abort(), 60000)
    try {
      const res = await net.fetch(offer!.url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal: ac.signal })
      if (res.status === 403 || res.status === 401) {
        clearTimeout(idle)
        log('link tai het han / bi tu choi -> xin link moi')
        const r = await requestUpdateOffer(false)
        if (!r.ok) throw new Error(r.message || 'Không lấy được link tải mới.')
        continue
      }
      if (res.status !== 200 && res.status !== 206) throw new Error(`Máy chủ trả HTTP ${res.status}`)
      if (res.status === 200) have = 0 // khong tai tiep duoc -> tai lai tu dau
      if (!res.body) throw new Error('Máy chủ không trả dữ liệu.')
      const ws = createWriteStream(part, { flags: have ? 'a' : 'w' })
      let wsErr: Error | null = null
      ws.on('error', (e) => (wsErr = e))
      const reader = res.body.getReader()
      let received = have
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          clearTimeout(idle)
          idle = setTimeout(() => ac.abort(), 60000)
          if (wsErr) throw wsErr
          if (!ws.write(value)) await once(ws, 'drain')
          received += value.length
          if (received > m.size) throw new Error('Dữ liệu tải về vượt dung lượng dự kiến.')
          if (Date.now() - lastEmit > 300) {
            lastEmit = Date.now()
            setSt({ progress: { received, total: m.size } })
          }
        }
      } finally {
        await new Promise<void>((r) => ws.end(() => r()))
      }
      if (wsErr) throw wsErr
      clearTimeout(idle)
      if (statSync(part).size === m.size) return
      lastErr = 'Tải về bị thiếu dữ liệu.'
    } catch (e) {
      clearTimeout(idle)
      const err = e as NodeJS.ErrnoException
      if (err && err.code === 'ENOSPC') throw new Error('Ổ đĩa đầy — giải phóng dung lượng rồi thử lại.')
      lastErr = ac.signal.aborted ? 'Mạng không phản hồi quá 60 giây.' : String(err?.message || e)
    }
    log(`tai lan ${attempt + 1} loi: ${lastErr}`)
    await sleep(Math.min(30000, 2000 * 2 ** attempt))
  }
  throw new Error('Không tải được bản cập nhật: ' + lastErr)
}

/** macOS: giai nen .zip (ditto giu symlink + chu ky), kiem goi app + chu ky ma, go quarantine. */
async function stageMac(zip: string, m: UpdateManifest): Promise<string> {
  const stage = join(updDir(), `stage-${m.version}-${m.build}`)
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })
  await run('/usr/bin/ditto', ['-x', '-k', zip, stage], 600000)
  const apps = readdirSync(stage).filter((n) => n.endsWith('.app'))
  if (apps.length !== 1) throw new Error('Gói cập nhật không đúng cấu trúc.')
  const newApp = join(stage, apps[0])
  const plist = join(newApp, 'Contents', 'Info.plist')
  const id = (await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', plist])).trim()
  const ver = (await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', plist])).trim()
  if (id !== BUNDLE_ID || ver !== m.version) throw new Error(`Gói cập nhật sai ứng dụng / phiên bản (${id} ${ver}).`)
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', newApp], 600000)
  await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', newApp]).catch(() => '')
  return newApp
}

/** Duong dan goi .app dang chay (macOS). */
const macBundle = () => resolve(process.execPath, '..', '..', '..')

/** Kiem truoc khi cap nhat duoc: macOS app chay tu .dmg / chua keo vao Applications (translocation) -> khong thay duoc. */
function preflight(): Partial<UpdateState> {
  if (IS_MAC) {
    const b = macBundle()
    if (!b.endsWith('.app') || b.includes('/AppTranslocation/') || b.startsWith('/Volumes/')) {
      return { message: 'Hãy kéo Agent Edit vào thư mục Ứng dụng (Applications), mở lại từ đó rồi bấm cập nhật.' }
    }
    let admin = false
    try {
      accessSync(dirname(b), fsc.W_OK)
      accessSync(b, fsc.W_OK)
    } catch {
      admin = true
    }
    return { needsAdmin: admin, message: undefined }
  }
  return { needsAdmin: false, message: undefined }
}

// ---------------------------------------------------------------------------
// Ap dung: chay script rieng roi thoat app
// ---------------------------------------------------------------------------
/** busy = renderer dang xu ly video (hang doi Tao video). */
export async function applyUpdate(busy = false): Promise<{ ok: boolean; error?: string }> {
  if (st.phase !== 'ready' || !manifest) return { ok: false, error: 'Bản cập nhật chưa sẵn sàng.' }
  if (busy) return { ok: false, error: 'Đang xử lý video — đợi xong rồi cập nhật.' }
  if ((renderStatus() as { running?: boolean }).running) return { ok: false, error: 'Đang xuất video — đợi xuất xong rồi cập nhật.' }
  const pf = preflight()
  if (pf.message) {
    setSt(pf)
    return { ok: false, error: pf.message }
  }
  const m = manifest
  setSt({ phase: 'applying', message: undefined })
  try {
    const from = releaseKey(app.getVersion(), APP_BUILD)
    const to = releaseKey(m.version, m.build)
    const rel = relaunchArgs(process.argv.slice(1))
    log(`ap dung ${to} (tu ${from})`)
    if (IS_MAC) {
      if (!stagedApp || !existsSync(stagedApp)) throw new Error('Không thấy bản đã giải nén — tải lại bản cập nhật.')
      const script = join(updDir(), 'apply.sh')
      writeFileSync(script, MAC_APPLY_SH, { mode: 0o755 })
      const args = [
        script,
        String(process.pid),
        macBundle(),
        stagedApp,
        join(dirname(stagedApp), 'old.app'),
        logFile(),
        markerPath(),
        from,
        to,
        'Agent Edit cần quyền quản trị để cập nhật lên bản mới.',
        ...rel
      ]
      const child = spawn('/bin/bash', args, { detached: true, stdio: 'ignore' })
      await new Promise<void>((res, rej) => {
        child.once('spawn', () => res())
        child.once('error', rej)
      })
      child.unref()
    } else {
      const exe = process.execPath
      const instDir = dirname(exe)
      const script = join(updDir(), 'apply.ps1')
      writeFileSync(script, '\ufeff' + WIN_APPLY_PS1, 'utf-8') // PowerShell 5.1 doc UTF-8 khi CO BOM
      await stopSidecarAndWait(10000)
      const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64')
      const msg =
        'Cập nhật Agent Edit không thành công và không tìm thấy ứng dụng sau khi cài.\n\n' +
        'Hãy chạy file cài đặt trong thư mục vừa mở để cài lại (dữ liệu và key của bạn vẫn được giữ nguyên).'
      const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const args = [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
        '-AppPid', String(process.pid), '-Setup', downloadPath, '-InstDir', instDir, '-Exe', exe, '-Log', logFile(),
        '-Marker', markerPath(), '-FromVer', from, '-ToVer', to, '-ArgsB64', b64(JSON.stringify(rel)), '-MsgB64', b64(msg)
      ]
      try {
        const child = spawn(ps, args, { detached: true, stdio: 'ignore', windowsHide: true })
        await new Promise<void>((res, rej) => {
          child.once('spawn', () => res())
          child.once('error', rej)
        })
        child.unref()
      } catch (e) {
        // PowerShell bi chan (chinh sach may cong ty...) -> chay thang bo cai im lang, tu mo app sau khi cai
        log(`khong chay duoc PowerShell (${String((e as Error).message || e)}) -> chay thang bo cai`)
        const child = spawn(downloadPath, [`/S --updated --force-run /D=${instDir}`], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          windowsVerbatimArguments: true
        })
        await new Promise<void>((res, rej) => {
          child.once('spawn', () => res())
          child.once('error', rej)
        })
        child.unref()
      }
    }
    // Thoat app (before-quit tat sidecar / render / may chu media). Bi chan (cua so tu choi dong...) -> thoat han sau 15s.
    setTimeout(() => app.exit(0), 15000)
    setImmediate(() => app.quit())
    return { ok: true }
  } catch (e) {
    const msg = String((e as Error).message || e)
    log(`ap dung LOI: ${msg}`)
    setSt({ phase: IS_MAC && (!stagedApp || !existsSync(stagedApp)) ? 'error' : 'ready', message: msg })
    return { ok: false, error: msg }
  }
}

/** Nut "Kiem tra cap nhat" (goi may chu op=update). */
export async function checkForUpdateNow(): Promise<UpdateState> {
  if (!updaterEnabled()) return st
  setSt({ checking: true })
  try {
    const r = await requestUpdateOffer(true)
    if (!r.ok) setSt({ message: r.message })
    // cho handleOffer (bat dong bo) kip cap nhat trang thai
    await sleep(50)
  } finally {
    setSt({ checking: false, checkedAt: Date.now() })
  }
  return st
}

// ---------------------------------------------------------------------------
// TU KIEM (ban dong goi): --update-selftest=<json> {offer, result, force?} — khong mo cua so, chay het luong tai -> kiem
// -> ap dung that (script thay app + mo lai). Ban moi mo len (co --agent-edit-updated) ghi ket qua roi thoat.
// scripts/selftest-update.mjs dung. Chu ky phieu van BAT BUOC (chi cho phep cai lai chinh ban do khi force).
// ---------------------------------------------------------------------------
export function selftestConfigPath(): string | undefined {
  return argOf(SELFTEST_FLAG)
}
export async function runUpdateSelftest(cfgPath: string): Promise<void> {
  let cfg: { offer: UpdateOffer; result: string; force?: boolean }
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
  } catch (e) {
    console.log('[UPD-SELFTEST] khong doc duoc cau hinh', String(e))
    app.exit(2)
    return
  }
  const out = (r: Record<string, unknown>) => {
    try {
      writeFileSync(cfg.result, JSON.stringify({ ...r, version: app.getVersion(), build: APP_BUILD, pid: process.pid, at: Date.now() }))
    } catch {
      /* bo qua */
    }
    console.log('[UPD-SELFTEST]', JSON.stringify(r))
  }
  if (argOf(UPDATED_FLAG) || argOf(UPDATE_FAILED_FLAG)) {
    const to = argOf(UPDATE_TO_FLAG)
    const mismatch = !!to && to !== releaseKey(app.getVersion(), APP_BUILD)
    out({
      phase: argOf(UPDATED_FLAG) && !mismatch ? 'updated' : 'failed',
      from: argOf(UPDATED_FLAG) || '',
      to: to || '',
      failed: argOf(UPDATE_FAILED_FLAG) || (mismatch ? `mo len ban khac ${to}` : '')
    })
    app.exit(0)
    return
  }
  if (!updaterEnabled()) {
    out({ phase: 'error', error: 'updater tat (ban day du / dev / nen tang khong ho tro)' })
    app.exit(1)
    return
  }
  forceSelftest = !!cfg.force
  await handleOffer(cfg.offer, true)
  const t0 = Date.now()
  while (st.phase === 'available' || st.phase === 'downloading') {
    if (Date.now() - t0 > 20 * 60000) break
    await sleep(200)
  }
  if (st.phase !== 'ready') {
    out({ phase: 'error', error: st.message || `phase=${st.phase}` })
    app.exit(1)
    return
  }
  out({ phase: 'applying' })
  const r = await applyUpdate(false)
  if (!r.ok) {
    out({ phase: 'error', error: r.error })
    app.exit(1)
  }
}
