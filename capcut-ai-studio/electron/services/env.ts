import { homedir } from 'os'
import { delimiter, extname, join } from 'path'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { execFileSync, spawn } from 'child_process'
import { TOOLS_BIN } from './paths'

export const IS_WIN = process.platform === 'win32'

/** Ten file chay theo nen tang: "ffmpeg" -> "ffmpeg.exe" tren Windows. */
export function exeName(name: string): string {
  return IS_WIN && !extname(name) ? name + '.exe' : name
}

/** Khoa PATH that trong env (Windows la "Path", khong phan biet hoa thuong). */
export function pathKey(env: NodeJS.ProcessEnv = process.env): string {
  if (!IS_WIN) return 'PATH'
  return Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'Path'
}

/** Thu muc nguoi dung co the chua CLI (GUI app khong ke thua PATH cua shell / terminal). */
function userBinDirs(): string[] {
  const h = homedir()
  if (IS_WIN) {
    const la = process.env.LOCALAPPDATA || join(h, 'AppData', 'Local')
    const ra = process.env.APPDATA || join(h, 'AppData', 'Roaming')
    return [
      TOOLS_BIN,
      join(h, '.local', 'bin'), // Claude Code / uv / agy (trinh cai chinh chu)
      join(la, 'Programs', 'agy'),
      join(la, 'Programs', 'Antigravity CLI'),
      join(ra, 'npm'),
      join(h, '.bun', 'bin'),
      join(h, '.cargo', 'bin'),
      join(la, 'Volta', 'bin')
    ]
  }
  return [
    TOOLS_BIN,
    join(h, '.local', 'bin'),
    join(h, '.cargo', 'bin'),
    join(h, '.local', 'node', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]
}

// PATH bo sung de process con (python/ffmpeg/CLI) tim duoc binary khi app chay tu Finder / Start menu.
// Python con: UTF-8 mode (Windows mac dinh cp1252 -> print/doc chu tieng Viet loi UnicodeError).
export function augmentedEnv(): NodeJS.ProcessEnv {
  const extra = userBinDirs().filter((p) => existsSync(p) || (!IS_WIN && /^\/(usr|bin|sbin)/.test(p)))
  const key = pathKey()
  const current = process.env[key] || ''
  const merged = Array.from(new Set([...extra, ...current.split(delimiter)])).filter(Boolean).join(delimiter)
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'PATH') delete env[k]
  env[key] = merged
  env.PYTHONUTF8 = '1'
  env.PYTHONIOENCODING = 'utf-8'
  // agy tu cap nhat ngam moi lan chay -> doi cach dang nhap giua chung (1.2.16, su co 2026-10-03). Tat cho moi lan app goi
  // agy (sidecar ke thua env nay). Chi nhan dung chu "true" ("1"/"yes" bi bo qua — da do that tren log auto_updater).
  env.AGY_CLI_DISABLE_AUTO_UPDATE = 'true'
  return env
}

/** Cac duoi file chay duoc (Windows: PATHEXT; con lai: khong duoi). */
export function exeExts(): string[] {
  if (!IS_WIN) return ['']
  const pe = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').toLowerCase().split(';').filter(Boolean)
  // .exe truoc (.cmd/.bat can shell -> kho quote hon)
  return Array.from(new Set(['.exe', ...pe.filter((e) => e !== '.exe')]))
}

/** Tim file chay `name` trong cac thu muc `dirs` (thu tu uu tien), kem duoi .exe/.cmd tren Windows. */
export function findIn(dirs: string[], name: string): string | null {
  const exts = extname(name) ? [''] : exeExts()
  for (const d of dirs) {
    for (const e of exts) {
      const p = join(d, name + e)
      try {
        if (existsSync(p) && statSync(p).isFile()) return p
      } catch {
        /* bo qua */
      }
    }
  }
  return null
}

export function findBinary(name: string): string | null {
  const env = augmentedEnv()
  return findIn([...userBinDirs(), ...(env[pathKey(env)] || '').split(delimiter).filter(Boolean)], name)
}

/** File .cmd / .bat tren Windows: Node (tu CVE-2024-27980) chi chay duoc qua shell. */
export function needsShell(bin: string): boolean {
  return IS_WIN && /\.(cmd|bat)$/i.test(bin)
}

/** Quote 1 doi so cho cmd.exe (dung khi needsShell). */
export function cmdQuote(a: string): string {
  if (!IS_WIN) return a
  return /[\s"&|<>^%()]/.test(a) || a === '' ? '"' + a.replace(/"/g, '""') + '"' : a
}

/** Dung CA CAY tien trinh: Windows kill() chi giet tien trinh truc tiep (con chau — ffmpeg, codex,
 *  chrome — thanh mo coi) -> taskkill /T /F. macOS/Linux: SIGTERM nhu cu. */
export function killTree(pid: number | undefined, fallback?: () => void): void {
  if (!pid) {
    fallback?.()
    return
  }
  if (IS_WIN) {
    try {
      const sys = process.env.SystemRoot || 'C:\\Windows'
      const k = spawn(join(sys, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      })
      k.on('error', () => fallback?.())
    } catch {
      fallback?.()
    }
    return
  }
  if (fallback) fallback()
  else {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* da thoat */
    }
  }
}

/** tar.exe cua Windows (bsdtar, doc duoc .zip / .tar.gz) — KHONG dung tar cua Git (hieu "C:" la may tu xa). */
export function systemTar(): string {
  if (IS_WIN) return join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  return '/usr/bin/tar'
}

// ---- Claude Code o che do GOI SUBSCRIPTION ----
// Bien lam Claude Code dung API key / router (vd 9Router: ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL) THAY goi subscription:
// co bien la `claude auth status` bao "oauth_token" -> app tuong chua dang nhap (su co that may Windows 2026-10-01).
const CLAUDE_KEY_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_CUSTOM_HEADERS',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']

/** Ban sao env BO cac bien API key / router cua Claude Code (chi cho tien trinh claude cua app). */
export function claudeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env }
  for (const k of Object.keys(out)) if (CLAUDE_KEY_ENV.includes(k.toUpperCase())) delete out[k]
  return out
}

/** Co phien Claude.ai luu trong file (Windows / Linux: <config>/.credentials.json -> claudeAiOauth; macOS: Keychain -> false). */
export function claudeOauthSaved(): boolean {
  try {
    const cfg = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    const j = JSON.parse(readFileSync(join(cfg, '.credentials.json'), 'utf-8'))
    const o = j?.claudeAiOauth
    return !!(o && (o.refreshToken || o.accessToken))
  } catch {
    return false
  }
}

// ---- Phien dang nhap Antigravity CLI (agy) ----
// agy luu phien qua go-keyring: Windows trong CREDENTIAL MANAGER, macOS trong KEYCHAIN (muc service "gemini", account
// "antigravity" — agy 1.2.14). File ~/.gemini/antigravity-cli/antigravity-oauth-token chi con o may tung chay agy ban cu
// (su co that 2026-10-01 Windows, 2026-10-02 Mac moi: agy dang nhap roi — `agy -p` SUCCESS — app van bao chua).
// Nhan biet: file phien | file danh dau keyring-marker-* | (Windows) muc antigravity / jetski trong `cmdkey /list`
// | (macOS) `security find-generic-password` CO muc tren (chi xem thuoc tinh, khong doc mat khau -> khong hoi Keychain).
let cmdkeyCache: { at: number; hit: boolean } = { at: 0, hit: false }
function windowsCredHasAgy(): boolean {
  if (Date.now() - cmdkeyCache.at < 2000) return cmdkeyCache.hit
  let hit = false
  try {
    const out = execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmdkey.exe'), ['/list'], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 8000
    })
    hit = /antigravity|jetski/i.test(out)
  } catch {
    hit = false
  }
  cmdkeyCache = { at: Date.now(), hit }
  return hit
}

let keychainCache: { at: number; hit: boolean } = { at: 0, hit: false }
function macKeychainHasAgy(): boolean {
  if (Date.now() - keychainCache.at < 2000) return keychainCache.hit
  let hit = false
  try {
    // Khong co muc -> thoat ma 44 -> nem loi. Khong -g / -w: khong doc bi mat.
    execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'gemini', '-a', 'antigravity'], { stdio: 'ignore', timeout: 8000 })
    hit = true
  } catch {
    hit = false
  }
  keychainCache = { at: Date.now(), hit }
  return hit
}

/** Muc phien THAT cua agy (Keychain / Credential Manager), khong qua cache — dung de biet /logout da xong chua. */
export function agyCredentialPresent(): boolean {
  if (IS_WIN) {
    cmdkeyCache = { at: 0, hit: false }
    return windowsCredHasAgy()
  }
  if (process.platform !== 'darwin') return false
  keychainCache = { at: 0, hit: false }
  return macKeychainHasAgy()
}

export function agySessionPresent(): boolean {
  const dir = join(homedir(), '.gemini', 'antigravity-cli')
  if (existsSync(join(dir, 'antigravity-oauth-token'))) return true
  try {
    if (existsSync(dir) && readdirSync(dir).some((n) => /^keyring-marker/i.test(n) || (/oauth/i.test(n) && /token/i.test(n)))) return true
  } catch {
    /* bo qua */
  }
  if (IS_WIN) return windowsCredHasAgy()
  return process.platform === 'darwin' ? macKeychainHasAgy() : false
}
