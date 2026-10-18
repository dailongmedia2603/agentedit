import { useState } from 'react'
import { Send, Smartphone, X } from 'lucide-react'
import { Button, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { PostTargetPicker, type PickerMeta, type PostTarget } from '@/components/phoneagent/PostTargetPicker'
import { PostList } from '@/components/phoneagent/PostList'
import { toLocalInput, usePosts } from '@/components/phoneagent/usePhoneAgent'

const LAST_KEY = 'phoneagent.lastTarget'

function lastTarget(): PostTarget {
  try {
    const j = JSON.parse(localStorage.getItem(LAST_KEY) || 'null')
    if (j && typeof j === 'object') return { deviceId: j.deviceId || '', deviceName: j.deviceName, scriptId: j.scriptId || '', scriptName: j.scriptName, variables: {} }
  } catch {
    /* bo qua */
  }
  return { deviceId: '', scriptId: '', variables: {} }
}

function rememberTarget(t: PostTarget): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ deviceId: t.deviceId, deviceName: t.deviceName, scriptId: t.scriptId, scriptName: t.scriptName }))
  } catch {
    /* bo qua */
  }
}

/** Nut "Dang video" + hop thoai chon iPhone / kich ban / gio dang (Video da tao, Tao video, Automation Video). */
export function PostButton({
  video,
  title,
  origin,
  defaultCaption,
  className,
  size = 'md',
  variant = 'primary'
}: {
  video: string
  title: string
  origin: PostOrigin
  defaultCaption?: string
  className?: string
  size?: 'sm' | 'md'
  variant?: 'primary' | 'outline'
}) {
  const [open, setOpen] = useState(false)
  const posts = usePosts({ refId: origin.refId })
  const pending = posts.filter((p) => !['success', 'error', 'cancelled'].includes(p.status)).length
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" /> Đăng video{pending ? ` (${pending} đang chờ)` : ''}
      </Button>
      {open && <PostDialog video={video} title={title} origin={origin} defaultCaption={defaultCaption} posts={posts} onClose={() => setOpen(false)} />}
    </>
  )
}

function PostDialog({
  video,
  title,
  origin,
  defaultCaption,
  posts,
  onClose
}: {
  video: string
  title: string
  origin: PostOrigin
  defaultCaption?: string
  posts: PostJob[]
  onClose: () => void
}) {
  const [target, setTarget] = useState<PostTarget>(lastTarget)
  const [meta, setMeta] = useState<PickerMeta>({ ok: false })
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [at, setAt] = useState(() => toLocalInput(Date.now() + 60 * 60000))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  const submit = async () => {
    setErr('')
    setDone('')
    const ts = when === 'later' ? new Date(at).getTime() : undefined
    if (when === 'later' && (!ts || ts < Date.now() - 60000)) return setErr('Giờ đăng phải ở tương lai.')
    setBusy(true)
    const r = await window.studio.phoneagentCreate({
      video,
      title,
      origin,
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      scriptId: target.scriptId,
      scriptName: target.scriptName,
      videoVar: target.videoVar,
      variables: target.variables,
      scheduledAt: ts
    })
    setBusy(false)
    if (!r.ok) return setErr(r.error || 'Không tạo được lượt đăng.')
    rememberTarget(target)
    setDone(ts ? 'Đã lên lịch đăng — app cần đang mở tới giờ đăng.' : 'Đã gửi — app đang tải video lên và chạy kịch bản trên iPhone. Theo dõi tiến độ bên dưới.')
  }

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-[2px]" onClick={() => !busy && onClose()}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
            <Smartphone className="h-5 w-5 text-brand-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink-900">Đăng video lên kênh</div>
            <div className="mt-0.5 truncate text-[12.5px] text-ink-800/55" title={title}>
              {title} — iPhone tải video về rồi chạy kịch bản Phone Agent để đăng
            </div>
          </div>
          <button className="no-drag rounded-lg p-1.5 text-ink-800/40 hover:bg-black/5 hover:text-ink-900" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <PostTargetPicker value={target} onChange={setTarget} onMeta={setMeta} defaultCaption={defaultCaption} />

          <div>
            <div className="mb-1 text-xs font-medium text-ink-800/60">Thời gian đăng</div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-black/10 bg-ink-50 p-0.5">
                {(['now', 'later'] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setWhen(w)}
                    className={cn('no-drag rounded-md px-3 py-1.5 text-[12.5px] font-medium', when === w ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-800/50')}
                  >
                    {w === 'now' ? 'Đăng ngay' : 'Hẹn giờ'}
                  </button>
                ))}
              </div>
              {when === 'later' && (
                <input
                  type="datetime-local"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  className="no-drag h-9 rounded-xl border border-black/10 bg-ink-50 px-3 text-sm outline-none focus:border-brand-400"
                />
              )}
            </div>
            <div className="mt-1 text-[11.5px] text-ink-800/45">
              Lịch đăng do app giữ — app cần đang mở tới giờ đăng (đóng cửa sổ trên Mac app vẫn chạy nền). iPhone đang bận / ngoại tuyến thì lượt đăng tự chờ.
            </div>
          </div>

          {posts.length > 0 && (
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-ink-900">Các lượt đăng của video này</div>
              <PostList posts={posts} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-black/6 bg-ink-50/60 px-5 py-3">
          {err ? (
            <div className="mr-auto text-[12.5px] text-red-600">{err}</div>
          ) : done ? (
            <div className="mr-auto text-[12.5px] text-emerald-700">{done}</div>
          ) : (
            !meta.ok && meta.problem && <div className="mr-auto text-[12.5px] text-ink-800/50">{meta.problem}</div>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button size="sm" onClick={submit} disabled={busy || !meta.ok}>
            {busy ? <Spinner className="border-white/40 border-t-white" /> : <Send className="h-4 w-4" />}
            {when === 'later' ? 'Lên lịch đăng' : 'Đăng ngay'}
          </Button>
        </div>
      </div>
    </div>
  )
}
