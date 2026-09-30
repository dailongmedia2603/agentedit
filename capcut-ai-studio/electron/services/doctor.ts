// DOCTOR — kiem TOAN BO cong cu ma luong edit can (tu luc them video toi luc ra MP4) + TU CAI khi mo app.
//
// Moi muc: dung o buoc nao (purpose), yeu cau phien ban gi (required), may dang co gi (found), va cach sua
// (fix). Moc phien ban / nguon tai: sidecar/assets/toolchain.json (xem toolchain.ts).
//   fail = chua dung duoc / sai phien ban -> chan tao video (co fix + auto thi app tu cai luc mo)
//   warn = van tao video duoc nhung mat 1 phan (vd Codex chua dang nhap -> khong co anh AI)
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { findBinary } from './env'
import { DEFAULT_VENV_DIR, sidecarServer } from './paths'
import { browserInstalled, bundleDir, installBrowser, remotionHome } from './remotion'
import { sidecarInfo, stopSidecar } from './sidecar'
import { planProviderOf, readState, writeState } from './state'
import * as T from './toolchain'

export type CheckStatus = 'ok' | 'fail' | 'warn' | 'checking'
export type CheckGroup = 'system' | 'media' | 'python' | 'ai'

export interface DoctorCheck {
  id: string
  label: string
  group: CheckGroup
  status: CheckStatus
  detail: string
  /** dung o buoc nao cua luong edit */
  purpose: string
  /** phien ban / dieu kien yeu cau */
  required?: string
  /** phien ban tim thay tren may */
  found?: string
  /** id cach sua cho fixCheck (khong co = khong tu sua duoc) */
  fix?: string
  /** tu chay fix khi mo app neu chua dat */
  auto?: boolean
  /** can vao Cai dat API (dang nhap tai khoan / API key) */
  settings?: boolean
  fixable: boolean
}

type ProvidersReady = Record<string, { ready: boolean; auth_mode: 'api_key' | 'subscription' }>

function row(c: Omit<DoctorCheck, 'fixable'>): DoctorCheck {
  return { ...c, fixable: !!c.fix }
}

/** venv dang dung: venv_python trong state.json (may cu), neu khong thi venv mac dinh cua app. */
function resolveVenvPython(): string | null {
  const s = readState()
  if (s.venv_python && existsSync(s.venv_python)) return s.venv_python
  const p = join(DEFAULT_VENV_DIR, 'bin', 'python')
  return existsSync(p) ? p : null
}

interface Probe {
  python: string
  python_ok: boolean
  packages: { total: number; missing: string[]; wrong: { name: string; want: string; have: string }[] }
  vision: { ok: boolean; foreground_mask: boolean; person_seg: boolean; ocr_vi: boolean; error: string | null }
  whisper: { ok: boolean; cache: string; revision: string | null; missing: string[]; bad: string[]; detail: string }
}

async function pythonProbe(py: string): Promise<Probe | { error: string }> {
  const r = await T.runCmd(py, [T.probeScript(), 'probe'], { timeout: 60000 })
  const line = (r.stdout.split('\n').find((l) => l.startsWith('RESULT=')) || '').slice(7)
  try {
    return JSON.parse(line)
  } catch {
    return { error: (r.stderr || r.stdout || 'Python không chạy được').trim().split('\n').slice(-2).join(' ').slice(0, 200) }
  }
}

async function claudeLogin(path: string): Promise<{ ok: boolean; detail: string }> {
  const r = await T.runCmd(path, ['auth', 'status'], { timeout: 30000 })
  try {
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')))
    if (j.loggedIn && j.authMethod === 'claude.ai') return { ok: true, detail: `Đã đăng nhập${j.email ? ' — ' + j.email : ''}` }
    if (j.loggedIn) return { ok: false, detail: 'Claude Code đang dùng API key, chưa đăng nhập bằng tài khoản Claude.ai.' }
  } catch {
    /* khong phai JSON */
  }
  return { ok: false, detail: 'Chưa đăng nhập tài khoản Claude.' }
}

async function codexLogin(path: string): Promise<{ ok: boolean; detail: string }> {
  const r = await T.runCmd(path, ['login', 'status'], { timeout: 30000 })
  const text = (r.stdout + r.stderr).trim()
  if (r.code === 0 && /logged in/i.test(text)) return { ok: true, detail: text.split('\n')[0].slice(0, 100) }
  return { ok: false, detail: 'Chưa đăng nhập ChatGPT cho Codex.' }
}

function agyLoggedIn(): boolean {
  return existsSync(join(homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token'))
}

/** CLI chinh chu: chua cai / cu -> fail (tu cai); chua dang nhap -> `loginStatus` (Settings). */
async function cliRow(opts: {
  id: string
  label: string
  purpose: string
  bin: string
  min: string
  fix: string
  login: (path: string) => Promise<{ ok: boolean; detail: string }>
  loginStatus: CheckStatus
  loginHint: string
  missingStatus?: CheckStatus
}): Promise<DoctorCheck> {
  const base = { id: opts.id, label: opts.label, group: 'ai' as const, purpose: opts.purpose, required: `≥ ${opts.min}` }
  const path = T.findCli(opts.bin)
  if (!path) {
    return row({ ...base, status: opts.missingStatus || 'fail', detail: `Chưa cài ${opts.bin}.`, fix: opts.fix, auto: true })
  }
  const ver = await T.cliVersion(path)
  const found = (T.parseVersion(ver) || []).join('.') || ver || '?'
  if (!T.versionGte(ver, opts.min)) {
    return row({ ...base, found, status: opts.missingStatus || 'fail', detail: `Bản ${found} cũ hơn bản đã kiểm chứng (${opts.min}) — cần cập nhật.`, fix: opts.fix, auto: true })
  }
  const lg = await opts.login(path)
  if (!lg.ok) return row({ ...base, found, status: opts.loginStatus, detail: `${lg.detail} ${opts.loginHint}`, settings: true })
  return row({ ...base, found, status: 'ok', detail: lg.detail })
}

// ---------------------------------------------------------------------------
// KIEM (chi doc) — chay song song, ~1-2s
// ---------------------------------------------------------------------------
export async function runDoctor(providersReady: ProvidersReady): Promise<DoctorCheck[]> {
  const m = T.manifest()
  const venvPy = resolveVenvPython()
  const state = readState()
  const planner = planProviderOf(state)
  const mode = (n: string) => providersReady[n]?.auth_mode || 'api_key'

  const system = async (): Promise<DoctorCheck[]> => {
    const osv = process.getSystemVersion?.() || ''
    const osOk = T.versionGte(osv, m.macos_min) && process.arch === 'arm64'
    const bundleOk = existsSync(join(bundleDir(), 'index.html')) && existsSync(sidecarServer()) &&
      existsSync(join(sidecarServer(), '..', 'fx_runtime.mjs'))
    return [
      row({ id: 'macos', label: 'macOS', group: 'system', purpose: 'Chạy app, tách người (Vision), nhận diện chữ tiếng Việt, Whisper',
            required: `macOS ≥ ${m.macos_min} · Apple Silicon`, found: `macOS ${osv} · ${process.arch}`,
            status: osOk ? 'ok' : 'fail', detail: osOk ? 'Đạt.' : `Cần macOS ${m.macos_min} trở lên trên máy Apple Silicon (${m.macos_why}).` }),
      row({ id: 'avconvert', label: 'avconvert (có sẵn trong macOS)', group: 'system', purpose: 'Đổi video HDR iPhone sang SDR đúng màu',
            required: 'có sẵn', found: existsSync('/usr/bin/avconvert') ? '/usr/bin/avconvert' : 'không thấy',
            status: existsSync('/usr/bin/avconvert') ? 'ok' : 'warn',
            detail: existsSync('/usr/bin/avconvert') ? 'Đạt.' : 'Không thấy — video HDR sẽ đổi màu bằng ffmpeg (kém chuẩn hơn).' }),
      row({ id: 'bundle', label: 'Bộ dựng Remotion + hộp cách ly hiệu ứng (trong app)', group: 'system',
            purpose: 'Xem trước, render MP4, chạy code hiệu ứng AI tự viết', required: 'đóng gói sẵn trong app',
            found: bundleOk ? 'đủ' : 'thiếu file', status: bundleOk ? 'ok' : 'fail',
            detail: bundleOk ? 'Đạt.' : 'Bản cài app bị thiếu file — cài lại app.' })
    ]
  }

  const media = async (): Promise<DoctorCheck[]> => {
    const ff = await T.ffmpegStatus()
    const chromeV = browserInstalled() ? T.chromeVersion(remotionHome()) : null
    return [
      row({ id: 'ffmpeg', label: 'FFmpeg + FFprobe', group: 'media',
            purpose: 'Nén 720p gửi Gemini, đo tiếng nói / khoảng lặng, cắt khung, tách người (VP9 alpha), HDR → SDR, ảnh chữ',
            required: `bản ${m.ffmpeg.version} ghim SHA-256`, found: ff.found, status: ff.ok ? 'ok' : 'fail', detail: ff.detail,
            fix: 'ffmpeg', auto: true }),
      row({ id: 'chrome', label: 'Chrome Headless Shell (Remotion)', group: 'media', purpose: 'Render video MP4 cuối',
            required: m.chrome.version, found: chromeV || undefined,
            status: chromeV === m.chrome.version ? 'ok' : 'fail',
            detail: chromeV === m.chrome.version ? 'Đạt.' : chromeV ? `Bản ${chromeV} khác bản Remotion cần.` : 'Chưa tải (~90 MB).',
            fix: 'chrome', auto: true })
    ]
  }

  const python = async (): Promise<DoctorCheck[]> => {
    const uvPath = findBinary('uv')
    const uvVer = uvPath ? await T.cliVersion(uvPath) : null
    const uvOk = T.versionGte(uvVer, m.uv.min)
    const out: DoctorCheck[] = [
      row({ id: 'uv', label: 'uv (quản lý Python)', group: 'python', purpose: 'Cài Python 3.12 + thư viện cho sidecar',
            required: `≥ ${m.uv.min} (cài bản ${m.uv.install_version})`, found: (T.parseVersion(uvVer) || []).join('.') || undefined,
            status: uvOk ? 'ok' : 'fail', detail: uvOk ? 'Đạt.' : uvVer ? `Bản ${uvVer} quá cũ.` : 'Chưa cài uv.', fix: 'uv', auto: true })
    ]
    const whisperBase = { id: 'whisper', label: `Whisper "${m.whisper.model}" (faster-whisper)`, group: 'media' as const,
      purpose: 'Căn giờ lời nói từng chữ: điểm cắt, phụ đề karaoke, chữ khớp lời',
      required: `bản ${m.whisper.revision.slice(0, 8)} ghim SHA-256 (~${Math.round(Object.values(m.whisper.files).reduce((a, f) => a + f.size, 0) / 1e6)} MB)`,
      fix: 'whisper', auto: true }
    const pkgBase = { id: 'pypkgs', label: 'Thư viện Python của sidecar', group: 'python' as const,
      purpose: 'Flask (sidecar), numpy, Pillow, faster-whisper, pyobjc Vision…', fix: 'python', auto: true }
    const visBase = { id: 'vision', label: 'Thị giác máy macOS (Vision)', group: 'python' as const,
      purpose: 'Tìm mặt, tách người (chữ sau người), đọc chữ tiếng Việt để kiểm chữ ảnh AI', required: 'tách người + OCR vi-VT' }
    if (!venvPy) {
      out.push(
        row({ id: 'python', label: `Python ${m.python.series} (môi trường sidecar)`, group: 'python', purpose: 'Chạy sidecar (AI, cắt ghép, kiểm luật)',
              required: m.python.series, status: 'fail', detail: 'Chưa có môi trường Python (venv) cho sidecar.', fix: 'python', auto: true }),
        row({ ...pkgBase, required: 'khoá đúng phiên bản', status: 'fail', detail: 'Chờ tạo môi trường Python.' }),
        row({ ...visBase, status: 'fail', detail: 'Chờ cài thư viện Python.' }),
        row({ ...whisperBase, status: 'fail', detail: 'Chờ cài thư viện Python.' })
      )
      return out
    }
    const p = await pythonProbe(venvPy)
    if ('error' in p) {
      out.push(
        row({ id: 'python', label: `Python ${m.python.series} (môi trường sidecar)`, group: 'python', purpose: 'Chạy sidecar (AI, cắt ghép, kiểm luật)',
              required: m.python.series, status: 'fail', detail: 'venv lỗi: ' + p.error, fix: 'python', auto: true }),
        row({ ...pkgBase, required: 'khoá đúng phiên bản', status: 'fail', detail: 'Chờ sửa môi trường Python.' }),
        row({ ...visBase, status: 'fail', detail: 'Chờ sửa môi trường Python.' }),
        row({ ...whisperBase, status: 'fail', detail: 'Chờ sửa môi trường Python.' })
      )
      return out
    }
    out.push(row({ id: 'python', label: `Python ${m.python.series} (môi trường sidecar)`, group: 'python',
      purpose: 'Chạy sidecar (AI, cắt ghép, kiểm luật)', required: m.python.series, found: p.python,
      status: p.python_ok ? 'ok' : 'fail', detail: p.python_ok ? venvPy : `venv đang dùng Python ${p.python} — cần ${m.python.series}.`,
      fix: 'python', auto: true }))
    const pk = p.packages
    const bad = pk.missing.length + pk.wrong.length
    out.push(row({ ...pkgBase, required: `${pk.total} gói khoá đúng phiên bản`, found: `${pk.total - bad}/${pk.total} đúng`,
      status: bad ? 'fail' : 'ok',
      detail: bad
        ? [pk.missing.length ? 'thiếu ' + pk.missing.slice(0, 6).join(', ') : '',
           pk.wrong.length ? 'sai bản ' + pk.wrong.slice(0, 4).map((w) => `${w.name} ${w.have}→${w.want}`).join(', ') : '']
            .filter(Boolean).join('; ')
        : 'Đủ và đúng phiên bản (flask, numpy, Pillow, faster-whisper, pyobjc…).' }))
    const v = p.vision
    out.push(row({ ...visBase, found: v.error ? 'lỗi' : [v.person_seg && 'tách người', v.foreground_mask && 'tách từng khung', v.ocr_vi && 'OCR vi'].filter(Boolean).join(', '),
      status: v.ok ? 'ok' : bad ? 'fail' : 'warn',
      detail: v.ok ? 'Đạt.' : v.error ? `Không nạp được Vision (${v.error}).`
        : `Thiếu: ${[!v.person_seg && 'tách người', !v.foreground_mask && 'tách người từng khung (macOS 14+)', !v.ocr_vi && 'OCR tiếng Việt'].filter(Boolean).join(', ')} — tính năng đó tự tắt.` }))
    const w = p.whisper
    out.push(row({ ...whisperBase, found: w.ok ? w.revision?.slice(0, 8) : undefined, status: w.ok ? 'ok' : 'fail',
      detail: w.ok ? 'Đạt.' : w.detail || 'Chưa tải model.' }))
    return out
  }

  const ai = async (): Promise<DoctorCheck[]> => {
    const rows: Promise<DoctorCheck>[] = []
    const keyRow = (id: string, label: string, purpose: string, name: string): DoctorCheck =>
      row({ id, label, group: 'ai', purpose, required: 'API key', status: providersReady[name]?.ready ? 'ok' : 'fail',
            detail: providersReady[name]?.ready ? 'Đã cấu hình API key.' : 'Chưa nhập API key — vào Cài đặt API.', settings: true })
    const gemPurpose = 'Hiểu video nguồn, phân tích video mẫu, gắn nhãn SFX / meme'
    if (mode('gemini') === 'subscription') {
      rows.push(cliRow({ id: 'ai_gemini', label: 'Gemini — Antigravity CLI (tài khoản Google)', purpose: gemPurpose, bin: 'agy',
        min: m.cli.agy.min, fix: 'agy', loginStatus: 'fail', loginHint: 'Vào Cài đặt API → Gemini để đăng nhập.',
        login: async () => (agyLoggedIn() ? { ok: true, detail: 'Đã đăng nhập tài khoản Google.' } : { ok: false, detail: 'Chưa đăng nhập tài khoản Google.' }) }))
    } else {
      rows.push(Promise.resolve(keyRow('ai_gemini', 'Gemini (API key)', gemPurpose, 'gemini')))
    }
    const planPurpose = 'Lập kế hoạch B1–B7, R4, R5, hiệu ứng tự viết (FX)'
    if (planner === 'claude') {
      rows.push(mode('claude') === 'subscription'
        ? cliRow({ id: 'ai_planner', label: 'Claude — Claude Code CLI (lập kế hoạch)', purpose: planPurpose, bin: 'claude',
            min: m.cli.claude.min, fix: 'claude', login: claudeLogin, loginStatus: 'fail', loginHint: 'Vào Cài đặt API → Claude để đăng nhập.' })
        : Promise.resolve(keyRow('ai_planner', 'Claude (API key, lập kế hoạch)', planPurpose, 'claude')))
    } else if (mode('gpt') !== 'subscription') {
      rows.push(Promise.resolve(keyRow('ai_planner', 'GPT (API key, lập kế hoạch)', planPurpose, 'gpt')))
    }
    // Codex: luon can cho anh AI + chu anh AI (va lap ke hoach khi chon GPT goi subscription)
    const gptPlans = planner === 'gpt' && mode('gpt') === 'subscription'
    rows.push(cliRow({ id: 'codex', label: gptPlans ? 'GPT — Codex CLI (lập kế hoạch + ảnh AI)' : 'Codex CLI (tạo ảnh AI)',
      purpose: gptPlans ? planPurpose + '; tạo ảnh AI minh hoạ + chữ ảnh AI' : 'Tạo ảnh AI minh hoạ + chữ ảnh AI (thiếu thì bỏ ảnh AI, chữ vẽ bằng code)',
      bin: 'codex', min: m.cli.codex.min, fix: 'codex', login: codexLogin,
      loginStatus: gptPlans ? 'fail' : 'warn', missingStatus: gptPlans ? 'fail' : 'warn',
      loginHint: 'Vào Cài đặt API → GPT để đăng nhập ChatGPT.' }))
    return Promise.all(rows)
  }

  const groups = await Promise.all([system(), media(), python(), ai()])
  const checks = groups.flat()

  // Ghi lai venv dang dung de sidecar khoi dong dung Python
  const patch: Record<string, string> = { os: 'Darwin' }
  if (venvPy) patch.venv_python = venvPy
  writeState(patch)
  return checks
}

// ---------------------------------------------------------------------------
// SUA / CAI (ghi) — tung muc
// ---------------------------------------------------------------------------
async function setupPython(onLog: T.Log) {
  const m = T.manifest()
  const uv = findBinary('uv')
  if (!uv) throw new Error('Chưa có uv — cài uv trước.')
  await T.streamCmd(uv, ['python', 'install', m.python.series], onLog, { timeoutMs: 15 * 60 * 1000 })
  let venvPy = resolveVenvPython()
  if (venvPy) {
    const r = await T.runCmd(venvPy, ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])'])
    if (r.stdout.trim() !== m.python.series) {
      onLog(`venv ${venvPy} dùng Python ${r.stdout.trim() || '?'} — tạo venv mới đúng ${m.python.series}.`)
      venvPy = null
    }
  }
  if (!venvPy) {
    onLog(`Tạo môi trường Python ${m.python.series} (venv) cho sidecar...`)
    await T.streamCmd(uv, ['venv', '--clear', '--python', m.python.series, DEFAULT_VENV_DIR], onLog, { timeoutMs: 10 * 60 * 1000 })
    venvPy = join(DEFAULT_VENV_DIR, 'bin', 'python')
  }
  onLog('Cài thư viện Python đúng phiên bản khoá (requirements.lock)...')
  await T.streamCmd(uv, ['pip', 'install', '--python', venvPy, '-r', T.lockPath()], onLog, { timeoutMs: 30 * 60 * 1000 })
  writeState({ venv_python: venvPy })
  // sidecar dang chay bang thu vien cu -> tat, lan goi sau tu khoi dong lai bang ban moi
  if (sidecarInfo().hasChild) stopSidecar()
  onLog('Hoàn tất môi trường Python.')
}

async function setupWhisper(onLog: T.Log) {
  const venvPy = resolveVenvPython()
  if (!venvPy) throw new Error('Chưa có môi trường Python — cài Python trước.')
  const lines = await T.streamCmd(venvPy, [T.probeScript(), 'whisper-install'], onLog, {
    env: T.cleanEnv({ HF_HUB_DISABLE_TELEMETRY: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1' }),
    timeoutMs: 60 * 60 * 1000
  })
  const res = lines.find((l) => l.startsWith('RESULT='))
  const j = res ? JSON.parse(res.slice(7)) : null
  if (!j?.ok) throw new Error('Model Whisper sau khi tải không khớp bản ghim: ' + (j?.detail || 'không rõ'))
}

const FIXES: Record<string, (onLog: T.Log) => Promise<void>> = {
  uv: T.installUv,
  python: setupPython,
  venv: setupPython, // ten cu
  ffmpeg: T.installFfmpeg,
  whisper: setupWhisper,
  chrome: installBrowser,
  codex: T.installCodex,
  claude: T.installClaude,
  agy: T.installAgy
}

// thu tu phu thuoc: uv -> Python + thu vien -> Whisper (can faster-whisper) ; con lai doc lap
const ORDER = ['uv', 'python', 'ffmpeg', 'whisper', 'chrome', 'codex', 'claude', 'agy']

export async function fixCheck(id: string, onLog: (line: string) => void): Promise<{ ok: boolean; error?: string }> {
  const fn = FIXES[id]
  if (!fn) return { ok: false, error: 'Không thể tự sửa: ' + id }
  try {
    await fn(onLog)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) }
  } finally {
    T.cleanupTemp()
  }
}

// ---------------------------------------------------------------------------
// TU CAI khi mo app: moi muc auto chua dat -> sua theo thu tu phu thuoc, 1 lan / 1 lan mo app
// ---------------------------------------------------------------------------
export interface AutoFixProgress {
  running: boolean
  current: string | null
  queue: string[]
  done: string[]
  failed: { id: string; error: string }[]
}

let autoRun: Promise<{ checks: DoctorCheck[]; progress: AutoFixProgress }> | null = null
let lastProgress: AutoFixProgress = { running: false, current: null, queue: [], done: [], failed: [] }

export function autoFixStatus(): AutoFixProgress {
  return lastProgress
}

export function autoFix(
  providersReady: () => ProvidersReady,
  onLog: (id: string, line: string) => void,
  onProgress: (p: AutoFixProgress) => void
): Promise<{ checks: DoctorCheck[]; progress: AutoFixProgress }> {
  if (autoRun) return autoRun
  autoRun = (async () => {
    let checks = await runDoctor(providersReady())
    const need = (cs: DoctorCheck[]) =>
      ORDER.filter((fid) => cs.some((c) => c.fix === fid && c.auto && c.status !== 'ok'))
    const p: AutoFixProgress = { running: true, current: null, queue: need(checks), done: [], failed: [] }
    const emit = () => {
      lastProgress = { ...p, queue: [...p.queue], done: [...p.done], failed: [...p.failed] }
      onProgress(lastProgress)
    }
    emit()
    while (p.queue.length) {
      const fid = p.queue.shift() as string
      p.current = fid
      emit()
      onLog(fid, `▶ Tự cài: ${fid}`)
      const r = await fixCheck(fid, (line) => onLog(fid, line))
      if (r.ok) {
        p.done.push(fid)
        onLog(fid, `✓ Xong: ${fid}`)
      } else {
        p.failed.push({ id: fid, error: r.error || 'lỗi' })
        onLog(fid, `✗ Lỗi ${fid}: ${r.error}`)
      }
      // kiem lai: muc phu thuoc (vd Whisper sau khi co Python) co the vua du dieu kien / vua lo ra
      checks = await runDoctor(providersReady())
      const tried = new Set([...p.done, ...p.failed.map((f) => f.id)])
      p.queue = need(checks).filter((x) => !tried.has(x))
    }
    p.running = false
    p.current = null
    emit()
    return { checks, progress: lastProgress }
  })().finally(() => {
    autoRun = null
  })
  return autoRun
}
