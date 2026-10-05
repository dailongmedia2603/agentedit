/**
 * HANG DOI DUNG CHUNG cho NHIEU VIDEO chay cung luc o "Tao video" (2026-10-02).
 *
 * Moi video (1 the trong CreateVideo) tu chay du cac buoc nhu cu, chi XIN LUOT o 3 lan:
 *   gemini  — Hieu nguon + video mau (Gemini xem video). Gioi han = Cai dat API "So video phan tich cung luc".
 *   claude  — Lap ke hoach (/remotion/autoplan, moi buoc Claude chay lan luot). Gioi han = "So video lap plan
 *             cung luc" — mac dinh 1 (2026-09-30 tung bi CHAN ~900s khi 2-3 `claude -p` cung luc; do lai 2026-10-02
 *             Claude CLI 2.1.283: 3 / 5 / 10 luot cung luc KHONG con ket — gioi han that la han muc goi Claude).
 *   render  — Xuat MP4 (nang may). LUON 1: Electron chi chay 1 render 1 luc (remotion.ts startRender).
 * Het cho -> cho theo thu tu bam (FIFO), co luot thi tu chay tiep. Nguoi dung huy cho -> acquire nem QueueCancelled.
 *
 * Module thuan (khong React) — test: tests/test_job_queue.mts.
 */

export type Lane = 'gemini' | 'claude' | 'render'

export const LANES: Lane[] = ['gemini', 'claude', 'render']

/** Gioi han mac dinh / tran (Cai dat API; Electron state.json video_jobs_gemini / video_jobs_claude) */
export const DEFAULT_LIMITS: Record<Lane, number> = { gemini: 2, claude: 1, render: 1 }
// Nguoi dung tu NHAP so o Cai dat API (1..20); tran chi de chan go nham
export const MAX_LIMITS: Record<Lane, number> = { gemini: 20, claude: 20, render: 1 }

export class QueueCancelled extends Error {
  constructor() {
    super('Đã huỷ chờ lượt.')
    this.name = 'QueueCancelled'
  }
}

interface Holder {
  token: number
  jobId: string
  label: string
}

interface Waiter extends Holder {
  resolve: (release: () => void) => void
  reject: (e: Error) => void
  /** viec nen uu tien THAP (Kho hieu ung): luon dung SAU moi video dang cho, video moi bam cung chen len truoc */
  low?: boolean
}

interface LaneState {
  limit: number
  active: Holder[]
  queue: Waiter[]
}

const lanes: Record<Lane, LaneState> = {
  gemini: { limit: DEFAULT_LIMITS.gemini, active: [], queue: [] },
  claude: { limit: DEFAULT_LIMITS.claude, active: [], queue: [] },
  render: { limit: DEFAULT_LIMITS.render, active: [], queue: [] }
}

let seq = 0
let version = 0
const listeners = new Set<() => void>()

function changed(): void {
  version++
  for (const fn of [...listeners]) {
    try {
      fn()
    } catch {
      /* 1 nguoi nghe loi khong duoc chan hang doi */
    }
  }
}

export function clampLimit(lane: Lane, n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return DEFAULT_LIMITS[lane]
  return Math.min(MAX_LIMITS[lane], Math.max(1, v))
}

function pump(lane: Lane): boolean {
  const st = lanes[lane]
  let moved = false
  while (st.active.length < st.limit && st.queue.length) {
    const w = st.queue.shift() as Waiter
    st.active.push({ token: w.token, jobId: w.jobId, label: w.label })
    moved = true
    w.resolve(makeRelease(lane, w.token))
  }
  return moved
}

function makeRelease(lane: Lane, token: number): () => void {
  let done = false
  return () => {
    if (done) return
    done = true
    const st = lanes[lane]
    st.active = st.active.filter((h) => h.token !== token)
    pump(lane)
    changed()
  }
}

/**
 * Xin 1 luot o lan `lane` cho video `jobId`. Tra ve ham NHA luot (goi trong finally; goi nhieu lan vo hai).
 * Con cho -> cho FIFO. cancelWait(jobId) -> Promise nem QueueCancelled.
 */
export function acquire(lane: Lane, jobId: string, label: string): Promise<() => void> {
  const st = lanes[lane]
  const token = ++seq
  // viec nen uu tien thap dang cho KHONG chan video: con cho trong thi video chay ngay
  if (st.active.length < st.limit && !st.queue.some((w) => !w.low)) {
    st.active.push({ token, jobId, label })
    changed()
    return Promise.resolve(makeRelease(lane, token))
  }
  return new Promise<() => void>((resolve, reject) => {
    const i = st.queue.findIndex((w) => w.low)
    const w: Waiter = { token, jobId, label, resolve, reject }
    if (i < 0) st.queue.push(w)
    else st.queue.splice(i, 0, w) // dung truoc moi viec nen
    changed()
  })
}

/**
 * Xin luot UU TIEN THAP cho viec nen (Kho hieu ung: render preview, Gemini gan nhan). Chi duoc chay khi lan
 * con cho VA khong ai dang cho; video bam sau van chen len truoc. Huy cho bang cancelWait(jobId) nhu thuong.
 */
export function acquireIdle(lane: Lane, jobId: string, label: string): Promise<() => void> {
  const st = lanes[lane]
  const token = ++seq
  if (st.active.length < st.limit && !st.queue.length) {
    st.active.push({ token, jobId, label })
    changed()
    return Promise.resolve(makeRelease(lane, token))
  }
  return new Promise<() => void>((resolve, reject) => {
    st.queue.push({ token, jobId, label, resolve, reject, low: true })
    changed()
  })
}

/** Huy cac luot DANG CHO cua video `jobId` (luot dang chay khong bi dung). Tra ve so luot da huy. */
export function cancelWait(jobId: string, lane?: Lane): number {
  let n = 0
  for (const l of lane ? [lane] : LANES) {
    const st = lanes[l]
    const keep: Waiter[] = []
    for (const w of st.queue) {
      if (w.jobId === jobId) {
        n++
        w.reject(new QueueCancelled())
      } else keep.push(w)
    }
    st.queue = keep
  }
  if (n) changed()
  return n
}

/** Doi gioi han (Cai dat API). Tang gioi han -> video dang cho chay ngay; giam -> video dang chay KHONG bi dung. */
export function setLimits(limits: Partial<Record<Lane, number>>): void {
  let any = false
  for (const l of LANES) {
    if (l === 'render' || limits[l] === undefined) continue
    const v = clampLimit(l, limits[l])
    if (lanes[l].limit !== v) {
      lanes[l].limit = v
      pump(l)
      any = true
    }
  }
  if (any) changed()
}

export function getLimits(): Record<Lane, number> {
  return { gemini: lanes.gemini.limit, claude: lanes.claude.limit, render: lanes.render.limit }
}

export interface LaneView {
  limit: number
  /** Video dang giu luot (nhan) */
  active: { jobId: string; label: string }[]
  /** Video dang cho, theo thu tu */
  queue: { jobId: string; label: string }[]
}

export function snapshot(): Record<Lane, LaneView> {
  const view = (st: LaneState): LaneView => ({
    limit: st.limit,
    active: st.active.map(({ jobId, label }) => ({ jobId, label })),
    queue: st.queue.map(({ jobId, label }) => ({ jobId, label }))
  })
  return { gemini: view(lanes.gemini), claude: view(lanes.claude), render: view(lanes.render) }
}

/** Vi tri cua video trong hang cho (0 = dau hang) hoac -1 neu khong cho */
export function waitPosition(lane: Lane, jobId: string): number {
  return lanes[lane].queue.findIndex((w) => w.jobId === jobId)
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getVersion(): number {
  return version
}

/** Chi cho test: tra hang doi ve trang thai ban dau */
export function _resetForTest(): void {
  for (const l of LANES) {
    for (const w of lanes[l].queue) w.reject(new QueueCancelled())
    lanes[l] = { limit: DEFAULT_LIMITS[l], active: [], queue: [] }
  }
  changed()
}
