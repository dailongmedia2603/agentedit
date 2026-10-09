import { useState } from 'react'
import { AlertTriangle, ArrowLeftRight, BadgeCheck, HardDrive, Palette, Type, Upload, X } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { fontRole, importAndCheck, usePreviewFont, useUploadedFonts } from '@/lib/uploadedFonts'

// Form "Brand Guideline" (khong bat buoc) cua menu Tao video. Sidecar `brand_guide.py` dua tung truong vao dung buoc AI
// (chu / phu de / chu anh AI / anh AI / thiet ke / hieu ung) va ep font + ma mau bang code.
// 2026-10-09 bo 3 truong Ngon ngu do hoa / Phong cach hinh anh / Ngon ngu chuyen dong (user yeu cau).
// 2026-10-09 Typography: tai font len (CHI luu may nay, khong len kho chung) + chon lai bo font da luu (ca font kho chung
// do may chu dong bo) -> `fonts` = id theo thu tu (dau = tieu de, cuoi = noi dung).

type TextKey = 'typography' | 'colors'

const FIELDS: {
  key: TextKey
  label: string
  icon: typeof Type
  placeholder: string
}[] = [
  {
    key: 'typography',
    label: 'Typography – Font & chữ',
    icon: Type,
    placeholder:
      'VD: Tiêu đề Montserrat in hoa đậm, nội dung Be Vietnam Pro. Font có sẵn: Be Vietnam Pro, Montserrat, Anton, Oswald, Baloo 2, Lexend, Bungee, Dancing Script, Roboto Condensed, Gilroy, Great Vibes, Playfair Display, Barlow Condensed — hoặc tải font của bạn lên bên dưới'
  },
  {
    key: 'colors',
    label: 'Màu sắc',
    icon: Palette,
    placeholder: 'VD: Màu chính #E4002B, phụ #FFC72C, nền trắng #FFFFFF (ghi mã màu để app dùng đúng màu)'
  }
]

const MAX_FONTS = 3 // khop brand_guide.MAX_FONTS

export const emptyBrandGuide: BrandGuide = { typography: '', colors: '' }

/** Bo truong rong; khong co gi -> undefined (khong gui / khong luu) */
export function compactBrandGuide(v: BrandGuide | null | undefined): BrandGuide | undefined {
  const out: BrandGuide = {}
  for (const f of FIELDS) {
    const t = (v?.[f.key] || '').trim()
    if (t) out[f.key] = t
  }
  const ids = (v?.fonts || []).filter((x) => typeof x === 'string' && x)
  if (ids.length) out.fonts = ids.slice(0, MAX_FONTS)
  return Object.keys(out).length ? out : undefined
}

function FontChip({
  font,
  role,
  onRemove
}: {
  font: UploadedFont | undefined
  role: string
  onRemove: () => void
}) {
  usePreviewFont(font)
  return (
    <div className="flex items-center gap-2 rounded-xl border border-brand-400/40 bg-brand-50/60 py-1.5 pl-3 pr-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-700">{role}</span>
      <span
        className="text-[15px] text-ink-900"
        style={font ? { fontFamily: `"${font.css}", "Be Vietnam Pro", sans-serif`, fontWeight: Math.max(...font.weights) } : undefined}
      >
        {font ? font.label : 'Font đã bị gỡ'}
      </span>
      {font?.vi_missing && (
        <span title={`Thiếu chữ: ${font.vi_missing}`}>
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="no-drag rounded-md p-1 text-ink-800/40 hover:bg-black/5 hover:text-ink-900"
        title="Bỏ chọn font này"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function FontPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { fonts, reload } = useUploadedFonts()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'warn' | 'fail' } | null>(null)
  const byId = new Map(fonts.map((f) => [f.id, f]))
  const rest = fonts.filter((f) => !value.includes(f.id))
  const full = value.length >= MAX_FONTS

  const upload = async () => {
    const pick = await window.studio.pickFont()
    if (pick.canceled || !pick.filePaths?.length) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await importAndCheck(pick.filePaths, 'local')
      setMsg(r.msg)
      await reload()
      const got = r.fonts.map((f) => f.id).filter((id) => !value.includes(id))
      if (got.length) onChange([...value, ...got].slice(0, MAX_FONTS))
    } catch (e) {
      setMsg({ text: String((e as Error).message || e), tone: 'fail' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {value.map((id, i) => (
            <FontChip
              key={id}
              font={byId.get(id)}
              role={fontRole(i, value.length)}
              onRemove={() => onChange(value.filter((x) => x !== id))}
            />
          ))}
          {value.length >= 2 && (
            <button
              type="button"
              onClick={() => onChange([...value].reverse())}
              className="no-drag flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-ink-800/55 hover:bg-black/5 hover:text-ink-900"
              title="Đảo vai: font tiêu đề <-> font nội dung"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" /> Đảo vai
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={upload} disabled={busy || full}>
          {busy ? <Spinner /> : <Upload className="h-3.5 w-3.5" />} Tải font lên
        </Button>
        {rest.length > 0 && (
          <select
            value=""
            disabled={full}
            onChange={(e) => e.target.value && onChange([...value, e.target.value].slice(0, MAX_FONTS))}
            className="no-drag h-8 max-w-[280px] rounded-xl border border-black/10 bg-white px-2 text-[13px] text-ink-800/90 outline-none focus:border-brand-400 disabled:opacity-40"
          >
            <option value="">Chọn font đã lưu…</option>
            {rest.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} {f.scope === 'shared' ? '· kho chung' : '· máy này'}
                {f.vi_missing ? ' · ⚠ thiếu dấu' : ''}
              </option>
            ))}
          </select>
        )}
        <span className="text-[11.5px] text-ink-800/45">
          {full
            ? `Tối đa ${MAX_FONTS} font`
            : value.length
              ? 'Font đầu dùng cho tiêu đề / chữ nhấn, font cuối cho nội dung / phụ đề'
              : '.ttf / .otf / .woff — chọn nhiều file cùng bộ (Regular, Bold…); chỉ lưu trên máy này'}
        </span>
      </div>
      {msg && (
        <div
          className={cn(
            'flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px]',
            msg.tone === 'ok' && 'bg-emerald-500/10 text-emerald-700',
            msg.tone === 'warn' && 'bg-amber-500/10 text-amber-700',
            msg.tone === 'fail' && 'bg-red-500/10 text-red-600'
          )}
        >
          {msg.tone === 'ok' ? <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  )
}

export default function BrandGuideForm({
  value,
  onChange
}: {
  value: BrandGuide
  onChange: (fn: (current: BrandGuide) => BrandGuide) => void
}) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <BadgeCheck className="h-5 w-5 text-brand-500" />
        <span className="text-sm font-semibold text-ink-900">Brand Guideline</span>
        <Badge tone="neutral">Không bắt buộc</Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {FIELDS.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.key}>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-800/60">
                    <Icon className="h-3.5 w-3.5 text-brand-500" /> {f.label}
                  </span>
                  <textarea
                    value={value[f.key] || ''}
                    onChange={(e) => onChange((current: BrandGuide) => ({ ...current, [f.key]: e.target.value }))}
                    rows={3}
                    placeholder={f.placeholder}
                    className="no-drag w-full resize-none rounded-xl border border-black/10 bg-ink-50 px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-800/35 focus:border-brand-400 focus:bg-white"
                  />
                </label>
                {f.key === 'typography' && (
                  <FontPicker
                    value={value.fonts || []}
                    onChange={(ids) => onChange((current: BrandGuide) => ({ ...current, fonts: ids }))}
                  />
                )}
              </div>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}

