import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Trash2,
  Play,
  Pause,
  FolderUp,
  Music2,
  Info,
  Link2,
  Globe,
  Check,
  X,
  ShieldAlert,
  Sparkles,
  Wand2,
  Square,
  Mic,
  RefreshCw
} from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { MOD_KEY, fileUrl } from '../lib/platform'

const EMOTIONS = ['punch', 'positive', 'negative', 'nostalgic', 'soft', 'neutral']

// Doan truoc cam xuc tu ten de dropdown dien san (khop rule ben sidecar).
const GUESS: [string[], string][] = [
  [['boom', 'vine', 'bass', 'explos', 'bruh', 'dun dun', 'drama', 'impact', 'gun', 'punch', 'slap'], 'punch'],
  [['laugh', 'cricket', 'fart', 'meme', 'wow', 'huh', 'what'], 'punch'],
  [['ding', 'ting', 'bell', 'coin', 'cash', 'money', 'success', 'correct', 'level', 'win', 'tada', 'sparkle', 'magic', 'yay'], 'positive'],
  [['fail', 'wrong', 'buzzer', 'error', 'womp', 'sad', 'aww', 'oof'], 'negative'],
  [['retro', 'vhs', 'old', 'vintage', '8bit', '8-bit'], 'nostalgic'],
  [['whoosh', 'swoosh', 'swipe', 'transition', 'woosh'], 'neutral']
]

function guessEmotion(name: string): string {
  const n = (name || '').toLowerCase()
  for (const [keys, emo] of GUESS) if (keys.some((k) => n.includes(k))) return emo
  return 'neutral'
}

// So file gui Gemini moi luot — khop SFX_LABEL_BATCH ben sidecar (5 file ~ 1 phut qua Antigravity CLI)
const LABEL_BATCH = 5

/** 1 muc dang cho duyet: da tai ve may, chua ghi vao kho */
interface Pending extends StagedSfx {
  emotion: string
  picked: boolean
}

export default function SfxPage() {
  const [lib, setLib] = useState<SfxItem[]>([])
  const [links, setLinks] = useState('')
  const [fetching, setFetching] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])
  const [errors, setErrors] = useState<{ url: string; reason: string }[]>([])
  const [blocked, setBlocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Gemini nghe & gan nhan
  const [labeling, setLabeling] = useState<{ done: number; total: number; current: string[]; ids: string[] } | null>(null)
  const [labelMsg, setLabelMsg] = useState<string | null>(null)
  const [labelFails, setLabelFails] = useState<{ id: string; error: string }[]>([])
  const stopRef = useRef(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const loadLib = async () => {
    const r = await window.studio.sfxList()
    if (r.ok) setLib(r.sfx)
  }

  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const doSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await window.studio.syncLibrary()
      if (!r.ok) {
        setSyncMsg('Đồng bộ lỗi: ' + (r.error || 'không rõ'))
      } else {
        await loadLib()
        const s = r.sfx || { added: 0, updated: 0, total: 0, errors: [] }
        setSyncMsg(
          `Đã đồng bộ kho: +${s.added} mới, ${s.updated} cập nhật (tổng ${s.total})` +
            (s.errors && s.errors.length ? ` · ${s.errors.length} lỗi tải` : '')
        )
      }
    } catch (e) {
      setSyncMsg('Đồng bộ lỗi: ' + String(e))
    } finally {
      setSyncing(false)
    }
  }

  const addPending = (items: StagedSfx[]) =>
    setPending((prev) => {
      const seen = new Set(prev.map((p) => p.path))
      const add = items
        .filter((it) => !seen.has(it.path))
        .map((it) => ({ ...it, emotion: guessEmotion(it.name), picked: true }))
      return [...prev, ...add]
    })

  useEffect(() => {
    loadLib()
    // File user bam Download trong cua so Myinstants -> roi thang vao danh sach cho
    const off = window.studio.onSfxStaged((item) => addPending([item]))
    return () => {
      off()
      audioRef.current?.pause()
    }
  }, [])

  const play = (key: string, url: string) => {
    if (playing === key) {
      audioRef.current?.pause()
      setPlaying(null)
      return
    }
    audioRef.current?.pause()
    const a = new Audio(url)
    audioRef.current = a
    a.onended = () => setPlaying(null)
    a.play().catch(() => setPlaying(null))
    setPlaying(key)
  }

  const fetchLinks = async () => {
    const list = links
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!list.length) return
    setFetching(true)
    setErrors([])
    setBlocked(false)
    const r = await window.studio.sfxFetchLinks(list)
    setFetching(false)
    setBlocked(!!r.blocked)
    setErrors(r.failed || [])
    if (r.items?.length) {
      addPending(r.items)
      setLinks('')
    }
  }

  const openMyinstants = async () => {
    setBlocked(false)
    await window.studio.sfxOpenMyinstants()
  }

  const importLocal = async () => {
    const res = await window.studio.pickAudio()
    if (res.canceled || !res.filePaths?.length) return
    addPending(
      res.filePaths.map((p) => {
        const base = p.split(/[\\/]/).pop() || 'sfx'
        return {
          key: p,
          name: base.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
          path: p,
          pageUrl: '',
          bytes: 0
        }
      })
    )
  }

  const unlabeled = useMemo(() => lib.filter((e) => e.labeled_by !== 'gemini'), [lib])

  /** Gemini NGHE cac SFX theo nhom LABEL_BATCH; bam Dung thi het nhom dang chay moi dung */
  const labelIds = async (ids: string[]) => {
    if (!ids.length || labeling) return
    stopRef.current = false
    setLabelFails([])
    setLabelMsg(null)
    const names = new Map(lib.map((e) => [e.id, e.name]))
    const fails: { id: string; error: string }[] = []
    let ok = 0
    for (let i = 0; i < ids.length; i += LABEL_BATCH) {
      if (stopRef.current) break
      const chunk = ids.slice(i, i + LABEL_BATCH)
      setLabeling({ done: i, total: ids.length, current: chunk.map((id) => names.get(id) || id), ids: chunk })
      const r = await window.studio.sfxLabel(chunk)
      if (!r.ok) fails.push(...chunk.map((id) => ({ id, error: r.error || 'lỗi không rõ' })))
      else {
        ok += r.updated?.length ?? 0
        fails.push(...(r.failed || []))
      }
      await loadLib()
    }
    const stopped = stopRef.current
    setLabeling(null)
    setLabelFails(fails)
    setLabelMsg(
      `${stopped ? 'Đã dừng — ' : ''}Gemini đã nghe & gắn nhãn ${ok} âm thanh` +
        (fails.length ? ` · ${fails.length} lỗi` : '')
    )
  }

  const savePicked = async () => {
    const picked = pending.filter((p) => p.picked)
    if (!picked.length) return
    setSaving(true)
    const added: string[] = []
    for (const p of picked) {
      const r = await window.studio.sfxImportLocal({ path: p.path, name: p.name, emotion: p.emotion })
      if (r.ok && r.entry?.id) added.push(r.entry.id)
    }
    await window.studio.sfxDiscardStaged(picked.map((p) => p.path))
    setPending((prev) => prev.filter((p) => !p.picked))
    setSaving(false)
    await loadLib()
    // SFX moi: cho Gemini nghe luon de AI lap plan hieu dung (nhan doan tu ten thuong vo nghia)
    if (added.length && !labeling) labelIds(added)
  }

  const saveUseWhen = async (id: string) => {
    await window.studio.sfxUpdate({ id, use_when: draft.trim() })
    setEditing(null)
    loadLib()
  }

  // Bo 1 muc khoi danh sach cho + xoa luon file tam
  const drop = (item: Pending) => {
    if (playing === 'pd:' + item.key) {
      audioRef.current?.pause()
      setPlaying(null)
    }
    setPending((prev) => prev.filter((x) => x.key !== item.key))
    window.studio.sfxDiscardStaged([item.path])
  }

  const patch = (key: string, v: Partial<Pending>) =>
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...v } : p)))

  const changeEmotion = async (id: string, emotion: string) => {
    await window.studio.sfxUpdate({ id, emotion })
    loadLib()
  }

  const del = async (id: string) => {
    if (playing === 'lib:' + id) {
      audioRef.current?.pause()
      setPlaying(null)
    }
    await window.studio.sfxDelete(id)
    loadLib()
  }

  const pickedCount = pending.filter((p) => p.picked).length
  const selectCls =
    'no-drag h-7 rounded-lg border border-black/10 bg-white px-1.5 text-xs text-ink-800 focus:border-brand-400 focus:outline-none'

  return (
    <div className="w-full px-8 py-7">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Kho âm thanh (SFX)</h1>
          <p className="mt-1 text-sm text-ink-800/50">
            Tải SFX về kho để AI tự chèn vào video ở điểm nhấn (hook, câu chốt, chuyển cảnh, reveal).
          </p>
          {syncMsg && <p className="mt-1 text-xs text-brand-600">{syncMsg}</p>}
        </div>
        <Button variant="outline" onClick={doSync} disabled={syncing} className="shrink-0">
          {syncing ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? 'Đang đồng bộ…' : 'Đồng bộ kho'}
        </Button>
      </div>

      <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-50 p-3 text-xs text-amber-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Âm thanh từ Myinstants phần lớn có bản quyền — <b>chỉ dùng cho nội dung cá nhân/meme</b>. Cân nhắc khi
          monetize. Bạn có thể import file nhạc/SFX license sạch của riêng mình.
        </span>
      </div>

      {/* Nguon: dan link / duyet trong app / file may */}
      <Card className="mb-5">
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-900">Thêm âm thanh</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openMyinstants}>
              <Globe className="h-4 w-4" /> Mở Myinstants trong app
            </Button>
            <Button variant="outline" size="sm" onClick={importLocal}>
              <FolderUp className="h-4 w-4" /> Import file có sẵn
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-ink-800/55">
            <Link2 className="h-3.5 w-3.5" />
            <span>
              Dán link chia sẻ Myinstants — <b className="font-semibold">mỗi dòng một link</b>, dán được nhiều
              cái cùng lúc.
            </span>
          </div>
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) fetchLinks()
            }}
            rows={3}
            spellCheck={false}
            placeholder={'https://www.myinstants.com/en/instant/vine-boom-70972/\nhttps://www.myinstants.com/en/instant/ding-sound-effect/'}
            className={cn(
              'no-drag w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink-900',
              'placeholder:text-ink-800/30 focus:border-brand-400 focus:outline-none'
            )}
          />
          <div className="mt-2 flex items-center gap-3">
            <Button onClick={fetchLinks} disabled={fetching || !links.trim()}>
              {fetching ? <Spinner /> : <Download className="h-4 w-4" />} Lấy về
            </Button>
            <span className="text-[11px] text-ink-800/40">{MOD_KEY} + Enter để lấy nhanh</span>
          </div>

          {blocked && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-xs text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Myinstants đang bắt xác minh &ldquo;bạn không phải robot&rdquo;. Cửa sổ Myinstants vừa hiện ra —
                bấm qua bước xác minh <b>một lần</b> rồi bấm <b>Lấy về</b> lại. App nhớ phiên đăng nhập nên các
                lần sau không hỏi nữa.
              </span>
            </div>
          )}

          {!!errors.length && (
            <div className="mt-3 space-y-1">
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-600">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="break-all opacity-70">{e.url}</span> — {e.reason}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Nghe thu roi moi chon luu */}
      {!!pending.length && (
        <Card className="mb-5 border-brand-400/30">
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink-900">
              Nghe thử & chọn ({pickedCount}/{pending.length})
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPending((prev) => {
                    const all = prev.every((p) => p.picked)
                    return prev.map((p) => ({ ...p, picked: !all }))
                  })
                }
              >
                <Check className="h-4 w-4" />
                {pending.every((p) => p.picked) ? 'Bỏ chọn hết' : 'Chọn hết'}
              </Button>
              <Button size="sm" onClick={savePicked} disabled={saving || !pickedCount}>
                {saving ? <Spinner /> : <Download className="h-4 w-4" />} Lưu {pickedCount} vào kho
              </Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-2">
            {pending.map((p) => (
              <div
                key={p.key}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                  p.picked ? 'border-brand-400/40 bg-brand-50' : 'border-black/6 bg-ink-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={p.picked}
                  onChange={(e) => patch(p.key, { picked: e.target.checked })}
                  className="no-drag h-4 w-4 shrink-0 accent-[#FF7A1A]"
                />
                <button
                  onClick={() => play('pd:' + p.key, fileUrl(p.path))}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-500 shadow-sm"
                  aria-label="Nghe thử"
                >
                  {playing === 'pd:' + p.key ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <input
                  value={p.name}
                  onChange={(e) => patch(p.key, { name: e.target.value })}
                  className={cn(
                    'no-drag min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1',
                    'text-sm font-medium text-ink-900 hover:border-black/10 focus:border-brand-400 focus:bg-white focus:outline-none'
                  )}
                />
                {p.bytes > 0 && (
                  <span className="shrink-0 text-[11px] text-ink-800/35">
                    {(p.bytes / 1024).toFixed(0)} KB
                  </span>
                )}
                <select
                  value={p.emotion}
                  onChange={(e) => patch(p.key, { emotion: e.target.value })}
                  className={selectCls}
                >
                  {EMOTIONS.map((em) => (
                    <option key={em} value={em}>
                      {em}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => drop(p)}
                  className="text-ink-800/30 hover:text-red-500"
                  aria-label="Bỏ"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Kho */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-ink-900">Kho của bạn ({lib.length})</h2>
        <span className="text-[11px] text-ink-800/40">
          AI lập plan <b>không nghe được file</b> — nó chọn SFX theo nhãn. Cho Gemini nghe để nhãn đúng với âm
          thanh thật.
        </span>
        <div className="ml-auto flex items-center gap-2">
          {labeling ? (
            <Button variant="outline" size="sm" onClick={() => (stopRef.current = true)}>
              <Square className="h-3.5 w-3.5" /> Dừng
            </Button>
          ) : (
            <>
              {!!unlabeled.length && (
                <Button size="sm" onClick={() => labelIds(unlabeled.map((e) => e.id))}>
                  <Wand2 className="h-4 w-4" /> Cho Gemini nghe {unlabeled.length} âm thanh chưa gắn nhãn
                </Button>
              )}
              {!!lib.length && (
                <Button variant="outline" size="sm" onClick={() => labelIds(lib.map((e) => e.id))}>
                  <Sparkles className="h-4 w-4" /> Nghe lại tất cả ({lib.length})
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {(labeling || labelMsg) && (
        <div className="mb-3 rounded-xl border border-brand-400/25 bg-brand-50/60 px-3 py-2 text-xs text-ink-800/75">
          {labeling ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Spinner />
                <span>
                  Gemini đang nghe {Math.min(labeling.done + labeling.current.length, labeling.total)}/
                  {labeling.total}: {labeling.current.join(', ')}
                  {stopRef.current && ' — sẽ dừng sau nhóm này'}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-black/6">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${(100 * labeling.done) / Math.max(1, labeling.total)}%` }}
                />
              </div>
            </div>
          ) : (
            <span>{labelMsg}</span>
          )}
          {!labeling &&
            labelFails.slice(0, 6).map((f) => (
              <div key={f.id} className="mt-1 flex items-start gap-1.5 text-red-600">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 break-words">
                  {lib.find((e) => e.id === f.id)?.name || f.id} — {f.error}
                </span>
              </div>
            ))}
        </div>
      )}
      {lib.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center py-12 text-center">
            <Music2 className="mb-3 h-8 w-8 text-ink-800/25" />
            <div className="font-semibold text-ink-900">Kho trống</div>
            <p className="mt-1 text-sm text-ink-800/45">
              Dán link Myinstants, mở Myinstants trong app, hoặc import file để thêm SFX.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {lib.map((e) => {
            const ai = e.labeled_by === 'gemini'
            const inBatch = !!labeling?.ids.includes(e.id)
            return (
              <div key={e.id} className="card-surface flex items-start gap-3 rounded-xl px-3 py-2.5">
                <button
                  onClick={() => play('lib:' + e.id, fileUrl(e.file))}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500"
                >
                  {playing === 'lib:' + e.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink-900">{e.name}</span>
                    <Badge tone={ai ? 'ok' : 'neutral'} className="shrink-0 !px-1.5 !py-0 text-[10px]">
                      {ai ? 'Gemini đã nghe' : 'đoán từ tên'}
                    </Badge>
                  </div>
                  {editing === e.id ? (
                    <div className="space-y-1.5 pt-1">
                      <textarea
                        autoFocus
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        rows={2}
                        placeholder="Dùng khi… (tình huống trong video, vd: ngay sau câu chốt gây sốc)"
                        className="no-drag w-full resize-none rounded-lg border border-black/10 bg-white px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
                      />
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => saveUseWhen(e.id)} disabled={!draft.trim()}>
                          Lưu
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                          Huỷ
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      title="Bấm để sửa mô tả 'Dùng khi'"
                      onClick={() => {
                        setEditing(e.id)
                        setDraft(e.use_when || '')
                      }}
                      className="block w-full text-left text-[11px] leading-snug text-ink-800/55 hover:text-ink-800/85"
                    >
                      <span className="line-clamp-2">
                        <b className="font-medium text-ink-800/70">Dùng khi:</b> {e.use_when || '(chưa có)'}
                      </span>
                    </button>
                  )}
                  {ai && e.summary && (
                    <div className="line-clamp-2 text-[11px] leading-snug text-ink-800/45">{e.summary}</div>
                  )}
                  {ai && e.has_speech && (
                    <div className="flex items-start gap-1 text-[11px] leading-snug text-amber-700/85">
                      <Mic className="mt-[1px] h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">Có giọng nói{e.speech_text ? `: “${e.speech_text}”` : ''}</span>
                    </div>
                  )}
                  {ai && (
                    <div className="text-[10px] text-ink-800/35">
                      {[
                        e.sound_type,
                        e.intensity && `mức ${e.intensity}`,
                        e.duration != null && `${e.duration.toFixed(1)}s`,
                        e.peak_time != null && !e.has_speech && `cú đậm ở ${e.peak_time.toFixed(2)}s`
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={e.emotion}
                    onChange={(ev) => changeEmotion(e.id, ev.target.value)}
                    className={selectCls}
                  >
                    {EMOTIONS.map((em) => (
                      <option key={em} value={em}>
                        {em}
                      </option>
                    ))}
                  </select>
                  <button
                    title={ai ? 'Cho Gemini nghe lại & viết nhãn mới' : 'Cho Gemini nghe & gắn nhãn'}
                    onClick={() => labelIds([e.id])}
                    disabled={!!labeling}
                    className="text-brand-600 hover:text-brand-700 disabled:opacity-40"
                  >
                    {inBatch ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                  </button>
                  <button onClick={() => del(e.id)} className="text-ink-800/30 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
