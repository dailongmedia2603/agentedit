import { ReactNode, useEffect, useState } from 'react'
import { KeyRound, Lock, WifiOff, RefreshCw, ShieldAlert, Clock } from 'lucide-react'
import logoUrl from '@/assets/logo.png'
import { Button, Input, Spinner } from '@/components/ui/primitives'

// Cong ban quyen: chua kich hoat / key bi khoa / het han / khong co mang -> man hinh nay che toan bo app.
// App da tung mo duoc (status ok) ma bi khoa giua chung (bam "Phan tich video") -> PHU LEN tren app (giu nguyen
// trang thai cac trang ben duoi, mo khoa xong lam tiep), khong unmount.

const PLAN_LABEL: Record<string, string> = { month: 'Tháng', year: 'Năm', lifetime: 'Vĩnh viễn' }
export const planLabel = (p?: string) => (p ? PLAN_LABEL[p] || p : '')
export const fmtDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

/** Go key: tu viet hoa + chen dau gach moi 5 ky tu (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX). */
function formatKey(v: string): string {
  const raw = v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 25)
  return raw.match(/.{1,5}/g)?.join('-') || ''
}

export function useLicense() {
  const [state, setState] = useState<LicenseState | null>(null)
  useEffect(() => {
    let alive = true
    const off = window.studio.onLicenseChanged((s) => alive && setState(s))
    window.studio
      .licenseCheck()
      .then((s) => alive && setState(s))
      .catch((e) => alive && setState({ status: 'error', message: String(e?.message || e) }))
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

export default function LicenseGate({ children }: { children: ReactNode }) {
  const state = useLicense()
  const [everOk, setEverOk] = useState(false)
  useEffect(() => {
    if (state?.status === 'ok') setEverOk(true)
  }, [state?.status])

  if (!state) {
    return (
      <div className="drag flex h-full w-full flex-col items-center justify-center gap-3 text-ink-800/50">
        <Spinner />
        <div className="text-sm">Đang kiểm tra bản quyền…</div>
      </div>
    )
  }
  if (state.status === 'ok') return <>{children}</>
  return (
    <>
      {everOk && <div className="pointer-events-none h-full w-full blur-[2px]">{children}</div>}
      <div className={everOk ? 'fixed inset-0 z-[100] bg-[#FDF6EF]/80 backdrop-blur-sm' : 'h-full w-full'}>
        <LicenseScreen state={state} />
      </div>
    </>
  )
}

function LicenseScreen({ state }: { state: LicenseState }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<'' | 'activate' | 'retry'>('')
  const [msg, setMsg] = useState('')
  const [entering, setEntering] = useState(state.status === 'need_key' || state.status === 'invalid_key')

  useEffect(() => {
    setMsg(state.message || '')
    if (state.status === 'need_key' || state.status === 'invalid_key') setEntering(true)
  }, [state])

  const activate = async () => {
    if (key.replace(/-/g, '').length < 25) {
      setMsg('Key gồm 25 ký tự (5 nhóm × 5).')
      return
    }
    setBusy('activate')
    setMsg('')
    try {
      const s = await window.studio.licenseActivate(key)
      if (s.status !== 'ok') setMsg(s.message || 'Kích hoạt không thành công.')
    } finally {
      setBusy('')
    }
  }
  const retry = async () => {
    setBusy('retry')
    try {
      await window.studio.licenseCheck()
    } finally {
      setBusy('')
    }
  }
  const otherKey = async () => {
    await window.studio.licenseForget()
    setKey('')
    setEntering(true)
  }

  const blocked = !entering
  const icon =
    state.status === 'offline' ? (
      <WifiOff className="h-6 w-6" />
    ) : state.status === 'locked' ? (
      <Lock className="h-6 w-6" />
    ) : state.status === 'expired' ? (
      <Clock className="h-6 w-6" />
    ) : state.status === 'other_machine' || state.status === 'error' ? (
      <ShieldAlert className="h-6 w-6" />
    ) : (
      <KeyRound className="h-6 w-6" />
    )
  const title = entering
    ? 'Kích hoạt Agent Edit'
    : state.status === 'offline'
      ? 'Cần kết nối mạng'
      : state.status === 'locked'
        ? 'Key đã bị khoá'
        : state.status === 'expired'
          ? 'Key đã hết hạn'
          : state.status === 'other_machine'
            ? 'Key đang dùng trên máy khác'
            : 'Chưa xác nhận được bản quyền'

  return (
    <div className="flex h-full w-full flex-col">
      <div className="drag h-12 shrink-0" />
      <div className="flex flex-1 items-center justify-center px-4 pb-12">
        <div className="card-surface w-full max-w-[440px] rounded-2xl p-7">
          <div className="flex items-center gap-2.5">
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg" draggable={false} />
            <span className="text-[15px] font-semibold text-ink-900">Agent Edit</span>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${blocked && state.status !== 'offline' ? 'bg-red-500/10 text-red-600' : 'bg-brand-500/10 text-brand-600'}`}>
              {icon}
            </div>
            <h1 className="text-[19px] font-semibold text-ink-900">{title}</h1>
          </div>

          {entering ? (
            <>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-800/60">
                Nhập key bạn đã mua. Sau khi kích hoạt, key gắn với máy này và không dùng được trên máy khác.
              </p>
              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault()
                  activate()
                }}
              >
                <Input
                  autoFocus
                  value={key}
                  onChange={(e) => setKey(formatKey(e.target.value))}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                  className="h-12 text-center font-mono text-[15px] tracking-wider"
                  spellCheck={false}
                />
                {msg && <div className="mt-2.5 text-[13px] text-red-600">{msg}</div>}
                <Button type="submit" size="lg" className="mt-4 w-full" disabled={!!busy}>
                  {busy === 'activate' ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                  Kích hoạt
                </Button>
              </form>
              {state.keyHint && state.status !== 'need_key' && state.status !== 'invalid_key' && (
                <button className="no-drag mt-3 w-full text-center text-[13px] text-ink-800/50 hover:text-ink-900" onClick={() => setEntering(false)}>
                  Quay lại
                </button>
              )}
            </>
          ) : (
            <>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-800/70">{msg}</p>
              {state.keyHint && (
                <div className="mt-3 text-[12px] text-ink-800/45">
                  Key trên máy này: <span className="font-mono">…{state.keyHint}</span>
                </div>
              )}
              <div className="mt-5 flex gap-2">
                <Button size="lg" className="flex-1" onClick={retry} disabled={!!busy}>
                  {busy === 'retry' ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                  Thử lại
                </Button>
                {state.status !== 'offline' && (
                  <Button size="lg" variant="outline" className="flex-1" onClick={otherKey} disabled={!!busy}>
                    Nhập key khác
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
