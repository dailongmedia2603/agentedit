import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clapperboard, FolderClock, Hourglass, Plus, Sparkles, X } from 'lucide-react'
import { Button, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { BriefForm } from '@/components/motion/BriefForm'
import { JobView } from '@/components/motion/JobView'
import { emptyBrief, fmtDateTime, isBusy, rememberBrief, statusText, useMotionJobs } from '@/lib/motion'

/**
 * "TAO VIDEO" BANG AI (skill motionmaxxing, 2026-10-14) — tach hoan toan khoi "Edit Video" (Remotion).
 * Nhieu the nhu Edit Video: moi the = 1 video. The moi = form thong tin; bam "Tao video" -> Claude tu lam het (khong
 * duyet kich ban) -> the hien tien do roi video MP4. Video chay trong main process (electron/services/motion/runner.ts)
 * nen doi trang / dong the khong dung video. The dang mo luu o ~/.capcut-studio/motion/jobs.json.
 */
interface Tab {
  key: string
  jobId?: string
  draft?: MotionBrief
}

const newKey = () => 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/** Dieu kien chay: Claude Code + (neu co loi doc) key SaydiVoice + Python / ffmpeg. */
function useReadiness(tick: number) {
  const [check, setCheck] = useState<MotionCheck | null>(null)
  const [claudeLogged, setClaudeLogged] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    window.studio.motionCheck().then((c) => {
      if (!alive) return
      setCheck(c)
      if (c.claude.mode === 'subscription' && c.claude.installed)
        window.studio
          .settingsCliStatus('claude')
          .then((r) => alive && setClaudeLogged(r.ok ? !!r.status?.claude?.logged_in : null))
          .catch(() => alive && setClaudeLogged(null))
      else setClaudeLogged(null)
    })
    return () => {
      alive = false
    }
  }, [tick])
  const problems: string[] = []
  if (check) {
    if (!check.claude.installed) problems.push('Chưa cài Claude Code — vào “Cài đặt API” > Claude để cài và đăng nhập.')
    else if (check.claude.mode === 'api_key' && !check.claude.hasKey) problems.push('Claude đang dùng chế độ API key nhưng chưa có key — vào “Cài đặt API” > Claude.')
    else if (check.claude.mode === 'subscription' && claudeLogged === false) problems.push('Claude Code chưa đăng nhập — vào “Cài đặt API” > Claude để đăng nhập.')
    if (!check.python.ok) problems.push('Thiếu Python (numpy + Pillow) để AI tự kiểm tra video — chạy Doctor để cài lại môi trường.')
    if (!check.ffmpeg.ok) problems.push('Thiếu ffmpeg — chạy Doctor để tự cài.')
  }
  return { check, problems }
}

export function ReadinessBanner({ problems, check }: { problems: string[]; check: MotionCheck | null }) {
  if (!check) return null
  if (!problems.length)
    return (
      <div className="mb-4 flex items-center gap-2 text-[12.5px] text-ink-800/50">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        Sẵn sàng · Claude ({check.claude.mode === 'api_key' ? 'API key' : 'gói đăng ký'}, {check.claude.model}) ·{' '}
        {check.saydi.has_key ? 'SaydiVoice đã có key' : 'chưa có key SaydiVoice (chỉ tạo được video không lời)'}
      </div>
    )
  return (
    <div className="mb-4 space-y-1 rounded-xl border border-amber-500/25 bg-amber-50 px-4 py-3">
      {problems.map((p) => (
        <div key={p} className="flex items-start gap-2 text-[13px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {p}
        </div>
      ))}
    </div>
  )
}

export default function MotionCreatePage({ visible }: { visible: boolean }) {
  const jobs = useMotionJobs({ kind: 'single' })
  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const [tabs, setTabs] = useState<Tab[] | null>(null)
  const [active, setActive] = useState('')
  const [history, setHistory] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [tick, setTick] = useState(0)
  const { check, problems } = useReadiness(tick)
  useEffect(() => {
    if (visible) setTick((t) => t + 1)
  }, [visible])

  // Mo app: khoi phuc cac the dang mo
  useEffect(() => {
    window.studio
      .motionOpenTabs()
      .then((o) => {
        const list: Tab[] = o.ids.map((id) => ({ key: newKey(), jobId: id }))
        if (!list.length) list.push({ key: newKey(), draft: emptyBrief() })
        setTabs(list)
        const ai = o.active ? o.ids.indexOf(o.active) : -1
        setActive(list[ai >= 0 ? ai : 0].key)
      })
      .catch(() => {
        const t = { key: newKey(), draft: emptyBrief() }
        setTabs([t])
        setActive(t.key)
      })
  }, [])

  // Luu the dang mo (chi the da co video)
  const sig = useMemo(() => {
    if (!tabs) return ''
    const act = tabs.find((t) => t.key === active)
    return JSON.stringify([tabs.filter((t) => t.jobId).map((t) => t.jobId), act?.jobId || null])
  }, [tabs, active])
  useEffect(() => {
    if (!sig) return
    const [ids, act] = JSON.parse(sig) as [string[], string | null]
    window.studio.motionSetOpenTabs(ids, act).catch(() => undefined)
  }, [sig])

  const addTab = useCallback((draft?: MotionBrief) => {
    const t: Tab = { key: newKey(), draft: draft ? { ...draft } : emptyBrief() }
    setTabs((cur) => [...(cur || []), t])
    setActive(t.key)
    setFormErr('')
  }, [])

  const closeTab = (key: string) => {
    if (!tabs) return
    const idx = tabs.findIndex((t) => t.key === key)
    const rest = tabs.filter((t) => t.key !== key)
    const next = rest.length ? rest : [{ key: newKey(), draft: emptyBrief() }]
    setTabs(next)
    if (active === key) setActive((next[idx - 1] || next[0]).key)
  }

  const openJob = (id: string) => {
    setHistory(false)
    const have = tabs?.find((t) => t.jobId === id)
    if (have) return setActive(have.key)
    const cur = tabs?.find((t) => t.key === active)
    // the dang xem la form trong -> mo vao do
    if (cur && !cur.jobId && cur.draft && !cur.draft.name && !cur.draft.message) {
      setTabs((list) => (list || []).map((t) => (t.key === active ? { key: t.key, jobId: id } : t)))
      return
    }
    const t = { key: newKey(), jobId: id }
    setTabs((list) => [...(list || []), t])
    setActive(t.key)
  }

  const tab = tabs?.find((t) => t.key === active)
  const setDraft = (b: MotionBrief) => setTabs((list) => (list || []).map((t) => (t.key === active ? { ...t, draft: b } : t)))

  const submit = async () => {
    if (!tab?.draft) return
    const b = tab.draft
    setFormErr('')
    if (!b.name.trim()) return setFormErr('Nhập tên sản phẩm / thương hiệu.')
    if (!b.message.trim()) return setFormErr('Nhập nội dung chính muốn nói trong video.')
    if (b.voice.enabled && !b.voice.voiceId) return setFormErr('Chọn giọng đọc (hoặc chọn “Không lời”).')
    if (b.voice.enabled && check && !check.saydi.has_key) return setFormErr('Video có lời đọc cần API key SaydiVoice — nhập ở “Cài đặt API” > SaydiVoice.')
    if (problems.length) return setFormErr(problems[0])
    setSubmitting(true)
    const r = await window.studio.motionCreate(b).catch((e) => ({ ok: false, error: String(e) }) as const)
    setSubmitting(false)
    if (!r.ok || !('job' in r) || !r.job) return setFormErr(r.error || 'Không tạo được video.')
    rememberBrief(b)
    const id = r.job.id
    setTabs((list) => (list || []).map((t) => (t.key === active ? { key: t.key, jobId: id } : t)))
  }

  if (!tabs) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const job = tab?.jobId ? byId.get(tab.jobId) : undefined

  return (
    <div className="w-full px-8 py-7">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Tạo video</h1>
          <p className="mt-0.5 text-sm text-ink-800/45">
            AI tự lên ý tưởng, dựng chuyển động, đọc lời và xuất MP4 hoàn chỉnh — điền thông tin, bấm “Tạo video” rồi chờ.
          </p>
        </div>
        <Button variant={history ? 'subtle' : 'outline'} size="sm" onClick={() => setHistory((v) => !v)}>
          <FolderClock className="h-4 w-4" /> Video đã tạo ({jobs.length})
        </Button>
      </div>

      <ReadinessBanner problems={problems} check={check} />

      {history && (
        <div className="card-surface mb-4 max-h-[360px] overflow-y-auto rounded-2xl p-2">
          {!jobs.length ? (
            <div className="p-4 text-center text-[13px] text-ink-800/45">Chưa có video nào.</div>
          ) : (
            jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => openJob(j.id)}
                className="no-drag flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-black/[0.04]"
              >
                <StatusIcon job={j} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink-900">{j.title}</span>
                  <span className="block text-[11.5px] text-ink-800/45">
                    {statusText(j)} · {fmtDateTime(j.createdAt)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((t, i) => {
          const j = t.jobId ? byId.get(t.jobId) : undefined
          const on = t.key === active
          return (
            <div
              key={t.key}
              className={cn(
                'no-drag group flex max-w-[240px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2 transition-all',
                on ? 'border-brand-400/50 bg-brand-500/10' : 'border-black/8 bg-white/60 hover:bg-white'
              )}
            >
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setActive(t.key)}>
                {j ? (
                  <StatusIcon job={j} />
                ) : (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-black/6 text-[10px] font-semibold text-ink-800/50">{i + 1}</span>
                )}
                <span className="min-w-0">
                  <span className={cn('block truncate text-[13px] font-medium', on ? 'text-brand-700' : 'text-ink-900')}>{j ? j.title : t.draft?.name || 'Video mới'}</span>
                  <span className="block truncate text-[11px] text-ink-800/45">{j ? statusText(j) : 'Đang nhập thông tin'}</span>
                </span>
              </button>
              {(tabs.length > 1 || j) && (
                <button
                  onClick={() => closeTab(t.key)}
                  title={j && isBusy(j) ? 'Đóng thẻ — video vẫn tiếp tục tạo, mở lại ở “Video đã tạo”' : 'Đóng thẻ'}
                  className="rounded-md p-0.5 text-ink-800/30 hover:bg-black/5 hover:text-ink-900"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}
        <button
          onClick={() => addTab()}
          className="no-drag flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-brand-400/60 px-3 py-2 text-[13px] font-medium text-brand-600 hover:bg-brand-50"
          title="Tạo thêm một video khác — video đang tạo vẫn chạy tiếp"
        >
          <Plus className="h-4 w-4" /> Thêm video
        </button>
      </div>

      {tab?.jobId ? (
        job ? (
          <JobView
            job={job}
            onNew={() => addTab()}
            onDuplicate={(b) => addTab(b)}
            onDeleted={() => closeTab(tab.key)}
          />
        ) : (
          <div className="flex h-32 items-center justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        )
      ) : tab?.draft ? (
        <div className="pb-24">
          <BriefForm value={tab.draft} onChange={setDraft} mode="single" />
          <div className="sticky bottom-0 -mx-8 mt-4 flex items-center justify-end gap-3 border-t border-black/6 bg-[rgba(250,249,247,0.92)] px-8 py-3 backdrop-blur">
            {formErr && <div className="mr-auto text-[13px] text-red-600">{formErr}</div>}
            <Button size="lg" onClick={submit} disabled={submitting}>
              {submitting ? <Spinner className="border-white/40 border-t-white" /> : <Sparkles className="h-4 w-4" />} Tạo video
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function StatusIcon({ job }: { job: MotionJob }) {
  if (job.status === 'running') return <Spinner className="h-3.5 w-3.5 shrink-0" />
  if (job.status === 'queued') return <Hourglass className="h-3.5 w-3.5 shrink-0 text-brand-500" />
  if (job.status === 'done') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
  if (job.status === 'cancelled') return <Clapperboard className="h-3.5 w-3.5 shrink-0 text-ink-800/35" />
  return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
}
