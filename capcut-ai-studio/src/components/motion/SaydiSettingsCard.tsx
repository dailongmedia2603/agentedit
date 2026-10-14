import { useEffect, useState } from 'react'
import { AudioLines, CheckCircle2, ExternalLink, Eye, EyeOff, Plug, Save, Trash2, XCircle } from 'lucide-react'
import { Badge, Button, Input, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { KEY_STORE } from '@/lib/platform'

/** Cai dat API > SaydiVoice: key (ma hoa), kiem tra key, so video tao bang AI cung luc. (2026-10-14) */
export function SaydiSettingsCard() {
  const [masked, setMasked] = useState<{ has_key: boolean; key_hint: string } | null>(null)
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const [res, setRes] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [limit, setLimit] = useState<number | null>(null)
  const [limitDraft, setLimitDraft] = useState('')

  useEffect(() => {
    window.studio.saydiGet().then(setMasked)
    window.studio.motionGetLimit().then((n) => {
      setLimit(n)
      setLimitDraft(String(n))
    })
  }, [])

  const save = async () => {
    if (!key.trim()) return
    const m = await window.studio.saydiSave(key.trim())
    setMasked(m)
    setKey('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }
  const test = async () => {
    setTesting(true)
    setRes(null)
    const r = await window.studio.saydiTest(key.trim() || undefined)
    setRes({ ok: r.ok, msg: r.ok ? r.detail || 'Key hợp lệ' : r.error || 'Lỗi' })
    // key moi go ma hop le -> luu luon
    if (r.ok && key.trim()) await save()
    setTesting(false)
  }
  const clear = async () => {
    if (!window.confirm('Xoá API key SaydiVoice khỏi máy này?')) return
    setMasked(await window.studio.saydiSave(''))
    setRes(null)
  }
  const commitLimit = async () => {
    const n = Math.round(Number(limitDraft))
    if (!Number.isFinite(n) || n === limit) return setLimitDraft(String(limit ?? 1))
    const v = await window.studio.motionSetLimit(n)
    setLimit(v)
    setLimitDraft(String(v))
  }

  return (
    <div className="card-surface overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/6 bg-white">
          <AudioLines className="h-5 w-5 text-brand-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
            SaydiVoice
            {masked && (masked.has_key ? <Badge tone="ok">đã có key</Badge> : <Badge tone="warn">chưa có key</Badge>)}
          </div>
          <div className="text-xs text-ink-800/45">Giọng đọc cho “Tạo video” và “Automation Video” (giọng tiếng Việt, giọng riêng của tài khoản)</div>
        </div>
        {res && (
          <div className="flex items-center gap-1.5 text-xs">
            {res.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
            <span className={cn('max-w-[360px] truncate', res.ok ? 'text-emerald-600' : 'text-red-500')} title={res.msg}>
              {res.msg}
            </span>
          </div>
        )}
      </div>
      <div className="border-t border-black/6 px-5 py-4">
        <label className="mb-1 block text-xs text-ink-800/50">API Key</label>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Input
              type={show ? 'text' : 'password'}
              placeholder={masked?.key_hint ? `Đang lưu ${masked.key_hint} — nhập để đổi` : 'sv_...'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <button className="no-drag absolute right-2 top-1/2 -translate-y-1/2 text-ink-800/40 hover:text-ink-900" onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="outline" onClick={save} disabled={!key.trim()}>
            {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />} {saved ? 'Đã lưu' : 'Lưu'}
          </Button>
          <Button variant="outline" onClick={test} disabled={testing || (!key.trim() && !masked?.has_key)}>
            {testing ? <Spinner /> : <Plug className="h-4 w-4" />} Kiểm tra
          </Button>
          {masked?.has_key && (
            <Button variant="ghost" onClick={clear} title="Xoá key">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-800/55">
          Lấy API key ở{' '}
          <button className="no-drag inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline" onClick={() => window.studio.saydiOpenSite()}>
            voice.saydi.ai <ExternalLink className="h-3 w-3" />
          </button>
          . Key lưu mã hoá qua {KEY_STORE}, chỉ dùng khi video có lời đọc. Không có key vẫn tạo được video không lời.
        </p>
        <div className="mt-4 flex items-start gap-4 border-t border-black/6 pt-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink-900">Số video tạo bằng AI cùng lúc</div>
            <div className="mt-0.5 text-[12px] leading-relaxed text-ink-800/50">
              “Tạo video” + “Automation Video”: mỗi video Claude tự làm 15–40 phút và tốn nhiều hạn mức gói Claude. Quá số này thì video sau tự xếp hàng. Từ 1 đến 5.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Input
              type="number"
              min={1}
              max={5}
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
              onBlur={commitLimit}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-20 text-center font-semibold"
            />
            <span className="text-xs text-ink-800/45">video</span>
          </div>
        </div>
      </div>
    </div>
  )
}
