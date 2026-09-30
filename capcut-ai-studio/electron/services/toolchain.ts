// BO CONG CU APP CAN TREN MAY — tai, kiem, cai (Doctor goi; xem doctor.ts).
//
// Moc phien ban + nguon tai + SHA-256 nam o MOT file: sidecar/assets/toolchain.json (Python doc cung file).
// Nguyen tac:
//  - Chi cai trong thu muc NGUOI DUNG (khong sudo): ~/.capcut-studio/tools/bin (ffmpeg, ffprobe, codex),
//    ~/.local/bin (uv / Claude Code / agy do trinh cai chinh chu dat), venv sidecar, cache Hugging Face.
//  - Tai ve -> kiem SHA-256 GHIM san truoc khi dung; sai ma = bo, bao loi (khong chay file la).
//    uv / Claude Code / agy: trinh cai chinh chu (tu kiem checksum), uv + Claude ghim phien ban.
//  - Khong dung / ghi de ban nguoi dung tu cai: ban cua app nam rieng o tools/bin va duoc tim TRUOC.
import { createHash } from 'crypto'
import { execFile, spawn } from 'child_process'
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { augmentedEnv } from './env'
import { TOOLS_BIN, sidecarDir } from './paths'

export type Log = (line: string) => void

interface PinnedFile {
  sha256: string
  size: number
}

export interface Manifest {
  macos_min: string
  macos_why: string
  uv: { min: string; install_version: string; installer: string }
  python: { series: string }
  python_packages: { lock: string; top: string[] }
  ffmpeg: {
    version: string
    url: string
    zip_sha256: string
    zip_dir: string
    files: Record<string, PinnedFile>
    encoders: string[]
    filters: string[]
  }
  whisper: { model: string; repo: string; revision: string; files: Record<string, PinnedFile> }
  chrome: { version: string }
  cli: {
    codex: { min: string; install_version: string; url: string; sha256: string; member: string }
    claude: { min: string; install_version: string; installer: string }
    agy: { min: string; installer: string }
  }
}

let cached: Manifest | null = null
export function manifest(): Manifest {
  if (!cached) cached = JSON.parse(readFileSync(join(sidecarDir(), 'assets', 'toolchain.json'), 'utf-8'))
  return cached as Manifest
}

export const lockPath = (): string => join(sidecarDir(), manifest().python_packages.lock)
export const probeScript = (): string => join(sidecarDir(), 'scripts', 'toolchain.py')

// ---------------------------------------------------------------------------
// Phien ban
// ---------------------------------------------------------------------------
/** "codex-cli 0.156.1" / "2.1.283 (Claude Code)" -> [0,156,1]; khong doc duoc -> null */
export function parseVersion(text: string | null | undefined): number[] | null {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text || '')
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null
}

export function versionGte(have: string | null | undefined, min: string): boolean {
  const a = parseVersion(have)
  const b = parseVersion(min)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

// ---------------------------------------------------------------------------
// Chay lenh
// ---------------------------------------------------------------------------
export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...augmentedEnv(), NO_COLOR: '1', ...extra }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

/** Chay lenh, KHONG nem loi: {code, stdout, stderr} (code -1 = khong chay duoc / het gio). */
export function runCmd(
  cmd: string,
  args: string[],
  opts: { timeout?: number; env?: NodeJS.ProcessEnv; cwd?: string } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { env: opts.env || cleanEnv(), cwd: opts.cwd, timeout: opts.timeout ?? 30000, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : -1) : 0
        resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') })
      }
    )
  })
}

/** Chay lenh + chuyen tung dong ra onLog; ma thoat != 0 -> nem loi (kem vai dong cuoi). */
export function streamCmd(
  cmd: string,
  args: string[],
  onLog: Log,
  opts: { env?: NodeJS.ProcessEnv; cwd?: string; show?: string; timeoutMs?: number } = {}
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    onLog(`$ ${opts.show || [cmd, ...args].join(' ')}`)
    const child = spawn(cmd, args, { env: opts.env || cleanEnv(), cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const lines: string[] = []
    let buf = ''
    const feed = (d: Buffer) => {
      // \r: thanh tien trinh cua trinh cai -> chi lay ban cuoi moi dong
      buf += d.toString('utf-8').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      const parts = buf.split(/\r?\n/)
      buf = parts.pop() || ''
      for (const raw of parts) {
        const line = raw.split('\r').pop()!.trimEnd()
        if (!line.trim()) continue
        lines.push(line)
        if (lines.length > 400) lines.shift()
        onLog(line)
      }
    }
    child.stdout.on('data', feed)
    child.stderr.on('data', feed)
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          try {
            child.kill('SIGTERM')
          } catch {
            /* da thoat */
          }
        }, opts.timeoutMs)
      : null
    child.on('error', (e) => {
      if (timer) clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (buf.trim()) {
        lines.push(buf.trim())
        onLog(buf.trim())
      }
      if (code === 0) resolve(lines)
      else reject(new Error(`Lệnh thất bại (mã ${code}): ${lines.slice(-3).join(' | ')}`))
    })
  })
}

// ---------------------------------------------------------------------------
// Tai + kiem ma
// ---------------------------------------------------------------------------
export function sha256File(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(p)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')))
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 1 luot tai: tiep tuc tu byte `have` (HTTP Range) neu may chu cho; tra tong so byte can co. */
async function fetchInto(url: string, dest: string, onLog: Log, prog: { lastPct: number }): Promise<number> {
  const have = existsSync(dest) ? statSync(dest).size : 0
  const res = await fetch(url, { redirect: 'follow', headers: have ? { Range: `bytes=${have}-` } : {} })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const resumed = have > 0 && res.status === 206
  if (have && !resumed) onLog('  Máy chủ không cho tải tiếp — tải lại từ đầu.')
  const base = resumed ? have : 0
  const total = base + Number(res.headers.get('content-length') || 0)
  let got = base
  const body = Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream)
  body.on('data', (d: Buffer) => {
    got += d.length
    const pct = total ? Math.floor((got / total) * 100) : -1
    if (pct >= prog.lastPct + 10) {
      prog.lastPct = pct
      onLog(`  ${pct}% (${(got / 1e6).toFixed(1)}/${(total / 1e6).toFixed(1)} MB)`)
    }
  })
  await pipeline(body, createWriteStream(dest, { flags: resumed ? 'a' : 'w' }))
  return total
}

/**
 * Tai `url` vao `dest` (theo redirect), bao % moi ~10%; kiem SHA-256 neu co.
 * Mang chap chon (do that 2026-09-28: 1/3 luot tai 42 MB bi ngat "terminated") -> tai TIEP tu cho dut (toi 6 lan);
 * sai ma SHA-256 -> xoa, tai lai TU DAU (toi 3 luot) — van sai moi bao loi (khong bao gio dung file sai ma).
 */
export async function download(url: string, dest: string, onLog: Log, sha256?: string): Promise<void> {
  onLog(`Tải ${url}`)
  let last = ''
  for (let full = 1; full <= 3; full++) {
    rmSync(dest, { force: true })
    const prog = { lastPct: -10 }
    let total = 0
    let done = false
    for (let part = 1; part <= 6 && !done; part++) {
      try {
        total = await fetchInto(url, dest, onLog, prog)
        const size = existsSync(dest) ? statSync(dest).size : 0
        if (total && size < total) throw new Error(`mới có ${(size / 1e6).toFixed(1)}/${(total / 1e6).toFixed(1)} MB`)
        done = true
      } catch (e) {
        last = String((e as Error)?.message || e).slice(0, 160)
        onLog(`  Tải bị ngắt (${last}) — tải tiếp (${part}/6)...`)
        await sleep(1500 * part)
      }
    }
    if (!done) continue
    const size = statSync(dest).size
    if (total && size !== total) {
      last = `kích thước ${size} khác ${total}`
      onLog(`  File tải về sai kích thước (${last}) — tải lại từ đầu (${full}/3).`)
      continue
    }
    if (!sha256) return
    const got256 = await sha256File(dest)
    if (got256 === sha256) {
      onLog(`  Đã kiểm SHA-256: khớp ${sha256.slice(0, 12)}…`)
      return
    }
    last = `Mã SHA-256 không khớp (tải về ${got256.slice(0, 12)}…, cần ${sha256.slice(0, 12)}…)`
    onLog(`  ${last} — xoá, tải lại từ đầu (${full}/3).`)
  }
  rmSync(dest, { force: true })
  throw new Error(`Tải ${url.split('/').pop()} không thành công sau 3 lượt: ${last} — đã xoá file, không dùng.`)
}

function tempDir(prefix: string): string {
  const base = join(TOOLS_BIN, '..', 'tmp')
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, prefix))
}

/** Dat file vao TOOLS_BIN (qua ten tam roi doi ten -> khong bao gio co file do dang). */
function placeTool(src: string, name: string): string {
  mkdirSync(TOOLS_BIN, { recursive: true })
  const dst = join(TOOLS_BIN, name)
  const tmp = dst + '.moi'
  copyFileSync(src, tmp)
  chmodSync(tmp, 0o755)
  renameSync(tmp, dst)
  return dst
}

// ---------------------------------------------------------------------------
// Noi tim CLI — CUNG thu tu sidecar dung (cli_providers._EXTRA_DIRS roi PATH)
// ---------------------------------------------------------------------------
export function cliDirs(): string[] {
  const h = homedir()
  const dirs = [
    TOOLS_BIN,
    join(h, '.local', 'bin'),
    join(h, '.local', 'node', 'bin'),
    join(h, '.bun', 'bin'),
    join(h, '.volta', 'bin'),
    join(h, '.cargo', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin'
  ]
  const path = (augmentedEnv().PATH || '').split(':').filter(Boolean)
  return Array.from(new Set([...dirs, ...path]))
}

export function findCli(bin: string): string | null {
  for (const d of cliDirs()) {
    const p = join(d, bin)
    try {
      if (existsSync(p) && statSync(p).isFile()) return p
    } catch {
      /* bo qua */
    }
  }
  return null
}

export async function cliVersion(path: string): Promise<string | null> {
  const r = await runCmd(path, ['--version'], { timeout: 25000 })
  const text = (r.stdout || r.stderr).trim()
  return r.code === 0 && text ? text.split('\n')[0].slice(0, 80) : null
}

// ---------------------------------------------------------------------------
// FFMPEG (ban tinh, ghim SHA-256) — sidecar remotion_plan._ffbin tim TOOLS_BIN truoc
// ---------------------------------------------------------------------------
const FF_STAMP = () => join(TOOLS_BIN, '.ffmpeg-ok.json')

/** Hash 2 file ~50MB moi lan mo app ton ~0.3s -> nho (kich thuoc + gio sua) cua lan kiem dung gan nhat. */
async function pinnedOk(p: string, pin: PinnedFile, stamp: Record<string, { size: number; mtimeMs: number; sha256: string }>): Promise<boolean> {
  if (!existsSync(p)) return false
  const st = statSync(p)
  if (st.size !== pin.size) return false
  const s = stamp[p]
  if (s && s.size === st.size && s.mtimeMs === st.mtimeMs && s.sha256 === pin.sha256) return true
  const h = await sha256File(p)
  if (h !== pin.sha256) return false
  stamp[p] = { size: st.size, mtimeMs: st.mtimeMs, sha256: h }
  return true
}

export async function ffmpegStatus(): Promise<{ ok: boolean; detail: string; found?: string; path?: string }> {
  const m = manifest().ffmpeg
  let stamp: Record<string, { size: number; mtimeMs: number; sha256: string }> = {}
  try {
    stamp = JSON.parse(readFileSync(FF_STAMP(), 'utf-8'))
  } catch {
    stamp = {}
  }
  const bad: string[] = []
  for (const [name, pin] of Object.entries(m.files)) {
    if (!(await pinnedOk(join(TOOLS_BIN, name), pin, stamp))) bad.push(name)
  }
  if (bad.length) {
    const any = bad.some((n) => existsSync(join(TOOLS_BIN, n)))
    if (any) return { ok: false, detail: `Sai bản (mã SHA-256 khác bản ghim): ${bad.join(', ')}` }
    const local = await localPinnedFfmpeg(false)
    return {
      ok: false,
      detail: local
        ? `Máy đã có ffmpeg đúng bản này (${local.ffmpeg}) — app chép sang thư mục riêng của app (vài giây, không tải).`
        : 'Chưa cài bản ffmpeg của app.'
    }
  }
  try {
    writeFileSync(FF_STAMP(), JSON.stringify(stamp))
  } catch {
    /* khong ghi duoc stamp -> lan sau hash lai */
  }
  const r = await runCmd(join(TOOLS_BIN, 'ffmpeg'), ['-hide_banner', '-version'], { timeout: 15000 })
  if (r.code !== 0) return { ok: false, detail: 'ffmpeg không chạy được trên máy này: ' + (r.stderr || r.stdout).slice(0, 160) }
  const ver = (/ffmpeg version (\S+)/.exec(r.stdout) || [])[1] || m.version
  return { ok: true, found: ver, path: join(TOOLS_BIN, 'ffmpeg'), detail: 'Đúng bản ghim (đã kiểm SHA-256).' }
}

/** Kiem ban da dat co du bo ma hoa / bo loc app dung (x264, VP9 alpha, zscale HDR->SDR, silencedetect...). */
export async function ffmpegFeatures(): Promise<string[]> {
  const m = manifest().ffmpeg
  const ff = join(TOOLS_BIN, 'ffmpeg')
  const enc = await runCmd(ff, ['-hide_banner', '-encoders'], { timeout: 15000 })
  const fil = await runCmd(ff, ['-hide_banner', '-filters'], { timeout: 15000 })
  const miss: string[] = []
  for (const e of m.encoders) if (!new RegExp(`\\s${e.replace(/[-]/g, '\\-')}\\s`).test(enc.stdout)) miss.push(e)
  for (const f of m.filters) if (!new RegExp(`\\s${f}\\s`).test(fil.stdout)) miss.push(f)
  return miss
}

/** ffmpeg + ffprobe DUNG ban ghim da co san tren may (vd ban static_ffmpeg cu tro tu ~/.local/bin, thoi CapCut)
 *  -> {ten: duong dan that}; chi du ca 2 moi tra. full=false: chi so kich thuoc (nhanh, dung luc kiem). */
async function localPinnedFfmpeg(full: boolean): Promise<Record<string, string> | null> {
  const m = manifest().ffmpeg
  const local: Record<string, string> = {}
  for (const [name, pin] of Object.entries(m.files)) {
    for (const d of [join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']) {
      try {
        const real = realpathSync(join(d, name))
        if (statSync(real).size === pin.size && (!full || (await sha256File(real)) === pin.sha256)) {
          local[name] = real
          break
        }
      } catch {
        /* khong co */
      }
    }
  }
  return Object.keys(local).length === Object.keys(m.files).length ? local : null
}

export async function installFfmpeg(onLog: Log): Promise<void> {
  const m = manifest().ffmpeg
  // May da co DUNG ban nay -> chep, khong tai lai
  const local = await localPinnedFfmpeg(true)
  if (local) {
    for (const [name, src] of Object.entries(local)) {
      onLog(`Máy đã có đúng bản ${name} ${m.version} (${src}) — chép vào thư mục công cụ của app, không tải lại.`)
      placeTool(src, name)
    }
  } else {
    const work = tempDir('ffmpeg-')
    try {
      const zip = join(work, 'ffmpeg.zip')
      await download(m.url, zip, onLog, m.zip_sha256)
      await streamCmd('/usr/bin/ditto', ['-x', '-k', zip, work], onLog)
      for (const [name, pin] of Object.entries(m.files)) {
        const p = join(work, m.zip_dir, name)
        if (!existsSync(p) || (await sha256File(p)) !== pin.sha256) throw new Error(`${name} trong gói tải về không khớp mã SHA-256`)
        placeTool(p, name)
      }
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }
  const st = await ffmpegStatus()
  if (!st.ok) throw new Error(st.detail)
  const miss = await ffmpegFeatures()
  if (miss.length) throw new Error('ffmpeg thiếu: ' + miss.join(', '))
  onLog(`ffmpeg ${st.found} sẵn sàng tại ${TOOLS_BIN} (đủ x264, VP9, zscale, silencedetect…).`)
}

// ---------------------------------------------------------------------------
// uv (Astral) — trinh cai chinh chu, GHIM phien ban
// ---------------------------------------------------------------------------
export async function installUv(onLog: Log): Promise<void> {
  const u = manifest().uv
  // UV_NO_MODIFY_PATH: khong sua ~/.zshrc cua nguoi dung (app tu tim uv o ~/.local/bin)
  await streamCmd('/bin/sh', ['-c', `curl -LsSf ${u.installer} | sh`], onLog, {
    env: cleanEnv({ UV_NO_MODIFY_PATH: '1', INSTALLER_NO_MODIFY_PATH: '1' }),
    show: `curl -LsSf ${u.installer} | sh`,
    timeoutMs: 10 * 60 * 1000
  })
}

// ---------------------------------------------------------------------------
// Codex CLI — ban chinh chu tren GitHub (openai/codex), GHIM phien ban + SHA-256; khong can Node / npm
// ---------------------------------------------------------------------------
export async function installCodex(onLog: Log): Promise<void> {
  const c = manifest().cli.codex
  const work = tempDir('codex-')
  try {
    const tgz = join(work, 'codex.tar.gz')
    await download(c.url, tgz, onLog, c.sha256)
    await streamCmd('/usr/bin/tar', ['-xzf', tgz, '-C', work, c.member], onLog)
    const dst = placeTool(join(work, c.member), 'codex')
    const v = await cliVersion(dst)
    if (!versionGte(v, c.min)) throw new Error(`Codex vừa cài báo phiên bản "${v}" (cần ≥ ${c.min})`)
    onLog(`Codex CLI ${v} sẵn sàng tại ${dst}. Đăng nhập ChatGPT trong Cài đặt API để tạo ảnh AI.`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Claude Code — trinh cai chinh chu (tu kiem checksum), GHIM phien ban; da co ban cu -> `claude update`
// ---------------------------------------------------------------------------
export async function installClaude(onLog: Log): Promise<void> {
  const c = manifest().cli.claude
  const cur = findCli('claude')
  if (cur) {
    try {
      await streamCmd(cur, ['update'], onLog, { timeoutMs: 10 * 60 * 1000 })
      if (versionGte(await cliVersion(cur), c.min)) return
    } catch (e) {
      onLog('claude update lỗi (' + String(e).slice(0, 160) + ') — cài lại bằng trình cài chính chủ.')
    }
  }
  const cmd = `curl -fsSL ${c.installer} | bash -s ${c.install_version}`
  await streamCmd('/bin/bash', ['-c', cmd], onLog, { show: cmd, timeoutMs: 15 * 60 * 1000 })
  const p = findCli('claude')
  const v = p ? await cliVersion(p) : null
  if (!versionGte(v, c.min)) throw new Error(`Claude Code sau khi cài báo "${v || 'không thấy lệnh claude'}" (cần ≥ ${c.min})`)
}

// ---------------------------------------------------------------------------
// Antigravity CLI (agy) — trinh cai chinh chu cua Google (kiem SHA-512), ban moi nhat (agy tu cap nhat)
// ---------------------------------------------------------------------------
export async function installAgy(onLog: Log): Promise<void> {
  const a = manifest().cli.agy
  const cmd = `curl -fsSL ${a.installer} | bash`
  await streamCmd('/bin/bash', ['-c', cmd], onLog, { show: cmd, timeoutMs: 15 * 60 * 1000 })
  const p = findCli('agy')
  const v = p ? await cliVersion(p) : null
  if (!versionGte(v, a.min)) throw new Error(`Antigravity CLI sau khi cài báo "${v || 'không thấy lệnh agy'}" (cần ≥ ${a.min})`)
}

/** Tai Chrome Headless Shell (ban Remotion yeu cau) — chay trong tien trinh render rieng. */
export function chromeVersion(remotionHome: string): string | null {
  try {
    return readFileSync(join(remotionHome, 'node_modules', '.remotion', 'chrome-headless-shell', 'VERSION'), 'utf-8').trim()
  } catch {
    return null
  }
}

/** Thu muc tam cua tools/ (don lai sau moi lan cai hong giua chung) */
export function cleanupTemp(): void {
  try {
    rmSync(join(TOOLS_BIN, '..', 'tmp'), { recursive: true, force: true })
  } catch {
    /* bo qua */
  }
}

