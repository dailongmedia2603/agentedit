import { useEffect, useState } from 'react'
import { RemotionPlanView, fmtBytes, planAiName } from '@/components/RemotionViews'
import { Film, Trash2, FolderOpen, ArrowLeft, MonitorPlay, RefreshCw, ArrowRight, ScrollText, AlertTriangle } from 'lucide-react'
import { Button, Card, CardBody, CardHeader, Badge, Collapsible, Spinner } from '@/components/ui/primitives'
import { ReferenceAnalysisView, SourceBriefView } from '@/components/ResultViews'
import { cn, fmtTime } from '@/lib/utils'
import RunLogPanel from '@/components/RunLogPanel'

function statusBadge(status: string) {
  const map: Record<string, { tone: 'ok' | 'fail' | 'warn' | 'brand' | 'neutral'; label: string }> = {
    done: { tone: 'ok', label: 'Hoàn tất' },
    error: { tone: 'fail', label: 'Lỗi' },
    reference: { tone: 'neutral', label: 'Chờ video mẫu' },
    understanding: { tone: 'neutral', label: 'Đang hiểu' },
    analyzing_reference: { tone: 'neutral', label: 'Đang phân tích mẫu' },
    planning: { tone: 'neutral', label: 'Đang lập KH' },
    rendering: { tone: 'neutral', label: 'Đang render' },
    preview: { tone: 'warn', label: 'Chờ render' },
    upload: { tone: 'neutral', label: 'Nháp' }
  }
  const m = map[status] || { tone: 'neutral' as const, label: status }
  return <Badge tone={m.tone}>{m.label}</Badge>
}

function fmtDate(ts: number) {
  const d = new Date(ts)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`
}

function projectVideos(project: Project): SourceVideo[] {
  if (project.videos?.length) return project.videos
  return project.video ? [{ ...project.video, id: 'source_1' }] : []
}

/** Video MP4 da render — phat qua may chu media cuc bo cua app */
function RenderedVideo({ info }: { info: RemotionRenderInfo }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    window.studio.remotionMediaUrl(info.output).then((u) => setUrl(`${u}&v=${info.at}`))
  }, [info])
  return (
    <Card className="mt-4">
      <CardHeader className="text-sm font-semibold text-ink-900">Video đã render (Remotion)</CardHeader>
      <CardBody className="flex flex-col gap-4 sm:flex-row">
        <div className="w-full max-w-[260px] shrink-0">
          {url ? (
            <video src={url} controls playsInline className="aspect-[9/16] w-full rounded-xl bg-black object-contain" />
          ) : (
            <div className="flex aspect-[9/16] items-center justify-center rounded-xl bg-black/80">
              <Spinner className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-xs text-ink-800/60">
          <div className="truncate font-mono text-[11px]">{info.output}</div>
          <div className="flex flex-wrap gap-2">
            {info.size ? <Badge tone="neutral">{fmtBytes(info.size)}</Badge> : null}
            <Badge tone="neutral">{fmtDate(info.at)}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => window.studio.remotionSaveAs(info.output)}>
              Lưu video…
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.studio.showItemInFolder(info.output)}>
              <FolderOpen className="h-4 w-4" /> Hiện trong Finder
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

/** Hop xac nhan xoa du an: go khoi danh sach, tuy chon dua thu muc du an vao Thung rac */
function DeleteDialog({
  project,
  onClose,
  onDone
}: {
  project: Project
  onClose: () => void
  onDone: (id: string) => void
}) {
  const [info, setInfo] = useState<ProjectDiskInfo | null | undefined>(undefined)
  const [withFiles, setWithFiles] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    window.studio
      .projectDiskInfo(project.id)
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [project.id])
  const canTrash = !!info?.trashable
  const name = project.topic || projectVideos(project)[0]?.name || project.id

  const run = async () => {
    setBusy(true)
    setErr('')
    const r = await window.studio
      .projectDelete(project.id, withFiles && canTrash)
      .catch((e) => ({ ok: false, trashed: [], error: String(e) }))
    setBusy(false)
    if (!r.ok) {
      setErr(r.error || 'Không xoá được dự án.')
      return
    }
    onDone(project.id)
  }

  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-[2px]"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
            <Trash2 className="h-5 w-5 text-red-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink-900">Xoá dự án “{name}”?</div>
            <div className="mt-0.5 text-[12.5px] text-ink-800/55">
              Dự án được gỡ khỏi danh sách “Video đã tạo”. Phân tích video đã lưu trong thư viện vẫn giữ để lần sau
              dùng lại.
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          {info === undefined ? (
            <div className="flex items-center gap-2 text-[12.5px] text-ink-800/55">
              <Spinner /> Đang kiểm tra file của dự án trên máy…
            </div>
          ) : canTrash && info ? (
            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition',
                withFiles ? 'border-red-400/50 bg-red-500/[0.05]' : 'border-black/10 hover:border-black/20'
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-red-500"
                checked={withFiles}
                onChange={(e) => setWithFiles(e.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink-900">
                  Chuyển cả file trên máy vào Thùng rác · {fmtBytes(info.bytes)}
                </div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-ink-800/55">
                  Thư mục dự án: bản chép video nguồn / video mẫu
                  {info.renders ? `, ${info.renders} video đã render` : ''}
                  {info.hasRunLog ? ' và nhật ký xử lý' : ''}. Lấy lại được từ Thùng rác.
                </div>
                <div
                  className="mt-1 truncate text-left font-mono text-[10.5px] text-ink-800/40 [direction:rtl]"
                  title={info.workDir || ''}
                >
                  {info.workDir}
                </div>
              </div>
            </label>
          ) : (
            <div className="rounded-xl bg-ink-50 px-3.5 py-3 text-[12.5px] text-ink-800/60">
              Chỉ gỡ khỏi danh sách, không xoá file nào{info?.reason ? ` — ${info.reason}` : '.'}
            </div>
          )}

          {!!info?.outside?.length && (
            <div className="mt-3 text-[12px] leading-relaxed text-ink-800/55">
              Video gốc nằm ngoài thư mục dự án <b className="font-semibold text-ink-800/70">không bị đụng tới</b>:
              {info.outside.slice(0, 3).map((p) => (
                <div
                  key={p}
                  className="truncate text-left font-mono text-[10.5px] text-ink-800/40 [direction:rtl]"
                  title={p}
                >
                  {p}
                </div>
              ))}
            </div>
          )}

          {err && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {err}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/6 bg-ink-50/60 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button variant="danger" size="sm" onClick={run} disabled={busy || info === undefined}>
            {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />}
            {withFiles && canTrash ? 'Xoá + chuyển file vào Thùng rác' : 'Xoá khỏi danh sách'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ProjectsPage({
  openProject,
  busyId,
  onDeleted
}: {
  openProject: (id: string) => void
  /** Du an dang xu ly o Video Remotion — khong cho xoa */
  busyId?: string | null
  onDeleted?: (id: string) => void
}) {
  const [items, setItems] = useState<Project[]>([])
  // Du an cua luong CapCut cu (khong co mode 'remotion') khong mo duoc nua -> an khoi danh sach.
  // Du lieu van nguyen trong ~/.capcut-studio/projects.json.
  const [hidden, setHidden] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Project | null>(null)

  const load = async () => {
    setLoading(true)
    const list = await window.studio.projectsList()
    const rm = list.filter((p) => p.mode === 'remotion')
    setItems(rm)
    setHidden(list.length - rm.length)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])
  const [logOpen, setLogOpen] = useState(false)

  const [confirmDel, setConfirmDel] = useState<Project | null>(null)
  const deleted = (id: string) => {
    setConfirmDel(null)
    setLogOpen(false)
    setSelected(null)
    onDeleted?.(id)
    load()
  }

  // ---- Detail ----
  if (selected) {
    const p = selected
    const sourceVideos = projectVideos(p)
    const firstVideo = sourceVideos[0]
    return (
      <div className="w-full px-8 py-7">
        <div className="mb-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLogOpen(false)
              setSelected(null)
            }}
          >
            <ArrowLeft className="h-4 w-4" /> Danh sách
          </Button>
          <div className="flex gap-2">
            <Button variant={logOpen ? 'subtle' : 'outline'} size="sm" onClick={() => setLogOpen((o) => !o)}>
              <ScrollText className="h-4 w-4" /> Nhật ký xử lý
            </Button>
            <Button size="sm" onClick={() => openProject(p.id)}>
              <ArrowRight className="h-4 w-4" /> Mở trong Video Remotion
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDel(p)}
              disabled={busyId === p.id}
              title={busyId === p.id ? 'Dự án đang xử lý ở Video Remotion — đợi xong rồi xoá' : undefined}
            >
              <Trash2 className="h-4 w-4" /> Xoá
            </Button>
          </div>
        </div>

        <Card className="mb-4">
          <CardBody className="flex items-center gap-4 pt-5">
            {firstVideo?.thumb ? (
              <img src={firstVideo.thumb} className="h-20 w-14 rounded-lg object-cover" alt="" />
            ) : (
              <div className="flex h-20 w-14 items-center justify-center rounded-lg bg-black/5">
                <Film className="h-6 w-6 text-ink-800/40" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-semibold text-ink-900">{p.topic || firstVideo?.name}</span>
                {statusBadge(p.status)}
              </div>
              <div className="mt-0.5 truncate text-xs text-ink-800/45">
                {sourceVideos.length > 1 ? `${sourceVideos.length} video nguồn · ${firstVideo?.name}` : firstVideo?.name}
              </div>
              <div className="text-xs text-ink-800/40">
                {sourceVideos.length
                  ? `${fmtTime(sourceVideos.reduce((total, video) => total + (video.duration || 0), 0))} tổng · `
                  : ''}
                {fmtDate(p.updatedAt)}
              </div>
            </div>
          </CardBody>
        </Card>

        {p.error && (
          <div className="mb-4 rounded-xl border border-red-400/40 bg-red-50 p-3 text-sm text-red-600">
            Lỗi ở bước <b>{p.error.step}</b>: {p.error.message}
          </div>
        )}

        <div className="space-y-3">
          {p.sourceBrief && (
            <Collapsible title={`Hiểu ${sourceVideos.length || 1} video nguồn (Gemini)`} done defaultOpen>
              <SourceBriefView brief={p.sourceBrief} />
            </Collapsible>
          )}
          {p.referenceAnalysis && (
            <Collapsible title="Phân tích video mẫu (GPT · Codex CLI)" done>
              <ReferenceAnalysisView analysis={p.referenceAnalysis} />
            </Collapsible>
          )}
          {p.rmPlan && (
            <Collapsible title={`Kế hoạch dựng Remotion (${planAiName(p.rmPlan)})`} done>
              <RemotionPlanView plan={p.rmPlan} spec={p.rmSpec || null} catalog={null} />
            </Collapsible>
          )}
        </div>

        {p.rmRender?.output && <RenderedVideo info={p.rmRender} />}

        {confirmDel && <DeleteDialog project={confirmDel} onClose={() => setConfirmDel(null)} onDone={deleted} />}

        {logOpen && (
          <RunLogPanel
            runId={p.id}
            live={['understanding', 'analyzing_reference', 'planning', 'rendering'].includes(p.status)}
            title={sourceVideos.map((v) => v.name).join(', ') || p.id}
            onClose={() => setLogOpen(false)}
          />
        )}
      </div>
    )
  }

  // ---- List ----
  return (
    <div className="w-full px-8 py-7">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Video đã tạo</h1>
          <p className="mt-1 text-sm text-ink-800/50">
            Xem lại các dự án Video Remotion: phân tích nguồn, video mẫu, kế hoạch dựng và video đã render.
            {hidden > 0 && ` (Ẩn ${hidden} dự án CapCut cũ — dữ liệu vẫn giữ nguyên.)`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Tải lại
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center py-16 text-center">
            <MonitorPlay className="mb-3 h-9 w-9 text-ink-800/25" />
            <div className="font-semibold text-ink-900">Chưa có dự án nào</div>
            <p className="mt-1 text-sm text-ink-800/45">Sang tab “Video Remotion” để bắt đầu dự án đầu tiên.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((p) => {
            const sourceVideos = projectVideos(p)
            const firstVideo = sourceVideos[0]
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="no-drag card-surface flex items-center gap-3 rounded-2xl p-3 text-left transition-all hover:shadow-[0_10px_30px_-12px_rgba(20,20,40,0.25)]"
              >
                {firstVideo?.thumb ? (
                  <img src={firstVideo.thumb} className="h-16 w-12 rounded-lg object-cover" alt="" />
                ) : (
                  <div className="flex h-16 w-12 items-center justify-center rounded-lg bg-black/5">
                    <Film className="h-5 w-5 text-ink-800/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink-900">{p.topic || firstVideo?.name}</div>
                  <div className="truncate text-xs text-ink-800/45">
                    {sourceVideos.length > 1
                      ? `${sourceVideos.length} video nguồn · ${firstVideo?.name}`
                      : firstVideo?.name}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {statusBadge(p.status)}
                    <span className="text-[11px] text-ink-800/40">{fmtDate(p.updatedAt)}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
