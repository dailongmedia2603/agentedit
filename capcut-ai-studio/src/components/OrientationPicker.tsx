import { Ratio, RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

const OPTIONS: { id: VideoOrientation; label: string; note: string; size: string; icon: typeof Ratio }[] = [
  { id: 'portrait', label: 'Dọc 9:16', note: 'TikTok, Reels, Shorts', size: '1080×1920', icon: RectangleVertical },
  { id: 'landscape', label: 'Ngang 16:9', note: 'YouTube, Facebook, màn hình ngang', size: '1920×1080', icon: RectangleHorizontal }
]

export const ORIENTATION_LABEL: Record<VideoOrientation, string> = { portrait: 'dọc 9:16', landscape: 'ngang 16:9' }

/** Khung cua ban dung (spec) -> loai video */
export function orientationOf(dims?: { width?: number; height?: number } | null): VideoOrientation {
  return dims && (dims.width || 0) > (dims.height || 0) ? 'landscape' : 'portrait'
}

// Chon LOAI VIDEO tao ra (Tao video): doc 9:16 (mac dinh) / ngang 16:9 — AI lap ke hoach + render theo khung nay
export default function OrientationPicker({
  value,
  onChange,
  built
}: {
  value: VideoOrientation
  onChange: (v: VideoOrientation) => void
  /** Khung cua ban dung hien co (null = chua dung) — khac lua chon thi nhac phai tao lai */
  built?: VideoOrientation | null
}) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Ratio className="h-5 w-5 text-brand-500" />
        <span className="text-sm font-semibold text-ink-900">Loại video</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((o) => {
            const on = value === o.id
            const Icon = o.icon
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onChange(o.id)}
                aria-pressed={on}
                className={cn(
                  'no-drag flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors',
                  on ? 'border-brand-500 bg-brand-50/70' : 'border-black/10 bg-white/50 hover:border-brand-300'
                )}
              >
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    on ? 'bg-brand-500 text-white' : 'bg-ink-50 text-ink-800/50'
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    {o.label}
                    {o.id === 'portrait' && <span className="text-xs font-normal text-ink-800/45">(mặc định)</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-800/55">
                    {o.note} · {o.size}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        {built && built !== value && (
          <p className="text-xs text-amber-700">
            Bản dựng hiện có là video {ORIENTATION_LABEL[built]} — bấm tạo video để AI dựng lại theo khung{' '}
            {ORIENTATION_LABEL[value]}.
          </p>
        )}
      </CardBody>
    </Card>
  )
}
