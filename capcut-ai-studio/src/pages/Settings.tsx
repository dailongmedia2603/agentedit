import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Eye,
  EyeOff,
  Plug,
  Save,
  CheckCircle2,
  XCircle,
  ChevronDown,
  KeyRound,
  BadgeCheck,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Download,
  LogIn,
  ExternalLink,
  ArrowUpCircle,
  X
} from 'lucide-react'
import { Button, Input, Spinner, Badge } from '@/components/ui/primitives'
import { GeminiMark, OpenAIMark, ClaudeMark } from '@/components/BrandIcons'
import { cn } from '@/lib/utils'
import { IS_WIN, KEY_STORE, TERM } from '../lib/platform'

interface ProviderMeta {
  id: string
  name: string
  /** Dong mo ta duoi ten — tuy AI nao dang lap ke hoach */
  role: (planner: PlanProvider) => string
  mark: (p: { className?: string }) => JSX.Element
  placeholderModel: string
  /** Co CLI chinh chu chay bang tai khoan da dang nhap khong */
  canSubscribe: boolean
  /** Nhan nut chon che do dung CLI */
  subLabel: string
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini',
    name: 'Gemini',
    role: () => 'Đọc & hiểu video (native video)',
    mark: GeminiMark,
    placeholderModel: 'gemini-2.5-flash',
    canSubscribe: true,
    subLabel: 'Tài khoản Google (Antigravity CLI)'
  },
  {
    id: 'gpt',
    name: 'GPT',
    role: (pl) =>
      pl === 'gpt'
        ? 'Lập kế hoạch edit chi tiết · phân tích video mẫu · tạo ảnh AI'
        : 'Phân tích video mẫu · tạo ảnh AI (lập kế hoạch đang dùng Claude)',
    mark: OpenAIMark,
    placeholderModel: 'gpt-4o',
    canSubscribe: true,
    subLabel: 'Gói subscription'
  },
  {
    id: 'claude',
    name: 'Claude',
    role: (pl) =>
      pl === 'claude' ? 'Lập kế hoạch edit chi tiết' : 'Chưa dùng — chọn Claude ở mục “AI lập kế hoạch” phía trên',
    mark: ClaudeMark,
    placeholderModel: 'claude-opus-5',
    canSubscribe: true,
    subLabel: 'Gói subscription'
  }
]

/** Provider lam duoc khau lap ke hoach (khop sidecar config.PLAN_PROVIDERS) */
const PLANNERS: { id: PlanProvider; name: string; mark: (p: { className?: string }) => JSX.Element; note: string }[] = [
  { id: 'gpt', name: 'GPT', mark: OpenAIMark, note: 'Codex CLI (ChatGPT) hoặc API key OpenAI' },
  { id: 'claude', name: 'Claude', mark: ClaudeMark, note: 'Claude Code CLI (Claude Pro / Max) hoặc API key Anthropic' }
]

interface LocalProvider {
  base_url: string
  model: string
  api_key: string
  hint: string
  has_key: boolean
  auth_mode: AuthMode
  sub_model: string
  sub_effort: string
}
type Local = Record<string, LocalProvider>

/** Nhan tieng Viet cho muc suy nghi (reasoning effort) cua Codex / Claude Code */
const EFFORT_LABEL: Record<string, string> = {
  minimal: 'Tối thiểu',
  low: 'Thấp — nhanh nhất',
  medium: 'Vừa',
  high: 'Cao — kỹ hơn, chậm hơn',
  xhigh: 'Rất cao — chậm',
  max: 'Tối đa — rất chậm',
  ultra: 'Ultra — chậm nhất, tự chia việc'
}
/** Dung khi chua doc duoc danh muc model cua Codex */
const EFFORT_FALLBACK = ['low', 'medium', 'high', 'xhigh']

/** Chon muc suy nghi cho model dang chon (Codex: danh muc that cua CLI; Claude Code: low..max) */
function EffortPicker({
  model,
  value,
  reasoning,
  onChange
}: {
  model: string
  value: string
  reasoning?: Record<string, { default: string; levels: string[] }>
  onChange: (v: string) => void
}) {
  const info = reasoning?.[model]
  const levels = info?.levels?.length ? info.levels : EFFORT_FALLBACK
  // Doi sang model khong ho tro muc dang chon -> ve "mac dinh" (chi khi da biet danh muc that)
  useEffect(() => {
    if (info && value && !info.levels.includes(value)) onChange('')
  }, [info, value, onChange])
  const def = info?.default
  return (
    <div className="relative">
      <select
        className={cn(
          'no-drag h-10 w-full appearance-none rounded-xl border border-black/10 bg-ink-50 pl-3 pr-9 text-sm text-ink-900',
          'focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/15 transition'
        )}
        value={levels.includes(value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Mặc định của model{def ? ` (${EFFORT_LABEL[def] || def})` : ''}</option>
        {levels.map((lv) => (
          <option key={lv} value={lv}>
            {EFFORT_LABEL[lv] || lv}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-800/40" />
    </div>
  )
}

/** Trang thai 1 luot dang nhap / cai CLI chay trong app (moi luc chi 1 luot) */
interface LoginRun {
  /** provider: 'gpt' | 'gemini' | 'claude' */
  id: string
  kind: 'login' | 'install' | 'update'
  mode: 'browser' | 'device'
  running: boolean
  lines: string[]
  result?: { ok: boolean; text: string }
}

/** Huong dan hien trong khung cho khi dang nhap Antigravity CLI (dien ra trong Terminal) */
const AGY_LOGIN_STEPS = [
  `1. Trong cửa sổ ${TERM} vừa mở, agy hiện một đường link đăng nhập Google.`,
  '2. Copy link, dán vào trình duyệt đang đăng nhập tài khoản Google (AI Pro) của bạn.',
  `3. Nếu trang hiện mã (authorization code): dán vào ${TERM} rồi Enter.`,
  `4. Thấy ô chat của agy là xong — app tự nhận ra. Gõ /exit để đóng ${TERM}.`
]

/** Huong dan hien trong khung cho khi dang nhap Claude Code (dien ra trong Terminal) */
const CLAUDE_LOGIN_STEPS = [
  `1. Cửa sổ ${TERM} vừa mở chạy “claude auth login” và mở trình duyệt đăng nhập Claude.`,
  `2. Trình duyệt không tự mở: copy link trong ${TERM} dán vào trình duyệt đang đăng nhập tài khoản Claude.`,
  `3. Trang hiện mã (code): dán vào ${TERM} rồi Enter.`,
  `4. ${TERM} báo đăng nhập thành công là xong — app tự nhận ra.`
]

/** Provider dang nhap trong cua so Terminal (app chi hoi lai trang thai) */
const TERMINAL_LOGIN = new Set(['gemini', 'claude'])

/** Ten model cua Gemini CLI cu da luu -> ten trong Antigravity CLI (khop sidecar AGY_LEGACY_MODELS) */
const AGY_LEGACY_MODELS: Record<string, string> = {
  'gemini-3.1-pro-preview': 'gemini-3.1-pro-high',
  'gemini-3-pro-preview': 'gemini-3.1-pro-high',
  'gemini-2.5-pro': 'gemini-3.1-pro-high',
  'gemini-3-flash-preview': 'gemini-3.8-flash-high',
  'gemini-2.5-flash': 'gemini-3.8-flash-medium'
}

/** Link dang nhap chinh chu CLI in ra (mo bang nut khi trinh duyet khong tu mo) */
const LOGIN_URL_RE = /https:\/\/(auth\.openai\.com|chatgpt\.com|accounts\.google\.com|claude\.com|claude\.ai|platform\.claude\.com)\/[^\s"'<>]+/g

/** Khung chu CLI dang chay (dang nhap / cai dat), kem nut Huy + nut mo link dang nhap */
/** O dan ma xac thuc (trang dang nhap hien ma thay vi tu xong) -> gui vao CLI dang chay */
function CodeInput() {
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<'' | 'ok' | 'err'>('')
  const send = async () => {
    const r = await window.studio.settingsCliLoginInput(code).catch(() => ({ ok: false }))
    setSent(r.ok ? 'ok' : 'err')
    if (r.ok) setCode('')
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        className="no-drag min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-brand-400"
        placeholder="Trang đăng nhập hiện mã? Dán mã vào đây"
        value={code}
        onChange={(e) => {
          setCode(e.target.value)
          setSent('')
        }}
        onKeyDown={(e) => e.key === 'Enter' && code.trim() && send()}
      />
      <Button variant="outline" size="sm" disabled={!code.trim()} onClick={send}>
        Gửi mã
      </Button>
      {sent === 'ok' && <span className="text-[11.5px] text-emerald-600">Đã gửi</span>}
      {sent === 'err' && <span className="text-[11.5px] text-red-600">Chưa gửi được</span>}
    </div>
  )
}

function TaskLog({ run, title, onCancel, codeInput }: { run: LoginRun; title: string; onCancel?: () => void; codeInput?: boolean }) {
  const urls = Array.from(new Set(run.lines.join(' ').match(LOGIN_URL_RE) || []))
  return (
    <div className="rounded-lg border border-black/8 bg-white/70 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-900">
        <Spinner />
        {title}
        <div className="flex-1" />
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-3.5 w-3.5" /> Huỷ
          </Button>
        )}
      </div>
      {!!urls.length && (
        <div className="mt-2 flex flex-wrap gap-2">
          {urls.slice(0, 2).map((u) => (
            <Button key={u} variant="outline" size="sm" onClick={() => window.studio.openLoginUrl(u)}>
              <ExternalLink className="h-3.5 w-3.5" /> Mở trang đăng nhập
            </Button>
          ))}
        </div>
      )}
      {codeInput && <CodeInput />}
      {!!run.lines.length && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md bg-ink-900 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-50/85">
          {run.lines.slice(-12).map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Khoi lenh copy duoc — dung cho huong dan cai/dang nhap CLI */
function CommandLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-black/8 bg-ink-50 px-3 py-2">
      <code className="flex-1 select-all font-mono text-[12.5px] text-ink-900">{cmd}</code>
      <button
        className="no-drag shrink-0 text-ink-800/40 transition hover:text-ink-900"
        title="Sao chép"
        onClick={() => {
          navigator.clipboard.writeText(cmd)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        }}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

const CUSTOM = '__custom__'

/** Chon model cho che do subscription — dropdown that, kem loi thoat nhap tay */
function ModelPicker({
  value,
  models,
  onChange,
  placeholder = 'Tên model, ví dụ gpt-6-luna'
}: {
  value: string
  models: CliModel[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const known = models.some((m) => m.id === value)
  // Dang go tay khi: vua bam "Nhap tay", hoac DA CO danh sach ma gia tri khong nam trong do.
  // (Truoc day tinh 1 lan luc mount: danh sach model tai SAU -> ket o o nhap tay mai.)
  const [forceManual, setForceManual] = useState(false)
  const manual = forceManual || (models.length > 0 && !!value && !known)
  const picked = models.find((m) => m.id === value)
  // Chua tai xong danh sach -> tam hien dung gia tri dang chon
  const options: CliModel[] = models.length ? models : value ? [{ id: value, label: value, note: 'đang tải danh sách…' }] : []

  if (manual) {
    return (
      <div>
        <Input
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          className="no-drag mt-1 text-[11.5px] text-brand-600 hover:underline"
          onClick={() => {
            setForceManual(false)
            if (!models.some((m) => m.id === value)) onChange(models[0]?.id || '')
          }}
        >
          ← Chọn từ danh sách
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <select
          className={cn(
            'no-drag h-10 w-full appearance-none rounded-xl border border-black/10 bg-ink-50 pl-3 pr-9 text-sm text-ink-900',
            'focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/15 transition'
          )}
          value={known || !models.length ? value : models[0]?.id || ''}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setForceManual(true)
              return
            }
            onChange(e.target.value)
          }}
        >
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.note ? `${m.label} — ${m.note}` : m.label}
            </option>
          ))}
          <option value={CUSTOM}>Nhập tay tên model khác…</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-800/40" />
      </div>
      {picked && (
        <div className="mt-1 font-mono text-[11px] text-ink-800/35">{picked.id}</div>
      )}
    </div>
  )
}

/** Dang nhap CLI ngay trong app: Codex (`codex login`) hoac Antigravity CLI (mo Terminal chay `agy`) */
function LoginBox({
  provider,
  login,
  onLogin,
  onCancel,
  loginCmd
}: {
  provider: string
  login?: LoginRun | null
  onLogin: (mode: 'browser' | 'device') => void
  onCancel?: () => void
  loginCmd?: string
}) {
  const running = !!login?.running
  const google = provider === 'gemini'
  const claude = provider === 'claude'
  // agy / Claude Code: mac dinh dang nhap NGAY TRONG APP (CLI tu mo trinh duyet); cua so Terminal / PowerShell la du phong
  const cliAuth = TERMINAL_LOGIN.has(provider)
  const terminal = cliAuth && login?.mode === 'device'
  return (
    <div className="mt-2.5 space-y-2">
      {!running && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onLogin('browser')}>
            <LogIn className="h-4 w-4" />{' '}
            {google ? 'Đăng nhập Google' : claude ? 'Đăng nhập Claude' : 'Đăng nhập bằng ChatGPT'}
          </Button>
          {cliAuth && (
            <button
              className="no-drag text-[12px] text-brand-600 hover:underline"
              onClick={() => onLogin('device')}
              title={`Mở cửa sổ ${TERM} chạy ${google ? 'agy' : 'claude auth login'} — dán link vào đúng trình duyệt có tài khoản`}
            >
              Không đăng nhập được? Mở cửa sổ {TERM}
            </button>
          )}
          {!cliAuth && (
            <button
              className="no-drag text-[12px] text-brand-600 hover:underline"
              onClick={() => onLogin('device')}
              title="Codex hiện một đường link và mã một lần để bạn nhập trên trình duyệt"
            >
              Không mở được trình duyệt? Đăng nhập bằng mã
            </button>
          )}
        </div>
      )}
      {running && login && (
        <TaskLog
          run={login}
          onCancel={onCancel}
          // Windows: agy dang nhap trong cua so rieng (doc ma tu console cua no) -> o dan ma cua app khong dung cho agy
          codeInput={cliAuth && !terminal && !(IS_WIN && google)}
          title={
            terminal
              ? claude
                ? `Đang chờ bạn đăng nhập Claude trong cửa sổ ${TERM} vừa mở…`
                : `Đang chờ bạn đăng nhập trong cửa sổ ${TERM} vừa mở…`
              : cliAuth
                ? `Đang chờ bạn đăng nhập ${google ? 'tài khoản Google' : 'tài khoản Claude'} trên trình duyệt vừa mở…`
                : login.mode === 'device'
                ? 'Mở link bên dưới, đăng nhập ChatGPT rồi nhập mã Codex hiện ra…'
                : 'Đang chờ bạn đăng nhập ChatGPT trên trình duyệt…'
          }
        />
      )}
      {!running && login?.result && !login.result.ok && (
        <div className="whitespace-pre-line text-[12px] text-red-600">{login.result.text}</div>
      )}
      {loginCmd && (
        <div className="text-[11.5px] text-ink-800/45">
          {cliAuth ? (
            <>
              Hoặc tự mở {TERM}, chạy <code className="font-mono">{loginCmd}</code> và đăng nhập, rồi bấm “Kiểm tra
              lại”.
            </>
          ) : (
            <>
              Hoặc chạy trong {TERM} rồi bấm “Kiểm tra lại”: <code className="font-mono">{loginCmd}</code>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Trang thai CLI: da cai / da dang nhap chua, kem nut cai tu dong + dang nhap ngay trong app */
function CliPanel({
  provider,
  status,
  loading,
  onRefresh,
  login,
  onLogin,
  onInstall,
  onUpdate,
  onCancelLogin
}: {
  provider: string
  status?: CliStatus
  loading: boolean
  onRefresh: () => void
  /** Luot dang nhap / cai dat dang chay (hoac vua xong) cua CHINH provider nay */
  login?: LoginRun | null
  onLogin?: (mode: 'browser' | 'device') => void
  onInstall?: () => void
  /** Claude: cap nhat Claude Code khi co model can ban CLI moi hon */
  onUpdate?: () => void
  onCancelLogin?: () => void
}) {
  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-black/8 bg-ink-50 px-4 py-3 text-sm text-ink-800/55">
        <Spinner /> Đang kiểm tra CLI trên máy…
      </div>
    )
  }
  if (!status) {
    return (
      <div className="rounded-xl border border-black/8 bg-ink-50 px-4 py-3 text-sm text-ink-800/55">
        Chưa đọc được trạng thái CLI.{' '}
        <button className="no-drag font-medium text-brand-600 underline" onClick={onRefresh}>
          Thử lại
        </button>
      </div>
    )
  }

  const ready = status.installed && status.logged_in
  const tone = ready
    ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
    : 'border-amber-500/30 bg-amber-500/[0.07]'

  return (
    <div className={cn('rounded-xl border px-4 py-3', tone)}>
      <div className="flex items-start gap-2.5">
        {ready ? (
          <BadgeCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-600" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-900">
            {status.plan_label}
            <span className="font-normal text-ink-800/40">qua {status.label}</span>
            {status.version && (
              <span className="rounded bg-black/6 px-1.5 py-px font-mono text-[10.5px] font-normal text-ink-800/55">
                {status.version}
              </span>
            )}
          </div>
          <div className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-800/60">
            {status.detail}
          </div>

          {!status.installed && status.install_cmd && (
            <>
              {onInstall && (status.npm_package || provider === 'gemini') && (
                <div className="mt-2.5 space-y-2">
                  {login?.kind === 'install' && login.running ? (
                    <TaskLog run={login} title={`Đang cài ${status.label}…`} onCancel={onCancelLogin} />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={onInstall} disabled={!!login?.running}>
                        <Download className="h-4 w-4" /> Cài {status.label} tự động
                      </Button>
                      <span className="text-[11.5px] text-ink-800/45">
                        {status.label === 'Codex CLI' ? (
                          <>bản chính chủ của OpenAI (GitHub), đúng phiên bản đã kiểm, kiểm mã SHA-256 — không cần Node.js</>
                        ) : status.label === 'Claude Code CLI' ? (
                          <>trình cài chính chủ của Anthropic — cài vào {IS_WIN ? '%USERPROFILE%\\.local\\bin' : '~/.local/bin'}, không cần Node.js</>
                        ) : IS_WIN ? (
                          <>trình cài chính chủ của Google (install.ps1) — cài vào %LOCALAPPDATA%\\agy\\bin</>
                        ) : (
                          <>trình cài chính chủ của Google — cài vào ~/.local/bin, thêm dòng PATH vào ~/.zprofile</>
                        )}
                      </span>
                    </div>
                  )}
                  {login?.kind === 'install' && !login.running && login.result && !login.result.ok && (
                    <div className="whitespace-pre-line text-[12px] text-red-600">{login.result.text}</div>
                  )}
                </div>
              )}
              <div className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-ink-800/70">
                <Download className="h-3.5 w-3.5" /> {onInstall ? 'Hoặc cài' : 'Bước 1 — cài CLI'} trong {TERM}
              </div>
              <CommandLine cmd={status.install_cmd} />
              <div className="mt-2 text-[12px] font-medium text-ink-800/70">
                {provider === 'gemini' ? 'Sau đó — đăng nhập tài khoản Google' : 'Bước 2 — đăng nhập bằng tài khoản có gói'}
              </div>
              <CommandLine cmd={status.login_cmd || ''} />
            </>
          )}
          {status.installed && !status.logged_in && onLogin && (
            <LoginBox
              provider={provider}
              login={login?.kind === 'login' ? login : null}
              onLogin={onLogin}
              onCancel={onCancelLogin}
              loginCmd={status.login_cmd}
            />
          )}
          {status.installed && onUpdate && (!!status.outdated_models?.length || login?.kind === 'update') && (
            <div className="mt-2.5 space-y-2">
              {login?.kind === 'update' && login.running ? (
                <TaskLog run={login} title={`Đang cập nhật ${status.label}…`} onCancel={onCancelLogin} />
              ) : (
                !!status.outdated_models?.length && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={onUpdate} disabled={!!login?.running}>
                      <ArrowUpCircle className="h-4 w-4" /> Cập nhật Claude Code
                    </Button>
                    <span className="text-[11.5px] text-ink-800/50">
                      Bản đang cài chưa chạy được{' '}
                      {(status.models || [])
                        .filter((m) => status.outdated_models?.includes(m.id))
                        .map((m) => m.label)
                        .join(', ')}{' '}
                      — chạy <code className="font-mono">{status.update_cmd || 'claude update'}</code>
                    </span>
                  </div>
                )
              )}
              {login?.kind === 'update' && !login.running && login.result && !login.result.ok && (
                <div className="whitespace-pre-line text-[12px] text-red-600">{login.result.text}</div>
              )}
            </div>
          )}
          {status.installed && login?.result?.ok && (login.kind !== 'login' || status.logged_in) && (
            <div className="mt-1.5 text-[12px] font-medium text-emerald-700">{login.result.text}</div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} title="Kiểm tra lại">
          {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [local, setLocal] = useState<Local>({})
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({ gemini: true, gpt: true, claude: true })
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [saved, setSaved] = useState(false)
  const [cli, setCli] = useState<Record<string, CliStatus>>({})
  const [cliLoading, setCliLoading] = useState(false)
  const [login, setLogin] = useState<LoginRun | null>(null)
  // AI lap ke hoach (B1..B7, R4, R5) — luu cung nut "Luu tat ca"
  const [planner, setPlanner] = useState<PlanProvider>('claude')
  useEffect(() => {
    window.studio.settingsGetPlanner().then((v) => setPlanner(v === 'gpt' ? 'gpt' : 'claude'))
  }, [])

  // Dong chu CLI in ra khi dang nhap / cai dat (link dang nhap, ma 1 lan, log npm) -> hien trong khung
  useEffect(
    () =>
      window.studio.onCliLoginLog((line) =>
        setLogin((cur) => (cur?.running ? { ...cur, lines: [...cur.lines.slice(-60), line] } : cur))
      ),
    []
  )

  useEffect(() => {
    window.studio.settingsGet().then((m) => {
      const l: Local = {}
      for (const p of PROVIDERS) {
        const cur = m[p.id]
        l[p.id] = {
          base_url: cur?.base_url || '',
          model: cur?.model || '',
          api_key: '',
          hint: cur?.key_hint || '',
          has_key: cur?.has_key || false,
          auth_mode: cur?.auth_mode || 'api_key',
          sub_model: (p.id === 'gemini' && AGY_LEGACY_MODELS[cur?.sub_model || '']) || cur?.sub_model || '',
          sub_effort: cur?.sub_effort || ''
        }
      }
      setLocal(l)
    })
  }, [])

  /** Doc trang thai CLI cua cac provider `ids` (Codex / Antigravity CLI), gop vao `cli` */
  const refreshCli = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    setCliLoading(true)
    try {
      const all = await Promise.all(ids.map((id) => window.studio.settingsCliStatus(id).catch(() => null)))
      setCli((cur) => {
        const next = { ...cur }
        for (const r of all) if (r?.ok && r.status) Object.assign(next, r.status)
        return next
      })
    } finally {
      setCliLoading(false)
    }
  }, [])

  // Chi doc trang thai CLI cua provider THUC SU dang dung CLI; moi provider tu dong doc 1 lan
  // (doc hong thi bam "Kiem tra lai" — khong tu thu lai lien tuc)
  const tried = useRef(new Set<string>())
  const subIds = PROVIDERS.filter((p) => p.canSubscribe && local[p.id]?.auth_mode === 'subscription').map((p) => p.id)
  const pending = subIds.filter((id) => !cli[id] && !tried.current.has(id)).join(',')
  useEffect(() => {
    if (!pending || cliLoading) return
    const ids = pending.split(',')
    ids.forEach((id) => tried.current.add(id))
    refreshCli(ids)
  }, [pending, cliLoading, refreshCli])

  const update = (id: string, field: keyof LocalProvider, val: string) => {
    setLocal((s) => ({ ...s, [id]: { ...s[id], [field]: val } }))
    setSaved(false)
  }
  // Setter on dinh cho tung o "Muc suy nghi" (EffortPicker goi trong useEffect)
  const effortSetters = useMemo(() => {
    const make = (id: string) => (v: string) => {
      setLocal((s) => (s[id] && s[id].sub_effort !== v ? { ...s, [id]: { ...s[id], sub_effort: v } } : s))
      setSaved(false)
    }
    return { gpt: make('gpt'), claude: make('claude') } as Record<string, (v: string) => void>
  }, [])

  const choosePlanner = (v: PlanProvider) => {
    setPlanner(v)
    setSaved(false)
    setOpen((s) => ({ ...s, [v]: true }))
  }

  // Dang nhap agy / Claude Code dien ra trong cua so Terminal -> hoi lai trang thai moi 4s (toi da 10 phut)
  const termPoll = useRef({ cancel: false })
  const waitTerminalLogin = async (id: string): Promise<boolean> => {
    termPoll.current.cancel = false
    const until = Date.now() + 10 * 60 * 1000
    while (Date.now() < until && !termPoll.current.cancel) {
      await new Promise((r) => setTimeout(r, 4000))
      if (termPoll.current.cancel) break
      const r = await window.studio.settingsCliStatus(id).catch(() => null)
      const st = r?.ok ? r.status?.[id] : undefined
      if (st) setCli((cur) => ({ ...cur, [id]: st }))
      if (st?.logged_in) return true
    }
    return false
  }

  const startLogin = async (id: string, mode: 'browser' | 'device') => {
    const who = id === 'gemini' ? 'Antigravity CLI' : id === 'claude' ? 'Claude Code' : 'Codex'
    // huong dan tung buoc chi cho cach dang nhap trong cua so Terminal / PowerShell (du phong)
    const steps = mode !== 'device' ? [] : id === 'gemini' ? AGY_LOGIN_STEPS : id === 'claude' ? CLAUDE_LOGIN_STEPS : []
    setLogin({ id, kind: 'login', mode, running: true, lines: steps })
    const r = await window.studio
      .settingsCliLogin(mode, id === 'gemini' || id === 'claude' ? id : 'gpt')
      .catch((e) => ({ ok: false, error: String(e) }) as const)
    let res = r as { ok: boolean; already?: boolean; canceled?: boolean; terminal?: boolean; error?: string }
    if (res.ok && res.terminal) {
      const done = await waitTerminalLogin(id)
      res = done
        ? { ok: true }
        : termPoll.current.cancel
          ? { ok: false, canceled: true }
          : { ok: false, error: 'Quá 10 phút chưa thấy đăng nhập — đăng nhập xong thì bấm “Kiểm tra lại”.' }
    }
    setLogin((cur) => ({
      id,
      kind: 'login',
      mode,
      running: false,
      lines: cur?.lines || [],
      result: res.ok
        ? { ok: true, text: res.already ? `${who} đã đăng nhập sẵn.` : `Đăng nhập ${who} thành công.` }
        : res.canceled
          ? { ok: false, text: 'Đã huỷ đăng nhập.' }
          : { ok: false, text: 'Chưa đăng nhập được: ' + (res.error || 'không rõ lỗi') }
    }))
    await refreshCli([id])
  }

  const startUpdate = async (id: string) => {
    setLogin({ id, kind: 'update', mode: 'browser', running: true, lines: [] })
    const r = await window.studio.settingsCliUpdate('claude').catch((e) => ({ ok: false, error: String(e) }) as const)
    const res = r as { ok: boolean; version?: string | null; changed?: boolean; canceled?: boolean; error?: string }
    setLogin((cur) => ({
      id,
      kind: 'update',
      mode: 'browser',
      running: false,
      lines: cur?.lines || [],
      result: res.ok
        ? {
            ok: true,
            text: res.changed
              ? `Đã cập nhật Claude Code${res.version ? ` lên ${res.version}` : ''}.`
              : `Claude Code đã là bản mới nhất${res.version ? ` (${res.version})` : ''}.`
          }
        : res.canceled
          ? { ok: false, text: 'Đã huỷ cập nhật.' }
          : { ok: false, text: 'Chưa cập nhật được: ' + (res.error || 'không rõ lỗi') }
    }))
    await refreshCli([id])
  }

  const startInstall = async (id: string) => {
    setLogin({ id, kind: 'install', mode: 'browser', running: true, lines: [] })
    const r = await window.studio.settingsCliInstall(id).catch((e) => ({ ok: false, error: String(e) }) as const)
    const res = r as { ok: boolean; version?: string; canceled?: boolean; error?: string }
    setLogin((cur) => ({
      id,
      kind: 'install',
      mode: 'browser',
      running: false,
      lines: cur?.lines || [],
      result: res.ok
        ? { ok: true, text: `Đã cài xong${res.version ? ` (${res.version})` : ''}.` }
        : res.canceled
          ? { ok: false, text: 'Đã huỷ cài đặt.' }
          : { ok: false, text: 'Chưa cài được: ' + (res.error || 'không rõ lỗi') }
    }))
    await refreshCli([id])
  }

  const setMode = (id: string, mode: AuthMode) => {
    setLocal((s) => ({ ...s, [id]: { ...s[id], auth_mode: mode } }))
    setSaved(false)
    setTestResult((r) => {
      const n = { ...r }
      delete n[id]
      return n
    })
    if (mode === 'subscription') {
      tried.current.add(id)
      refreshCli([id])
    }
  }

  const buildProvidersMap = (): ProvidersMap => {
    const out: ProvidersMap = {}
    for (const p of PROVIDERS) {
      const l = local[p.id]
      if (!l) continue
      out[p.id] = {
        base_url: l.base_url,
        model: l.model,
        api_key: l.api_key,
        auth_mode: l.auth_mode,
        sub_model: l.sub_model,
        sub_effort: l.sub_effort
      }
      if (!l.api_key) delete (out[p.id] as Partial<ProviderConfig>).api_key
    }
    return out
  }

  const save = async () => {
    const m = await window.studio.settingsSave(buildProvidersMap())
    setPlanner(await window.studio.settingsSetPlanner(planner))
    const l: Local = { ...local }
    for (const p of PROVIDERS) {
      l[p.id] = {
        ...l[p.id],
        api_key: '',
        hint: m[p.id]?.key_hint || '',
        has_key: m[p.id]?.has_key || false,
        auth_mode: m[p.id]?.auth_mode || 'api_key'
      }
    }
    setLocal(l)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const test = async (id: string) => {
    setTesting(id)
    setTestResult((r) => {
      const n = { ...r }
      delete n[id]
      return n
    })
    await window.studio.settingsSave(buildProvidersMap())
    const res = await window.studio.settingsTest(id)
    setTestResult((r) => ({
      ...r,
      [id]: { ok: !!res.ok, msg: res.ok ? res.detail || 'Kết nối OK' : res.error || 'Lỗi' }
    }))
    setTesting(null)
    const m = await window.studio.settingsGet()
    setLocal((s) => ({
      ...s,
      [id]: { ...s[id], api_key: '', hint: m[id]?.key_hint || '', has_key: m[id]?.has_key || false }
    }))
  }

  /** Nhan trang thai o header tung provider */
  const headerBadge = (p: ProviderMeta, l: LocalProvider) => {
    if (l.auth_mode === 'subscription') {
      const st = cli[p.id]
      const google = p.id === 'gemini'
      if (st?.installed && st?.logged_in) {
        return <Badge tone="brand">{google ? 'tài khoản Google' : `gói ${st.plan || st.plan_label}`}</Badge>
      }
      if (st && !st.installed) return <Badge tone="warn">chưa cài CLI</Badge>
      if (st && !st.logged_in) return <Badge tone="warn">chưa đăng nhập</Badge>
      return <Badge tone="neutral">{google ? 'Antigravity CLI' : 'gói subscription'}</Badge>
    }
    return l.has_key ? <Badge tone="ok">đã có key</Badge> : <Badge tone="warn">chưa có key</Badge>
  }

  /** AI lap ke hoach dang chon chua chay duoc thi vi sao (null = on) */
  const plannerIssue = (() => {
    const l = local[planner]
    if (!l) return null
    const name = planner === 'claude' ? 'Claude' : 'GPT'
    if (l.auth_mode === 'subscription') {
      const st = cli[planner]
      if (st && !st.installed) return `${name} chưa cài ${st.label} — cài ở thẻ ${name} bên dưới.`
      if (st && !st.logged_in) return `${name} chưa đăng nhập ${st.label} — đăng nhập ở thẻ ${name} bên dưới.`
      const m = st?.models?.find((x) => x.id === (l.sub_model || st?.default_model))
      if (m?.needs_update)
        return `Model ${m.label} cần Claude Code ≥ ${m.needs_update} — bấm “Cập nhật Claude Code” ở thẻ Claude, hoặc chọn model khác.`
      return null
    }
    return l.has_key || l.api_key ? null : `${name} chưa có API key — nhập ở thẻ ${name} bên dưới.`
  })()

  return (
    <div className="w-full px-8 py-7">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Cài đặt API</h1>
          <p className="mt-1 text-sm text-ink-800/50">
            Gemini, GPT và Claude chạy được bằng <b className="font-semibold text-ink-800/70">API key</b> hoặc bằng{' '}
            <b className="font-semibold text-ink-800/70">tài khoản đăng nhập trên máy</b>: Gemini qua Antigravity CLI
            (tài khoản Google, kể cả AI Pro / Ultra), GPT qua Codex CLI (ChatGPT Plus / Pro), Claude qua Claude Code
            CLI (Claude Pro / Max). Khoá lưu mã hoá qua {KEY_STORE}.
          </p>
        </div>
        <Button className="shrink-0 whitespace-nowrap" onClick={save} disabled={Object.keys(local).length === 0}>
          {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Đã lưu' : 'Lưu tất cả'}
        </Button>
      </div>

      {/* Chon AI lap ke hoach */}
      <div className="card-surface mb-4 rounded-2xl px-5 py-4">
        <div className="text-[15px] font-semibold text-ink-900">AI lập kế hoạch</div>
        <div className="mt-0.5 text-xs text-ink-800/45">
          Chạy các bước lập plan: B1 chất liệu → B2 timeline → B3 hook → R4 thiết kế → R5 phụ đề → B6 meme → B7 SFX
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {PLANNERS.map((o) => {
            const on = planner === o.id
            const M = o.mark
            return (
              <button
                key={o.id}
                onClick={() => choosePlanner(o.id)}
                className={cn(
                  'no-drag flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
                  on ? 'border-brand-400 bg-brand-500/[0.06] ring-2 ring-brand-500/15' : 'border-black/10 hover:border-black/20'
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/6 bg-white">
                  <M className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-ink-900">{o.name}</div>
                  <div className="text-[12px] text-ink-800/50">{o.note}</div>
                </div>
                {on && <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-500" />}
              </button>
            )
          })}
        </div>
        {plannerIssue && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/[0.08] px-3 py-2 text-[12.5px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {plannerIssue}
          </div>
        )}
        <p className="mt-3 text-[12px] leading-relaxed text-ink-800/45">
          Đổi AI thì lần lập plan sau các bước chạy lại thật (không dùng kết quả của AI kia). Phân tích video mẫu dùng
          Gemini; tạo ảnh AI + chữ ảnh AI vẫn dùng GPT qua Codex CLI (công cụ tạo ảnh). Bấm “Lưu tất cả” để áp dụng.
        </p>
      </div>

      <div className="space-y-4">
        {PROVIDERS.map((p) => {
          const l = local[p.id]
          if (!l) return null
          const Mark = p.mark
          const tr = testResult[p.id]
          const isOpen = open[p.id]
          const bySub = l.auth_mode === 'subscription'
          const st = cli[p.id]
          return (
            <div key={p.id} className="card-surface overflow-hidden rounded-2xl">
              {/* header (click de gap/mo) */}
              <button
                onClick={() => setOpen((s) => ({ ...s, [p.id]: !s[p.id] }))}
                className="no-drag flex w-full items-center gap-3 px-5 py-4 text-left"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/6 bg-white">
                  <Mark className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
                    {p.name}
                    {headerBadge(p, l)}
                  </div>
                  <div className="text-xs text-ink-800/45">{p.role(planner)}</div>
                </div>
                {tr && (
                  <div className="flex items-center gap-1.5 text-xs">
                    {tr.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span
                      className={cn('max-w-[360px] truncate', tr.ok ? 'text-emerald-600' : 'text-red-500')}
                      title={tr.msg}
                    >
                      {tr.msg}
                    </span>
                  </div>
                )}
                <ChevronDown
                  className={cn('h-5 w-5 text-ink-800/40 transition-transform', isOpen && 'rotate-180')}
                />
              </button>

              {isOpen && (
                <div className="border-t border-black/6 px-5 py-4">
                  {/* Chon cach ket noi — chi provider co CLI chinh chu */}
                  {p.canSubscribe && (
                    <div className="mb-4">
                      <label className="mb-1.5 block text-xs text-ink-800/50">Cách kết nối</label>
                      <div className="inline-flex rounded-xl border border-black/10 bg-ink-50 p-1">
                        {(
                          [
                            { m: 'api_key' as const, icon: KeyRound, label: 'API Key' },
                            { m: 'subscription' as const, icon: BadgeCheck, label: p.subLabel }
                          ] as const
                        ).map(({ m, icon: Icon, label }) => (
                          <button
                            key={m}
                            onClick={() => setMode(p.id, m)}
                            className={cn(
                              'no-drag inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition',
                              l.auth_mode === m
                                ? 'bg-white text-ink-900 shadow-sm'
                                : 'text-ink-800/50 hover:text-ink-900'
                            )}
                          >
                            <Icon className="h-[14px] w-[14px]" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {bySub ? (
                    /* ---------- CHE DO GOI SUBSCRIPTION ---------- */
                    <>
                      <CliPanel
                        provider={p.id}
                        status={st}
                        loading={cliLoading}
                        onRefresh={() => refreshCli([p.id])}
                        login={login?.id === p.id ? login : null}
                        onLogin={(mode) => startLogin(p.id, mode)}
                        onInstall={() => startInstall(p.id)}
                        onUpdate={p.id === 'claude' ? () => startUpdate(p.id) : undefined}
                        onCancelLogin={() => {
                          // agy / Claude Code dang nhap trong Terminal cua nguoi dung -> chi dung viec cho;
                          // con lai huy tien trinh
                          if (TERMINAL_LOGIN.has(p.id) && login?.kind === 'login' && login.mode === 'device') termPoll.current.cancel = true
                          else window.studio.settingsCliLoginCancel()
                        }}
                      />
                      <div className="mt-3 flex items-start gap-3">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs text-ink-800/50">Model</label>
                          <ModelPicker
                            value={l.sub_model || st?.default_model || ''}
                            models={st?.models || []}
                            onChange={(v) => update(p.id, 'sub_model', v)}
                            placeholder={
                              p.id === 'gemini'
                                ? 'Tên model, ví dụ gemini-2.5-pro'
                                : p.id === 'claude'
                                  ? 'Tên model, ví dụ claude-opus-5'
                                  : undefined
                            }
                          />
                          {(() => {
                            const m = st?.models?.find((x) => x.id === (l.sub_model || st?.default_model))
                            return m?.needs_update ? (
                              <div className="mt-1 text-[11.5px] text-amber-700">
                                Model này cần Claude Code ≥ {m.needs_update} (máy đang có {st?.version || 'bản cũ'}) — bấm
                                “Cập nhật Claude Code” ở trên.
                              </div>
                            ) : null
                          })()}
                        </div>
                        {(p.id === 'gpt' || p.id === 'claude') && (
                          <div className="w-[270px] shrink-0">
                            <label className="mb-1 block text-xs text-ink-800/50">Mức suy nghĩ (thinking)</label>
                            <EffortPicker
                              model={l.sub_model || st?.default_model || ''}
                              value={l.sub_effort}
                              reasoning={st?.reasoning}
                              onChange={effortSetters[p.id]}
                            />
                          </div>
                        )}
                        <Button
                          variant="outline"
                          className="mt-[22px]"
                          onClick={() => test(p.id)}
                          disabled={testing === p.id || !st?.logged_in}
                          title={
                            st?.logged_in ? 'Gọi thử 1 lượt qua CLI' : 'Cần cài & đăng nhập CLI trước'
                          }
                        >
                          {testing === p.id ? <Spinner /> : <Plug className="h-4 w-4" />} Kiểm tra kết nối
                        </Button>
                      </div>
                      {p.id === 'gpt' && (
                        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-800/55">
                          <b className="font-semibold text-ink-800/70">Mức suy nghĩ</b> áp dụng cho các bước lập kế
                          hoạch và phân tích video mẫu (không áp dụng khi tạo ảnh AI). Mức càng cao, kế hoạch càng
                          kỹ nhưng mỗi bước chậm hơn và tốn hạn mức gói hơn — một lần lập plan gọi GPT khoảng 7–9
                          lượt. Đổi mức thì lần lập plan sau các bước chạy lại thật, không dùng kết quả cũ.
                        </p>
                      )}
                      {p.id === 'claude' && (
                        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-800/55">
                          Dùng <b className="font-semibold text-ink-800/70">Claude Code CLI</b> (<code className="font-mono">claude</code>)
                          với tài khoản Claude đăng nhập trên máy — đăng nhập ở đây cũng là đăng nhập cho lệnh{' '}
                          <code className="font-mono">claude</code> trong {TERM}. App gọi Claude như một lượt hỏi đáp
                          thuần: không công cụ, không MCP, không đọc CLAUDE.md, không lưu phiên vào lịch sử Claude Code.{' '}
                          <b className="font-semibold text-ink-800/70">Mức suy nghĩ</b> là cờ{' '}
                          <code className="font-mono">--effort</code> của Claude Code — càng cao càng kỹ nhưng chậm và
                          tốn hạn mức hơn; một lần lập plan gọi Claude khoảng 7–9 lượt.
                        </p>
                      )}
                      {p.id === 'gemini' && (
                        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-800/55">
                          Dùng <b className="font-semibold text-ink-800/70">Antigravity CLI</b> (<code className="font-mono">agy</code>)
                          của Google với tài khoản đăng nhập trên máy — đăng nhập ở đây cũng là đăng nhập cho lệnh{' '}
                          <code className="font-mono">agy</code> trong {TERM}. (Gemini CLI không còn nhận tài khoản cá
                          nhân từ 18/06/2026.) Gemini xem video bằng công cụ đọc file của agy nên mỗi lượt chậm hơn API
                          một chút; chỉ model Gemini xem được video.
                        </p>
                      )}
                      <p className="mt-2.5 text-[12px] leading-relaxed text-ink-800/40">
                        Ở chế độ này app không giữ khoá nào — nó gọi CLI chính chủ đã đăng nhập sẵn trên
                        máy, nên dùng đúng hạn mức của tài khoản / gói đó. Hết hạn mức trong khung giờ thì
                        tạm chuyển về API Key.
                      </p>
                    </>
                  ) : (
                    /* ---------- CHE DO API KEY ---------- */
                    <>
                      <label className="mb-1 block text-xs text-ink-800/50">API Key</label>
                      <div className="relative mb-3">
                        <Input
                          type={show[p.id] ? 'text' : 'password'}
                          placeholder={l.hint ? `Đang lưu ${l.hint} — nhập để đổi` : 'sk-... / AIza...'}
                          value={l.api_key}
                          onChange={(e) => update(p.id, 'api_key', e.target.value)}
                        />
                        <button
                          className="no-drag absolute right-2 top-1/2 -translate-y-1/2 text-ink-800/40 hover:text-ink-900"
                          onClick={() => setShow((s) => ({ ...s, [p.id]: !s[p.id] }))}
                        >
                          {show[p.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs text-ink-800/50">Base URL</label>
                          <Input
                            value={l.base_url}
                            onChange={(e) => update(p.id, 'base_url', e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="mb-1 block text-xs text-ink-800/50">Model</label>
                          <Input
                            placeholder={p.placeholderModel}
                            value={l.model}
                            onChange={(e) => update(p.id, 'model', e.target.value)}
                          />
                        </div>
                        <Button variant="outline" onClick={() => test(p.id)} disabled={testing === p.id}>
                          {testing === p.id ? <Spinner /> : <Plug className="h-4 w-4" />} Test connection
                        </Button>
                      </div>
                    </>
                  )}
                  {p.id === 'gemini' && (
                    <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[12px] leading-relaxed text-ink-800/55">
                      Video luôn được <b className="font-semibold text-ink-800/70">nén 720p (giữ tiếng)</b> trước khi
                      gửi Gemini. Bản nén vẫn quá 20 MB thì tự <b className="font-semibold text-ink-800/70">cắt nhiều
                      phần theo dung lượng</b> (cắt ở chỗ im lặng, các phần chồng nhau vài giây), Gemini xem từng phần
                      song song rồi ghép lại thành một bản phân tích.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
