import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, ExternalLink, Eye, EyeOff, Plug, Save, Smartphone, Trash2, XCircle } from 'lucide-react'
import { Badge, Button, Input, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { KEY_STORE } from '@/lib/platform'
import { deviceStatusLabel, deviceTone } from '@/components/phoneagent/usePhoneAgent'

/** Cai dat API > Phone Agent: API token (ma hoa), dia chi may chu, kiem tra ket noi + xem iPhone. (2026-10-19) */
export function PhoneAgentSettingsCard() {
  const [masked, setMasked] = useState<PaMasked | null>(null)
  const [token, setToken] = useState('')
  const [base, setBase] = useState('')
  const [show, setShow] = useState(false)
  const [adv, setAdv] = useState(false)
  const [testing, setTesting] = useState(false)
  const [res, setRes] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [devices, setDevices] = useState<PaDevice[] | null>(null)

  useEffect(() => {
    window.studio.phoneagentGet().then((m) => {
      setMasked(m)
      setBase(m.base === m.default_base ? '' : m.base)
    })
  }, [])

  const save = async () => {
    const m = await window.studio.phoneagentSave({ ...(token.trim() ? { token: token.trim() } : {}), base: base.trim() })
    setMasked(m)
    setBase(m.base === m.default_base ? '' : m.base)
    setToken('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }
  const test = async () => {
    setTesting(true)
    setRes(null)
    setDevices(null)
    const r = await window.studio.phoneagentTest({ token: token.trim() || undefined, base: base.trim() || undefined })
    setRes({ ok: r.ok, msg: r.ok ? r.detail || 'Kết nối OK' : r.error || 'Lỗi' })
    if (r.ok) {
      // token / dia chi moi go ma ket noi duoc -> luu luon
      if (token.trim() || (base.trim() || masked?.default_base) !== masked?.base) await save()
      const d = await window.studio.phoneagentDevices()
      if (d.ok) setDevices(d.devices)
    }
    setTesting(false)
  }
  const clear = async () => {
    if (!window.confirm('Xoá API token Phone Agent khỏi máy này? Các lượt đăng đang chờ sẽ không chạy cho tới khi nhập lại.')) return
    setMasked(await window.studio.phoneagentSave({ token: '' }))
    setRes(null)
    setDevices(null)
  }

  return (
    <div className="card-surface overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/6 bg-white">
          <Smartphone className="h-5 w-5 text-brand-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
            API Phone Agent
            {masked && (masked.has_key ? <Badge tone="ok">đã có token</Badge> : <Badge tone="warn">chưa có token</Badge>)}
          </div>
          <div className="text-xs text-ink-800/45">Điều khiển iPhone để đăng video lên TikTok / Facebook theo kịch bản — dùng ở “Video đã tạo”, “Tạo video”, “Automation Video”</div>
        </div>
        {res && (
          <div className="flex items-center gap-1.5 text-xs">
            {res.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
            <span className={cn('max-w-[380px] truncate', res.ok ? 'text-emerald-600' : 'text-red-500')} title={res.msg}>
              {res.msg}
            </span>
          </div>
        )}
      </div>
      <div className="border-t border-black/6 px-5 py-4">
        <label className="mb-1 block text-xs text-ink-800/50">API Token</label>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Input
              type={show ? 'text' : 'password'}
              placeholder={masked?.key_hint ? `Đang lưu ${masked.key_hint} — nhập để đổi` : 'pa_live_...'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <button className="no-drag absolute right-2 top-1/2 -translate-y-1/2 text-ink-800/40 hover:text-ink-900" onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="outline" onClick={save} disabled={!token.trim() && base.trim() === (masked && masked.base !== masked.default_base ? masked.base : '')}>
            {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />} {saved ? 'Đã lưu' : 'Lưu'}
          </Button>
          <Button variant="outline" onClick={test} disabled={testing || (!token.trim() && !masked?.has_key)}>
            {testing ? <Spinner /> : <Plug className="h-4 w-4" />} Kiểm tra kết nối
          </Button>
          {masked?.has_key && (
            <Button variant="ghost" onClick={clear} title="Xoá token">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-800/55">
          Lấy token ở{' '}
          <button className="no-drag inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline" onClick={() => window.studio.phoneagentOpenSite()}>
            Phone Agent <ExternalLink className="h-3 w-3" />
          </button>{' '}
          › Cài đặt › Profile › API Token (bắt đầu bằng <code>pa_live_</code>, chỉ hiện 1 lần khi tạo). Token lưu mã hoá qua {KEY_STORE}.
          Video được tải lên máy chủ của app thành link tạm (tự xoá sau khi đăng) để iPhone tải về — kịch bản đăng cần có bước “Truyền file” dùng biến{' '}
          <code>{'{{video_id}}'}</code>. App cần đang mở thì lịch đăng mới chạy.
        </p>

        <button className="no-drag mt-3 flex items-center gap-1 text-[12px] font-medium text-ink-800/55 hover:text-ink-900" onClick={() => setAdv((v) => !v)}>
          <ChevronDown className={cn('h-3.5 w-3.5 transition', adv ? 'rotate-0' : '-rotate-90')} /> Địa chỉ máy chủ (nâng cao)
        </button>
        {adv && (
          <div className="mt-2">
            <Input value={base} onChange={(e) => setBase(e.target.value)} placeholder={masked?.default_base || 'https://phoneagent.io.vn/api/v1/external'} />
            <div className="mt-1 text-[11.5px] text-ink-800/45">Để trống = máy chủ mặc định. Chỉ đổi khi Phone Agent chạy trên tên miền riêng (self-hosted).</div>
          </div>
        )}

        {devices && (
          <div className="mt-4 border-t border-black/6 pt-3">
            <div className="mb-2 text-[13px] font-medium text-ink-900">iPhone trong tài khoản ({devices.length})</div>
            {!devices.length ? (
              <div className="text-[12px] text-ink-800/50">Chưa có iPhone nào — thêm máy trên dashboard Phone Agent.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {devices.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-xl border border-black/8 bg-white px-3 py-2">
                    <Smartphone className="h-4 w-4 shrink-0 text-ink-800/40" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-ink-900">{d.name}</div>
                      <div className="truncate text-[11px] text-ink-800/45">
                        {[d.model, d.iosVersion && `iOS ${d.iosVersion}`, typeof d.battery === 'number' && `pin ${d.battery}%`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <Badge tone={deviceTone(d.status)}>{deviceStatusLabel(d.status)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
