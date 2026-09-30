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

export function sidecarServer(): string {
  return join(sidecarDir(), 'server.py')
}

export const ENGINE_HOME = join(homedir(), '.capcut-studio')
export const STATE_PATH = join(ENGINE_HOME, 'state.json')

// Cong cu app tu cai dung phien ban ghim (sidecar/assets/toolchain.json): ffmpeg, ffprobe, codex.
// Dung TRUOC moi noi khac khi tim binary (env.ts, sidecar remotion_plan._ffbin + cli_providers).
export const TOOLS_BIN = join(ENGINE_HOME, 'tools', 'bin')

// Noi Doctor tao venv Python cho sidecar khi may chua co (may cu dung venv_python trong state.json)
export const DEFAULT_VENV_DIR = join(ENGINE_HOME, 'sidecar-venv')

export function homePath(...p: string[]): string {
  return join(homedir(), ...p)
}
