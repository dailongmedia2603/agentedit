// CLI — DANG NHAP AI CHAY NEN (1.7.0): `login <tk> --start` / `--code <MA>` / `--check`.
//
// AI agent (GetTime...) KHONG go them duoc vao 1 lenh dang chay -> `login` chan nhu cu chi dung duoc trong Terminal. Gio:
//   --start  tach 1 tien trinh app nen (`__run-login <id>`) giu CLI chinh chu (claude auth login / agy / codex login) song
//            qua nhieu luot chat, tra NGAY link dang nhap + vai dong cuoi CLI in ra (ma thiet bi cua Codex...).
//   --code   ghi ma nguoi dung dan trong chat vao jobs/<id>/code -> tien trinh nen chuyen vao stdin CLI (sendCliInput).
//   --check  hoi trang thai that (sidecar /cli_status) + trang thai viec nen.
// Trang thai o ~/.capcut-studio/cli/jobs/l_<...>/job.json nhu viec tao video (`wait` / `job` / `cancel` dung chung).
import { appendFileSync, existsSync, readFileSync, rmSync } from 'fs'
import { agyFailureText, CLI_PACKAGES, sendCliInput, startAgyLogin, startClaudeLogin, startCodexLogin } from '../services/cli-login'
import { sidecarInfo, sidecarRequest, startSidecar, stopSidecar } from '../services/sidecar'
import { codeFile, Job, jobLog, listJobs, loadJob, saveJob, TERMINAL } from './jobs'

export type Account = 'gemini' | 'claude' | 'gpt'

export function accountOf(raw: string): Account | '' {
  const r = (raw || '').toLowerCase()
  return r === 'gemini' || r === 'agy' ? 'gemini' : r === 'claude' ? 'claude' : r === 'codex' || r === 'gpt' || r === 'openai' ? 'gpt' : ''
}

/** Ten goi tren dong lenh (gpt -> codex) */
export const accountArg = (id: string) => (id === 'gpt' ? 'codex' : id)

export async function cliStatusOf(id: string, fresh = false): Promise<Record<string, any> | null> {
  if (!sidecarInfo().ready) {
    const s = await startSidecar()
    if (!s.ok) throw new Error('Không khởi động được bộ xử lý: ' + s.error)
  }
  const r = await sidecarRequest('/cli_status', fresh ? { name: id, fresh: true } : { name: id }, 120000).catch(() => null)
  return r?.status?.[id] || null
}

/** Viec dang nhap con chay cua tai khoan nay (moi nhat). */
export function activeLogin(account: string): Job | null {
  return listJobs().find((j) => j.kind === 'login' && j.info?.account === account && !TERMINAL.includes(j.status)) || null
}

/** Ket qua tra cho AI: link, dong cuoi CLI in ra (co ma thiet bi Codex), da gui ma chua. */
export function loginView(j: Job) {
  return {
    id: j.id,
    account: accountArg(String(j.info?.account || '')),
    status: j.status,
    message: j.message,
    url: (j.info?.url as string) || null,
    lines: (j.info?.lines as string[]) || [],
    codeSent: !!j.info?.codeSent,
    error: j.error || null
  }
}

const URL_RE = /https?:\/\/[^\s"'<>]+/g
// link dang nhap that cua tung CLI (dong khac co the in link tai lieu / trang chu)
const PREFER: Record<Account, RegExp> = {
  claude: /oauth|authorize/i,
  gemini: /accounts\.google\.com/i,
  gpt: /auth\.openai\.com|device|oauth/i
}

export async function runLoginJob(id: string): Promise<number> {
  const job = loadJob(id)
  if (!job) return 2
  const account = String(job.info?.account || '') as Account
  const bin = String(job.info?.bin || '')
  const label = CLI_PACKAGES[account]?.label || account
  job.pid = process.pid
  job.status = 'running'
  job.startedAt = Date.now()
  saveJob(job)
  const fileLog = (line: string) => {
    try {
      appendFileSync(jobLog(id), `[${new Date().toISOString()}] ${line}\n`)
    } catch {
      /* bo qua */
    }
  }
  const info = (job.info ||= {})
  const lines: string[] = []
  const onLine = (raw: string) => {
    const line = raw.trim()
    if (!line) return
    fileLog(line)
    lines.push(line.slice(0, 500))
    if (lines.length > 12) lines.shift()
    info.lines = [...lines]
    for (const u of line.match(URL_RE) || []) {
      const url = u.replace(/[).,;]+$/, '')
      if (!info.url || (PREFER[account]?.test(url) && !PREFER[account]?.test(String(info.url)))) {
        info.url = url
        job.sub = 'url'
        job.message = `Đã mở trang đăng nhập ${label} trên máy này (hoặc mở link). Đăng nhập xong, nếu trang hiện mã thì gửi mã đó.`
      }
    }
    if (account === 'gemini' && process.platform === 'win32' && /Đã mở cửa sổ/.test(line)) {
      job.sub = 'window'
      job.message = 'Đã mở cửa sổ Antigravity CLI trên máy: bấm Enter (chọn "Google OAuth"), rồi đăng nhập Google trong trình duyệt.'
    }
    saveJob(job)
  }

  job.step = 'login'
  job.message = `Đang mở đăng nhập ${label}…`
  saveJob(job)
  // ma nguoi dung gui qua chat -> stdin cua CLI dang cho
  const codePoll = setInterval(() => {
    const f = codeFile(id)
    if (!existsSync(f)) return
    let code = ''
    try {
      code = readFileSync(f, 'utf-8').trim()
    } catch {
      return
    }
    rmSync(f, { force: true })
    const ok = sendCliInput(code)
    fileLog(ok ? 'Đã chuyển mã cho CLI' : 'Không chuyển được mã cho CLI')
    info.codeSent = ok
    job.sub = 'code'
    job.message = ok ? 'Đã nhận mã — đang xác nhận đăng nhập…' : 'CLI không nhận mã (lượt đăng nhập này không hỏi mã) — đăng nhập trên trình duyệt.'
    saveJob(job)
  }, 700)

  let res: { ok: boolean; error?: string }
  try {
    res =
      account === 'gemini'
        ? await startAgyLogin(bin, String(job.info?.workdir || ''), onLine)
        : account === 'claude'
          ? await startClaudeLogin(bin, onLine)
          : await startCodexLogin(bin, job.info?.device ? 'device' : 'browser', onLine)
  } catch (e) {
    res = { ok: false, error: String((e as Error)?.message || e) }
  } finally {
    clearInterval(codePoll)
  }
  let now: Record<string, any> | null = null
  try {
    now = await cliStatusOf(account, true)
  } catch (e) {
    fileLog(String((e as Error).message || e))
  }
  stopSidecar()
  job.finishedAt = Date.now()
  job.sub = null
  if (now?.logged_in) {
    job.status = 'done'
    job.message = `${label}: đăng nhập xong.`
    saveJob(job)
    fileLog(job.message)
    return 0
  }
  job.status = 'error'
  let msg = res.ok ? now?.detail || `${label} chưa ghi nhận đăng nhập.` : res.error || 'Đăng nhập không thành công.'
  if (account === 'gemini') msg = agyFailureText(msg, now?.version, 'login')
  job.error = { step: 'login', message: String(msg).slice(0, 1000), hint: `Chạy lại: agent-edit login ${accountArg(account)} --start` }
  job.message = 'Lỗi: ' + String(msg).split('\n')[0].slice(0, 300)
  saveJob(job)
  fileLog(job.message)
  return 1
}
