import { spawn, ChildProcess } from 'child_process'
import { createServer } from 'net'
import { request as httpRequest } from 'http'
import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { augmentedEnv, killTree } from './env'
import { readState } from './state'
import { sidecarServer, sidecarDir, embeddedPython, bundledModelsDir } from './paths'
import { loadProviders } from './secrets'

let child: ChildProcess | null = null
let port = 0
let token = ''
let ready = false
let logBuffer: string[] = []

export function sidecarLog(): string[] {
  return logBuffer.slice(-200)
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const p = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(p))
    })
  })
}

// Python cho sidecar: UU TIEN python NHUNG trong app (nguoi dung khong cai gi) ->
// fallback venv_python trong state.json (may cu da tao venv bang uv truoc day).
function venvPython(): string | null {
  const embedded = embeddedPython()
  if (embedded) return embedded
  const s = readState()
  if (s.venv_python && existsSync(s.venv_python)) return s.venv_python
  return null
}

export function isReady(): boolean {
  return ready
}

export function sidecarInfo() {
  return { port, ready, hasChild: !!child }
}

// Nhieu noi goi startSidecar cung luc luc mo app (main + cac IPC): khong chan thi moi lan goi spawn
// them 1 sidecar, bien `child` chi giu cai cuoi -> tat app chi tat duoc cai cuoi, cac cai kia chay ngam
// mai (do that 2026-09-26: 21 sidecar mo coi). Dung chung 1 lan khoi dong dang chay.
let starting: Promise<{ ok: boolean; error?: string }> | null = null

export function startSidecar(onLog?: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (child && ready) return Promise.resolve({ ok: true })
  if (!starting) {
    starting = doStartSidecar(onLog).finally(() => {
      starting = null
    })
  }
  return starting
}

async function doStartSidecar(onLog?: (l: string) => void): Promise<{ ok: boolean; error?: string }> {
  if (child && !ready) stopSidecar() // lan truoc khoi dong hong -> tat han truoc khi chay cai moi
  const py = venvPython()
  if (!py) {
    return { ok: false, error: 'Chua co moi truong Python (python nhung thieu, chua co venv). Cai lai app hoac chay Doctor.' }
  }
  const server = sidecarServer()
  if (!existsSync(server)) {
    return { ok: false, error: 'Khong thay sidecar server.py tai: ' + server }
  }

  port = await freePort()
  token = randomBytes(16).toString('hex')

  child = spawn(py, [server, '--port', String(port), '--token', token], {
    cwd: sidecarDir(),
    // STUDIO_NODE_BIN: chinh binary Electron (chay che do Node) -> sidecar chay hop cach ly hieu ung tu viet
    env: {
      ...augmentedEnv(),
      STUDIO_TOKEN: token,
      STUDIO_NODE_BIN: process.execPath,
      // model thi giac may ONNX nhung trong app (Windows — vision_onnx.model_dirs)
      ...(bundledModelsDir() ? { STUDIO_MODELS_DIR: bundledModelsDir() as string } : {})
    },
    // Windows: python.exe la chuong trinh console -> khong an thi bat cua so den; con chau (ffmpeg...)
    // dung chung console an nay nen cung khong bat cua so.
    windowsHide: true
  })
  child.stdout?.on('data', (d) => {
    const s = d.toString().trimEnd()
    logBuffer.push(s)
    onLog?.(s)
  })
  child.stderr?.on('data', (d) => {
    const s = d.toString().trimEnd()
    logBuffer.push(s)
    onLog?.(s)
  })
  child.on('close', (code) => {
    logBuffer.push(`[sidecar exited ${code}]`)
    ready = false
    child = null
  })

  // poll health
  const ok = await waitHealthy(15000)
  if (!ok) {
    return { ok: false, error: 'Sidecar khong phan hoi /health. Log: ' + logBuffer.slice(-5).join(' | ') }
  }
  ready = true
  // day config providers (keys) vao sidecar (giu trong RAM sidecar)
  await pushConfig()
  return { ok: true }
}

async function waitHealthy(timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { 'X-Studio-Token': token }
      })
      if (r.ok) return true
    } catch {
      // chua san sang
    }
    await new Promise((res) => setTimeout(res, 400))
  }
  return false
}

export async function pushConfig(): Promise<void> {
  const providers = loadProviders()
  await sidecarRequest('/config', { providers })
}

// Dung Node http module (KHONG dung fetch/undici) de tranh "fetch failed" khi call AI chay lau.
export function sidecarRequest(path: string, body?: unknown, timeoutMs = 1800000): Promise<any> {
  if (!port) return Promise.reject(new Error('Sidecar chua khoi dong'))
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? Buffer.from(JSON.stringify(body)) : undefined
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: body !== undefined ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Studio-Token': token,
          ...(payload ? { 'Content-Length': payload.length } : {})
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          let json: any
          try {
            json = JSON.parse(text)
          } catch {
            reject(new Error(`Sidecar trả về không phải JSON (${res.statusCode}): ${text.slice(0, 200)}`))
            return
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(json?.error || `HTTP ${res.statusCode}`))
            return
          }
          resolve(json)
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('Sidecar quá thời gian phản hồi')))
    req.on('error', (e) => reject(e))
    if (payload) req.write(payload)
    req.end()
  })
}

export function stopSidecar(): void {
  if (child) {
    const c = child
    // Windows: kill() chi giet python.exe -> ffmpeg / codex / claude sidecar dang chay thanh mo coi
    killTree(c.pid, () => {
      try {
        c.kill('SIGTERM')
      } catch {
        // ignore
      }
    })
    child = null
    ready = false
  }
}
