// CHE DO CLI (2026-10-12) — tien ich chung: thu muc, doc / ghi JSON an toan, tham so dong lenh, in ket qua.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { ENGINE_HOME } from '../services/paths'

/** Moi thu cua CLI (viec dang chay, khoa lan, trang thai) nam rieng o day — khong dung toi du lieu cua giao dien. */
export const CLI_HOME = join(ENGINE_HOME, 'cli')
export const JOBS_DIR = join(CLI_HOME, 'jobs')
export const LOCKS_DIR = join(CLI_HOME, 'locks')
export const CLI_STATE = join(CLI_HOME, 'state.json')

/** Co danh dau che do CLI tren dong lenh cua app (scripts `agent-edit` truyen vao). */
export const CLI_FLAG = '--agent-edit-cli'

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

/** Ghi qua file tam roi doi ten -> tien trinh khac (wait / giao dien) khong bao gio doc phai file do dang. */
export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  // Windows: tien trinh khac (wait / giao dien / trinh quet virus) dang mo file dich -> doi ten bao EPERM / EBUSY vai ms -> thu lai
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, path)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(String(code))) {
        try {
          rmSync(tmp, { force: true })
        } catch {
          /* bo qua */
        }
        throw e
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

export function cliState(): Record<string, unknown> {
  return readJson<Record<string, unknown>>(CLI_STATE, {})
}

export function setCliState(patch: Record<string, unknown>): void {
  writeJsonAtomic(CLI_STATE, { ...cliState(), ...patch })
}

export function pidAlive(pid: unknown): boolean {
  const n = Number(pid)
  if (!Number.isInteger(n) || n <= 0) return false
  try {
    process.kill(n, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Tham so dong lenh: `lenh vi-tri... --khoa gia-tri --co` (khoa lap lai -> mang)
// ---------------------------------------------------------------------------
export interface Args {
  cmd: string
  pos: string[]
  opts: Record<string, string[]>
  flags: Set<string>
}

/** Khoa KHONG nhan gia tri (co bat / tat). Moi khoa khac lay doi so tiep theo lam gia tri. */
const BOOL_FLAGS = new Set(['json', 'wait', 'fresh', 'new-plan', 'landscape', 'portrait', 'all', 'fix', 'help', 'device', 'quiet', 'until-change', 'background', 'start', 'check', 'key-env', 'no-voice', 'custom', 'refresh', 'with-files', 'api-key-env', 'force', 'no-reference', 'no-inserts', 'off'])

export function parseArgs(argv: string[]): Args {
  const pos: string[] = []
  const opts: Record<string, string[]> = {}
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      pos.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=')
      const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).toLowerCase()
      if (eq > 0) (opts[key] ||= []).push(a.slice(eq + 1))
      else if (BOOL_FLAGS.has(key)) flags.add(key)
      // khoa la khong co gia tri phia sau (doi so ke tiep cung la --khoa) -> coi la co bat
      else if (i + 1 < argv.length && !/^--[a-z]/i.test(argv[i + 1])) (opts[key] ||= []).push(argv[++i])
      else flags.add(key)
      continue
    }
    if (a === '-h') {
      flags.add('help')
      continue
    }
    pos.push(a)
  }
  return { cmd: (pos.shift() || 'help').toLowerCase(), pos, opts, flags }
}

export const opt = (a: Args, k: string): string | undefined => {
  const v = a.opts[k]
  return v && v.length ? v[v.length - 1] : undefined
}
export const optAll = (a: Args, k: string): string[] => a.opts[k] || []

// ---------------------------------------------------------------------------
// In ra man hinh (stdout cua tien trinh app = terminal / AI agent doc)
// ---------------------------------------------------------------------------
// AGENT_EDIT_OUT_FILE / AGENT_EDIT_ERR_FILE (script Windows agent-edit.ps1): ghi ket qua ra FILE thay vi stdout / stderr.
// App Windows la app giao dien: chi in ra ong dan, ma chay qua ong dan thi viec nen (`make`) co the KE THUA ong cua lenh goi
// -> AI agent treo toi khi video xong. Script chay app bang ShellExecute (khong ke thua handle) + doc file nay in lai.
function emit(stream: 'out' | 'err', text: string): void {
  const f = stream === 'out' ? process.env.AGENT_EDIT_OUT_FILE : process.env.AGENT_EDIT_ERR_FILE
  if (f) {
    try {
      appendFileSync(f, text, 'utf-8')
      return
    } catch {
      /* khong ghi duoc file -> in thang */
    }
  }
  ;(stream === 'out' ? process.stdout : process.stderr).write(text)
}

export function out(line = ''): void {
  emit('out', line + '\n')
}

export function outJson(data: unknown): void {
  emit('out', JSON.stringify(data, null, 2) + '\n')
}

export function errLine(line: string): void {
  emit('err', line + '\n')
}

export function exists(p: string | undefined | null): p is string {
  return !!p && existsSync(p)
}
