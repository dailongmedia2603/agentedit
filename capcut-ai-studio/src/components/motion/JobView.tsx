import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Hourglass,
  RotateCcw,
  ScrollText,
  Square,
  Trash2
} from 'lucide-react'
import { Badge, Button, Card, CardBody, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { useFullUi } from '@/lib/clientUi'
import { REVEAL_LABEL } from '@/lib/platform'
import { ASPECTS, MOTION_STAGES, aspectCls, fmtBytes, fmtDateTime, fmtDuration, isBusy, motionStageLabel } from '@/lib/motion'

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

function Stepper({ job }: { job: MotionJob }) {
  const seen = new Set(job.stages || [])
  const done = job.status === 'done'
  const cur = job.stage
  // bo buoc giong doc khi video khong loi
  const steps = MOTION_STAGES.filter((s) => s.id !== 'voice' || job.brief.voice?.enabled)
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((s, i) => {
        const isCur = !done && job.status === 'running' && s.id === cur
        const passed = done || (seen.has(s.id) && !isCur)
        return (
          <div key={s.id} className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium',
                isCur ? 'bg-brand-500 text-white' : passed ? 'bg-emerald-500/12 text-emerald-700' : 'bg-black/5 text-ink-800/40'
              )}
            >
              {isCur ? <Spinner className="h-3 w-3 border-white/40 border-t-white" /> : passed ? <CheckCircle2 className="h-3 w-3" /> : null}
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-2 bg-black/10" />}
          </div>
        )
      })}
    </div>
  )
}

function LogPanel({ id, live }: { id: string; live: boolean }) {
  const [lines, setLines] = useState<string[]>([])
  const next = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    next.current = 0
    setLines([])
    let stop = false
    const pull = async () => {
      const r = await window.studio.motionLog(id, next.current).catch(() => null)
      if (stop || !r) return
      if (r.lines.length) {
        next.current = r.next
        setLines((cur) => [...cur, ...r.lines].slice(-600))
        requestAnimationFrame(() => box.current?.scrollTo({ top: box.current.scrollHeight }))
      }
    }
    pull()
    const t = live ? setInterval(pull, 2000) : null
    return () => {
      stop = true
      if (t) clearInterval(t)
    }
  }, [id, live])
  return (
    <div ref={box} className="max-h-[320px] overflow-y-auto rounded-xl bg-ink-900 p-3 font-mono text-[11px] leading-relaxed text-white/80">
      {lines.length ? lines.map((l, i) => <div key={i} className="whitespace-pre-wrap break-words">{l}</div>) : <div className="text-white/40">Chưa có nhật ký.</div>}
    </div>
  )
}

export function JobView({ job, onNew, onDeleted, onDuplicate }: { job: MotionJob; onNew?: () => void; onDeleted?: () => void; onDuplicate?: (b: MotionBrief) => void }) {
  const fullUi = useFullUi()
  const busy = isBusy(job)
  const now = useNow(busy)
  const [url, setUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [showNote, setShowNote] = useState(false)
  useEffect(() => {
    setUrl('')
    if (job.output) window.studio.remotionMediaUrl(job.output).then((u) => setUrl(`${u}&v=${job.finishedAt || 0}`))
  }, [job.output, job.finishedAt])

  const elapsed = job.startedAt ? (job.finishedAt || now) - job.startedAt : 0
  const aspect = ASPECTS.find((a) => a.id === job.brief.aspect)
  const statusTone = job.status === 'done' ? 'ok' : job.status === 'error' || job.status === 'interrupted' ? 'fail' : job.status === 'cancelled' ? 'neutral' : 'brand'

  const del = async () => {
    if (!window.confirm('Xoá video này và thư mục làm việc của nó?')) return
    const r = await window.studio.motionDelete(job.id)
    if (!r.ok) setNotice(r.error || 'Không xoá được')
    else onDeleted?.()
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-ink-900">{job.title}</h2>
                <Badge tone={statusTone as never}>
                  {job.status === 'queued'
                    ? 'Đang chờ lượt'
                    : job.status === 'running'
                      ? 'Đang tạo'
                      : job.status === 'done'
                        ? 'Hoàn tất'
                        : job.status === 'cancelled'
                          ? 'Đã huỷ'
                          : job.status === 'interrupted'
                            ? 'Bị gián đoạn'
                            : 'Có lỗi'}
                </Badge>
              </div>
              <div className="mt-1 text-[12px] text-ink-800/45">
                {aspect?.label} · ~{job.brief.duration} giây · {job.brief.voice?.enabled ? `giọng ${job.brief.voice.voiceName || job.brief.voice.voiceId}` : 'không lời'}
                {' · '}tạo lúc {fmtDateTime(job.createdAt)}
                {elapsed > 0 && ` · ${busy ? 'đã chạy' : 'mất'} ${fmtDuration(elapsed)}`}
                {fullUi && job.model ? ` · ${job.model}` : ''}
                {fullUi && job.costUsd ? ` · ~$${job.costUsd.toFixed(2)}` : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {fullUi && (
                <Button variant={showLog ? 'subtle' : 'outline'} size="sm" onClick={() => setShowLog((v) => !v)}>
                  <ScrollText className="h-4 w-4" /> Nhật ký
                  {busy && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />}
                </Button>
              )}
              {busy ? (
                <Button variant="danger" size="sm" onClick={() => window.studio.motionCancel(job.id)}>
                  <Square className="h-3.5 w-3.5" /> {job.status === 'queued' ? 'Huỷ chờ' : 'Dừng tạo'}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={del} title="Xoá video">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="mt-4">
            <Stepper job={job} />
          </div>
          {job.status === 'running' && (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-ink-800/60">
              <Spinner className="h-3.5 w-3.5" /> {motionStageLabel(job.stage)}… AI tự lên ý tưởng, dựng, render rồi tự kiểm tra và sửa — thường mất 15–40 phút. Bạn có thể sang thẻ khác hoặc tạo video khác.
            </div>
          )}
          {job.status === 'queued' && (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-ink-800/60">
              <Hourglass className="h-4 w-4 text-brand-500" /> Đang chờ video trước tạo xong (số video tạo cùng lúc chỉnh ở Cài đặt API).
            </div>
          )}
          {(job.status === 'error' || job.status === 'interrupted' || job.status === 'cancelled') && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="flex-1 text-[13px] text-red-700">{job.error || 'Video chưa tạo xong.'}</div>
              <Button size="sm" onClick={() => window.studio.motionRerun(job.id)}>
                <RotateCcw className="h-4 w-4" /> Chạy lại
              </Button>
            </div>
          )}
          {showLog && fullUi && (
            <div className="mt-4">
              <LogPanel id={job.id} live={busy} />
            </div>
          )}
        </CardBody>
      </Card>

      {job.output && (
        <Card>
          <CardBody className="pt-5">
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className={cn('w-full shrink-0', job.brief.aspect === '16:9' ? 'max-w-[520px]' : job.brief.aspect === '1:1' ? 'max-w-[380px]' : 'max-w-[300px]')}>
                {url ? (
                  <video key={url} src={url} controls playsInline className={cn('w-full rounded-2xl bg-black object-contain', aspectCls(job.brief.aspect))} />
                ) : (
                  <div className={cn('flex items-center justify-center rounded-2xl bg-black/80', aspectCls(job.brief.aspect))}>
                    <Spinner className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  {job.draftOnly ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                  {job.draftOnly ? 'Bản nháp (AI chưa xuất bản cuối)' : 'Video hoàn chỉnh'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.meta?.width ? <Badge tone="neutral">{job.meta.width}×{job.meta.height}</Badge> : null}
                  {job.meta?.seconds ? <Badge tone="neutral">{job.meta.seconds.toFixed(1)} giây</Badge> : null}
                  {job.meta?.size ? <Badge tone="neutral">{fmtBytes(job.meta.size)}</Badge> : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={async () => {
                      const r = await window.studio.remotionSaveAs(job.output!, job.title)
                      if (r.ok && r.path) setNotice(`Đã lưu: ${r.path}`)
                    }}
                  >
                    <Download className="h-4 w-4" /> Lưu video…
                  </Button>
                  <Button variant="outline" onClick={() => window.studio.showItemInFolder(job.output!)}>
                    <FolderOpen className="h-4 w-4" /> {REVEAL_LABEL}
                  </Button>
                  {onDuplicate && (
                    <Button variant="outline" onClick={() => onDuplicate(job.brief)}>
                      <Copy className="h-4 w-4" /> Tạo bản khác
                    </Button>
                  )}
                  {job.note && (
                    <Button variant="outline" onClick={() => setShowNote((v) => !v)}>
                      <FileText className="h-4 w-4" /> Báo cáo của AI
                    </Button>
                  )}
                </div>
                {notice && <div className="text-xs text-emerald-700">{notice}</div>}
                {onNew && (
                  <div className="flex justify-end pt-1">
                    <Button variant="ghost" onClick={onNew}>
                      Tạo video mới
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {showNote && job.note && (
              <pre className="mt-4 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-xl bg-ink-50 p-4 font-sans text-[12.5px] leading-relaxed text-ink-800/80">{job.note}</pre>
            )}
          </CardBody>
        </Card>
      )}
      {!job.output && notice && <div className="text-xs text-red-600">{notice}</div>}
    </div>
  )
}
