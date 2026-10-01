import { BadgeCheck, Type, Palette, Shapes, Image as ImageIcon, Move } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives'

// Form "Brand Guideline" (khong bat buoc) cua menu Tao video. Sidecar `brand_guide.py` dua tung truong vao dung buoc AI
// (chu / phu de / chu anh AI / anh AI / thiet ke / hieu ung) va ep font + ma mau bang code.

const FIELDS: {
  key: keyof BrandGuide
  label: string
  icon: typeof Type
  placeholder: string
}[] = [
  {
    key: 'typography',
    label: 'Typography – Font & chữ',
    icon: Type,
    placeholder:
      'VD: Tiêu đề Montserrat in hoa đậm, nội dung Be Vietnam Pro. Font có sẵn: Be Vietnam Pro, Montserrat, Anton, Oswald, Baloo 2, Lexend, Bungee, Dancing Script, Roboto Condensed, Gilroy, Great Vibes, Playfair Display, Barlow Condensed'
  },
  {
    key: 'colors',
    label: 'Màu sắc',
    icon: Palette,
    placeholder: 'VD: Màu chính #E4002B, phụ #FFC72C, nền trắng #FFFFFF (ghi mã màu để app dùng đúng màu)'
  },
  {
    key: 'graphics',
    label: 'Ngôn ngữ đồ họa',
    icon: Shapes,
    placeholder: 'VD: khối bo góc lớn, đường nét mảnh, sticker tối giản, không dùng hoạ tiết rối...'
  },
  {
    key: 'imagery',
    label: 'Phong cách hình ảnh',
    icon: ImageIcon,
    placeholder: 'VD: ảnh sản phẩm thật, ánh sáng tự nhiên, tông ấm, nền sạch, không hoạt hình...'
  },
  {
    key: 'motion',
    label: 'Ngôn ngữ chuyển động',
    icon: Move,
    placeholder: 'VD: chuyển động mượt, nhẹ nhàng, không rung lắc / chớp; chữ trượt lên mềm...'
  }
]

export const emptyBrandGuide: BrandGuide = { typography: '', colors: '', graphics: '', imagery: '', motion: '' }

/** Bo truong rong; khong co gi -> undefined (khong gui / khong luu) */
export function compactBrandGuide(v: BrandGuide | null | undefined): BrandGuide | undefined {
  const out: BrandGuide = {}
  for (const f of FIELDS) {
    const t = (v?.[f.key] || '').trim()
    if (t) out[f.key] = t
  }
  return Object.keys(out).length ? out : undefined
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
              <label key={f.key} className="block">
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
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}
