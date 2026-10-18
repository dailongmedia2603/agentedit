import { useEffect, useMemo, useState } from 'react'
import { Info, Power, Search } from 'lucide-react'
import { Badge, Card, CardBody } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { fileUrl } from '../lib/platform'

const ENERGY_LABEL: Record<string, string> = { thap: 'nhẹ', vua: 'vừa', cao: 'mạnh' }
const ORDER = ['opening', 'typography', 'ui-entrance', 'camera', 'data', 'interaction', 'transition', 'rhythm', 'effects', 'outro']
const CAT_LABEL: Record<string, string> = {
  opening: 'Mở màn',
  typography: 'Chữ & thẻ tiêu đề',
  'ui-entrance': 'Giao diện / trưng bày',
  camera: 'Máy quay & không gian',
  data: 'Số liệu',
  interaction: 'Tương tác / demo',
  transition: 'Chuyển cảnh',
  rhythm: 'Nhịp & dừng cảnh',
  effects: 'Ánh sáng & nhấn mạnh',
  outro: 'Kết thúc / CTA'
}
const ROLE_LABEL: Record<string, string> = {
  title: 'tiêu đề',
  subtitle: 'câu phụ',
  kicker: 'nhãn trên',
  label: 'nhãn',
  number: 'con số',
  item: 'danh sách',
  quote: 'trích dẫn',
  cta: 'kêu gọi',
  name: 'tên',
  code: 'dòng lệnh',
  screen: 'ảnh màn hình',
  photo: 'ảnh',
  product: 'ảnh sản phẩm',
  video: 'đoạn video'
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')

/** Kho shot & motion: mẫu chuyển động toàn màn hình AI chèn vào video (Full-screen B-roll). Xem trước + mô tả + tắt / bật. */
export default function ShotLibraryPage() {
  const [items, setItems] = useState<ShotLibItem[]>([])
  const [cat, setCat] = useState<string>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = async (): Promise<boolean> => {
    if (!window.studio.shotlibList) return true
    try {
      const r = await window.studio.shotlibList()
      if (r.ok) setItems(r.shots || [])
      return !!r.ok
    } catch {
      return false
    }
  }
  useEffect(() => {
    // sidecar co the chua san sang luc mo app -> thu lai vai lan
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tryLoad = async (n: number) => {
      if (stop || (await load()) || n >= 10) return
      timer = setTimeout(() => void tryLoad(n + 1), 3000)
    }
    void tryLoad(0)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of items) c[s.category] = (c[s.category] || 0) + 1
    return c
  }, [items])
  const nOff = items.filter((s) => s.disabled).length

  const shown = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean)
    return items
      .filter((s) => (cat === 'all' ? true : cat === 'off' ? s.disabled || s.hidden : s.category === cat))
      .filter((s) => {
        if (!words.length) return true
        const doc = fold([s.id, s.vi.ten, s.vi.mo_ta, s.vi.hop_khi, s.vi.mo_rong, ...(s.vi.chu_de || [])].join(' '))
        return words.every((w) => doc.includes(w))
      })
      .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category))
  }, [items, cat, q])

  const toggle = async (s: ShotLibItem) => {
    await window.studio.shotlibToggle(s.id, !s.disabled)
    load()
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-3xl font-bold text-ink-900">Kho shot & motion</h1>
      <p className="mt-1 text-sm text-ink-800/50">
        {items.length} mẫu chuyển động toàn màn hình (Full-screen B-roll): số liệu, giao diện app, danh sách, so sánh,
        trích dẫn, mở màn, kết thúc… Khi lập kế hoạch, AI đọc toàn bộ kho và chọn mẫu hợp từng đoạn lời nói, rồi thay chữ,
        ảnh, màu bằng nội dung thật của video.
      </p>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-ink-200/40 bg-white/50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
        <p className="text-[13px] leading-relaxed text-ink-800/65">
          Chữ, ảnh trong video xem trước chỉ là mẫu. Mô tả “Dùng khi” và “Mở rộng” do Gemini xem từng video và viết: mỗi
          mẫu là một <b>khuôn</b>, đổi chữ / ảnh / màu là dùng được cho nhiều ngành, chủ đề khác. Mẫu tắt{' '}
          <Power className="inline h-3 w-3" /> sẽ không được AI chọn.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-1">
        {(
          [
            ['all', `Tất cả (${items.length})`],
            ...ORDER.filter((c) => counts[c]).map((c) => [c, `${CAT_LABEL[c] || c} (${counts[c]})`]),
            ...(nOff || items.some((s) => s.hidden) ? [['off', `Đang tắt / ẩn (${nOff + items.filter((s) => s.hidden).length})`]] : [])
          ] as [string, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setCat(id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[13px] font-medium',
              cat === id ? 'bg-brand-50 text-brand-700' : 'text-ink-800/50 hover:text-ink-900'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-800/30" />
        <input
          className="w-full rounded-lg border border-ink-200/50 bg-white/60 py-2 pl-9 pr-3 text-[13px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo nội dung: số liệu, điện thoại, so sánh, bán hàng, spa…"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {shown.map((s) => {
          const off = s.disabled || s.hidden
          const expanded = open === s.id
          return (
            <Card key={s.id} className={cn(off && 'opacity-55')}>
              <CardBody className="flex gap-3 pt-4">
                <div className="relative w-28 shrink-0 overflow-hidden rounded-lg bg-[#15171c]" style={{ aspectRatio: '9 / 16' }}>
                  {s.preview ? (
                    <video
                      className="h-full w-full object-cover"
                      src={fileUrl(s.preview) + '#t=2'}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => {
                        e.currentTarget.currentTime = 0
                        void e.currentTarget.play().catch(() => undefined)
                      }}
                      onMouseLeave={(e) => e.currentTarget.pause()}
                    />
                  ) : (
                    <span className="flex h-full items-center px-2 text-center text-[10px] text-white/40">chưa có xem trước</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="line-clamp-2 flex-1 font-medium text-ink-900">{s.vi.ten || s.id}</span>
                    {!s.hidden && (
                      <button
                        title={s.disabled ? 'Bật lại (AI được chọn mẫu này)' : 'Tắt (AI không chọn mẫu này)'}
                        className={cn('hover:text-ink-900', s.disabled ? 'text-ink-800/30' : 'text-brand-600')}
                        onClick={() => toggle(s)}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">{CAT_LABEL[s.category] || s.category}</Badge>
                    {s.hidden && <Badge tone="neutral">đã ẩn{s.hidden_reason ? `: ${s.hidden_reason}` : ''}</Badge>}
                    {s.disabled && <Badge tone="warn">đang tắt</Badge>}
                    <span className="text-[11px] text-ink-800/40">
                      {s.kind === 'overlay' ? 'lớp phủ trên người nói' : 'toàn màn hình'}
                      {` · ${s.duration.toFixed(1)}s`}
                      {s.vi.nang_luong ? ` · ${ENERGY_LABEL[s.vi.nang_luong]}` : ''}
                      {s.backdrop ? ' · nền ảnh AI' : ''}
                      {s.brand === 'required' ? ' · cần tên thương hiệu' : ''}
                    </span>
                  </div>
                  {s.vi.mo_ta && <p className="text-[12px] leading-relaxed text-ink-800/65">{s.vi.mo_ta}</p>}
                  {s.vi.hop_khi && (
                    <p className={cn('text-[12px] leading-relaxed text-ink-800/55', !expanded && 'line-clamp-3')}>
                      <b className="text-ink-800/70">Dùng khi:</b> {s.vi.hop_khi}
                    </p>
                  )}
                  {s.vi.mo_rong && (
                    <p className={cn('text-[12px] leading-relaxed text-ink-800/55', !expanded && 'line-clamp-2')}>
                      <b className="text-ink-800/70">Mở rộng:</b> {s.vi.mo_rong}
                    </p>
                  )}
                  {expanded && (
                    <p className="text-[11px] leading-relaxed text-ink-800/45">
                      <b>Ô nội dung:</b>{' '}
                      {[
                        ...s.slots.map(
                          (x) => `${ROLE_LABEL[x.role] || x.role}${x.list ? ` ${x.list.min}-${x.list.max} mục` : ''} ≤${x.max} ký tự${x.optional ? ' (tuỳ chọn)' : ''}`
                        ),
                        ...s.images.map((x) => `${ROLE_LABEL[x.role] || x.role}${x.optional ? ' (tuỳ chọn)' : ''}`)
                      ].join(' · ') || 'không cần chữ / ảnh'}
                    </p>
                  )}
                  {!!s.vi.chu_de?.length && <p className="text-[11px] text-ink-800/35">{s.vi.chu_de.join(' · ')}</p>}
                  <button className="text-[11px] text-brand-600 hover:text-brand-700" onClick={() => setOpen(expanded ? null : s.id)}>
                    {expanded ? 'Thu gọn' : 'Xem đầy đủ'}
                  </button>
                </div>
              </CardBody>
            </Card>
          )
        })}
      </div>
      {!shown.length && (
        <p className="mt-6 text-center text-sm text-ink-800/40">{items.length ? 'Không có mẫu nào khớp.' : 'Đang tải kho…'}</p>
      )}
    </div>
  )
}
