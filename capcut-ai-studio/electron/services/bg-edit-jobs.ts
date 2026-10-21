// VIEC EDIT VIDEO CHAY NGAM (tien trinh CLI rieng: bot Telegram / ky nang GetTime / `agent-edit make`).
// Du an chi vao projects.json khi viec ket thuc (cli/pipeline.ts saveProject) -> trang "Video da tao" doc them danh sach
// nay de nguoi dung thay video dang tao + huy duoc. Nguon su that = ~/.capcut-studio/cli/jobs/<id>/job.json.
import { writeFileSync } from 'fs'
import { basename } from 'path'
import { activeJobs, cancelFile, loadJob, TERMINAL, type JobStep } from '../cli/jobs'
import { tgState } from './telegram/store'

const STEP_LABEL: Partial<Record<JobStep, string>> = {
  prepare: 'Chuẩn bị', import: 'Chép video vào dự án', analyze: 'Phân tích video', plan: 'Dựng video', render: 'Xuất video', finish: 'Hoàn tất'
}
const ORDER: JobStep[] = ['prepare', 'import', 'analyze', 'plan', 'render', 'finish']

export interface BgEditJob {
  id: string
  createdAt: number
  /** telegram = bot Telegram tao · cli = lenh agent-edit (GetTime / terminal) */
  via: 'telegram' | 'cli'
  title: string
  videos: string[]
  stepIndex: number
  stepCount: number
  stepLabel: string
  message: string
  /** dang cho luot (co video khac dang chay) */
  waiting: boolean
  progress: number | null
}

export function bgEditJobs(): BgEditJob[] {
  const tg = new Map(tgState().jobs.map((r) => [r.id, r]))
  return activeJobs()
    .filter((j) => (j.kind || 'make') === 'make' && !TERMINAL.includes(j.status))
    .map((j) => {
      const step = j.step || 'prepare'
      const videos = (j.input?.videos || []).map((v) => basename(v))
      const ref = tg.get(j.id)
      return {
        id: j.id,
        createdAt: j.startedAt || j.createdAt,
        via: ref ? 'telegram' : 'cli',
        title: ref?.title || j.input?.editRequest?.purpose || videos[0] || j.id,
        videos,
        stepIndex: Math.max(1, ORDER.indexOf(step) + 1),
        stepCount: ORDER.length,
        stepLabel: STEP_LABEL[step] || 'Đang xử lý',
        message: j.message || '',
        waiting: !!j.waiting,
        progress: step === 'render' && typeof j.progress === 'number' ? j.progress : null
      }
    })
}

/** Giong `agent-edit cancel`: tien trinh cua viec tu dung (kiem file moi giay); bot Telegram tu bao "Da huy" cho nguoi gui. */
export function cancelBgEditJob(id: string): boolean {
  const j = loadJob(id)
  if (!j || TERMINAL.includes(j.status)) return false
  writeFileSync(cancelFile(id), String(Date.now()))
  return true
}
