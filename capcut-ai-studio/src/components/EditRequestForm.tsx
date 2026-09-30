import { FileText, Target, Palette, Users, Timer } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/primitives'

// Form "Yeu cau edit" (dung chung Tao video / Video Remotion)
export default function EditRequestForm({
  value,
  onChange
}: {
  value: EditRequest
  onChange: (fn: (current: EditRequest) => EditRequest) => void
}) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-brand-500" />
        <span className="text-sm font-semibold text-ink-900">Yêu cầu edit</span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-800/60">
              <Target className="h-3.5 w-3.5 text-brand-500" /> Video này để làm gì?
            </span>
            <textarea
              value={value.purpose || ''}
              onChange={(e) => onChange((current: EditRequest) => ({ ...current, purpose: e.target.value }))}
              rows={3}
              placeholder="VD: để chạy QC, bán trà sữa, đăng hàng ngày..."
              className="no-drag w-full resize-none rounded-xl border border-black/10 bg-ink-50 px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-800/35 focus:border-brand-400 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-800/60">
              <Palette className="h-3.5 w-3.5 text-brand-500" /> Thích style / phong cách như nào?
            </span>
            <textarea
              value={value.style || ''}
              onChange={(e) => onChange((current: EditRequest) => ({ ...current, style: e.target.value }))}
              rows={3}
              placeholder="VD: nhanh, vui, bắt trend, sang, tối giản, cinematic..."
              className="no-drag w-full resize-none rounded-xl border border-black/10 bg-ink-50 px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-800/35 focus:border-brand-400 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-800/60">
              <Users className="h-3.5 w-3.5 text-brand-500" /> Khách hàng là ai?
            </span>
            <textarea
              value={value.audience || ''}
              onChange={(e) => onChange((current: EditRequest) => ({ ...current, audience: e.target.value }))}
              rows={3}
              placeholder="VD: nữ 18-25, dân văn phòng, chủ shop, người mới skincare..."
              className="no-drag w-full resize-none rounded-xl border border-black/10 bg-ink-50 px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-800/35 focus:border-brand-400 focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-800/60">
              <Timer className="h-3.5 w-3.5 text-brand-500" /> Độ dài video
            </span>
            <textarea
              value={value.duration || ''}
              onChange={(e) => onChange((current: EditRequest) => ({ ...current, duration: e.target.value }))}
              rows={3}
              placeholder="VD: 15s, 30-45s, khoảng 1 phút..."
              className="no-drag w-full resize-none rounded-xl border border-black/10 bg-ink-50 px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-800/35 focus:border-brand-400 focus:bg-white"
            />
          </label>
        </div>
      </CardBody>
    </Card>
  )
}
