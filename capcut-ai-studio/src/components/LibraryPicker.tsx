// THU VIEN VIDEO DA PHAN TICH — chon lai video nguon / video mau da phan tich truoc day
// de dung lai ket qua (Gemini / GPT / Whisper) thay vi phan tich lai tu dau.
// Du lieu nam o sidecar (analysis_library.py); moi lan phan tich xong la tu luu.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Film, Library, Search, Trash2, X } from 'lucide-react'
import { Badge, Button, Input, Spinner } from '@/components/ui/primitives'
import { cn, fmtTime } from '@/lib/utils'
import { isFullUi } from '@/lib/clientUi'

/** "2026-09-26T05:52:10" -> "26/09 05:52" */
export function fmtSavedAt(at?: string | null): string {
  if (!at) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(at)
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : at
}

/** Trang thai "da co phan tich luu chua" cua danh sach duong dan video. */
export function useLibraryLookup(paths: string[]) {
  const [found, setFound] = useState<Record<string, LibraryLookup>>({})
  const key = paths.join('\n')
  const refresh = useCallback(async () => {
    if (!paths.length) {
      setFound({})
      return
    }
    try {
      const r = await window.studio.libraryLookup(paths)
      if (r.ok && r.found) setFound(r.found)
    } catch {
      /* thu vien loi -> coi nhu chua luu, van phan tich binh thuong */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { found, refresh }
}

/** Nhan nho canh ten video: da co phan tich luu (xanh) hay chua. */
export function SavedBadge({ at, label = 'Đã phân tích' }: { at?: string | null; label?: string }) {
  if (!at) return <Badge tone="neutral">Chưa phân tích</Badge>
  return (
    <Badge tone="ok" title="Lấy từ thư viện — không gọi lại AI">
      <CheckCircle2 className="h-3 w-3" /> {label} · {fmtSavedAt(at)}
    </Badge>
  )
}

type Mode = 'source' | 'reference'

const PART_LABEL_FULL: Record<LibraryPart, string> = {
  source: 'Nguồn',
  ref_video: 'Mẫu · Gemini',
  ref_gpt: 'Mẫu · GPT (cũ)'
}
// ban cai cho may khac: khong neu ten AI (src/lib/clientUi.ts)
const PART_LABEL_CLIENT: Record<LibraryPart, string> = { source: 'Nguồn', ref_video: 'Mẫu', ref_gpt: 'Mẫu (cũ)' }
const partLabels = () => (isFullUi() ? PART_LABEL_FULL : PART_LABEL_CLIENT)

// Phan tich app se DUNG LAI cho video nay (giong thu tu cua sidecar): mau Gemini truoc, khong co thi ban GPT cu
function usedPart(it: LibraryItem, mode: Mode): LibraryPart | null {
  if (mode === 'source') return it.source ? 'source' : null
  return it.ref_video ? 'ref_video' : it.ref_gpt ? 'ref_gpt' : null
}

export function LibraryPicker({
  open,
  onClose,
  mode,
  multiple = mode === 'source',
  exclude = [],
  onPick
}: {
  open: boolean
  onClose: () => void
  mode: Mode
  multiple?: boolean
  /** duong dan da chon san (an khoi danh sach) */
  exclude?: string[]
  onPick: (items: LibraryItem[]) => void
}) {
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const want: LibraryPart = mode === 'source' ? 'source' : 'ref_video'

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await window.studio.libraryList()
      if (!r.ok) throw new Error(r.error || 'Không đọc được thư viện')
      setItems(r.items || [])
    } catch (e) {
      setError(String((e as Error).message || e))
      setItems([])
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setSel([])
    setQ('')
    setConfirmDel(null)
    setItems(null)
    load()
  }, [open, load])

  const rows = useMemo(() => {
    const ex = new Set(exclude)
    const needle = q.trim().toLowerCase()
    return (items || [])
      .filter((it) => !ex.has(it.path))
      .filter(
        (it) =>
          !needle ||
          it.name?.toLowerCase().includes(needle) ||
          (it.source?.summary || it.ref_video?.summary || it.ref_gpt?.summary || '').toLowerCase().includes(needle)
      )
      .sort((a, b) => Number(!!usedPart(b, mode)) - Number(!!usedPart(a, mode))) // video da co dung loai phan tich len dau
  }, [items, exclude, q, mode])

  if (!open) return null

  const toggle = (it: LibraryItem) => {
    if (!it.exists) return
    setSel((cur) =>
      cur.includes(it.fp) ? cur.filter((x) => x !== it.fp) : multiple ? [...cur, it.fp] : [it.fp]
    )
  }

  const remove = async (fp: string) => {
    await window.studio.libraryDelete(fp)
    setConfirmDel(null)
    setSel((cur) => cur.filter((x) => x !== fp))
    load()
  }

  const chosen = (items || []).filter((it) => sel.includes(it.fp))
  const nReuse = chosen.filter((it) => usedPart(it, mode)).length

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-black/6 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/12">
            <Library className="h-5 w-5 text-brand-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink-900">
              Thư viện video đã phân tích · {mode === 'source' ? 'chọn video nguồn' : 'chọn video mẫu'}
            </div>
            <div className="text-xs text-ink-800/50">
              Video có phân tích <b>{partLabels()[want]}</b> dùng lại ngay, không gọi lại AI. Mỗi lần phân tích xong, video
              tự được lưu vào đây.
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-800/40 hover:bg-black/5 hover:text-ink-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-black/6 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-800/35" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc nội dung..." className="pl-9" />
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {items === null && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-800/50">
              <Spinner /> Đang tải thư viện...
            </div>
          )}
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          {items !== null && !rows.length && !error && (
            <div className="py-12 text-center text-sm text-ink-800/45">
              {items.length
                ? 'Không có video nào khớp.'
                : 'Thư viện trống — sau khi bạn phân tích video nguồn / video mẫu lần đầu, video sẽ tự được lưu vào đây.'}
            </div>
          )}
          {rows.map((it) => {
            const on = sel.includes(it.fp)
            const used = usedPart(it, mode)
            const summary = (used && it[used]?.summary) || it.source?.summary || it.ref_video?.summary || it.ref_gpt?.summary
            return (
              <div
                key={it.fp}
                onClick={() => toggle(it)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-2.5 transition',
                  !it.exists
                    ? 'cursor-not-allowed border-black/6 bg-ink-50 opacity-60'
                    : on
                      ? 'cursor-pointer border-brand-400 bg-brand-50/70'
                      : 'cursor-pointer border-black/6 bg-white hover:border-brand-300 hover:bg-brand-50/30'
                )}
              >
                <div
                  className={cn(
                    'mt-1 flex h-5 w-5 shrink-0 items-center justify-center border-2',
                    multiple ? 'rounded-md' : 'rounded-full',
                    on ? 'border-brand-500 bg-brand-500 text-white' : 'border-black/15 bg-white'
                  )}
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                </div>
                {it.thumb ? (
                  <img src={it.thumb} className="h-16 w-12 shrink-0 rounded-lg object-cover" alt="" />
                ) : (
                  <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-black/5">
                    <Film className="h-5 w-5 text-ink-800/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink-900">{it.name}</span>
                    {!!it.duration && <span className="shrink-0 text-xs text-ink-800/40">{fmtTime(it.duration)}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(['source', 'ref_video', 'ref_gpt'] as LibraryPart[]).map((part) =>
                      it[part] ? (
                        <Badge key={part} tone={part === used ? 'ok' : 'neutral'} title={it[part]?.summary || ''}>
                          {part === used && <CheckCircle2 className="h-3 w-3" />}
                          {partLabels()[part]} · {fmtSavedAt(it[part]?.at)}
                        </Badge>
                      ) : null
                    )}
                    {!used && it.exists && <Badge tone="warn">Chưa có {partLabels()[want]} — sẽ phân tích khi chạy</Badge>}
                  </div>
                  {summary && <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-800/55">{summary}</div>}
                  {!it.exists && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> Không còn file ở {it.path}
                    </div>
                  )}
                </div>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  {confirmDel === it.fp ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="danger" onClick={() => remove(it.fp)}>
                        Xoá
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>
                        Huỷ
                      </Button>
                    </div>
                  ) : (
                    <button
                      title="Xoá khỏi thư viện (chỉ xoá bản phân tích, không xoá file video)"
                      onClick={() => setConfirmDel(it.fp)}
                      className="rounded-lg p-1.5 text-ink-800/30 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-black/6 px-5 py-3">
          <div className="text-xs text-ink-800/55">
            {chosen.length
              ? `Đã chọn ${chosen.length} video · ${nReuse} dùng lại phân tích đã lưu${
                  chosen.length > nReuse ? ` · ${chosen.length - nReuse} sẽ phân tích mới` : ''
                }`
              : multiple
                ? 'Chọn một hay nhiều video'
                : 'Chọn 1 video'}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              disabled={!chosen.length}
              onClick={() => {
                onPick(chosen)
                onClose()
              }}
            >
              <Check className="h-4 w-4" /> Dùng {chosen.length || ''} video
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
