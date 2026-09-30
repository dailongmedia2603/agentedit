import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FolderInput, Sparkles, Trash2, Info, Wand2 } from 'lucide-react'
import { Button, Card, CardBody, CardHeader, Spinner, Badge } from '@/components/ui/primitives'

const EMOTIONS = ['punch', 'positive', 'negative', 'nostalgic', 'soft', 'neutral']

function emoTone(e: string): 'ok' | 'warn' | 'fail' | 'brand' | 'neutral' {
  if (e === 'positive') return 'ok'
  if (e === 'negative') return 'fail'
  if (e === 'punch') return 'warn'
  if (e === 'soft' || e === 'nostalgic') return 'brand'
  return 'neutral'
}

/** Nhan AI co the la chuoi hoac mang tuy prompt dang dung -> luon ve chuoi de hien/sua */
function txt(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join('; ')
  return String(v)
}

export default function MemesPage() {
  const [memes, setMemes] = useState<MemeItem[]>([])
  const [urls, setUrls] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; use_when: string; tags: string }>({
    name: '',
    use_when: '',
    tags: ''
  })
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [preview, setPreview] = useState<MemeItem | null>(null)

  const load = async () => {
    const r = await window.studio.memeList()
    if (r.ok) setMemes(r.memes || [])
  }
  useEffect(() => {
    load()
  }, [])

  const unlabeled = useMemo(() => memes.filter((m) => m.labeled_by !== 'gemini'), [memes])

  const addUrls = async () => {
    const list = urls
      .split(/[\s,]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'))
    if (!list.length) return
    setBusy('fetch')
    setMsg(`Đang tải ${list.length} clip…`)
    const r = await window.studio.memeFetch({ urls: list })
    setBusy(null)
    if (!r.ok) {
      setMsg(`Lỗi: ${r.error}`)
      return
    }
    const fails = r.failed || []
    setMsg(
      `Đã thêm ${r.added?.length ?? 0} clip` +
        (fails.length ? ` · ${fails.length} lỗi: ${fails[0].error}` : '')
    )
    setUrls('')
    load()
  }

  const importLocal = async () => {
    const picked = await window.studio.pickVideo()
    if (picked.canceled || !picked.filePaths?.length) return
    setBusy('import')
    const r = await window.studio.memeImport({ paths: picked.filePaths })
    setBusy(null)
    setMsg(r.ok ? `Đã thêm ${r.added?.length ?? 0} clip` : `Lỗi: ${r.error}`)
    load()
  }

  const label = async (id: string) => {
    setBusy(id)
    setMsg('Đang cho AI xem clip…')
    const r = await window.studio.memeLabel(id)
    setBusy(null)
    setMsg(r.ok ? `Đã gắn nhãn: ${r.meme?.name}` : `Lỗi: ${r.error}`)
    load()
  }

  const labelAll = async () => {
    for (const m of unlabeled) {
      setBusy(m.id)
      setMsg(`Đang cho AI xem: ${m.name}…`)
      await window.studio.memeLabel(m.id)
      await load()
    }
    setBusy(null)
    setMsg('Đã gắn nhãn xong toàn bộ')
  }

  const save = async (id: string) => {
    await window.studio.memeUpdate({
      id,
      name: draft.name,
      use_when: draft.use_when,
      tags: draft.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    })
    setEditing(null)
    load()
  }

  const remove = async (id: string) => {
    await window.studio.memeDelete(id)
    load()
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-3xl font-bold text-ink-900">Kho meme (b-roll chèn)</h1>
      <p className="mt-1 text-sm text-ink-800/50">
        Clip ngắn để AI chèn đè lên video chính 1-2 giây, minh hoạ đúng lúc người nói nhắc tới.
      </p>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50/40 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-[13px] leading-relaxed text-ink-800/70">
          Clip tải từ YouTube là nội dung của người khác — <b>chỉ dùng cho nội dung cá nhân/meme</b>.
          Cân nhắc khi monetize. Clip bị giới hạn độ tuổi sẽ không tải được.
        </p>
      </div>

      <Card className="mt-5">
        <CardHeader className="flex items-center gap-2">
          <Download className="h-4 w-4 text-brand-500" />
          <span className="text-sm font-semibold text-ink-900">Thêm clip</span>
          <Button variant="outline" className="ml-auto" onClick={importLocal} disabled={!!busy}>
            <FolderInput className="h-4 w-4" /> Import file có sẵn
          </Button>
        </CardHeader>
        <CardBody className="space-y-2">
          <textarea
            className="h-20 w-full resize-none rounded-lg border border-ink-200/50 bg-white/60 px-3 py-2 text-[13px] outline-none focus:border-brand-400"
            placeholder="Dán link YouTube, mỗi dòng một link (hoặc cách nhau bằng dấu cách)…"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button onClick={addUrls} disabled={!!busy || !urls.trim()}>
              {busy === 'fetch' ? <Spinner /> : <Download className="h-4 w-4" />} Tải về kho
            </Button>
            {!!unlabeled.length && (
              <Button variant="outline" onClick={labelAll} disabled={!!busy}>
                <Wand2 className="h-4 w-4" /> Nhờ AI xem {unlabeled.length} clip chưa gắn nhãn
              </Button>
            )}
            {msg && <span className="text-[12px] text-ink-800/55">{msg}</span>}
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold text-ink-900">Kho của bạn ({memes.length})</h2>
        <span className="text-[12px] text-ink-800/40">
          AI <b>không xem được clip</b> — nó chọn hoàn toàn dựa trên mô tả "Dùng khi". Mô tả tốt thì
          meme vào đúng chỗ.
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {memes.map((m) => (
          <Card key={m.id}>
            <CardBody className="space-y-3 pt-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <button
                  className="rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                  onClick={() => setPreview(preview?.id === m.id ? null : m)}
                >
                  {preview?.id === m.id ? 'Ẩn' : 'Xem'}
                </button>
                <span className="font-medium text-ink-900">{m.name}</span>
                <Badge tone={emoTone(m.emotion)}>{m.emotion}</Badge>
                <span className="text-[11px] text-ink-800/40">
                  {m.duration?.toFixed(1)}s
                  {m.best_start !== undefined && (
                    <> · dùng đoạn {m.best_start?.toFixed(1)}–{m.best_end?.toFixed(1)}s</>
                  )}
                  {m.width && m.height && (
                    <> · {(m.height ?? 0) > (m.width ?? 0) ? 'dọc' : 'ngang'}</>
                  )}
                  {m.keep_audio ? ' · giữ tiếng' : ' · tắt tiếng'}
                </span>
                <Badge tone={m.labeled_by === 'gemini' ? 'ok' : 'neutral'} className="ml-auto">
                  {m.labeled_by === 'gemini' ? 'AI đã xem' : 'đoán từ tên'}
                </Badge>
                <select
                  className="rounded-lg border border-ink-200/50 bg-white/70 px-2 py-1 text-[12px]"
                  value={m.emotion}
                  onChange={async (e) => {
                    await window.studio.memeUpdate({ id: m.id, emotion: e.target.value })
                    load()
                  }}
                >
                  {EMOTIONS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <button
                  title={
                    m.labeled_by === 'gemini'
                      ? 'Nhờ AI xem lại clip và viết mô tả mới'
                      : 'Nhờ AI xem clip rồi tự viết mô tả'
                  }
                  className="text-brand-600 hover:text-brand-700 disabled:opacity-40"
                  onClick={() => label(m.id)}
                  disabled={!!busy}
                >
                  {busy === m.id ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                </button>
                <button className="text-ink-800/30 hover:text-red-500" onClick={() => remove(m.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {editing === m.id ? (
                <div className="space-y-1.5">
                  <input
                    className="w-full rounded-lg border border-ink-200/50 bg-white/60 px-2 py-1 text-[12px]"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Tên gợi nhớ"
                  />
                  <textarea
                    className="h-14 w-full resize-none rounded-lg border border-ink-200/50 bg-white/60 px-2 py-1 text-[12px]"
                    value={draft.use_when}
                    onChange={(e) => setDraft({ ...draft, use_when: e.target.value })}
                    placeholder="Dùng khi… (mô tả TÌNH HUỐNG trong lời nói, không mô tả hình ảnh)"
                  />
                  <input
                    className="w-full rounded-lg border border-ink-200/50 bg-white/60 px-2 py-1 text-[12px]"
                    value={draft.tags}
                    onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                    placeholder="từ khoá, cách nhau bằng dấu phẩy"
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => save(m.id)}>Lưu</Button>
                    <Button variant="outline" onClick={() => setEditing(null)}>
                      Huỷ
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="block w-full space-y-1.5 text-left text-[12px] leading-relaxed text-ink-800/55 hover:text-ink-800/80"
                  onClick={() => {
                    setEditing(m.id)
                    setDraft({
                      name: m.name,
                      use_when: txt(m.use_when),
                      tags: (m.tags || []).join(', ')
                    })
                  }}
                >
                  {(m.reaction || m.role || m.intensity) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {m.reaction && <span className="font-medium text-ink-800/75">“{txt(m.reaction)}”</span>}
                      {m.role && <Badge tone="neutral">{txt(m.role)}</Badge>}
                      {m.intensity && <Badge tone="neutral">mức {txt(m.intensity)}</Badge>}
                    </div>
                  )}
                  <div>
                    <b className="text-ink-800/70">Dùng khi:</b> {txt(m.use_when) || '(chưa có mô tả)'}
                  </div>
                  {!!m.avoid_when?.length && (
                    <div>
                      <b className="text-ink-800/70">Tránh khi:</b> {txt(m.avoid_when)}
                    </div>
                  )}
                  {!!m.tags?.length && <div className="text-ink-800/35">{m.tags.join(' · ')}</div>}
                </button>
              )}

              {preview?.id === m.id && (
                <video
                  ref={videoRef}
                  className="max-h-64 rounded-lg bg-black"
                  src={`file://${m.file}`}
                  controls
                  autoPlay
                />
              )}
            </CardBody>
          </Card>
        ))}
        {!memes.length && (
          <p className="py-10 text-center text-sm text-ink-800/40">
            Kho còn trống — dán link YouTube ở trên để thêm clip.
          </p>
        )}
      </div>
    </div>
  )
}
