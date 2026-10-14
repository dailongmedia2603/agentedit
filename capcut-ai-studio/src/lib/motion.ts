// Dung chung cho "Tao video" + "Automation Video" (renderer). Buoc khop electron/services/motion/stages.ts.
import { useEffect, useState } from 'react'

export const MOTION_STAGES: { id: string; label: string }[] = [
  { id: 'prepare', label: 'Chuẩn bị' },
  { id: 'brand', label: 'Tìm hiểu thương hiệu' },
  { id: 'idea', label: 'Lên ý tưởng & kịch bản' },
  { id: 'voice', label: 'Tạo giọng đọc' },
  { id: 'build', label: 'Dựng chuyển động' },
  { id: 'review', label: 'Tự kiểm tra & sửa' },
  { id: 'final', label: 'Xuất video hoàn chỉnh' },
  { id: 'note', label: 'Viết báo cáo' }
]

export function motionStageLabel(id?: string): string {
  return MOTION_STAGES.find((s) => s.id === id)?.label || 'Đang tạo video'
}

export const ASPECTS: { id: MotionAspect; label: string; hint: string }[] = [
  { id: '9:16', label: 'Dọc 9:16', hint: 'TikTok, Reels, Shorts' },
  { id: '16:9', label: 'Ngang 16:9', hint: 'YouTube, website' },
  { id: '1:1', label: 'Vuông 1:1', hint: 'Facebook, Instagram' }
]

export const LANG_OPTIONS = [
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'en', label: 'English' }
]

export const aspectCls = (a?: MotionAspect) => (a === '16:9' ? 'aspect-video' : a === '1:1' ? 'aspect-square' : 'aspect-[9/16]')

export function statusText(j?: MotionJob | null): string {
  if (!j) return 'Video mới'
  switch (j.status) {
    case 'queued':
      return 'Đang chờ lượt'
    case 'running':
      return motionStageLabel(j.stage)
    case 'done':
      return 'Đã có video'
    case 'error':
      return j.draftOnly ? 'Có lỗi (có bản nháp)' : 'Có lỗi'
    case 'cancelled':
      return 'Đã huỷ'
    case 'interrupted':
      return 'Bị gián đoạn'
  }
}

export const isBusy = (j?: MotionJob | null) => !!j && (j.status === 'queued' || j.status === 'running')

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h) return `${h} giờ ${m % 60} phút`
  if (m) return `${m} phút ${String(s % 60).padStart(2, '0')} giây`
  return `${s} giây`
}

export function fmtDateTime(t?: number): string {
  if (!t) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function fmtBytes(n?: number): string {
  if (!n) return ''
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return Math.round(n / 1024) + ' KB'
}

const LAST_KEY = 'motion.lastBrief'

/** Brief trong — nho lua chon hinh thuc lan truoc (khung, thoi luong, giong, ngon ngu, loai) tren may nay. */
export function emptyBrief(): MotionBrief {
  const base: MotionBrief = {
    name: '',
    website: '',
    videoType: 'promo',
    message: '',
    audience: '',
    goal: '',
    cta: '',
    tone: '',
    aspect: '9:16',
    duration: 20,
    language: 'vi',
    colors: '',
    fonts: '',
    assets: [],
    voice: { enabled: true, voiceId: '', voiceName: '', speed: 1, script: '' },
    notes: ''
  }
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null')
    if (last && typeof last === 'object') {
      return {
        ...base,
        aspect: last.aspect || base.aspect,
        duration: last.duration || base.duration,
        language: last.language || base.language,
        videoType: last.videoType || base.videoType,
        voice: { ...base.voice, enabled: last.voice?.enabled ?? true, voiceId: last.voice?.voiceId || '', voiceName: last.voice?.voiceName || '', speed: last.voice?.speed || 1 }
      }
    }
  } catch {
    /* bo qua */
  }
  return base
}

export function rememberBrief(b: MotionBrief): void {
  try {
    localStorage.setItem(
      LAST_KEY,
      JSON.stringify({ aspect: b.aspect, duration: b.duration, language: b.language, videoType: b.videoType, voice: { enabled: b.voice.enabled, voiceId: b.voice.voiceId, voiceName: b.voice.voiceName, speed: b.voice.speed } })
    )
  } catch {
    /* bo qua */
  }
}

/** Danh sach video (loc theo loai / du an) + cap nhat song qua su kien motion:job. */
export function useMotionJobs(filter: { kind?: 'single' | 'auto'; automationId?: string } = {}): MotionJob[] {
  const [jobs, setJobs] = useState<MotionJob[]>([])
  const key = `${filter.kind || ''}|${filter.automationId || ''}`
  useEffect(() => {
    let alive = true
    window.studio.motionList(filter).then((l) => alive && setJobs(l))
    const off = window.studio.onMotionJob((j) => {
      if (filter.kind && j.kind !== filter.kind) return
      if (filter.automationId && j.automationId !== filter.automationId) return
      setJobs((cur) => {
        const i = cur.findIndex((x) => x.id === j.id)
        if (i < 0) return [j, ...cur]
        const next = cur.slice()
        next[i] = j
        return next
      })
    })
    const offRm = window.studio.onMotionRemoved((id) => setJobs((cur) => cur.filter((x) => x.id !== id)))
    return () => {
      alive = false
      off()
      offRm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return jobs
}
