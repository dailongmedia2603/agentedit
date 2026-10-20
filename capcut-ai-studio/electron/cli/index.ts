// CHE DO CLI CUA AGENT EDIT (2026-10-12) — dung video bang dong lenh, KHONG giao dien, CUNG bo may voi app:
// cung ban quyen (key + khoa thiet bi trong Keychain cua app), cung khoa API / dang nhap AI, cung Doctor tu cai cong cu,
// cung sidecar + render Remotion, cung du lieu ~/.capcut-studio (du an hien o "Video da tao", thu vien phan tich dung lai).
//
//   "<Agent Edit.app>/Contents/MacOS/Agent Edit" --agent-edit-cli <lenh> [tham so]
//   (script `agent-edit` trong ky nang GetTime / gettime/agent-edit/scripts/agent-edit goi dung cach nay)
//
// Viec tao video chay NEN (1 tien trinh app khong cua so / video): `make` tra ma viec ngay, `wait` cho (mac dinh toi da
// 9 phut / lan — vua gioi han 10 phut 1 lenh cua AI agent), `job` / `jobs` xem, `cancel` huy. Chi tiet: PROJECT_OVERVIEW 16.
import { app } from 'electron'
import { execFileSync, spawn } from 'child_process'
import { existsSync, openSync, statSync, writeFileSync } from 'fs'
import { isAbsolute, resolve } from 'path'
import { autoFix, DoctorCheck, fixCheck, runDoctor } from '../services/doctor'
import { activateLicense, checkLicense, LicenseState } from '../services/license'
import { maskedProviders, providersConfigured, ProvidersMap, saveProviders } from '../services/secrets'
import { startSidecar, stopSidecar } from '../services/sidecar'
import { startAgyLogin, startClaudeLogin, startCodexLogin, sendCliInput, agyFailureText, CLI_PACKAGES } from '../services/cli-login'
import { applyUpdate, checkForUpdateNow, initUpdater, updateState, updaterEnabled } from '../services/updater'
import { killTree } from '../services/env'
import { powershell } from '../services/toolchain'
import { activeJobs, cancelFile, codeFile, Job, JobInput, JobInsert, jobLog, jobMilestone, listJobs, loadJob, newJobId, saveJob, TERMINAL, waitJobUntil } from './jobs'
import { accountArg, accountOf, activeLogin, cliStatusOf, loginView, runLoginJob } from './login'
import { aiHints, doctorSummary, ensureTools, runJob, runSetup, syncLibrary } from './pipeline'
import { Args, CLI_FLAG, errLine, opt, optAll, out, outJson, parseArgs, pidAlive, sleep } from './util'

declare const __APP_BUILD__: string
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : ''

const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm)$/i
const MEDIA_EXT = /\.(png|jpe?g|webp|gif|heic|heif|tiff?|bmp|avif|mp4|mov|m4v|webm|mkv|avi)$/i
const DEFAULT_WAIT_S = 540

/** Ma thoat: 0 xong · 1 loi · 2 sai lenh / thieu dieu kien · 3 con dang chay (het thoi gian cho) · 130 da huy */
const EXIT = { ok: 0, error: 1, usage: 2, running: 3, cancelled: 130 }

const HELP = `Agent Edit CLI — dựng video bằng AI, không cần mở giao diện (cùng bộ máy với app Agent Edit).

CÀI ĐẶT / KIỂM TRA
  agent-edit setup [--key <KEY> | --key-env] [--background]
                                       Kích hoạt key (nếu có) + tự cài toàn bộ công cụ còn thiếu + đồng bộ kho
                                       --key-env: lấy key từ biến môi trường AGENT_EDIT_KEY (không lộ trên dòng lệnh)
                                       --background: chạy nền, trả mã việc ngay (theo dõi: wait <mã> --until-change)
  agent-edit status                    Bản quyền, công cụ, đăng nhập AI, việc đang chạy
  agent-edit doctor [--fix]            Kiểm tra từng công cụ (--fix: tự cài mục còn thiếu)
  agent-edit activate <KEY>            Kích hoạt key bản quyền trên máy này (1 key = 1 máy, dùng chung với app)
  agent-edit login gemini|claude|codex Đăng nhập tài khoản AI (mở trình duyệt trên máy này)
      --start          chạy nền, trả link đăng nhập ngay (cho AI agent / chat)   [--device: Codex đăng nhập bằng mã thiết bị]
      --code <MÃ>      gửi mã trang đăng nhập hiện ra cho lượt đang chờ
      --check          đã đăng nhập chưa / lượt đăng nhập đang ở đâu
  agent-edit config [--gemini-key K] [--claude-key K] [--openai-key K]
                    [--gemini-mode subscription|api_key] [--claude-mode ...] [--openai-mode ...]
  agent-edit sync                      Đồng bộ kho SFX / meme / nhạc nền / mẫu chữ / hiệu ứng
  agent-edit update                    Cập nhật Agent Edit lên bản mới nhất
  agent-edit version

TẠO VIDEO (chạy nền, mỗi video 10–40 phút)
  agent-edit make --video <file> [--video <file2>...] [tuỳ chọn]   -> in mã việc (vd r_mxyz12ab)
      --request "<yêu cầu edit>"     mục đích / nội dung muốn làm (= ô "Mục đích" trên app)
      --style "<phong cách>"  --audience "<người xem>"  --duration "<độ dài mong muốn, vd 45-60 giây>"
      --reference <video mẫu>       bắt chước phong cách video mẫu
      --insert <ảnh/video> [--insert-note "<chèn khi nào / là gì>"] [--insert-use show|ai_ref|both]
                [--insert-placement auto|overlay|cutout|split|fullscreen]   (lặp lại theo thứ tự cho nhiều tư liệu)
      --landscape                    video ngang 16:9 (mặc định dọc 9:16)
      --brand-typography "<mô tả/tên font>"  --brand-colors "<mã màu #hex...>"  --brand-font <id font đã tải lên>
      --out <thư mục>                chép video xong ra thư mục này     --name "<tên file>"
      --fresh                        phân tích lại video (bỏ kết quả đã lưu)   --new-plan  lập kế hoạch mới
      --wait                         chờ tới khi xong (in tiến độ) thay vì trả mã việc ngay
  agent-edit wait <mã> [--timeout <giây>] [--until-change]
                                            Chờ việc (mặc định tối đa ${DEFAULT_WAIT_S}s, 0 = không giới hạn)
                                            --until-change: trả về ngay khi sang bước mới / xuất thêm 25%
  agent-edit job <mã>                       Trạng thái 1 việc       agent-edit jobs [--all]   Danh sách việc
  agent-edit cancel <mã>                    Huỷ việc đang chạy

Thêm --json vào mọi lệnh để nhận kết quả dạng JSON.
Mã thoát: 0 xong · 1 lỗi · 2 sai lệnh / máy chưa đủ điều kiện · 3 việc còn đang chạy (hết thời gian chờ) · 130 đã huỷ.`

// ---------------------------------------------------------------------------
// Moi truong: CLI thuong duoc AI agent (Claude Code / Codex) goi -> bo bien PHIEN cua agent me de `claude -p` / `codex`
// ma sidecar goi la phien doc lap (khong ket noi socket / hieu luc cua phien me). Giu bien cau hinh (CLAUDE_CONFIG_DIR,
// CODEX_HOME...) va bien API key (cli_providers tu loc theo che do dang nhap nhu tren app).
// ---------------------------------------------------------------------------
const AGENT_SESSION_ENV = /^(CLAUDECODE|CLAUDE_CODE_(ENTRYPOINT|SESSION_ID|CHILD_SESSION|SESSION_ATTENDED|MESSAGING_SOCKET|MESSAGING_TOKEN|EXECPATH|SSE_PORT|ENABLE_TASKS|ENABLE_SDK_FILE_CHECKPOINTING)|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_AGENT_SDK_VERSION|AI_AGENT|ELECTRON_RUN_AS_NODE)$/
export function cleanAgentEnv(): void {
  for (const k of Object.keys(process.env)) if (AGENT_SESSION_ENV.test(k)) delete process.env[k]
}

const json = (a: Args) => a.flags.has('json')

function absFile(p: string): string {
  const q = p.startsWith('~/') ? resolve(process.env.HOME || '', p.slice(2)) : p
  return isAbsolute(q) ? q : resolve(process.cwd(), q)
}

function fail(a: Args, message: string, code = EXIT.usage, extra: Record<string, unknown> = {}): number {
  if (json(a)) outJson({ ok: false, error: message, ...extra })
  else {
    errLine('Lỗi: ' + message)
    if (extra.hint) errLine('Gợi ý: ' + extra.hint)
  }
  return code
}

// ---------------------------------------------------------------------------
// Ban quyen + Doctor
// ---------------------------------------------------------------------------
function licenseLine(s: LicenseState): string {
  if (s.status === 'ok') {
    const plan = s.plan === 'lifetime' ? 'vĩnh viễn' : s.plan === 'year' ? 'năm' : s.plan === 'month' ? 'tháng' : s.plan || ''
    const exp = s.expiresAt ? ` · hết hạn ${new Date(s.expiresAt).toLocaleDateString('vi-VN')}` : ''
    return `OK${s.keyHint ? ` (key …${s.keyHint})` : ''}${plan ? ` · gói ${plan}` : ''}${exp}${s.dev ? ' · bản phát triển' : ''}`
  }
  return `${s.status} — ${s.message || 'chưa kích hoạt'}`
}

function printChecks(checks: DoctorCheck[]) {
  const icon = (s: string) => (s === 'ok' ? '✓' : s === 'warn' ? '!' : '✗')
  for (const c of checks) out(`  ${icon(c.status)} ${c.label}${c.found ? ` (${c.found})` : ''} — ${c.detail}`)
}

async function cmdStatus(a: Args): Promise<number> {
  const lic = await checkLicense('open')
  const checks = await runDoctor(providersConfigured())
  const fails = checks.filter((c) => c.status === 'fail')
  const ready = lic.status === 'ok' && !fails.length
  const jobs = activeJobs()
  const upd = updaterEnabled() ? 'có' : 'không'
  if (json(a)) {
    outJson({
      ok: true,
      ready,
      version: app.getVersion(),
      build: APP_BUILD,
      arch: process.arch,
      license: { status: lic.status, message: lic.message, plan: lic.plan, expiresAt: lic.expiresAt, keyHint: lic.keyHint },
      checks: doctorSummary(checks),
      next: [...(lic.status !== 'ok' ? ['agent-edit activate <KEY>'] : []), ...aiHints(checks),
        ...(fails.some((c) => c.group !== 'ai') ? ['agent-edit setup'] : [])],
      jobs: jobs.map((j) => ({ id: j.id, status: j.status, message: j.message }))
    })
    return ready ? EXIT.ok : EXIT.usage
  }
  out(`Agent Edit ${app.getVersion()}${APP_BUILD ? ' · build ' + APP_BUILD : ''} · ${process.arch === 'arm64' ? 'Apple Silicon' : process.arch === 'x64' ? 'Intel' : process.arch} · tự cập nhật: ${upd}`)
  out(`Bản quyền: ${licenseLine(lic)}`)
  out('Công cụ:')
  printChecks(checks)
  out(ready ? '=> SẴN SÀNG tạo video.' : '=> CHƯA sẵn sàng.')
  const next = [...(lic.status !== 'ok' ? ['agent-edit activate <KEY>'] : []), ...aiHints(checks),
    ...(fails.some((c) => c.group !== 'ai') ? ['agent-edit setup   (tự cài công cụ còn thiếu)'] : [])]
  if (next.length) out('Cần làm tiếp:\n' + next.map((x) => '  ' + x).join('\n'))
  if (jobs.length) out('Việc đang chạy:\n' + jobs.map((j) => `  ${j.id} — ${j.message || j.status}`).join('\n'))
  return ready ? EXIT.ok : EXIT.usage
}

async function cmdDoctor(a: Args): Promise<number> {
  let checks = await runDoctor(providersConfigured())
  if (a.flags.has('fix')) {
    if (!json(a)) out('Tự cài các công cụ còn thiếu / sai phiên bản...')
    const r = await autoFix(() => providersConfigured(), (fid, line) => !json(a) && out(`  [${fid}] ${line}`), () => undefined)
    checks = r.checks
  }
  const fails = checks.filter((c) => c.status === 'fail')
  if (json(a)) outJson({ ok: !fails.length, checks: doctorSummary(checks), next: aiHints(checks) })
  else {
    printChecks(checks)
    const h = aiHints(checks)
    if (h.length) out('Cần làm tiếp:\n' + h.map((x) => '  ' + x).join('\n'))
  }
  return fails.length ? EXIT.usage : EXIT.ok
}

async function cmdActivate(a: Args, key?: string): Promise<LicenseState> {
  const k = (key || a.pos[0] || '').trim()
  const st = await activateLicense(k)
  return st
}

/** JobInput rong cho viec khong phai tao video (setup / login) */
const NO_INPUT: JobInput = { videos: [], inserts: [], orientation: 'portrait', fresh: false }

async function cmdSetup(a: Args): Promise<number> {
  const say = (m: string) => !json(a) && out(m)
  // --key-env (1.20.0, ky nang GetTime): key lay tu bien AGENT_EDIT_KEY — khong nam tren dong lenh (`ps` thay duoc)
  const key = opt(a, 'key') || (a.flags.has('key-env') ? (process.env.AGENT_EDIT_KEY || '').trim() || undefined : undefined)
  delete process.env.AGENT_EDIT_KEY
  let lic: LicenseState
  if (key) {
    say('Kích hoạt key...')
    lic = await cmdActivate(a, key)
  } else lic = await checkLicense('open')
  if (a.flags.has('background')) return setupBackground(a, lic, !!key)
  say(`Bản quyền: ${licenseLine(lic)}`)
  say('Kiểm tra + tự cài công cụ (lần đầu: Whisper ~490 MB, Chrome ~90 MB, Codex, Claude Code, Antigravity CLI — có thể mất 5–15 phút)...')
  let checks: DoctorCheck[] = []
  try {
    checks = await ensureTools((l) => say('  ' + l), say)
  } catch {
    checks = await runDoctor(providersConfigured())
  }
  let synced: Record<string, unknown> | null = null
  if (lic.status === 'ok') {
    say('Đồng bộ kho SFX / meme / nhạc nền / mẫu chữ / hiệu ứng...')
    const s = await startSidecar()
    if (s.ok) synced = await syncLibrary((l) => say('  ' + l), true)
  }
  const fails = checks.filter((c) => c.status === 'fail')
  const next = [...(lic.status !== 'ok' ? ['agent-edit activate <KEY>'] : []), ...aiHints(checks)]
  const ready = lic.status === 'ok' && !fails.length
  if (json(a)) {
    outJson({ ok: ready, ready, license: { status: lic.status, message: lic.message }, checks: doctorSummary(checks), synced: synced?.ok ?? null, next })
  } else {
    printChecks(checks)
    out(ready ? '=> SẴN SÀNG tạo video.' : '=> CHƯA sẵn sàng.')
    if (next.length) out('Cần làm tiếp:\n' + next.map((x) => '  ' + x).join('\n'))
  }
  return ready ? EXIT.ok : EXIT.usage
}

/** `setup --background`: key da kich hoat o tren (khong dua key vao viec nen) -> tach viec cai cong cu + dong bo kho,
 *  tra ma viec ngay. Dang co luot cai chay -> tra luot do (khong chay 2 luot). */
async function setupBackground(a: Args, lic: LicenseState, keyGiven: boolean): Promise<number> {
  if (keyGiven && lic.status !== 'ok') {
    return fail(a, 'Kích hoạt key không thành công: ' + licenseLine(lic), EXIT.error, { license: { status: lic.status, message: lic.message } })
  }
  const running = activeJobs().find((j) => j.kind === 'setup')
  const job: Job = running || {
    id: newJobId('setup'), kind: 'setup', createdAt: Date.now(), updatedAt: Date.now(), status: 'queued', step: 'license',
    message: 'Đang khởi động cài đặt…', input: NO_INPUT
  }
  if (!running) {
    saveJob(job)
    const pid = spawnJob(job.id, '__run-setup')
    if (!pid) {
      saveJob({ ...job, status: 'error', finishedAt: Date.now(), error: { step: 'license', message: 'Không khởi động được tiến trình cài đặt.' } })
      return fail(a, 'Không khởi động được tiến trình cài đặt.', EXIT.error)
    }
    job.pid = pid
    saveJob(job)
  }
  const license = { status: lic.status, message: lic.message }
  if (json(a)) outJson({ ok: true, id: job.id, status: job.status, step: job.step, message: job.message, license, next: `agent-edit wait ${job.id} --until-change` })
  else {
    out(`Bản quyền: ${licenseLine(lic)}`)
    out(`${running ? 'Đang có lượt cài chạy' : 'Bắt đầu cài'}: ${job.id}`)
    out(`Theo dõi: agent-edit wait ${job.id} --until-change`)
  }
  return EXIT.running
}

// ---------------------------------------------------------------------------
// Dang nhap AI (cung luong voi nut "Dang nhap" o Cai dat API) + cau hinh khoa API
// ---------------------------------------------------------------------------
/** In ket qua 1 viec dang nhap nen (--start / --code / --check) + ma thoat: xong 0 · loi 1 · con cho 3 */
function loginOut(a: Args, j: Job, extra: Record<string, unknown> = {}): number {
  const v = loginView(j)
  if (json(a)) outJson({ ok: j.status === 'done', ...v, ...extra })
  else {
    out(v.message || v.status)
    if (v.url) out('Link đăng nhập: ' + v.url)
    if (j.status === 'error' && j.error?.hint) out('Gợi ý: ' + j.error.hint)
  }
  return j.status === 'done' ? EXIT.ok : j.status === 'error' || j.status === 'cancelled' ? EXIT.error : EXIT.running
}

async function cmdLogin(a: Args): Promise<number> {
  const raw = (a.pos[0] || '').toLowerCase()
  const id = accountOf(raw)
  if (!id) return fail(a, 'Chọn tài khoản: agent-edit login gemini | claude | codex')
  const label = CLI_PACKAGES[id].label
  const name = accountArg(id)

  // ---- gui ma nguoi dung dan trong chat cho luot dang nhap dang cho ----
  const code = opt(a, 'code')
  if (code !== undefined) {
    const t = code.trim()
    if (!t || t.length > 4096 || /[\r\n]/.test(t)) return fail(a, 'Mã không hợp lệ.')
    const j = (opt(a, 'id') ? loadJob(opt(a, 'id') as string) : null) || activeLogin(id)
    if (!j || j.kind !== 'login' || TERMINAL.includes(j.status)) {
      return fail(a, `Không có lượt đăng nhập ${label} nào đang chờ mã.`, EXIT.usage, { hint: `agent-edit login ${name} --start` })
    }
    writeFileSync(codeFile(j.id), t, { mode: 0o600 })
    const after = (await waitJobUntil(j.id, 90000, () => false)) || j
    return loginOut(a, after)
  }

  // ---- hoi trang thai: da dang nhap chua / luot nen dang o dau ----
  if (a.flags.has('check')) {
    const j = activeLogin(id)
    if (j) return loginOut(a, j)
    const st = await cliStatusOf(id, true)
    if (st?.logged_in) {
      if (json(a)) outJson({ ok: true, account: name, status: 'done', loggedIn: true, message: `${label}: đã đăng nhập.` })
      else out(`${label}: đã đăng nhập.`)
      return EXIT.ok
    }
    const last = listJobs().find((x) => x.kind === 'login' && x.info?.account === id)
    if (json(a)) {
      outJson({ ok: false, account: name, status: 'none', loggedIn: false, message: `${label}: chưa đăng nhập.`,
        lastError: last?.status === 'error' ? last.error : null, next: `agent-edit login ${name} --start` })
    } else out(`${label}: chưa đăng nhập. Chạy: agent-edit login ${name} --start`)
    return EXIT.usage
  }

  // ---- --start: luot dang nhap chay nen, tra link ngay ----
  if (a.flags.has('start')) {
    const cur = activeLogin(id)
    if (cur) return loginOut(a, cur, { reused: true })
  }
  let st = await cliStatusOf(id)
  if (!st?.installed || !st?.path) {
    // chua cai CLI -> Doctor tu cai (giong nut "Cai" trong Cai dat API)
    if (!json(a)) out(`Chưa cài ${label} — tự cài...`)
    const fixId = id === 'gemini' ? 'agy' : id === 'claude' ? 'claude' : 'codex'
    const r = await fixCheck(fixId, (line) => !json(a) && out('  ' + line))
    if (!r.ok && !json(a)) out('  ' + (r.error || ''))
    st = await cliStatusOf(id, true)
    if (!st?.installed || !st?.path) return fail(a, `Chưa cài được ${label}. Chạy: agent-edit doctor --fix`, EXIT.error)
  }
  if (st.logged_in) {
    if (json(a)) outJson({ ok: true, already: true, account: id, status: 'done', message: `${label}: đã đăng nhập.` })
    else out(`${label}: đã đăng nhập.`)
    return EXIT.ok
  }
  if (a.flags.has('start')) {
    const job: Job = {
      id: newJobId('login'), kind: 'login', createdAt: Date.now(), updatedAt: Date.now(), status: 'queued', step: 'login',
      message: `Đang mở đăng nhập ${label}…`, input: NO_INPUT,
      info: { account: id, bin: st.path, workdir: st.workdir || '', device: a.flags.has('device') }
    }
    saveJob(job)
    const pid = spawnJob(job.id, '__run-login')
    if (!pid) {
      // khong de viec "queued" khong tien trinh -> --start lan sau tuong con luot dang cho
      saveJob({ ...job, status: 'error', finishedAt: Date.now(), error: { step: 'login', message: 'Không khởi động được tiến trình đăng nhập.' } })
      return fail(a, 'Không khởi động được tiến trình đăng nhập.', EXIT.error)
    }
    job.pid = pid
    saveJob(job)
    // doi CLI in link / mo cua so (Windows agy) — toi da 40 giay
    const j = (await waitJobUntil(job.id, 40000, (x) => !!x.info?.url || x.sub === 'window')) || job
    return loginOut(a, j)
  }
  if (!json(a)) out(`Đăng nhập ${label}: trình duyệt sẽ mở trên máy này — đăng nhập rồi quay lại. (Nếu trang hiện mã, dán mã vào đây rồi Enter.)`)
  // ma xac thuc nguoi dung dan vao (chi khi chay tay trong Terminal)
  if (process.stdin.isTTY) {
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (d) => {
      const t = String(d).trim()
      if (t) sendCliInput(t)
    })
  }
  const send = (line: string) => !json(a) && out('  ' + line)
  const res =
    id === 'gemini'
      ? await startAgyLogin(st.path, st.workdir, send)
      : id === 'claude'
        ? await startClaudeLogin(st.path, send)
        : await startCodexLogin(st.path, a.flags.has('device') ? 'device' : 'browser', send)
  if (process.stdin.isTTY) process.stdin.pause()
  const now = await cliStatusOf(id, true)
  if (now?.logged_in) {
    if (json(a)) outJson({ ok: true, account: id })
    else out(`${label}: đăng nhập xong.`)
    return EXIT.ok
  }
  let err = res.ok ? now?.detail || `${label} chưa ghi nhận đăng nhập.` : res.error || 'Đăng nhập không thành công.'
  if (id === 'gemini') err = agyFailureText(err, now?.version || st.version, 'login')
  return fail(a, err, EXIT.error, { hint: `Có thể đăng nhập trong app Agent Edit (Cài đặt API) hoặc chạy lại: agent-edit login ${raw}` })
}

async function cmdConfig(a: Args): Promise<number> {
  const patch: ProvidersMap = {}
  const set = (name: string, key?: string, mode?: string) => {
    if (key === undefined && mode === undefined) return
    const cur = patch[name] || ({} as ProvidersMap[string])
    if (key !== undefined) {
      cur.api_key = key.trim()
      if (mode === undefined) cur.auth_mode = key.trim() ? 'api_key' : 'subscription'
    }
    if (mode !== undefined) {
      if (mode !== 'api_key' && mode !== 'subscription') throw new Error(`chế độ "${mode}" không hợp lệ (subscription | api_key)`)
      cur.auth_mode = mode
    }
    patch[name] = cur
  }
  try {
    set('gemini', opt(a, 'gemini-key'), opt(a, 'gemini-mode'))
    set('claude', opt(a, 'claude-key'), opt(a, 'claude-mode'))
    set('gpt', opt(a, 'openai-key') ?? opt(a, 'gpt-key'), opt(a, 'openai-mode') ?? opt(a, 'gpt-mode') ?? opt(a, 'codex-mode'))
  } catch (e) {
    return fail(a, String((e as Error).message || e))
  }
  if (Object.keys(patch).length) saveProviders(patch)
  const m = maskedProviders()
  const view = Object.fromEntries(
    Object.entries(m).map(([k, v]) => [k === 'gpt' ? 'openai' : k, { mode: v.auth_mode, key: v.has_key ? v.key_hint : '' }])
  )
  if (json(a)) outJson({ ok: true, changed: Object.keys(patch), providers: view })
  else {
    if (Object.keys(patch).length) out('Đã lưu (mã hoá trong Keychain của app).')
    for (const [k, v] of Object.entries(view)) out(`  ${k}: ${v.mode === 'subscription' ? 'tài khoản (CLI chính chủ)' : 'API key'}${v.key ? ' · key ' + v.key : ''}`)
  }
  return EXIT.ok
}

async function cmdSync(a: Args): Promise<number> {
  const lic = await checkLicense('open')
  if (lic.status !== 'ok') return fail(a, 'Bản quyền: ' + licenseLine(lic), EXIT.usage, { hint: 'agent-edit activate <KEY>' })
  const s = await startSidecar()
  if (!s.ok) return fail(a, 'Không khởi động được bộ xử lý: ' + s.error, EXIT.error)
  const r = await syncLibrary((l) => !json(a) && out('  ' + l), true)
  if (json(a)) outJson({ ok: r?.ok !== false, result: r })
  else out(r?.ok === false ? 'Đồng bộ kho lỗi: ' + String(r.error || '') : 'Đồng bộ kho xong.')
  return r?.ok === false ? EXIT.error : EXIT.ok
}

// ---------------------------------------------------------------------------
// Tao video
// ---------------------------------------------------------------------------
function buildInput(a: Args): { input?: Job['input']; error?: string } {
  const videos = [...optAll(a, 'video'), ...a.pos].map(absFile)
  if (!videos.length) return { error: 'Thiếu video nguồn: --video <đường dẫn file>' }
  for (const v of videos) {
    if (!existsSync(v) || !statSync(v).isFile()) return { error: `Không thấy file video: ${v}` }
    if (!VIDEO_EXT.test(v)) return { error: `Không phải file video (.mp4 .mov .m4v .avi .mkv .webm): ${v}` }
  }
  const refRaw = opt(a, 'reference') || opt(a, 'ref')
  const reference = refRaw ? absFile(refRaw) : null
  if (reference && (!existsSync(reference) || !VIDEO_EXT.test(reference))) return { error: `Không thấy video mẫu: ${reference}` }
  const ins = optAll(a, 'insert').map(absFile)
  const notes = optAll(a, 'insert-note')
  const uses = optAll(a, 'insert-use')
  const places = optAll(a, 'insert-placement')
  const inserts: JobInsert[] = []
  for (let i = 0; i < ins.length; i++) {
    const p = ins[i]
    if (!existsSync(p) || !MEDIA_EXT.test(p)) return { error: `Không thấy tư liệu ảnh / video: ${p}` }
    const use = (uses[i] || 'show') as JobInsert['use']
    const placement = (places[i] || 'auto') as JobInsert['placement']
    if (!['show', 'ai_ref', 'both'].includes(use)) return { error: `--insert-use "${use}" không hợp lệ (show | ai_ref | both)` }
    if (!['auto', 'overlay', 'cutout', 'split', 'fullscreen'].includes(placement)) {
      return { error: `--insert-placement "${placement}" không hợp lệ (auto | overlay | cutout | split | fullscreen)` }
    }
    inserts.push({ path: p, use, placement, note: (notes[i] || '').trim().slice(0, 500) })
  }
  const ori = (opt(a, 'orientation') || '').toLowerCase()
  const orientation = a.flags.has('landscape') || ['landscape', 'ngang', '16:9', 'horizontal'].includes(ori) ? 'landscape' : 'portrait'
  const trim = (v?: string) => (v || '').trim()
  const editRequest = {
    purpose: trim(opt(a, 'request') || opt(a, 'purpose')),
    style: trim(opt(a, 'style')),
    audience: trim(opt(a, 'audience')),
    duration: trim(opt(a, 'duration'))
  }
  const brandGuide = {
    typography: trim(opt(a, 'brand-typography')),
    colors: trim(opt(a, 'brand-colors')),
    fonts: optAll(a, 'brand-font').map((x) => x.trim()).filter(Boolean).slice(0, 3)
  }
  const outDir = opt(a, 'out') ? absFile(opt(a, 'out') as string) : null
  const clean = <T extends Record<string, unknown>>(o: T): T | undefined => {
    const e = Object.fromEntries(Object.entries(o).filter(([, v]) => (Array.isArray(v) ? v.length : !!v)))
    return Object.keys(e).length ? (e as T) : undefined
  }
  return {
    input: {
      videos,
      reference,
      inserts,
      editRequest: clean(editRequest),
      brandGuide: clean(brandGuide),
      orientation,
      outDir,
      name: opt(a, 'name') || null,
      fresh: a.flags.has('fresh'),
      newPlan: a.flags.has('new-plan')
    }
  }
}

/** Tach 1 tien trinh app (khong cua so) chay job — ban dong goi: chinh binary app; dev: electron + thu muc app.
 *  cmd: __run-job (tao video) · __run-setup (cai dat) · __run-login (dang nhap). */
function spawnJob(id: string, cmd = '__run-job'): number | undefined {
  const fd = openSync(jobLog(id), 'a')
  // giu nguyen tham so dung TRUOC co CLI (vd --user-data-dir khi tu kiem) -> tien trinh job dung cung du lieu app;
  // ban dev: tham so dau la thu muc app (`electron . ...`) -> doi sang duong dan tuyet doi
  const pre = process.argv.slice(1, process.argv.indexOf(CLI_FLAG)).filter((x) => !/^--agent-edit-update/.test(x))
  if (!app.isPackaged && pre.length && !pre[0].startsWith('-')) pre[0] = app.getAppPath()
  const args = [...pre, CLI_FLAG, cmd, id]
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  // file ket qua cua lenh `make` (script Windows) KHONG phai cua viec nen
  delete env.AGENT_EDIT_OUT_FILE
  delete env.AGENT_EDIT_ERR_FILE
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', fd, fd], env, windowsHide: true })
  child.unref()
  return child.pid
}

function jobView(j: Job) {
  return {
    id: j.id,
    kind: j.kind || 'make',
    status: j.status,
    step: j.step,
    message: j.message,
    waiting: j.waiting || null,
    progress: j.progress,
    result: j.result || null,
    error: j.error || null,
    createdAt: new Date(j.createdAt).toISOString(),
    finishedAt: j.finishedAt ? new Date(j.finishedAt).toISOString() : null,
    log: jobLog(j.id),
    // setup: ready / next (dang nhap con thieu) · login: link, dong cuoi CLI — KHONG dua duong dan CLI / thu muc ra
    ...(j.kind === 'setup' ? { info: j.info || null } : j.kind === 'login' ? { info: loginView(j) } : {})
  }
}

function printJobFinal(j: Job) {
  if (j.status === 'done' && j.result) {
    const r = j.result
    out(`XONG: ${r.copy || r.output}`)
    out(`  ${r.width || '?'}x${r.height || '?'} · ${r.duration ? Math.round(r.duration) + 's' : '?'} · ${(r.size / 1048576).toFixed(1)} MB · chủ đề: ${r.topic || ''}`)
    if (r.copy) out(`  (bản trong thư mục dự án: ${r.output})`)
    for (const w of r.warnings) out('  ! ' + w)
  } else if (j.status === 'error') {
    out(`LỖI (${j.error?.step}): ${j.error?.message}`)
    if (j.error?.hint) out(`  Gợi ý: ${j.error.hint}`)
  } else if (j.status === 'cancelled') out('ĐÃ HUỶ.')
  else out(`${j.status.toUpperCase()}: ${j.message || ''}${j.progress ? ` (${Math.round(j.progress * 100)}%)` : ''}`)
}

const exitOf = (j: Job) => (j.status === 'done' ? EXIT.ok : j.status === 'error' ? EXIT.error : j.status === 'cancelled' ? EXIT.cancelled : EXIT.running)

/** untilChange: tra ve ngay khi viec sang moc moi (jobMilestone) — AI agent goi lap lai de bao tien do tung buoc. */
async function waitJob(a: Args, id: string, timeoutS: number, untilChange = false): Promise<number> {
  const t0 = Date.now()
  let last = ''
  let base: string | null = null
  for (;;) {
    const j = loadJob(id)
    if (!j) return fail(a, `Không có việc ${id}`)
    const line = j.message || j.status
    // tien do render: chi in moi moc 10% (khong in tung 1%)
    const key = line.replace(/(\d+)%/, (_m, p) => `${Math.floor(Number(p) / 10) * 10}%`)
    if (!json(a) && key !== last) {
      out(`[${new Date().toLocaleTimeString('vi-VN')}] ${line}`)
      last = key
    }
    const mark = jobMilestone(j)
    base ??= mark
    const changed = mark !== base
    if (TERMINAL.includes(j.status) || (untilChange && changed) || (timeoutS > 0 && Date.now() - t0 > timeoutS * 1000)) {
      if (json(a)) outJson({ ok: j.status === 'done', ...(untilChange ? { changed } : {}), ...jobView(j) })
      else {
        printJobFinal(j)
        if (!TERMINAL.includes(j.status)) out(`  Việc vẫn đang chạy — chờ tiếp: agent-edit wait ${id}`)
      }
      return exitOf(j)
    }
    await sleep(1500)
  }
}

async function cmdMake(a: Args): Promise<number> {
  const { input, error } = buildInput(a)
  if (!input) return fail(a, error || 'Tham số không hợp lệ')
  const id = newJobId()
  const job: Job = { id, createdAt: Date.now(), updatedAt: Date.now(), status: 'queued', step: 'prepare', message: 'Đang khởi động…', input }
  saveJob(job)
  const pid = spawnJob(id)
  if (!pid) {
    job.status = 'error'
    job.error = { step: 'prepare', message: 'Không khởi động được tiến trình xử lý.' }
    saveJob(job)
    return fail(a, job.error.message, EXIT.error)
  }
  job.pid = pid
  saveJob(job)
  if (a.flags.has('wait')) {
    if (!json(a)) out(`Mã việc: ${id} (đang chạy — Ctrl+C chỉ dừng theo dõi, huỷ việc: agent-edit cancel ${id})`)
    return waitJob(a, id, 0)
  }
  if (json(a)) outJson({ ok: true, id, status: 'queued', next: `agent-edit wait ${id}` })
  else {
    out(`Đã nhận việc tạo video: ${id}`)
    out(`  ${input.videos.length} video nguồn${input.reference ? ' + video mẫu' : ''}${input.inserts.length ? ` + ${input.inserts.length} tư liệu` : ''} · ${input.orientation === 'landscape' ? 'ngang 16:9' : 'dọc 9:16'}`)
    out(`Theo dõi: agent-edit wait ${id}   (mỗi lần chờ tối đa ${DEFAULT_WAIT_S}s; video thường mất 10–40 phút)`)
  }
  return EXIT.ok
}

async function cmdWait(a: Args): Promise<number> {
  const id = a.pos[0]
  if (!id) return fail(a, 'Thiếu mã việc: agent-edit wait <mã>')
  const t = opt(a, 'timeout')
  const timeout = t === undefined ? DEFAULT_WAIT_S : Math.max(0, Number(t) || 0)
  return waitJob(a, id, timeout, a.flags.has('until-change'))
}

function cmdJob(a: Args): number {
  const id = a.pos[0]
  if (!id) return fail(a, 'Thiếu mã việc: agent-edit job <mã>')
  const j = loadJob(id)
  if (!j) return fail(a, `Không có việc ${id}`)
  if (json(a)) outJson({ ok: true, ...jobView(j) })
  else {
    out(`${j.id} · tạo lúc ${new Date(j.createdAt).toLocaleString('vi-VN')}`)
    printJobFinal(j)
    out(`  Nhật ký: ${jobLog(j.id)}`)
  }
  return exitOf(j)
}

function cmdJobs(a: Args): number {
  const all = listJobs()
  const rows = a.flags.has('all') ? all : all.slice(0, 15)
  if (json(a)) outJson({ ok: true, jobs: rows.map(jobView) })
  else if (!rows.length) out('Chưa có việc nào.')
  else
    for (const j of rows) {
      const what = j.status === 'done' ? j.result?.copy || j.result?.output : j.status === 'error' ? j.error?.message?.slice(0, 120) : j.message
      out(`${j.id}  ${j.status.padEnd(9)} ${new Date(j.createdAt).toLocaleString('vi-VN')}  ${what || ''}`)
    }
  return EXIT.ok
}

async function cmdCancel(a: Args): Promise<number> {
  const id = a.pos[0]
  const j = id ? loadJob(id) : null
  if (!j) return fail(a, `Không có việc ${id || ''}`)
  if (!j.pid || !pidAlive(j.pid) || (TERMINAL.includes(j.status) && !j.tail)) {
    if (json(a)) outJson({ ok: true, status: j.status, note: 'việc không còn chạy' })
    else out(`Việc ${id} không còn chạy (${j.status}).`)
    return EXIT.ok
  }
  writeFileSync(cancelFile(j.id), String(Date.now()))
  const settled = async (ms: number) => {
    for (let t = 0; t < ms; t += 500) {
      await sleep(500)
      const now = loadJob(j.id)
      if (!now || !pidAlive(j.pid) || (TERMINAL.includes(now.status) && !now.tail)) return true
    }
    return false
  }
  // 1) yeu cau huy qua file (tien trinh tu dung sidecar / render, ghi "da huy"); 2) khong phan hoi -> SIGTERM; 3) SIGKILL
  if (!(await settled(20000))) {
    const pid = j.pid
    if (process.platform === 'win32') {
      // Windows: khong co SIGTERM that -> dung CA CAY (sidecar python, ffmpeg, chrome con chau) bang taskkill /T /F
      killTree(pid)
      await settled(10000)
    } else {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* da thoat */
      }
      if (!(await settled(10000))) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          /* da thoat */
        }
        await sleep(500)
      }
    }
  }
  const after = loadJob(j.id)
  if (after && !TERMINAL.includes(after.status)) {
    after.status = 'cancelled'
    after.message = 'Đã huỷ.'
    after.finishedAt = Date.now()
    saveJob(after)
  } else if (after && after.status === 'error' && !pidAlive(j.pid) && !TERMINAL.includes(j.status)) {
    after.status = 'cancelled'
    after.message = 'Đã huỷ.'
    delete after.error
    saveJob(after)
  }
  if (json(a)) outJson({ ok: true, status: after?.status })
  else out(`Đã gửi lệnh huỷ. Trạng thái: ${after?.status}`)
  return EXIT.ok
}

// ---------------------------------------------------------------------------
// Tu cap nhat (may chi dung CLI van len ban moi) — cung luong voi nut "Cap nhat" tren app
// ---------------------------------------------------------------------------
/** Tien trinh giao dien Agent Edit dang mo (cung binary, khong co co CLI). */
function guiRunning(): boolean {
  if (process.platform === 'win32') {
    try {
      // dong lenh tung tien trinh cung exe (PowerShell CIM) — tien trinh phu cua Electron co --type=, viec CLI co co CLI
      const exe = process.execPath.replace(/'/g, "''")
      const ps = `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${exe}' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { $_.CommandLine }`
      const outp = execFileSync(powershell(), ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf-8', windowsHide: true, timeout: 30000 })
      return outp.split(/\r?\n/).some((l) => l.trim() && !l.includes(CLI_FLAG) && !l.includes('--type='))
    } catch {
      return false
    }
  }
  try {
    const exe = process.execPath
    const ps = execFileSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf-8' })
    return ps.split('\n').some((l) => {
      const m = /^\s*(\d+)\s+(.*)$/.exec(l)
      return !!m && Number(m[1]) !== process.pid && m[2].startsWith(exe) && !m[2].includes(CLI_FLAG) && !m[2].includes('--type=')
    })
  } catch {
    return false
  }
}

async function cmdUpdate(a: Args): Promise<number> {
  initUpdater()
  if (!updaterEnabled()) return fail(a, 'Bản này không tự cập nhật (bản phát triển / bản đầy đủ / chưa đóng gói).', EXIT.usage)
  if (guiRunning()) {
    return fail(a, 'App Agent Edit đang mở — đóng app (hoặc cập nhật ngay trong app) rồi chạy lại.', EXIT.usage)
  }
  const busy = activeJobs()
  if (busy.length) return fail(a, `Đang có ${busy.length} việc chạy (${busy.map((j) => j.id).join(', ')}) — đợi xong rồi cập nhật.`, EXIT.usage)
  const say = (m: string) => !json(a) && out(m)
  say(`Bản đang dùng: ${app.getVersion()}${APP_BUILD ? ' (' + APP_BUILD + ')' : ''} — kiểm tra bản mới...`)
  let st = await checkForUpdateNow()
  let lastPct = -10
  const t0 = Date.now()
  while (['available', 'downloading'].includes(st.phase) && Date.now() - t0 < 60 * 60 * 1000) {
    const p = st.progress
    const pct = p?.total ? Math.floor((p.received / p.total) * 100) : 0
    if (pct >= lastPct + 10) {
      lastPct = pct
      say(`  Đang tải bản ${st.offer?.version}: ${pct}%`)
    }
    await sleep(1000)
    st = updateState()
  }
  if (st.phase !== 'ready') {
    if (st.phase === 'idle' && !st.offer) {
      if (json(a)) outJson({ ok: true, updated: false, version: app.getVersion(), build: APP_BUILD })
      else out(st.message ? `Chưa kiểm tra được: ${st.message}` : 'Đang ở bản mới nhất.')
      return st.message ? EXIT.error : EXIT.ok
    }
    return fail(a, st.message || `Chưa tải được bản cập nhật (${st.phase}).`, EXIT.error)
  }
  say(`Đã tải bản ${st.offer?.version} (${st.offer?.build}). Đang thay app — đợi khoảng 30 giây rồi chạy: agent-edit version`)
  const r = await applyUpdate(false, [CLI_FLAG, '__updated'])
  if (!r.ok) return fail(a, r.error || 'Không áp dụng được bản cập nhật.', EXIT.error)
  if (json(a)) outJson({ ok: true, updated: true, to: st.offer?.version, build: st.offer?.build, note: 'đợi ~30 giây rồi chạy agent-edit version' })
  // applyUpdate tu thoat app (script thay app chay sau khi tien trinh nay thoat)
  await sleep(20000)
  return EXIT.ok
}

// ---------------------------------------------------------------------------
// Diem vao
// ---------------------------------------------------------------------------
export async function runCli(argv: string[]): Promise<number> {
  const a = parseArgs(argv)
  try {
    switch (a.cmd) {
      case 'help':
      case '--help':
        out(HELP)
        return EXIT.ok
      case 'version':
      case '--version':
        if (json(a)) outJson({ version: app.getVersion(), build: APP_BUILD, arch: process.arch, platform: process.platform })
        else out(`Agent Edit ${app.getVersion()}${APP_BUILD ? ' (build ' + APP_BUILD + ')' : ''} ${process.platform}-${process.arch}`)
        return EXIT.ok
      case 'status':
        return await cmdStatus(a)
      case 'doctor':
        return await cmdDoctor(a)
      case 'setup':
      case 'install':
        return await cmdSetup(a)
      case 'activate': {
        if (!a.pos[0]) return fail(a, 'Thiếu key: agent-edit activate <KEY>')
        const st = await cmdActivate(a)
        if (json(a)) outJson({ ok: st.status === 'ok', status: st.status, message: st.message, plan: st.plan, expiresAt: st.expiresAt })
        else out(`Bản quyền: ${licenseLine(st)}`)
        return st.status === 'ok' ? EXIT.ok : EXIT.error
      }
      case 'license': {
        const st = await checkLicense('open')
        if (json(a)) outJson({ ok: st.status === 'ok', ...st })
        else out(`Bản quyền: ${licenseLine(st)}`)
        return st.status === 'ok' ? EXIT.ok : EXIT.usage
      }
      case 'login':
        return await cmdLogin(a)
      case 'config':
        return await cmdConfig(a)
      case 'sync':
        return await cmdSync(a)
      case 'update':
        return await cmdUpdate(a)
      case 'make':
      case 'create':
        return await cmdMake(a)
      case 'wait':
        return await cmdWait(a)
      case 'job':
      case 'show':
        return cmdJob(a)
      case 'jobs':
      case 'list':
        return cmdJobs(a)
      case 'cancel':
        return await cmdCancel(a)
      case '__run-job':
        return await runJob(a.pos[0] || '')
      case '__run-setup':
        return await runSetup(a.pos[0] || '')
      case '__run-login':
        return await runLoginJob(a.pos[0] || '')
      case '__updated':
        // ban moi vua duoc script cap nhat mo lai (main.ts da ghi dau khoi dong) -> ghi nhan ket qua roi thoat
        initUpdater()
        return EXIT.ok
      default:
        return fail(a, `Không có lệnh "${a.cmd}". Xem: agent-edit help`)
    }
  } catch (e) {
    return fail(a, String((e as Error)?.message || e), EXIT.error)
  } finally {
    if (!a.cmd.startsWith('__run-')) stopSidecar()
  }
}
