// Phone Agent (renderer): danh sach iPhone / kich ban / luot dang + nhan tieng Viet. Logic o electron/services/phoneagent.
import { useCallback, useEffect, useState } from 'react'

export const deviceStatusLabel = (s: string) =>
  ({ online: 'sẵn sàng', offline: 'ngoại tuyến', running: 'đang chạy', connecting: 'đang kết nối' })[s] || s
export const deviceTone = (s: string): 'ok' | 'warn' | 'fail' | 'neutral' => (s === 'online' ? 'ok' : s === 'running' || s === 'connecting' ? 'warn' : 'neutral')

export const postStatusLabel: Record<PostStatus, string> = {
  scheduled: 'Đã lên lịch',
  uploading: 'Đang tải lên',
  registering: 'Đang gửi link',
  waiting: 'Chờ iPhone',
  starting: 'Đang gửi lệnh',
  running: 'Đang đăng',
  success: 'Đã đăng',
  error: 'Lỗi',
  cancelled: 'Đã huỷ'
}
export const postTone = (s: PostStatus): 'ok' | 'fail' | 'warn' | 'brand' | 'neutral' =>
  s === 'success' ? 'ok' : s === 'error' ? 'fail' : s === 'cancelled' ? 'neutral' : s === 'scheduled' || s === 'waiting' ? 'warn' : 'brand'
export const postBusy = (s: PostStatus) => ['uploading', 'registering', 'starting', 'running'].includes(s)
export const postDone = (s: PostStatus) => ['success', 'error', 'cancelled'].includes(s)

export function fmtWhen(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return `${p(d.getHours())}:${p(d.getMinutes())}${sameDay ? ' hôm nay' : ` ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`}`
}

/** "YYYY-MM-DDTHH:MM" theo gio may (cho <input type="datetime-local">) */
export function toLocalInput(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** iPhone + kich ban cua tai khoan Phone Agent (tai 1 lan khi mo, bam "Tải lại" de lam moi). */
export function usePaCatalog(enabled = true) {
  const [masked, setMasked] = useState<PaMasked | null>(null)
  const [devices, setDevices] = useState<PaDevice[]>([])
  const [scripts, setScripts] = useState<PaScript[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    const m = await window.studio.phoneagentGet()
    setMasked(m)
    if (!m.has_key) return
    setLoading(true)
    setError('')
    const [d, s] = await Promise.all([window.studio.phoneagentDevices(), window.studio.phoneagentScripts()])
    setDevices(d.devices || [])
    setScripts(s.scripts || [])
    setError(!d.ok ? d.error || 'Không lấy được danh sách iPhone' : !s.ok ? s.error || 'Không lấy được kịch bản' : '')
    setLoading(false)
  }, [])
  useEffect(() => {
    if (enabled) reload()
  }, [enabled, reload])
  return { masked, devices, scripts, loading, error, reload }
}

/** Luot dang (cap nhat song qua su kien phoneagent:posts). */
export function usePosts(filter?: { refId?: string; automationId?: string }) {
  const [list, setList] = useState<PostJob[]>([])
  const refId = filter?.refId
  const automationId = filter?.automationId
  useEffect(() => {
    let alive = true
    const pick = (all: PostJob[]) =>
      all.filter((p) => (!refId || p.origin.refId === refId) && (!automationId || p.origin.automationId === automationId)).sort((a, b) => b.scheduledAt - a.scheduledAt)
    window.studio.phoneagentPosts({ refId, automationId }).then((l) => alive && setList(l))
    const off = window.studio.onPhoneagentPosts((all) => alive && setList(pick(all)))
    return () => {
      alive = false
      off()
    }
  }, [refId, automationId])
  return list
}
