// BO CONG CU APP CAN TREN MAY — tai, kiem, cai (Doctor goi; xem doctor.ts).
//
// Moc phien ban + nguon tai + SHA-256 nam o MOT file: sidecar/assets/toolchain.json (Python doc cung file).
// Truong o ngoai = ban macOS arm64; `platforms.<platformKey>` ghi de theo nen tang (Windows: ffmpeg.exe, goi Codex
// Windows, trinh cai install.ps1...).
// Nguyen tac:
//  - Chi cai trong thu muc NGUOI DUNG (khong sudo / khong admin): ~/.capcut-studio/tools/bin (ffmpeg, ffprobe, codex),
//    ~/.capcut-studio/tools/codex (goi Codex Windows), ~/.capcut-studio/models (model thi giac may Windows),
//    ~/.local/bin (uv / Claude Code do trinh cai chinh chu dat), %LOCALAPPDATA%\agy\bin (agy Windows), cache Hugging Face.
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
import { delimiter, join } from 'path'
import { IS_WIN, augmentedEnv, cmdQuote, exeName, findIn, killTree, needsShell, pathKey, systemTar } from './env'
import { ENGINE_HOME, TOOLS_BIN, USER_MODELS_DIR, bundledFfmpegZip, bundledModelsDir, sidecarDir } from './paths'

export type Log = (line: string) => void

interface PinnedFile {
  sha256: string
  size: number
}

/** 1 nen tang cua python nhung (python-build-standalone install_only). */
export interface PyEmbedTarget {
  url: string
  sha256: string
  /** thu muc goc ben trong archive ("python") */
  archive_top: string
  /** duong dan interpreter trong resources/python (macOS: bin/python3.12, Windows: python.exe) */
  bin: string
}

/** ffmpeg ghim cho 1 nen tang */
export interface FfSpec {
  version: string
  url: string
  zip_sha256: string
  zip_dir: string
  files: Record<string, PinnedFile>
  encoders: string[]
  filters: string[]
}

export interface CodexSpec {
  min: string
  install_version: string
  url: string
  sha256: string
  /** macOS: ten file trong tar.gz */
  member?: string
  /** Windows: goi codex-package (bin/codex.exe + codex-resources) */
  package?: boolean
  entry?: string
}

export interface VisionModel {
  use: string
  license: string
  url: string
  sha256: string
  size: number
  bundle: boolean
}

interface PlatformOverride {
  os?: { min_build: number; label: string; why: string }
  ffmpeg?: Partial<FfSpec>
  codex?: Partial<CodexSpec>
  claude?: { installer: string }
  agy?: { installer: string }
  uv?: { installer: string }
}

export interface Manifest {
  macos_min: string
  macos_why: string
  uv: { min: string; install_version: string; installer: string }
  python: { series: string }
  python_embed: {
    version: string
    ext_suffix: Record<string, string>
    /** khoa = `${process.platform}-${arch rut gon}` (vd darwin-arm64); null = chua ho tro */
  } & Record<string, PyEmbedTarget | null | string | Record<string, string>>
  python_packages: { lock: string; top: string[] }
  ffmpeg: FfSpec
  whisper: { model: string; repo: string; revision: string; files: Record<string, PinnedFile> }
  chrome: { version: string }
  cli: {
    codex: CodexSpec
    claude: { min: string; install_version: string; installer: string }
    agy: { min: string; installer: string }
  }
  platforms?: Record<string, PlatformOverride>
  vision_models?: Record<string, VisionModel>
}

let cached: Manifest | null = null
export function manifest(): Manifest {
  if (!cached) cached = JSON.parse(readFileSync(join(sidecarDir(), 'assets', 'toolchain.json'), 'utf-8'))
  return cached as Manifest
}

export const lockPath = (): string => join(sidecarDir(), manifest().python_packages.lock)
export const probeScript = (): string => join(sidecarDir(), 'scripts', 'toolchain.py')

// ---------------------------------------------------------------------------
// Nen tang
// ---------------------------------------------------------------------------
/** Khoa nen tang dung trong python_embed / platforms: darwin-arm64 / darwin-x64 / win-x64. */
export function platformKey(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'win32') return `win-${arch}`
  return `${process.platform}-${arch}` // darwin-arm64 / darwin-x64
}

/** Muc python_embed cho nen tang hien tai (null = chua ho tro nen tang do). */
export function pyEmbedTarget(): PyEmbedTarget | null {
  const t = manifest().python_embed[platformKey()]
  return t && typeof t === 'object' && 'url' in t ? (t as PyEmbedTarget) : null
}

/** Ghi de theo nen tang (toolchain.json -> platforms[platformKey()]); macOS arm64 = khong ghi de. */
function override(): PlatformOverride {
  return manifest().platforms?.[platformKey()] || {}
}

/** ffmpeg ghim cho may nay (Windows: zip win32 + ffmpeg.exe / ffprobe.exe). */
export function ffSpec(): FfSpec {
  return { ...manifest().ffmpeg, ...(override().ffmpeg || {}) } as FfSpec
}

/** Codex ghim cho may nay (Windows: goi codex-package). */
export function codexSpec(): CodexSpec {
  return { ...manifest().cli.codex, ...(override().codex || {}) } as CodexSpec
}

/** Trinh cai chinh chu (Windows: install.ps1). */
export function installerOf(name: 'claude' | 'agy' | 'uv'): string {
  const o = override()[name]
  if (o?.installer) return o.installer
  return name === 'uv' ? manifest().uv.installer : manifest().cli[name].installer
}

/** Yeu cau he dieu hanh theo nen tang (Windows: build toi thieu); null = dung macos_min. */
export function osReq(): { min_build: number; label: string; why: string } | null {
  return override().os || null
}

/** Duoi ten extension Python bien dich (.so tren macOS, .pyd tren Windows). */
export function pyExtSuffix(): string {
  const map = manifest().python_embed.ext_suffix as Record<string, string>
  return map[process.platform] || '.cpython-312-darwin.so'
}

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

/** PowerShell cua Windows (duong dan tuyet doi — khong phu thuoc PATH). */
export function powershell(): string {
  return join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** Chay lenh, KHONG nem loi: {code, stdout, stderr} (code -1 = khong chay duoc / het gio). */
export function runCmd(
  cmd: string,
  args: string[],
  opts: { timeout?: number; env?: NodeJS.ProcessEnv; cwd?: string } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // Windows: .cmd / .bat (vd codex cai bang npm) chi chay duoc qua shell (Node, CVE-2024-27980)
    const shell = needsShell(cmd)
    execFile(
      shell ? cmdQuote(cmd) : cmd,
      shell ? args.map(cmdQuote) : args,
      {
        env: opts.env || cleanEnv(),
        cwd: opts.cwd,
        timeout: opts.timeout ?? 30000,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true,
        shell
      },
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
    const shell = needsShell(cmd)
    const child = spawn(shell ? cmdQuote(cmd) : cmd, shell ? args.map(cmdQuote) : args, {
      env: opts.env || cleanEnv(),
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell
    })
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
          // Windows: trinh cai (powershell -> tai ve -> cai) la CAY tien trinh -> dung ca cay
          killTree(child.pid, () => {
            try {
              child.kill('SIGTERM')
            } catch {
              /* da thoat */
            }
          })
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

/** Chay 1 doan PowerShell (Windows) — trinh cai chinh chu dang `irm <url> | iex`. */
function streamPs(script: string, onLog: Log, opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number; show?: string } = {}) {
  return streamCmd(powershell(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], onLog, {
    env: opts.env,
    timeoutMs: opts.timeoutMs,
    show: opts.show || script
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
  // Doc tung khuc -> CHEP ra Buffer rieng -> ghi, CHO o dia nhan xong (drain) moi doc tiep.
  // Su co that 2026-10-01 (Windows, file 154 / 224 MB): dung kich thuoc nhung SHA-256 moi lan mot khac — o dia ghi cham
  // (Defender quet luc ghi) -> khuc cho ghi trong hang doi bi ghi de khi vung nho duoc dung lai cho lan doc sau.
  const reader = (res.body as unknown as import('stream/web').ReadableStream<Uint8Array>).getReader()
  const ws = createWriteStream(dest, { flags: resumed ? 'a' : 'w' })
  let wsErr: Error | null = null
  ws.on('error', (e) => (wsErr = e))
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (wsErr) throw wsErr
      const buf = Buffer.from(value) // ban sao rieng
      got += buf.length
      if (!ws.write(buf)) await new Promise<void>((r) => ws.once('drain', () => r()))
      const pct = total ? Math.floor((got / total) * 100) : -1
      if (pct >= prog.lastPct + 10) {
        prog.lastPct = pct
        onLog(`  ${pct}% (${(got / 1e6).toFixed(1)}/${(total / 1e6).toFixed(1)} MB)`)
      }
    }
  } finally {
    await new Promise<void>((r) => ws.end(() => r()))
  }
  if (wsErr) throw wsErr
  return total
}

/** Tai bang curl CUA HE THONG (Windows 10 1803+ co san System32\curl.exe; macOS /usr/bin/curl) — duong du phong khi
 *  ban tai bang Node bi sai ma. Tra true neu chay xong (kiem ma o noi goi). */
async function curlInto(url: string, dest: string, onLog: Log): Promise<boolean> {
  const curl = IS_WIN ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe') : '/usr/bin/curl'
  if (!existsSync(curl)) return false
  rmSync(dest, { force: true })
  onLog('  Tải lại bằng curl của hệ thống...')
  try {
    await streamCmd(curl, ['-L', '--fail', '--retry', '5', '--retry-delay', '2', '-sS', '-o', dest, url], onLog, {
      show: `curl -L -o ${dest.split(/[\\/]/).pop()} ${url}`,
      timeoutMs: 60 * 60 * 1000
    })
    return existsSync(dest)
  } catch (e) {
    onLog('  curl lỗi: ' + String((e as Error)?.message || e).slice(0, 200))
    return false
  }
}

/**
 * Tai `url` vao `dest` (theo redirect), bao % moi ~10%; kiem SHA-256 neu co.
 * Mang chap chon (do that 2026-09-28: 1/3 luot tai 42 MB bi ngat "terminated") -> tai TIEP tu cho dut (toi 6 lan);
 * sai ma SHA-256 -> xoa, tai lai TU DAU (toi 3 luot) — van sai moi bao loi (khong bao gio dung file sai ma).
 */
export async function download(url: string, dest: string, onLog: Log, sha256?: string): Promise<void> {
  onLog(`Tải ${url}`)
  let last = ''
  let viaCurl = false
  for (let full = 1; full <= 3; full++) {
    rmSync(dest, { force: true })
    const prog = { lastPct: -10 }
    let total = 0
    let done = false
    // Lan truoc da SAI MA (khong phai dut mang) -> doi sang curl cua he thong (ngan xep mang / ghi file khac han)
    if (viaCurl && (await curlInto(url, dest, onLog))) {
      done = true
      total = 0
    }
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
    viaCurl = true
  }
  rmSync(dest, { force: true })
  throw new Error(`Tải ${url.split('/').pop()} không thành công sau 3 lượt: ${last} — đã xoá file, không dùng.`)
}

function tempDir(prefix: string): string {
  const base = join(TOOLS_BIN, '..', 'tmp')
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, prefix))
}

/** Xoa thu muc (Windows: Defender / trinh lap chi muc co the giu file vai giay -> thu lai). */
function rmTree(p: string): void {
  rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}

/** Dat file vao TOOLS_BIN (qua ten tam roi doi ten -> khong bao gio co file do dang). */
function placeTool(src: string, name: string): string {
  mkdirSync(TOOLS_BIN, { recursive: true })
  const dst = join(TOOLS_BIN, name)
  const tmp = dst + '.moi'
  copyFileSync(src, tmp)
  chmodSync(tmp, 0o755)
  if (IS_WIN && existsSync(dst)) {
    // Windows khong cho doi ten DE len file dang chay (ffmpeg.exe sidecar dang dung) -> xoa truoc, bao ro neu khoa
    try {
      rmSync(dst, { force: true, maxRetries: 5, retryDelay: 400 })
    } catch (e) {
      rmSync(tmp, { force: true })
      throw new Error(`${name} đang được dùng (đóng các video đang xử lý rồi thử lại): ${String(e).slice(0, 120)}`)
    }
  }
  renameSync(tmp, dst)
  return dst
}

/** Giai nen .zip / .tar.gz (macOS: ditto cho zip nhu cu; Windows: tar.exe cua he thong — bsdtar doc ca zip). */
async function extract(archive: string, dest: string, onLog: Log, members: string[] = []): Promise<void> {
  if (!IS_WIN && /\.zip$/i.test(archive)) {
    await streamCmd('/usr/bin/ditto', ['-x', '-k', archive, dest], onLog)
    return
  }
  const flag = /\.zip$/i.test(archive) ? '-xf' : '-xzf'
  await streamCmd(systemTar(), [flag, archive, '-C', dest, ...members], onLog)
}

// ---------------------------------------------------------------------------
// Noi tim CLI — CUNG thu tu sidecar dung (cli_providers._EXTRA_DIRS roi PATH)
// ---------------------------------------------------------------------------
/** Goi Codex chinh chu tren Windows (bin/codex.exe + codex-resources) nam nguyen khoi o day. */
export const CODEX_PKG_DIR = join(ENGINE_HOME, 'tools', 'codex')
export const CODEX_PKG_BIN = join(CODEX_PKG_DIR, 'bin')

export function cliDirs(): string[] {
  const h = homedir()
  const env = augmentedEnv()
  const path = (env[pathKey(env)] || '').split(delimiter).filter(Boolean)
  if (IS_WIN) {
    const la = process.env.LOCALAPPDATA || join(h, 'AppData', 'Local')
    const ra = process.env.APPDATA || join(h, 'AppData', 'Roaming')
    const wdirs = [
      TOOLS_BIN,
      CODEX_PKG_BIN,
      join(h, '.local', 'bin'),
      join(la, 'agy', 'bin'),
      join(ra, 'npm'),
      join(h, '.bun', 'bin'),
      join(la, 'Volta', 'bin'),
      join(h, '.cargo', 'bin')
    ]
    return Array.from(new Set([...wdirs, ...path]))
  }
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
  return Array.from(new Set([...dirs, ...path]))
}

/** Tim CLI theo ten (Windows them .exe / .cmd). */
export function findCli(bin: string): string | null {
  return findIn(cliDirs(), bin)
}

export async function cliVersion(path: string): Promise<string | null> {
  const r = await runCmd(path, ['--version'], { timeout: 25000 })
  const text = (r.stdout || r.stderr).trim()
  return r.code === 0 && text ? text.split(/\r?\n/)[0].slice(0, 80) : null
}

// ---------------------------------------------------------------------------
// FFMPEG (ban tinh, ghim SHA-256) — sidecar winsupport.ffbin tim TOOLS_BIN truoc
// ---------------------------------------------------------------------------
const FF_STAMP = () => join(TOOLS_BIN, '.ffmpeg-ok.json')
const ffPath = (name: 'ffmpeg' | 'ffprobe') => join(TOOLS_BIN, exeName(name))

/** Zip ffmpeg ghim nhung SAN trong app (scripts/bundle-ffmpeg.mjs) -> cai khong can mang. */
export function bundledFfmpeg(): string | null {
  const name = new URL(ffSpec().url).pathname.split('/').pop() || ''
  return name ? bundledFfmpegZip(name) : null
}

/** Hash 2 file ~50-100MB moi lan mo app ton ~0.3s -> nho (kich thuoc + gio sua) cua lan kiem dung gan nhat. */
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
  const m = ffSpec()
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
        ? `Máy đã có ffmpeg đúng bản này (${local[exeName('ffmpeg')]}) — app chép sang thư mục riêng của app (vài giây, không tải).`
        : bundledFfmpeg()
          ? 'Chưa cài — app có sẵn ffmpeg kèm theo, tự giải nén vào thư mục công cụ (vài giây, không tải mạng).'
          : 'Chưa cài bản ffmpeg của app.'
    }
  }
  try {
    writeFileSync(FF_STAMP(), JSON.stringify(stamp))
  } catch {
    /* khong ghi duoc stamp -> lan sau hash lai */
  }
  const r = await runCmd(ffPath('ffmpeg'), ['-hide_banner', '-version'], { timeout: 15000 })
  if (r.code !== 0) return { ok: false, detail: 'ffmpeg không chạy được trên máy này: ' + (r.stderr || r.stdout).slice(0, 160) }
  const ver = (/ffmpeg version (\S+)/.exec(r.stdout) || [])[1] || m.version
  return { ok: true, found: ver, path: ffPath('ffmpeg'), detail: 'Đúng bản ghim (đã kiểm SHA-256).' }
}

/** Kiem ban da dat co du bo ma hoa / bo loc app dung (x264, VP9 alpha, zscale HDR->SDR, silencedetect...). */
export async function ffmpegFeatures(): Promise<string[]> {
  const m = ffSpec()
  const ff = ffPath('ffmpeg')
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
  const m = ffSpec()
  const local: Record<string, string> = {}
  const dirs = IS_WIN ? [join(homedir(), '.local', 'bin')] : [join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']
  for (const [name, pin] of Object.entries(m.files)) {
    for (const d of dirs) {
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
  const m = ffSpec()
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
      // Ban NHUNG trong app (dung ma zip ghim) -> khong tai GitHub (may moi mang chap chon / bi chan)
      const bundled = bundledFfmpeg()
      let zip: string
      if (bundled && (await sha256File(bundled)) === m.zip_sha256) {
        onLog(`App có sẵn ffmpeg ${m.version} kèm theo — giải nén từ bản trong app, không tải mạng.`)
        zip = bundled
      } else {
        if (bundled) onLog('Bản ffmpeg kèm app sai mã SHA-256 — tải từ nguồn ghim.')
        zip = join(work, 'ffmpeg.zip')
        await download(m.url, zip, onLog, m.zip_sha256)
      }
      await extract(zip, work, onLog)
      for (const [name, pin] of Object.entries(m.files)) {
        const p = join(work, m.zip_dir, name)
        if (!existsSync(p) || (await sha256File(p)) !== pin.sha256) throw new Error(`${name} trong gói tải về không khớp mã SHA-256`)
        placeTool(p, name)
      }
    } finally {
      rmTree(work)
    }
  }
  const st = await ffmpegStatus()
  if (!st.ok) throw new Error(st.detail)
  const miss = await ffmpegFeatures()
  if (miss.length) throw new Error('ffmpeg thiếu: ' + miss.join(', '))
  onLog(`ffmpeg ${st.found} sẵn sàng tại ${TOOLS_BIN} (đủ x264, VP9, zscale, silencedetect…).`)
}

// ---------------------------------------------------------------------------
// uv (Astral) — trinh cai chinh chu, GHIM phien ban (chi may KHONG co Python nhung moi can)
// ---------------------------------------------------------------------------
export async function installUv(onLog: Log): Promise<void> {
  const inst = installerOf('uv')
  // UV_NO_MODIFY_PATH: khong sua ~/.zshrc / PATH cua nguoi dung (app tu tim uv o ~/.local/bin)
  const env = cleanEnv({ UV_NO_MODIFY_PATH: '1', INSTALLER_NO_MODIFY_PATH: '1' })
  if (IS_WIN) {
    await streamPs(`irm ${inst} | iex`, onLog, { env, timeoutMs: 10 * 60 * 1000 })
    return
  }
  await streamCmd('/bin/sh', ['-c', `curl -LsSf ${inst} | sh`], onLog, {
    env,
    show: `curl -LsSf ${inst} | sh`,
    timeoutMs: 10 * 60 * 1000
  })
}

// ---------------------------------------------------------------------------
// Codex CLI — ban chinh chu tren GitHub (openai/codex), GHIM phien ban + SHA-256; khong can Node / npm
// macOS: 1 binary trong tar.gz -> tools/bin/codex. Windows: GOI codex-package (bin/codex.exe + codex-resources
// cho sandbox Windows + codex-path/rg.exe) -> tools/codex/ (giu nguyen cau truc, codex tim tai nguyen theo goi).
// ---------------------------------------------------------------------------
export async function installCodex(onLog: Log): Promise<void> {
  const c = codexSpec()
  const work = tempDir('codex-')
  try {
    const tgz = join(work, 'codex.tar.gz')
    await download(c.url, tgz, onLog, c.sha256)
    let dst: string
    if (c.package) {
      const out = join(work, 'pkg')
      mkdirSync(out, { recursive: true })
      // bo phan giong noi (voice, ~20MB DLL) — app khong dung
      await extract(tgz, out, onLog)
      rmTree(join(out, 'codex-resources', 'voice'))
      const entry = join(out, ...(c.entry || 'bin/codex.exe').split('/'))
      if (!existsSync(entry)) throw new Error('Gói Codex tải về thiếu ' + (c.entry || 'bin/codex.exe'))
      // thay goi cu (codex dang chay -> Windows khoa file -> bao ro)
      try {
        rmTree(CODEX_PKG_DIR)
      } catch (e) {
        throw new Error('Codex đang chạy (tạo ảnh AI?) — đợi xong rồi cài lại: ' + String(e).slice(0, 120))
      }
      mkdirSync(join(CODEX_PKG_DIR, '..'), { recursive: true })
      renameSync(out, CODEX_PKG_DIR)
      dst = join(CODEX_PKG_DIR, ...(c.entry || 'bin/codex.exe').split('/'))
    } else {
      await extract(tgz, work, onLog, [c.member || 'codex'])
      dst = placeTool(join(work, c.member || 'codex'), 'codex')
    }
    const v = await cliVersion(dst)
    if (!versionGte(v, c.min)) throw new Error(`Codex vừa cài báo phiên bản "${v}" (cần ≥ ${c.min})`)
    onLog(`Codex CLI ${v} sẵn sàng tại ${dst}. Đăng nhập ChatGPT trong Cài đặt API để tạo ảnh AI.`)
  } finally {
    rmTree(work)
  }
}

// ---------------------------------------------------------------------------
// Claude Code — trinh cai chinh chu (tu kiem checksum), GHIM phien ban; da co ban cu -> `claude update`
// Windows: install.ps1 (claude.exe vao %USERPROFILE%\.local\bin, khong can Git / WSL / admin)
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
  const inst = installerOf('claude')
  if (IS_WIN) {
    // install.ps1 nhan tham so phien ban -> chay qua scriptblock de truyen duoc tham so
    await streamPs(`& ([scriptblock]::Create((irm ${inst}))) ${c.install_version}`, onLog, { timeoutMs: 15 * 60 * 1000 })
  } else {
    const cmd = `curl -fsSL ${inst} | bash -s ${c.install_version}`
    await streamCmd('/bin/bash', ['-c', cmd], onLog, { show: cmd, timeoutMs: 15 * 60 * 1000 })
  }
  const p = findCli('claude')
  const v = p ? await cliVersion(p) : null
  if (!versionGte(v, c.min)) throw new Error(`Claude Code sau khi cài báo "${v || 'không thấy lệnh claude'}" (cần ≥ ${c.min})`)
}

// ---------------------------------------------------------------------------
// Antigravity CLI (agy) — trinh cai chinh chu cua Google (kiem SHA-512), ban moi nhat (agy tu cap nhat)
// Windows: install.ps1 -> %LOCALAPPDATA%\agy\bin\agy.exe
// ---------------------------------------------------------------------------
export async function installAgy(onLog: Log): Promise<void> {
  const a = manifest().cli.agy
  const inst = installerOf('agy')
  if (IS_WIN) {
    await streamPs(`irm ${inst} | iex`, onLog, { timeoutMs: 15 * 60 * 1000 })
  } else {
    const cmd = `curl -fsSL ${inst} | bash`
    await streamCmd('/bin/bash', ['-c', cmd], onLog, { show: cmd, timeoutMs: 15 * 60 * 1000 })
  }
  const p = findCli('agy')
  const v = p ? await cliVersion(p) : null
  if (!versionGte(v, a.min)) throw new Error(`Antigravity CLI sau khi cài báo "${v || 'không thấy lệnh agy'}" (cần ≥ ${a.min})`)
}

// ---------------------------------------------------------------------------
// MODEL THI GIAC MAY (may KHONG co Apple Vision — Windows): ONNX ghim SHA-256 (toolchain.json vision_models).
// bundle=true: nhung san trong app (resources/models); con lai Doctor tai vao ~/.capcut-studio/models.
// ---------------------------------------------------------------------------
export function visionModelsNeeded(): boolean {
  return process.platform !== 'darwin'
}

function modelFile(name: string, m: VisionModel): string | null {
  for (const d of [bundledModelsDir(), USER_MODELS_DIR]) {
    if (!d) continue
    const p = join(d, name)
    try {
      if (existsSync(p) && statSync(p).size === m.size) return p
    } catch {
      /* bo qua */
    }
  }
  return null
}

export function visionModelsStatus(): { ok: boolean; missing: string[]; found: string[]; totalMb: number } {
  const all = manifest().vision_models || {}
  const missing: string[] = []
  const found: string[] = []
  let need = 0
  for (const [name, m] of Object.entries(all)) {
    if (modelFile(name, m)) found.push(name)
    else {
      missing.push(name)
      need += m.size
    }
  }
  return { ok: !missing.length, missing, found, totalMb: Math.round(need / 1e6) }
}

export async function installVisionModels(onLog: Log): Promise<void> {
  const all = manifest().vision_models || {}
  mkdirSync(USER_MODELS_DIR, { recursive: true })
  for (const [name, m] of Object.entries(all)) {
    if (modelFile(name, m)) continue
    onLog(`Tải model ${name} (${m.use}, ~${Math.round(m.size / 1e6)} MB, ${m.license})...`)
    const tmp = join(USER_MODELS_DIR, name + '.tai')
    await download(m.url, tmp, onLog, m.sha256)
    rmSync(join(USER_MODELS_DIR, name), { force: true, maxRetries: 5, retryDelay: 400 })
    renameSync(tmp, join(USER_MODELS_DIR, name))
  }
  const st = visionModelsStatus()
  if (!st.ok) throw new Error('Còn thiếu model: ' + st.missing.join(', '))
  onLog('Đủ model thị giác máy (tách người, tách nền, tìm mặt, đọc chữ tiếng Việt).')
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
    rmTree(join(TOOLS_BIN, '..', 'tmp'))
  } catch {
    /* bo qua */
  }
}
