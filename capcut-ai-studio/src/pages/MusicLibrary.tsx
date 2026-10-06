import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderUp,
  Info,
  Mic,
  Pause,
  Play,
  Power,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Volume1,
  Wand2,
  X
} from 'lucide-react'
import { Badge, Button, Card, CardBody, Spinner } from '@/components/ui/primitives'
import { useLibrarySync } from '../lib/useLibrarySync'
import { cn } from '@/lib/utils'
import { fileUrl } from '../lib/platform'

// So bai gui Gemini moi luot — khop music_lib.LABEL_BATCH ben sidecar
const LABEL_BATCH = 3

const ENERGY: Record<string, string> = { thap: 'năng lượng thấp', vua: 'năng lượng vừa', cao: 'năng lượng cao' }
const TEMPO: Record<string, string> = { cham: 'nhịp chậm', vua: 'nhịp vừa', nhanh: 'nhịp nhanh' }
const SPEECH: Record<string, { text: string; tone: 'ok' | 'warn' | 'fail' }> = {
  tot: { text: 'hợp nền giọng nói', tone: 'ok' },
  vua: { text: 'nền giọng nói: tạm', tone: 'warn' },
  kem: { text: 'dễ lấn giọng nói', tone: 'fail' }
}

function fmtDur(s?: number): string {
  if (s == null) return ''
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

const isCc0 = (t: MusicTrack) => /^CC0/i.test(t.license || '')

/** Kho nhạc nền: nhạc CC0 đồng bộ qua máy chủ + nhạc bạn tự nhập; AI chọn bài khi lập kế hoạch (B7). */
export default function MusicLibraryPage() {
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [st, setSt] = useState<MusicSettings>({ auto: true })
  const [pct, setPct] = useState(20)
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [labeling, setLabeling] = useState<{ done: number; total: number; current: string[]; ids: string[] } | null>(null)
  const [fails, setFails] = useState<{ id: string; error: string }[]>([])
  const stopRef = useRef(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const load = async () => {
    const r = await window.studio.musicList()
    if (!r.ok) return
    setTracks(r.tracks || [])
    setSt(r.settings)
    setPct(r.voice_pct)
  }

  useEffect(() => {
    load()
    return () => audioRef.current?.pause()
  }, [])

  const unlabeled = useMemo(() => tracks.filter((t) => t.labeled_by !== 'gemini'), [tracks])
  const nOn = tracks.filter((t) => !t.disabled && (t.labeled_by === 'gemini' || t.use_when)).length

  /** mode 'full' = nghe bài bình thường; 'mix' = nghe ở ĐÚNG mức nền so với một giọng nói mẫu */
  const play = async (t: MusicTrack, mode: 'full' | 'mix') => {
    const key = `${mode}:${t.id}`
    audioRef.current?.pause()
    if (playing === key) {
      setPlaying(null)
      return
    }
    let vol = 1
    if (mode === 'mix') {
      const r = await window.studio.musicPreviewVolume(t.id)
      if (r.volume == null) {
        setMsg('Chưa đo được độ to của bài này — bấm ✨ để đo + gắn nhãn.')
        return
      }
      vol = r.volume
    }
    const a = new Audio(fileUrl(t.file))
    a.volume = Math.min(1, Math.max(0, vol))
    a.currentTime = t.best_start || 0
    audioRef.current = a
    a.onended = () => setPlaying(null)
    a.play().catch(() => setPlaying(null))
    setPlaying(key)
  }

  const saveSettings = async (patch: Partial<MusicSettings>) => {
    const r = await window.studio.musicSettings(patch)
    if (r.ok && r.settings) setSt(r.settings)
  }

  const bgSync = useLibrarySync(load)
  const syncBusy = syncing || bgSync

  const doSync = async () => {
    setSyncing(true)
    setMsg(null)
    try {
      const r = await window.studio.syncLibrary()
      if (!r.ok) setMsg('Đồng bộ lỗi: ' + (r.error || 'không rõ'))
      else {
        const m = r.music || { added: 0, updated: 0, total: 0, errors: [] }
        setMsg(
          `Kho nhạc nền: +${m.added} mới, ${m.updated} cập nhật (tổng ${m.total})` +
            (m.errors?.length ? ` · ${m.errors.length} lỗi tải` : '')
        )
      }
      await load()
    } catch (e) {
      setMsg('Đồng bộ lỗi: ' + String(e))
    } finally {
      setSyncing(false)
    }
  }

  const labelIds = async (ids: string[]) => {
    if (!ids.length || labeling) return
    stopRef.current = false
    setFails([])
    setMsg(null)
    const names = new Map(tracks.map((t) => [t.id, t.name]))
    const bad: { id: string; error: string }[] = []
    let ok = 0
    for (let i = 0; i < ids.length; i += LABEL_BATCH) {
      if (stopRef.current) break
      const chunk = ids.slice(i, i + LABEL_BATCH)
      setLabeling({ done: i, total: ids.length, current: chunk.map((id) => names.get(id) || id), ids: chunk })
      const r = await window.studio.musicLabel(chunk)
      if (!r.ok) bad.push(...chunk.map((id) => ({ id, error: r.error || 'lỗi không rõ' })))
      else {
        ok += r.updated?.length ?? 0
        bad.push(...(r.failed || []))
      }
      await load()
    }
    const stopped = stopRef.current
    setLabeling(null)
    setFails(bad)
    setMsg(`${stopped ? 'Đã dừng — ' : ''}Gemini đã nghe & gắn nhãn ${ok} bài` + (bad.length ? ` · ${bad.length} lỗi` : ''))
  }

  const importLocal = async () => {
    const res = await window.studio.pickMusic()
    if (res.canceled || !res.filePaths?.length) return
    setImporting(true)
    const r = await window.studio.musicImport(res.filePaths.map((path) => ({ path })))
    setImporting(false)
    await load()
    const added = (r.added || []).map((t) => t.id)
    if (r.failed?.length) setFails(r.failed.map((f) => ({ id: f.path, error: f.error })))
    // bai moi: cho Gemini nghe luon (AI lap ke hoach chi chon bai co nhan)
    if (added.length) labelIds(added)
  }

  const update = async (payload: { id: string; use_when?: string; disabled?: boolean }) => {
    await window.studio.musicUpdate(payload)
    await load()
  }

  const del = async (t: MusicTrack) => {
    if (playing?.endsWith(':' + t.id)) {
      audioRef.current?.pause()
      setPlaying(null)
    }
    await window.studio.musicDelete(t.id)
    load()
  }

  return (
    <div className="w-full px-8 py-7">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Kho nhạc nền</h1>
          <p className="mt-1 text-sm text-ink-800/50">
            Nhạc nền nhỏ chạy dưới giọng nói để video không bị quá im. Khi lập kế hoạch, AI chọn 1 bài hợp nội dung
            video; nhạc chỉ bắt đầu <b>sau phần hook</b>.
          </p>
          {msg && <p className="mt-1 text-xs text-brand-600">{msg}</p>}
        </div>
        <Button variant="outline" onClick={doSync} disabled={syncBusy} className="shrink-0">
          {syncBusy ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {syncBusy ? 'Đang đồng bộ…' : 'Đồng bộ kho'}
        </Button>
      </div>

      <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-50 p-3 text-xs text-emerald-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Nhạc trong kho chung có giấy phép <b>CC0</b> (tác giả từ bỏ bản quyền): dùng thoải mái trên TikTok, YouTube,
          Facebook Reels, kể cả video kiếm tiền, không cần ghi nguồn. Nhạc bạn tự nhập chỉ nằm ở máy này — bạn tự đảm
          bảo quyền sử dụng.
        </span>
      </div>

      {/* Cài đặt trộn */}
      <Card className="mb-5">
        <CardBody className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={st.auto}
              onChange={(e) => saveSettings({ auto: e.target.checked })}
              className="no-drag h-4 w-4 accent-[#FF7A1A]"
            />
            <span className="text-sm font-semibold text-ink-900">Tự thêm nhạc nền khi AI lập kế hoạch</span>
            <span className="text-xs text-ink-800/45">
              {st.auto
                ? `${nOn} bài sẵn sàng cho AI chọn`
                : 'đang tắt — video mới không có nhạc nền'}
            </span>
          </label>
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-800/55">
            <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            <span>
              Độ to không chỉnh ở đây — theo <b>quy tắc của bước lập kế hoạch</b>: nhạc nền ={' '}
              <b>{pct}% tiếng người nói</b> của chính từng video (máy đo giọng nói thật, nên video thu âm nhỏ hay to
              thì nhạc vẫn đúng tỉ lệ). Nhạc bắt đầu sau hook, nhỏ hẳn khi meme cắt vào, fade ở 2 đầu. Bấm{' '}
              <Volume1 className="inline h-3 w-3" /> ở từng bài để nghe thử đúng tỉ lệ đó.
            </span>
          </p>
        </CardBody>
      </Card>

      {/* Kho */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-ink-900">Các bài ({tracks.length})</h2>
        <span className="text-[11px] text-ink-800/40">
          AI lập kế hoạch <b>không nghe được nhạc</b> — nó chọn theo nhãn Gemini viết sau khi nghe.
        </span>
        <div className="ml-auto flex items-center gap-2">
          {labeling ? (
            <Button variant="outline" size="sm" onClick={() => (stopRef.current = true)}>
              <Square className="h-3.5 w-3.5" /> Dừng
            </Button>
          ) : (
            !!unlabeled.length && (
              <Button size="sm" onClick={() => labelIds(unlabeled.map((t) => t.id))}>
                <Wand2 className="h-4 w-4" /> Cho Gemini nghe {unlabeled.length} bài chưa gắn nhãn
              </Button>
            )
          )}
          <Button variant="outline" size="sm" onClick={importLocal} disabled={importing}>
            {importing ? <Spinner /> : <FolderUp className="h-4 w-4" />} Nhập nhạc của bạn
          </Button>
        </div>
      </div>

      {(labeling || fails.length > 0) && (
        <div className="mb-3 rounded-xl border border-brand-400/25 bg-brand-50/60 px-3 py-2 text-xs text-ink-800/75">
          {labeling && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Spinner />
                <span>
                  Gemini đang nghe {Math.min(labeling.done + labeling.current.length, labeling.total)}/{labeling.total}:{' '}
                  {labeling.current.join(', ')}
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
          )}
          {!labeling &&
            fails.slice(0, 6).map((f) => (
              <div key={f.id} className="mt-1 flex items-start gap-1.5 text-red-600">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 break-words">
                  {tracks.find((t) => t.id === f.id)?.name || f.id} — {f.error}
                </span>
              </div>
            ))}
        </div>
      )}

      {tracks.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center py-12 text-center">
            <Volume1 className="mb-3 h-8 w-8 text-ink-800/25" />
            <div className="font-semibold text-ink-900">Kho trống</div>
            <p className="mt-1 text-sm text-ink-800/45">
              Bấm “Đồng bộ kho” để tải kho nhạc CC0 chung, hoặc nhập file nhạc bạn có quyền sử dụng.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {tracks.map((t) => {
            const ai = t.labeled_by === 'gemini'
            const inBatch = !!labeling?.ids.includes(t.id)
            const sp = t.speech_friendly ? SPEECH[t.speech_friendly] : null
            return (
              <div
                key={t.id}
                className={cn('card-surface flex items-start gap-3 rounded-xl px-3 py-2.5', t.disabled && 'opacity-50')}
              >
                <div className="mt-0.5 flex shrink-0 flex-col gap-1">
                  <button
                    title="Nghe bài"
                    onClick={() => play(t, 'full')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500"
                  >
                    {playing === 'full:' + t.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button
                    title="Nghe ở đúng mức nền (so với một giọng nói bình thường)"
                    onClick={() => play(t, 'mix')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/5 text-ink-800/60"
                  >
                    {playing === 'mix:' + t.id ? <Pause className="h-4 w-4" /> : <Volume1 className="h-4 w-4" />}
                  </button>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink-900">{t.name}</span>
                    <Badge tone={isCc0(t) ? 'ok' : 'neutral'} className="shrink-0 !px-1.5 !py-0 text-[10px]">
                      {isCc0(t) ? 'CC0' : 'nhạc của bạn'}
                    </Badge>
                    <Badge tone={ai ? 'brand' : 'neutral'} className="shrink-0 !px-1.5 !py-0 text-[10px]">
                      {ai ? 'Gemini đã nghe' : 'chưa gắn nhãn'}
                    </Badge>
                    {sp && (
                      <Badge tone={sp.tone} className="shrink-0 !px-1.5 !py-0 text-[10px]">
                        {sp.text}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-ink-800/40">
                    {[
                      t.artist,
                      fmtDur(t.duration),
                      t.genre,
                      t.energy && ENERGY[t.energy],
                      t.tempo && TEMPO[t.tempo],
                      t.bpm && `${t.bpm} bpm`
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {ai && t.summary && <div className="text-[11px] leading-snug text-ink-800/60">{t.summary}</div>}
                  {editing === t.id ? (
                    <div className="space-y-1.5 pt-1">
                      <textarea
                        autoFocus
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        rows={2}
                        placeholder="Dùng khi… (loại video / cảm xúc, vd: chia sẻ kinh nghiệm nhẹ nhàng)"
                        className="no-drag w-full resize-none rounded-lg border border-black/10 bg-white px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
                      />
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          disabled={!draft.trim()}
                          onClick={async () => {
                            await update({ id: t.id, use_when: draft.trim() })
                            setEditing(null)
                          }}
                        >
                          Lưu
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                          Huỷ
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      title="Bấm để sửa 'Dùng khi'"
                      onClick={() => {
                        setEditing(t.id)
                        setDraft(t.use_when || '')
                      }}
                      className="block w-full text-left text-[11px] leading-snug text-ink-800/55 hover:text-ink-800/85"
                    >
                      <span className="line-clamp-2">
                        <b className="font-medium text-ink-800/70">Dùng khi:</b> {t.use_when || '(chưa có)'}
                      </span>
                    </button>
                  )}
                  {!!t.moods?.length && (
                    <div className="text-[10px] text-ink-800/40">{t.moods.join(' · ')}</div>
                  )}
                  {ai && t.has_vocals && (
                    <div className="flex items-start gap-1 text-[11px] leading-snug text-amber-700/85">
                      <Mic className="mt-[1px] h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">Có giọng hát{t.vocals_note ? `: ${t.vocals_note}` : ''}</span>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    title={ai ? 'Cho Gemini nghe lại & viết nhãn mới' : 'Cho Gemini nghe & gắn nhãn'}
                    onClick={() => labelIds([t.id])}
                    disabled={!!labeling}
                    className="text-brand-600 hover:text-brand-700 disabled:opacity-40"
                  >
                    {inBatch ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                  </button>
                  <button
                    title={t.disabled ? 'Bật lại (AI được chọn bài này)' : 'Tắt (AI không chọn bài này)'}
                    onClick={() => update({ id: t.id, disabled: !t.disabled })}
                    className={cn('hover:text-ink-900', t.disabled ? 'text-ink-800/30' : 'text-ink-800/60')}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  {!isCc0(t) && (
                    <button title="Xoá khỏi kho" onClick={() => del(t)} className="text-ink-800/30 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
