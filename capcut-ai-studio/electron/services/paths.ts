import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'

// Vi tri sidecar: dev = <project>/sidecar ; prod = <resources>/sidecar
export function sidecarDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'sidecar')
  }
  // electron-vite dev: __dirname = out/main; project root = ../../
  const devPath = join(app.getAppPath(), 'sidecar')
  if (existsSync(devPath)) return devPath
  return join(process.cwd(), 'sidecar')
}

// Diem vao sidecar: ban da bien dich (dist .so) chay qua launcher `server_launch.py`
// (server.py -> server.so, khong the cung ten); ban dev chay thang `server.py`.
export function sidecarServer(): string {
  const launcher = join(sidecarDir(), 'server_launch.py')
  if (existsSync(launcher)) return launcher
  return join(sidecarDir(), 'server.py')
}

// ---------------------------------------------------------------------------
// Python NHUNG (python-build-standalone) — ship trong app, nguoi dung khong cai Python.
// prod: <resources>/python ; dev: <project>/resources/python (do scripts/bundle-python.mjs tao).
// Duong dan interpreter theo nen tang (macOS: bin/python3.12 ; Windows: python.exe).
// ---------------------------------------------------------------------------
function embeddedPythonBinRel(): string {
  return process.platform === 'win32' ? 'python.exe' : join('bin', 'python3.12')
}

export function embeddedPythonDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'python')
  return join(app.getAppPath(), 'resources', 'python')
}

/** Zip ffmpeg + ffprobe nhung trong app (scripts/bundle-ffmpeg.mjs), else null.
 *  prod: <resources>/ffmpeg/<ten zip> ; dev: <project>/resources/ffmpeg/<ten zip>. */
export function bundledFfmpegZip(zipName: string): string | null {
  const dir = app.isPackaged ? join(process.resourcesPath, 'ffmpeg') : join(app.getAppPath(), 'resources', 'ffmpeg')
  const p = join(dir, zipName)
  return existsSync(p) ? p : null
}

/** Interpreter Python nhung neu co (da build), else null. */
export function embeddedPython(): string | null {
  const p = join(embeddedPythonDir(), embeddedPythonBinRel())
  return existsSync(p) ? p : null
}

export const ENGINE_HOME = join(homedir(), '.capcut-studio')
export const STATE_PATH = join(ENGINE_HOME, 'state.json')

// Cong cu app tu cai dung phien ban ghim (sidecar/assets/toolchain.json): ffmpeg, ffprobe, codex.
// Dung TRUOC moi noi khac khi tim binary (env.ts, sidecar remotion_plan._ffbin + cli_providers).
export const TOOLS_BIN = join(ENGINE_HOME, 'tools', 'bin')

// Noi Doctor tao venv Python cho sidecar khi may chua co (may cu dung venv_python trong state.json)
export const DEFAULT_VENV_DIR = join(ENGINE_HOME, 'sidecar-venv')

/** Python trong 1 venv (macOS: bin/python; Windows: Scripts\python.exe). */
export function venvPythonIn(venvDir: string): string {
  return process.platform === 'win32' ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python')
}

// Model thi giac may ONNX (may khong co Apple Vision — Windows): ban NHUNG trong app (scripts/bundle-models.mjs)
// + ban Doctor tai ve. Sidecar nhan qua env STUDIO_MODELS_DIR (vision_onnx.model_dirs).
export const USER_MODELS_DIR = join(ENGINE_HOME, 'models')

export function bundledModelsDir(): string | null {
  const d = app.isPackaged ? join(process.resourcesPath, 'models') : join(app.getAppPath(), 'resources', 'models')
  return existsSync(d) ? d : null
}

export function homePath(...p: string[]): string {
  return join(homedir(), ...p)
}
