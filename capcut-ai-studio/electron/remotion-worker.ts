// Tien trinh RENDER rieng (Electron utilityProcess) cho luong Video Remotion.
//
// Tach khoi main process vi: render chiem CPU nhieu phut, co the treo o trinh duyet
// headless, va phai huy duoc giua chung. Chet o day khong keo sap app.
//
// Giao tiep: main gui {type:'render', ...} / {type:'cancel'} / {type:'ensure-browser'} (Doctor tai truoc Chrome);
// worker bao lai {type:'progress'|'done'|'error'|'cancelled'}.
import { renderMedia, selectComposition, ensureBrowser, makeCancelSignal } from '@remotion/renderer'
import { dirname, sep } from 'path'
import { existsSync, statSync } from 'fs'

interface RenderJob {
  type: 'render'
  jobId: string
  serveUrl: string
  compositionId: string
  spec: unknown
  output: string
  concurrency?: number | null
  licenseKey?: string | null
  /** Chi bat tren Mac: Chrome ve bang GPU (Metal) + nen H.264 bang VideoToolbox. Windows giu CPU vi
   *  Remotion chon h264_nvenc (chi card NVIDIA) ma khong kiem tra may co card hay khong. */
  accel?: boolean
  /** Preview Kho hieu ung: thu nho (0.5 = 540x960) + khong tieng — file nho, render nhanh */
  scale?: number
  muted?: boolean
}

type Out =
  | { type: 'progress'; jobId: string; stage: 'browser' | 'prepare' | 'render' | 'encode'; progress: number; renderedFrames?: number; encodedFrames?: number; totalFrames?: number }
  | { type: 'done'; jobId: string; output: string; size: number; seconds: number }
  | { type: 'error'; jobId: string; message: string }
  | { type: 'cancelled'; jobId: string }
  | { type: 'log'; jobId: string; level: string; message: string }

const parent = process.parentPort
const send = (m: Out) => parent.postMessage(m)

/** Binary cua Remotion (compositor + ffmpeg) nam trong app.asar.unpacked khi da dong goi:
 *  he dieu hanh khong chay duoc file nam TRONG app.asar. */
function binariesDirectory(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // Ten goi theo nen tang: Windows la "win32-x64-msvc" (khong phai win32-x64) -> sai ten thi Remotion lay binary
    // TRONG app.asar -> khong chay duoc -> moi lan render deu loi.
    const key = `${process.platform}-${process.arch}`
    const pkg = ({ 'win32-x64': 'win32-x64-msvc', 'win32-arm64': 'win32-arm64-msvc', 'linux-x64': 'linux-x64-gnu', 'linux-arm64': 'linux-arm64-gnu' } as Record<string, string>)[key] || key
    const dir = dirname(require.resolve(`@remotion/compositor-${pkg}/package.json`))
    const marker = `app.asar${sep}`
    if (dir.includes(marker)) {
      const unpacked = dir.replace(marker, `app.asar.unpacked${sep}`)
      return existsSync(unpacked) ? unpacked : null
    }
    return null
  } catch {
    return null
  }
}

/** Chip nen VideoToolbox de mac dinh: khong khung B + khung I moi ~0.4s -> file to hon x264 ~30%.
 *  Remotion khong cho dat CRF khi nen phan cung -> chen thang vao lenh ffmpeg: giu chat luong q70 (tu cap
 *  bit theo canh), khung B, khung I moi 2s. Render that 45s 1080x1920: 81.6MB -> 50.5MB (x264 cu 62.7MB),
 *  VMAF so ban x264 95.5 -> 96.0, khung xau nhat 88.4 -> 88.5. Chi dong vao lenh dang dung h264_videotoolbox. */
const VIDEOTOOLBOX_ARGS = ['-q:v', '70', '-bf', '2', '-g', '60']
const tuneVideotoolbox = ({ args }: { args: string[] }): string[] => {
  const i = args.indexOf('h264_videotoolbox')
  return i < 0 ? args : [...args.slice(0, i + 1), ...VIDEOTOOLBOX_ARGS, ...args.slice(i + 1)]
}

let cancelCurrent: (() => void) | null = null

async function run(job: RenderJob) {
  const t0 = Date.now()
  const { cancelSignal, cancel } = makeCancelSignal()
  let cancelled = false
  cancelCurrent = () => {
    cancelled = true
    cancel()
  }
  let lastSent = 0
  const throttle = (m: Out, force = false) => {
    const now = Date.now()
    if (force || now - lastSent > 250) {
      lastSent = now
      send(m)
    }
  }
  try {
    // Lan dau: tai Chrome Headless Shell (~90MB) vao thu muc lam viec (cwd do main dat
    // = ~/.capcut-studio/remotion). Nhung lan sau dung lai, khong tai nua.
    await ensureBrowser({
      logLevel: 'warn',
      onBrowserDownload: () => {
        send({ type: 'log', jobId: job.jobId, level: 'info', message: 'Đang tải trình render (Chrome Headless) lần đầu...' })
        return {
          version: null,
          onProgress: ({ percent }) =>
            throttle({ type: 'progress', jobId: job.jobId, stage: 'browser', progress: percent })
        }
      }
    })
    if (cancelled) throw new Error('cancelled')
    const binDir = binariesDirectory()
    send({ type: 'progress', jobId: job.jobId, stage: 'prepare', progress: 0 })
    const inputProps = { spec: job.spec }
    const composition = await selectComposition({
      serveUrl: job.serveUrl,
      id: job.compositionId,
      inputProps,
      binariesDirectory: binDir,
      timeoutInMilliseconds: 120000,
      logLevel: 'warn'
    })
    const totalFrames = composition.durationInFrames
    const renderOnce = (accel: boolean) => renderMedia({
      composition,
      serveUrl: job.serveUrl,
      codec: 'h264',
      ...(job.muted ? {} : { audioCodec: 'aac' as const }),
      outputLocation: job.output,
      inputProps,
      overwrite: true,
      concurrency: job.concurrency ?? null,
      ...(job.scale ? { scale: job.scale } : {}),
      ...(job.muted ? { muted: true } : {}),
      binariesDirectory: binDir,
      cancelSignal,
      timeoutInMilliseconds: 120000,
      logLevel: 'warn',
      ...(accel ? { chromiumOptions: { gl: 'angle' as const }, hardwareAcceleration: 'if-possible' as const, ffmpegOverride: tuneVideotoolbox } : {}),
      ...(job.licenseKey ? { licenseKey: job.licenseKey } : {}),
      onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) =>
        throttle({
          type: 'progress',
          jobId: job.jobId,
          stage: stitchStage === 'muxing' || renderedFrames >= totalFrames ? 'encode' : 'render',
          progress,
          renderedFrames,
          encodedFrames,
          totalFrames
        })
    })
    try {
      await renderOnce(!!job.accel)
    } catch (e) {
      // GPU/chip nen loi (driver, may ao...) -> render lai bang CPU nhu cu, nguoi dung chi thay cham hon
      if (cancelled || !job.accel) throw e
      const err = e as Error
      send({ type: 'log', jobId: job.jobId, level: 'warn', message: `Render bằng GPU lỗi, render lại bằng CPU: ${(err && err.message) || String(e)}` })
      await renderOnce(false)
    }
    const size = existsSync(job.output) ? statSync(job.output).size : 0
    send({ type: 'done', jobId: job.jobId, output: job.output, size, seconds: (Date.now() - t0) / 1000 })
  } catch (e) {
    if (cancelled) {
      send({ type: 'cancelled', jobId: job.jobId })
    } else {
      const err = e as Error
      send({ type: 'error', jobId: job.jobId, message: (err && (err.stack || err.message)) || String(e) })
    }
  } finally {
    cancelCurrent = null
  }
}

/** Doctor: chi tai Chrome Headless Shell dung ban Remotion yeu cau (khong render). */
async function ensureOnly(jobId: string) {
  try {
    await ensureBrowser({
      logLevel: 'warn',
      onBrowserDownload: () => ({
        version: null,
        onProgress: ({ percent }) => send({ type: 'progress', jobId, stage: 'browser', progress: percent })
      })
    })
    send({ type: 'done', jobId, output: '', size: 0, seconds: 0 })
  } catch (e) {
    const err = e as Error
    send({ type: 'error', jobId, message: (err && (err.stack || err.message)) || String(e) })
  }
}

parent.on('message', (e: { data: RenderJob | { type: 'cancel' } | { type: 'ensure-browser'; jobId: string } }) => {
  const msg = e.data
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'cancel') {
    cancelCurrent?.()
    return
  }
  if (msg.type === 'ensure-browser') {
    void ensureOnly(msg.jobId)
    return
  }
  if (msg.type === 'render') void run(msg)
})
