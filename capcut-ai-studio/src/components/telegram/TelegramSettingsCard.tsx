import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Eye, EyeOff, Plug, Power, Save, Send, Trash2, UserX, XCircle } from 'lucide-react'
import { Badge, Button, Input, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { KEY_STORE } from '@/lib/platform'

const STATE_BADGE: Record<TelegramInfo['status']['state'], { tone: 'ok' | 'warn' | 'fail' | 'neutral'; label: string }> = {
  running: { tone: 'ok', label: 'đang chạy' },
  starting: { tone: 'warn', label: 'đang kết nối' },
  error: { tone: 'fail', label: 'lỗi' },
  off: { tone: 'neutral', label: 'đang tắt' }
}

const fmtTime = (t?: number) => (t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '')

/** Cai dat API > Bot Telegram: token bot (ma hoa), bat / tat, chat da xac thuc bang key phan mem. (2026-10-21) */
export function TelegramSettingsCard() {
  const [info, setInfo] = useState<TelegramInfo | null>(null)
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'toggle'>('')
  const [res, setRes] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    window.studio.telegramGet().then(setInfo)
    return window.studio.onTelegramStatus(setInfo)
  }, [])

  const save = async (enable?: boolean) => {
    setBusy('save')
    setRes(null)
    const r = await window.studio.telegramSave({ token: token.trim(), ...(enable !== undefined ? { enabled: enable } : {}) })
    setInfo(r.info)
    setBusy('')
    if (!r.ok) return setRes({ ok: false, msg: r.error || 'Lỗi' })
    setToken('')
    setRes({ ok: true, msg: r.info.bot ? `Đã lưu · @${r.info.bot.username}` : 'Đã lưu' })
  }
  const test = async () => {
    setBusy('test')
    setRes(null)
    const r = await window.studio.telegramTest(token.trim() || undefined)
    setRes({ ok: r.ok, msg: r.ok ? r.detail || 'Kết nối OK' : r.error || 'Lỗi' })
    setBusy('')
  }
  const toggle = async () => {
    if (!info) return
    setBusy('toggle')
    const r = await window.studio.telegramSave({ enabled: !info.enabled })
    setInfo(r.info)
    setBusy('')
  }
  const clear = async () => {
    if (!window.confirm('Xoá token bot Telegram khỏi máy này? Bot sẽ ngừng trả lời.')) return
    const r = await window.studio.telegramSave({ token: '', enabled: false })
    setInfo(r.info)
    setRes(null)
  }
  const removeChat = async (c: TelegramInfo['chats'][number]) => {
    if (!window.confirm(`Gỡ quyền của ${c.name}${c.username ? ` (@${c.username})` : ''}? Người này phải gửi lại key phần mềm mới dùng được bot.`)) return
    setInfo(await window.studio.telegramRemoveChat(c.chatId))
  }

  const st = info?.status
  const badge = st ? STATE_BADGE[st.state] : null

  return (
    <div className="card-surface overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/6 bg-white">
          <Send className="h-5 w-5 text-sky-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
            Bot Telegram
            {info && !info.has_token && <Badge tone="warn">chưa có token</Badge>}
            {info?.has_token && badge && <Badge tone={info.enabled ? badge.tone : 'neutral'}>{info.enabled ? badge.label : 'đang tắt'}</Badge>}
            {info?.bot && (
              <button className="no-drag inline-flex items-center gap-0.5 text-[12.5px] font-medium text-brand-600 hover:underline" onClick={() => window.studio.telegramOpenBot(info.bot!.username)}>
                @{info.bot.username} <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="text-xs text-ink-800/45">Yêu cầu Edit video / Tạo video qua Telegram — app gửi video hoàn chỉnh lại vào chat</div>
        </div>
        {info?.has_token && (
          <Button variant={info.enabled ? 'outline' : 'primary'} onClick={toggle} disabled={busy === 'toggle'}>
            {busy === 'toggle' ? <Spinner /> : <Power className="h-4 w-4" />} {info.enabled ? 'Tắt bot' : 'Bật bot'}
          </Button>
        )}
      </div>
      <div className="border-t border-black/6 px-5 py-4">
        <label className="mb-1 block text-xs text-ink-800/50">Token bot</label>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Input
              type={show ? 'text' : 'password'}
              placeholder={info?.token_hint ? `Đang lưu ${info.token_hint} — nhập để đổi` : '123456789:AAH...'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && token.trim() && save(true)}
            />
            <button className="no-drag absolute right-2 top-1/2 -translate-y-1/2 text-ink-800/40 hover:text-ink-900" onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="outline" onClick={() => save(info?.has_token ? undefined : true)} disabled={!token.trim() || busy === 'save'}>
            {busy === 'save' ? <Spinner /> : <Save className="h-4 w-4" />} Lưu
          </Button>
          <Button variant="outline" onClick={test} disabled={busy === 'test' || (!token.trim() && !info?.has_token)}>
            {busy === 'test' ? <Spinner /> : <Plug className="h-4 w-4" />} Kiểm tra kết nối
          </Button>
          {info?.has_token && (
            <Button variant="ghost" onClick={clear} title="Xoá token">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {res && (
          <div className={cn('mt-2 flex items-center gap-1.5 text-xs', res.ok ? 'text-emerald-600' : 'text-red-500')}>
            {res.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {res.msg}
          </div>
        )}
        {info?.enabled && st?.state === 'error' && st.error && (
          <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">{st.error}</div>
        )}
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-ink-800/55">
          <li>
            Mở{' '}
            <button className="no-drag inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline" onClick={() => window.studio.telegramOpenBotFather()}>
              @BotFather <ExternalLink className="h-3 w-3" />
            </button>{' '}
            trên Telegram, gõ <code>/newbot</code>, đặt tên → nhận <b>token</b> rồi dán vào ô trên và bấm Lưu (token lưu mã hoá qua {KEY_STORE}).
          </li>
          <li>Mở bot của bạn trên Telegram, bấm <b>Start</b> rồi gửi <b>key phần mềm Agent Edit</b> đang kích hoạt trên máy này — chỉ người gửi đúng key mới ra lệnh được (sai 5 lần thì khoá 1 giờ).</li>
          <li>Chọn menu <b>Edit video</b> / <b>Tạo video</b>, trả lời từng câu hỏi; xong app tự tạo video (mỗi video một mã) và gửi lại vào chat.</li>
        </ol>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-800/45">
          App cần đang mở thì bot mới trả lời. Bot nhận video tối đa 2 GB (gửi thẳng vào chat), hoặc link tải (Google Drive / Dropbox), hoặc chọn từ thư viện;
          video xong &gt; 50 MB được gửi bản nén kèm link tải bản gốc (48 giờ). Video tạo qua bot vẫn hiện ở “Video đã tạo” / “Tạo video”.
        </p>

        {!!info?.chats.length && (
          <div className="mt-4 border-t border-black/6 pt-3">
            <div className="mb-2 text-[13px] font-medium text-ink-900">Người dùng đã xác thực ({info.chats.length})</div>
            <div className="space-y-1.5">
              {info.chats.map((c) => (
                <div key={c.chatId} className="flex items-center gap-3 rounded-xl border border-black/8 bg-white px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-ink-900">
                      {c.name}
                      {c.username && <span className="ml-1 font-normal text-ink-800/45">@{c.username}</span>}
                    </div>
                    <div className="text-[11px] text-ink-800/45">
                      Xác thực {fmtTime(c.authorizedAt)}
                      {c.lastSeenAt ? ` · nhắn lần cuối ${fmtTime(c.lastSeenAt)}` : ''}
                    </div>
                  </div>
                  {!c.valid && <Badge tone="warn">key đã đổi — cần gửi lại</Badge>}
                  <Button variant="ghost" onClick={() => removeChat(c)} title="Gỡ quyền">
                    <UserX className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
