import { homedir } from 'os'
import { delimiter, extname, join } from 'path'
import { existsSync, statSync } from 'fs'
import { spawn } from 'child_process'
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
