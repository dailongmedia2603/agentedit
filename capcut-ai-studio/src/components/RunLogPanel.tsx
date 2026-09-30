import { useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  FolderOpen,
  Bot,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  Copy,
  Check,
  Flag,
  Info,
  ShieldCheck,
  MousePointerClick,
  ArrowDownToLine,
  Loader2,
  Database,
  Trash2
} from 'lucide-react'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'ai' | 'problem'

/** Mot dong trong nhat ky sau khi ghep: cuoc goi AI = call + (cac lan thu loi) + phan hoi */
type Row =
  | { type: 'ai'; call: RunEvent; fails: RunEvent[]; resp?: RunEvent }
  | { type: 'ev'; ev: RunEvent }

function clock(ts: number) {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('vi-VN', { hour12: false })
}

function fmtDur(s?: number) {
  if (s === undefined || s === null) return ''
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}p${String(Math.round(s % 60)).padStart(2, '0')}s`
}

function pretty(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') {
    const t = v.trim()
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(t), null, 2)
      } catch {
        /* khong phai JSON chuan -> in nguyen */
      }
    }
    return v
  }
  return JSON.stringify(v, null, 2)
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      className="no-drag inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-800/45 transition hover:bg-black/5 hover:text-ink-900"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setOk(true)
        setTimeout(() => setOk(false), 1200)
      }}
    >
      {ok ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {ok ? 'Đã chép' : 'Chép'}
    </button>
  )
}

function Block({ label, text, hint }: { label: string; text: string; hint?: string }) {
  if (!text) return null
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11.5px] font-semibold text-ink-800/60">{label}</span>
        <span className="text-[10.5px] text-ink-800/35">{text.length.toLocaleString('vi-VN')} ký tự</span>
        {hint && <span className="text-[10.5px] text-ink-800/35">· {hint}</span>}
        <span className="ml-auto">
          <CopyBtn text={text} />
        </span>
      </div>
      <pre className="max-h-[380px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-black/8 bg-ink-50 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-800/85">
        {text}
      </pre>
    </div>
  )
}

function LevelIcon({ level, className }: { level?: string; className?: string }) {
  if (level === 'ok') return <CheckCircle2 className={cn('text-emerald-500', className)} />
  if (level === 'warn') return <AlertTriangle className={cn('text-amber-500', className)} />
  if (level === 'error') return <XCircle className={cn('text-red-500', className)} />
  return <Info className={cn('text-ink-800/35', className)} />
}

/** The goi AI: system prompt / du lieu gui / AI tra ve / tham so */
function AiCard({ row, live }: { row: Extract<Row, { type: 'ai' }>; live: boolean }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'sys' | 'user' | 'resp' | 'params'>('resp')
  const { call, resp, fails } = row
  const pending = !resp
  const failed = resp?.kind === 'ai_error'
  const [, tick] = useState(0)
  useEffect(() => {
    if (!pending || !live) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [pending, live])

  const waited = Date.now() / 1000 - call.ts
  const respText = resp ? (failed ? String(resp.error || '') + '\n\n' + (resp.raw_text || '') : pretty(resp.raw_text)) : ''

  return (
    <div className="rounded-xl border border-black/8 bg-white">
      <button
        className="no-drag flex w-full items-center gap-2.5 px-3 py-2 text-left"
        onClick={() => {
          if (!open) setTab(resp ? 'resp' : 'sys')
          setOpen((o) => !o)
        }}
      >
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-ink-800/35 transition', open && 'rotate-90')} />
        <Bot className="h-4 w-4 shrink-0 text-brand-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-semibold text-ink-900">{call.step}</span>
            {(call.attempt ?? 1) > 1 && <Badge tone="warn">lần {call.attempt}</Badge>}
          </div>
          <div className="truncate text-[11px] text-ink-800/45">
            {call.provider} · {call.model || '—'}
          </div>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-800/40">{clock(call.ts)}</span>
        {pending && fails.length ? (
          <Badge tone="warn">thất bại · đã thử lại</Badge>
        ) : pending ? (
          live ? (
            <Badge tone="brand">
              <Loader2 className="h-3 w-3 animate-spin" /> chờ AI {fmtDur(waited)}
            </Badge>
          ) : (
            <Badge tone="neutral">không có phản hồi</Badge>
          )
        ) : failed ? (
          <Badge tone="fail">lỗi · {fmtDur(resp.duration)}</Badge>
        ) : (
          <Badge tone="ok">
            {fmtDur(resp.duration)} · {(resp.chars ?? 0).toLocaleString('vi-VN')} ký tự
          </Badge>
        )}
      </button>
      {!!fails.length && (
        <div className="space-y-0.5 border-t border-black/6 px-3 py-1.5">
          {fails.map((f) => (
            <div key={f.id} className="flex gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">
                {f.title}: {String(f.error || '').slice(0, 300)}
              </span>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="space-y-2.5 border-t border-black/6 px-3 py-3">
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['sys', 'System prompt'],
                ['user', 'Dữ liệu gửi đi'],
                ['resp', 'AI trả về'],
                ['params', 'Tham số']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={cn(
                  'no-drag rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition',
                  tab === id ? 'bg-brand-500/12 text-brand-700' : 'text-ink-800/50 hover:bg-black/5'
                )}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'sys' &&
            (call.system_prompt ? (
              <Block label="System prompt" text={call.system_prompt} />
            ) : (
              <p className="text-[12px] text-ink-800/45">
                Bước này không có system prompt riêng — lời dặn nằm chung trong phần “Dữ liệu gửi đi”.
              </p>
            ))}
          {tab === 'user' && (
            <Block
              label="Dữ liệu gửi đi (user message)"
              text={call.user_message || ''}
              hint="file video không được chép vào log"
            />
          )}
          {tab === 'resp' &&
            (resp ? (
              <Block label={failed ? 'Lỗi' : 'Phản hồi thô của AI'} text={respText} />
            ) : (
              <p className="text-[12px] text-ink-800/45">
                {live ? 'Đang chờ AI trả lời…' : 'Không ghi nhận được phản hồi cho lần gọi này (xem lỗi của bước bên dưới).'}
              </p>
            ))}
          {tab === 'params' && <Block label="Tham số gọi" text={pretty({ provider: call.provider, model: call.model, lan_thu: call.attempt, ...(call.params || {}) })} />}
        </div>
      )}
    </div>
  )
}

/** Cac su kien khac: buoc, ghi chu, guard, ket qua */
function EventRow({ ev }: { ev: RunEvent }) {
  const [open, setOpen] = useState(false)

  if (ev.kind === 'stage_start') {
    return (
      <div className="pt-3">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-brand-500" />
          <span className="text-[13px] font-bold text-ink-900">{ev.title}</span>
          <span className="text-[11px] text-ink-800/40">bắt đầu {clock(ev.ts)}</span>
          <div className="h-px flex-1 bg-brand-500/20" />
          {!!ev.input && (
            <button className="no-drag text-[11px] text-brand-600 hover:underline" onClick={() => setOpen((o) => !o)}>
              {open ? 'Ẩn đầu vào' : 'Xem đầu vào'}
            </button>
          )}
        </div>
        {open && (
          <div className="mt-2 pl-6">
            <Block label="Đầu vào của bước" text={pretty(ev.input)} />
          </div>
        )}
      </div>
    )
  }

  const detail: { label: string; value: unknown }[] = []
  if (ev.kind === 'stage_end' && ev.result) detail.push({ label: 'Kết quả', value: ev.result })
  if (ev.error) detail.push({ label: 'Lỗi', value: ev.error })
  if (ev.kind === 'result' && ev.output) detail.push({ label: 'Kết quả bước', value: ev.output })
  if (ev.kind === 'guard') {
    if ((ev.fixed as unknown[])?.length) detail.push({ label: 'Đã tự sửa', value: ev.fixed })
    if ((ev.issues as unknown[])?.length) detail.push({ label: 'Còn lại', value: ev.issues })
    if ((ev.issues_before as unknown[])?.length) detail.push({ label: 'Lỗi AI mắc trước khi sửa', value: ev.issues_before })
  }
  if (ev.kind === 'ui' && ev.detail) detail.push({ label: 'Chi tiết', value: ev.detail })

  const Icon =
    ev.kind === 'guard'
      ? ShieldCheck
      : ev.kind === 'ui'
        ? MousePointerClick
        : ev.kind === 'result'
          ? Database
          : null

  const isEnd = ev.kind === 'stage_end'
  const isNote = ev.kind === 'note'

  return (
    <div
      className={cn(
        isEnd && 'rounded-xl border px-3 py-2',
        isEnd && (ev.level === 'error' ? 'border-red-300/60 bg-red-50/60' : 'border-emerald-300/50 bg-emerald-50/50'),
        !isEnd && !isNote && 'rounded-xl border border-black/6 bg-white/70 px-3 py-2'
      )}
    >
      <button
        className={cn('no-drag flex w-full items-start gap-2 text-left', !detail.length && 'cursor-default')}
        onClick={() => detail.length && setOpen((o) => !o)}
      >
        {detail.length ? (
          <ChevronRight className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-800/35 transition', open && 'rotate-90')} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {Icon ? (
          <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', ev.level === 'warn' ? 'text-amber-500' : ev.level === 'error' ? 'text-red-500' : ev.level === 'ok' ? 'text-emerald-500' : 'text-ink-800/40')} />
        ) : (
          <LevelIcon level={ev.level} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 break-words',
            isNote ? 'text-[11.5px] text-ink-800/60' : 'text-[12.5px] font-medium text-ink-900',
            ev.level === 'error' && 'text-red-700',
            ev.level === 'warn' && isNote && 'text-amber-700'
          )}
        >
          {isEnd ? `${ev.level === 'error' ? 'Lỗi' : 'Xong'}: ${ev.title}` : ev.title}
          {isEnd && ev.duration !== undefined && <span className="font-normal text-ink-800/45"> · {fmtDur(ev.duration)}</span>}
          {isEnd && ev.level === 'error' && ev.error && (
            <span className="mt-0.5 block text-[11.5px] font-normal">{String(ev.error).slice(0, 400)}</span>
          )}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-800/35">{clock(ev.ts)}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 pl-6">
          {detail.map((d) => (
            <Block key={d.label} label={d.label} text={pretty(d.value)} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function RunLogPanel({
  runId,
  live,
  title,
  onClose
}: {
  runId: string
  /** Dang co buoc chay -> doc file moi giay */
  live: boolean
  title?: string
  onClose: () => void
}) {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [follow, setFollow] = useState(true)
  const offset = useRef(0)
  const scroller = useRef<HTMLDivElement | null>(null)

  // Doi project -> doc lai tu dau
  useEffect(() => {
    offset.current = 0
    setEvents([])
  }, [runId])

  useEffect(() => {
    if (!runId) return
    let stop = false
    const pull = async () => {
      try {
        const r = await window.studio.runlogRead(runId, offset.current)
        if (stop) return
        if (r.offset < offset.current) {
          // file bi xoa/tao lai
          offset.current = 0
          setEvents([])
          return
        }
        offset.current = r.offset
        if (r.events.length) setEvents((cur) => [...cur, ...r.events])
      } catch {
        /* doc loi -> lan sau thu lai */
      }
    }
    pull()
    const t = setInterval(pull, live ? 1000 : 3000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [runId, live])

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const byCall: Record<string, Extract<Row, { type: 'ai' }>> = {}
    for (const ev of events) {
      if (ev.kind === 'ai_call') {
        const row = { type: 'ai' as const, call: ev, fails: [] as RunEvent[] }
        byCall[ev.id] = row
        out.push(row)
      } else if ((ev.kind === 'ai_response' || ev.kind === 'ai_error') && ev.call_id && byCall[ev.call_id]) {
        const row = byCall[ev.call_id]
        if (ev.kind === 'ai_error' && ev.level === 'warn') row.fails.push(ev)
        else row.resp = ev
      } else {
        out.push({ type: 'ev', ev })
      }
    }
    return out
  }, [events])

  const shown = rows.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'ai') return r.type === 'ai' || (r.type === 'ev' && r.ev.kind === 'stage_start')
    if (r.type === 'ai') return r.resp?.kind === 'ai_error' || r.fails.length > 0
    return r.ev.level === 'warn' || r.ev.level === 'error' || r.ev.kind === 'stage_start'
  })

  const nAi = rows.filter((r) => r.type === 'ai').length
  const nProblem = rows.filter((r) =>
    r.type === 'ai' ? r.resp?.kind === 'ai_error' || r.fails.length > 0 : r.ev.level === 'warn' || r.ev.level === 'error'
  ).length

  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [shown.length, follow])

  return (
    <div className="fixed bottom-0 right-0 top-12 z-40 flex w-[640px] max-w-[calc(100vw-240px)] flex-col border-l border-black/10 bg-[#FBF8F5] shadow-[-20px_0_60px_-30px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2 border-b border-black/8 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-ink-900">Nhật ký xử lý</span>
            {live && (
              <span className="flex items-center gap-1 rounded-full bg-brand-500/12 px-2 py-0.5 text-[10.5px] font-semibold text-brand-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" /> đang chạy
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-ink-800/45">{title || runId}</div>
        </div>
        <button
          className="no-drag rounded-lg p-1.5 text-ink-800/45 hover:bg-black/5 hover:text-ink-900"
          title="Mở thư mục chứa file nhật ký"
          onClick={() => window.studio.runlogOpenDir(runId)}
        >
          <FolderOpen className="h-4 w-4" />
        </button>
        <button
          className="no-drag rounded-lg p-1.5 text-ink-800/45 hover:bg-black/5 hover:text-red-600 disabled:opacity-30"
          title="Xoá nhật ký của video này"
          disabled={live || !events.length}
          onClick={async () => {
            if (!window.confirm('Xoá toàn bộ nhật ký của video này?')) return
            await window.studio.runlogClear(runId)
            offset.current = 0
            setEvents([])
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button className="no-drag rounded-lg p-1.5 text-ink-800/45 hover:bg-black/5 hover:text-ink-900" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-black/6 px-4 py-2">
        {(
          [
            ['all', `Tất cả (${events.length})`],
            ['ai', `Gọi AI (${nAi})`],
            ['problem', `Cảnh báo / lỗi (${nProblem})`]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={cn(
              'no-drag rounded-lg px-2.5 py-1 text-[12px] font-medium transition',
              filter === id ? 'bg-brand-500/12 text-brand-700' : 'text-ink-800/50 hover:bg-black/5'
            )}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
        <button
          className={cn(
            'no-drag ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] transition',
            follow ? 'text-brand-700' : 'text-ink-800/40 hover:bg-black/5'
          )}
          title="Tự cuộn xuống sự kiện mới nhất"
          onClick={() => setFollow((f) => !f)}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" /> Tự cuộn
        </button>
      </div>

      <div
        ref={scroller}
        className="relative min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-6 pt-1"
        onWheel={(e) => {
          // cuon len de doc -> ngung tu cuon
          if (e.deltaY < 0 && follow) setFollow(false)
        }}
      >
        {!events.length ? (
          <div className="py-16 text-center text-[13px] leading-relaxed text-ink-800/45">
            Chưa có nhật ký cho video này.
            <br />
            Bấm chạy một bước (Hiểu nguồn, Plan, Dựng…) là các sự kiện sẽ hiện ở đây theo thời gian thực.
          </div>
        ) : (
          shown.map((r) =>
            r.type === 'ai' ? (
              <AiCard key={r.call.id} row={r} live={live} />
            ) : (
              <EventRow key={r.ev.id} ev={r.ev} />
            )
          )
        )}
      </div>
    </div>
  )
}
