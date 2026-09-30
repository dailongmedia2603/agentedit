import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpenText,
  ChevronDown,
  Cog,
  Eye,
  EyeOff,
  Info,
  MessageSquareCode,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Undo2,
  Workflow,
  CheckCircle2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import { Button, Card, Spinner, Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

type TabId = 'prompts' | 'refs' | 'rules' | 'mechanisms'
type Kind = 'prompt' | 'ref'

const TABS: { id: TabId; label: string; icon: typeof Info; info: string }[] = [
  {
    id: 'prompts',
    label: 'Prompt AI',
    icon: MessageSquareCode,
    info: 'Lời dặn (system prompt) gửi cho Gemini và GPT ở từng bước. Đây là thứ quyết định AI hiểu nhiệm vụ thế nào và trả về dữ liệu gì.'
  },
  {
    id: 'refs',
    label: 'Tài liệu kiến thức',
    icon: BookOpenText,
    info: 'Các tài liệu dài được chèn vào prompt (ngôn ngữ dựng Remotion, thuật ngữ edit).'
  },
  {
    id: 'rules',
    label: 'Thông số quy tắc',
    icon: SlidersHorizontal,
    info: 'Các con số mà lớp bảo vệ plan (chạy bằng code, không gọi AI) dùng để tự sửa plan: độ dài hook, số SFX/meme, âm lượng, thời lượng chữ…'
  },
  {
    id: 'mechanisms',
    label: 'Cơ chế',
    icon: Workflow,
    info: 'Giải thích cách hệ thống vận hành (luồng bước, luồng thông tin, lớp bảo vệ, cache). Chỉ để xem.'
  }
]

/** Nut "i" — di chuot hoac bam de xem giai thich */
function InfoTip({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!pinned) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPinned(false)
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [pinned])

  return (
    <span
      ref={ref}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
    >
      <button
        type="button"
        aria-label="Giải thích"
        className={cn(
          'no-drag flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[11px] font-bold italic leading-none transition',
          open
            ? 'border-brand-500 bg-brand-500 text-white'
            : 'border-ink-800/25 text-ink-800/50 hover:border-brand-400 hover:text-brand-600'
        )}
        onClick={(e) => {
          e.stopPropagation()
          setPinned((p) => !p)
          setOpen(true)
        }}
      >
        i
      </button>
      {open && (
        <span
          className="absolute left-1/2 top-6 z-50 w-[320px] -translate-x-1/2 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-left text-[12.5px] font-normal not-italic leading-relaxed text-ink-800/80 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.3)]"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </span>
      )}
    </span>
  )
}

function errText(r: { ok: boolean; error?: string } | undefined) {
  return (r?.error || 'Không rõ lỗi').replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/* ------------------------------------------------------------------ */
/* Muc prompt / tai lieu                                                */
/* ------------------------------------------------------------------ */
function TextItemCard({
  item,
  kind,
  draft,
  onDraft,
  onSave,
  onReset,
  busy
}: {
  item: PromptTextItem
  kind: Kind
  draft: string | undefined
  onDraft: (v: string | undefined) => void
  onSave: () => void
  onReset: () => void
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [showDefault, setShowDefault] = useState(false)
  const value = draft ?? item.value
  const dirty = draft !== undefined && draft !== item.value
  const missingPh = (item.template || []).filter((p) => !value.includes(`{${p}}`))

  return (
    <div className={cn('card-surface rounded-2xl', dirty && 'ring-2 ring-brand-400/40')}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}
        className="no-drag flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-900">{item.title}</span>
            <InfoTip text={item.info} />
            {item.overridden && <Badge tone="brand">Đã sửa</Badge>}
            {dirty && <Badge tone="warn">Chưa lưu</Badge>}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-ink-800/45">Dùng ở: {item.used_in}</div>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-800/35">
          {value.length.toLocaleString('vi-VN')} ký tự
        </span>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-ink-800/40 transition-transform', open && 'rotate-180')} />
      </div>

      {open && (
        <div className="space-y-3 border-t border-black/6 px-5 py-4">
          {!!item.template?.length && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]',
                missingPh.length ? 'bg-red-500/8 text-red-700' : 'bg-brand-500/8 text-brand-800'
              )}
            >
              {missingPh.length ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>
                Bắt buộc giữ nguyên:{' '}
                {item.template.map((p) => (
                  <code key={p} className="mx-0.5 rounded bg-white/70 px-1 font-mono">{`{${p}}`}</code>
                ))}{' '}
                — hệ thống chèn tài liệu vào đúng chỗ này khi chạy.
                {!!missingPh.length && <b> Đang thiếu: {missingPh.map((p) => `{${p}}`).join(', ')}</b>}
              </span>
            </div>
          )}

          <textarea
            spellCheck={false}
            className="no-drag h-[420px] w-full resize-y rounded-xl border border-black/10 bg-ink-50 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
            value={value}
            onChange={(e) => onDraft(e.target.value)}
          />

          {showDefault && (
            <div>
              <div className="mb-1 text-[12px] font-medium text-ink-800/50">Bản gốc (chỉ xem)</div>
              <textarea
                readOnly
                spellCheck={false}
                className="h-[260px] w-full resize-y rounded-xl border border-dashed border-black/15 bg-white/60 px-3.5 py-3 font-mono text-[12px] leading-relaxed text-ink-800/60 outline-none"
                value={item.default}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onSave} disabled={!dirty || busy || !value.trim() || !!missingPh.length}>
              {busy ? <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />}
              Lưu
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDraft(undefined)} disabled={!dirty || busy}>
              <Undo2 className="h-4 w-4" /> Bỏ thay đổi
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowDefault((s) => !s)}>
              {showDefault ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showDefault ? 'Ẩn bản gốc' : 'Xem bản gốc'}
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              disabled={!item.overridden || busy}
              onClick={onReset}
              title={item.overridden ? 'Xoá bản đã sửa, dùng lại bản gốc' : 'Đang dùng bản gốc'}
            >
              <RotateCcw className="h-4 w-4" /> Khôi phục mặc định
            </Button>
          </div>
          <p className="text-[11.5px] text-ink-800/40">
            {kind === 'prompt'
              ? 'Lưu xong áp dụng ngay cho lần gọi AI tiếp theo — không cần khởi động lại app.'
              : 'Lưu xong áp dụng ngay cho lần lập plan tiếp theo. File gốc trong app không bị thay đổi.'}
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Trang                                                                */
/* ------------------------------------------------------------------ */
export default function PromptsPage() {
  const [data, setData] = useState<PromptsListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('prompts')
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = (r: PromptsListing, okText?: string) => {
    if (r.ok) {
      setData(r)
      if (okText) setMsg({ ok: true, text: okText })
    } else {
      setMsg({ ok: false, text: errText(r) })
    }
    return r.ok
  }

  const load = useCallback(async () => {
    setLoading(true)
    const r = await window.studio.promptsList()
    setLoading(false)
    if (r.ok) setData(r)
    else setMsg({ ok: false, text: 'Không tải được: ' + errText(r) })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const groupsById = useMemo(() => {
    const m: Record<string, PromptGroup> = {}
    for (const g of data?.groups || []) m[g.id] = g
    return m
  }, [data])

  const q = query.trim().toLowerCase()
  const match = (t: { title: string; info: string; id: string }) =>
    !q || t.title.toLowerCase().includes(q) || t.info.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)

  const draftKey = (kind: Kind, id: string) => `${kind}:${id}`

  const saveText = async (kind: Kind, item: PromptTextItem) => {
    const key = draftKey(kind, item.id)
    const value = drafts[key]
    if (value === undefined) return
    setBusy(key)
    const r = await window.studio.promptsSave({ kind, id: item.id, value })
    setBusy(null)
    if (apply(r, `Đã lưu "${item.title}" — áp dụng từ lần chạy tiếp theo.`)) {
      setDrafts((d) => {
        const n = { ...d }
        delete n[key]
        return n
      })
    }
  }

  const resetText = async (kind: Kind, item: PromptTextItem) => {
    if (!window.confirm(`Khôi phục "${item.title}" về bản gốc? Nội dung bạn đã sửa sẽ bị xoá.`)) return
    const key = draftKey(kind, item.id)
    setBusy(key)
    const r = await window.studio.promptsReset({ kind, id: item.id })
    setBusy(null)
    if (apply(r, `Đã khôi phục "${item.title}" về bản gốc.`)) {
      setDrafts((d) => {
        const n = { ...d }
        delete n[key]
        return n
      })
    }
  }

  const setDraft = (kind: Kind, id: string, v: string | undefined) =>
    setDrafts((d) => {
      const n = { ...d }
      if (v === undefined) delete n[draftKey(kind, id)]
      else n[draftKey(kind, id)] = v
      return n
    })

  // ---- thong so
  const rules = data?.rules || []
  const dirtyRules = rules.filter((r) => ruleDrafts[r.id] !== undefined && ruleDrafts[r.id] !== String(r.value))
  const ruleError = (r: PromptRuleItem): string | null => {
    const raw = ruleDrafts[r.id]
    if (raw === undefined) return null
    if (raw.trim() === '') return 'Chưa nhập'
    const v = Number(raw.replace(',', '.'))
    if (!Number.isFinite(v)) return 'Phải là số'
    if (r.integer && !Number.isInteger(v)) return 'Phải là số nguyên'
    if (v < r.min || v > r.max) return `Trong khoảng ${r.min} – ${r.max}`
    return null
  }
  const anyRuleError = dirtyRules.some((r) => ruleError(r))

  const saveRules = async () => {
    const values: Record<string, number> = {}
    for (const r of dirtyRules) values[r.id] = Number(ruleDrafts[r.id].replace(',', '.'))
    setBusy('rules')
    const r = await window.studio.promptsSave({ kind: 'rules', values })
    setBusy(null)
    if (apply(r, `Đã lưu ${dirtyRules.length} thông số — áp dụng từ lần lập plan / dựng bản xem trước tiếp theo.`)) {
      setRuleDrafts({})
    }
  }

  const resetRule = async (r: PromptRuleItem) => {
    setBusy('rule:' + r.id)
    const res = await window.studio.promptsReset({ kind: 'rule', id: r.id })
    setBusy(null)
    if (apply(res, `Đã khôi phục "${r.title}" về ${r.default}.`)) {
      setRuleDrafts((d) => {
        const n = { ...d }
        delete n[r.id]
        return n
      })
    }
  }

  const unsavedText = Object.keys(drafts).length
  const unsavedCount = unsavedText + dirtyRules.length

  const countOverridden = (tid: TabId) => {
    if (!data) return 0
    if (tid === 'prompts') return (data.prompts || []).filter((p) => p.overridden).length
    if (tid === 'refs') return (data.refs || []).filter((p) => p.overridden).length
    if (tid === 'rules') return rules.filter((p) => p.overridden).length
    return 0
  }

  const renderTextList = (kind: Kind, items: PromptTextItem[]) => {
    const shown = items.filter(match)
    const order: string[] = []
    for (const it of shown) if (!order.includes(it.group)) order.push(it.group)
    if (!shown.length) return <Empty />
    return order.map((gid) => (
      <section key={gid} className="space-y-2.5">
        <GroupHeader group={groupsById[gid]} />
        {shown
          .filter((it) => it.group === gid)
          .map((it) => (
            <TextItemCard
              key={it.id}
              item={it}
              kind={kind}
              draft={drafts[draftKey(kind, it.id)]}
              onDraft={(v) => setDraft(kind, it.id, v)}
              onSave={() => saveText(kind, it)}
              onReset={() => resetText(kind, it)}
              busy={busy === draftKey(kind, it.id)}
            />
          ))}
      </section>
    ))
  }

  const renderRules = () => {
    const shown = rules.filter(match)
    const order: string[] = []
    for (const it of shown) if (!order.includes(it.group)) order.push(it.group)
    if (!shown.length) return <Empty />
    return order.map((gid) => (
      <section key={gid} className="space-y-2.5">
        <GroupHeader group={groupsById[gid]} />
        <Card className="divide-y divide-black/6">
          {shown
            .filter((r) => r.group === gid)
            .map((r) => {
              const raw = ruleDrafts[r.id]
              const dirty = raw !== undefined && raw !== String(r.value)
              const e = ruleError(r)
              return (
                <div key={r.id} className={cn('flex items-center gap-4 px-5 py-3', dirty && 'bg-brand-50/60')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium text-ink-900">{r.title}</span>
                      <InfoTip text={r.info} />
                      {r.overridden && <Badge tone="brand">Đã sửa</Badge>}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-800/40">
                      Mặc định: {r.default}
                      {r.unit && ` ${r.unit}`} · cho phép {r.min} – {r.max}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        className={cn(
                          'no-drag h-9 w-24 rounded-lg border bg-ink-50 px-2.5 text-right text-sm tabular-nums text-ink-900 outline-none transition focus:bg-white focus:ring-2',
                          e
                            ? 'border-red-400 focus:ring-red-500/15'
                            : 'border-black/10 focus:border-brand-400 focus:ring-brand-500/15'
                        )}
                        value={raw ?? String(r.value)}
                        onChange={(ev) => setRuleDrafts((d) => ({ ...d, [r.id]: ev.target.value }))}
                      />
                      <span className="w-12 text-[12px] text-ink-800/45">{r.unit}</span>
                      <button
                        className="no-drag rounded-lg p-1.5 text-ink-800/40 transition hover:bg-black/5 hover:text-ink-900 disabled:opacity-30"
                        title="Khôi phục mặc định"
                        disabled={!r.overridden || busy !== null}
                        onClick={() => resetRule(r)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                    {e && <span className="mt-1 text-[11px] text-red-600">{e}</span>}
                  </div>
                </div>
              )
            })}
        </Card>
      </section>
    ))
  }

  const renderMechanisms = () =>
    (data?.mechanisms || []).filter(match).map((m) => (
      <Card key={m.id} className="px-5 py-4">
        <div className="flex items-center gap-2">
          <Cog className="h-4 w-4 text-brand-500" />
          <span className="text-sm font-semibold text-ink-900">{m.title}</span>
          <InfoTip text={m.info} />
          <Badge tone="neutral" className="ml-auto">
            Chỉ xem
          </Badge>
        </div>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-ink-50 px-4 py-3 font-sans text-[13px] leading-relaxed text-ink-800/80">
          {m.body}
        </pre>
      </Card>
    ))

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-ink-900">Prompt &amp; quy tắc</h1>
          <p className="mt-1 text-sm text-ink-800/50">
            Xem và chỉnh toàn bộ lời dặn AI, tài liệu kiến thức và thông số mà hệ thống dùng để tạo video.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Tải lại
        </Button>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-brand-300/40 bg-brand-50/50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <p className="text-[13px] leading-relaxed text-ink-800/70">
          Bấm <b>Lưu</b> là áp dụng ngay cho lần chạy tiếp theo, không cần khởi động lại. Các bước lập plan sẽ tự chạy
          lại với nội dung mới (không dùng kết quả cũ trong bộ nhớ đệm). Muốn quay lại như ban đầu, bấm{' '}
          <b>Khôi phục mặc định</b>. Lưu ý: <b>giữ nguyên định dạng JSON</b> mà prompt yêu cầu AI trả về — đổi tên
          trường sẽ khiến bước sau không đọc được kết quả.
          {data?.path && (
            <span className="mt-1 block text-[11.5px] text-ink-800/40">
              Nơi lưu: <code className="font-mono">{data.path}</code>
            </span>
          )}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const Icon = t.icon
          const n = countOverridden(t.id)
          return (
            <div
              key={t.id}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition',
                tab === t.id
                  ? 'bg-brand-500/10 text-brand-700 shadow-[inset_0_0_0_1px_rgba(255,122,26,0.2)]'
                  : 'text-ink-800/55 hover:bg-black/[0.04] hover:text-ink-900'
              )}
            >
              <button className="no-drag flex items-center gap-2" onClick={() => setTab(t.id)}>
                <Icon className="h-4 w-4" />
                {t.label}
                {n > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[10.5px] text-white">{n}</span>}
              </button>
              <InfoTip text={t.info} />
            </div>
          )
        })}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-800/35" />
          <input
            className="no-drag h-9 w-56 rounded-xl border border-black/10 bg-white/70 pl-9 pr-3 text-[13px] outline-none focus:border-brand-400"
            placeholder="Tìm theo tên…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {msg && (
        <div
          className={cn(
            'mt-4 flex items-start gap-2 rounded-xl px-4 py-2.5 text-[13px]',
            msg.ok ? 'bg-emerald-500/10 text-emerald-800' : 'bg-red-500/10 text-red-700'
          )}
        >
          {msg.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{msg.text}</span>
          <button className="no-drag text-[12px] opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>
            Đóng
          </button>
        </div>
      )}

      <div className="mt-5 space-y-6">
        {loading && !data ? (
          <div className="flex items-center gap-2 py-16 text-sm text-ink-800/50">
            <Spinner /> Đang tải…
          </div>
        ) : !data ? null : tab === 'prompts' ? (
          renderTextList('prompt', data.prompts || [])
        ) : tab === 'refs' ? (
          renderTextList('ref', data.refs || [])
        ) : tab === 'rules' ? (
          renderRules()
        ) : (
          renderMechanisms()
        )}
      </div>

      {unsavedCount > 0 && (
        <div className="sticky bottom-5 z-40 mx-auto mt-6 flex w-fit items-center gap-3 rounded-2xl border border-black/10 bg-white/95 px-4 py-2.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-[13px] text-ink-800/80">
            {unsavedText > 0 && `${unsavedText} prompt/tài liệu chưa lưu`}
            {unsavedText > 0 && dirtyRules.length > 0 && ' · '}
            {dirtyRules.length > 0 && `${dirtyRules.length} thông số chưa lưu`}
          </span>
          {dirtyRules.length > 0 && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setRuleDrafts({})} disabled={busy === 'rules'}>
                Bỏ
              </Button>
              <Button size="sm" onClick={saveRules} disabled={anyRuleError || busy === 'rules'}>
                {busy === 'rules' ? (
                  <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Lưu thông số
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function GroupHeader({ group }: { group?: PromptGroup }) {
  if (!group) return null
  return (
    <div className="flex items-center gap-2 px-1 pt-1">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-800/45">{group.title}</span>
      <InfoTip text={group.info} />
    </div>
  )
}

function Empty() {
  return <div className="py-12 text-center text-sm text-ink-800/40">Không có mục nào khớp.</div>
}
