import { useEffect, useMemo, useState } from 'react'
import { Info, Pause, Play, Power, RefreshCw, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardBody, Spinner } from '@/components/ui/primitives'
import { useLibrarySync } from '../lib/useLibrarySync'
import { cn } from '@/lib/utils'
import { fileUrl } from '../lib/platform'
import { harvestStatus, kickHarvest, subscribeHarvest, type FxHarvestStatus } from '../lib/fxHarvest'

const ENERGY_LABEL: Record<string, string> = { nhe: 'nhẹ', vua: 'vừa', manh: 'mạnh' }
const PHASE_LABEL: Record<string, string> = {
  preview: 'đang dựng xem trước',
  label: 'Gemini đang xem để viết mô tả',
  share: 'đang gửi lên kho chung'
}

type Filter = 'all' | 'local' | 'shared'

/** Trang thai xu ly cua 1 hieu ung (may nay): xem truoc -> nhan Gemini -> kho chung */
function stateOf(e: FxLibItem): { text: string; tone: 'neutral' | 'ok' | 'warn' | 'fail' | 'brand'; err?: string } {
  if (e.origin === 'shared') return { text: 'kho chung', tone: 'brand' }
  const st = e.state || {}
  if (st.preview === 'error') return { text: 'lỗi dựng xem trước', tone: 'fail', err: st.preview_err || undefined }
  if (!e.preview) return { text: 'chờ dựng xem trước', tone: 'neutral' }
  if (st.label === 'error') return { text: 'lỗi Gemini', tone: 'fail', err: st.label_err || undefined }
  if (!e.label) return { text: 'chờ Gemini mô tả', tone: 'neutral' }
  if (st.share === 'approved') return { text: 'đã lên kho chung', tone: 'ok' }
  if (st.share === 'pending') return { text: 'đã gửi · chờ duyệt', tone: 'warn' }
  if (st.share === 'rejected') return { text: 'kho chung từ chối', tone: 'neutral' }
  if (st.share === 'error') return { text: 'lỗi gửi kho chung', tone: 'fail', err: st.share_err || undefined }
  if ((e.label.quality || 0) < 3) return { text: 'chỉ dùng ở máy này (chất lượng thấp)', tone: 'neutral' }
  return { text: 'chờ gửi kho chung', tone: 'neutral' }
}

/** Kho hiệu ứng tự viết: hiệu ứng AI đã viết code ở video trước, đóng gói để video sau dùng lại. */
export default function FxLibraryPage() {
  const [items, setItems] = useState<FxLibItem[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [playing, setPlaying] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [hs, setHs] = useState<FxHarvestStatus>(harvestStatus())

  const load = async () => {
    const r = await window.studio.fxlibList()
    if (r.ok) setItems(r.effects || [])
  }
  useEffect(() => {
    load()
    return subscribeHarvest(() => {
      setHs(harvestStatus())
      load()
    })
  }, [])

  const shown = useMemo(() => items.filter((e) => filter === 'all' || e.origin === filter), [items, filter])
  const nLocal = items.filter((e) => e.origin === 'local').length

  const bgSync = useLibrarySync(load)
  const syncBusy = busy === 'sync' || bgSync

  const doSync = async () => {
    setBusy('sync')
    setMsg(null)
    try {
      const r = await window.studio.syncLibrary()
      const f = r.fx
      setMsg(
        !r.ok
          ? 'Đồng bộ lỗi: ' + (r.error || 'không rõ')
          : f
            ? `Kho chung: +${f.added} mới, ${f.updated} cập nhật, ${f.removed} gỡ (tổng ${f.total})` +
              (f.errors?.length ? ` · ${f.errors.length} lỗi tải` : '')
            : 'Máy chủ chưa có kho hiệu ứng chung.'
      )
      await load()
    } catch (e) {
      setMsg('Đồng bộ lỗi: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  const relabel = async (id: string) => {
    setBusy(id)
    setMsg('Gemini đang xem lại hiệu ứng…')
    const r = await window.studio.fxlibLabel([id])
    setMsg(r.ok && r.labeled?.length ? 'Đã viết lại mô tả' : `Lỗi: ${r.error || Object.values(r.errors || {})[0] || 'không rõ'}`)
    if (r.ok && r.labeled?.length) kickHarvest(true) // co nhan -> gui kho chung
    setBusy(null)
    load()
  }

  const retry = async (id: string) => {
    await window.studio.fxlibRetry(id)
    kickHarvest(true)
    load()
  }

  const toggle = async (e: FxLibItem) => {
    await window.studio.fxlibToggle(e.id, !e.disabled)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Xoá hiệu ứng này khỏi kho trên máy này? (Kho chung trên máy chủ không bị xoá.)')) return
    await window.studio.fxlibDelete(id)
    load()
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Kho hiệu ứng</h1>
          <p className="mt-1 text-sm text-ink-800/50">
            Hiệu ứng AI đã viết code ở các video trước. Khi lập kế hoạch video mới, AI xem kho trước và dùng lại / sửa
            nhẹ hiệu ứng hợp ngữ cảnh thay vì viết lại từ đầu.
          </p>
          {hs.busy && hs.phase && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-600">
              <Spinner className="h-3 w-3" /> Đang chạy nền: {PHASE_LABEL[hs.phase]} ({hs.ids?.length || 0} hiệu ứng)
            </p>
          )}
          {!hs.busy && hs.labelOffline && (
            <p className="mt-1 text-xs text-amber-700">
              Gemini chưa dùng được (chưa đăng nhập / mất mạng) — hiệu ứng mới đang chờ mô tả, lần mở app sau sẽ tự thử
              lại.{' '}
              <button className="underline" onClick={() => kickHarvest(true)}>
                Thử ngay
              </button>
            </p>
          )}
          {msg && <p className="mt-1 text-xs text-brand-600">{msg}</p>}
        </div>
        <Button variant="outline" onClick={doSync} disabled={syncBusy} className="shrink-0">
          {syncBusy ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {syncBusy ? 'Đang đồng bộ…' : 'Đồng bộ kho'}
        </Button>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-ink-200/40 bg-white/50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
        <p className="text-[13px] leading-relaxed text-ink-800/65">
          Tự động: video <b>render xong</b> thì hiệu ứng của nó được đóng gói vào kho này, rồi chạy nền khi máy rảnh: dựng
          xem trước (trên nền trung tính, không dùng hình video của bạn) → Gemini xem và viết mô tả → gửi kho chung (cần
          duyệt trước khi phát cho các máy khác). Hiệu ứng tắt <Power className="inline h-3 w-3" /> sẽ không được gợi ý
          dùng lại.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-1">
        {(
          [
            ['all', `Tất cả (${items.length})`],
            ['local', `Của máy này (${nLocal})`],
            ['shared', `Kho chung (${items.length - nLocal})`]
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[13px] font-medium',
              filter === id ? 'bg-brand-50 text-brand-700' : 'text-ink-800/50 hover:text-ink-900'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {shown.map((e) => {
          const st = stateOf(e)
          const name = e.label?.name || e.design?.visual?.slice(0, 60) || e.id
          return (
            <Card key={e.id} className={cn(e.disabled && 'opacity-55')}>
              <CardBody className="flex gap-3 pt-4">
                <button
                  className="relative flex w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#15171c]"
                  style={{ aspectRatio: e.canvas === 'landscape' ? '16 / 9' : '9 / 16' }}
                  onClick={() => setPlaying(playing === e.id ? null : e.id)}
                  disabled={!e.preview}
                  title={e.preview ? 'Xem hiệu ứng' : 'Chưa có xem trước'}
                >
                  {e.preview ? (
                    <>
                      <video
                        className="h-full w-full object-contain"
                        src={fileUrl(e.preview)}
                        muted
                        loop
                        playsInline
                        autoPlay={playing === e.id}
                        ref={(v) => {
                          if (!v) return
                          if (playing === e.id) void v.play().catch(() => undefined)
                          else v.pause()
                        }}
                      />
                      <span className="absolute bottom-1 right-1 rounded bg-black/50 p-1 text-white">
                        {playing === e.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </span>
                    </>
                  ) : (
                    <span className="px-2 text-center text-[10px] text-white/40">chưa có xem trước</span>
                  )}
                </button>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="line-clamp-2 flex-1 font-medium text-ink-900">{name}</span>
                    <button
                      title="Nhờ Gemini xem lại và viết mô tả mới"
                      className="text-brand-600 hover:text-brand-700 disabled:opacity-30"
                      onClick={() => relabel(e.id)}
                      disabled={!!busy || !e.preview || e.origin === 'shared'}
                    >
                      {busy === e.id ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                    </button>
                    <button
                      title={e.disabled ? 'Bật lại (được gợi ý dùng lại)' : 'Tắt (không gợi ý dùng lại)'}
                      className={cn('hover:text-ink-900', e.disabled ? 'text-ink-800/30' : 'text-ink-800/50')}
                      onClick={() => toggle(e)}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button className="text-ink-800/30 hover:text-red-500" onClick={() => remove(e.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={st.tone}>{st.text}</Badge>
                    {st.err && (
                      <button
                        className="flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700"
                        title={st.err}
                        onClick={() => retry(e.id)}
                      >
                        <RotateCcw className="h-3 w-3" /> Thử lại
                      </button>
                    )}
                    <span className="text-[11px] text-ink-800/40">
                      {e.kind === 'transform' ? 'biến đổi khung' : e.layer === 'behind' ? 'lớp sau người' : 'lớp phủ'}
                      {e.duration ? ` · ${e.duration.toFixed(1)}s` : ''}
                      {e.label?.energy ? ` · ${ENERGY_LABEL[e.label.energy]}` : ''}
                      {e.works ? ` · ${[e.works.portrait && 'dọc', e.works.landscape && 'ngang'].filter(Boolean).join(' + ')}` : ''}
                      {` · dùng ${e.uses || 0} lần`}
                    </span>
                  </div>
                  {(e.label?.summary || e.design?.goal) && (
                    <p className="text-[12px] leading-relaxed text-ink-800/65">{e.label?.summary || e.design?.goal}</p>
                  )}
                  {e.label?.use_when && (
                    <p className="text-[12px] leading-relaxed text-ink-800/55">
                      <b className="text-ink-800/70">Dùng khi:</b> {e.label.use_when}
                    </p>
                  )}
                  {!!e.label?.tags?.length && <p className="text-[11px] text-ink-800/35">{e.label.tags.join(' · ')}</p>}
                </div>
              </CardBody>
            </Card>
          )
        })}
      </div>
      {!shown.length && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-ink-200/40 bg-white/40 px-4 py-6 text-center">
          <Info className="mx-auto h-4 w-4 text-ink-800/30" />
          <p className="w-full text-sm text-ink-800/40">
            Kho còn trống — tạo và render một video, hiệu ứng AI viết cho video đó sẽ tự vào đây. Hoặc bấm "Đồng bộ kho"
            để tải kho chung.
          </p>
        </div>
      )}
    </div>
  )
}
