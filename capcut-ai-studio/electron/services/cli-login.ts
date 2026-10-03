import { execFile, execFileSync, spawn, ChildProcess } from 'child_process'
import { installAgy, installClaude, installCodex, manifest, powershell } from './toolchain'
import { existsSync, mkdirSync, writeFileSync, chmodSync, readdirSync, rmSync } from 'fs'
import { homedir } from 'os'
import { basename, extname, isAbsolute, join } from 'path'
import { shell } from 'electron'
import { IS_WIN, agyCredentialPresent, agySessionPresent, augmentedEnv, claudeEnv, cmdQuote, killTree, needsShell } from './env'

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
 *
 * DANG XUAT (doi sang tai khoan khac) — cung bang lenh chinh chu: `codex logout`, `claude auth logout`, agy `/logout`
 * (agy chan /logout o che do -p -> chay giao dien day du `agy -i /logout`, xem startAgyLogout).
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
/** child la /usr/bin/script boc CLI (pseudo-terminal) — xem runTask opts.pty */
let childPty = false
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
  stopChild(child)
}

/** macOS: chay CLI trong pseudo-terminal. agy >= 1.2.16 chay bang ong dan (khong TTY) thi KHONG bat dau dang nhap
 *  Google nua — in "authentication required. Run 'agy' to log in" roi thoat (su co that may Mac moi 2026-10-03); co
 *  TTY thi van in link + cho dang nhap nhu 1.2.14. */
const SCRIPT_BIN = '/usr/bin/script'
// script doi stdin la ong pipe(2) THAT: ong 'pipe' cua Node (socket) va FIFO deu bi tu choi ("tcgetattr/ioctl: Operation
// not supported on socket", da do that) -> bash noi stdin qua `cat` bang process substitution roi exec script.
// pty cua script co kich thuoc 0x0 khi stdin khong phai terminal -> giao dien day du cua agy khong ve gi -> dat bang stty.
const PTY_WRAP =
  'exec /usr/bin/script -q /dev/null /bin/sh -c \'stty rows 40 cols 120 2>/dev/null; exec "$0" "$@"\' "$@" < <(exec /bin/cat 2>/dev/null)'

function stopChild(proc: ChildProcess): void {
  if (childPty && proc.pid) {
    // script KHONG chuyen tin hieu cho CLI ben trong -> dung CLI truoc (khong thi agy mo coi, ppid 1 — da do that)
    try {
      execFileSync('/usr/bin/pkill', ['-TERM', '-P', String(proc.pid)], { stdio: 'ignore', timeout: 5000 })
    } catch {
      /* khong con tien trinh con */
    }
    try {
      proc.kill('SIGTERM')
    } catch {
      /* da thoat */
    }
    return
  }
  // Windows: dung CA CAY (codex.exe con chau) — kill() chi giet tien trinh truc tiep
  killTree(proc.pid, () => {
    try {
      proc.kill('SIGTERM')
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
    /** text = da bo ma ANSI; raw = nguyen ban (giao dien day du cua agy hoi terminal bang ma ANSI) */
    onChunk?: (text: string, proc: ChildProcess, raw: string) => void
    /** macOS: chay trong pseudo-terminal (/usr/bin/script) — CLI tuong dang o Terminal that */
    pty?: boolean
    /** Hoi moi giay: tra true = viec da xong (vd da co file phien dang nhap) -> dung tien trinh, bao THANH CONG */
    doneWhen?: () => boolean
  }
): Promise<TaskResult> {
  if (child || extPid) return Promise.resolve({ ok: false, error: 'Đang có một lượt đăng nhập / cài đặt chạy dở.' })
  return new Promise((resolve) => {
    canceled = false
    const pty = !!opts.pty && !IS_WIN && existsSync(SCRIPT_BIN)
    const sh = !pty && needsShell(bin)
    const proc = pty
      ? spawn('/bin/bash', ['-c', PTY_WRAP, 'agy-pty', bin, ...args], { env: opts.env, cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn(sh ? cmdQuote(bin) : bin, sh ? args.map(cmdQuote) : args, {
          env: opts.env,
          cwd: opts.cwd,
          stdio: [opts.stdin || 'ignore', 'pipe', 'pipe'],
          windowsHide: true,
          shell: sh
        })
    child = proc
    childPty = pty
    const tail: string[] = []
    let buf = ''
    const feed = (chunk: Buffer) => {
      const raw = chunk.toString('utf-8')
      const text = raw.replace(ANSI, '')
      opts.onChunk?.(text, proc, raw)
      buf += text
      const parts = buf.split(/\r?\n/)
      buf = parts.pop() || ''
      for (const raw of parts) {
        const line = raw.trimEnd()
        if (!line.trim()) continue
        // pty: script in ^D (EOF) khi dong stdin — khong phai chu cua CLI
        if (pty && /^(\^D|\x04)[\b]*$/.test(line.trim())) continue
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
            stopChild(proc)
          }
        }, 1000)
      : null
    const finish = (res: TaskResult) => {
      clearTimeout(timer)
      if (poll) clearInterval(poll)
      if (buf.trim()) opts.onLine(buf.trim())
      child = null
      childPty = false
      resolve(res)
    }
    proc.on('error', (e) => finish({ ok: false, error: String(e) }))
    // pty: `cat` noi stdin con song toi khi app dong stdin -> dong ngay khi script thoat (khong thi 'close' khong toi)
    if (pty) proc.on('exit', () => proc.stdin?.end())
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

/** env + thu muc lam viec cho agy chay tu app (KHONG bien SSH_*: bien do bat che do "in link + dan ma") */
function agyEnvCwd(workdir: string): { env: NodeJS.ProcessEnv; cwd: string } {
  if (workdir) mkdirSync(workdir, { recursive: true })
  const env = cleanEnv()
  for (const k of Object.keys(env)) if (/^SSH_(CONNECTION|CLIENT|TTY)$/i.test(k)) delete env[k]
  return { env, cwd: workdir && isAbsolute(workdir) ? workdir : homedir() }
}

/**
 * Dang nhap agy NGAY TRONG APP (giong Codex): chay `agy -p` — chua co phien thi agy tu bat dau OAuth: in link Google,
 * cho ket qua ~60s, kem "paste code". Thay phien -> dung agy ngay (khong can cho tra loi prompt).
 * agy 1.2.14 lam vay ca khi chay an; tu 1.2.16 CHI khi co TTY -> macOS chay trong pseudo-terminal (opts.pty).
 */
export function startAgyLogin(bin: string, workdir: string, onLine: (line: string) => void): Promise<TaskResult> {
  if (!validBin(bin, 'agy')) return Promise.resolve({ ok: false, error: 'Không tìm thấy Antigravity CLI (agy) trên máy.' })
  const { env, cwd } = agyEnvCwd(workdir)
  if (IS_WIN) return agyWindow(bin, [], cwd, env, onLine, {
    done: agyTokenPresent,
    intro: [
      'Đã mở cửa sổ Antigravity CLI (agy).',
      'Nếu agy hỏi “Select login method”: bấm Enter để chọn “1. Google OAuth” — trình duyệt sẽ mở trang đăng nhập Google.',
      'Đăng nhập xong app tự nhận ra và đóng cửa sổ agy.'
    ],
    okLine: 'Đã nhận phiên đăng nhập Google — đóng cửa sổ agy.',
    closedError: 'Cửa sổ Antigravity CLI đã đóng trước khi đăng nhập xong.',
    timeoutMs: LOGIN_TIMEOUT_MS
  })
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
    pty: true,
    onLine: onLineOpen,
    doneWhen: agyTokenPresent
  })
}

/** Tra loi cac cau hoi nhan dang terminal cua giao dien day du agy (khong tra loi -> agy dung cho mai, da do that) */
function answerTerminalQueries(raw: string, proc: ChildProcess): void {
  const reply = (s: string) => {
    try {
      proc.stdin?.write(s)
    } catch {
      /* da dong */
    }
  }
  if (raw.includes('\x1b[>q')) reply('\x1bP>|xterm(370)\x1b\\')
  if (raw.includes('\x1b[c') || raw.includes('\x1b[0c')) reply('\x1b[?62;22c')
  if (raw.includes('\x1b[?u')) reply('\x1b[?0u')
  if (raw.includes('\x1b[6n')) reply('\x1b[1;1R')
}

/**
 * Dang xuat agy (doi tai khoan Google). `agy -p /logout` bi agy chan ("not available in print mode") -> chay giao dien
 * day du `agy -i /logout`: macOS trong pseudo-terminal, app tu tra loi "Are you sure you want to sign out?" (va hoi tin
 * cay thu muc lam viec cua app neu co); Windows trong cua so agy rieng, nguoi dung tu xac nhan.
 * Xong = muc phien trong Keychain / Credential Manager bien mat -> dung agy, don file phien cu con sot.
 */
export function startAgyLogout(bin: string, workdir: string, onLine: (line: string) => void): Promise<TaskResult> {
  if (!validBin(bin, 'agy')) return Promise.resolve({ ok: false, error: 'Không tìm thấy Antigravity CLI (agy) trên máy.' })
  const { env, cwd } = agyEnvCwd(workdir)
  const loggedOut = () => !agyCredentialPresent()
  const finish = (r: TaskResult): TaskResult => {
    if (r.ok) clearAgyLeftovers()
    return r
  }
  if (IS_WIN) return agyWindow(bin, ['-i', '/logout'], cwd, env, onLine, {
    done: loggedOut,
    intro: [
      'Đã mở cửa sổ Antigravity CLI (agy) để đăng xuất.',
      'agy hỏi “Are you sure you want to sign out?”: gõ y rồi Enter trong cửa sổ đó.',
      'Đăng xuất xong app tự đóng cửa sổ agy.'
    ],
    okLine: 'Đã đăng xuất tài khoản Google khỏi Antigravity CLI.',
    closedError: 'Cửa sổ Antigravity CLI đã đóng trước khi đăng xuất xong.',
    timeoutMs: 5 * 60 * 1000
  }).then(finish)
  onLine('Đang đăng xuất tài khoản Google khỏi Antigravity CLI…')
  let seen = ''
  let trusted = false
  let confirmed = false
  return runTask(bin, ['-i', '/logout'], {
    env,
    cwd,
    timeoutMs: 90 * 1000,
    stdin: 'pipe',
    pty: true,
    // Giao dien day du ve lai man hinh lien tuc -> khong dua ra nhat ky
    onLine: () => {},
    onChunk: (text, proc, raw) => {
      answerTerminalQueries(raw, proc)
      seen = (seen + text).slice(-4000)
      if (!trusted && /Do you trust the contents of this project/i.test(seen)) {
        // thu muc lam viec rieng cua app (~/.capcut-studio/agy-work) — chon dong dau "Yes, I trust this folder"
        trusted = true
        seen = ''
        setTimeout(() => proc.stdin?.write('\r'), 400)
      }
      if (!confirmed && /Are you sure you want to sign out/i.test(seen)) {
        confirmed = true
        setTimeout(() => proc.stdin?.write('y'), 300)
        setTimeout(() => proc.stdin?.write('\r'), 700)
      }
    },
    doneWhen: loggedOut
  }).then((r) => {
    if (r.ok || r.canceled) return finish(r)
    // agy tu thoat: hoi lai Keychain that (doneWhen hoi moi 1s, co the chua kip)
    if (loggedOut()) return finish({ ok: true })
    return { ok: false, error: r.error || 'Antigravity CLI chưa đăng xuất được.' }
  })
}

/**
 * Loi dang nhap / dang xuat agy -> cau de hieu (bo dong JSON tho agy in ra). agy may nay KHAC ban da kiem
 * (toolchain.json cli.agy.tested) -> noi ro ban moi co the da doi cach dang nhap + chi cach lam thang trong agy.
 */
export function agyFailureText(raw: string | undefined, version: string | null | undefined, action: 'login' | 'logout'): string {
  const text = String(raw || '')
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('{'))
  let msg: string
  if (/authentication required/i.test(text)) msg = 'Antigravity CLI không mở bước đăng nhập Google.'
  else if (/invalid_grant/i.test(text)) msg = 'Mã đăng nhập dán vào không đúng hoặc đã hết hạn — bấm đăng nhập lại.'
  else if (/auth(entication)? (failed or )?timed out/i.test(text)) msg = 'Quá thời gian chờ đăng nhập (agy chỉ chờ khoảng 1 phút) — bấm đăng nhập lại.'
  else msg = lines.slice(0, 3).join('\n') || (action === 'login' ? 'Antigravity CLI chưa ghi nhận đăng nhập.' : 'Antigravity CLI chưa đăng xuất được.')
  const tested = manifest().cli.agy.tested
  const v = String(version || '').trim()
  if (tested && v && v !== tested) {
    const term = IS_WIN ? 'PowerShell' : 'Terminal'
    msg += `\nAntigravity CLI trên máy là bản ${v}, app đã kiểm với bản ${tested} — bản này có thể đã đổi cách ${
      action === 'login' ? 'đăng nhập' : 'đăng xuất'}. ` + (action === 'login'
      ? `Bấm “Không đăng nhập được? Mở cửa sổ ${term}” để đăng nhập thẳng trong agy.`
      : `Đăng xuất thẳng trong agy: mở ${term}, chạy agy rồi gõ /logout.`)
  }
  return msg
}

/** Sau khi agy da dang xuat: xoa file phien kieu cu (agy <= 1.2.x truoc Keychain; agy hien tai khong doc nua) + dau
 *  keyring-marker con sot -> app khong con bao "da dang nhap" nham. */
function clearAgyLeftovers(): void {
  const dir = join(homedir(), '.gemini', 'antigravity-cli')
  try {
    for (const n of readdirSync(dir)) {
      if (n === 'antigravity-oauth-token' || /^keyring-marker/i.test(n)) rmSync(join(dir, n), { force: true })
    }
  } catch {
    /* khong co thu muc */
  }
}

/** Dang xuat Codex (`codex logout`) / Claude Code (`claude auth logout`) — lenh chinh chu, khong can trinh duyet */
export function startCliLogout(id: string, bin: string, workdir: string, onLine: (line: string) => void): Promise<TaskResult> {
  if (id === 'gemini') return startAgyLogout(bin, workdir, onLine)
  if (id === 'claude') {
    if (!validBin(bin, 'claude')) return Promise.resolve({ ok: false, error: 'Không tìm thấy Claude Code CLI trên máy.' })
    return runTask(bin, ['auth', 'logout'], { env: claudeEnv(cleanEnv()), cwd: homedir(), timeoutMs: 60 * 1000, onLine })
  }
  if (!validBin(bin, 'codex')) return Promise.resolve({ ok: false, error: 'Không tìm thấy Codex CLI trên máy.' })
  return runTask(bin, ['logout'], { env: cleanEnv(), timeoutMs: 60 * 1000, onLine })
}

/**
 * Windows: agy CHAY AN (console an) ghi link / doc ma qua CONSOLE cua no (CONOUT$ / CONIN$) chu khong qua ong dan
 * -> app khong nhan duoc gi, trinh duyet cung khong mo (su co that may Windows 2026-10-01). Giao dien day du cua agy
 * (KHONG bien SSH_*) chay trong cua so RIENG. Tu agy 1.2.16 giao dien do hoi "Select login method" (Enter = Google
 * OAuth) va /logout hoi xac nhan -> cua so de HIEN (khong thu nho) cho nguoi dung bam. done() dung -> app dong cua so.
 */
function agyWindow(
  bin: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  onLine: (line: string) => void,
  o: { done: () => boolean; intro: string[]; okLine: string; closedError: string; timeoutMs: number }
): Promise<TaskResult> {
  if (child || extPid) return Promise.resolve({ ok: false, error: 'Đang có một lượt đăng nhập / cài đặt chạy dở.' })
  return new Promise((resolve) => {
    extCancel = false
    const argList = args.length ? ` -ArgumentList ${args.map(psq).join(',')}` : ''
    const script = `$p = Start-Process -FilePath ${psq(bin)}${argList} -WorkingDirectory ${psq(cwd)} -PassThru; $p.Id`
    execFile(powershell(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env, windowsHide: true, timeout: 30000 }, (err, stdout) => {
        const pid = Number(String(stdout || '').trim().split(/\r?\n/).pop())
        if (err || !pid) {
          resolve({ ok: false, error: 'Không khởi động được Antigravity CLI: ' + String(err?.message || stdout).slice(0, 200) })
          return
        }
        extPid = pid
        o.intro.forEach((l) => onLine(l))
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
          if (o.done()) {
            onLine(o.okLine)
            done({ ok: true })
          } else if (extCancel) done({ ok: false, canceled: true })
          else if (!alive()) done(o.done() ? { ok: true } : { ok: false, error: o.closedError })
          else if (Date.now() - t0 > o.timeoutMs) done({ ok: false, error: `Quá ${Math.round(o.timeoutMs / 60000)} phút chưa xong — bấm lại.` })
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
    'echo "1. agy hỏi “Select login method”: bấm Enter (1. Google OAuth) — agy hiện một đường link đăng nhập Google."',
    'echo "2. Copy link, dán vào trình duyệt ĐANG đăng nhập tài khoản Google (AI Pro) của bạn."',
    'echo "3. Đăng nhập xong: nếu trang hiện mã (authorization code) thì dán vào cửa sổ này rồi Enter."',
    'echo "4. Khi agy hiện ô chat là xong — app tự nhận ra; gõ /exit để đóng cửa sổ này."',
    'echo ""',
    '# Che do dang nhap tu xa: agy in link + nhan ma, khong tu mo trinh duyet mac dinh',
    'export AGY_CLI_DISABLE_AUTO_UPDATE=true',
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
      'Write-Host "1. agy hỏi “Select login method”: bấm Enter (1. Google OAuth) — agy hiện một đường link đăng nhập Google."',
      'Write-Host "2. Copy link (bôi đen rồi chuột phải), dán vào trình duyệt ĐANG đăng nhập tài khoản Google (AI Pro) của bạn."',
      'Write-Host "3. Đăng nhập xong: nếu trang hiện mã (authorization code) thì dán vào cửa sổ này rồi Enter."',
      'Write-Host "4. Khi agy hiện ô chat là xong — app tự nhận ra; gõ /exit rồi đóng cửa sổ này."',
      'Write-Host ""',
      '# Che do dang nhap tu xa: agy in link + nhan ma, khong tu mo trinh duyet mac dinh',
      '$env:AGY_CLI_DISABLE_AUTO_UPDATE = "true"',
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
