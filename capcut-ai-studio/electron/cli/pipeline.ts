// CLI — CHAY 1 VIEC TAO VIDEO tu dau toi cuoi, KHONG giao dien. Thu tu + tham so tung buoc GIONG HET trang "Tao video"
// (src/pages/RemotionStudio.tsx: runAnalyze -> runPlan -> runRender + src/lib/fxHarvest.ts), cung route sidecar, cung
// thu muc du an / thu vien phan tich / cache buoc AI / nhat ky xu ly -> video ra nhu bam tren app.
//   0. ban quyen (hoi may chu nhu bam "Phan tich video")      4. Hieu nguon (+ video mau) — lan 'gemini'
//   1. Doctor: kiem + TU CAI cong cu thieu (nhu luc mo app)   5. Lap ke hoach (/remotion/autoplan) — lan 'claude'
//   2. sidecar + dong bo kho (SFX / meme / nhac / Text / FX)  6. Render MP4 — lan 'render' (1 video 1 luc)
//   3. thu muc du an + chep video / tu lieu vao              7. luu du an ("Video da tao" thay duoc) + dong goi hieu ung
import { execFile } from 'child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { autoFix, DoctorCheck, runDoctor } from '../services/doctor'
import { exeName } from '../services/env'
import { fxRenderPreview, fxShare } from '../services/fx-harvest'
import { libraryManifest, licenseState, requireLicense } from '../services/license'
import { ENGINE_HOME, TOOLS_BIN } from '../services/paths'
import { importMedia, MediaKind } from '../services/project-media'
import { cancelRender } from '../services/remotion'
import { ensureWorkDir, renderProject } from '../services/render-job'
import { appendRunLog } from '../services/runlog'
import { providersConfigured } from '../services/secrets'
import { sidecarRequest, startSidecar, stopSidecar } from '../services/sidecar'
import { acquireLane, cancelFile, Job, JobStep, jobLog, Lane, loadJob, saveJob, withLock } from './jobs'
import { cliState, readJson, setCliState, writeJsonAtomic } from './util'

declare const __CLIENT_UI__: boolean
const CLIENT_UI = typeof __CLIENT_UI__ !== 'undefined' && __CLIENT_UI__

// Hieu video dai / lap plan nhieu luot AI -> cho toi 2 gio (giong ipc.ts LONG_AI_MS)
const LONG_AI_MS = 2 * 60 * 60 * 1000
// Giao dien dong bo kho MOI LAN MO APP; CLI moi job ~ 1 lan mo app nhung khong dong bo lai neu vua xong < 30 phut
const SYNC_EVERY_MS = 30 * 60 * 1000
// Khop src/components/UserMediaPanel.tsx
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|heif|tiff?|bmp|avif)$/i

const LANE_WAIT: Record<Lane, string> = {
  gemini: 'phân tích video',
  claude: 'tạo video',
  render: 'xuất video'
}

class CliError extends Error {
  constructor(
    public step: JobStep,
    message: string,
    public hint?: string
  ) {
    super(message)
  }
}

function deriveTopic(brief?: { summary?: string } | null): string {
  const s = brief?.summary || ''
  const words = s.replace(/[.!?,]/g, '').split(/\s+/).filter(Boolean).slice(0, 5)
  return words.join(' ') || 'Video'
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ffbin(name: 'ffmpeg' | 'ffprobe'): string {
  const p = join(TOOLS_BIN, exeName(name)) // Windows: ffprobe.exe
  return existsSync(p) ? p : exeName(name)
}

/** Thoi luong (giay) bang ffprobe cua app; khong doc duoc -> 0 (giao dien cung tra 0 khi video loi). */
function probeDuration(path: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(ffbin('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path],
      { timeout: 60000 }, (err, stdout) => {
        const d = Number(String(stdout || '').trim())
        resolve(!err && Number.isFinite(d) ? d : 0)
      })
  })
}

/** Anh thu nho 160px (JPEG data URL) o giay min(1, nua video) — giong loadVideoMeta cua giao dien. */
function videoThumb(path: string, duration: number): Promise<string | undefined> {
  const at = Math.min(1, duration / 2 || 0)
  return new Promise((resolve) => {
    execFile(ffbin('ffmpeg'), ['-v', 'error', '-ss', String(at), '-i', path, '-frames:v', '1', '-vf', 'scale=160:-2',
      '-q:v', '8', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'],
    { timeout: 60000, encoding: 'buffer', maxBuffer: 4 << 20 }, (err, stdout) => {
      const buf = stdout as unknown as Buffer
      resolve(!err && buf?.length ? 'data:image/jpeg;base64,' + buf.toString('base64') : undefined)
    })
  })
}

export async function runJob(id: string): Promise<number> {
  const job = loadJob(id)
  if (!job) return 2
  // CHI de tu kiem (selftest-gettime): giu viec nen lai vai giay -> kiem `make` tra ma viec TRUOC khi viec nen xong
  const testDelay = Number(process.env.AGENT_EDIT_TEST_JOB_DELAY_MS || 0)
  if (testDelay > 0 && testDelay <= 60000) await new Promise((r) => setTimeout(r, testDelay))
  job.pid = process.pid
  job.status = 'running'
  job.startedAt = Date.now()
  saveJob(job)

  const fileLog = (line: string) => {
    try {
      appendFileSync(jobLog(id), `[${new Date().toISOString()}] ${line}\n`)
    } catch {
      /* bo qua */
    }
  }
  // nhat ky xu ly cua du an (~/.capcut-studio/runs/<id>) — CUNG file giao dien ghi (logUi)
  const ui = (title: string, level: 'info' | 'ok' | 'warn' | 'error' = 'info', detail?: unknown) => {
    try {
      appendRunLog(id, { kind: 'ui', title, level, detail })
    } catch {
      /* log khong bao gio lam hong viec chinh */
    }
  }
  const set = (step: JobStep, message: string, extra: Partial<Job> = {}) => {
    Object.assign(job, { step, message, waiting: null }, extra)
    saveJob(job)
    fileLog(message)
  }
  const runCtx = (b?: { summary?: string } | null) => ({ id, label: `Tạo video · ${deriveTopic(b)}` })

  let cancelled = false
  let rendering = false
  const onTerm = () => {
    if (cancelled) return
    cancelled = true
    fileLog('Nhận lệnh huỷ')
    if (rendering) cancelRender()
    else stopSidecar() // dang goi AI / cat ghep -> dung sidecar (ca ffmpeg / CLI AI con chau)
  }
  process.on('SIGTERM', onTerm)
  process.on('SIGINT', onTerm)
  // `agent-edit cancel` dat file yeu cau huy (khong phu thuoc cach Electron xu ly tin hieu) -> kiem moi giay
  const cancelPoll = setInterval(() => {
    if (existsSync(cancelFile(id))) onTerm()
  }, 1000)
  const checkCancel = () => {
    if (cancelled) throw new CliError(job.step || 'prepare', 'cancelled')
  }
  const lane = async (name: Lane): Promise<() => void> => {
    const release = await acquireLane(name, id, () => {
      job.waiting = name
      job.message = `Đang chờ lượt ${LANE_WAIT[name]} — có video khác đang chạy, tới lượt sẽ tự chạy tiếp`
      saveJob(job)
      fileLog(job.message)
      ui(`Đang chờ lượt ${LANE_WAIT[name]} — có video khác đang chạy, tới lượt sẽ tự chạy tiếp`)
    }, () => cancelled).catch((e) => {
      throw cancelled ? new CliError(job.step || 'prepare', 'cancelled') : e
    })
    if (job.waiting) {
      job.waiting = null
      saveJob(job)
    }
    return release
  }

  const input = job.input
  let workDir = ''
  let videos: { id: string; path: string; name: string; duration: number; thumb?: string; origPath?: string }[] = []
  let referenceVideo: { path: string; name: string; duration: number; thumb?: string; origPath?: string } | null = null
  let userMedia: Record<string, unknown>[] = []
  let brief: Record<string, unknown> | null = null
  let referenceAnalysis: Record<string, unknown> | null = null
  let planRes: Record<string, any> | null = null
  let render: { output: string; size?: number; seconds?: number; at: number } | null = null

  try {
    // ---- 0. Ban quyen: hoi may chu (giong bam "Phan tich video" tren app) ----
    set('prepare', 'Đang kiểm tra bản quyền…')
    try {
      await requireLicense()
    } catch (e) {
      const st = licenseState()
      const hint =
        st.status === 'need_key' || st.status === 'invalid_key'
          ? 'Kích hoạt key trên máy này: agent-edit activate <KEY>'
          : st.status === 'offline'
            ? 'Kiểm tra kết nối mạng rồi chạy lại.'
            : 'Liên hệ người bán Agent Edit để được hỗ trợ.'
      throw new CliError('prepare', String((e as Error).message || e), hint)
    }
    checkCancel()

    // ---- 1. Doctor: kiem + tu cai cong cu thieu / sai phien ban (giong luc mo app) ----
    set('prepare', 'Đang kiểm tra công cụ trên máy…')
    await ensureTools(fileLog, (m) => set('prepare', m))
    checkCancel()

    // ---- 2. Sidecar + dong bo kho (chay nen song song phan tich; xong truoc khi lap ke hoach) ----
    const sc = await startSidecar((l) => fileLog('[sidecar] ' + l))
    if (!sc.ok) throw new CliError('prepare', 'Không khởi động được bộ xử lý: ' + (sc.error || ''), `Xem nhật ký: ${jobLog(id)}`)
    const syncP = syncLibrary(fileLog)

    // ---- 3. Thu muc du an + chep video vao (giong them video tren app) ----
    set('import', 'Đang chép video vào thư mục dự án…')
    workDir = ensureWorkDir('remotion-' + deriveTopic(null))
    job.workDir = workDir
    saveJob(job)
    const imp = async (paths: string[], kind: MediaKind) => {
      const items = await importMedia(workDir, paths, kind)
      const bad = items.filter((it) => !it.path)
      if (bad.length) {
        throw new CliError('import', bad.map((it) => `${basename(it.src)}: ${it.error || 'không chép được'}`).join('; '),
          'Kiểm tra đường dẫn file (phải là đường dẫn tuyệt đối tới file có thật).')
      }
      return items as { src: string; path: string }[]
    }
    const uniq = (a: string[]) => a.filter((p, i) => a.indexOf(p) === i)
    const srcItems = await imp(uniq(input.videos), 'source')
    videos = await Promise.all(
      srcItems.map(async (it, i) => {
        const duration = await probeDuration(it.path)
        return {
          id: `source_${i + 1}`,
          path: it.path,
          name: basename(it.src),
          duration,
          thumb: await videoThumb(it.path, duration),
          ...(it.path !== it.src ? { origPath: it.src } : {})
        }
      })
    )
    if (input.reference) {
      const it = (await imp([input.reference], 'reference'))[0]
      const duration = await probeDuration(it.path)
      referenceVideo = {
        path: it.path,
        name: basename(it.src),
        duration,
        thumb: await videoThumb(it.path, duration),
        ...(it.path !== it.src ? { origPath: it.src } : {})
      }
    }
    if (input.inserts.length) {
      const items = await imp(input.inserts.map((m) => m.path), 'insert')
      userMedia = await Promise.all(
        items.map(async (it, i) => {
          const m = input.inserts[i]
          const kind = IMAGE_EXT.test(it.path) ? 'image' : 'video'
          const duration = kind === 'video' ? await probeDuration(it.path) : 0
          return {
            id: `media_${i + 1}`,
            kind,
            path: it.path,
            name: basename(it.src),
            use: m.use,
            placement: m.placement,
            note: m.note,
            ...(it.path !== it.src ? { origPath: it.src } : {}),
            ...(kind === 'video' ? { thumb: await videoThumb(it.path, duration), duration } : {})
          }
        })
      )
      ui(`Thêm ${userMedia.length} tư liệu chèn lên video: ${userMedia.map((r) => r.name).join(', ')}`)
    }
    checkCancel()

    // ---- 4. Hieu nguon + video mau CUNG LUC (1 luot "phan tich"); tu lieu doc rieng, khong qua hang doi ----
    const umP = userMedia.length
      ? (async () => {
          ui(`Gemini đọc ${userMedia.length} tư liệu${input.fresh ? ' (đọc lại)' : ''}: ${userMedia.map((t) => t.name).join(', ')}`)
          try {
            const r = await sidecarRequest('/remotion/understand_media', {
              items: userMedia.map(({ id: mid, kind, path, name }) => ({ id: mid, kind, path, name })),
              fresh: input.fresh,
              _run: runCtx(null)
            }, LONG_AI_MS)
            const res = (r?.results || {}) as Record<string, Record<string, unknown>>
            userMedia = userMedia.map((m) => {
              const x = res[m.id as string]
              if (!r?.ok || !x) return { ...m, error: r?.error || 'không có kết quả' }
              if (x.error) return { ...m, error: x.error }
              return { ...m, analysis: x.analysis, measured: x.measured, analyzedAt: x.at, workPath: x.work }
            })
          } catch (e) {
            userMedia = userMedia.map((m) => ({ ...m, error: String((e as Error)?.message || e) }))
          }
        })()
      : Promise.resolve()

    set('analyze', 'Đang phân tích video…')
    ui(`Bấm "Hiểu nguồn" với ${videos.length} video${referenceVideo ? ' + video mẫu ' + referenceVideo.name : ' (không có video mẫu)'}`, 'info', {
      videos: videos.map((v) => ({ id: v.id, name: v.name, duration: v.duration, path: v.path })),
      video_mau: referenceVideo ? { name: referenceVideo.name, duration: referenceVideo.duration, path: referenceVideo.path } : null,
      dung_lai: { nguon: false, mau: false },
      fresh: input.fresh,
      nguon_lenh: 'cli'
    })
    {
      const release = await lane('gemini')
      set('analyze', 'Đang phân tích video…')
      let src: PromiseSettledResult<Record<string, unknown>>
      let ref: PromiseSettledResult<Record<string, unknown> | null>
      try {
        const sources = async () => {
          const u = await sidecarRequest('/understand_sources', {
            videos: videos.map(({ id: vid, path, name, duration }) => ({ id: vid, path, name, duration })),
            fresh: input.fresh,
            _run: runCtx(null)
          }, LONG_AI_MS)
          if (!u.ok || !u.brief) throw new Error(u.error || 'Lỗi đọc hiểu video')
          const nReused = Object.keys(u.reused || {}).length
          if (nReused) ui(`Dùng lại phân tích đã lưu cho ${nReused}/${videos.length} video (không gọi lại Gemini)`, 'info', u.reused)
          return u.brief as Record<string, unknown>
        }
        const reference = async () => {
          if (!referenceVideo) return null
          const r = await sidecarRequest('/remotion/understand_reference', {
            video: { path: referenceVideo.path, name: referenceVideo.name, duration: referenceVideo.duration },
            fresh: input.fresh,
            _run: runCtx(null)
          }, LONG_AI_MS)
          if (!r.ok || !r.analysis) throw new Error(r.error || 'Lỗi phân tích video mẫu')
          return r.analysis as Record<string, unknown>
        }
        ;[src, ref] = await Promise.allSettled([sources(), reference()])
      } finally {
        release()
      }
      checkCancel()
      if (ref.status === 'fulfilled' && ref.value) referenceAnalysis = ref.value
      if (src.status === 'rejected') {
        const message = String((src.reason as Error)?.message || src.reason)
        ui('Lỗi ở bước Hiểu nguồn', 'error', message)
        throw new CliError('analyze', message, 'Thử chạy lại; nếu báo chưa đăng nhập Gemini: agent-edit login gemini')
      }
      brief = src.value
      if (ref.status === 'rejected') {
        const message = String((ref.reason as Error)?.message || ref.reason)
        ui('Lỗi ở phần Video mẫu (Gemini)', 'error', message)
        throw new CliError('analyze', 'Lỗi phân tích video mẫu: ' + message,
          'Chạy lại (phần video nguồn đã phân tích được dùng lại), hoặc chạy lại không kèm --reference để bỏ video mẫu.')
      }
    }

    // ---- 5. Lap ke hoach (giong runPlan): doi tu lieu doc xong + kho dong bo xong ----
    set('plan', CLIENT_UI ? 'Đang tạo video…' : 'Đang lập kế hoạch dựng video…')
    await umP
    await Promise.race([syncP, new Promise((r) => setTimeout(r, 5 * 60 * 1000))])
    checkCancel()
    ui(input.newPlan ? 'Bấm lập plan MỚI (bỏ qua kết quả đã lưu)' : 'Bắt đầu lập kế hoạch dựng video', 'info', {
      co_video_mau: !!referenceAnalysis,
      tu_lieu: userMedia.map((m) => ({ id: m.id, name: m.name, use: m.use, placement: m.placement, note: m.note })),
      loai_video: input.orientation
    })
    {
      const release = await lane('claude')
      set('plan', CLIENT_UI ? 'Đang tạo video…' : 'Đang lập kế hoạch dựng video…')
      try {
        const r = await sidecarRequest('/remotion/autoplan', {
          _run: runCtx(brief),
          brief,
          reference_analysis: referenceAnalysis,
          edit_request: input.editRequest,
          brand_guide: input.brandGuide,
          user_media: userMedia.length
            ? userMedia.map((m) => ({
                id: m.id,
                kind: m.kind,
                path: m.path,
                name: m.name,
                use: m.use,
                placement: m.placement,
                note: m.note,
                analysis: m.analysis || null
              }))
            : undefined,
          orientation: input.orientation,
          title: deriveTopic(brief),
          project: id,
          fresh: !!input.newPlan
        }, LONG_AI_MS)
        if (!r.ok || !r.plan || !r.spec) throw new Error(r.error || 'Lỗi lập kế hoạch')
        planRes = r
        if (r.brief) brief = r.brief // brief cu vua duoc can lai gio loi noi
      } catch (e) {
        checkCancel()
        const message = String((e as Error).message || e)
        ui('Lỗi ở bước lập kế hoạch', 'error', message)
        throw new CliError('plan', message, 'Thử chạy lại; nếu báo chưa đăng nhập Claude: agent-edit login claude')
      } finally {
        release()
      }
    }
    checkCancel()

    // ---- 6. Render MP4 (1 video 1 luc) ----
    const spec = planRes!.spec as Record<string, unknown>
    set('render', 'Đang xuất video MP4…', { progress: 0 })
    {
      const release = await lane('render')
      set('render', 'Đang xuất video MP4…', { progress: 0 })
      ui(`Bấm Render MP4 (${Math.round(Number(spec.duration) || 0)}s, ${(spec.clips as unknown[] | undefined)?.length ?? 0} đoạn)`)
      let lastSave = 0
      try {
        rendering = true
        const name = input.name?.trim() || `${todayStr()} ${deriveTopic(brief)}`
        const ev = await renderProject({ spec, workDir, name, _run: { id } }, (e) => {
          if (e.type !== 'progress') return
          const now = Date.now()
          if (now - lastSave < 1500) return
          lastSave = now
          const pct = Math.round((e.progress || 0) * 100)
          const stage = e.stage === 'browser' ? 'Đang tải trình render lần đầu' : e.stage === 'encode' ? 'Đang ghép thành MP4' : 'Đang xuất video MP4'
          job.progress = e.progress || 0
          job.message = `${stage} — ${pct}%`
          saveJob(job)
        })
        rendering = false
        if (ev.type === 'cancelled') throw new CliError('render', 'cancelled')
        if (ev.type !== 'done' || !ev.output) throw new CliError('render', ev.message?.split('\n')[0] || 'Render lỗi', `Xem nhật ký: ${jobLog(id)}`)
        render = { output: ev.output, size: ev.size, seconds: ev.seconds, at: Date.now() }
        ui(`Render xong: ${ev.output} (${((ev.size || 0) / 1048576).toFixed(1)} MB, ${Math.round(ev.seconds || 0)}s)`, 'ok')
      } finally {
        rendering = false
        release()
      }
    }

    // ---- 7. Xong: chep ra --out, luu du an, ket qua ----
    set('finish', 'Đang hoàn tất…')
    let copy: string | undefined
    if (input.outDir) {
      try {
        mkdirSync(input.outDir, { recursive: true })
        copy = join(input.outDir, basename(render.output))
        copyFileSync(render.output, copy)
      } catch (e) {
        fileLog('Chép ra thư mục --out lỗi: ' + String((e as Error).message || e))
        copy = undefined
      }
    }
    const warnings = (planRes!.warnings as string[] | undefined) || []
    const userWarn = warnings.filter((w) => w.startsWith('Tư liệu'))
    if (warnings.some((w) => !w.startsWith('Tư liệu'))) userWarn.push('Một vài chi tiết trang trí không tạo được — chạy lại với --new-plan để thử lại.')
    job.result = {
      output: render.output,
      ...(copy ? { copy } : {}),
      size: render.size || (existsSync(render.output) ? statSync(render.output).size : 0),
      seconds: Math.round(render.seconds || 0),
      duration: Number(spec.duration) || undefined,
      width: Number(spec.width) || undefined,
      height: Number(spec.height) || undefined,
      workDir,
      topic: deriveTopic(brief),
      warnings: userWarn
    }
    saveProject({ id, job, workDir, videos, referenceVideo, userMedia, brief, referenceAnalysis, planRes, render, error: null })
    job.status = 'done'
    job.finishedAt = Date.now()
    job.tail = Array.isArray((planRes!.plan as { fx?: unknown[] }).fx) && !!((planRes!.plan as { fx?: unknown[] }).fx || []).length
    set('finish', 'Đã xong video.', { progress: 1 })
  } catch (e) {
    const isCancel = cancelled || (e instanceof CliError && e.message === 'cancelled')
    const step = e instanceof CliError ? e.step : job.step || 'prepare'
    job.finishedAt = Date.now()
    if (isCancel) {
      job.status = 'cancelled'
      job.message = 'Đã huỷ.'
      ui('Đã huỷ (lệnh agent-edit cancel)', 'warn')
    } else {
      job.status = 'error'
      job.error = {
        step,
        message: String((e as Error)?.message || e).slice(0, 2000),
        ...(e instanceof CliError && e.hint ? { hint: e.hint } : { hint: `Xem nhật ký: ${jobLog(id)}` })
      }
      job.message = 'Lỗi: ' + job.error.message.split('\n')[0].slice(0, 300)
    }
    saveJob(job)
    fileLog(job.message || '')
    // du an da co video: luu de mo tren app thay loi + bam "Tiep tuc" (giong giao dien luu loi theo buoc)
    if (videos.length && workDir) {
      const uiStep = step === 'analyze' ? (brief ? 'understand-reference' : 'understand-sources') : step === 'plan' ? 'plan' : step === 'render' ? 'render' : null
      saveProject({
        id, job, workDir, videos, referenceVideo, userMedia, brief, referenceAnalysis, planRes, render,
        error: uiStep && !isCancel ? { step: uiStep, message: job.error?.message || '' } : null
      })
    }
    stopSidecar()
    return isCancel ? 130 : 1
  } finally {
    if (job.status !== 'done') {
      clearInterval(cancelPoll)
      process.off('SIGTERM', onTerm)
      process.off('SIGINT', onTerm)
    }
  }

  // ---- 8. Viec nen sau khi xong (giong harvestAfterRender + kickHarvest): dong goi hieu ung tu viet vao kho ----
  if (job.tail) {
    try {
      await harvestEffects(id, planRes!.plan as Record<string, unknown>, job.input.orientation, fileLog, () => cancelled)
    } catch (e) {
      fileLog('Đóng gói hiệu ứng lỗi (bỏ qua): ' + String((e as Error).message || e))
    }
    const j = loadJob(id)
    if (j) {
      j.tail = false
      saveJob(j)
    }
  }
  clearInterval(cancelPoll)
  process.off('SIGTERM', onTerm)
  process.off('SIGINT', onTerm)
  stopSidecar()
  return 0
}

// ---------------------------------------------------------------------------
// Doctor: giong luc mo app — kiem, con muc tu cai duoc thi cai (1 tien trinh 1 luc), van "fail" thi bao ro
// ---------------------------------------------------------------------------
const needsFix = (cs: DoctorCheck[]) => cs.some((c) => c.fix && c.auto && c.status !== 'ok')

export async function ensureTools(log: (l: string) => void, say: (m: string) => void): Promise<DoctorCheck[]> {
  let checks = await runDoctor(providersConfigured())
  if (needsFix(checks)) {
    await withLock('doctor-fix', async () => {
      checks = await runDoctor(providersConfigured())
      if (!needsFix(checks)) return
      say('Đang tự cài công cụ còn thiếu (lần đầu có thể mất vài phút)…')
      const r = await autoFix(() => providersConfigured(), (fid, line) => log(`[cài ${fid}] ${line}`), () => undefined)
      checks = r.checks
    }, () => say('Đang chờ tiến trình khác cài xong công cụ…'))
    checks = await runDoctor(providersConfigured())
  }
  const fails = checks.filter((c) => c.status === 'fail')
  if (fails.length) {
    const ai = fails.filter((c) => c.group === 'ai')
    const hints: string[] = []
    for (const c of ai) {
      if (c.id === 'ai_gemini') hints.push(c.detail.includes('API key') ? 'agent-edit config --gemini-key <KEY>' : 'agent-edit login gemini')
      else if (c.id === 'ai_planner') hints.push(c.detail.includes('API key') ? 'agent-edit config --claude-key <KEY>' : 'agent-edit login claude')
      else if (c.id === 'codex') hints.push('agent-edit login codex')
    }
    if (fails.length > ai.length) hints.push('agent-edit doctor --fix (xem chi tiết từng mục)')
    throw new CliError('prepare', 'Máy chưa đủ điều kiện tạo video: ' + fails.map((c) => `${c.label} — ${c.detail}`).join('; '),
      hints.join(' ; '))
  }
  return checks
}

// ---------------------------------------------------------------------------
// Dong bo kho (giong nut "Dong bo kho" / luot tu chay luc mo app): chi qua may chu ban quyen, 1 tien trinh 1 luc
// ---------------------------------------------------------------------------
export async function syncLibrary(log: (l: string) => void, force = false): Promise<Record<string, unknown> | null> {
  const recent = () => Date.now() - Number(cliState().librarySyncAt || 0) < SYNC_EVERY_MS
  if (!force && recent()) return null
  try {
    return await withLock('library-sync', async () => {
      if (!force && recent()) return null
      let last: Record<string, unknown> | null = null
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const manifest = await libraryManifest()
          last = (await sidecarRequest('/library/sync', { manifest }, 30 * 60 * 1000)) as Record<string, unknown>
          if (last?.ok !== false) {
            setCliState({ librarySyncAt: Date.now() })
            log('Đồng bộ kho xong')
            return last
          }
        } catch (e) {
          last = { ok: false, error: String((e as Error).message || e) }
        }
        log(`Đồng bộ kho lỗi (lần ${attempt}): ${String(last?.error || '')}`)
        if (attempt < 2) await new Promise((r) => setTimeout(r, 20000))
      }
      return last
    }, undefined, 10 * 60 * 1000)
  } catch (e) {
    log('Đồng bộ kho lỗi: ' + String((e as Error).message || e))
    return { ok: false, error: String((e as Error).message || e) }
  }
}

// ---------------------------------------------------------------------------
// Kho hieu ung (giong src/lib/fxHarvest.ts): dong goi -> preview -> Gemini gan nhan -> gui kho chung, tung viec mot
// ---------------------------------------------------------------------------
async function harvestEffects(id: string, plan: Record<string, unknown>, orientation: string, log: (l: string) => void,
  stop: () => boolean) {
  const fx = Array.isArray(plan?.fx) ? (plan.fx as unknown[]) : []
  if (fx.length) await sidecarRequest('/fxlib/harvest', { fx, project: id, orientation })
  let labelOffline = false
  let shareOffline = false
  for (let guard = 0; guard < 200 && !stop(); guard++) {
    const r = await sidecarRequest('/fxlib/list')
    const p = r?.pending as { preview: string[]; label: string[]; share: string[] } | undefined
    if (!r?.ok || !p) return
    if (p.preview.length) {
      const release = await acquireLane('render', 'fxlib', () => undefined, () => false)
      try {
        const res = await fxRenderPreview(p.preview[0])
        log(`Kho hiệu ứng: preview ${p.preview[0]} ${res.ok ? 'xong' : 'lỗi ' + (res.error || '')}`)
        if (res.busy || res.cancelled) return
      } finally {
        release()
      }
      continue
    }
    if (p.label.length && !labelOffline) {
      const release = await acquireLane('gemini', 'fxlib', () => undefined, () => false)
      try {
        const res = await sidecarRequest('/fxlib/label', { ids: p.label.slice(0, 4) }, LONG_AI_MS)
        if (!res?.ok || res?.stop) labelOffline = true
      } finally {
        release()
      }
      continue
    }
    if (p.share.length && !shareOffline) {
      const res = await fxShare(p.share[0])
      if (!res.ok && res.retry) shareOffline = true
      continue
    }
    return
  }
}

// ---------------------------------------------------------------------------
// Luu du an vao projects.json (giao dien "Video da tao" thay + mo lai duoc) — GHI NGUYEN TU, khong dung con tro the
// dang mo cua giao dien. projects.json dang bi giao dien ghi do (doc loi JSON) -> thu lai; van loi thi BO QUA (khong
// bao gio ghi de file bang danh sach rong).
// ---------------------------------------------------------------------------
function saveProject(d: {
  id: string
  job: Job
  workDir: string
  videos: Record<string, unknown>[]
  referenceVideo: Record<string, unknown> | null
  userMedia: Record<string, unknown>[]
  brief: Record<string, unknown> | null
  referenceAnalysis: Record<string, unknown> | null
  planRes: Record<string, any> | null
  render: { output: string; size?: number; seconds?: number; at: number } | null
  error: { step: string; message: string } | null
}): void {
  const FILE = join(ENGINE_HOME, 'projects.json')
  type Store = { current: string | null; items: Record<string, unknown>; [k: string]: unknown }
  let store: Store | null = null
  for (let i = 0; i < 8 && !store; i++) {
    if (!existsSync(FILE)) store = { current: null, items: {} }
    else {
      const s = readJson<Store | null>(FILE, null)
      if (s && typeof s === 'object' && s.items && typeof s.items === 'object') store = s
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150) // doi giao dien ghi xong
    }
  }
  if (!store) return
  const inp = d.job.input
  const compact = <T extends Record<string, unknown>>(o: T | undefined) =>
    o && Object.values(o).some((v) => (Array.isArray(v) ? v.length : !!v)) ? o : undefined
  const now = Date.now()
  const prev = store.items[d.id] as { createdAt?: number } | undefined
  const spec = d.planRes?.spec
  store.items[d.id] = {
    id: d.id,
    createdAt: prev?.createdAt || d.job.createdAt || now,
    updatedAt: now,
    mode: 'remotion',
    status: d.render ? 'done' : spec ? 'preview' : 'upload',
    topic: deriveTopic(d.brief),
    video: d.videos[0],
    videos: d.videos,
    referenceVideo: d.referenceVideo,
    editRequest: compact(inp.editRequest),
    brandGuide: compact(inp.brandGuide),
    orientation: inp.orientation,
    workDir: d.workDir,
    sourceBrief: d.brief || undefined,
    referenceAnalysis: d.referenceAnalysis || undefined,
    rmPlan: d.planRes?.plan || undefined,
    rmSpec: spec || undefined,
    rmSummary: d.planRes?.summary || undefined,
    rmRender: d.render,
    guard: d.planRes?.guard || undefined,
    userMedia: d.userMedia.length ? d.userMedia : undefined,
    error: d.error,
    createdBy: 'cli'
  }
  try {
    writeJsonAtomic(FILE, store)
  } catch {
    /* khong luu duoc danh sach -> video van nam trong thu muc du an */
  }
}
