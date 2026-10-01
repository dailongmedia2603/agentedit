import { execFile, spawn, ChildProcess } from 'child_process'
import { installAgy, installClaude, installCodex, powershell } from './toolchain'
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs'
import { homedir } from 'os'
import { basename, extname, isAbsolute, join } from 'path'
import { shell } from 'electron'
import { IS_WIN, agySessionPresent, augmentedEnv, claudeEnv, cmdQuote, killTree, needsShell } from './env'

/**
 * DANG NHAP / CAI CLI CHINH CHU NGAY TRONG APP.
 *
 * App KHONG doc / ghi file dang nhap cua CLI nao: CLI tu mo trinh duyet, nguoi dung dang nhap,
 * CLI tu luu phien (dung chung voi CLI do chay trong Terminal). App chi chay lenh va chuyen tiep
 * dong chu CLI in ra (co link dang nhap phong khi trinh duyet khong tu mo).
 *
 * Codex (GPT):
 *   browser -> `codex login`               (mo trinh duyet, nhan ket qua qua localhost:1455)
 *   device  -> `codex login --device-auth` (mo link + nhap ma 1 lan; dung khi cach tren khong duoc)
 *
 * Gemini qua Antigravity CLI (`agy`, tai khoan Google — ke ca AI Pro / Ultra). Gemini CLI khong con
 * dung duoc cho tai khoan ca nhan tu 18/06/2026. Dang nhap agy la giao dien toan man hinh -> can
 * Terminal THAT: app ghi 1 file .command roi mo bang Terminal (khong can quyen dieu khien app khac).
 * Bien SSH_CONNECTION/SSH_TTY lam agy IN LINK + nhan ma thay vi tu mo trinh duyet mac dinh -> nguoi
 * dung dan link vao dung trinh duyet dang dang nhap tai khoan Pro. Phien luu trong
 * ~/.gemini/antigravity-cli (dung chung voi `agy` trong Terminal). UI hoi lai trang thai den khi xong.
 *
 * Claude Code (Claude lap ke hoach): `claude auth login --claudeai` can Terminal THAT (hoi chon / dan ma)
 * -> cung cach agy: app ghi file .command roi mo bang Terminal; CLI tu mo trinh duyet dang nhap
 * Claude.ai, phien luu o cho Claude Code van luu (dung chung voi `claude` trong Terminal). UI hoi lai
 * trang thai den khi xong. Cap nhat CLI (model moi can ban moi): `claude update` chay ngay trong app.
 *
 * Cai CLI: Codex = ban chinh chu tren GitHub ghim SHA-256, Claude Code = trinh cai chinh chu (toolchain.ts, khong
 * can Node / npm — giong Doctor tu cai); agy qua trinh cai chinh chu cua Google (them ~/.local/bin vao PATH).
 *
 * WINDOWS: khong co Terminal.app / file .command -> app ghi file .ps1 (UTF-8 co BOM: PowerShell 5.1 doc file khong
 * BOM theo bang ma ANSI -> chu Viet vo) roi mo 1 cua so PowerShell rieng (spawn detached = console moi). agy / Claude
 * van chay giao dien day du trong cua so do. Cai agy = install.ps1 chinh chu (toolchain.installAgy).
 */
export type CliLoginMode = 'browser' | 'device'

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000
// Mau ANSI + ky tu dieu khien CLI in ra (du da dat NO_COLOR)
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g

/** CLI chinh chu cua tung provider (script = trinh cai chinh chu; Codex / Claude cai qua toolchain.ts) */
export const CLI_PACKAGES: Record<string, { bin: string; label: string; script?: string }> = {
  gpt: { bin: 'codex', label: 'Codex CLI' },
  gemini: { bin: 'agy', script: 'https://antigravity.google/cli/install.sh', label: 'Antigravity CLI' },
  claude: { bin: 'claude', label: 'Claude Code CLI' }
}

type TaskResult = { ok: boolean; canceled?: boolean; error?: string }

let child: ChildProcess | null = null
let canceled = false
/** Tien trinh dang nhap chay o cua so RIENG (Windows: agy giao dien day du, thu nho) — khong phai con truc tiep */
let extPid = 0
let extCancel = false

export function cliTaskRunning(): boolean {
  return !!child || !!extPid
}

export function cancelCliTask(): void {
  if (extPid) {
    extCancel = true
    killTree(extPid)
  }
  if (!child) return
  canceled = true
  const c = child
  // Windows: dung CA CAY (codex.exe con chau) — kill() chi giet tien trinh truc tiep
  killTree(c.pid, () => {
    try {
      c.kill('SIGTERM')
    } catch {
      /* tien trinh da thoat */
    }
  })
}

function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...augmentedEnv(), NO_COLOR: '1', ...extra }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

/**
 * Chay 1 tien trinh, chuyen tung dong chu ra onLine. onChunk nhan phan chu moi (de tra loi cau hoi
 * qua stdin). Ma thoat 0 -> ok (noi goi tu hoi lai trang thai that).
 */
function runTask(
  bin: string,
  args: string[],
  opts: {
    env: NodeJS.ProcessEnv
    cwd?: string
    timeoutMs: number
    onLine: (line: string) => void
    /** Chi Gemini can stdin (tra loi cau hoi dong y); Codex giu 'ignore' nhu truoc */
    stdin?: 'ignore' | 'pipe'
    onChunk?: (text: string, proc: ChildProcess) => void
    /** Hoi moi giay: tra true = viec da xong (vd da co file phien dang nhap) -> dung tien trinh, bao THANH CONG */
    doneWhen?: () => boolean
  }
): Promise<TaskResult> {
  if (child || extPid) return Promise.resolve({ ok: false, error: 'Đang có một lượt đăng nhập / cài đặt chạy dở.' })
  return new Promise((resolve) => {
    canceled = false
    const sh = needsShell(bin)
    const proc = spawn(sh ? cmdQuote(bin) : bin, sh ? args.map(cmdQuote) : args, {
      env: opts.env,
      cwd: opts.cwd,
      stdio: [opts.stdin || 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: sh
    })
    child = proc
    const tail: string[] = []
    let buf = ''
    const feed = (chunk: Buffer) => {
      const text = chunk.toString('utf-8').replace(ANSI, '')
      opts.onChunk?.(text, proc)
      buf += text
      const parts = buf.split(/\r?\n/)
      buf = parts.pop() || ''
      for (const raw of parts) {
        const line = raw.trimEnd()
        if (!line.trim()) continue
        tail.push(line)
        if (tail.length > 40) tail.shift()
        opts.onLine(line)
      }
    }
    proc.stdout?.on('data', feed)
    proc.stderr?.on('data', feed)
    proc.stdin?.on('error', () => {
      /* CLI da dong stdin — bo qua */
    })
    const timer = setTimeout(() => {
      opts.onLine(`Quá ${Math.round(opts.timeoutMs / 60000)} phút chưa xong — dừng lại.`)
      cancelCliTask()
    }, opts.timeoutMs)
    let doneEarly = false
    const poll = opts.doneWhen
      ? setInterval(() => {
          if (!doneEarly && opts.doneWhen && opts.doneWhen()) {
            doneEarly = true
            killTree(proc.pid, () => {
              try {
                proc.kill('SIGTERM')
              } catch {
                /* da thoat */
              }
            })
          }
        }, 1000)
      : null
    const finish = (res: TaskResult) => {
      clearTimeout(timer)
      if (poll) clearInterval(poll)
      if (buf.trim()) opts.onLine(buf.trim())
      child = null
      resolve(res)
    }
    proc.on('error', (e) => finish({ ok: false, error: String(e) }))
    proc.on('close', (code) => {
      // Codex thoat EM voi ma 0 khi nhan SIGTERM -> phai xet "da huy" TRUOC ma thoat.
      // Ma 0 cung chua chac da dang nhap: noi goi (ipc) hoi lai trang thai qua sidecar.
      if (doneEarly) finish({ ok: true })
      else if (canceled) finish({ ok: false, canceled: true })
      else if (code === 0) finish({ ok: true })
      else finish({ ok: false, error: tail.slice(-4).join('\n') || `${basename(bin)} thoát với mã ${code}` })
    })
  })
}

function validBin(bin: string, name: string): boolean {
  if (!bin || !isAbsolute(bin) || !existsSync(bin)) return false
  // Windows: codex.exe / claude.exe / agy.exe (hoac codex.cmd cua npm)
  const base = IS_WIN ? basename(bin, extname(bin)).toLowerCase() : basename(bin)
  return base === name
}

/** PowerShell: chuoi trong nhay don (nhay don ben trong -> '') */
const psq = (v: string) => "'" + v.replace(/'/g, "''") + "'"

/** Windows: ghi .ps1 (UTF-8 co BOM) roi mo cua so PowerShell RIENG chay no. Tra loi (chuoi rong = ok). */
function openPsWindow(file: string, lines: string[]): string {
  writeFileSync(file, '\ufeff' + lines.join('\r\n') + '\r\n', 'utf-8')
  try {
    const p = spawn(powershell(), ['-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], {
      detached: true, // console moi -> cua so PowerShell hien ra cho nguoi dung thao tac
      stdio: 'ignore',
      windowsHide: false,
      cwd: homedir(),
      env: cleanEnv()
    })
    p.unref()
    return ''
  } catch (e) {
    return String((e as Error)?.message || e)
  }
}

export function startCodexLogin(bin: string, mode: CliLoginMode, onLine: (line: string) => void): Promise<TaskResult> {
  if (!validBin(bin, 'codex')) return Promise.resolve({ ok: false, error: 'Không tìm thấy Codex CLI trên máy.' })
  const args = mode === 'device' ? ['login', '--device-auth'] : ['login']
  const env = cleanEnv()
  return runTask(bin, args, { env, timeoutMs: LOGIN_TIMEOUT_MS, onLine })
}

/** Gui 1 dong (vd ma xac thuc nguoi dung dan vao) toi CLI dang chay dang nhap. */
export function sendCliInput(text: string): boolean {
  const t = String(text || '').trim()
  if (!child?.stdin || !t || t.length > 4096 || /[\r\n]/.test(t)) return false
  try {
    child.stdin.write(t + '\n')
    return true
  } catch {
    return false
  }
}

/** File phien dang nhap cua agy (cung cach sidecar / Doctor nhan biet). */
function agyTokenPresent(): boolean {
  return agySessionPresent()
}

/**
 * Dang nhap agy NGAY TRONG APP (giong Codex): chay `agy -p` an — chua co phien thi agy tu bat dau OAuth: mo trinh duyet
 * mac dinh + cho ket qua qua may chu localhost (trang callback cua Google gui ve), in kem link du phong + "paste code".
 * Thay file phien -> dung agy ngay (khong can cho tra loi prompt). Da thu that 2026-10-01 (agy 1.2.14).
 * KHONG dat SSH_CONNECTION (bien do bat che do "in link + dan ma", khong tu xong).
 */
export function startAgyLogin(bin: string, workdir: string, onLine: (line: string) => void): Promise<TaskResult> {
  if (!validBin(bin, 'agy')) return Promise.resolve({ ok: false, error: 'Không tìm thấy Antigravity CLI (agy) trên máy.' })
  if (workdir) mkdirSync(workdir, { recursive: true })
  const env = cleanEnv()
  for (const k of Object.keys(env)) if (/^SSH_(CONNECTION|CLIENT|TTY)$/i.test(k)) delete env[k]
  const cwd = workdir && isAbsolute(workdir) ? workdir : homedir()
  if (IS_WIN) return agyLoginWindow(bin, cwd, env, onLine)
  // macOS: `agy -p` khong tu mo trinh duyet (chi in link) -> app tu mo link dang nhap dau tien agy in ra
  onLine('Đang mở trình duyệt để đăng nhập tài khoản Google…')
  let opened = false
  const onLineOpen = (line: string) => {
    const m = /https:\/\/accounts\.google\.com\/[^\s"'<>]+/.exec(line)
    if (m && !opened) {
      opened = true
      shell.openExternal(m[0]).catch(() => {})
    }
    onLine(line)
  }
  return runTask(bin, ['-p', 'Chỉ trả lời đúng một từ: OK', '--output-format', 'json', '--disable-slash-commands', '--print-timeout', '120s'], {
    env,
    cwd,
    timeoutMs: LOGIN_TIMEOUT_MS,
    stdin: 'pipe',
    onLine: onLineOpen,
    doneWhen: agyTokenPresent
  })
}

/**
 * Windows: agy CHAY AN (console an) ghi link / doc ma qua CONSOLE cua no (CONOUT$ / CONIN$) chu khong qua ong dan
 * -> app khong nhan duoc gi, trinh duyet cung khong mo (su co that may Windows 2026-10-01). Giao dien day du cua agy
 * (`agy` khong tham so, KHONG bien SSH_*) TU MO trinh duyet dang nhap Google -> chay no trong cua so RIENG, THU NHO
 * (Start-Process -WindowStyle Minimized); co file phien -> app tu dong cua so do. Nguoi dung chi dang nhap tren trinh duyet.
 */
function agyLoginWindow(bin: string, cwd: string, env: NodeJS.ProcessEnv, onLine: (line: string) => void): Promise<TaskResult> {
  if (child || extPid) return Promise.resolve({ ok: false, error: 'Đang có một lượt đăng nhập / cài đặt chạy dở.' })
  return new Promise((resolve) => {
    extCancel = false
    const script = `$p = Start-Process -FilePath ${psq(bin)} -WorkingDirectory ${psq(cwd)} -WindowStyle Minimized -PassThru; $p.Id`
    execFile(powershell(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env, windowsHide: true, timeout: 30000 }, (err, stdout) => {
        const pid = Number(String(stdout || '').trim().split(/\r?\n/).pop())
        if (err || !pid) {
          resolve({ ok: false, error: 'Không khởi động được Antigravity CLI: ' + String(err?.message || stdout).slice(0, 200) })
          return
        }
        extPid = pid
        onLine('Đã mở Antigravity CLI (cửa sổ thu nhỏ ở thanh tác vụ) — trình duyệt sẽ mở trang đăng nhập Google.')
        onLine('Trình duyệt không mở? Bấm vào cửa sổ agy ở thanh tác vụ để xem link đăng nhập.')
        const t0 = Date.now()
        const alive = () => {
          try {
            process.kill(pid, 0)
            return true
          } catch {
            return false
          }
        }
        const done = (res: TaskResult) => {
          clearInterval(timer)
          killTree(pid)
          extPid = 0
          resolve(res)
        }
        const timer = setInterval(() => {
          if (agyTokenPresent()) {
            onLine('Đã nhận phiên đăng nhập Google — đóng cửa sổ agy.')
            done({ ok: true })
          } else if (extCancel) done({ ok: false, canceled: true })
          else if (!alive()) done({ ok: false, error: 'Cửa sổ Antigravity CLI đã đóng trước khi đăng nhập xong.' })
          else if (Date.now() - t0 > LOGIN_TIMEOUT_MS) done({ ok: false, error: 'Quá 10 phút chưa đăng nhập xong — bấm lại “Đăng nhập Google”.' })
        }, 1000)
      })
  })
}

/** Dang nhap Claude Code NGAY TRONG APP: `claude auth login --claudeai` an — CLI tu mo trinh duyet + nhan ket qua qua
 *  localhost, in link du phong + "Paste code here if prompted" (stdin). Da thu that 2026-10-01 (2.1.283). */
export function startClaudeLogin(bin: string, onLine: (line: string) => void): Promise<TaskResult> {
  if (!validBin(bin, 'claude')) return Promise.resolve({ ok: false, error: 'Không tìm thấy Claude Code CLI trên máy.' })
  return runTask(bin, ['auth', 'login', '--claudeai'], {
    env: claudeEnv(cleanEnv()),
    cwd: homedir(),
    timeoutMs: LOGIN_TIMEOUT_MS,
    stdin: 'pipe',
    onLine
  })
}

/** Noi dung file .command mo trong Terminal de dang nhap agy (co dinh, khong nhan tu ngoai) */
function agyLoginScript(bin: string, workdir: string): string {
  const q = (v: string) => "'" + v.replace(/'/g, "'\\''") + "'"
  return [
    '#!/bin/zsh',
    'clear',
    'echo "=== Đăng nhập Antigravity CLI (agy) cho Agent Edit ==="',
    'echo ""',
    'echo "1. agy sẽ hiện một đường link đăng nhập Google (không tự mở trình duyệt)."',
    'echo "2. Copy link, dán vào trình duyệt ĐANG đăng nhập tài khoản Google (AI Pro) của bạn."',
    'echo "3. Đăng nhập xong: nếu trang hiện mã (authorization code) thì dán vào cửa sổ này rồi Enter."',
    'echo "4. Khi agy hiện ô chat là xong — app tự nhận ra; gõ /exit để đóng cửa sổ này."',
    'echo ""',
    '# Che do dang nhap tu xa: agy in link + nhan ma, khong tu mo trinh duyet mac dinh',
    'export SSH_CONNECTION="127.0.0.1 22 127.0.0.1 22"',
    'export SSH_CLIENT="127.0.0.1 22 22"',
    'export SSH_TTY="$(tty)"',
    `cd ${q(workdir)}`,
    `exec ${q(bin)}`,
    ''
  ].join('\n')
}

/**
 * Mo Terminal chay `agy` de dang nhap. bin = duong dan agy (tu sidecar), workdir = thu muc lam viec
 * rieng cua app. Tra ngay sau khi mo cua so — UI tu hoi lai trang thai dang nhap.
 */
export async function openAgyLogin(bin: string, workdir: string): Promise<TaskResult> {
  if (!validBin(bin, 'agy')) return { ok: false, error: 'Không tìm thấy Antigravity CLI (agy) trên máy.' }
  if (!workdir || !isAbsolute(workdir)) return { ok: false, error: 'Thiếu thư mục làm việc của Antigravity CLI.' }
  const dir = join(homedir(), '.capcut-studio', 'agy-login')
  mkdirSync(dir, { recursive: true })
  mkdirSync(workdir, { recursive: true })
  if (IS_WIN) {
    const err = openPsWindow(join(dir, 'dang-nhap-agy.ps1'), [
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
      '$Host.UI.RawUI.WindowTitle = "Agent Edit - Đăng nhập Antigravity CLI"',
      'Clear-Host',
      'Write-Host "=== Đăng nhập Antigravity CLI (agy) cho Agent Edit ==="',
      'Write-Host ""',
      'Write-Host "1. agy sẽ hiện một đường link đăng nhập Google (không tự mở trình duyệt)."',
      'Write-Host "2. Copy link (bôi đen rồi chuột phải), dán vào trình duyệt ĐANG đăng nhập tài khoản Google (AI Pro) của bạn."',
      'Write-Host "3. Đăng nhập xong: nếu trang hiện mã (authorization code) thì dán vào cửa sổ này rồi Enter."',
      'Write-Host "4. Khi agy hiện ô chat là xong — app tự nhận ra; gõ /exit rồi đóng cửa sổ này."',
      'Write-Host ""',
      '# Che do dang nhap tu xa: agy in link + nhan ma, khong tu mo trinh duyet mac dinh',
      '$env:SSH_CONNECTION = "127.0.0.1 22 127.0.0.1 22"',
      '$env:SSH_CLIENT = "127.0.0.1 22 22"',
      '$env:SSH_TTY = "windows-console"',
      `Set-Location -LiteralPath ${psq(workdir)}`,
      `& ${psq(bin)}`
    ])
    return err ? { ok: false, error: 'Không mở được cửa sổ PowerShell: ' + err } : { ok: true }
  }
  const file = join(dir, 'dang-nhap-agy.command')
  writeFileSync(file, agyLoginScript(bin, workdir), 'utf-8')
  chmodSync(file, 0o755)
  const err = await shell.openPath(file)
  return err ? { ok: false, error: 'Không mở được Terminal: ' + err } : { ok: true }
}

/** Noi dung file .command mo trong Terminal de dang nhap Claude Code (co dinh, khong nhan tu ngoai) */
function claudeLoginScript(bin: string): string {
  const q = (v: string) => "'" + v.replace(/'/g, "'\\''") + "'"
  return [
    '#!/bin/zsh',
    'clear',
    'echo "=== Đăng nhập Claude Code cho Agent Edit ==="',
    'echo ""',
    'echo "1. Claude Code sẽ mở trình duyệt để bạn đăng nhập tài khoản Claude (gói Pro / Max / Team)."',
    'echo "2. Trình duyệt không tự mở: copy đường link bên dưới dán vào trình duyệt."',
    'echo "3. Trang hiện mã (code): dán vào cửa sổ này rồi Enter."',
    'echo "4. Thấy báo đăng nhập thành công là xong — app tự nhận ra, đóng cửa sổ này."',
    'echo ""',
    `cd "$HOME"`,
    'unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL',
    `${q(bin)} auth login --claudeai`,
    'echo ""',
    'echo "Xong — có thể đóng cửa sổ này."',
    ''
  ].join('\n')
}

/** Mo Terminal chay `claude auth login`. Tra ngay sau khi mo cua so — UI tu hoi lai trang thai. */
export async function openClaudeLogin(bin: string): Promise<TaskResult> {
  if (!validBin(bin, 'claude')) return { ok: false, error: 'Không tìm thấy Claude Code CLI trên máy.' }
  const dir = join(homedir(), '.capcut-studio', 'claude-login')
  mkdirSync(dir, { recursive: true })
  if (IS_WIN) {
    const err = openPsWindow(join(dir, 'dang-nhap-claude.ps1'), [
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
      '$Host.UI.RawUI.WindowTitle = "Agent Edit - Đăng nhập Claude Code"',
      'Clear-Host',
      'Write-Host "=== Đăng nhập Claude Code cho Agent Edit ==="',
      'Write-Host ""',
      'Write-Host "1. Claude Code sẽ mở trình duyệt để bạn đăng nhập tài khoản Claude (gói Pro / Max / Team)."',
      'Write-Host "2. Trình duyệt không tự mở: copy đường link bên dưới dán vào trình duyệt."',
      'Write-Host "3. Trang hiện mã (code): dán vào cửa sổ này (chuột phải để dán) rồi Enter."',
      'Write-Host "4. Thấy báo đăng nhập thành công là xong — app tự nhận ra, đóng cửa sổ này."',
      'Write-Host ""',
      'Set-Location -LiteralPath $HOME',
      '# bo bien API key / router (vd 9Router) — chung lam Claude Code bo qua tai khoan Claude.ai',
      'Remove-Item Env:ANTHROPIC_API_KEY, Env:ANTHROPIC_AUTH_TOKEN, Env:ANTHROPIC_BASE_URL -ErrorAction SilentlyContinue',
      `& ${psq(bin)} auth login --claudeai`,
      'Write-Host ""',
      'Write-Host "Xong — có thể đóng cửa sổ này."'
    ])
    return err ? { ok: false, error: 'Không mở được cửa sổ PowerShell: ' + err } : { ok: true }
  }
  const file = join(dir, 'dang-nhap-claude.command')
  writeFileSync(file, claudeLoginScript(bin), 'utf-8')
  chmodSync(file, 0o755)
  const err = await shell.openPath(file)
  return err ? { ok: false, error: 'Không mở được Terminal: ' + err } : { ok: true }
}

/** Cap nhat Claude Code bang lenh chinh chu `claude update` (model moi can ban CLI moi) */
export function startClaudeUpdate(bin: string, onLine: (line: string) => void): Promise<TaskResult> {
  if (!validBin(bin, 'claude')) return Promise.resolve({ ok: false, error: 'Không tìm thấy Claude Code CLI trên máy.' })
  onLine('$ claude update')
  return runTask(bin, ['update'], { env: claudeEnv(cleanEnv()), cwd: homedir(), timeoutMs: INSTALL_TIMEOUT_MS, onLine })
}

/** Cai CLI cho provider `name`: Codex / Claude Code qua bo cai cua Doctor (dung ban ghim), agy qua trinh cai chinh chu */
export function startCliInstall(name: string, onLine: (line: string) => void): Promise<TaskResult> {
  const spec = CLI_PACKAGES[name]
  if (!spec) return Promise.resolve({ ok: false, error: 'Không có gói CLI cho ' + name })
  if (name === 'gpt' || name === 'claude') {
    const fn = name === 'gpt' ? installCodex : installClaude
    return fn(onLine).then(
      () => ({ ok: true }),
      (e) => ({ ok: false, error: String((e as Error)?.message || e) })
    )
  }
  if (IS_WIN && name === 'gemini') {
    // Windows: trinh cai chinh chu install.ps1 (agy.exe vao %LOCALAPPDATA%\agy\bin) — cung bo cai cua Doctor
    return installAgy(onLine).then(
      () => ({ ok: true }),
      (e) => ({ ok: false, error: String((e as Error)?.message || e) })
    )
  }
  const env = cleanEnv()
  if (spec.script) {
    // Trinh cai chinh chu cua Google: tai agy vao ~/.local/bin (kiem SHA-512), them PATH vao ~/.zprofile
    onLine(`$ curl -fsSL ${spec.script} | bash`)
    return runTask('/bin/bash', ['-c', `curl -fsSL ${spec.script} | bash`], {
      env,
      timeoutMs: INSTALL_TIMEOUT_MS,
      onLine
    })
  }
  return Promise.resolve({ ok: false, error: 'Không có cách cài cho ' + spec.label })
}
