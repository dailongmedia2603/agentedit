// TU LIEU CUA NGUOI DUNG (2026-09-28): anh / video nguoi dung muon HIEN THI LEN video dang edit (khong noi vao
// mach video chinh). Moi tu lieu: cach dung + cach hien thi + ghi chu muc dich -> Gemini doc tung tu lieu -> AI lap
// ke hoach (R4) dat vao dung luc noi toi. Logic o sidecar/user_media.py; day chi la giao dien nhap + bao cao.
import { useState } from 'react'
import { ImagePlus, Film, Image as ImageIcon, X, RotateCcw, Sparkles, AlertTriangle, CheckCircle2, Plus, Eye } from 'lucide-react'
import { Button, Card, CardBody, CardHeader, Spinner, Badge } from '@/components/ui/primitives'
import { cn, fmtTime } from '@/lib/utils'
import { mediaUrl } from '../../remotion-src/Layers'

export const MEDIA_EXT = /\.(png|jpe?g|webp|gif|heic|heif|tiff?|bmp|avif|mp4|mov|m4v|webm|mkv|avi)$/i
export const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|heif|tiff?|bmp|avif)$/i

const USES: { id: UserMediaUse; label: string; hint: string }[] = [
  { id: 'show', label: 'Chèn vào video', hint: 'Hiện chính ảnh này lên video' },
  { id: 'ai_ref', label: 'Làm mẫu ảnh AI', hint: 'Không hiện ảnh gốc — AI tạo ảnh mới có đúng sản phẩm/chủ thể này' },
  { id: 'both', label: 'Cả hai', hint: 'Vừa hiện ảnh gốc, vừa làm mẫu cho ảnh AI' }
]

const PLACEMENTS: { id: UserMediaPlacement; label: string; image?: boolean }[] = [
  { id: 'auto', label: 'AI tự chọn theo nội dung' },
  { id: 'overlay', label: 'Khung nổi trên video (người nói vẫn hiện)' },
  { id: 'cutout', label: 'Tách nền, đặt như sticker', image: true },
  { id: 'split', label: 'Nửa trên màn hình, người nói nửa dưới' },
  { id: 'fullscreen', label: 'Toàn màn hình (tiếng nói vẫn chạy)' }
]

const LOAI: Record<string, string> = {
  san_pham: 'sản phẩm',
  logo: 'logo',
  nguoi: 'người',
  anh_chup_man_hinh: 'ảnh chụp màn hình',
  bang_gia_menu: 'bảng giá / menu',
  infographic: 'infographic',
  anh_boi_canh: 'ảnh bối cảnh',
  minh_hoa: 'minh hoạ',
  video_demo: 'video demo',
  video_san_pham: 'video sản phẩm',
  video_boi_canh: 'video bối cảnh',
  khac: 'khác'
}

function Thumb({ it, mediaBase }: { it: UserMediaItem; mediaBase: string }) {
  const [bad, setBad] = useState(false)
  const src = it.kind === 'video' ? it.thumb : mediaBase && !bad ? mediaUrl(mediaBase, it.workPath || it.path) : ''
  return src ? (
    <img src={src} onError={() => setBad(true)} className="h-20 w-16 shrink-0 rounded-lg bg-black/5 object-contain" alt="" />
  ) : (
    <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-black/5">
      {it.kind === 'video' ? <Film className="h-5 w-5 text-ink-800/40" /> : <ImageIcon className="h-5 w-5 text-ink-800/40" />}
    </div>
  )
}

function UsageLine({ u }: { u?: UserMediaUsage }) {
  if (!u) return null
  const shown = u.dung.length > 0
  return (
    <div
      className={cn(
        'mt-2 rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed',
        shown || u.anh_ai_dung_mau ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
      )}
    >
      {shown ? (
        <>
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
          Đã chèn:{' '}
          {u.dung.map((d, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {fmtTime(d.start)}–{fmtTime(d.end)} ({d.cach})
            </span>
          ))}
          {u.du_phong && <span className="text-emerald-700/70"> — hệ thống tự đặt theo lời nói khớp</span>}
        </>
      ) : u.use !== 'ai_ref' ? (
        <>
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          Chưa chèn{u.bo_qua ? `: ${u.bo_qua}` : ' — ghi rõ lúc nào cần hiện rồi lập lại plan'}
        </>
      ) : null}
      {u.anh_ai_dung_mau > 0 && (
        <div>
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          Làm mẫu cho {u.anh_ai_dung_mau} ảnh AI
        </div>
      )}
      {u.use !== 'show' && !u.anh_ai_dung_mau && u.kind === 'image' && (
        <div className="text-amber-800">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          Chưa có ảnh AI nào dùng ảnh này làm mẫu
        </div>
      )}
      {u.ly_do && <div className="text-ink-800/55">AI: {u.ly_do}</div>}
    </div>
  )
}

export default function UserMediaPanel({
  items,
  mediaBase,
  disabled,
  usage,
  dirty,
  onPick,
  onDropPaths,
  onChange,
  onRemove,
  onAnalyze,
  onReplan
}: {
  items: UserMediaItem[]
  mediaBase: string
  disabled?: boolean
  /** bao cao sau lap ke hoach (plan._pipeline.tu_lieu) */
  usage?: UserMediaUsage[]
  /** tu lieu doi sau lan lap plan gan nhat */
  dirty?: boolean
  onPick: () => void
  onDropPaths: (paths: string[]) => void
  onChange: (id: string, patch: Partial<UserMediaItem>) => void
  onRemove: (id: string) => void
  onAnalyze: (id: string, fresh: boolean) => void
  onReplan?: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (disabled) return
    const paths = Array.from(e.dataTransfer.files || [])
      .map((f) => window.studio.pathForFile(f))
      .filter((p): p is string => !!p && MEDIA_EXT.test(p))
    if (paths.length) onDropPaths(paths)
  }
  const byId = Object.fromEntries((usage || []).map((u) => [u.id, u]))
  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(dragOver && 'ring-2 ring-brand-400')}
    >
      <CardHeader className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ImagePlus className="h-5 w-5 text-brand-500" />
          <span className="text-sm font-semibold text-ink-900">Tư liệu của bạn — ảnh / video chèn lên video</span>
          <Badge tone="neutral">tuỳ chọn</Badge>
        </div>
        {items.length > 0 && (
          <Button variant="outline" size="sm" onClick={onPick} disabled={disabled}>
            <Plus className="h-4 w-4" /> Thêm ảnh / video
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-[13px] leading-relaxed text-ink-800/55">
          Ảnh sản phẩm, logo, ảnh chụp màn hình, bảng giá, clip demo… được <b className="text-ink-800/80">hiển thị LÊN video</b>{' '}
          đúng lúc bạn nói tới (không ghép vào mạch video). Ghi rõ mục đích để AI biết chèn ở đâu — Gemini sẽ xem từng tư liệu
          để hiểu nội dung, rồi AI lập kế hoạch chọn vị trí + cỡ phù hợp.
        </p>
        {!items.length ? (
          <button
            onClick={onPick}
            disabled={disabled}
            className={cn(
              'flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 transition-all disabled:opacity-50',
              dragOver ? 'border-brand-500 bg-brand-50' : 'border-black/12 bg-white/50 hover:border-brand-400 hover:bg-brand-50/50'
            )}
          >
            <ImagePlus className="h-6 w-6 text-brand-500" />
            <span className="text-sm font-medium text-ink-900">Chọn hoặc kéo-thả ảnh / video muốn chèn</span>
            <span className="text-xs text-ink-800/40">.jpg .png .heic .mp4 .mov …</span>
          </button>
        ) : (
          <div className="space-y-2.5">
            {items.map((it) => {
              const a = it.analysis
              const m = it.measured
              const showDetail = !!open[it.id]
              return (
                <div key={it.id} className="rounded-xl border border-black/6 bg-ink-50 p-3">
                  <div className="flex gap-3">
                    <Thumb it={it} mediaBase={mediaBase} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={it.kind === 'video' ? 'brand' : 'neutral'}>
                          {it.kind === 'video' ? 'video' : 'ảnh'}
                          {it.kind === 'video' && (it.duration || m?.duration) ? ` · ${fmtTime(it.duration || m?.duration || 0)}` : ''}
                        </Badge>
                        <span className="truncate text-sm font-medium text-ink-900" title={it.origPath || it.path}>
                          {it.name}
                        </span>
                        <div className="flex-1" />
                        <button
                          onClick={() => onRemove(it.id)}
                          disabled={disabled}
                          title="Bỏ tư liệu này"
                          className="rounded-lg p-1 text-ink-800/30 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {/* Gemini doc hieu */}
                      <div className="mt-1 text-[12px] leading-relaxed text-ink-800/60">
                        {it.analyzing ? (
                          <span className="flex items-center gap-1.5">
                            <Spinner className="h-3.5 w-3.5" /> Gemini đang xem tư liệu…
                          </span>
                        ) : it.error ? (
                          <span className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0 flex-1 truncate" title={it.error}>
                              Gemini chưa đọc được: {it.error}
                            </span>
                            <button className="shrink-0 underline" onClick={() => onAnalyze(it.id, true)} disabled={disabled}>
                              Đọc lại
                            </button>
                          </span>
                        ) : a ? (
                          <>
                            <span className="text-ink-800/80">
                              <b>Gemini hiểu:</b> {a.chu_the ? `${a.chu_the} — ` : ''}
                              {a.mo_ta}
                            </span>
                            <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                              {a.loai && <Badge tone="neutral">{LOAI[a.loai] || a.loai}</Badge>}
                              {a.can_doc_chu && <Badge tone="warn">có chữ cần đọc</Badge>}
                              {m?.alpha ? <Badge tone="ok">nền trong suốt</Badge> : a.tach_nen_duoc && <Badge tone="ok">tách nền được</Badge>}
                            </span>
                            <button
                              className="ml-2 inline-flex items-center gap-1 text-ink-800/45 hover:text-ink-900"
                              onClick={() => setOpen((o) => ({ ...o, [it.id]: !o[it.id] }))}
                            >
                              <Eye className="h-3 w-3" /> {showDetail ? 'Ẩn' : 'Chi tiết'}
                            </button>
                            <button
                              className="ml-2 inline-flex items-center gap-1 text-ink-800/45 hover:text-ink-900 disabled:opacity-40"
                              onClick={() => onAnalyze(it.id, true)}
                              disabled={disabled}
                              title="Cho Gemini xem lại tư liệu này"
                            >
                              <RotateCcw className="h-3 w-3" /> Đọc lại
                            </button>
                          </>
                        ) : (
                          <span className="flex items-center gap-2">
                            Chưa đọc hiểu.
                            <button className="underline" onClick={() => onAnalyze(it.id, false)} disabled={disabled}>
                              Cho Gemini xem
                            </button>
                          </span>
                        )}
                      </div>
                      {a && showDetail && (
                        <div className="mt-1.5 space-y-0.5 rounded-lg bg-white/70 px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-800/65">
                          {a.dac_diem_nhan_dien && <div>Đặc điểm: {a.dac_diem_nhan_dien}</div>}
                          {a.chu_trong_anh && <div>Chữ trong tư liệu: “{a.chu_trong_anh}”</div>}
                          {a.hop_khi_noi_ve && <div>Hợp khi nói về: {a.hop_khi_noi_ve}</div>}
                          {!!a.tu_khoa?.length && <div>Từ khoá: {a.tu_khoa.join(', ')}</div>}
                          {a.goi_y_hien_thi && (
                            <div>
                              Gemini gợi ý: {PLACEMENTS.find((p) => p.id === a.goi_y_hien_thi?.cach)?.label || a.goi_y_hien_thi.cach}
                              {a.goi_y_hien_thi.ly_do ? ` — ${a.goi_y_hien_thi.ly_do}` : ''}
                            </div>
                          )}
                          {!!a.doan_dep?.length && (
                            <div>
                              Đoạn đẹp: {a.doan_dep.map((d) => `${d.start.toFixed(1)}–${d.end.toFixed(1)}s`).join(', ')}
                            </div>
                          )}
                          {m?.width && (
                            <div className="text-ink-800/45">
                              {m.width}×{m.height}px
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Muc dich su dung */}
                  <div className="mt-3 grid gap-2.5 lg:grid-cols-[auto_1fr]">
                    <div className="space-y-2">
                      <div>
                        <div className="mb-1 text-[11px] font-medium text-ink-800/50">Dùng để</div>
                        {it.kind === 'image' ? (
                          <div className="inline-flex rounded-lg border border-black/10 bg-white p-0.5">
                            {USES.map((u) => (
                              <button
                                key={u.id}
                                title={u.hint}
                                disabled={disabled}
                                onClick={() => onChange(it.id, { use: u.id })}
                                className={cn(
                                  'rounded-md px-2.5 py-1 text-[12px] transition',
                                  it.use === u.id ? 'bg-brand-500 text-white' : 'text-ink-800/65 hover:bg-black/5'
                                )}
                              >
                                {u.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[12px] text-ink-800/65">Chèn vào video (tắt tiếng)</div>
                        )}
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] font-medium text-ink-800/50">Cách hiển thị</div>
                        <select
                          value={it.placement}
                          disabled={disabled || it.use === 'ai_ref'}
                          onChange={(e) => onChange(it.id, { placement: e.target.value as UserMediaPlacement })}
                          className="no-drag h-8 w-full rounded-lg border border-black/10 bg-white px-2 text-[12px] text-ink-900 outline-none focus:border-brand-400 disabled:opacity-50 lg:w-72"
                        >
                          {PLACEMENTS.filter((p) => !p.image || it.kind === 'image').map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium text-ink-800/50">Mục đích — tư liệu này là gì, chèn khi nào?</div>
                      <textarea
                        value={it.note}
                        disabled={disabled}
                        onChange={(e) => onChange(it.id, { note: e.target.value })}
                        rows={3}
                        placeholder={
                          it.kind === 'video'
                            ? 'VD: clip quay cận món ăn — chèn khi nói về cách làm'
                            : it.use === 'ai_ref'
                              ? 'VD: ảnh sản phẩm trà sữa size L — tạo ảnh AI có ly này khi nói về menu mùa hè'
                              : 'VD: ảnh sản phẩm trà sữa size L — hiện khi nói về giá / menu; logo quán — hiện ở cuối video'
                        }
                        className="no-drag w-full resize-none rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[13px] text-ink-900 outline-none placeholder:text-ink-800/35 focus:border-brand-400 disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <UsageLine u={byId[it.id]} />
                </div>
              )
            })}
          </div>
        )}
        {dirty && onReplan && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2.5 text-[12.5px] text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              Tư liệu đã thay đổi sau lần lập kế hoạch trước. Cập nhật kế hoạch để chèn theo tư liệu mới — các bước không liên
              quan (chọn chất liệu, timeline, hook) dùng lại kết quả cũ.
            </div>
            <Button size="sm" onClick={onReplan} disabled={disabled || items.some((x) => x.analyzing)}>
              <Sparkles className="h-4 w-4" /> Cập nhật kế hoạch
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
