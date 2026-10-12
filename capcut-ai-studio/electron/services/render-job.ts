// RENDER MP4 CUA 1 DU AN — dung chung cho nut "Render" (ipc 'remotion:render') va che do CLI (electron/cli/): CUNG thu
// muc du an, CUNG cach dat ten file, CUNG nhat ky xu ly, CUNG luat ban quyen (chi kiem trang thai gan nhat, khong hoi server).
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { assertLicensed } from './license'
import { ENGINE_HOME } from './paths'
import { RenderEvent, startRender } from './remotion'
import { appendRunLog } from './runlog'

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'project'
  )
}

/** Thu muc du an moi: ~/.capcut-studio/projects/<slug>-<base36 gio>. */
export function ensureWorkDir(name: string): string {
  const dir = join(ENGINE_HOME, 'projects', slugify(name) + '-' + Date.now().toString(36))
  mkdirSync(dir, { recursive: true })
  return dir
}

export interface RenderProjectPayload {
  spec: Record<string, unknown>
  workDir?: string
  name?: string
  _run?: { id: string }
}

/** Render spec ra <workDir>/<slug ten>-<ngay-gio>.mp4, ghi nhat ky xu ly (runs/<id>) theo tung chang + moc 25%. */
export async function renderProject(payload: RenderProjectPayload, onEvent: (ev: RenderEvent) => void): Promise<RenderEvent> {
  assertLicensed() // khong hoi server (chi 2 luc: mo app + phan tich) — lan kiem gan nhat phai OK
  const dir = payload.workDir && existsSync(payload.workDir) ? payload.workDir : ensureWorkDir(payload.name || 'remotion')
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  const out = join(dir, `${slugify(payload.name || 'video')}-${stamp}.mp4`)
  // Render chay trong app (khong qua sidecar) -> tu ghi nhat ky xu ly cua project
  const runId = payload._run?.id
  const log = (title: string, level = 'info', extra: Record<string, unknown> = {}) => {
    if (!runId) return
    try {
      appendRunLog(runId, { kind: 'note', step: 'render', title, level, ...extra })
    } catch {
      /* log khong bao gio duoc lam hong render */
    }
  }
  const spec = payload.spec as { duration?: number; clips?: unknown[]; captions?: unknown[]; effects?: unknown[]; audio?: unknown[] }
  log(`Bắt đầu render MP4 bằng Remotion (${Math.round(spec.duration || 0)}s video)`, 'info', {
    output: out,
    so_doan: spec.clips?.length,
    so_caption: spec.captions?.length,
    so_hieu_ung: spec.effects?.length,
    so_sfx: spec.audio?.length
  })
  let lastStage = ''
  let lastMoc = -1
  const t0 = Date.now()
  const res = await startRender(payload.spec, out, (ev) => {
    onEvent(ev)
    if (ev.type === 'log' && ev.message) log(ev.message)
    if (ev.type !== 'progress') return
    if (ev.stage && ev.stage !== lastStage) {
      lastStage = ev.stage
      const ten: Record<string, string> = {
        browser: 'Tải trình render Chrome Headless (chỉ lần đầu)',
        prepare: 'Chuẩn bị bản dựng (nạp composition, font, media)',
        render: 'Đang vẽ từng khung hình',
        encode: 'Đang ghép khung hình + âm thanh thành MP4'
      }
      log(ten[ev.stage] || ev.stage)
    }
    const moc = Math.floor(((ev.progress || 0) * 100) / 25) * 25
    if (ev.stage === 'render' && moc > lastMoc && moc > 0 && moc < 100) {
      lastMoc = moc
      log(`Render ${moc}% (khung ${ev.renderedFrames ?? 0}/${ev.totalFrames ?? '?'})`)
    }
  })
  const giay = Math.round((Date.now() - t0) / 1000)
  if (res.type === 'done') {
    log(`Render xong sau ${giay}s — ${((res.size || 0) / 1e6).toFixed(1)} MB`, 'ok', { output: res.output })
  } else if (res.type === 'cancelled') {
    log(`Đã huỷ render sau ${giay}s`, 'warn')
  } else {
    log('Render lỗi', 'error', { error: res.message })
  }
  return res
}
