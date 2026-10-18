// AUTOMATION VIDEO -> TU DONG DANG (2026-10-19): video cua du an Automation tao xong (final.mp4, khong phai ban nhap) +
// du an bat "Tu dong dang" -> tao 1 luot dang (posts.ts) voi iPhone + kich ban + bien (mau thay theo tin) + gio dang
// (ngay / sau X phut / khung gio trong tiep theo). Moi video chi tao 1 luot (khoa = id job).
import { getAutoProject } from '../motion/automation'
import { listMotionJobs, onMotionJob } from '../motion/runner'
import type { MotionJob } from '../motion/types'
import { createPost, fillTemplate, listPosts, nextSlot } from './posts'

/** Video xong qua lau truoc khi app thay (vd app tat) -> khong tu dang nua */
const MAX_AGE_MS = 24 * 3600 * 1000
let started = false

export function templateContext(job: MotionJob): Record<string, string> {
  const src = job.brief.source
  const d = new Date(job.finishedAt || Date.now())
  return {
    title: src?.title || job.title || '',
    summary: (src?.summary || '').slice(0, 600),
    link: src?.url || '',
    source: src?.sourceName || '',
    channel: job.brief.name || '',
    date: `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
  }
}

export function maybeQueue(job: MotionJob): void {
  if (job.status !== 'done' || job.kind !== 'auto' || !job.automationId || !job.output || job.draftOnly) return
  const proj = getAutoProject(job.automationId)
  const cfg = proj?.post
  if (!proj || !cfg?.enabled || !cfg.deviceId || !cfg.scriptId) return
  const done = job.finishedAt || 0
  if (done < (cfg.enabledAt || 0) || Date.now() - done > MAX_AGE_MS) return
  if (listPosts({ refId: job.id }).length) return
  const ctx = templateContext(job)
  const variables: Record<string, string> = {}
  for (const [k, v] of Object.entries(cfg.variables || {})) variables[k] = fillTemplate(v, ctx)
  const at =
    cfg.timing === 'delay'
      ? Date.now() + (cfg.delayMin || 0) * 60000
      : cfg.timing === 'slots'
        ? nextSlot(proj.id, cfg.slots || [])
        : Date.now()
  try {
    createPost({
      video: job.output,
      title: job.title,
      origin: { kind: 'auto', refId: job.id, automationId: proj.id },
      deviceId: cfg.deviceId,
      deviceName: cfg.deviceName,
      scriptId: cfg.scriptId,
      scriptName: cfg.scriptName,
      videoVar: cfg.videoVar,
      variables,
      scheduledAt: at
    })
  } catch (e) {
    console.error('[phoneagent] tu dong dang', job.id, String((e as Error)?.message || e))
  }
}

export function startAutoPosting(): void {
  if (started) return
  started = true
  onMotionJob((job) => maybeQueue(job))
  // video xong trong luc app vua mo lai / truoc khi lang nghe
  for (const j of listMotionJobs({ kind: 'auto' })) maybeQueue(j)
}
