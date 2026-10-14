// Luu danh sach video "Tao video" / "Automation Video": ~/.capcut-studio/motion/jobs.json (ghi nguyen tu: file tam
// roi doi ten). Khong dung projects.json cua Edit Video.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { MOTION_HOME } from './paths'
import type { MotionJob } from './types'

interface StoreFile {
  jobs: MotionJob[]
  /** the dang mo o trang "Tao video" (id job) + the dang xem */
  openTabs?: string[]
  activeTab?: string | null
}

const FILE = join(MOTION_HOME, 'jobs.json')
let cache: StoreFile | null = null

export function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf-8')
  renameSync(tmp, path)
}

function load(): StoreFile {
  if (cache) return cache
  let d: StoreFile = { jobs: [] }
  if (existsSync(FILE)) {
    try {
      const raw = JSON.parse(readFileSync(FILE, 'utf-8'))
      if (raw && Array.isArray(raw.jobs)) d = raw
    } catch {
      /* hong -> bat dau lai (file cu giu o .bad) */
      try {
        renameSync(FILE, FILE + '.bad-' + Date.now())
      } catch {
        /* bo qua */
      }
    }
  }
  cache = d
  return d
}

function save(): void {
  if (cache) writeJson(FILE, cache)
}

export function allJobs(): MotionJob[] {
  return load().jobs
}

export function getJob(id: string): MotionJob | undefined {
  return load().jobs.find((j) => j.id === id)
}

export function putJob(job: MotionJob): MotionJob {
  const d = load()
  const i = d.jobs.findIndex((j) => j.id === job.id)
  if (i >= 0) d.jobs[i] = job
  else d.jobs.unshift(job)
  save()
  return job
}

export function patchJob(id: string, patch: Partial<MotionJob>): MotionJob | undefined {
  const j = getJob(id)
  if (!j) return undefined
  Object.assign(j, patch)
  save()
  return j
}

export function removeJob(id: string): void {
  const d = load()
  d.jobs = d.jobs.filter((j) => j.id !== id)
  if (d.openTabs) d.openTabs = d.openTabs.filter((t) => t !== id)
  save()
}

export function openTabs(): { ids: string[]; active: string | null } {
  const d = load()
  const ids = (d.openTabs || []).filter((id) => d.jobs.some((j) => j.id === id))
  return { ids, active: d.activeTab && ids.includes(d.activeTab) ? d.activeTab : null }
}

export function setOpenTabs(ids: string[], active: string | null): void {
  const d = load()
  d.openTabs = ids.filter((id) => typeof id === 'string')
  d.activeTab = active
  save()
}

/** Mo app: job DANG CHAY tu lan truoc -> "bi gian doan" (tien trinh Claude da chet cung app); job DANG CHO -> tra ve
 *  de xep hang lai (chua ton luot nao). Thu tu cu nhat truoc. */
export function recoverOnStart(): { interrupted: number; queued: string[] } {
  const d = load()
  let n = 0
  const queued: string[] = []
  for (const j of d.jobs) {
    if (j.status === 'running') {
      j.status = 'interrupted'
      j.error = 'App đã tắt khi video đang tạo — bấm “Chạy lại”.'
      n++
    } else if (j.status === 'queued') queued.push(j.id)
  }
  if (n) save()
  return { interrupted: n, queued: queued.reverse() }
}
