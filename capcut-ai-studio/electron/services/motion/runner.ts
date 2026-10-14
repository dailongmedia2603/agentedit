// CHAY SKILL motionmaxxing bang Claude Code CLI — "Tao video" + "Automation Video" (2026-10-14).
//
// 1 video = 1 thu muc ~/.capcut-studio/motion/jobs/<id>/ (brief.md, inputs/, film/, .claude/skills/motionmaxxing ->
// skill cua app) + 1 lan `claude -p` KHONG CAN NGUOI (prompt.ts): Claude tu chon y tuong, dung, render, tu cham
// (look.py / lint.mjs), sua, xuat film/final.mp4. App doc luong stream-json -> buoc dang lam (stages.ts) + nhat ky.
// Hang doi rieng (khong dung chung hang doi cua Edit Video): so video chay cung luc = state.json motion_jobs (mac dinh 1).
import { spawn, execFileSync, type ChildProcess } from 'child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { randomBytes } from 'crypto'
import { cmdQuote, killTree, needsShell, IS_WIN } from '../env'
import { readState, writeState, motionJobsOf, MOTION_JOB_MAX } from '../state'
import { ENGINE_HOME, TOOLS_BIN } from '../paths'
import { sidecarRequest } from '../sidecar'
import { bundledSkillDir, MOTION_HOME, MOTION_JOBS_DIR } from './paths'
import { installSkill, linkSkill } from './skill'
import { briefMarkdown, briefTitle, runPrompt, validateBrief } from './prompt'
import { prepareSound, type SoundSummary } from './sound'
import { parseStreamLine, stageLabel } from './stages'
import { allJobs, getJob, patchJob, putJob, recoverOnStart, removeJob } from './store'
import { claudeRun, ensureChrome, ensureShims, skillEnv } from './tools'
import { getSaydiKey } from './saydi'
import { assertLicensed, licenseDisabled, licenseState, onLicenseChange, requireLicense } from '../license'
import type { MotionBrief, MotionJob } from './types'

/** Tran thoi gian 1 video (Claude dung + render + sua) */
const MAX_RUN_MS = 2.5 * 3600 * 1000
const LOG_TAIL = 400

type Listener = (job: MotionJob) => void
const listeners = new Set<Listener>()
export function onMotionJob(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const removedListeners = new Set<(id: string) => void>()
/** Video bi xoa (UI bo khoi danh sach). */
export function onMotionRemoved(fn: (id: string) => void): () => void {
  removedListeners.add(fn)
  return () => removedListeners.delete(fn)
}
function emit(job: MotionJob | undefined): void {
  if (!job) return
  for (const fn of listeners) {
    try {
      fn(job)
    } catch {
      /* bo qua */
    }
  }
}

interface Running {
  proc: ChildProcess | null
  cancelled: boolean
  /** ly do dung: nguoi dung huy / qua gio */
  reason?: 'user' | 'timeout'
}
const running = new Map<string, Running>()
const queue: string[] = []
let started = false
/** App dang thoat: khong chay them video, khong ghi de trang thai "gian doan" */
let stopping = false

/** Ban quyen dang hop le (lan kiem gan nhat) — khong hoi may chu. */
const licenseOk = () => licenseDisabled() || licenseState().status === 'ok'

export function motionLimit(): number {
  return motionJobsOf(readState())
}

export function setMotionLimit(n: number): number {
  const v = Math.min(MOTION_JOB_MAX, Math.max(1, Math.round(Number(n)) || 1))
  writeState({ motion_jobs: v })
  pump()
  return v
}

/** Mo app: job dang chay lan truoc -> gian doan; job dang cho -> xep hang lai. recover=false (tu kiem STUDIO_MOTION_TEST):
 *  khong dong vao video cua lan chay khac (app that co the dang mo cung HOME). */
export function startMotion(opts: { recover?: boolean } = {}): void {
  if (started) return
  started = true
  if (opts.recover !== false) {
    const { queued } = recoverOnStart()
    for (const id of queued) if (!queue.includes(id)) queue.push(id)
  }
  // video dang cho tu lan truoc chi chay khi ban quyen da kiem xong + hop le (kiem luc mo app)
  onLicenseChange(() => pump())
  pump()
}

/** Thoat app: dung moi tien trinh Claude (job -> gian doan, mo lai app bam "Chay lai"). */
export function stopAllMotion(): void {
  stopping = true
  for (const [id, r] of running) {
    r.cancelled = true
    patchJob(id, { status: 'interrupted', error: 'App đã tắt khi video đang tạo — bấm “Chạy lại”.', finishedAt: Date.now() })
    killTree(r.proc?.pid, () => r.proc?.kill())
  }
  running.clear()
}

export function busyMotionIds(): string[] {
  return [...running.keys(), ...queue]
}

function newId(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `mv-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${randomBytes(2).toString('hex')}`
}

function safeName(name: string, taken: Set<string>): string {
  const ext = extname(name).toLowerCase()
  let base = basename(name, extname(name))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file'
  let n = `${base}${ext}`
  let i = 2
  while (taken.has(n.toLowerCase())) n = `${base}-${i++}${ext}`
  taken.add(n.toLowerCase())
  return n
}

/** Tao 1 video moi (chua chay): chep tu lieu vao inputs/, ghi brief, xep hang. */
export async function createMotionJob(
  brief: MotionBrief,
  opts: { kind?: 'single' | 'auto'; automationId?: string; prepare?: (dir: string) => Promise<void> } = {}
): Promise<MotionJob> {
  const err = validateBrief(brief)
  if (err) throw new Error(err)
  // Ban quyen (luat 13g): bam "Tao video" = hoi may chu (nhu "Phan tich video" cua Edit Video); video Automation tu tao
  // KHONG hoi may chu dinh ky — chi can lan kiem gan nhat (mo app / lan bam gan nhat) con hop le.
  if (opts.kind === 'auto') assertLicensed()
  else await requireLicense()
  const id = newId()
  const dir = join(MOTION_JOBS_DIR, id)
  mkdirSync(join(dir, 'inputs'), { recursive: true })
  const taken = new Set<string>()
  for (const a of brief.assets || []) {
    if (!a || !existsSync(a) || !statSync(a).isFile()) continue
    copyFileSync(a, join(dir, 'inputs', safeName(basename(a), taken)))
  }
  if (opts.prepare) await opts.prepare(dir)
  const job: MotionJob = {
    id,
    kind: opts.kind || 'single',
    automationId: opts.automationId,
    title: briefTitle(brief),
    brief,
    status: 'queued',
    createdAt: Date.now(),
    dir
  }
  putJob(job)
  queue.push(id)
  emit(job)
  pump()
  return job
}

/** Chay lai video loi / gian doan / da huy (cung thu muc, xoa ket qua cu). */
export function rerunMotionJob(id: string): MotionJob {
  const j = getJob(id)
  if (!j) throw new Error('Không thấy video')
  if (running.has(id) || queue.includes(id)) return j
  assertLicensed()
  const next = patchJob(id, {
    status: 'queued',
    error: undefined,
    stage: undefined,
    stages: undefined,
    output: undefined,
    draftOnly: undefined,
    note: undefined,
    meta: undefined,
    startedAt: undefined,
    finishedAt: undefined,
    costUsd: undefined
  })!
  queue.push(id)
  emit(next)
  pump()
  return next
}

export function cancelMotionJob(id: string): boolean {
  const qi = queue.indexOf(id)
  if (qi >= 0) {
    queue.splice(qi, 1)
    emit(patchJob(id, { status: 'cancelled', error: 'Đã huỷ.', finishedAt: Date.now() }))
    return true
  }
  const r = running.get(id)
  if (!r) return false
  r.cancelled = true
  r.reason = 'user'
  killTree(r.proc?.pid, () => r.proc?.kill())
  return true
}

export function deleteMotionJob(id: string): { ok: boolean; error?: string } {
  if (running.has(id) || queue.includes(id)) return { ok: false, error: 'Video đang tạo — huỷ trước rồi xoá.' }
  const j = getJob(id)
  if (!j) return { ok: true }
  try {
    if (j.dir.startsWith(MOTION_JOBS_DIR)) rmSync(j.dir, { recursive: true, force: true })
  } catch (e) {
    return { ok: false, error: 'Không xoá được thư mục: ' + String((e as Error)?.message || e) }
  }
  removeJob(id)
  for (const fn of removedListeners) {
    try {
      fn(id)
    } catch {
      /* bo qua */
    }
  }
  return { ok: true }
}

/** Nhat ky de doc (progress.log) tu dong `from`. */
export function motionLog(id: string, from = 0): { lines: string[]; next: number } {
  const j = getJob(id)
  if (!j) return { lines: [], next: 0 }
  const p = join(j.dir, 'progress.log')
  if (!existsSync(p)) return { lines: [], next: 0 }
  const all = readFileSync(p, 'utf-8').split('\n').filter(Boolean)
  return { lines: all.slice(Math.max(0, from)).slice(-LOG_TAIL), next: all.length }
}

function pump(): void {
  if (stopping || !licenseOk()) return
  while (running.size < motionLimit() && queue.length) {
    const id = queue.shift()!
    const j = getJob(id)
    if (!j || j.status !== 'queued') continue
    const r: Running = { proc: null, cancelled: false }
    running.set(id, r)
    runJob(j, r)
      .catch((e) => {
        if (stopping) return
        emit(
          r.cancelled
            ? patchJob(id, { status: 'cancelled', error: 'Đã huỷ.', finishedAt: Date.now() })
            : patchJob(id, { status: 'error', error: String((e as Error)?.message || e), finishedAt: Date.now() })
        )
      })
      .finally(() => {
        running.delete(id)
        pump()
      })
  }
}

let skillCache: { dir: string; version: string } | null = null
function skill(): { dir: string; version: string } {
  if (!skillCache) {
    // Xoa ban skill cu chi o lan cai DAU trong phien (chua co job nao chay voi ban cu)
    const r = installSkill(bundledSkillDir(), MOTION_HOME, { cleanup: running.size <= 1 })
    skillCache = { dir: r.dir, version: r.version }
  }
  return skillCache
}

/** Doi loi Claude / CLI sang loi tieng Viet de hieu. */
export function friendlyError(raw: string): string {
  const s = raw || ''
  if (/not logged in|please run \/login|invalid api key|authentication|unauthori[sz]ed|oauth/i.test(s))
    return 'Claude chưa đăng nhập hoặc key không hợp lệ — vào “Cài đặt API” > Claude để đăng nhập / kiểm tra.'
  if (/usage limit|rate.?limit|limit reached|429|quota|overloaded|credit balance/i.test(s))
    return 'Hết hạn mức Claude (hoặc Claude đang quá tải) — đợi hết khung giờ rồi bấm “Chạy lại”.'
  if (/does not support this model|model.*not (found|available)|invalid model/i.test(s))
    return 'Model Claude đang chọn không dùng được — vào “Cài đặt API” > Claude đổi model hoặc cập nhật Claude Code.'
  return s.slice(0, 600) || 'Claude dừng mà không báo lỗi.'
}

function probe(file: string): MotionJob['meta'] {
  const ffprobe = join(TOOLS_BIN, IS_WIN ? 'ffprobe.exe' : 'ffprobe')
  const meta: MotionJob['meta'] = { size: statSync(file).size }
  try {
    const out = execFileSync(existsSync(ffprobe) ? ffprobe : 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], {
      encoding: 'utf-8',
      timeout: 20000,
      windowsHide: true
    })
    const j = JSON.parse(out)
    meta.width = j.streams?.[0]?.width
    meta.height = j.streams?.[0]?.height
    meta.seconds = Number(j.format?.duration) || undefined
  } catch {
    /* khong co ffprobe -> chi co dung luong */
  }
  return meta
}

function findOutput(dir: string): { file: string; draft: boolean } | null {
  const film = join(dir, 'film')
  const final = join(film, 'final.mp4')
  if (existsSync(final) && statSync(final).size > 20000) return { file: final, draft: false }
  if (!existsSync(film)) return null
  const mp4 = readdirSync(film)
    .filter((f) => f.toLowerCase().endsWith('.mp4'))
    .map((f) => ({ f: join(film, f), t: statSync(join(film, f)).mtimeMs, s: statSync(join(film, f)).size }))
    .filter((x) => x.s > 20000)
    .sort((a, b) => b.t - a.t)
  if (!mp4.length) return null
  const fin = mp4.find((x) => /final/i.test(basename(x.f)))
  return fin ? { file: fin.f, draft: false } : { file: mp4[0].f, draft: true }
}

async function runJob(job: MotionJob, r: Running): Promise<void> {
  const dir = job.dir
  const logFile = join(dir, 'progress.log')
  const log = (line: string) => {
    const t = new Date().toTimeString().slice(0, 8)
    try {
      appendFileSync(logFile, `[${t}] ${line.replace(/\n/g, ' ')}\n`)
    } catch {
      /* bo qua */
    }
  }
  const seen: string[] = ['prepare']
  emit(patchJob(job.id, { status: 'running', startedAt: Date.now(), stage: 'prepare', stages: seen, error: undefined }))

  mkdirSync(join(dir, 'inputs'), { recursive: true })
  rmSync(join(dir, 'film'), { recursive: true, force: true })
  mkdirSync(join(dir, 'film'), { recursive: true })
  log('Chuẩn bị video: ' + job.title)

  const sk = skill()
  linkSkill(dir, sk.dir)
  log(`Skill motionmaxxing ${sk.version}`)
  const assets = readdirSync(join(dir, 'inputs')).filter((f) => !f.startsWith('.'))
  writeFileSync(join(dir, 'brief.md'), briefMarkdown(job.brief, assets))
  // Am thanh: bo tieng the gioi + SFX kho + nhac nen (sidecar) -> <job>/sound/ (khong co -> video chi co loi doc / cam)
  let sound: SoundSummary | null = null
  try {
    const cat = await sidecarRequest('/sound/catalog', {}, 120000)
    sound = cat?.ok ? prepareSound(dir, cat, join(ENGINE_HOME, 'sfx'), join(ENGINE_HOME, 'music')) : null
    log(sound ? `Âm thanh: ${sound.worlds} bộ tiếng, ${sound.library} SFX trong kho, ${sound.music} bài nhạc nền`
      : 'Không có thư viện âm thanh — video không có SFX / nhạc nền')
  } catch (e) {
    log('Không lấy được thư viện âm thanh: ' + String((e as Error).message || e).slice(0, 200))
  }
  const prompt = runPrompt(job.brief, { sound: !!sound })
  writeFileSync(join(dir, 'prompt.txt'), prompt)
  const mcp = join(dir, '.mcp-empty.json')
  writeFileSync(mcp, '{"mcpServers":{}}')

  const shims = ensureShims()
  log(`Node: ${shims.node} · Python: ${shims.python}`)
  const chrome = await ensureChrome(log)
  log('Trình duyệt dựng: ' + chrome)
  const cl = claudeRun()
  let saydi: { key: string; voice?: string } | undefined
  if (job.brief.voice?.enabled) {
    const key = getSaydiKey()
    if (!key) throw new Error('Video có lời đọc nhưng chưa có API key SaydiVoice — vào “Cài đặt API” > SaydiVoice.')
    saydi = { key, voice: job.brief.voice.voiceId }
  }
  const env = skillEnv(cl.env, chrome, saydi)
  if (r.cancelled) throw new Error('Đã huỷ.')

  // Video Automation doc noi dung tu web (khong tin cay): bo WebFetch / WebSearch. Moi video: cam lenh mang / truyen file
  // qua Bash (deny rule van ap khi bypassPermissions — da thu that CLI 2.1.283).
  const auto = job.kind === 'auto'
  const tools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'TodoWrite', ...(auto ? [] : ['WebFetch', 'WebSearch'])]
  const deny = ['curl', 'wget', 'nc', 'ncat', 'netcat', 'ssh', 'scp', 'sftp', 'rsync', 'ftp', 'telnet'].map((c) => `Bash(${c}:*)`)
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', cl.model,
    // chi nap cau hinh + skill cua THU MUC JOB (khong dung CLAUDE.md / hook / MCP / skill rieng cua nguoi dung)
    '--setting-sources', 'project',
    '--strict-mcp-config', '--mcp-config', mcp,
    '--permission-mode', 'bypassPermissions',
    '--tools', tools.join(','),
    '--disallowedTools', ...deny,
    '--no-session-persistence'
  ]
  if (cl.effort) args.push('--effort', cl.effort)
  patchJob(job.id, { model: cl.model })
  log(`Gọi Claude Code (${cl.mode === 'api_key' ? 'API key' : 'gói đăng ký'}, model ${cl.model}${cl.effort ? ', effort ' + cl.effort : ''})`)

  const raw = join(dir, 'claude.jsonl')
  let result: { ok: boolean; text: string; costUsd?: number } | undefined
  let stderrTail = ''
  const code = await new Promise<number>((resolve) => {
    const shell = needsShell(cl.bin)
    // Windows claude.cmd (qua cmd.exe): quote tung tham so (duong dan co dau cach)
    const proc = spawn(shell ? cmdQuote(cl.bin) : cl.bin, shell ? args.map(cmdQuote) : args, { cwd: dir, env, windowsHide: true, shell })
    r.proc = proc
    const timer = setTimeout(() => {
      log('Quá 2,5 giờ — dừng.')
      r.cancelled = true
      r.reason = 'timeout'
      killTree(proc.pid, () => proc.kill())
    }, MAX_RUN_MS)
    let buf = ''
    // setEncoding: ky tu tieng Viet nam giua 2 khoi du lieu khong bi vo
    proc.stdout?.setEncoding('utf8')
    proc.stderr?.setEncoding('utf8')
    proc.stdout?.on('data', (d: string) => {
      buf += d
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        try {
          appendFileSync(raw, line + '\n')
        } catch {
          /* bo qua */
        }
        const info = parseStreamLine(line)
        for (const l of info.lines) log(l)
        if (info.result) result = info.result
        if (info.stage) {
          const cur = getJob(job.id)
          if (cur && cur.stage !== info.stage) {
            if (!seen.includes(info.stage)) seen.push(info.stage)
            emit(patchJob(job.id, { stage: info.stage, stages: [...seen] }))
          }
        }
      }
    })
    proc.stderr?.on('data', (d: string) => {
      const s = d
      stderrTail = (stderrTail + s).slice(-4000)
      for (const l of s.split('\n')) if (l.trim()) log('stderr: ' + l.trim().slice(0, 300))
    })
    proc.on('error', (e) => {
      stderrTail += String(e?.message || e)
      clearTimeout(timer)
      resolve(-1)
    })
    proc.on('close', (c) => {
      clearTimeout(timer)
      resolve(c ?? -1)
    })
    proc.stdin?.end(prompt)
  })

  const out = findOutput(dir)
  const notePath = join(dir, 'film', 'NOTE.md')
  const note = existsSync(notePath) ? readFileSync(notePath, 'utf-8').slice(0, 12000) : undefined
  const finishedAt = Date.now()
  // app dang thoat: stopAllMotion da ghi "gian doan" — khong ghi de
  if (stopping) return
  if (r.cancelled && r.reason === 'timeout') {
    emit(patchJob(job.id, { status: 'error', error: 'Quá 2,5 giờ mà AI chưa xong — bấm “Chạy lại” (có thể giảm thời lượng video).', finishedAt, note, costUsd: result?.costUsd }))
    return
  }
  if (r.cancelled) {
    emit(patchJob(job.id, { status: 'cancelled', error: 'Đã huỷ.', finishedAt, note, costUsd: result?.costUsd }))
    log('Đã huỷ.')
    return
  }
  if (out && !out.draft) {
    if (!seen.includes('note') && note) seen.push('note')
    emit(
      patchJob(job.id, {
        status: 'done',
        output: out.file,
        draftOnly: false,
        meta: probe(out.file),
        note,
        finishedAt,
        stage: 'done',
        stages: [...seen],
        costUsd: result?.costUsd
      })
    )
    log('Xong: ' + out.file)
    return
  }
  const why = result && !result.ok ? friendlyError(result.text) : code !== 0 ? friendlyError(stderrTail || `Claude thoát với mã ${code}`) : 'Claude kết thúc nhưng chưa xuất được film/final.mp4.'
  emit(
    patchJob(job.id, {
      status: 'error',
      error: out?.draft ? why + ' (Có bản nháp để xem.)' : why,
      output: out?.file,
      draftOnly: !!out?.draft,
      meta: out ? probe(out.file) : undefined,
      note,
      finishedAt,
      costUsd: result?.costUsd
    })
  )
  log('Lỗi: ' + why)
}

export function motionStageLabel(job: MotionJob): string {
  return stageLabel(job.stage)
}

export function listMotionJobs(filter: { kind?: 'single' | 'auto'; automationId?: string } = {}): MotionJob[] {
  return allJobs().filter((j) => (!filter.kind || j.kind === filter.kind) && (!filter.automationId || j.automationId === filter.automationId))
}

export { getJob as getMotionJob }
