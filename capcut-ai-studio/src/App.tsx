import { useEffect, useState } from 'react'
import {
  Stethoscope,
  Settings as SettingsIcon,
  HelpCircle,
  Bell,
  UserCircle2,
  FolderClock,
  Library,
  ScrollText,
  MonitorPlay
} from 'lucide-react'
import { cn } from '@/lib/utils'
import logoUrl from '@/assets/logo.png'
import DoctorPage from '@/pages/Doctor'
import { useDoctor } from '@/lib/useDoctor'
import SettingsPage from '@/pages/Settings'
import ProjectsPage from '@/pages/Projects'
import ResourcesPage from '@/pages/Resources'
import { useLibrarySyncStatus } from '@/lib/useLibrarySync'
import PromptsPage from '@/pages/Prompts'
import CreateVideoPage from '@/pages/CreateVideo'
import { IS_WIN } from './lib/platform'
import { installSecretToggle, useFullUi } from './lib/clientUi'
import { planLabel, fmtDate } from './components/LicenseGate'
import { kickHarvest } from './lib/fxHarvest'

type Tab = 'doctor' | 'settings' | 'resources' | 'prompts' | 'remotion' | 'projects'

function Sparkline() {
  const pts = [6, 10, 7, 13, 9, 15, 11, 17, 12, 18, 14]
  const max = Math.max(...pts)
  const w = 150
  const h = 36
  const step = w / (pts.length - 1)
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="mt-2 opacity-90">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFB070" />
          <stop offset="1" stopColor="#F2620A" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#spark)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('doctor')
  // Ban cai cho may khac: an Prompt & quy tac (+ nhat ky, quy trinh o cac trang) — cua bi mat Ctrl/Cmd+Shift+Alt+D
  const fullUi = useFullUi()
  useEffect(() => installSecretToggle(), [])
  // Ban khach con an ca menu Tai nguyen (kho tu dong bo khi mo app; trang thai xem o Doctor -> "Dong bo tai nguyen")
  useEffect(() => {
    if (!fullUi && (tab === 'prompts' || tab === 'resources')) setTab('remotion')
  }, [fullUi, tab])
  const [appVersion, setAppVersion] = useState('')
  // Thong tin key (nut tai khoan goc phai): da qua cong ban quyen thi trang thai luon la ok
  const [license, setLicense] = useState<LicenseState | null>(null)
  const [licOpen, setLicOpen] = useState(false)
  useEffect(() => {
    window.studio.licenseState().then(setLicense)
    return window.studio.onLicenseChanged(setLicense)
  }, [])
  // Doctor chay ngay khi mo app (kiem + tu cai cong cu thieu); san sang = khong con muc nao "fail"
  const doctor = useDoctor()
  const ready = doctor.ready
  const [openReq, setOpenReq] = useState<{ id: string; nonce: number } | null>(null)
  // Du an dang xu ly o Tao video (nhieu video chay cung luc — khong cho xoa) + du an vua bi xoa (the cua no dong lai)
  const [rmBusyIds, setRmBusyIds] = useState<string[]>([])
  const [deletedReq, setDeletedReq] = useState<{ id: string; nonce: number } | null>(null)
  // Trang Prompt chi mount khi mo lan dau, sau do giu nguyen de khong mat ban dang sua khi doi tab
  const [promptsMounted, setPromptsMounted] = useState(false)
  useEffect(() => {
    if (tab === 'prompts') setPromptsMounted(true)
  }, [tab])

  useEffect(() => {
    window.studio.appInfo().then((i) => setAppVersion(i.build ? `${i.version} · build ${i.build}` : i.version))
  }, [])

  // Tu dong dong bo TOAN BO kho (SFX, Meme, Text, Nhac nen, Hieu ung) tu R2 moi lan mo app — chay nen, khong chan UI.
  // KHONG cho Doctor "san sang" (truoc 2026-10-06 cho -> may con 1 muc Doctor loi, vd chua dang nhap AI, khong bao gio tu
  // dong bo): dong bo chi can sidecar + key (App chi hien sau cong ban quyen). Loi (mat mang, sidecar dang khoi dong...)
  // -> thu lai toi da 3 lan, cach 45s; van loi thi nguoi dung bam "Dong bo kho" o trang Tai nguyen.
  const libSync = useLibrarySyncStatus()
  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = async (n: number) => {
      const r = await window.studio.syncLibrary?.().catch((e) => ({ ok: false, error: String(e) }))
      if (!stop && r && !r.ok && n < 3) timer = setTimeout(() => attempt(n + 1), 45000)
    }
    attempt(1)
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [])
  // Kho hieu ung: lam tiep viec nen con do (preview / Gemini nhan / gui kho chung) tu lan truoc — can Doctor san sang
  const [harvestedOnce, setHarvestedOnce] = useState(false)
  useEffect(() => {
    if (ready && !harvestedOnce) {
      setHarvestedOnce(true)
      kickHarvest()
    }
  }, [ready, harvestedOnce])

  // Mo lai tab Doctor / Video Remotion (vd vua dang nhap AI o Cai dat) -> kiem lai (~1-2s); dang cai thi thoi
  const { run: rerunDoctor, busy: doctorBusy, checks: doctorChecks } = doctor
  useEffect(() => {
    if ((tab === 'doctor' || tab === 'remotion') && doctorChecks.length && !doctorBusy) rerunDoctor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const openProject = (id: string) => {
    setOpenReq({ id, nonce: Date.now() })
    setTab('remotion')
  }

  const nav: { id: Tab; label: string; icon: typeof Stethoscope }[] = [
    { id: 'doctor', label: 'Doctor', icon: Stethoscope },
    { id: 'settings', label: 'Cài đặt API', icon: SettingsIcon },
    { id: 'resources', label: 'Tài nguyên', icon: Library },
    { id: 'prompts', label: 'Prompt & quy tắc', icon: ScrollText },
    { id: 'remotion', label: 'Tạo video', icon: MonitorPlay },
    { id: 'projects', label: 'Video đã tạo', icon: FolderClock }
  ].filter((n) => fullUi || (n.id !== 'prompts' && n.id !== 'resources')) as { id: Tab; label: string; icon: typeof Stethoscope }[]

  return (
    <div className="flex h-full w-full flex-col">
      <div className="drag relative flex h-12 shrink-0 items-center justify-center border-b border-black/5">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <img src={logoUrl} alt="" className="h-[22px] w-[22px] rounded-[5px]" draggable={false} />
          <span className="text-ink-900">Agent Edit</span>
          <span className="text-ink-800/25">·</span>
          <span className="font-normal text-ink-800/40">v{appVersion}</span>
        </div>
        <div className={`no-drag absolute ${IS_WIN ? 'right-[150px]' : 'right-4'} flex items-center gap-1.5 text-ink-800/45`}>
          <button className="rounded-lg p-1.5 hover:bg-black/5 hover:text-ink-900">
            <HelpCircle className="h-[18px] w-[18px]" />
          </button>
          <button className="rounded-lg p-1.5 hover:bg-black/5 hover:text-ink-900">
            <Bell className="h-[18px] w-[18px]" />
          </button>
          <div className="relative">
            <button
              className="rounded-lg p-1.5 hover:bg-black/5 hover:text-ink-900"
              title="Bản quyền"
              onClick={() => setLicOpen((v) => !v)}
            >
              <UserCircle2 className="h-[18px] w-[18px]" />
            </button>
            {licOpen && license && (
              <div
                className="card-surface absolute right-0 top-9 z-50 w-64 rounded-xl p-3.5 text-left text-[13px] text-ink-800/80"
                onMouseLeave={() => setLicOpen(false)}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-800/40">Bản quyền</div>
                {license.dev ? (
                  <div className="mt-1.5">Bản phát triển (không kiểm key)</div>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {license.customer && <div className="font-semibold text-ink-900">{license.customer}</div>}
                    <div>
                      Key: <span className="font-mono">…{license.keyHint}</span>
                    </div>
                    <div>Gói: {planLabel(license.plan)}</div>
                    <div>{license.plan === 'lifetime' || !license.expiresAt ? 'Không hết hạn' : `Hết hạn: ${fmtDate(license.expiresAt)}`}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="sidebar-surface flex w-[220px] shrink-0 flex-col gap-1 p-3">
          {nav.map((n) => {
            const active = tab === n.id
            const Icon = n.icon
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={cn(
                  'no-drag group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-brand-500/10 text-brand-700 shadow-[inset_0_0_0_1px_rgba(255,122,26,0.18)]'
                    : 'text-ink-800/55 hover:text-ink-900 hover:bg-black/[0.04]'
                )}
              >
                <Icon className={cn('h-[18px] w-[18px]', active ? 'text-brand-500' : 'text-ink-800/45')} />
                <span className="flex-1 text-left">{n.label}</span>
                {n.id === 'remotion' && ready && <span className="h-2 w-2 rounded-full bg-brand-500" />}
              </button>
            )
          })}

          <div className="mt-auto">
            <div className="rounded-2xl border border-black/6 bg-white/70 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-800/40">Trạng thái</div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', ready ? 'bg-emerald-500' : 'bg-amber-400')} />
                <span className={cn('text-sm font-semibold', ready ? 'text-emerald-700' : 'text-amber-700')}>
                  {ready ? 'Sẵn sàng tạo video' : doctor.progress?.running ? 'Đang cài công cụ' : 'Chưa đủ điều kiện'}
                </span>
              </div>
              <div className="text-[11px] text-ink-800/40">
                {ready ? 'Hệ thống hoạt động tốt' : doctor.progress?.running ? 'Xem tiến trình ở Doctor' : 'Hoàn tất Doctor + API'}
              </div>
              <Sparkline />
            </div>
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'doctor' && (
            <DoctorPage
              checks={doctor.checks}
              loading={doctor.loading}
              progress={doctor.progress}
              fixing={doctor.fixing}
              logs={doctor.logs}
              onRecheck={doctor.run}
              onFix={doctor.fix}
              goSettings={() => setTab('settings')}
              libSync={libSync}
              onResync={() => window.studio.syncLibrary().catch(() => {})}
            />
          )}
          {tab === 'settings' && <SettingsPage />}
          {tab === 'resources' && fullUi && <ResourcesPage />}
          {tab === 'projects' && (
            <ProjectsPage
              openProject={openProject}
              busyIds={rmBusyIds}
              onDeleted={(id) => setDeletedReq({ id, nonce: Date.now() })}
            />
          )}
          {promptsMounted && fullUi && (
            <div className={tab === 'prompts' ? '' : 'hidden'}>
              <PromptsPage />
            </div>
          )}
          {/* Tao video luon mounted (moi the video cung vay): dang chay / render thi doi tab khong mat tien do */}
          <div className={tab === 'remotion' ? '' : 'hidden'}>
            <CreateVideoPage ready={ready} openReq={openReq} deletedReq={deletedReq} onBusyIds={setRmBusyIds} />
          </div>
        </main>
      </div>
    </div>
  )
}
