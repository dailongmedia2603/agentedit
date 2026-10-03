import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  Film,
  Brain,
  FileText,
  Rocket,
  FolderOpen,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RotateCcw,
  ArrowRight,
  Sparkles,
  Play,
  X,
  Plus,
  ScanSearch,
  ScrollText,
  MonitorPlay,
  Clapperboard,
  Download,
  Square,
  Library,
  Hourglass
} from 'lucide-react'
import { Button, Card, CardBody, CardHeader, Spinner, Badge, Progress, Collapsible } from '@/components/ui/primitives'
import { SourceBriefView, ReferenceAnalysisView, GuardView } from '@/components/ResultViews'
import { RemotionPreview, RemotionPlanView, RemotionReferenceExtra, fmtBytes, planAiName } from '@/components/RemotionViews'
import EditRequestForm from '@/components/EditRequestForm'
import BrandGuideForm, { compactBrandGuide, emptyBrandGuide } from '@/components/BrandGuideForm'
import { LibraryPicker, SavedBadge, useLibraryLookup } from '@/components/LibraryPicker'
import RunLogPanel from '@/components/RunLogPanel'
import { isFullUi, useFullUi } from '@/lib/clientUi'
import UserMediaPanel, { IMAGE_EXT, MEDIA_EXT } from '@/components/UserMediaPanel'
import { cn, fmtTime, todayStr } from '@/lib/utils'
import { adoptProjectMedia, replacePaths, insideDir, baseName, type MissingMedia } from '@/lib/projectMedia'
import { loadVideoMeta } from '@/lib/media'
import type { RenderSpec } from '../../remotion-src/types'
import { IS_WIN, REVEAL_LABEL } from '../lib/platform'
import { acquire, cancelWait, waitPosition, QueueCancelled, type Lane } from '@/lib/jobQueue'
import { useJobQueue } from '@/lib/useJobQueue'

/** Khop sidecar remotion_plan.SPEC_MEDIA_VERSION — spec cu hon thi dung lai tu plan khi mo du an */
const SPEC_MEDIA_VERSION = 9

type Step = 'understand-sources' | 'understand-reference' | 'plan' | 'render'
// 2026-10-02: buoc "Video mau" gop vao "Hieu nguon" (Gemini doc nguon + mau CUNG LUC) -> khong con stage 'reference';
// du an cu luu status 'reference' duoc mo o 'upload' (hydrateFrom)
type Stage = 'upload' | 'preview' | 'done'

const STEPS = [
  { id: 'sources', label: 'Hiểu nguồn', icon: Brain },
  { id: 'plan', label: 'Plan', icon: FileText },
  { id: 'preview', label: 'Xem trước', icon: MonitorPlay },
  { id: 'render', label: 'Render', icon: Clapperboard },
  { id: 'watch', label: 'Xem video', icon: PlayCircle }
]

const STEP_LABEL: Record<Step, string> = {
  'understand-sources': 'Hiểu video nguồn + video mẫu (Gemini)',
  'understand-reference': 'Phân tích video mẫu (Gemini)',
  plan: 'Lập kế hoạch dựng video',
  render: 'Xuất video MP4'
}

// Ban cai cho may khac (clientUi): khong neu ten buoc / ten AI — chi "phan tich" / "tao video" / "xuat video"
const STEP_ERROR_CLIENT: Record<Step, string> = {
  'understand-sources': 'Có lỗi khi phân tích video',
  'understand-reference': 'Có lỗi khi phân tích video mẫu',
  plan: 'Có lỗi khi tạo video',
  render: 'Có lỗi khi xuất video'
}

const STATUS_OF: Record<Step, string> = {
  'understand-sources': 'understanding',
  'understand-reference': 'analyzing_reference',
  plan: 'planning',
  render: 'rendering'
}

const RENDER_STAGE: Record<string, string> = {
  browser: 'Tải trình render lần đầu (Chrome Headless ~90MB, chỉ một lần)',
  prepare: 'Chuẩn bị bản dựng',
  render: 'Đang vẽ từng khung hình',
  encode: 'Đang ghép thành MP4'
}

const emptyEditRequest: EditRequest = { purpose: '', style: '', audience: '', duration: '' }

/** Ten lan cua hang doi (src/lib/jobQueue.ts) — chu tren UI / nhat ky */
const LANE_LABEL: Record<Lane, { full: string; client: string }> = {
  gemini: { full: 'phân tích video (Gemini)', client: 'phân tích' },
  claude: { full: 'lập kế hoạch (Claude)', client: 'tạo video' },
  render: { full: 'xuất video (render)', client: 'xuất video' }
}

/** Trang thai 1 video (1 the) bao len CreateVideo: ten the, chip trang thai, dang ban (khong cho dong / xoa) */
export interface JobInfo {
  projectId: string
  title: string
  /** empty = the trong; idle = da co video, chua chay; waiting = dang cho luot o hang doi */
  status: 'empty' | 'idle' | 'waiting' | 'running' | 'preview' | 'done' | 'error'
  step: Step | null
  lane: Lane | null
  renderPct: number | null
  busy: boolean
  /** Da doc xong du an cua the (initialProjectId) */
  loaded: boolean
}

function compactEditRequest(req: EditRequest): EditRequest | undefined {
  const cleaned: EditRequest = {
    purpose: req.purpose?.trim(),
    style: req.style?.trim(),
    audience: req.audience?.trim(),
    duration: req.duration?.trim()
  }
  return Object.values(cleaned).some(Boolean) ? cleaned : undefined
}

/** Chu ky phan NGUOI DUNG NHAP cua tu lieu (khop cach sidecar chuan hoa) — doi so voi plan = can lap lai plan */
function umSig(list: { id: string; use?: string; placement?: string; note?: string; path?: string }[] | null | undefined) {
  return JSON.stringify(
    (list || []).map((m) => [m.id, m.use, m.placement, (m.note || '').split(/\s+/).filter(Boolean).join(' ').slice(0, 500), m.path])
  )
}

function deriveTopic(brief?: SourceBrief | null): string {
  const s = brief?.summary || ''
  const words = s.replace(/[.!?,]/g, '').split(/\s+/).filter(Boolean).slice(0, 5)
  return words.join(' ') || 'Video'
}

/**
 * 1 VIDEO (1 the trong src/pages/CreateVideo.tsx). Nhieu the cung mounted -> nhieu video chay cung luc, moi the giu
 * nguyen co che cu; chi xin luot o hang doi dung chung (src/lib/jobQueue.ts): phan tich (Gemini), lap plan (Claude),
 * render (1 video 1 luc).
 */
export default function RemotionStudioPage({
  ready,
  jobKey,
  initialProjectId,
  deletedReq,
  onInfo,
  onNewVideo
}: {
  ready: boolean
  /** Khoa cua the (CreateVideo) */
  jobKey: string
  /** Du an mo khi the duoc tao (null = the trong) */
  initialProjectId: string | null
  /** Du an vua bi xoa o "Video da tao" — dang mo thi dong lai (khong tu luu nguoc lai vao danh sach) */
  deletedReq?: { id: string; nonce: number } | null
  /** Bao trang thai the (ten, buoc, dang cho luot, dang ban -> "Video da tao" khong cho xoa, khong dong the) */
  onInfo?: (jobKey: string, info: JobInfo) => void
  /** Mo them 1 the video moi (chay song song voi video nay) */
  onNewVideo?: () => void
}) {
  const [stage, setStage] = useState<Stage>('upload')
  // Ban cai cho may khac: an thanh cac buoc, nhat ky, khung ket qua tung buoc, ten AI (src/lib/clientUi.ts)
  const fullUi = useFullUi()
  // AI lap ke hoach dang chon trong Cai dat API (chi de hien chu khi dang chay)
  const [plannerName, setPlannerName] = useState('Claude')
  const [videos, setVideos] = useState<SourceVideo[]>([])
  const [referenceVideo, setReferenceVideo] = useState<VideoFile | null>(null)
  const [editRequest, setEditRequest] = useState<EditRequest>(emptyEditRequest)
  const [brandGuide, setBrandGuide] = useState<BrandGuide>(emptyBrandGuide)
  const [workDir, setWorkDir] = useState('')
  const [brief, setBrief] = useState<SourceBrief | null>(null)
  const [referenceAnalysis, setReferenceAnalysis] = useState<RemotionReferenceAnalysis | null>(null)
  // Thu vien phan tich: video nao da co phan tich luu (dung lai, khong goi lai AI)
  const [libOpen, setLibOpen] = useState<null | 'source' | 'reference'>(null)
  const srcLib = useLibraryLookup(videos.map((v) => v.path))
  const refLib = useLibraryLookup(referenceVideo ? [referenceVideo.path] : [])
  const [plan, setPlan] = useState<RemotionPlan | null>(null)
  const [spec, setSpec] = useState<RenderSpec | null>(null)
  const [guard, setGuard] = useState<GuardReport | null>(null)
  const [summary, setSummary] = useState<RemotionSummary | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [reusedSteps, setReusedSteps] = useState<string[]>([])
  const [render, setRender] = useState<RemotionRenderInfo | null>(null)
  const [renderEv, setRenderEv] = useState<RemotionRenderEvent | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [running, setRunning] = useState<Step | null>(null)
  const [error, setError] = useState<{ step: Step; message: string } | null>(null)
  const [projectId, setProjectId] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [mediaBase, setMediaBase] = useState('')
  const [finalUrl, setFinalUrl] = useState('')
  const [catalog, setCatalog] = useState<RemotionCatalog | null>(null)
  // Video cua du an (chep vao thu muc du an): dang chep / video da mat / ghi chu
  const [mediaBusy, setMediaBusy] = useState<string | null>(null)
  const [mediaAlert, setMediaAlert] = useState<{ missing: MissingMedia[]; notes: string[]; errors: string[] } | null>(
    null
  )
  // >0 = spec phai dung lai tu plan (duong dan video doi / file cua spec da mat)
  const [staleTick, setStaleTick] = useState(0)
  // Tu lieu cua nguoi dung (anh / video hien LEN video) + cac luot Gemini dang doc
  const [userMedia, setUserMedia] = useState<UserMediaItem[]>([])
  const userMediaRef = useRef<UserMediaItem[]>([])
  userMediaRef.current = userMedia
  const pendingMedia = useRef(new Set<Promise<void>>())
  const hydrated = useRef(false)
  // Hang doi dung chung: lan dang cho luot (null = khong cho) + anh chup hang doi de hien vi tri
  const [waitLane, setWaitLane] = useState<Lane | null>(null)
  const queue = useJobQueue()
  // The nay DANG render (giu luot render) -> chi the nay nhan tien do / duoc huy render cua Electron
  const renderingRef = useRef(false)
  // Doi moi lan "Lam moi" / mo du an khac: buoc dang chay do (cu) xong sau do thi bo ket qua, khong ghi de du an moi
  const genRef = useRef(0)
  // Da doc xong du an mo cung the (bao CreateVideo: truoc do giu id du an se mo khi luu danh sach the)
  const [loaded, setLoaded] = useState(!initialProjectId)

  useEffect(() => {
    window.studio.remotionMediaBase().then(setMediaBase).catch(() => setMediaBase(''))
  }, [])

  // Danh muc Remotion (ten tieng Viet cho transition/hieu ung/kieu chu) — chi de hien thi
  useEffect(() => {
    if (!ready || catalog) return
    window.studio
      .remotionCatalog()
      .then((r) => r.ok && r.catalog && setCatalog(r.catalog))
      .catch(() => undefined)
  }, [ready, catalog])

  useEffect(() => {
    if (!running) {
      setElapsed(0)
      return
    }
    setElapsed(0)
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [running])

  // Tien do render (worker -> main -> day) — chi the dang giu luot render (Electron chi chay 1 render 1 luc)
  useEffect(() => window.studio.onRemotionProgress((ev) => renderingRef.current && setRenderEv(ev)), [])

  // URL phat video hoan chinh qua may chu media cuc bo
  useEffect(() => {
    if (!render?.output) {
      setFinalUrl('')
      return
    }
    window.studio.remotionMediaUrl(render.output).then((u) => setFinalUrl(`${u}&v=${render.at}`))
  }, [render])

  const hydrateFrom = (p: Project) => {
    genRef.current++
    setProjectId(p.id)
    setVideos(p.videos || [])
    setReferenceVideo(p.referenceVideo || null)
    setEditRequest({ ...emptyEditRequest, ...(p.editRequest || {}) })
    setBrandGuide({ ...emptyBrandGuide, ...(p.brandGuide || {}) })
    setWorkDir(p.workDir || '')
    setBrief((p.sourceBrief as SourceBrief) || null)
    setReferenceAnalysis((p.referenceAnalysis as RemotionReferenceAnalysis) || null)
    setPlan(p.rmPlan || null)
    setSpec(p.rmSpec || null)
    setGuard(p.guard || null)
    setSummary(p.rmSummary || null)
    setRender(p.rmRender || null)
    setUserMedia((p.userMedia || []).map((m) => ({ ...m, analyzing: false })))
    setWarnings([])
    setReusedSteps([])
    setRunning(null)
    setRenderEv(null)
    setNotice(null)
    const dangDo = Object.entries(STATUS_OF).find(([, st]) => st === p.status)
    if (dangDo) {
      const step = dangDo[0] as Step
      setError({
        step,
        message: isFullUi()
          ? 'Phiên trước bị gián đoạn. Bấm Tiếp tục để chạy lại bước này.'
          : 'Lần chạy trước bị gián đoạn. Bấm Thử lại để tiếp tục.'
      })
      setStage(step === 'render' ? 'preview' : 'upload')
    } else {
      setError((p.error as { step: Step; message: string } | null) || null)
      // 'reference' (du an cu: hieu nguon xong, chua chon video mau) -> 'upload' (video mau nay nam o buoc Hieu nguon)
      setStage((['upload', 'preview', 'done'].includes(p.status) ? p.status : 'upload') as Stage)
    }
  }

  // Mo du an: video con nam ngoai thu muc du an -> chep vao (du an cu); video da mat -> khoi phuc / bao
  const openProject = async (p: Project) => {
    setMediaBusy('Đang kiểm tra video của dự án…')
    let r
    try {
      r = await adoptProjectMedia(p, {
        newWorkDir: (name) => window.studio.newWorkDir(name),
        mediaImport: (wd, paths, kind, names) => window.studio.mediaImport(wd, paths, kind, names),
        mediaMissing: (paths) => window.studio.mediaMissing(paths),
        duration: async (path) => (await loadVideoMeta(path)).duration
      })
    } catch (e) {
      r = { project: p, changed: false, copied: 0, missing: [], specStale: false, errors: [String((e as Error).message || e)] }
    }
    if (r.changed) await window.studio.projectSave(r.project)
    hydrateFrom(r.project)
    setMediaBusy(null)
    const notes = r.copied
      ? [`Đã chép ${r.copied} video vào thư mục dự án — từ giờ chuyển hay xoá file gốc cũng không ảnh hưởng dự án.`]
      : []
    setMediaAlert(r.missing.length || notes.length || r.errors.length ? { missing: r.missing, notes, errors: r.errors } : null)
    setStaleTick(r.specStale ? 1 : 0)
  }

  // Mo du an cua the (CreateVideo quyet dinh du an nao mo o the nao)
  useEffect(() => {
    if (!initialProjectId) {
      hydrated.current = true
      return
    }
    window.studio
      .projectGet(initialProjectId)
      .then(async (p) => {
        if (p && p.videos?.length) await openProject(p)
      })
      .catch(() => undefined)
      .finally(() => {
        hydrated.current = true
        setLoaded(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Project cu co plan nhung chua co spec (vd doi danh muc), HOAC spec lam bang cach dung cu
  // (media < SPEC_MEDIA_VERSION: 2 = mau HDR + tach nguoi khop khung, 3 = cat theo loi noi + chu khop loi,
  //  4 = quy tac chu: khong emoji, thu tu doc, phan cap, ro net, lop tach, chu sau nguoi khong bi che)
  // -> dung lai spec tu plan (khong goi AI). Lan dau voi video HDR mat ~20s tao ban SDR + tach nguoi lai.
  const specUpgrade = useRef<string | null>(null)
  useEffect(() => {
    if (!plan || running || !ready) return
    const outdated = !!spec && (spec.media ?? 1) < SPEC_MEDIA_VERSION
    const old = outdated || (!!spec && staleTick > 0)
    if (spec && !old) return
    const key = `${projectId}|${spec ? 'upgrade' : 'missing'}|${staleTick}`
    if (specUpgrade.current === key) return
    specUpgrade.current = key
    if (old)
      setNotice(
        outdated
          ? 'Đang cập nhật bản dựng theo cách dựng mới (chữ không che mặt, ảnh tách nền sạch, cắt đúng lúc hết lời)…'
          : 'Đang dựng lại bản xem trước với video trong thư mục dự án…'
      )
    window.studio.remotionSpec({ plan }).then((r) => {
      if (r.ok && r.spec) {
        setSpec(r.spec)
        if (r.guard) setGuard(r.guard)
        if (r.summary) setSummary(r.summary)
        setStaleTick(0)
        if (old)
          setNotice(
            outdated
              ? 'Đã cập nhật bản dựng (cắt đúng lúc hết lời, chữ hiện khớp lời nói, màu chuẩn cho video HDR) — render lại để xuất bản mới.'
              : 'Đã dựng lại bản xem trước với video trong thư mục dự án — render lại để xuất bản mới.'
          )
      } else if (old) {
        // khong dung lai duoc (vd file nguon bi chuyen) -> giu ban dung cu, bao ly do; lan mo sau thu lai
        specUpgrade.current = null
        setNotice(r.error ? `Chưa cập nhật được bản dựng (vẫn dùng bản cũ): ${r.error}` : null)
      }
    })
  }, [plan, spec, running, ready, projectId, staleTick])

  // Luu sau moi thay doi
  useEffect(() => {
    if (!hydrated.current || !videos.length || !projectId) return
    const status = error ? STATUS_OF[error.step] : running ? STATUS_OF[running] : stage
    const proj: Project = {
      id: projectId,
      createdAt: 0,
      updatedAt: 0,
      mode: 'remotion',
      status,
      topic: deriveTopic(brief),
      video: videos[0],
      videos,
      referenceVideo,
      editRequest: compactEditRequest(editRequest),
      brandGuide: compactBrandGuide(brandGuide),
      workDir,
      sourceBrief: brief || undefined,
      referenceAnalysis: referenceAnalysis || undefined,
      rmPlan: plan || undefined,
      rmSpec: spec || undefined,
      rmSummary: summary || undefined,
      rmRender: render,
      guard: guard || undefined,
      // dang doc (analyzing) chi trong phien; loi van luu de hien lai
      userMedia: userMedia.length ? userMedia.map(({ analyzing: _a, ...m }) => m) : undefined,
      error
    }
    window.studio.projectSave(proj)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, referenceVideo, editRequest, brandGuide, workDir, brief, referenceAnalysis, plan, spec, summary, render, guard, stage, error, running, projectId, userMedia])

  // Bao trang thai the len CreateVideo (ten the, chip, dang ban). mediaBusy = dang chep / chuyen SDR video vao du an
  const renderPctInfo = running === 'render' && !waitLane ? Math.round(((renderEv?.progress ?? 0) as number) * 100) : null
  useEffect(() => {
    const title = brief ? deriveTopic(brief) : videos[0]?.name || (referenceVideo ? 'Video mới' : '')
    const status: JobInfo['status'] = !videos.length && !brief
      ? 'empty'
      : error
        ? 'error'
        : running
          ? waitLane
            ? 'waiting'
            : 'running'
          : stage === 'done'
            ? 'done'
            : stage === 'preview'
              ? 'preview'
              : 'idle'
    onInfo?.(jobKey, {
      projectId,
      title: title || 'Video mới',
      status,
      step: running,
      lane: waitLane,
      renderPct: renderPctInfo,
      busy: !!(running || mediaBusy),
      loaded
    })
  }, [jobKey, onInfo, projectId, brief, videos, referenceVideo, error, running, waitLane, stage, mediaBusy, renderPctInfo, loaded])

  /** Ten video trong hang doi (the khac thay "video X dang ...") */
  const jobLabel = (b?: SourceBrief | null) => (b || brief ? deriveTopic(b || brief) : videos[0]?.name || 'Video')

  /**
   * Xin luot o hang doi dung chung. Het cho -> hien "dang cho luot" (+ nhat ky), den luot tu chay tiep.
   * Nguoi dung huy cho -> nem QueueCancelled (buoc goi tu thoat, khong bao loi).
   */
  const waitTurn = async (lane: Lane, rid: string, b?: SourceBrief | null): Promise<() => void> => {
    const turn = acquire(lane, rid, jobLabel(b))
    if (waitPosition(lane, rid) < 0) return turn // con cho -> chay ngay (y nhu truoc khi co hang doi)
    setWaitLane(lane)
    logUi(rid, `Đang chờ lượt ${LANE_LABEL[lane].full} — có video khác đang chạy, tới lượt sẽ tự chạy tiếp`, 'info')
    try {
      const release = await turn
      logUi(rid, `Đã tới lượt ${LANE_LABEL[lane].full}`, 'info')
      return release
    } finally {
      setWaitLane(null)
    }
  }

  const reset = async () => {
    genRef.current++
    // Dang cho luot -> roi hang doi; dang render THAT (giu luot) -> huy render (khong dung render cua the khac)
    if (projectId) cancelWait(projectId)
    if (running === 'render' && renderingRef.current) await window.studio.remotionCancel()
    setWaitLane(null)
    setStage('upload')
    setVideos([])
    setReferenceVideo(null)
    setEditRequest(emptyEditRequest)
    setBrandGuide(emptyBrandGuide)
    setUserMedia([])
    setWorkDir('')
    setBrief(null)
    setReferenceAnalysis(null)
    setPlan(null)
    setSpec(null)
    setGuard(null)
    setSummary(null)
    setWarnings([])
    setReusedSteps([])
    setRender(null)
    setRenderEv(null)
    setNotice(null)
    setRunning(null)
    setError(null)
    setProjectId('')
    setMediaBusy(null)
    setMediaAlert(null)
    setStaleTick(0)
  }

  // Du an dang mo vua bi xoa o "Video da tao" -> ve man hinh moi, khong luu lai
  useEffect(() => {
    if (deletedReq && deletedReq.id === projectId) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deletedReq?.nonce])

  const newId = () => 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const ensureRunId = (): string => {
    if (projectId) return projectId
    const id = newId()
    setProjectId(id)
    return id
  }
  const runCtx = (id: string) => ({ id, label: `Tạo video · ${deriveTopic(brief)}` })
  const logUi = (id: string, title: string, level: 'info' | 'ok' | 'warn' | 'error' = 'info', detail?: unknown) => {
    window.studio.runlogAppend(id, { kind: 'ui', title, level, detail }).catch(() => {})
  }
  async function ensureWorkDir(): Promise<string> {
    if (workDir) return workDir
    const wd = await window.studio.newWorkDir('remotion-' + deriveTopic(brief))
    setWorkDir(wd)
    return wd
  }

  const clearResults = () => {
    setError(null)
    setBrief(null)
    setReferenceAnalysis(null)
    setPlan(null)
    setSpec(null)
    setGuard(null)
    setSummary(null)
    setWarnings([])
    setReusedSteps([])
    setRender(null)
    setStage('upload')
  }

  // Chep video vao thu muc du an (<workDir>/video-nguon | video-mau) -> chuyen / xoa file goc van khong mat
  const importToProject = async (paths: string[], kind: 'source' | 'reference' | 'insert') => {
    const wd = await ensureWorkDir()
    const what = kind === 'insert' ? 'tư liệu' : 'video'
    setMediaBusy(`Đang chép ${paths.length > 1 ? paths.length + ' ' + what : what} vào thư mục dự án…`)
    try {
      const r = await window.studio.mediaImport(wd, paths, kind)
      const bad = r.items.filter((it) => !it.path)
      if (bad.length || r.error)
        setMediaAlert((cur) => ({
          missing: cur?.missing || [],
          notes: [],
          errors: [
            ...(r.error ? [r.error] : []),
            ...bad.map((it) => `${baseName(it.src)}: ${it.error || 'không chép được'} — chưa thêm video này.`)
          ]
        }))
      return r.items
    } finally {
      setMediaBusy(null)
    }
  }

  const addVideos = async (paths: string[]) => {
    const known = (p: string) => videos.some((v) => v.path === p || v.origPath === p)
    const unique = paths.filter((path, i) => paths.indexOf(path) === i && !known(path))
    if (!unique.length) return
    if (!projectId) setProjectId(newId())
    const items = (await importToProject(unique, 'source')).filter(
      (it): it is ImportedMedia & { path: string } => !!it.path && !known(it.path)
    )
    if (!items.length) return
    const loaded = await Promise.all(
      items.map(async (it) => {
        const meta = await loadVideoMeta(it.path)
        return {
          path: it.path,
          name: baseName(it.src),
          duration: meta.duration,
          thumb: meta.thumb,
          ...(it.path !== it.src ? { origPath: it.src } : {})
        }
      })
    )
    setVideos((current) => {
      const used = new Set(current.map((v) => v.id))
      let next = 1
      return [
        ...current,
        ...loaded.map((video) => {
          while (used.has(`source_${next}`)) next++
          const id = `source_${next++}`
          used.add(id)
          return { ...video, id }
        })
      ]
    })
    clearResults()
  }

  const onPick = async () => {
    const res = await window.studio.pickVideo()
    if (res.canceled || !res.filePaths?.length) return
    await addVideos(res.filePaths)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files || [])
      .map((file) => window.studio.pathForFile(file))
      .filter((path): path is string => !!path && /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(path))
    if (paths.length) await addVideos(paths)
  }

  // ----- Tu lieu cua nguoi dung: chep vao <workDir>/tu-lieu-chen -> Gemini doc tung tu lieu -----
  const analyzeUserMedia = (targets: UserMediaItem[], fresh = false): Promise<void> => {
    if (!targets.length) return Promise.resolve()
    const ids = new Set(targets.map((t) => t.id))
    setUserMedia((cur) => cur.map((m) => (ids.has(m.id) ? { ...m, analyzing: true, error: undefined } : m)))
    const rid = ensureRunId()
    logUi(rid, `Gemini đọc ${targets.length} tư liệu${fresh ? ' (đọc lại)' : ''}: ${targets.map((t) => t.name).join(', ')}`)
    const job: Promise<void> = window.studio
      .remotionUnderstandMedia({
        items: targets.map(({ id, kind, path, name }) => ({ id, kind, path, name })),
        fresh,
        _run: runCtx(rid)
      })
      .then((r) => {
        const res = r.results || {}
        setUserMedia((cur) =>
          cur.map((m) => {
            if (!ids.has(m.id)) return m
            const x = res[m.id]
            if (!r.ok || !x) return { ...m, analyzing: false, error: r.error || 'không có kết quả' }
            if (x.error) return { ...m, analyzing: false, error: x.error }
            return { ...m, analyzing: false, error: undefined, analysis: x.analysis, measured: x.measured, analyzedAt: x.at, workPath: x.work }
          })
        )
      })
      .catch((e) => {
        setUserMedia((cur) => cur.map((m) => (ids.has(m.id) ? { ...m, analyzing: false, error: String((e as Error)?.message || e) } : m)))
      })
      .finally(() => {
        pendingMedia.current.delete(job)
      })
    pendingMedia.current.add(job)
    return job
  }

  const addUserMedia = async (paths: string[]) => {
    const cur0 = userMediaRef.current
    const known = (p: string) => cur0.some((m) => m.path === p || m.origPath === p)
    const unique = paths.filter((path, i) => paths.indexOf(path) === i && MEDIA_EXT.test(path) && !known(path))
    if (!unique.length) return
    if (!projectId) setProjectId(newId())
    const items = (await importToProject(unique, 'insert')).filter(
      (it): it is ImportedMedia & { path: string } => !!it.path && !known(it.path)
    )
    if (!items.length) return
    const used = new Set(userMediaRef.current.map((m) => m.id))
    let n = 1
    const rows: UserMediaItem[] = await Promise.all(
      items.map(async (it) => {
        const kind: UserMediaKind = IMAGE_EXT.test(it.path) ? 'image' : 'video'
        const meta = kind === 'video' ? await loadVideoMeta(it.path) : null
        return {
          id: '',
          kind,
          path: it.path,
          name: baseName(it.src),
          use: 'show' as UserMediaUse,
          placement: 'auto' as UserMediaPlacement,
          note: '',
          ...(it.path !== it.src ? { origPath: it.src } : {}),
          ...(meta ? { thumb: meta.thumb, duration: meta.duration } : {})
        }
      })
    )
    for (const r of rows) {
      while (used.has(`media_${n}`)) n++
      r.id = `media_${n++}`
      used.add(r.id)
    }
    setUserMedia((cur) => [...cur, ...rows])
    logUi(ensureRunId(), `Thêm ${rows.length} tư liệu chèn lên video: ${rows.map((r) => r.name).join(', ')}`)
    analyzeUserMedia(rows)
  }

  const pickUserMedia = async () => {
    const res = await window.studio.pickInsertMedia()
    if (res.canceled || !res.filePaths?.length) return
    await addUserMedia(res.filePaths)
  }

  const userMediaPanel = (withUsage: boolean) => (
    <UserMediaPanel
      items={userMedia}
      mediaBase={mediaBase}
      disabled={!!running || !!mediaBusy}
      usage={withUsage ? ((plan?._pipeline as { tu_lieu?: UserMediaUsage[] } | undefined)?.tu_lieu ?? undefined) : undefined}
      dirty={umDirty}
      onPick={pickUserMedia}
      onDropPaths={addUserMedia}
      onChange={(id, patch) => setUserMedia((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)))}
      onRemove={(id) => setUserMedia((cur) => cur.filter((m) => m.id !== id))}
      onAnalyze={(id, fresh) => {
        const it = userMediaRef.current.find((m) => m.id === id)
        if (it) analyzeUserMedia([it], fresh)
      }}
      onReplan={brief ? () => runPlan() : undefined}
    />
  )

  const pickReference = async () => {
    const res = await window.studio.pickReferenceVideo()
    if (res.canceled || !res.filePaths?.length) return
    await setReferenceFromPath(res.filePaths[0])
  }

  const setReferenceFromPath = async (src: string) => {
    const it = (await importToProject([src], 'reference'))[0]
    if (!it?.path) return
    const path = it.path
    const meta = await loadVideoMeta(path)
    setReferenceVideo({
      path,
      name: baseName(src),
      duration: meta.duration,
      thumb: meta.thumb,
      ...(path !== src ? { origPath: src } : {})
    })
    setReferenceAnalysis(null)
    setPlan(null)
    setSpec(null)
    setRender(null)
  }

  // Video cua du an da mat -> nguoi dung chi lai file: chep vao du an, doi duong dan trong ca du an
  const relink = async (m: MissingMedia) => {
    const res = await window.studio.pickOneVideo(
      m.kind === 'reference' ? 'Chọn lại video mẫu' : `Chọn lại video nguồn: ${m.name}`
    )
    if (res.canceled || !res.filePaths?.length) return
    const picked = res.filePaths[0]
    const meta = await loadVideoMeta(picked)
    const others = (mediaAlert?.missing || []).filter((x) => x.key !== m.key)
    if (m.duration && meta.duration && Math.abs(meta.duration - m.duration) > 1) {
      setMediaAlert({
        missing: mediaAlert?.missing || [m],
        notes: [],
        errors: [
          `"${baseName(picked)}" dài ${fmtTime(meta.duration)}, video của dự án dài ${fmtTime(m.duration)} — có vẻ không phải cùng video, chưa thay.`
        ]
      })
      return
    }
    const it = (await importToProject([picked], m.kind))[0]
    if (!it?.path) return
    const map = { [m.path]: it.path }
    const fixV = <V extends VideoFile>(v: V): V =>
      v.path === m.path ? { ...v, path: it.path as string, origPath: picked, recovered: undefined, thumb: meta.thumb || v.thumb } : v
    setVideos((cur) => cur.map(fixV))
    setReferenceVideo((cur) => (cur ? fixV(cur) : cur))
    setBrief((b) => (b ? replacePaths(b, map) : b))
    setReferenceAnalysis((a) => (a ? replacePaths(a, map) : a))
    setPlan((pl) => (pl ? replacePaths(pl, map) : pl))
    setSpec((sp) => (sp ? replacePaths(sp, map) : sp))
    if (m.kind === 'source' && plan) setStaleTick((t) => t + 1)
    setMediaAlert({ missing: others, notes: [`Đã dùng lại "${baseName(picked)}" (đã chép vào thư mục dự án).`], errors: [] })
  }

  // ----- Cac buoc -----
  /** Buoc nhan ket qua sau khi du an da "Lam moi" / doi du an khac -> bo (khong ghi de du an moi) */
  const stale = (g: number) => g !== genRef.current

  /**
   * HIEU NGUON (2026-10-02 gop buoc "Video mau"): Gemini doc video nguon VA video mau CUNG LUC (khong co video mau
   * thi chi nguon), xong thi lap plan luon. Hai phan dung route / thu vien / cache y nhu truoc khi gop; da co ket
   * qua (brief / phan tich mau trong du an, vd du an cu) thi khong goi lai. Ca luot giu 1 cho "phan tich" o hang doi.
   */
  const runAnalyze = async (fresh = false) => {
    if (!videos.length) return
    const g = genRef.current
    setError(null)
    setNotice(null)
    const rid = ensureRunId()
    const refVid = referenceVideo
    const haveBrief = !fresh && brief ? brief : null
    const haveRef = !fresh && refVid && referenceAnalysis ? referenceAnalysis : null
    setRunning('understand-sources')
    logUi(rid, `Bấm "Hiểu nguồn" với ${videos.length} video${refVid ? ' + video mẫu ' + refVid.name : ' (không có video mẫu)'}`, 'info', {
      videos: videos.map((v) => ({ id: v.id, name: v.name, duration: v.duration, path: v.path })),
      video_mau: refVid ? { name: refVid.name, duration: refVid.duration, path: refVid.path } : null,
      dung_lai: { nguon: !!haveBrief, mau: !!haveRef },
      fresh
    })
    let release: (() => void) | null = null
    let src: PromiseSettledResult<SourceBrief>
    let ref: PromiseSettledResult<RemotionReferenceAnalysis | null>
    try {
      release = await waitTurn('gemini', rid)
      if (stale(g)) return
      await ensureWorkDir()
      const sources = async (): Promise<SourceBrief> => {
        if (haveBrief) return haveBrief
        const u = await window.studio.understandSources({
          videos: videos.map(({ id, path, name, duration }) => ({ id, path, name, duration })),
          fresh,
          _run: runCtx(rid)
        })
        if (!u.ok || !u.brief) throw new Error(u.error || 'Lỗi đọc hiểu video')
        const nReused = Object.keys(u.reused || {}).length
        if (nReused) logUi(rid, `Dùng lại phân tích đã lưu cho ${nReused}/${videos.length} video (không gọi lại Gemini)`, 'info', u.reused)
        return u.brief
      }
      const reference = async (): Promise<RemotionReferenceAnalysis | null> => {
        if (!refVid) return null
        if (haveRef) return haveRef
        const r = await window.studio.remotionUnderstandReference({
          video: { path: refVid.path, name: refVid.name, duration: refVid.duration },
          fresh,
          _run: runCtx(rid)
        })
        if (!r.ok || !r.analysis) throw new Error(r.error || 'Lỗi phân tích video mẫu')
        return r.analysis
      }
      ;[src, ref] = await Promise.allSettled([sources(), reference()])
    } catch (e) {
      if (stale(g)) return
      setRunning(null)
      if (e instanceof QueueCancelled) {
        logUi(rid, 'Đã huỷ chờ lượt phân tích', 'warn')
        return
      }
      const message = String((e as Error).message || e)
      logUi(rid, 'Lỗi ở bước Hiểu nguồn', 'error', message)
      setError({ step: 'understand-sources', message })
      return
    } finally {
      release?.()
    }
    if (stale(g)) return
    // Phan nao xong thi giu (lan chay lai dung luon, khong goi lai AI)
    if (ref.status === 'fulfilled' && ref.value) {
      setReferenceAnalysis(ref.value)
      refLib.refresh()
    }
    if (src.status === 'rejected') {
      setRunning(null)
      const message = String((src.reason as Error)?.message || src.reason)
      logUi(rid, 'Lỗi ở bước Hiểu nguồn', 'error', message)
      if (ref.status === 'rejected') logUi(rid, 'Lỗi ở phần Video mẫu (Gemini)', 'error', String((ref.reason as Error)?.message || ref.reason))
      setError({ step: 'understand-sources', message })
      return
    }
    const newBrief = src.value
    setBrief(newBrief)
    srcLib.refresh()
    if (ref.status === 'rejected') {
      // Nguon xong, mau loi: giu loi rieng cua video mau (nut "Bo qua video mau" / "Tiep tuc" chi chay lai phan mau)
      setRunning(null)
      const message = String((ref.reason as Error)?.message || ref.reason)
      logUi(rid, 'Lỗi ở phần Video mẫu (Gemini)', 'error', message)
      setError({ step: 'understand-reference', message })
      return
    }
    await runPlan(newBrief, ref.value, false, g)
  }

  const runPlan = async (b?: SourceBrief, reference?: RemotionReferenceAnalysis | null, fresh = false, g0?: number) => {
    const useBrief = b || brief
    if (!useBrief) return
    const g = g0 ?? genRef.current
    if (stale(g)) return
    const refAn = reference === undefined ? referenceAnalysis : reference
    setError(null)
    setNotice(null)
    const rid = ensureRunId()
    setRunning('plan')
    window.studio
      .settingsGetPlanner()
      .then((v) => setPlannerName(v === 'claude' ? 'Claude' : 'GPT'))
      .catch(() => undefined)
    logUi(rid, fresh ? 'Bấm lập plan MỚI (bỏ qua kết quả đã lưu)' : 'Bắt đầu lập kế hoạch dựng video', 'info', {
      co_video_mau: !!refAn,
      tu_lieu: userMediaRef.current.map((m) => ({ id: m.id, name: m.name, use: m.use, placement: m.placement, note: m.note }))
    })
    let release: (() => void) | null = null
    try {
      // Gemini dang doc tu lieu -> doi xong (sidecar van tu doc neu thieu, co luu theo noi dung file)
      if (pendingMedia.current.size) {
        await Promise.allSettled([...pendingMedia.current])
        await new Promise((r) => setTimeout(r, 50)) // cho React ghi ket qua Gemini vao state (ref doc ban moi)
      }
      if (stale(g)) return
      release = await waitTurn('claude', rid, useBrief)
      if (stale(g)) return
      const um = userMediaRef.current
      const r = await window.studio.remotionAutoplan({
        _run: runCtx(rid),
        brief: useBrief,
        reference_analysis: refAn,
        edit_request: compactEditRequest(editRequest),
        brand_guide: compactBrandGuide(brandGuide),
        user_media: um.length
          ? um.map(({ id, kind, path, name, use, placement, note, analysis }) => ({
              id,
              kind,
              path,
              name,
              use,
              placement,
              note,
              analysis: analysis || null
            }))
          : undefined,
        title: deriveTopic(useBrief),
        fresh
      })
      if (stale(g)) return
      if (!r.ok || !r.plan || !r.spec) throw new Error(r.error || 'Lỗi lập kế hoạch')
      if (r.brief) setBrief(r.brief) // brief cu vua duoc can lai gio loi noi
      setPlan(r.plan)
      setSpec(r.spec)
      setGuard(r.guard || null)
      setSummary(r.summary || null)
      setWarnings(r.warnings || [])
      setReusedSteps(r.reused_steps || [])
      setRender(null)
      setRunning(null)
      setStage('preview')
    } catch (e) {
      if (stale(g)) return
      setRunning(null)
      if (e instanceof QueueCancelled) {
        logUi(rid, 'Đã huỷ chờ lượt lập kế hoạch', 'warn')
        return
      }
      const message = String((e as Error).message || e)
      logUi(rid, 'Lỗi ở bước lập kế hoạch', 'error', message)
      setError({ step: 'plan', message })
    } finally {
      release?.()
    }
  }

  /** Chi chay lai PHAN video mau (nguon da xong — loi rieng cua video mau / du an cu dung giua chung) roi lap plan */
  const runReference = async (fresh = false) => {
    if (!referenceVideo || !brief) return
    const g = genRef.current
    setError(null)
    const rid = ensureRunId()
    setRunning('understand-reference')
    logUi(rid, `Bấm phân tích video mẫu bằng Gemini: ${referenceVideo.name}`)
    let release: (() => void) | null = null
    let analysis: RemotionReferenceAnalysis
    try {
      release = await waitTurn('gemini', rid)
      if (stale(g)) return
      const r = await window.studio.remotionUnderstandReference({
        video: { path: referenceVideo.path, name: referenceVideo.name, duration: referenceVideo.duration },
        fresh,
        _run: runCtx(rid)
      })
      if (stale(g)) return
      if (!r.ok || !r.analysis) throw new Error(r.error || 'Lỗi phân tích video mẫu')
      analysis = r.analysis
    } catch (e) {
      if (stale(g)) return
      setRunning(null)
      if (e instanceof QueueCancelled) {
        logUi(rid, 'Đã huỷ chờ lượt phân tích video mẫu', 'warn')
        return
      }
      const message = String((e as Error).message || e)
      logUi(rid, 'Lỗi ở bước Video mẫu (Gemini)', 'error', message)
      setError({ step: 'understand-reference', message })
      return
    } finally {
      release?.()
    }
    refLib.refresh()
    setReferenceAnalysis(analysis)
    await runPlan(brief, analysis, false, g)
  }

  const skipReference = async () => {
    logUi(ensureRunId(), 'Bỏ qua video mẫu')
    setReferenceVideo(null)
    setReferenceAnalysis(null)
    await runPlan(brief || undefined, null)
  }

  const runRender = async () => {
    if (!spec) return
    const g = genRef.current
    setError(null)
    setNotice(null)
    setRenderEv(null)
    const rid = ensureRunId()
    setRunning('render')
    logUi(rid, `Bấm Render MP4 (${fmtTime(spec.duration)}, ${spec.clips.length} đoạn)`)
    let release: (() => void) | null = null
    try {
      // Render nang may -> 1 video 1 luc: video khac dang render thi cho, xong tu render
      release = await waitTurn('render', rid)
      if (stale(g)) return
      const wd = await ensureWorkDir()
      renderingRef.current = true
      setRenderEv(null)
      const ev = await window.studio.remotionRender({
        spec,
        workDir: wd,
        name: `${todayStr()} ${deriveTopic(brief)}`,
        _run: runCtx(rid)
      })
      renderingRef.current = false
      if (stale(g)) return
      setRunning(null)
      if (ev.type === 'done' && ev.output) {
        setRender({ output: ev.output, size: ev.size, seconds: ev.seconds, at: Date.now() })
        logUi(rid, `Render xong: ${ev.output} (${fmtBytes(ev.size)}, ${Math.round(ev.seconds || 0)}s)`, 'ok')
        setStage('done')
      } else if (ev.type === 'cancelled') {
        logUi(rid, 'Đã huỷ render', 'warn')
        setNotice('Đã huỷ render. Bản xem trước vẫn còn nguyên.')
        setStage('preview')
      } else {
        throw new Error(ev.message || 'Render lỗi')
      }
    } catch (e) {
      renderingRef.current = false
      if (stale(g)) return
      setRunning(null)
      if (e instanceof QueueCancelled) {
        logUi(rid, 'Đã huỷ chờ lượt render', 'warn')
        setNotice('Đã huỷ chờ render. Bản xem trước vẫn còn nguyên.')
        setStage('preview')
        return
      }
      const message = String((e as Error).message || e)
      logUi(rid, 'Lỗi khi render MP4', 'error', message)
      setError({ step: 'render', message })
    } finally {
      release?.()
    }
  }

  /** Nut huy tren khung "dang chay": dang cho luot -> roi hang doi; dang render that -> huy render */
  const cancelRunning = () => {
    if (waitLane && projectId) cancelWait(projectId, waitLane)
    else if (running === 'render' && renderingRef.current) window.studio.remotionCancel()
  }

  const resume = () => {
    if (!error) return
    const step = error.step
    if (projectId) logUi(projectId, `Bấm "Tiếp tục" — chạy lại bước ${STEP_LABEL[step]}`)
    setError(null)
    if (step === 'understand-sources') runAnalyze()
    else if (step === 'understand-reference') {
      // phan mau hong (nguon da xong) — du an cu dung giua chung khong co brief thi chay lai ca buoc Hieu nguon
      if (brief) runReference()
      else runAnalyze()
    } else if (step === 'plan') runPlan()
    else if (step === 'render') runRender()
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardBody className="py-10">
            <Lock className="mx-auto mb-3 h-8 w-8 text-ink-800/25" />
            <div className="font-semibold text-ink-900">Chưa sẵn sàng</div>
            <p className="mt-1 text-sm text-ink-800/50">
              Hoàn tất Doctor (môi trường + kết nối AI) để mở khoá Tạo video.
            </p>
          </CardBody>
        </Card>
      </div>
    )
  }

  const stepState = (idx: number): 'done' | 'active' | 'error' | 'todo' => {
    // 0 Hieu nguon (nguon + video mau) · 1 Plan · 2 Xem truoc · 3 Render · 4 Xem video
    const errIdx =
      error?.step === 'understand-sources' || error?.step === 'understand-reference'
        ? 0
        : error?.step === 'plan'
          ? 1
          : error?.step === 'render'
            ? 3
            : -1
    if (errIdx === idx) return 'error'
    switch (idx) {
      case 0:
        return running === 'understand-sources' || running === 'understand-reference'
          ? 'active'
          : brief && (!referenceVideo || referenceAnalysis || plan)
            ? 'done'
            : 'todo'
      case 1:
        return running === 'plan' ? 'active' : plan ? 'done' : 'todo'
      case 2:
        return spec ? (stage === 'preview' ? 'active' : 'done') : 'todo'
      case 3:
        return running === 'render' ? 'active' : render ? 'done' : 'todo'
      case 4:
        return stage === 'done' ? 'active' : 'todo'
      default:
        return 'todo'
    }
  }

  const renderPct = Math.round(((renderEv?.progress ?? 0) as number) * 100)
  // tu lieu doi (them / bo / doi muc dich) sau lan lap plan gan nhat
  const umDirty = !!plan && umSig(userMedia) !== umSig((plan.user_media as UserMediaPayload[] | null | undefined) || [])
  const nSrcSaved = videos.filter((v) => srcLib.found[v.path]?.source_at).length
  const refSavedAt = referenceVideo
    ? refLib.found[referenceVideo.path]?.ref_video_at || refLib.found[referenceVideo.path]?.ref_gpt_at
    : undefined
  // Nut chinh o buoc Hieu nguon: noi ro phan nao goi Gemini, phan nao dung lai ban da luu / da co
  const analyzeLabel = (() => {
    const src = brief
      ? 'Dùng phân tích nguồn đã có'
      : nSrcSaved === videos.length
        ? 'Dùng phân tích đã lưu'
        : nSrcSaved > 0
          ? `Phân tích ${videos.length - nSrcSaved} video mới · dùng lại ${nSrcSaved}`
          : `Phân tích ${videos.length} video nguồn`
    const ref = !referenceVideo ? '' : referenceAnalysis || refSavedAt ? ' + mẫu đã phân tích' : ' + video mẫu'
    return `${src}${ref} & ${fullUi ? 'lập plan' : 'tạo video'}`
  })()
  // Dang cho luot o hang doi: bao dang cho video nao + dung thu may
  const lane = waitLane ? queue[waitLane] : null
  const waitAhead = waitLane && projectId ? Math.max(0, queue[waitLane].queue.findIndex((w) => w.jobId === projectId)) : 0
  const waitMsg = (() => {
    if (!waitLane || !lane) return ''
    const others = lane.active.filter((a) => a.jobId !== projectId).map((a) => `“${a.label}”`)
    const who = others.length ? (others.length === 1 ? `video ${others[0]}` : `${others.length} video (${others.join(', ')})`) : 'video khác'
    const name = fullUi ? LANE_LABEL[waitLane].full : LANE_LABEL[waitLane].client
    const pos = waitAhead > 0 ? ` · còn ${waitAhead} video chờ trước` : ''
    return waitLane === 'render'
      ? `Đang chờ lượt xuất video — ${who} đang xuất (mỗi lần chỉ xuất 1 video cho máy khỏi nặng)${pos}. Tới lượt sẽ tự xuất.`
      : `Đang chờ lượt ${name} — ${who} đang chạy (tối đa ${lane.limit} video cùng lúc${fullUi ? ', đổi ở Cài đặt API' : ''})${pos}. Tới lượt sẽ tự chạy.`
  })()
  const busyMsg = waitMsg
    ? waitMsg
    : !fullUi
    ? running === 'understand-sources' || running === 'understand-reference'
      ? 'Đang phân tích'
      : running === 'plan'
        ? 'Đang tạo video'
        : running === 'render'
          ? renderEv?.stage === 'browser'
            ? 'Đang chuẩn bị xuất video (lần đầu tải thêm ~90MB, chỉ một lần)'
            : RENDER_STAGE[renderEv?.stage || 'prepare'] || 'Đang xuất video...'
          : ''
    : running === 'understand-sources'
      ? referenceVideo
        ? `Gemini đang phân tích cùng lúc ${videos.length} video nguồn và video mẫu (máy đo nhịp cắt, bóc bộ phong cách), rồi Whisper căn lại giờ lời nói...`
        : `Gemini đang phân tích ${videos.length} video nguồn, rồi Whisper căn lại giờ lời nói...`
      : running === 'understand-reference'
        ? 'Máy đo nhịp cắt, Gemini đang xem + nghe video mẫu rồi bóc bộ phong cách...'
        : running === 'plan'
          ? `${plannerName} đang lập kế hoạch dựng video (chất liệu → timeline → hook → thiết kế bố cục + lớp đồ hoạ${
              userMedia.length ? ' + chèn tư liệu của bạn' : ''
            } → tạo ảnh AI → phụ đề → meme → SFX). Có ảnh AI thì mất thêm vài phút...`
          : running === 'render'
            ? RENDER_STAGE[renderEv?.stage || 'prepare'] || 'Đang render...'
            : ''

  return (
    <div className="w-full px-8 py-7">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Tạo video</h1>
          <p className="mt-0.5 text-sm text-ink-800/45">
            {videos.length
              ? `${videos.length} video nguồn đã chọn · AI dựng video, xem và xuất MP4 ngay trong app`
              : 'AI tự dựng video từ video nguồn của bạn, xem trước và xuất MP4 ngay trong app. Kéo-thả video nguồn để bắt đầu.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {projectId && fullUi && (
            <Button variant={logOpen ? 'subtle' : 'outline'} size="sm" onClick={() => setLogOpen((o) => !o)}>
              <ScrollText className="h-4 w-4" /> Nhật ký xử lý
              {running && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />}
            </Button>
          )}
          {(videos.length > 0 || brief) && (
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Làm mới
            </Button>
          )}
        </div>
      </div>

      {/* Stepper (ban cai cho may khac: an) */}
      {fullUi && (
      <div className="card-surface mb-5 flex items-center justify-between rounded-2xl px-5 py-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const st = stepState(i)
          return (
            <div key={s.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl transition-all',
                    st === 'done' && 'bg-emerald-500/12 text-emerald-600',
                    st === 'active' && 'brand-gradient text-white shadow-[0_8px_20px_-6px_rgba(242,98,10,0.5)]',
                    st === 'error' && 'bg-red-500/12 text-red-500',
                    st === 'todo' && 'bg-black/5 text-ink-800/30'
                  )}
                >
                  {st === 'done' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : st === 'error' ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span className={cn('text-xs', st === 'todo' ? 'text-ink-800/35' : 'text-ink-800/70')}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn('mx-2 h-0.5 flex-1 rounded-full', st === 'done' ? 'bg-emerald-400/50' : 'bg-black/8')}
                />
              )}
            </div>
          )
        })}
      </div>
      )}

      {(mediaBusy || mediaAlert) && (
        <div className="mb-5 space-y-2 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm">
          {mediaBusy && (
            <div className="flex items-center gap-2 text-ink-800/70">
              <Spinner className="h-4 w-4" /> {mediaBusy}
            </div>
          )}
          {mediaAlert?.missing.map((m) => (
            <div key={m.key} className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1 text-amber-900">
                {m.recovered ? (
                  <>
                    Không tìm thấy file gốc <b>{m.name}</b> (đã bị chuyển hoặc xoá). App đã khôi phục từ bản làm việc
                    còn giữ (SDR 1080p) và chép vào thư mục dự án — xem trước và video xuất ra không đổi. Nếu còn file
                    gốc, bấm “Chọn file gốc” để dùng lại bản chất lượng gốc.
                  </>
                ) : m.kind === 'reference' ? (
                  <>
                    Không tìm thấy video mẫu <b>{m.name}</b> (đã bị chuyển hoặc xoá). Phân tích mẫu đã lưu vẫn dùng
                    được; chỉ cần file khi phân tích lại.
                  </>
                ) : (
                  <>
                    Không tìm thấy video nguồn <b>{m.name}</b> ({m.path}). Bấm “Chọn lại file” để chỉ tới chỗ mới — app
                    sẽ chép vào thư mục dự án.
                  </>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => relink(m)} disabled={!!running || !!mediaBusy}>
                <FolderOpen className="h-4 w-4" /> {m.recovered ? 'Chọn file gốc' : 'Chọn lại file'}
              </Button>
            </div>
          ))}
          {mediaAlert?.errors.map((t, i) => (
            <div key={'e' + i} className="flex items-start gap-3 text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">{t}</div>
            </div>
          ))}
          {mediaAlert?.notes.map((t, i) => (
            <div key={'n' + i} className="flex items-start gap-3 text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">{t}</div>
            </div>
          ))}
          {mediaAlert && !mediaBusy && (
            <div className="flex justify-end gap-2">
              {workDir && (
                <Button size="sm" variant="ghost" onClick={() => window.studio.openPath(workDir)}>
                  <FolderOpen className="h-4 w-4" /> Mở thư mục dự án
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setMediaAlert(null)}>
                <X className="h-4 w-4" /> Ẩn
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-2xl border border-red-400/40 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-red-600">
                {fullUi ? `Lỗi ở bước: ${STEP_LABEL[error.step]}` : STEP_ERROR_CLIENT[error.step]}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-red-500/90">
                {error.message.length > 1200 ? error.message.slice(0, 1200) + '…' : error.message}
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {error.step === 'understand-reference' && (
              <Button variant="ghost" size="sm" onClick={skipReference}>
                Bỏ qua video mẫu
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Làm lại từ đầu
            </Button>
            <Button size="sm" onClick={resume}>
              <Play className="h-4 w-4" /> {fullUi ? 'Tiếp tục (chạy lại bước này)' : 'Thử lại'}
            </Button>
          </div>
        </div>
      )}

      {/* Ket qua cac buoc (ban cai cho may khac: an — lo quy trinh + AI dung) */}
      <div className="space-y-3">
        {fullUi && brief && (
          <Collapsible
            title="Kết quả: Hiểu các video nguồn (Gemini)"
            done
            badge={<Badge tone="brand">{brief.sources?.length || videos.length} nguồn</Badge>}
          >
            <SourceBriefView brief={brief} />
          </Collapsible>
        )}
        {fullUi && referenceAnalysis && (
          <Collapsible
            title={`Kết quả: Phong cách video mẫu (${
              String(referenceAnalysis._source || '').startsWith('gpt-cli') ? 'GPT · Codex CLI, bản cũ' : 'Gemini'
            })`}
            done
            badge={<Badge tone="neutral">{referenceAnalysis.format || 'tham khảo'}</Badge>}
          >
            <ReferenceAnalysisView analysis={referenceAnalysis} />
            <RemotionReferenceExtra analysis={referenceAnalysis} catalog={catalog} />
          </Collapsible>
        )}
        {fullUi && plan && (
          <Collapsible
            title={`Kết quả: Kế hoạch dựng video (${planAiName(plan)})`}
            done
            badge={<Badge tone="brand">{summary?.do_dai ? fmtTime(summary.do_dai) : 'plan'}</Badge>}
          >
            <RemotionPlanView plan={plan} spec={spec} catalog={catalog} />
          </Collapsible>
        )}
        {fullUi && !!reusedSteps.length && (
          <div className="rounded-xl border border-emerald-300/40 bg-emerald-50/40 px-4 py-2.5 text-[12px] leading-relaxed text-ink-800/65">
            Dùng lại <b>{reusedSteps.length} bước</b> đã chạy xong ở lần trước ({reusedSteps.join(', ')}) — không gọi lại
            model.
          </div>
        )}
        {fullUi && !!warnings.length && (
          <div className="rounded-xl border border-amber-300/50 bg-amber-50/50 px-4 py-3">
            <div className="text-[13px] font-semibold text-amber-800">Kế hoạch vẫn dùng được, nhưng có bước không chạy trọn</div>
            <ul className="mt-1 space-y-0.5 text-[12px] leading-relaxed text-ink-800/65">
              {warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          </div>
        )}
        {!fullUi && !!warnings.length && (
          <div className="rounded-xl border border-amber-300/50 bg-amber-50/50 px-4 py-3">
            <div className="text-[13px] font-semibold text-amber-800">Video vẫn tạo được, có vài phần chưa trọn</div>
            <ul className="mt-1 space-y-0.5 text-[12px] leading-relaxed text-ink-800/65">
              {/* chi canh bao NGUOI DUNG tu xu ly duoc (tu lieu cua ho); con lai gop 1 dong, khong neu ten buoc */}
              {warnings.filter((w) => w.startsWith('Tư liệu')).map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
              {warnings.some((w) => !w.startsWith('Tư liệu')) && (
                <li>• Một vài chi tiết trang trí không tạo được — có thể bấm “Tạo lại” để thử lại.</li>
              )}
            </ul>
          </div>
        )}
        {fullUi && guard && (
          <Collapsible
            title="Kết quả: Kiểm tra kỹ thuật (tự động)"
            done
            badge={
              guard.issues?.length ? (
                <Badge tone="warn">
                  tự sửa {guard.fixed?.length ?? 0} · còn {guard.issues.length} việc
                </Badge>
              ) : (
                <Badge tone="ok">tự sửa {guard.fixed?.length ?? 0} chỗ · xong</Badge>
              )
            }
          >
            <GuardView guard={guard} />
          </Collapsible>
        )}
      </div>

      {running && (
        <Card className="mt-5">
          <CardBody className="flex flex-col items-center py-10">
            {waitLane ? <Hourglass className="h-7 w-7 text-brand-500" /> : <Spinner className="h-7 w-7" />}
            <div className="mt-4 max-w-xl text-center font-semibold text-ink-900">{busyMsg}</div>
            <div className="mt-1 text-sm text-ink-800/45">
              Đã chạy {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              {running === 'render' && renderEv?.totalFrames
                ? ` · khung ${renderEv.renderedFrames ?? 0}/${renderEv.totalFrames}`
                : fullUi
                  ? ' — bước này có thể mất vài phút, đừng tắt app.'
                  : ' — có thể mất vài phút, đừng tắt app.'}
            </div>
            <div className="mt-5 w-72">
              <Progress
                value={
                  waitLane
                    ? 0
                    : running === 'render'
                      ? renderPct
                      : running === 'understand-sources'
                        ? 20
                        : running === 'understand-reference'
                          ? 40
                          : 62
                }
              />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {waitLane ? (
                <Button variant="ghost" size="sm" onClick={cancelRunning}>
                  <X className="h-3.5 w-3.5" /> Huỷ chờ
                </Button>
              ) : (
                running === 'render' && (
                  <Button variant="ghost" size="sm" onClick={cancelRunning}>
                    <Square className="h-3.5 w-3.5" /> Huỷ render
                  </Button>
                )
              )}
              {onNewVideo && (
                <Button variant="outline" size="sm" onClick={onNewVideo} title="Video này vẫn chạy tiếp — làm video khác trong lúc chờ">
                  <Plus className="h-4 w-4" /> Tạo thêm video khác
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* UPLOAD */}
      {!running && !error && stage === 'upload' && (
        <div className="mt-5 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={onPick}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-all',
              dragOver ? 'border-brand-500 bg-brand-50' : 'border-black/12 bg-white/50 hover:border-brand-400 hover:bg-brand-50/50'
            )}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/12">
              <Upload className="h-7 w-7 text-brand-500" />
            </div>
            <div className="mt-4 font-semibold text-ink-900">Kéo-thả một hay nhiều video nguồn vào đây</div>
            <div className="mt-1 text-sm text-ink-800/45">hoặc bấm để chọn file (.mp4 .mov ...)</div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={(e) => {
                e.stopPropagation()
                setLibOpen('source')
              }}
            >
              <Library className="h-4 w-4" /> Chọn từ thư viện video đã phân tích
            </Button>
          </div>

          {/* VIDEO MAU (khong bat buoc) — Gemini phan tich CUNG LUC voi video nguon (2026-10-02 gop buoc) */}
          <Card>
            <CardHeader className="flex items-center gap-2">
              <ScanSearch className="h-5 w-5 text-brand-500" />
              <span className="text-sm font-semibold text-ink-900">Video mẫu</span>
              <span className="text-xs text-ink-800/45">(không bắt buộc)</span>
            </CardHeader>
            <CardBody className="space-y-3">
              {!fullUi ? (
                <p className="text-sm text-ink-800/60">
                  Thêm một video mẫu để AI dựng theo phong cách tương tự — phân tích cùng lúc với video nguồn. Không có
                  video mẫu thì AI tự thiết kế theo nội dung video của bạn.
                </p>
              ) : (
                <p className="text-sm text-ink-800/60">
                  Phân tích <b className="text-ink-900">cùng lúc</b> với video nguồn: máy đo nhịp cắt cảnh và độ to âm thanh
                  bằng ffmpeg, rồi <b className="text-ink-900">Gemini</b> xem + nghe video mẫu để bóc tách kiểu chữ, nhịp
                  dựng, hiệu ứng, màu, âm thanh; thêm một lượt xem dải khung hình dày (~6 khung/giây) để bóc chuyển động
                  chữ + camera thành bộ phong cách. Không có video mẫu thì AI tự thiết kế theo nội dung.
                </p>
              )}
              {!referenceVideo ? (
                <div className="flex gap-3">
                  <button
                    onClick={pickReference}
                    className="flex flex-1 items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-black/12 bg-white/50 p-6 hover:border-brand-400 hover:bg-brand-50/50"
                  >
                    <Upload className="h-5 w-5 text-brand-500" />
                    <span className="font-medium text-ink-900">Chọn video mẫu tham khảo</span>
                  </button>
                  <button
                    onClick={() => setLibOpen('reference')}
                    className="flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-black/12 bg-white/50 px-6 py-6 hover:border-brand-400 hover:bg-brand-50/50"
                  >
                    <Library className="h-5 w-5 text-brand-500" />
                    <span className="font-medium text-ink-900">Từ thư viện</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-black/6 bg-ink-50 p-3">
                  {referenceVideo.thumb ? (
                    <img src={referenceVideo.thumb} className="h-16 w-12 rounded-lg object-cover" alt="" />
                  ) : (
                    <div className="flex h-16 w-12 items-center justify-center rounded-lg bg-black/5">
                      <Film className="h-5 w-5 text-ink-800/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-900">{referenceVideo.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-800/45">
                      {fmtTime(referenceVideo.duration)}
                      <SavedBadge at={refSavedAt} label="Đã phân tích" />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLibOpen('reference')}>
                    <Library className="h-4 w-4" /> Thư viện
                  </Button>
                  <Button variant="outline" size="sm" onClick={pickReference}>
                    Đổi video
                  </Button>
                  <button
                    onClick={() => {
                      setReferenceVideo(null)
                      setReferenceAnalysis(null)
                    }}
                    className="rounded-lg p-1.5 text-ink-800/30 hover:bg-red-50 hover:text-red-500"
                    title="Bỏ video mẫu"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </CardBody>
          </Card>

          <EditRequestForm value={editRequest} onChange={setEditRequest} />

          <BrandGuideForm value={brandGuide} onChange={setBrandGuide} />

          {userMediaPanel(false)}

          {videos.length > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-900">Video nguồn ({videos.length})</span>
                <div className="flex gap-2">
                  {workDir && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.studio.openPath(workDir)}
                      title="Video đã thêm được chép vào thư mục riêng của dự án"
                    >
                      <FolderOpen className="h-4 w-4" /> Thư mục dự án
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setLibOpen('source')}>
                    <Library className="h-4 w-4" /> Từ thư viện
                  </Button>
                  <Button variant="outline" size="sm" onClick={onPick}>
                    <Plus className="h-4 w-4" /> Thêm video
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-2">
                {videos.map((video) => (
                  <div key={video.id} className="flex items-center gap-3 rounded-xl border border-black/6 bg-ink-50 p-2.5">
                    {video.thumb ? (
                      <img src={video.thumb} className="h-14 w-10 rounded-lg object-cover" alt="" />
                    ) : (
                      <div className="flex h-14 w-10 items-center justify-center rounded-lg bg-black/5">
                        <Film className="h-5 w-5 text-ink-800/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge tone="neutral">{video.id}</Badge>
                        <span className="truncate text-sm font-medium text-ink-900">{video.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-800/45">
                        {fmtTime(video.duration)}
                        <SavedBadge at={srcLib.found[video.path]?.source_at} />
                        {workDir && insideDir(video.path, workDir) && (
                          <span title={video.origPath ? `Chép từ ${video.origPath}` : video.path}>· đã lưu trong dự án</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setVideos((current) => current.filter((v) => v.id !== video.id))
                        clearResults()
                      }}
                      className="rounded-lg p-1.5 text-ink-800/30 hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-end gap-2 pt-2">
                  {(nSrcSaved > 0 || !!brief || !!refSavedAt || !!referenceAnalysis) && (
                    <Button
                      variant="ghost"
                      onClick={() => runAnalyze(true)}
                      title={
                        fullUi
                          ? 'Bỏ qua bản đã lưu, gọi lại Gemini + Whisper cho video nguồn (và video mẫu nếu có)'
                          : 'Bỏ bản đã lưu, phân tích lại'
                      }
                    >
                      <RotateCcw className="h-4 w-4" /> Phân tích lại từ đầu
                    </Button>
                  )}
                  <Button onClick={() => runAnalyze()}>
                    <Sparkles className="h-4 w-4" />
                    {analyzeLabel}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* XEM TRUOC */}
      {!running && !error && stage === 'preview' && spec && (
        <Card className="mt-5">
          <CardHeader className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5 text-brand-500" />
            <span className="font-semibold text-ink-900">Xem trước bản dựng</span>
            <span className="text-xs text-ink-800/40">· {fmtTime(spec.duration)} · 1080×1920</span>
          </CardHeader>
          <CardBody>
            {notice && (
              <div className="mb-3 rounded-xl border border-amber-300/50 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
                {notice}
              </div>
            )}
            <div className="flex flex-col gap-5 lg:flex-row">
              <div className="w-full max-w-[340px] shrink-0 self-center lg:self-start">
                {mediaBase ? (
                  <RemotionPreview spec={spec} mediaBase={mediaBase} />
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center rounded-2xl bg-black/80">
                    <Spinner className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-sm text-ink-800/60">
                  Trình xem trước chạy <b className="text-ink-900">chính mã dựng</b> sẽ dùng khi render — chữ, hiệu ứng,
                  chuyển cảnh, SFX thấy ở đây là thứ sẽ có trong MP4. Máy yếu có thể phát hơi giật (nhiều video giải mã
                  cùng lúc); bản MP4 render ra sẽ mượt.
                </p>
                <div className="rounded-xl border border-black/8 bg-ink-50 p-3 text-xs text-ink-800/60">
                  {fullUi ? (
                    <>
                      Render xuất MP4 1080×1920, 30fps, H.264 + AAC. Lần đầu app tải trình render (~90MB) vào{' '}
                      <code className="rounded bg-black/5 px-1">{IS_WIN ? '%USERPROFILE%\\.capcut-studio\\remotion' : '~/.capcut-studio/remotion'}</code>. Video 40 giây mất khoảng
                      1–3 phút tuỳ máy.
                    </>
                  ) : (
                    <>Xuất MP4 1080×1920, 30fps. Lần đầu xuất video app tải thêm ~90MB (một lần). Video 40 giây mất khoảng 1–3 phút tuỳ máy.</>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="ghost" onClick={reset}>
                    <RotateCcw className="h-4 w-4" /> Bỏ
                  </Button>
                  <Button variant="outline" onClick={() => runPlan(undefined, undefined, true)}>
                    <RotateCcw className="h-4 w-4" /> {fullUi ? 'Lập lại plan' : 'Tạo lại'}
                  </Button>
                  {render && (
                    <Button variant="outline" onClick={() => setStage('done')}>
                      <PlayCircle className="h-4 w-4" /> Xem bản đã render
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button onClick={runRender}>
                    <Rocket className="h-4 w-4" /> Render MP4 <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
      {!running && !error && stage === 'preview' && spec && <div className="mt-4">{userMediaPanel(true)}</div>}

      {/* XONG: XEM VIDEO HOAN CHINH */}
      {!running && !error && stage === 'done' && render && (
        <Card className="mt-5">
          <CardHeader className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <span className="font-semibold text-ink-900">Hoàn tất — video đã render xong</span>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col gap-5 lg:flex-row">
              <div className="w-full max-w-[340px] shrink-0 self-center lg:self-start">
                {finalUrl ? (
                  <video
                    key={finalUrl}
                    src={finalUrl}
                    controls
                    playsInline
                    className="aspect-[9/16] w-full rounded-2xl bg-black object-contain"
                  />
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center rounded-2xl bg-black/80">
                    <Spinner className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="rounded-xl border border-black/8 bg-ink-50 p-3 text-xs text-ink-800/65">
                  <div className="truncate font-mono text-[11px] text-ink-800/70">{render.output}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {render.size ? <Badge tone="neutral">{fmtBytes(render.size)}</Badge> : null}
                    {render.seconds ? <Badge tone="neutral">render {Math.round(render.seconds)}s</Badge> : null}
                    {spec && <Badge tone="neutral">{fmtTime(spec.duration)} · 1080×1920</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={async () => {
                      const r = await window.studio.remotionSaveAs(render.output, deriveTopic(brief))
                      if (r.ok && r.path) setNotice(`Đã lưu: ${r.path}`)
                    }}
                  >
                    <Download className="h-4 w-4" /> Lưu video…
                  </Button>
                  <Button variant="outline" onClick={() => window.studio.showItemInFolder(render.output)}>
                    <FolderOpen className="h-4 w-4" /> {REVEAL_LABEL}
                  </Button>
                  <Button variant="outline" onClick={() => setStage('preview')}>
                    <MonitorPlay className="h-4 w-4" /> Về bản xem trước
                  </Button>
                  <Button variant="outline" onClick={runRender}>
                    <RotateCcw className="h-4 w-4" /> Render lại
                  </Button>
                </div>
                {notice && <div className="text-xs text-emerald-700">{notice}</div>}
                <div className="flex justify-end pt-2">
                  <Button variant="ghost" onClick={reset}>
                    <Sparkles className="h-4 w-4" /> Tạo video mới
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {logOpen && projectId && fullUi && (
        <RunLogPanel
          runId={projectId}
          live={!!running}
          title={videos.length ? `Tạo video · ${deriveTopic(brief)} · ${videos.map((v) => v.name).join(', ')}` : projectId}
          onClose={() => setLogOpen(false)}
        />
      )}

      <LibraryPicker
        open={!!libOpen}
        mode={libOpen === 'reference' ? 'reference' : 'source'}
        exclude={libOpen === 'reference' ? [] : videos.flatMap((v) => (v.origPath ? [v.path, v.origPath] : [v.path]))}
        onClose={() => setLibOpen(null)}
        onPick={(items) => {
          if (libOpen === 'reference') {
            if (items[0]) setReferenceFromPath(items[0].path)
          } else {
            addVideos(items.map((it) => it.path))
          }
        }}
      />
    </div>
  )
}
