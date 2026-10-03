import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, Hourglass, CheckCircle2, AlertTriangle, MonitorPlay } from 'lucide-react'
import { Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { useFullUi } from '@/lib/clientUi'
import { setLimits } from '@/lib/jobQueue'
import RemotionStudioPage, { type JobInfo } from '@/pages/RemotionStudio'

/**
 * "TAO VIDEO" NHIEU VIDEO CUNG LUC (2026-10-02). Moi the = 1 RemotionStudioPage (1 du an) LUON mounted (an khi khong
 * xem) -> video dang chay van chay khi nguoi dung sang the khac / tao video moi. Cac the chi xin luot o hang doi dung
 * chung src/lib/jobQueue.ts (phan tich Gemini / lap plan Claude theo Cai dat API, render 1 video 1 luc).
 * The dang mo luu o projects.json (openRemotion) -> mo lai app van con. Dong the KHONG xoa du an (con o "Video da tao").
 */
interface Tab {
  key: string
  /** Du an mo khi tao the (null = the trong) */
  initial: string | null
}

const newKey = () => 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function statusText(info: JobInfo | undefined, fullUi: boolean): string {
  if (!info || info.status === 'empty') return 'Chưa chọn video'
  switch (info.status) {
    case 'waiting':
      return info.lane === 'render' ? 'Chờ lượt xuất video' : info.lane === 'claude' ? (fullUi ? 'Chờ lượt lập plan' : 'Chờ lượt tạo') : 'Chờ lượt phân tích'
    case 'running':
      if (info.step === 'render') return info.renderPct != null ? `Đang xuất ${info.renderPct}%` : 'Đang xuất video'
      if (info.step === 'plan') return fullUi ? 'Đang lập plan' : 'Đang tạo video'
      return 'Đang phân tích'
    case 'preview':
      return 'Có bản xem trước'
    case 'done':
      return 'Đã có video'
    case 'error':
      return 'Có lỗi'
    default:
      return 'Chưa chạy'
  }
}

export default function CreateVideoPage({
  ready,
  openReq,
  deletedReq,
  onBusyIds
}: {
  ready: boolean
  /** "Mo trong Tao video" tu "Video da tao" */
  openReq: { id: string; nonce: number } | null
  /** Du an vua bi xoa o "Video da tao" */
  deletedReq?: { id: string; nonce: number } | null
  /** Du an dang xu ly (khong cho xoa o "Video da tao") */
  onBusyIds?: (ids: string[]) => void
}) {
  const fullUi = useFullUi()
  const [tabs, setTabs] = useState<Tab[] | null>(null)
  const [active, setActive] = useState('')
  const [infos, setInfos] = useState<Record<string, JobInfo>>({})

  // Mo app: khoi phuc cac the dang mo (ban cu chi co 1 du an "dang lam" -> 1 the) + gioi han hang doi (Cai dat API)
  useEffect(() => {
    let alive = true
    window.studio
      .settingsGetJobLimits()
      .then((l) => setLimits(l))
      .catch(() => undefined)
    ;(async () => {
      let ids: string[] = []
      let act: string | null = null
      try {
        const o = await window.studio.projectOpenTabs()
        ids = o.ids
        act = o.active
      } catch {
        /* doc hong -> mo nhu moi */
      }
      if (!ids.length) {
        const p = await window.studio.projectCurrent('remotion').catch(() => null)
        if (p && p.videos?.length) ids = [p.id]
      }
      if (!alive) return
      const list: Tab[] = ids.length ? ids.map((id) => ({ key: newKey(), initial: id })) : [{ key: newKey(), initial: null }]
      setTabs(list)
      const ai = act ? ids.indexOf(act) : -1
      setActive(list[ai >= 0 ? ai : 0].key)
    })()
    return () => {
      alive = false
    }
  }, [])

  const onInfo = useCallback((key: string, info: JobInfo) => {
    setInfos((cur) => {
      const old = cur[key]
      if (
        old &&
        old.projectId === info.projectId &&
        old.title === info.title &&
        old.status === info.status &&
        old.step === info.step &&
        old.lane === info.lane &&
        old.renderPct === info.renderPct &&
        old.busy === info.busy &&
        old.loaded === info.loaded
      )
        return cur
      return { ...cur, [key]: info }
    })
  }, [])

  // Luu cac the dang mo (chi the da co du an) + the dang xem. The CHUA tai xong du an -> giu id du an se mo
  // (khong thi luc mo app, truoc khi cac the doc xong du an, danh sach the bi ghi thanh rong)
  const openSig = useMemo(() => {
    if (!tabs) return ''
    const idOf = (t: Tab) => {
      const i = infos[t.key]
      return i?.loaded ? i.projectId : t.initial || ''
    }
    const ids = tabs.map(idOf).filter(Boolean)
    const act = tabs.find((t) => t.key === active)
    return JSON.stringify([ids, (act && idOf(act)) || null])
  }, [tabs, infos, active])
  const lastSig = useRef('')
  useEffect(() => {
    if (!openSig || openSig === lastSig.current) return
    lastSig.current = openSig
    const [ids, act] = JSON.parse(openSig) as [string[], string | null]
    window.studio.projectSetOpenTabs(ids, act).catch(() => undefined)
  }, [openSig])

  // Du an dang chay (khong cho xoa o "Video da tao")
  const busySig = useMemo(
    () =>
      Object.values(infos)
        .filter((i) => i.busy && i.projectId)
        .map((i) => i.projectId)
        .sort()
        .join(','),
    [infos]
  )
  useEffect(() => {
    onBusyIds?.(busySig ? busySig.split(',') : [])
  }, [busySig, onBusyIds])

  const addTab = useCallback((initial: string | null = null) => {
    const key = newKey()
    setTabs((cur) => [...(cur || []), { key, initial }])
    setActive(key)
    return key
  }, [])

  const closeTab = (key: string) => {
    if (!tabs || infos[key]?.busy) return
    const idx = tabs.findIndex((t) => t.key === key)
    const rest = tabs.filter((t) => t.key !== key)
    const next = rest.length ? rest : [{ key: newKey(), initial: null }]
    setTabs(next)
    // dong the dang xem -> xem the ben trai (hoac the dau)
    if (active === key) setActive((next[idx - 1] || next[0]).key)
    setInfos((cur) => {
      const n = { ...cur }
      delete n[key]
      return n
    })
  }

  // "Mo trong Tao video": the dang mo du an do -> chuyen sang; the dang xem con trong -> mo vao do; khong thi the moi
  useEffect(() => {
    if (!openReq || !tabs) return
    const have = tabs.find((t) => infos[t.key]?.projectId === openReq.id)
    if (have) {
      setActive(have.key)
      return
    }
    const cur = infos[active]
    if (cur && cur.status === 'empty' && !cur.busy) {
      const key = newKey()
      setTabs((list) => (list || []).map((t) => (t.key === active ? { key, initial: openReq.id } : t)))
      setInfos((m) => {
        const n = { ...m }
        delete n[active]
        return n
      })
      setActive(key)
    } else addTab(openReq.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReq?.nonce, tabs === null])

  // Du an vua bi xoa: dong the cua no (the con lai duy nhat thi the tu ve trang moi qua deletedReq)
  useEffect(() => {
    if (!deletedReq || !tabs || tabs.length < 2) return
    const t = tabs.find((x) => infos[x.key]?.projectId === deletedReq.id)
    if (t && !infos[t.key]?.busy) closeTab(t.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deletedReq?.nonce])

  if (!tabs) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const showStrip = ready
  return (
    <div className="w-full">
      {showStrip && (
        <div className="flex items-center gap-2 overflow-x-auto px-8 pt-5">
          {tabs.map((t, i) => {
            const info = infos[t.key]
            const on = t.key === active
            const st = info?.status
            const Icon =
              st === 'waiting'
                ? Hourglass
                : st === 'done'
                  ? CheckCircle2
                  : st === 'error'
                    ? AlertTriangle
                    : st === 'preview'
                      ? MonitorPlay
                      : null
            return (
              <div
                key={t.key}
                className={cn(
                  'no-drag group flex max-w-[240px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all',
                  on
                    ? 'border-brand-400/50 bg-brand-500/10 shadow-[inset_0_0_0_1px_rgba(255,122,26,0.12)]'
                    : 'border-black/8 bg-white/60 hover:bg-white'
                )}
              >
                <button className="flex min-w-0 flex-1 items-center gap-2" onClick={() => setActive(t.key)}>
                  {st === 'running' ? (
                    <Spinner className="h-3.5 w-3.5 shrink-0" />
                  ) : Icon ? (
                    <Icon
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        st === 'done' ? 'text-emerald-500' : st === 'error' ? 'text-red-500' : 'text-brand-500'
                      )}
                    />
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-black/6 text-[10px] font-semibold text-ink-800/50">
                      {i + 1}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className={cn('block truncate text-[13px] font-medium', on ? 'text-brand-700' : 'text-ink-900')}>
                      {info?.status === 'empty' || !info ? 'Video mới' : info.title}
                    </span>
                    <span className="block truncate text-[11px] text-ink-800/45">{statusText(info, fullUi)}</span>
                  </span>
                </button>
                {(tabs.length > 1 || (info && info.status !== 'empty')) && (
                  <button
                    onClick={() => closeTab(t.key)}
                    disabled={!!info?.busy}
                    title={info?.busy ? 'Video đang chạy — đợi xong (hoặc huỷ chờ) rồi đóng' : 'Đóng thẻ (dự án vẫn còn ở "Video đã tạo")'}
                    className="rounded-md p-0.5 text-ink-800/30 hover:bg-black/5 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
          <button
            onClick={() => addTab(null)}
            className="no-drag flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-brand-400/60 px-3 py-2 text-[13px] font-medium text-brand-600 hover:bg-brand-50"
            title="Làm thêm một video khác — các video đang chạy vẫn chạy tiếp"
          >
            <Plus className="h-4 w-4" /> Thêm video
          </button>
        </div>
      )}
      {tabs.map((t) => (
        <div key={t.key} className={t.key === active ? '' : 'hidden'}>
          <RemotionStudioPage
            ready={ready}
            jobKey={t.key}
            initialProjectId={t.initial}
            deletedReq={deletedReq}
            onInfo={onInfo}
            onNewVideo={() => addTab(null)}
          />
        </div>
      ))}
    </div>
  )
}
