// CLI — VIEC TAO VIDEO (job) + LAN CHO LUOT giua nhieu tien trinh.
//
// Moi `agent-edit make` = 1 job = 1 tien trinh app chay nen (khong cua so). Trang thai ghi ra
// ~/.capcut-studio/cli/jobs/<id>/job.json (ghi nguyen tu) -> `agent-edit wait/job` cua tien trinh khac doc.
// Job id = id du an (r_...) = id nhat ky xu ly (~/.capcut-studio/runs/<id>) giong het giao dien.
//
// LAN (giong src/lib/jobQueue.ts cua giao dien): 'gemini' (phan tich video) / 'claude' (lap ke hoach) — gioi han lay
// tu state.json (Cai dat API "Tao nhieu video cung luc"), 'render' LUON 1. Khac giao dien: cac job la tien trinh rieng
// -> khoa bang file ~/.capcut-studio/cli/locks/<lan>-<cho>.lock chua pid (tien trinh chet -> khoa tu het hieu luc).
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { jobLimitsOf, readState } from '../services/state'
import { JOBS_DIR, LOCKS_DIR, pidAlive, readJson, sleep, writeJsonAtomic } from './util'

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'
export type JobStep = 'prepare' | 'import' | 'analyze' | 'plan' | 'render' | 'finish'

export interface JobInsert {
  path: string
  /** show = chen len video · ai_ref = chi lam mau anh AI · both */
  use: 'show' | 'ai_ref' | 'both'
  placement: 'auto' | 'overlay' | 'cutout' | 'split' | 'fullscreen'
  note: string
}

export interface JobInput {
  videos: string[]
  reference?: string | null
  inserts: JobInsert[]
  editRequest?: { purpose?: string; style?: string; audience?: string; duration?: string }
  brandGuide?: { typography?: string; colors?: string; fonts?: string[] }
  orientation: 'portrait' | 'landscape'
  /** thu muc chep them video xong (ngoai thu muc du an) */
  outDir?: string | null
  /** ten file video xong (khong co thi theo chu de video) */
  name?: string | null
  /** phan tich lai video (bo ket qua da luu trong thu vien) — nut "Phan tich lai tu dau" */
  fresh: boolean
  /** lap ke hoach moi (bo ket qua AI da luu cua cac buoc) — nut "Lap plan moi" */
  newPlan?: boolean
}

export interface JobResult {
  output: string
  /** ban chep ra --out */
  copy?: string
  size: number
  seconds: number
  duration?: number
  width?: number
  height?: number
  workDir: string
  topic?: string
  warnings: string[]
}

export interface Job {
  id: string
  createdAt: number
  updatedAt: number
  /** tien trinh dang chay job (chet ma chua xong = loi bat thuong) */
  pid?: number
  status: JobStatus
  step?: JobStep
  /** cau tieng Viet cho nguoi / AI doc: dang lam gi */
  message?: string
  /** dang cho luot lan nao (null = khong cho) */
  waiting?: string | null
  /** tien do render 0..1 */
  progress?: number
  input: JobInput
  workDir?: string
  result?: JobResult
  error?: { step: JobStep; message: string; hint?: string }
  /** job xong nhung tien trinh con lam viec nen (dong goi hieu ung vao kho) — khong chan nguoi dung */
  tail?: boolean
  startedAt?: number
  finishedAt?: number
}

export const TERMINAL: JobStatus[] = ['done', 'error', 'cancelled']

export const newJobId = () => 'r_' + Date.now().toString(36) + randomBytes(4).toString('hex').slice(0, 6)

const safeId = (id: string) => /^r_[a-z0-9]{6,24}$/.test(id)
export const jobDir = (id: string) => join(JOBS_DIR, id)
const jobFile = (id: string) => join(jobDir(id), 'job.json')
export const jobLog = (id: string) => join(jobDir(id), 'log.txt')
/** `agent-edit cancel` tao file nay -> tien trinh cua job tu dung (pipeline.ts kiem moi giay) */
export const cancelFile = (id: string) => join(jobDir(id), 'cancel')

export function saveJob(j: Job): Job {
  j.updatedAt = Date.now()
  writeJsonAtomic(jobFile(j.id), j)
  return j
}

/** Doc job; tien trinh cua job da chet ma job chua xong -> danh dau loi (may tat / app bi giet giua chung). */
export function loadJob(id: string): Job | null {
  if (!safeId(id) || !existsSync(jobFile(id))) return null
  const j = readJson<Job | null>(jobFile(id), null)
  if (!j) return null
  if (!TERMINAL.includes(j.status) && j.status !== 'queued' && j.pid && !pidAlive(j.pid)) {
    j.status = 'error'
    j.error = {
      step: j.step || 'prepare',
      message: 'Tiến trình xử lý đã dừng bất thường (máy tắt / app bị đóng giữa chừng).',
      hint: `Chạy lại: agent-edit make ... (phần phân tích đã xong được dùng lại, không tốn lại AI). Nhật ký: ${jobLog(id)}`
    }
    j.finishedAt = j.finishedAt || Date.now()
    try {
      saveJob(j)
    } catch {
      /* chi doc */
    }
  }
  if (j.status === 'queued' && j.pid && !pidAlive(j.pid) && Date.now() - j.createdAt > 60000) {
    j.status = 'error'
    j.error = { step: 'prepare', message: 'Không khởi động được tiến trình xử lý.', hint: `Xem nhật ký: ${jobLog(id)}` }
    try {
      saveJob(j)
    } catch {
      /* chi doc */
    }
  }
  if (j.tail && j.pid && !pidAlive(j.pid)) j.tail = false
  return j
}

export function listJobs(): Job[] {
  if (!existsSync(JOBS_DIR)) return []
  return readdirSync(JOBS_DIR)
    .filter(safeId)
    .map((id) => loadJob(id))
    .filter((j): j is Job => !!j)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Job con tien trinh song (dang chay / dang lam viec nen sau khi xong). */
export function activeJobs(): Job[] {
  return listJobs().filter((j) => j.pid && pidAlive(j.pid) && (!TERMINAL.includes(j.status) || j.tail))
}

// ---------------------------------------------------------------------------
// Khoa file (giua cac tien trinh)
// ---------------------------------------------------------------------------
function tryLock(path: string, owner: string): boolean {
  mkdirSync(LOCKS_DIR, { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx')
      writeSync(fd, JSON.stringify({ pid: process.pid, owner, at: Date.now() }))
      closeSync(fd)
      return true
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      let holder: { pid?: number } = {}
      try {
        holder = JSON.parse(readFileSync(path, 'utf-8'))
      } catch {
        /* dang ghi do -> coi nhu con giu */
        return false
      }
      if (holder.pid && pidAlive(holder.pid)) return false
      rmSync(path, { force: true }) // tien trinh giu khoa da chet -> go khoa roi thu lai
    }
  }
  return false
}

export type Lane = 'gemini' | 'claude' | 'render'

function laneLimit(lane: Lane): number {
  if (lane === 'render') return 1
  const lim = jobLimitsOf(readState())
  return lane === 'gemini' ? lim.gemini : lim.claude
}

/**
 * Xin 1 cho trong lan (cho toi khi co). onWait goi 1 lan khi phai cho (de bao "dang cho luot").
 * Tra ham tra cho. cancelled() = true -> thoi cho, nem loi.
 */
export async function acquireLane(lane: Lane, owner: string, onWait: () => void, cancelled: () => boolean): Promise<() => void> {
  let told = false
  for (;;) {
    const n = laneLimit(lane)
    for (let slot = 0; slot < n; slot++) {
      const p = join(LOCKS_DIR, `${lane}-${slot}.lock`)
      if (tryLock(p, owner)) {
        let released = false
        return () => {
          if (released) return
          released = true
          rmSync(p, { force: true })
        }
      }
    }
    if (cancelled()) throw new Error('cancelled')
    if (!told) {
      told = true
      onWait()
    }
    await sleep(2000)
  }
}

/** Khoa 1 viec dung chung (tu cai cong cu, dong bo kho): co tien trinh khac dang lam -> cho no xong. */
export async function withLock<T>(name: string, fn: () => Promise<T>, onWait?: () => void, maxWaitMs = 30 * 60 * 1000): Promise<T> {
  const p = join(LOCKS_DIR, `${name}.lock`)
  const t0 = Date.now()
  let told = false
  while (!tryLock(p, name)) {
    if (!told) {
      told = true
      onWait?.()
    }
    if (Date.now() - t0 > maxWaitMs) break // qua lau -> lam luon (khoa cua tien trinh treo)
    await sleep(2000)
  }
  try {
    return await fn()
  } finally {
    rmSync(p, { force: true })
  }
}
