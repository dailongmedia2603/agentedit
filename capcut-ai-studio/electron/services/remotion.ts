// Quan ly RENDER MP4 cho luong Video Remotion (xem electron/remotion-worker.ts).
import { app, utilityProcess, UtilityProcess } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ENGINE_HOME } from './paths'
import { killTree } from './env'

/** Dung worker render + con chau (Windows: chrome-headless-shell.exe / remotion.exe compositor khong tu chet theo). */
function killWorker(child: UtilityProcess): void {
  killTree(child.pid, () => {
    try {
      child.kill()
    } catch {
      /* da thoat */
    }
  })
}
import { mediaBase } from './media-server'
import { readState } from './state'

export const COMPOSITION_ID = 'AutoEdit'

/** Trang web Remotion da dong goi san (scripts/bundle-remotion.mjs). */
export function bundleDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'remotion-bundle')
  return join(app.getAppPath(), 'out', 'remotion-bundle')
}

/** Noi Remotion cat Chrome Headless Shell tai ve (tinh theo cwd -> tim package.json). */
export function remotionHome(): string {
  const dir = join(ENGINE_HOME, 'remotion')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const pkg = join(dir, 'package.json')
  if (!existsSync(pkg)) writeFileSync(pkg, JSON.stringify({ name: 'autocapcut-remotion-cache', private: true }, null, 2))
  return dir
}

export function browserInstalled(): boolean {
  return existsSync(join(remotionHome(), 'node_modules', '.remotion', 'chrome-headless-shell'))
}

/** Doctor: tai Chrome Headless Shell (ban @remotion/renderer yeu cau) TRUOC, khong doi toi lan render dau.
 *  Chay trong tien trinh render rieng (cung cwd -> cung cho cat nhu luc render). */
export function installBrowser(onLog: (line: string) => void): Promise<void> {
  if (running) return Promise.reject(new Error('Đang render — đợi xong rồi cài.'))
  const worker = join(__dirname, 'remotion-worker.js')
  const child = utilityProcess.fork(worker, [], {
    cwd: remotionHome(),
    serviceName: 'Agent Edit Remotion browser',
    stdio: 'pipe'
  })
  const jobId = 'b_' + Date.now().toString(36)
  let lastPct = -10
  return new Promise<void>((resolve, reject) => {
    let finished = false
    const finish = (err?: Error) => {
      if (finished) return
      finished = true
      try {
        child.kill()
      } catch {
        /* da thoat */
      }
      if (err) reject(err)
      else resolve()
    }
    child.on('message', (m: RenderEvent) => {
      if (m.type === 'progress') {
        const pct = Math.round((m.progress || 0) * 100)
        if (pct >= lastPct + 10) {
          lastPct = pct
          onLog(`  Chrome Headless Shell: ${pct}%`)
        }
      } else if (m.type === 'done') finish()
      else if (m.type === 'error') finish(new Error(String(m.message || 'lỗi tải Chrome').split('\n')[0]))
    })
    child.on('exit', (code) => finish(new Error(`Tiến trình tải Chrome thoát bất thường (mã ${code}).`)))
    onLog('Tải Chrome Headless Shell cho Remotion (~90 MB, một lần)...')
    child.postMessage({ type: 'ensure-browser', jobId })
  })
}

export interface RenderEvent {
  jobId: string
  type: 'progress' | 'done' | 'error' | 'cancelled' | 'log'
  stage?: string
  progress?: number
  renderedFrames?: number
  encodedFrames?: number
  totalFrames?: number
  output?: string
  size?: number
  seconds?: number
  message?: string
  level?: string
}

interface Running {
  jobId: string
  child: UtilityProcess
  output: string
  startedAt: number
  last: RenderEvent | null
}

let running: Running | null = null

export function renderStatus() {
  if (!running) return { running: false }
  return {
    running: true,
    jobId: running.jobId,
    output: running.output,
    startedAt: running.startedAt,
    last: running.last
  }
}

/** Tuy chon render khac video chinh: composition khac (vd FxPreview cua Kho hieu ung) + thu nho + bo tieng. */
export interface RenderOptions {
  compositionId?: string
  scale?: number
  muted?: boolean
}

export async function startRender(
  spec: Record<string, unknown>,
  output: string,
  onEvent: (e: RenderEvent) => void,
  opts: RenderOptions = {}
): Promise<RenderEvent> {
  if (running) {
    return { jobId: running.jobId, type: 'error', message: 'Đang render một video khác — đợi xong hoặc bấm Huỷ.' }
  }
  const serveUrl = bundleDir()
  if (!existsSync(join(serveUrl, 'index.html'))) {
    return {
      jobId: '',
      type: 'error',
      message: `Không thấy bản đóng gói Remotion tại ${serveUrl}. Chạy "npm run build" để tạo lại.`
    }
  }
  const jobId = 'r_' + Date.now().toString(36)
  const base = await mediaBase()
  const worker = join(__dirname, 'remotion-worker.js')
  const child = utilityProcess.fork(worker, [], {
    cwd: remotionHome(),
    serviceName: 'Agent Edit Remotion render',
    stdio: 'pipe'
  })
  running = { jobId, child, output, startedAt: Date.now(), last: null }
  child.stdout?.on('data', (d) => console.log('[remotion-worker]', String(d).trimEnd()))
  child.stderr?.on('data', (d) => console.error('[remotion-worker]', String(d).trimEnd()))

  const state = readState() as Record<string, unknown>
  const concurrency = typeof state.remotion_concurrency === 'number' ? (state.remotion_concurrency as number) : null
  const licenseKey = typeof state.remotion_license_key === 'string' ? (state.remotion_license_key as string) : null
  // Tang toc GPU + chip nen chi tren Mac; STUDIO_REMOTION_ACCEL=0 tat (do so sanh / may Mac loi hinh)
  const accel = process.platform === 'darwin' && process.env.STUDIO_REMOTION_ACCEL !== '0'

  return new Promise<RenderEvent>((resolve) => {
    let finished = false
    const finish = (e: RenderEvent) => {
      if (finished) return
      finished = true
      if (running?.jobId === jobId) running = null
      try {
        child.kill()
      } catch {
        /* da thoat */
      }
      onEvent(e)
      resolve(e)
    }
    child.on('message', (m: Omit<RenderEvent, 'jobId'> & { jobId?: string }) => {
      const e = { ...m, jobId } as RenderEvent
      if (running?.jobId === jobId) running.last = e
      if (e.type === 'done' || e.type === 'error' || e.type === 'cancelled') finish(e)
      else onEvent(e)
    })
    child.on('exit', (code) => {
      finish({ jobId, type: 'error', message: `Tiến trình render thoát bất thường (mã ${code}).` })
    })
    child.postMessage({
      type: 'render',
      jobId,
      serveUrl,
      compositionId: opts.compositionId || COMPOSITION_ID,
      scale: opts.scale,
      muted: opts.muted,
      spec: { ...spec, mediaBase: base },
      output,
      concurrency,
      licenseKey,
      accel
    })
  })
}

export function cancelRender(): boolean {
  if (!running) return false
  const r = running
  r.child.postMessage({ type: 'cancel' })
  // Worker khong phan hoi (treo o trinh duyet) -> giet han sau 8s
  setTimeout(() => {
    if (running?.jobId === r.jobId) killWorker(r.child)
  }, 8000)
  return true
}

export function stopRender(): void {
  if (running) {
    killWorker(running.child)
    running = null
  }
}
