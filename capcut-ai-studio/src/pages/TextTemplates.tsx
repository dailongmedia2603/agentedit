import { useMemo, useRef, useState, useEffect } from 'react'
import { AlertTriangle, FolderOpen, Info, Play, RefreshCw, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, Spinner } from '@/components/ui/primitives'
import { useLibrarySync } from '../lib/useLibrarySync'
import { fileUrl } from '../lib/platform'

/** Nhan AI co the la chuoi hoac mang tuy prompt dang dung -> luon ve chuoi de hien/sua */
function txt(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join('; ')
  return String(v)
}

const ENERGY_LABEL: Record<string, string> = { nhe: 'nhẹ', vua: 'vừa', manh: 'mạnh' }

function energyTone(e?: string): 'ok' | 'warn' | 'fail' | 'neutral' {
  if (e === 'manh') return 'fail'
  if (e === 'vua') return 'warn'
  if (e === 'nhe') return 'ok'
  return 'neutral'
}

interface Draft {
  use_when: string
  avoid_when: string
  tags: string
}

export default function TextTemplatesPage() {
  const [templates, setTemplates] = useState<TextTemplateItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<TextTemplateItem | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ use_when: '', avoid_when: '', tags: '' })
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const load = async () => {
    const r = await window.studio.textList()
    if (r.ok) setTemplates(r.templates || [])
  }
  useEffect(() => {
    load()
  }, [])

  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const bgSync = useLibrarySync(load)
  const syncBusy = syncing || bgSync

  const doSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await window.studio.syncLibrary()
      if (!r.ok) {
        setSyncMsg('Đồng bộ lỗi: ' + (r.error || 'không rõ'))
      } else {
        await load()
        const t = r.texts || { added: 0, updated: 0, total: 0, errors: [] }
        setSyncMsg(
          `Đã đồng bộ kho: +${t.added} mới, ${t.updated} cập nhật (tổng ${t.total})` +
            (t.errors && t.errors.length ? ` · ${t.errors.length} lỗi tải` : '')
        )
      }
    } catch (e) {
      setSyncMsg('Đồng bộ lỗi: ' + String(e))
    } finally {
      setSyncing(false)
    }
  }

  const unlabeled = useMemo(() => templates.filter((t) => t.labeled_by !== 'gemini'), [templates])

  const addFromFolder = async () => {
    const picked = await window.studio.pickFolder('Chọn thư mục mẫu (chứa template.json)')
    if (picked.canceled || !picked.filePaths?.length) return
    setBusy('register')
    setMsg('Đang đọc thư mục mẫu…')
    const r = await window.studio.textRegister(picked.filePaths[0])
    setBusy(null)
    setMsg(r.ok ? `Đã thêm mẫu: ${r.template?.name}` : `Lỗi: ${r.error}`)
    load()
  }

  const label = async (id: string) => {
    setBusy(id)
    setMsg('Đang cho AI xem preview…')
    const r = await window.studio.textLabel(id)
    setBusy(null)
    setMsg(r.ok ? `Đã gắn nhãn: ${r.template?.name}` : `Lỗi: ${r.error}`)
    load()
  }

  const labelAll = async () => {
    for (const t of unlabeled) {
      setBusy(t.id)
      setMsg(`Đang cho AI xem: ${t.name}…`)
      await window.studio.textLabel(t.id)
      await load()
    }
    setBusy(null)
    setMsg('Đã gắn nhãn xong toàn bộ')
  }

  const save = async (id: string) => {
    await window.studio.textUpdate({
      id,
      use_when: draft.use_when,
      avoid_when: draft.avoid_when
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      tags: draft.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    })
    setEditing(null)
    load()
  }

  const remove = async (id: string) => {
    await window.studio.textDelete(id)
    load()
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Kho Text (mẫu chữ động)</h1>
          <p className="mt-1 text-sm text-ink-800/50">
            Mẫu hoạt cảnh chữ chuyển từ preset CapCut — AI chọn mẫu rồi điền lời thoại thật của video vào.
          </p>
          {syncMsg && <p className="mt-1 text-xs text-brand-600">{syncMsg}</p>}
        </div>
        <Button variant="outline" onClick={doSync} disabled={syncBusy} className="shrink-0">
          {syncBusy ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {syncBusy ? 'Đang đồng bộ…' : 'Đồng bộ kho'}
        </Button>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50/40 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-[13px] leading-relaxed text-ink-800/70">
          Chữ hiện trong các mẫu dưới đây <b>chỉ là chữ mẫu</b> — minh hoạ bố cục/hoạt cảnh, KHÔNG bao giờ
          dùng nguyên văn trong video thật. Khi một mẫu được dùng, từng ô chữ (slot) sẽ được điền đúng lời
          nói thật của video đó.
        </p>
      </div>

      <Card className="mt-5">
        <CardHeader className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-brand-500" />
          <span className="text-sm font-semibold text-ink-900">Thêm mẫu từ thư mục</span>
          <Button variant="outline" className="ml-auto" onClick={addFromFolder} disabled={!!busy}>
            {busy === 'register' ? <Spinner className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
            Chọn thư mục mẫu…
          </Button>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-[12px] text-ink-800/50">
            Thư mục phải chứa <code className="rounded bg-black/5 px-1">template.json</code> (+ preview.mp4,
            fonts/, audio/, assets/ nếu có). Hệ thống đọc rồi thêm vào kho — thư mục con được giữ nguyên tên
            làm mã mẫu.
          </p>
          <div className="flex items-center gap-2">
            {!!unlabeled.length && (
              <Button variant="outline" onClick={labelAll} disabled={!!busy}>
                <Wand2 className="h-4 w-4" /> Nhờ AI xem {unlabeled.length} mẫu chưa gắn nhãn
              </Button>
            )}
            {msg && <span className="text-[12px] text-ink-800/55">{msg}</span>}
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold text-ink-900">Kho của bạn ({templates.length})</h2>
        <span className="text-[12px] text-ink-800/40">
          AI <b>không xem được hoạt cảnh</b> — nó chọn mẫu hoàn toàn dựa trên mô tả "Dùng khi" + phong cách.
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardBody className="space-y-3 pt-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                {t.preview && (
                  <button
                    className="flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                    onClick={() => setPreview(preview?.id === t.id ? null : t)}
                  >
                    <Play className="h-3 w-3" /> {preview?.id === t.id ? 'Ẩn' : 'Xem'}
                  </button>
                )}
                <span className="font-medium text-ink-900">{t.name}</span>
                {t.energy && <Badge tone={energyTone(t.energy)}>mức {ENERGY_LABEL[t.energy] || t.energy}</Badge>}
                <span className="text-[11px] text-ink-800/40">
                  {t.duration?.toFixed?.(1) ?? t.duration}s
                  {t.width && t.height && <> · {t.height > t.width ? 'dọc' : 'ngang'}</>}
                  {' · '}
                  {t.slots?.length || 0} ô chữ
                </span>
                <Badge tone={t.labeled_by === 'gemini' ? 'ok' : 'neutral'} className="ml-auto">
                  {t.labeled_by === 'gemini' ? 'AI đã xem' : 'chưa gắn nhãn'}
                </Badge>
                <button
                  title={
                    t.labeled_by === 'gemini'
                      ? 'Nhờ AI xem lại preview và viết mô tả mới'
                      : 'Nhờ AI xem preview rồi tự viết mô tả'
                  }
                  className="text-brand-600 hover:text-brand-700 disabled:opacity-40"
                  onClick={() => label(t.id)}
                  disabled={!!busy}
                >
                  {busy === t.id ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                </button>
                <button className="text-ink-800/30 hover:text-red-500" onClick={() => remove(t.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {!!t.slots?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {t.slots.map((s) => (
                    <span
                      key={s.id}
                      className="rounded-lg border border-ink-200/50 bg-white/60 px-2 py-1 text-[11px] text-ink-800/60"
                      title={s.role || ''}
                    >
                      {s.role && <b className="text-ink-800/75">{s.role}: </b>}
                      <span className="italic">"{s.sample || '(trống)'}"</span>{' '}
                      <span className="text-ink-800/35">(chữ mẫu)</span>
                    </span>
                  ))}
                </div>
              )}

              {editing === t.id ? (
                <div className="space-y-1.5">
                  <textarea
                    className="h-14 w-full resize-none rounded-lg border border-ink-200/50 bg-white/60 px-2 py-1 text-[12px]"
                    value={draft.use_when}
                    onChange={(e) => setDraft({ ...draft, use_when: e.target.value })}
                    placeholder="Dùng khi… (mô tả PHONG CÁCH/NHỊP cần, không theo nghĩa chữ mẫu)"
                  />
                  <input
                    className="w-full rounded-lg border border-ink-200/50 bg-white/60 px-2 py-1 text-[12px]"
                    value={draft.avoid_when}
                    onChange={(e) => setDraft({ ...draft, avoid_when: e.target.value })}
                    placeholder="Tránh khi… (cách nhau bằng dấu phẩy)"
                  />
                  <input
                    className="w-full rounded-lg border border-ink-200/50 bg-white/60 px-2 py-1 text-[12px]"
                    value={draft.tags}
                    onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                    placeholder="từ khoá, cách nhau bằng dấu phẩy"
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => save(t.id)}>Lưu</Button>
                    <Button variant="outline" onClick={() => setEditing(null)}>
                      Huỷ
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="block w-full space-y-1.5 text-left text-[12px] leading-relaxed text-ink-800/55 hover:text-ink-800/80"
                  onClick={() => {
                    setEditing(t.id)
                    setDraft({
                      use_when: txt(t.use_when),
                      avoid_when: (t.avoid_when || []).join(', '),
                      tags: (t.tags || []).join(', ')
                    })
                  }}
                >
                  {(t.style || t.mood || t.motion) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.style && <Badge tone="neutral">{txt(t.style)}</Badge>}
                      {t.mood && <Badge tone="neutral">{txt(t.mood)}</Badge>}
                    </div>
                  )}
                  {t.summary && <div className="text-ink-800/70">{txt(t.summary)}</div>}
                  <div>
                    <b className="text-ink-800/70">Dùng khi:</b> {txt(t.use_when) || '(chưa có mô tả)'}
                  </div>
                  {!!t.avoid_when?.length && (
                    <div>
                      <b className="text-ink-800/70">Tránh khi:</b> {txt(t.avoid_when)}
                    </div>
                  )}
                  {!!t.best_for?.length && (
                    <div className="text-ink-800/50">Hợp dùng: {txt(t.best_for)}</div>
                  )}
                  {!!t.tags?.length && <div className="text-ink-800/35">{t.tags.join(' · ')}</div>}
                </button>
              )}

              {preview?.id === t.id && t.preview && (
                <video
                  ref={videoRef}
                  className="max-h-64 rounded-lg bg-black"
                  src={fileUrl(`${t.dir}/${t.preview}`)}
                  controls
                  autoPlay
                />
              )}
            </CardBody>
          </Card>
        ))}
        {!templates.length && (
          <div className="flex items-start gap-2 rounded-xl border border-ink-200/40 bg-white/40 px-4 py-6 text-center">
            <Info className="mx-auto h-4 w-4 text-ink-800/30" />
            <p className="w-full text-sm text-ink-800/40">
              Kho còn trống — bấm "Đồng bộ kho" hoặc "Chọn thư mục mẫu…" ở trên để thêm mẫu chữ.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
