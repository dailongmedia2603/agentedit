// TU CAP NHAT — giao dien (electron/services/updater.ts). Ban day du / dev: phase 'disabled' -> khong hien gi.
//  - UpdateChip: nut nho tren thanh tieu de (dang tai % / "Cap nhat len x.y.z" / loi) + hop thoai xac nhan
//  - UpdateBanner: thong bao sau khi cap nhat xong / cap nhat loi (da giu ban cu)
//  - UpdateCheckRow: dong "Phien ban · Kiem tra cap nhat" trong o tai khoan
import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowUpCircle, CheckCircle2, Download, RefreshCw, X } from 'lucide-react'
import { Button, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { IS_WIN } from '@/lib/platform'

export function useUpdateState(): UpdateState | null {
  const [st, setSt] = useState<UpdateState | null>(null)
  useEffect(() => {
    let alive = true
    window.studio
      .updateState()
      .then((s) => alive && setSt(s))
      .catch(() => {})
    const off = window.studio.onUpdateChanged((s) => setSt(s))
    return () => {
      alive = false
      off()
    }
  }, [])
  return st
}

const mb = (n: number) => `${Math.max(1, Math.round(n / 1048576))} MB`
const pct = (p?: { received: number; total: number }) => (p && p.total ? Math.min(100, Math.floor((p.received / p.total) * 100)) : 0)

export function UpdateChip({ st, busy }: { st: UpdateState | null; busy: boolean }) {
  const [open, setOpen] = useState(false)
  if (!st || st.phase === 'disabled' || st.phase === 'idle') return null
  const v = st.offer?.version
  let chip: JSX.Element | null = null
  if (st.phase === 'downloading') {
    chip = (
      <span className="flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11.5px] font-medium text-ink-800/55">
        <Download className="h-3.5 w-3.5" /> Đang tải bản {v} · {pct(st.progress)}%
      </span>
    )
  } else if (st.phase === 'ready' || st.phase === 'applying') {
    chip = (
      <button
        className="brand-gradient flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold text-white shadow-[0_6px_18px_-8px_rgba(242,98,10,0.7)] hover:brightness-105"
        onClick={() => setOpen(true)}
      >
        {st.phase === 'applying' ? <Spinner className="h-3.5 w-3.5" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
        {st.phase === 'applying' ? 'Đang cập nhật…' : `Cập nhật lên ${v}`}
      </button>
    )
  } else if (st.phase === 'available') {
    chip = (
      <button
        className="flex items-center gap-1.5 rounded-full border border-brand-400/40 bg-brand-50 px-2.5 py-1 text-[11.5px] font-medium text-brand-700 hover:border-brand-400"
        onClick={() => setOpen(true)}
      >
        <ArrowUpCircle className="h-3.5 w-3.5" /> Có bản {v}
      </button>
    )
  } else if (st.phase === 'error') {
    chip = (
      <button
        className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11.5px] font-medium text-amber-700 hover:bg-amber-500/15"
        onClick={() => setOpen(true)}
      >
        <AlertTriangle className="h-3.5 w-3.5" /> {v ? `Chưa tải được bản ${v}` : 'Lỗi cập nhật'}
      </button>
    )
  }
  return (
    <>
      <div className="no-drag">{chip}</div>
      {open && <UpdateDialog st={st} busy={busy} onClose={() => setOpen(false)} />}
    </>
  )
}

function UpdateDialog({ st, busy, onClose }: { st: UpdateState; busy: boolean; onClose: () => void }) {
  const [err, setErr] = useState('')
  const applying = st.phase === 'applying'
  const ready = st.phase === 'ready'
  const blocked = ready && !!st.message // vd macOS chay tu .dmg -> khong thay duoc app
  const apply = async () => {
    setErr('')
    const r = await window.studio.updateApply(busy)
    if (!r.ok) setErr(r.error || 'Không cập nhật được.')
  }
  return (
    <div
      className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-[2px]"
      onClick={() => !applying && onClose()}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white text-left shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
            <ArrowUpCircle className="h-5 w-5 text-brand-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink-900">Agent Edit {st.offer?.version}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-800/55">
              Bạn đang dùng bản {st.current.version}
              {st.offer ? ` · bản mới ${mb(st.offer.size)}` : ''}
            </div>
          </div>
          {!applying && (
            <button className="rounded-lg p-1 text-ink-800/40 hover:bg-black/5 hover:text-ink-900" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-3 px-5 py-4 text-[12.5px] leading-relaxed text-ink-800/70">
          {st.offer?.notes ? (
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-ink-50 px-3.5 py-3">{st.offer.notes}</div>
          ) : null}

          {st.phase === 'downloading' && (
            <div>
              <div className="mb-1.5 flex justify-between text-[12px] text-ink-800/55">
                <span>Đang tải bản cập nhật…</span>
                <span>
                  {st.progress ? `${mb(st.progress.received)} / ${mb(st.progress.total)}` : ''} · {pct(st.progress)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/5">
                <div className="brand-gradient h-full rounded-full transition-all" style={{ width: `${pct(st.progress)}%` }} />
              </div>
            </div>
          )}

          {ready && !blocked && (
            <div>
              App sẽ <b className="font-semibold text-ink-800/85">đóng lại, cài bản mới rồi tự mở lại</b> (khoảng 1 phút). Dự án,
              key bản quyền và cài đặt của bạn được giữ nguyên.
              {st.needsAdmin && <div className="mt-1.5">Máy sẽ hỏi mật khẩu quản trị để thay ứng dụng.</div>}
              {!IS_WIN && (
                <div className="mt-1.5 text-ink-800/50">
                  Nếu macOS hỏi quyền dùng “Keychain” khi mở bản mới, nhập mật khẩu máy và chọn “Luôn cho phép”.
                </div>
              )}
            </div>
          )}

          {busy && ready && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Đang có video xử lý — đợi xong rồi cập nhật để không mất tiến độ.
            </div>
          )}

          {(st.message || err) && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {err || st.message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/6 bg-ink-50/60 px-5 py-3">
          {!applying && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Để sau
            </Button>
          )}
          {(st.phase === 'error' || st.phase === 'available') && st.offer && (
            <Button size="sm" onClick={() => window.studio.updateDownload()}>
              <RefreshCw className="h-4 w-4" /> Tải lại
            </Button>
          )}
          {(ready || applying) && (
            <Button size="sm" onClick={apply} disabled={applying || busy || blocked}>
              {applying ? <Spinner /> : <ArrowUpCircle className="h-4 w-4" />}
              {applying ? 'Đang đóng app để cập nhật…' : 'Cập nhật & mở lại'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Thong bao 1 lan sau khi mo ban moi (hoac khi cap nhat loi va da giu ban cu). */
export function UpdateBanner({ st }: { st: UpdateState | null }) {
  const [hide, setHide] = useState(false)
  const ok = st?.justUpdated
  const failed = st?.updateFailed
  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => setHide(true), 10000)
    return () => clearTimeout(t)
  }, [ok])
  if (hide || (!ok && !failed)) return null
  return (
    <div className="no-drag absolute left-1/2 top-14 z-40 -translate-x-1/2">
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12.5px] font-medium shadow-[0_12px_30px_-12px_rgba(0,0,0,0.35)]',
          failed ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
        )}
      >
        {failed ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {failed
          ? `Cập nhật lên ${failed} không thành công — đã giữ nguyên bản đang dùng.`
          : `Đã cập nhật lên bản ${ok!.to}.`}
        <button className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100" onClick={() => setHide(true)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/** Trong o tai khoan: phien ban + nut kiem tra cap nhat. */
export function UpdateCheckRow({ st }: { st: UpdateState | null }) {
  const [checked, setChecked] = useState(false)
  if (!st || st.phase === 'disabled') return null
  const check = async () => {
    setChecked(false)
    await window.studio.updateCheck().catch(() => null)
    setChecked(true)
  }
  let note = ''
  if (st.checking) note = 'Đang kiểm tra…'
  else if (st.phase === 'downloading') note = `Đang tải bản ${st.offer?.version} (${pct(st.progress)}%)`
  else if (st.phase === 'ready') note = `Bản ${st.offer?.version} đã sẵn sàng — bấm nút trên thanh tiêu đề`
  else if (st.phase === 'available') note = `Có bản ${st.offer?.version}`
  else if (st.phase === 'error') note = st.message || 'Lỗi cập nhật'
  else if (st.message) note = st.message
  else if (checked) note = 'Bạn đang dùng bản mới nhất'
  return (
    <div className="mt-3 border-t border-black/6 pt-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-800/40">Phiên bản</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span>v{st.current.version}</span>
        <button
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          onClick={check}
          disabled={st.checking}
        >
          {st.checking ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Kiểm tra cập nhật
        </button>
      </div>
      {note && <div className="mt-1 text-[11.5px] text-ink-800/50">{note}</div>}
    </div>
  )
}
