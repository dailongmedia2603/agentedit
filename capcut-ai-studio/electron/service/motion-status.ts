// Trang thai tung video "Tao video" cho CLI / GetTime: dich vu ghi ~/.capcut-studio/cli/motion/<id>.json moi khi video doi
// buoc (cung dang voi job.json cua Edit Video: status / progress / message / result.copy / error.message) -> script ky
// nang doc THANG file nay khi GetTime hoi tien do (khong mo app moi 3 giay). Video xong -> chep ra thu muc --out (GetTime:
// thu muc dinh kem -> video hien thanh the trong chat).
import { copyFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { CLI_HOME, readJson, writeJsonAtomic } from '../cli/util'
import { STAGES, stageLabel } from '../services/motion/stages'
import type { MotionJob } from '../services/motion/types'
import type { PostJob } from '../services/phoneagent/posts'

export const MOTION_STATUS_DIR = join(CLI_HOME, 'motion')
/** id video -> thu muc can chep video xong ra */
export const MOTION_OUT_FILE = join(CLI_HOME, 'motion-out.json')
export const motionStatusFile = (id: string) => join(MOTION_STATUS_DIR, `${id}.json`)

/** Tien do uoc theo buoc (cac buoc cua quy trinh: mvd co them anh AI + am thanh) */
function progressOf(j: MotionJob): number {
  if (j.status === 'done') return 1
  if (!j.stage) return 0
  const ids = STAGES.map((s) => s.id).filter((id) => j.brief.engine === 'mvd' || (id !== 'images' && id !== 'sound'))
  const i = ids.indexOf(j.stage)
  return i < 0 ? 0 : Math.min(0.97, (i + 0.5) / ids.length)
}

const iso = (t?: number) => (t ? new Date(t).toISOString() : undefined)

function motionMessage(j: MotionJob): string {
  if (j.status === 'queued') return 'Đang chờ lượt (có video khác đang tạo)'
  if (j.status === 'running') return stageLabel(j.stage)
  if (j.status === 'done') return 'Đã xong video.'
  if (j.status === 'cancelled') return 'Đã huỷ.'
  if (j.status === 'interrupted') return 'Bị gián đoạn (app tắt giữa chừng) — gọi motion-rerun để làm lại.'
  return j.error || 'Lỗi'
}

export function motionView(j: MotionJob, full = false) {
  const status = j.status === 'interrupted' ? 'error' : j.status
  const out = readJson<Record<string, string>>(MOTION_OUT_FILE, {})[j.id]
  const copy = out && j.output ? copyName(out, j) : undefined
  return {
    id: j.id,
    kind: j.kind,
    ...(j.automationId ? { automationId: j.automationId } : {}),
    title: j.title,
    status,
    stage: j.stage,
    message: motionMessage(j),
    progress: progressOf(j),
    engine: j.brief.engine || 'motionmaxxing',
    aspect: j.brief.aspect,
    duration: j.brief.duration,
    createdAt: iso(j.createdAt),
    finishedAt: iso(j.finishedAt),
    result: j.output
      ? { output: j.output, ...(copy && existsSync(copy) ? { copy } : {}), draftOnly: j.draftOnly || undefined, ...(j.meta || {}) }
      : null,
    error: status === 'error' ? { message: j.status === 'interrupted' ? 'Bị gián đoạn (app tắt giữa chừng).' : j.error || 'Lỗi' } : null,
    ...(full ? { note: j.note?.slice(0, 3000), costUsd: j.costUsd, model: j.model, dir: j.dir } : {})
  }
}

function copyName(out: string, j: MotionJob): string {
  const safe = j.title.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'video'
  return join(out, `${safe} ${j.id}.mp4`)
}

/** Goi moi khi 1 video Tao video doi trang thai (onMotionJob). */
export function recordMotionJob(j: MotionJob): void {
  try {
    if (j.status === 'done' && j.output && !j.draftOnly) {
      const out = readJson<Record<string, string>>(MOTION_OUT_FILE, {})[j.id]
      if (out) {
        const dest = copyName(out, j)
        if (!existsSync(dest) || statSync(dest).size !== statSync(j.output).size) {
          mkdirSync(out, { recursive: true })
          copyFileSync(j.output, dest)
        }
      }
    }
  } catch {
    /* chep loi -> ket qua van co file goc (result.output) */
  }
  try {
    writeJsonAtomic(motionStatusFile(j.id), { ...motionView(j), updatedAt: Date.now() })
  } catch {
    /* bo qua */
  }
}

// ---------------------------------------------------------------------------
// Bai dang Phone Agent: ~/.capcut-studio/cli/posts/<id>.json (status: running | done | error | cancelled — cung dang job)
// -> GetTime theo doi bai dang (ke ca hen gio) bang file, khong mo app moi lan hoi.
// ---------------------------------------------------------------------------
export const POST_STATUS_DIR = join(CLI_HOME, 'posts')
export const postStatusFile = (id: string) => join(POST_STATUS_DIR, `${id}.json`)

export function postStatusView(p: PostJob) {
  const status = p.status === 'success' ? 'done' : p.status === 'error' || p.status === 'cancelled' ? p.status : 'running'
  const message =
    p.status === 'scheduled' ? `Đã lên lịch đăng lúc ${new Date(p.scheduledAt).toLocaleString('vi-VN')}`
      : p.status === 'success' ? `Đã đăng xong "${p.title}" qua ${p.deviceName}.`
        : p.message || p.status
  return {
    id: p.id,
    status,
    postStatus: p.status,
    title: p.title,
    message,
    scheduledAt: new Date(p.scheduledAt).toISOString(),
    device: p.deviceName,
    script: p.scriptName,
    error: status === 'error' ? { message: p.error || p.message || 'Đăng không thành công.' } : null
  }
}

const lastPost = new Map<string, string>()

export function recordPosts(list: PostJob[]): void {
  for (const p of list) {
    const view = postStatusView(p)
    const sig = JSON.stringify(view)
    if (lastPost.get(p.id) === sig) continue
    lastPost.set(p.id, sig)
    try {
      writeJsonAtomic(postStatusFile(p.id), { ...view, updatedAt: Date.now() })
    } catch {
      /* bo qua */
    }
  }
}
