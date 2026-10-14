import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RefreshCw, Search, Star, UserRound } from 'lucide-react'
import { Input, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/** Danh sach giong SaydiVoice dung chung (tai 1 lan / phien; nut lam moi tai lai). */
type VoiceList = { voices: SaydiVoice[]; customError?: string; error?: string }
let cache: VoiceList | null = null
let loading: Promise<VoiceList> | null = null

async function loadVoices(force = false): Promise<VoiceList> {
  if (cache && !force) return cache
  if (!loading || force) {
    loading = window.studio.saydiVoices(force).then((r) => {
      if (r.ok) cache = { voices: r.voices, customError: r.customError }
      return { voices: r.voices || [], customError: r.customError, error: r.ok ? undefined : r.error }
    })
  }
  const r = await loading
  loading = null
  return r
}

const LANG_LABEL: Record<string, string> = { vi: 'Tiếng Việt', en: 'English', all: 'Mọi ngôn ngữ' }
const GENDER_LABEL: Record<string, string> = { male: 'Nam', female: 'Nữ' }

/** Phat 1 file nghe thu (1 file 1 luc trong ca app). */
let player: HTMLAudioElement | null = null

export function VoicePicker({
  value,
  onChange,
  language
}: {
  value: MotionVoice
  onChange: (v: MotionVoice) => void
  /** ngon ngu video -> loc giong mac dinh */
  language: string
}) {
  const [voices, setVoices] = useState<SaydiVoice[] | null>(cache?.voices || null)
  const [err, setErr] = useState('')
  const [customErr, setCustomErr] = useState(cache?.customError || '')
  const [q, setQ] = useState('')
  const [lang, setLang] = useState(language === 'en' ? 'en' : 'vi')
  const [gender, setGender] = useState('')
  const [playing, setPlaying] = useState('')
  const [loadingId, setLoadingId] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const refresh = async (force: boolean) => {
    setRefreshing(true)
    setErr('')
    const r = await loadVoices(force)
    setVoices(r.voices)
    setCustomErr(r.customError || '')
    if (r.error) setErr(r.error)
    setRefreshing(false)
  }
  useEffect(() => {
    if (!voices) refresh(false)
    return () => {
      player?.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => setLang(language === 'en' ? 'en' : 'vi'), [language])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (voices || [])
      .filter((v) => v.custom || lang === 'all' || v.language === lang)
      .filter((v) => !gender || v.gender === gender)
      .filter((v) => !s || `${v.name} ${v.id} ${v.description || ''}`.toLowerCase().includes(s))
      .sort((a, b) => Number(!!b.custom) - Number(!!a.custom) || Number(!!b.featured) - Number(!!a.featured))
  }, [voices, q, lang, gender])

  const selected = (voices || []).find((v) => v.id === value.voiceId)

  const play = async (v: SaydiVoice) => {
    if (playing === v.id) {
      player?.pause()
      setPlaying('')
      return
    }
    player?.pause()
    setLoadingId(v.id)
    const r = await window.studio.saydiPreview(v.id, !!v.custom)
    setLoadingId('')
    if (!r.ok || !r.url) {
      setErr(r.error || 'Không nghe thử được giọng này.')
      return
    }
    player = new Audio(r.url)
    player.onended = () => setPlaying('')
    player.onerror = () => setPlaying('')
    setPlaying(v.id)
    player.play().catch(() => setPlaying(''))
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-800/35" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm giọng theo tên…" className="h-9 pl-9" />
        </div>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="no-drag h-9 rounded-xl border border-black/10 bg-ink-50 px-2 text-[13px] text-ink-900 outline-none"
        >
          {['vi', 'en', 'all'].map((l) => (
            <option key={l} value={l}>
              {LANG_LABEL[l]}
            </option>
          ))}
        </select>
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className="no-drag h-9 rounded-xl border border-black/10 bg-ink-50 px-2 text-[13px] text-ink-900 outline-none"
        >
          <option value="">Nam + Nữ</option>
          <option value="male">Nam</option>
          <option value="female">Nữ</option>
        </select>
        <button
          onClick={() => refresh(true)}
          title="Tải lại danh sách giọng"
          className="no-drag rounded-lg p-2 text-ink-800/45 hover:bg-black/5 hover:text-ink-900"
        >
          {refreshing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>
      {err && <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">{err}</div>}
      {customErr && (
        <div className="mb-2 text-[11.5px] text-amber-700">Chưa đọc được giọng riêng của tài khoản: {customErr}</div>
      )}
      <div ref={listRef} className="max-h-[260px] overflow-y-auto rounded-xl border border-black/8 bg-white">
        {!voices ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        ) : !list.length ? (
          <div className="p-4 text-center text-[13px] text-ink-800/45">Không có giọng phù hợp.</div>
        ) : (
          list.slice(0, 200).map((v) => {
            const on = v.id === value.voiceId
            return (
              <div
                key={v.id}
                onClick={() => onChange({ ...value, voiceId: v.id, voiceName: v.name })}
                className={cn(
                  'flex cursor-pointer items-center gap-3 border-b border-black/5 px-3 py-2 last:border-0',
                  on ? 'bg-brand-500/10' : 'hover:bg-black/[0.03]'
                )}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    play(v)
                  }}
                  title="Nghe thử"
                  className={cn(
                    'no-drag flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                    playing === v.id ? 'border-brand-400 bg-brand-500 text-white' : 'border-black/10 bg-white text-ink-800/70 hover:border-brand-400'
                  )}
                >
                  {loadingId === v.id ? <Spinner className="h-3.5 w-3.5" /> : playing === v.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('truncate text-[13px] font-medium', on ? 'text-brand-700' : 'text-ink-900')}>{v.name}</span>
                    {v.custom && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/12 px-1.5 text-[10px] font-medium text-brand-700">
                        <UserRound className="h-3 w-3" /> giọng riêng
                      </span>
                    )}
                    {v.featured && !v.custom && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                  </div>
                  <div className="truncate text-[11.5px] text-ink-800/45">
                    {[GENDER_LABEL[v.gender || ''], LANG_LABEL[v.language] || v.language, v.description].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className={cn('h-4 w-4 shrink-0 rounded-full border-2', on ? 'border-brand-500 bg-brand-500 shadow-[inset_0_0_0_2px_white]' : 'border-black/20')} />
              </div>
            )
          })
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <div className="text-[12px] text-ink-800/55">
          Đang chọn: <b className="font-semibold text-ink-900">{selected?.name || value.voiceName || 'chưa chọn'}</b>
          {list.length > 200 && <span className="ml-2 text-ink-800/40">(hiện 200/{list.length} — gõ tìm để lọc)</span>}
        </div>
        <label className="ml-auto flex items-center gap-2 text-[12px] text-ink-800/55">
          Tốc độ đọc
          <input
            type="range"
            min={0.8}
            max={1.3}
            step={0.05}
            value={value.speed || 1}
            onChange={(e) => onChange({ ...value, speed: Number(e.target.value) })}
            className="no-drag w-28 accent-brand-500"
          />
          <span className="w-9 font-mono text-ink-900">{(value.speed || 1).toFixed(2)}</span>
        </label>
      </div>
    </div>
  )
}
