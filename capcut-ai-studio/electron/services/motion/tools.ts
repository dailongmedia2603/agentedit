// MOI TRUONG CHAY SKILL tren may khach (2026-10-14). Skill goi `node` (>= 22, can WebSocket), `python3` (numpy + PIL),
// `ffmpeg`, Google Chrome. May khach khong chac co Node / Python / Chrome nen:
//  - node: Node he thong >= 22 neu co; khong thi dung CHINH Electron cua app o che do Node (ELECTRON_RUN_AS_NODE) + co
//    --experimental-websocket (Electron 33 = Node 20.18, da thu that render.mjs + Chrome Headless chay dung);
//  - python3: Python NHUNG cua app (co numpy + pillow cho sidecar) / venv cua sidecar;
//  - ffmpeg: ~/.capcut-studio/tools/bin (Doctor cai) — da nam dau PATH (augmentedEnv);
//  - Chrome: Google Chrome cua may neu co; khong thi Chrome Headless Shell ma app tai cho Remotion (tu tai neu chua co).
// Lenh `node` / `python3` la file lenh nho trong ~/.capcut-studio/motion/bin dat DAU PATH cua rieng tien trinh Claude.
import { execFileSync } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { delimiter, join } from 'path'
import { augmentedEnv, claudeEnv, findBinary, IS_WIN, pathKey } from '../env'
import { embeddedPython, TOOLS_BIN } from '../paths'
import { readState } from '../state'
import { loadProviders } from '../secrets'
import { remotionHome, installBrowser } from '../remotion'
import { MOTION_HOME } from './paths'

const BIN = join(MOTION_HOME, 'bin')
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5'

function writeIfChanged(p: string, content: string, exec = true): void {
  try {
    if (existsSync(p) && readFileSync(p, 'utf-8') === content) return
  } catch {
    /* ghi lai */
  }
  writeFileSync(p, content)
  if (exec && !IS_WIN) chmodSync(p, 0o755)
}

let nodeCache: { path: string | null; at: number } | null = null
/** Node he thong >= 22 (co WebSocket san), else null. */
function systemNode22(): string | null {
  if (nodeCache && Date.now() - nodeCache.at < 600000) return nodeCache.path
  let out: string | null = null
  const n = findBinary('node')
  if (n && !n.startsWith(BIN)) {
    try {
      const v = execFileSync(n, ['-v'], { encoding: 'utf-8', timeout: 8000, windowsHide: true }).trim()
      const major = Number(/^v(\d+)/.exec(v)?.[1] || 0)
      if (major >= 22) out = n
    } catch {
      /* khong chay duoc */
    }
  }
  nodeCache = { path: out, at: Date.now() }
  return out
}

/** Python co numpy + PIL: nhung trong app > venv sidecar > python3 he thong. */
export function motionPython(): string | null {
  const e = embeddedPython()
  if (e) return e
  const s = readState()
  if (s.venv_python && existsSync(s.venv_python)) return s.venv_python
  return null
}

const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const slash = (p: string) => p.replace(/\\/g, '/')

/** Tao lenh `node` / `python3` trong motion/bin. Tra mo ta de ghi nhat ky. */
export function ensureShims(): { node: string; python: string } {
  mkdirSync(BIN, { recursive: true })
  const sysNode = systemNode22()
  let nodeHow = 'Node hệ thống ' + (sysNode || '')
  if (!sysNode) {
    const exe = process.execPath
    nodeHow = 'Electron của app (chế độ Node)'
    // Git Bash (Claude Code tren Windows) chay file sh khong duoi; cmd / PowerShell chay .cmd
    writeIfChanged(
      join(BIN, 'node'),
      `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexport NODE_OPTIONS="--experimental-websocket \${NODE_OPTIONS:-}"\nexec ${sh(IS_WIN ? slash(exe) : exe)} "$@"\n`
    )
    if (IS_WIN) writeIfChanged(join(BIN, 'node.cmd'), `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\nset NODE_OPTIONS=--experimental-websocket\r\n"${exe}" %*\r\n`)
  } else {
    // co Node that -> bo lenh gia (neu lan truoc da tao) de PATH tim Node that
    for (const f of ['node', 'node.cmd']) rmSync(join(BIN, f), { force: true })
  }
  const py = motionPython()
  let pyHow = 'python3 hệ thống'
  if (py) {
    pyHow = py
    for (const name of ['python3', 'python']) {
      writeIfChanged(join(BIN, name), `#!/bin/sh\nexport PYTHONUTF8=1\nexec ${sh(IS_WIN ? slash(py) : py)} "$@"\n`)
      if (IS_WIN) writeIfChanged(join(BIN, name + '.cmd'), `@echo off\r\nset PYTHONUTF8=1\r\n"${py}" %*\r\n`)
    }
  }
  return { node: nodeHow, python: pyHow }
}

function findFile(dir: string, name: string, depth = 5): string | null {
  if (depth < 0 || !existsSync(dir)) return null
  try {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      const st = statSync(p)
      if (st.isFile() && e === name) return p
      if (st.isDirectory()) {
        const r = findFile(p, name, depth - 1)
        if (r) return r
      }
    }
  } catch {
    /* bo qua */
  }
  return null
}

function systemChrome(): string | null {
  const c = IS_WIN
    ? [
        join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(process.env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  return c.find((p) => p && existsSync(p)) || null
}

function headlessShell(): string | null {
  return findFile(join(remotionHome(), 'node_modules', '.remotion', 'chrome-headless-shell'), IS_WIN ? 'chrome-headless-shell.exe' : 'chrome-headless-shell')
}

/** Trinh duyet cho render.mjs (CHROME_PATH). Khong co -> tai Chrome Headless Shell (nhu Remotion). */
export async function ensureChrome(onLog?: (l: string) => void): Promise<string> {
  const c = systemChrome() || headlessShell()
  if (c) return c
  onLog?.('Đang tải trình duyệt dựng video (lần đầu, ~90MB)…')
  await installBrowser((l) => onLog?.(l))
  const h = headlessShell()
  if (!h) throw new Error('Không tải được trình duyệt dựng video (Chrome Headless). Kiểm tra mạng rồi chạy lại.')
  return h
}

export function chromeStatus(): { ok: boolean; path: string | null; via: string } {
  const s = systemChrome()
  if (s) return { ok: true, path: s, via: 'Google Chrome' }
  const h = headlessShell()
  if (h) return { ok: true, path: h, via: 'Chrome Headless (Remotion)' }
  return { ok: true, path: null, via: 'tự tải lần đầu tạo video' }
}

export function ffmpegPath(): string | null {
  const p = join(TOOLS_BIN, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg')
  return existsSync(p) ? p : findBinary('ffmpeg')
}

let pyCheck: { py: string | null; ok: boolean; at: number } | null = null
/** Python cua skill co numpy + PIL khong (cache 10 phut). */
export function pythonStatus(): { ok: boolean; path: string | null } {
  const py = motionPython() || findBinary('python3')
  if (pyCheck && pyCheck.py === py && Date.now() - pyCheck.at < 600000) return { ok: pyCheck.ok, path: py }
  let ok = false
  if (py) {
    try {
      execFileSync(py, ['-c', 'import numpy, PIL'], { timeout: 20000, windowsHide: true, stdio: 'ignore' })
      ok = true
    } catch {
      ok = false
    }
  }
  pyCheck = { py, ok, at: Date.now() }
  return { ok, path: py }
}

export interface ClaudeRun {
  bin: string
  model: string
  effort: string
  mode: 'subscription' | 'api_key'
  env: NodeJS.ProcessEnv
}

/** Claude Code CLI theo cau hinh "Claude" o Cai dat API (goi subscription hoac API key). */
export function claudeRun(): ClaudeRun {
  const bin = findBinary('claude')
  if (!bin) throw new Error('Chưa cài Claude Code — vào “Cài đặt API” > Claude để cài và đăng nhập.')
  const cfg = loadProviders().claude
  let env = claudeEnv(augmentedEnv())
  if (cfg?.auth_mode === 'api_key') {
    if (!cfg.api_key) throw new Error('Claude đang dùng chế độ API key nhưng chưa có key — vào “Cài đặt API” > Claude.')
    env.ANTHROPIC_API_KEY = cfg.api_key
    const base = String(cfg.base_url || '').replace(/\/v1\/?$/, '').replace(/\/+$/, '')
    if (base && !/^https:\/\/api\.anthropic\.com$/i.test(base)) env.ANTHROPIC_BASE_URL = base
    return { bin, model: cfg.model || DEFAULT_CLAUDE_MODEL, effort: '', mode: 'api_key', env }
  }
  env = claudeEnv(env)
  return { bin, model: cfg?.sub_model || DEFAULT_CLAUDE_MODEL, effort: cfg?.sub_effort || '', mode: 'subscription', env }
}

/** env day du cho 1 lan chay skill (PATH co lenh node/python3, CHROME_PATH, khoa Saydi neu co loi doc). */
export function skillEnv(base: NodeJS.ProcessEnv, chrome: string, saydi?: { key: string; voice?: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELEVENLABS_API_KEY
  delete env.SAYDI_API_KEY
  delete env.SAYDI_VOICE
  const key = pathKey(env)
  const parts = [BIN, TOOLS_BIN, ...String(env[key] || '').split(delimiter)].filter(Boolean)
  env[key] = Array.from(new Set(parts)).join(delimiter)
  env.CHROME_PATH = chrome
  env.NO_COLOR = '1'
  env.DISABLE_AUTOUPDATER = '1'
  env.PYTHONUTF8 = '1'
  env.PYTHONIOENCODING = 'utf-8'
  if (saydi?.key) {
    env.SAYDI_API_KEY = saydi.key
    if (saydi.voice) env.SAYDI_VOICE = saydi.voice
  }
  return env
}
