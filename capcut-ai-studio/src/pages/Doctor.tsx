import { useEffect, useRef } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Terminal,
  Cpu,
  KeyRound,
  Package,
  Clapperboard
} from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, Progress, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { IS_WIN } from '../lib/platform'

const GROUP_META: Record<DoctorCheck['group'], { title: string; info: string; icon: typeof Cpu }> = {
  system: { title: 'Hệ thống', info: IS_WIN ? 'Có sẵn trong Windows hoặc đóng gói trong app' : 'Có sẵn trong macOS hoặc đóng gói trong app', icon: Cpu },
  media: { title: 'Xử lý video & âm thanh', info: 'App tự tải đúng bản đã kiểm chứng (mã SHA-256)', icon: Clapperboard },
  python: { title: 'Python (sidecar)', info: 'Môi trường riêng của app, thư viện khoá đúng phiên bản', icon: Package },
  ai: { title: 'AI & tài khoản', info: 'App tự cài CLI; đăng nhập / API key làm trong Cài đặt API', icon: KeyRound }
}
const GROUPS: DoctorCheck['group'][] = ['system', 'media', 'python', 'ai']

// ten ngan cua tung cach sua (hien tren banner khi dang tu cai)
const FIX_LABEL: Record<string, string> = {
  uv: 'uv',
  python: 'Python + thư viện',
  ffmpeg: 'FFmpeg',
  whisper: 'model Whisper',
  chrome: 'Chrome Headless Shell',
  codex: 'Codex CLI',
  claude: 'Claude Code CLI',
  agy: 'Antigravity CLI',
  models: 'model thị giác máy (tách người / tách nền)'
}

function StatusIcon({ status }: { status: DoctorCheck['status'] }) {
  if (status === 'ok') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
  if (status === 'warn') return <AlertTriangle className="h-5 w-5 text-amber-500" />
  if (status === 'checking') return <Spinner />
  return <XCircle className="h-5 w-5 text-red-500" />
}

export default function DoctorPage({
  checks,
  loading,
  progress,
  fixing,
  logs,
  onRecheck,
  onFix,
  goSettings
}: {
  checks: DoctorCheck[]
  loading: boolean
  progress: DoctorProgress | null
  fixing: string | null
  logs: string[]
  onRecheck: () => void
  onFix: (id: string) => void
  goSettings: () => void
}) {
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logs])

  const installing = !!progress?.running
  const busy = installing || !!fixing
  const fails = checks.filter((c) => c.status === 'fail')
  const warns = checks.filter((c) => c.status === 'warn')
  const okN = checks.filter((c) => c.status === 'ok').length
  const allReady = checks.length > 0 && !installing && !fails.length
  const needLogin = fails.filter((c) => c.settings)
  const total = progress ? progress.done.length + progress.failed.length + progress.queue.length + (progress.current ? 1 : 0) : 0
  const step = progress ? progress.done.length + progress.failed.length + (progress.current ? 1 : 0) : 0
  // chi bao 'tai ~1 GB' khi dang cai may moi (Python / Whisper) — may cu thuong chi chep ffmpeg vai giay
  const bigInstall = !!progress && [progress.current, ...progress.queue, ...progress.done].some((x) => x === 'python' || x === 'whisper' || x === 'models')

  return (
    <div className="w-full px-8 py-7">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink-900">Doctor — Kiểm tra &amp; cài công cụ</h1>
          <p className="mt-1 text-sm text-ink-800/50">
            Mỗi lần mở app, Doctor tự kiểm tra đủ công cụ + đúng phiên bản; thiếu hay sai thì app tự cài đúng bản đã kiểm
            chứng. Bạn không cần dùng terminal.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap" onClick={onRecheck} disabled={loading || busy}>
          {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Kiểm tra lại
        </Button>
      </div>

      <div
        className={cn(
          'mb-5 rounded-2xl border p-4 transition-all',
          allReady ? 'border-emerald-400/40 bg-emerald-50' : installing ? 'border-brand-400/40 bg-brand-50/60' : 'border-black/8 bg-white/60'
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {allReady ? (
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
            ) : installing ? (
              <Spinner className="h-6 w-6 shrink-0" />
            ) : (
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-ink-900">
                {installing
                  ? `Đang tự cài ${progress?.current ? FIX_LABEL[progress.current] || progress.current : ''} (${step}/${total})`
                  : allReady
                    ? 'Sẵn sàng tạo video'
                    : checks.length
                      ? `Còn ${fails.length} mục chưa đạt`
                      : 'Đang kiểm tra máy...'}
              </div>
              <div className="text-xs text-ink-800/50">
                {installing
                  ? bigInstall
                    ? 'Có thể dùng các trang khác trong lúc chờ; máy mới tải khoảng 1 GB (Python, Whisper, Chrome, FFmpeg, CLI).'
                    : 'Có thể dùng các trang khác trong lúc chờ.'
                  : allReady
                    ? `${okN}/${checks.length} mục đạt${warns.length ? ` · ${warns.length} mục cảnh báo (vẫn tạo video được)` : ''}. Sang tab “Video Remotion”.`
                    : needLogin.length && needLogin.length === fails.length
                      ? 'Công cụ đã đủ — còn kết nối AI (đăng nhập tài khoản hoặc API key) trong Cài đặt API.'
                      : progress?.failed.length
                        ? `Tự cài lỗi: ${progress.failed.map((f) => FIX_LABEL[f.id] || f.id).join(', ')} — xem nhật ký bên dưới rồi bấm “Cài lại”.`
                        : 'Bấm “Cài” ở các mục còn thiếu bên dưới.'}
              </div>
            </div>
          </div>
          {!installing && needLogin.length > 0 && (
            <Button size="sm" onClick={goSettings}>
              Kết nối AI
            </Button>
          )}
        </div>
        {installing && total > 0 && (
          <div className="mt-3">
            <Progress value={(progress!.done.length + progress!.failed.length) * (100 / total)} />
          </div>
        )}
      </div>

      <div className="space-y-4">
        {GROUPS.map((g) => {
          const items = checks.filter((c) => c.group === g)
          if (!items.length) return null
          const meta = GROUP_META[g] || GROUP_META.system
          const GIcon = meta.icon
          return (
            <Card key={g}>
              <CardHeader className="flex items-center gap-2">
                <GIcon className="h-4 w-4 text-brand-500" />
                <span className="text-sm font-semibold text-ink-900">{meta.title}</span>
                <span className="text-xs text-ink-800/40">· {meta.info}</span>
              </CardHeader>
              <CardBody className="space-y-2">
                {items.map((c) => {
                  const working = !!c.fix && (fixing === c.fix || progress?.current === c.fix)
                  return (
                    <div key={c.id} className="flex items-start gap-3 rounded-xl border border-black/6 bg-ink-50 px-3 py-2.5">
                      <div className="mt-0.5">
                        <StatusIcon status={working ? 'checking' : c.status} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink-900">{c.label}</span>
                          {c.auto && c.status !== 'ok' && !working && <Badge tone="neutral">tự cài khi mở app</Badge>}
                        </div>
                        <div className="text-xs text-ink-800/55">{c.purpose}</div>
                        {(c.required || c.found) && (
                          <div className="mt-0.5 text-[11.5px] text-ink-800/45">
                            {c.required && (
                              <span>
                                Yêu cầu: <b className="font-medium text-ink-800/70">{c.required}</b>
                              </span>
                            )}
                            {c.required && ' · '}
                            <span>
                              Máy có: <b className="font-medium text-ink-800/70">{c.found || 'chưa có'}</b>
                            </span>
                          </div>
                        )}
                        {c.status !== 'ok' && (
                          <div className={cn('mt-0.5 text-xs', c.status === 'fail' ? 'text-red-600/80' : 'text-amber-700/90')}>
                            {c.detail}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {c.settings && c.status !== 'ok' && (
                          <Button size="sm" variant="outline" onClick={goSettings}>
                            Cấu hình
                          </Button>
                        )}
                        {c.fix && c.status !== 'ok' && (
                          <Button size="sm" onClick={() => onFix(c.fix!)} disabled={busy}>
                            {working ? <Spinner /> : <Download className="h-4 w-4" />}{' '}
                            {progress?.failed.some((f) => f.id === c.fix) ? 'Cài lại' : c.found ? 'Cập nhật' : 'Cài'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardBody>
            </Card>
          )
        })}
      </div>

      {logs.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-brand-500" />
            <span className="text-sm font-semibold text-ink-900">Nhật ký cài đặt</span>
          </CardHeader>
          <CardBody>
            <div
              ref={logRef}
              className="max-h-64 overflow-y-auto rounded-lg bg-ink-900 p-3 font-mono text-[11px] leading-relaxed text-ink-50/80"
            >
              {logs.map((l, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {l}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
