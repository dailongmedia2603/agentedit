import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Image as ImageIcon, RotateCcw, Smartphone, Trash2, X } from 'lucide-react'
import { Badge, Button, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { fmtWhen, postBusy, postDone, postStatusLabel, postTone, toLocalInput } from '@/components/phoneagent/usePhoneAgent'

const ORIGIN: Record<PostOrigin['kind'], string> = { edit: 'Edit Video', motion: 'Tạo video', auto: 'Automation' }

function Shot({ file }: { file: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    window.studio.phoneagentShotUrl(file).then(setUrl)
  }, [file])
  return url ? <img src={url} alt="" className="max-h-[360px] rounded-xl border border-black/10" /> : <Spinner />
}

function PostRow({ p, showTitle }: { p: PostJob; showTitle?: boolean }) {
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const [editAt, setEditAt] = useState<string | null>(null)
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErr('')
    const r = await fn()
    if (!r.ok) setErr(r.error || 'Không thực hiện được')
  }
  const busy = postBusy(p.status)
  const done = postDone(p.status)
  return (
    <div className="rounded-xl border border-black/8 bg-white px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {p.status === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : p.status === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          ) : busy ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <CalendarClock className="h-4 w-4 text-amber-500" />
          )}
        </div>
        <button className="no-drag min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="flex flex-wrap items-center gap-2">
            {showTitle && <span className="max-w-[340px] truncate text-[13px] font-medium text-ink-900">{p.title}</span>}
            <Badge tone={postTone(p.status)}>{postStatusLabel[p.status]}</Badge>
            <span className="text-[12px] text-ink-800/55">
              {done && p.finishedAt ? `xong ${fmtWhen(p.finishedAt)}` : `đăng lúc ${fmtWhen(p.scheduledAt)}`}
            </span>
            {showTitle && <span className="text-[11px] text-ink-800/35">{ORIGIN[p.origin.kind]}</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-ink-800/50">
            <Smartphone className="h-3.5 w-3.5 shrink-0" /> {p.deviceName} · {p.scriptName}
          </div>
          {!done && p.message && !['Đã lên lịch', 'Chờ đăng'].includes(p.message) && <div className="mt-0.5 text-[12px] text-brand-700">{p.message}</div>}
          {p.status === 'error' && p.error && <div className="mt-0.5 text-[12px] text-red-600">{p.error}</div>}
          {p.status === 'scheduled' && p.error && <div className="mt-0.5 text-[11.5px] text-ink-800/45">Lần trước: {p.error}</div>}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {(p.status === 'scheduled' || p.status === 'waiting') && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditAt(editAt === null ? toLocalInput(p.scheduledAt) : null)} title="Đổi giờ đăng">
                <CalendarClock className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => act(() => window.studio.phoneagentCancel(p.id))} title="Huỷ lượt đăng">
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          {done && (
            <Button variant="outline" size="sm" onClick={() => act(() => window.studio.phoneagentRetry(p.id))} title="Chạy lại kịch bản đăng video này">
              <RotateCcw className="h-3.5 w-3.5" /> Đăng lại
            </Button>
          )}
          {done && (
            <Button variant="ghost" size="sm" onClick={() => act(() => window.studio.phoneagentDelete(p.id))} title="Xoá khỏi danh sách">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <button className="no-drag rounded-lg p-1.5 text-ink-800/40 hover:bg-black/5" onClick={() => setOpen((o) => !o)}>
            <ChevronDown className={cn('h-4 w-4 transition', open ? 'rotate-180' : '')} />
          </button>
        </div>
      </div>
      {editAt !== null && (
        <div className="mt-2 flex items-center gap-2 pl-7">
          <input
            type="datetime-local"
            value={editAt}
            onChange={(e) => setEditAt(e.target.value)}
            className="no-drag h-9 rounded-xl border border-black/10 bg-ink-50 px-3 text-sm outline-none focus:border-brand-400"
          />
          <Button
            size="sm"
            onClick={async () => {
              await act(() => window.studio.phoneagentReschedule(p.id, new Date(editAt).getTime()))
              setEditAt(null)
            }}
          >
            Lưu giờ
          </Button>
        </div>
      )}
      {err && <div className="mt-1 pl-7 text-[12px] text-red-600">{err}</div>}
      {open && (
        <div className="mt-2 space-y-2 border-t border-black/6 pt-2 pl-7 text-[12px] text-ink-800/65">
          {Object.entries(p.variables).map(([k, v]) => (
            <div key={k} className="whitespace-pre-wrap break-words">
              <span className="font-mono text-ink-800/45">{`{{${k}}}`}</span> {v || <i className="text-ink-800/35">(trống)</i>}
            </div>
          ))}
          {p.steps?.length ? (
            <div>
              <div className="mb-1 font-medium text-ink-900">Các bước trên iPhone</div>
              <ol className="space-y-0.5">
                {p.steps.map((s) => (
                  <li key={s.index} className={cn(s.status === 'error' ? 'text-red-600' : s.status === 'running' ? 'text-brand-700' : s.status === 'success' ? 'text-ink-800/70' : 'text-ink-800/40')}>
                    {s.index + 1}. {s.type === 'send_file' ? 'Chuyển video vào iPhone' : s.description || s.type} — {s.status === 'success' ? 'xong' : s.status === 'error' ? `lỗi${s.error ? ': ' + s.error : ''}` : s.status === 'running' ? 'đang chạy' : s.status}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {p.shot && (
            <div>
              <div className="mb-1 flex items-center gap-1 font-medium text-ink-900">
                <ImageIcon className="h-3.5 w-3.5" /> Ảnh màn hình iPhone (bước chụp màn hình cuối)
              </div>
              <Shot file={p.shot} />
            </div>
          )}
          <div className="text-[11px] text-ink-800/35">
            Tạo {fmtWhen(p.createdAt)}
            {p.executionId ? ` · lượt chạy Phone Agent ${p.executionId}` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

export function PostList({ posts, showTitle, empty }: { posts: PostJob[]; showTitle?: boolean; empty?: string }) {
  if (!posts.length) return empty ? <div className="rounded-xl bg-ink-50 px-3 py-3 text-[12.5px] text-ink-800/50">{empty}</div> : null
  return (
    <div className="space-y-2">
      {posts.map((p) => (
        <PostRow key={p.id} p={p} showTitle={showTitle} />
      ))}
    </div>
  )
}
