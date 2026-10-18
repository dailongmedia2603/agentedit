import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Bot, Globe, Pencil, Play, Plus, Power, RefreshCw, Rss, Send, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, CardBody, Input, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { BriefForm, Field, Section } from '@/components/motion/BriefForm'
import { JobView } from '@/components/motion/JobView'
import { ReadinessBanner, StatusIcon } from '@/pages/MotionCreate'
import { emptyBrief, fmtDateTime, statusText, useMotionJobs } from '@/lib/motion'
import { PostTargetPicker, type PickerMeta } from '@/components/phoneagent/PostTargetPicker'
import { PostList } from '@/components/phoneagent/PostList'
import { usePosts } from '@/components/phoneagent/usePhoneAgent'

/**
 * "AUTOMATION VIDEO" (2026-10-14): du an = thong tin chung + nguon tin (website / RSS / trang Facebook). App dang mo thi
 * tu kiem tin moi theo chu ky; tin moi -> tu tao video bang skill motionmaxxing (khong can duyet). Logic o
 * electron/services/motion/automation.ts.
 */

interface Draft {
  id?: string
  name: string
  enabled: boolean
  defaults: MotionBrief
  sources: (AutoSourceInput & { has_token?: boolean; key: string })[]
  intervalMin: number
  maxPerCheck: number
  maxPerDay: number
  skipExisting: boolean
  post: AutoPostConfig
}

const skey = () => 's' + Math.random().toString(36).slice(2, 8)

const newPost = (): AutoPostConfig => ({ enabled: false, deviceId: '', scriptId: '', variables: {}, timing: 'now', delayMin: 30, slots: ['08:00', '12:00', '19:00'] })
const TOKEN_HINT = 'Mẫu: {title} tiêu đề tin · {summary} tóm tắt · {link} link bài · {source} tên nguồn · {channel} tên kênh · {date} ngày'

function newDraft(): Draft {
  const d = emptyBrief()
  return {
    name: '',
    enabled: true,
    defaults: { ...d, videoType: 'news', duration: 30, message: '' },
    sources: [{ key: skey(), type: 'web', url: '' }],
    intervalMin: 30,
    maxPerCheck: 2,
    maxPerDay: 10,
    skipExisting: true,
    post: newPost()
  }
}

function fromProject(p: AutoProject): Draft {
  return {
    id: p.id,
    name: p.name,
    enabled: p.enabled,
    defaults: { ...emptyBrief(), ...p.defaults, message: p.defaults.message || '' },
    sources: p.sources.map((s) => ({ ...s, key: s.id, token: '' })),
    intervalMin: p.intervalMin,
    maxPerCheck: p.maxPerCheck,
    maxPerDay: p.maxPerDay,
    skipExisting: p.skipExisting,
    post: p.post ? { ...newPost(), ...p.post } : newPost()
  }
}

/** "Tu dong dang" cua du an Automation: video tao xong -> iPhone + kich ban Phone Agent dang len kenh theo lich. */
function AutoPostSection({ post, onChange, onMeta }: { post: AutoPostConfig; onChange: (p: AutoPostConfig) => void; onMeta: (m: PickerMeta) => void }) {
  const [slotDraft, setSlotDraft] = useState('')
  const slots = post.slots || []
  const addSlot = () => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(slotDraft.trim())
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return
    const v = `${m[1].padStart(2, '0')}:${m[2]}`
    if (!slots.includes(v)) onChange({ ...post, slots: [...slots, v].sort() })
    setSlotDraft('')
  }
  return (
    <Section title="Tự động đăng lên kênh (Phone Agent)" icon={<Send className="h-4 w-4 text-brand-500" />}>
      <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-800/70">
        <input type="checkbox" checked={post.enabled} onChange={(e) => onChange({ ...post, enabled: e.target.checked })} className="mt-0.5 accent-brand-500" />
        <span>
          Video tạo xong thì <b>tự đăng</b>: app tải video lên, truyền vào iPhone và chạy kịch bản Phone Agent để đăng lên kênh (TikTok / Facebook…).
          Chỉ video tạo xong <b>sau khi bật</b> mới tự đăng.
        </span>
      </label>
      {post.enabled && (
        <>
          <PostTargetPicker
            value={{ deviceId: post.deviceId, deviceName: post.deviceName, scriptId: post.scriptId, scriptName: post.scriptName, videoVar: post.videoVar, variables: post.variables || {} }}
            onChange={(t) => onChange({ ...post, ...t })}
            onMeta={onMeta}
            defaultCaption="{title}"
            tokenHint={TOKEN_HINT}
          />
          <div>
            <div className="mb-1 text-xs font-medium text-ink-800/60">Lịch đăng</div>
            <div className="inline-flex rounded-lg border border-black/10 bg-ink-50 p-0.5">
              {(
                [
                  ['now', 'Đăng ngay khi xong'],
                  ['delay', 'Sau một khoảng'],
                  ['slots', 'Theo khung giờ']
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => onChange({ ...post, timing: k })}
                  className={cn('no-drag rounded-md px-3 py-1.5 text-[12.5px] font-medium', post.timing === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-800/50')}
                >
                  {l}
                </button>
              ))}
            </div>
            {post.timing === 'delay' && (
              <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-800/70">
                Đăng sau
                <Input type="number" min={0} className="h-9 w-24" value={post.delayMin ?? 30} onChange={(e) => onChange({ ...post, delayMin: Number(e.target.value) || 0 })} />
                phút kể từ khi video tạo xong
              </div>
            )}
            {post.timing === 'slots' && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {slots.map((sl) => (
                    <span key={sl} className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2.5 py-1 text-[12.5px] font-medium text-brand-700">
                      {sl}
                      <button className="no-drag text-brand-700/60 hover:text-brand-700" onClick={() => onChange({ ...post, slots: slots.filter((x) => x !== sl) })}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <Input
                    className="h-8 w-24"
                    placeholder="HH:MM"
                    value={slotDraft}
                    onChange={(e) => setSlotDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSlot()}
                  />
                  <Button variant="outline" size="sm" onClick={addSlot}>
                    <Plus className="h-3.5 w-3.5" /> Thêm giờ
                  </Button>
                </div>
                <div className="text-[11.5px] text-ink-800/45">
                  Mỗi khung giờ đăng 1 video / ngày: video xong sẽ vào khung giờ trống gần nhất (hết khung hôm nay thì sang ngày mai).
                </div>
              </div>
            )}
            <div className="mt-1.5 text-[11.5px] text-ink-800/45">Lịch đăng do app giữ — app cần đang mở tới giờ đăng. iPhone đang bận / ngoại tuyến thì lượt đăng tự chờ (tối đa 6 giờ).</div>
          </div>
        </>
      )}
    </Section>
  )
}

function SourceRow({
  s,
  projectId,
  onChange,
  onRemove
}: {
  s: Draft['sources'][number]
  projectId?: string
  onChange: (s: Draft['sources'][number]) => void
  onRemove: () => void
}) {
  const [testing, setTesting] = useState(false)
  const [res, setRes] = useState<{ ok: boolean; via?: string; items?: MotionSourceItem[]; error?: string } | null>(null)
  const test = async () => {
    setTesting(true)
    setRes(null)
    const r = await window.studio.automationTestSource({ id: s.id, type: s.type, url: s.url, token: s.token, projectId })
    setRes(r)
    setTesting(false)
  }
  return (
    <div className="rounded-xl border border-black/8 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="inline-flex shrink-0 rounded-lg border border-black/10 bg-ink-50 p-0.5">
          {(['web', 'facebook'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onChange({ ...s, type: t })}
              className={cn('no-drag rounded-md px-2.5 py-1.5 text-[12px] font-medium', s.type === t ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-800/50')}
            >
              {t === 'web' ? 'Website / RSS' : 'Facebook'}
            </button>
          ))}
        </div>
        <Input
          value={s.url}
          onChange={(e) => onChange({ ...s, url: e.target.value })}
          placeholder={s.type === 'web' ? 'https://vnexpress.net/so-hoa  hoặc  link RSS' : 'https://facebook.com/ten-trang  hoặc id trang'}
          className="h-9 flex-1"
        />
        <Input value={s.label || ''} onChange={(e) => onChange({ ...s, label: e.target.value })} placeholder="Tên nguồn (tuỳ chọn)" className="h-9 w-44" />
        <Button variant="outline" size="sm" className="h-9" onClick={test} disabled={!s.url.trim() || testing}>
          {testing ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} Thử lấy tin
        </Button>
        <button onClick={onRemove} className="no-drag rounded-lg p-2 text-ink-800/40 hover:bg-black/5 hover:text-ink-900" title="Bỏ nguồn">
          <X className="h-4 w-4" />
        </button>
      </div>
      {s.type === 'facebook' && (
        <div className="mt-2">
          <Input
            type="password"
            value={s.token || ''}
            onChange={(e) => onChange({ ...s, token: e.target.value })}
            placeholder={s.has_token ? 'Đã lưu Page Access Token — nhập để đổi' : 'Page Access Token (Facebook Graph API)'}
            className="h-9"
          />
          <div className="mt-1 text-[11.5px] leading-relaxed text-ink-800/45">
            Facebook chỉ cho đọc bài của trang qua Graph API bằng <b>Page Access Token</b> (trang bạn quản lý, tạo ở developers.facebook.com). Không có token: dùng dịch vụ tạo RSS cho trang (rss.app, fetchrss.com) rồi thêm link RSS đó với loại “Website / RSS”.
          </div>
        </div>
      )}
      {res && (
        <div className={cn('mt-2 rounded-lg px-3 py-2 text-[12px]', res.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
          {res.ok ? (
            <>
              <div className="font-medium">Lấy được {res.items?.length || 0} tin (qua {res.via}). Mới nhất:</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {(res.items || []).slice(0, 5).map((it) => (
                  <li key={it.id} className="truncate">
                    {it.title}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            res.error
          )}
        </div>
      )}
    </div>
  )
}

function ProjectForm({ initial, onSaved, onCancel }: { initial: Draft; onSaved: (p: AutoProject) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial)
  const [postMeta, setPostMeta] = useState<PickerMeta>({ ok: false })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setErr('')
    if (!d.name.trim()) return setErr('Nhập tên dự án.')
    if (!d.defaults.name.trim()) return setErr('Nhập tên kênh / thương hiệu.')
    if (!d.sources.some((s) => s.url.trim())) return setErr('Thêm ít nhất một nguồn tin.')
    if (d.defaults.voice.enabled && !d.defaults.voice.voiceId) return setErr('Chọn giọng đọc (hoặc chọn “Không lời”).')
    if (d.post.enabled && !postMeta.ok) return setErr('Tự động đăng: ' + (postMeta.problem || 'chưa đủ thông tin.'))
    setSaving(true)
    const { message, source, ...defaults } = d.defaults
    void source
    const r = await window.studio.automationSave({
      id: d.id,
      name: d.name,
      enabled: d.enabled,
      defaults: { ...defaults, message },
      sources: d.sources.filter((s) => s.url.trim()).map(({ key, has_token, ...s }) => (void key, void has_token, s)),
      intervalMin: d.intervalMin,
      maxPerCheck: d.maxPerCheck,
      maxPerDay: d.maxPerDay,
      skipExisting: d.skipExisting,
      post: d.post
    })
    setSaving(false)
    if (!r.ok || !r.project) return setErr(r.error || 'Không lưu được dự án.')
    onSaved(r.project)
  }
  const num = (k: 'intervalMin' | 'maxPerCheck' | 'maxPerDay', v: string) => setD({ ...d, [k]: Number(v) || 0 })
  return (
    <div className="pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </Button>
        <h2 className="text-lg font-semibold text-ink-900">{d.id ? 'Sửa dự án' : 'Dự án Automation mới'}</h2>
      </div>
      <div className="space-y-4">
        <Section title="Dự án" icon={<Bot className="h-4 w-4 text-brand-500" />}>
          <Field label="Tên dự án" required>
            <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ví dụ: Tin công nghệ mỗi ngày" />
          </Field>
        </Section>

        <Section
          title="Nguồn tin"
          icon={<Rss className="h-4 w-4 text-brand-500" />}
          right={
            <Button variant="outline" size="sm" onClick={() => setD({ ...d, sources: [...d.sources, { key: skey(), type: 'web', url: '' }] })}>
              <Plus className="h-4 w-4" /> Thêm nguồn
            </Button>
          }
        >
          <div className="text-[12px] leading-relaxed text-ink-800/50">
            Dán link trang chủ / trang chuyên mục / link RSS của website — app tự tìm RSS, không có thì lấy các bài trên trang. Mỗi tin mới thành một video.
          </div>
          {d.sources.map((s, i) => (
            <SourceRow
              key={s.key}
              s={s}
              projectId={d.id}
              onChange={(n) => setD({ ...d, sources: d.sources.map((x, k) => (k === i ? n : x)) })}
              onRemove={() => setD({ ...d, sources: d.sources.filter((_, k) => k !== i) })}
            />
          ))}
        </Section>

        <Section title="Lịch kiểm tin & giới hạn" icon={<RefreshCw className="h-4 w-4 text-brand-500" />}>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kiểm tin mới mỗi (phút)" hint="Tối thiểu 5 phút">
              <Input type="number" min={5} value={d.intervalMin} onChange={(e) => num('intervalMin', e.target.value)} />
            </Field>
            <Field label="Tối đa video mỗi lần kiểm" hint="Tin vượt sẽ để lần sau">
              <Input type="number" min={1} max={10} value={d.maxPerCheck} onChange={(e) => num('maxPerCheck', e.target.value)} />
            </Field>
            <Field label="Tối đa video mỗi ngày" hint="Bảo vệ hạn mức Claude + SaydiVoice">
              <Input type="number" min={1} max={100} value={d.maxPerDay} onChange={(e) => num('maxPerDay', e.target.value)} />
            </Field>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-800/70">
            <input type="checkbox" checked={d.skipExisting} onChange={(e) => setD({ ...d, skipExisting: e.target.checked })} className="mt-0.5 accent-brand-500" />
            <span>
              Lần đầu chỉ ghi nhận tin đang có, <b>không</b> làm video từ tin cũ — chỉ tin đăng sau khi bật dự án mới thành video.
            </span>
          </label>
          <div className="text-[11.5px] text-ink-800/45">App cần đang mở thì mới kiểm tin và tạo video (đóng cửa sổ trên Mac app vẫn chạy nền).</div>
        </Section>

        <div className="pt-1 text-[13px] font-semibold uppercase tracking-wide text-ink-800/40">Thông tin chung cho mọi video của dự án</div>
        <BriefForm value={d.defaults} onChange={(b) => setD({ ...d, defaults: b })} mode="auto" />

        <AutoPostSection post={d.post} onChange={(post) => setD((cur) => ({ ...cur, post }))} onMeta={setPostMeta} />
      </div>
      <div className="sticky bottom-0 -mx-8 mt-4 flex items-center justify-end gap-3 border-t border-black/6 bg-[rgba(250,249,247,0.92)] px-8 py-3 backdrop-blur">
        {err && <div className="mr-auto text-[13px] text-red-600">{err}</div>}
        <Button variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? <Spinner className="border-white/40 border-t-white" /> : null} Lưu dự án
        </Button>
      </div>
    </div>
  )
}

function ProjectDetail({ p, onBack, onEdit }: { p: AutoProject; onBack: () => void; onEdit: () => void }) {
  const jobs = useMotionJobs({ kind: 'auto', automationId: p.id })
  const posts = usePosts({ automationId: p.id })
  const [sel, setSel] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState('')
  const job = jobs.find((j) => j.id === sel)
  const checkNow = async () => {
    setChecking(true)
    setMsg('')
    const r = await window.studio.automationCheckNow(p.id)
    setMsg(r.message)
    setChecking(false)
  }
  if (job) {
    return (
      <div>
        <Button variant="ghost" size="sm" className="mb-3" onClick={() => setSel(null)}>
          <ArrowLeft className="h-4 w-4" /> Về dự án {p.name}
        </Button>
        <JobView job={job} onDeleted={() => setSel(null)} />
      </div>
    )
  }
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Tất cả dự án
        </Button>
        <h2 className="flex-1 truncate text-lg font-semibold text-ink-900">{p.name}</h2>
        <Button variant="outline" size="sm" onClick={checkNow} disabled={checking}>
          {checking ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Kiểm tin ngay
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" /> Sửa
        </Button>
      </div>
      <Card className="mb-4">
        <CardBody className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-4 text-[12.5px] text-ink-800/60">
          <div>
            Trạng thái: <b className={p.enabled ? 'text-emerald-700' : 'text-ink-800/50'}>{p.enabled ? 'Đang chạy' : 'Đã tắt'}</b> · kiểm mỗi {p.intervalMin} phút
          </div>
          <div>
            Nguồn: {p.sources.map((s) => s.label || s.url).join(', ')}
          </div>
          <div>Lần kiểm gần nhất: {p.lastCheckAt ? fmtDateTime(p.lastCheckAt) : 'chưa kiểm'}</div>
          <div>Lần kiểm tới: {p.enabled && p.nextCheckAt ? fmtDateTime(p.nextCheckAt) : '—'}</div>
          {p.lastResult && <div className="col-span-2 text-ink-800/75">{p.lastResult}</div>}
          {p.lastError && <div className="col-span-2 text-red-600">Lỗi lần trước: {p.lastError}</div>}
          {msg && <div className="col-span-2 font-medium text-brand-700">{msg}</div>}
        </CardBody>
      </Card>
      {(p.post?.enabled || posts.length > 0) && (
        <div className="mb-4">
          <div className="mb-2 text-[13px] font-semibold text-ink-900">
            Lịch đăng ({posts.length}){p.post?.enabled ? ` · tự đăng qua ${p.post.deviceName || 'iPhone'} / ${p.post.scriptName || 'kịch bản'}` : ' · tự động đăng đang tắt'}
          </div>
          <PostList posts={posts.slice(0, 30)} showTitle empty="Chưa có lượt đăng — video tạo xong sẽ tự lên lịch đăng." />
        </div>
      )}
      <div className="mb-2 text-[13px] font-semibold text-ink-900">Video đã tạo ({jobs.length})</div>
      {!jobs.length ? (
        <div className="card-surface rounded-2xl p-6 text-center text-[13px] text-ink-800/45">
          Chưa có video. Khi nguồn có tin mới, video sẽ tự xuất hiện ở đây.
        </div>
      ) : (
        <div className="card-surface rounded-2xl p-2">
          {jobs.map((j) => (
            <button key={j.id} onClick={() => setSel(j.id)} className="no-drag flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-black/[0.04]">
              <StatusIcon job={j} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink-900">{j.title}</span>
                <span className="block text-[11.5px] text-ink-800/45">
                  {statusText(j)} · {fmtDateTime(j.createdAt)}
                  {j.brief.source?.sourceName ? ` · ${j.brief.source.sourceName}` : ''}
                </span>
              </span>
              <Play className="h-4 w-4 text-ink-800/30" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MotionAutomationPage({ visible }: { visible: boolean }) {
  const [list, setList] = useState<AutoProject[] | null>(null)
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'edit'; draft: Draft } | { kind: 'detail'; id: string }>({ kind: 'list' })
  const [check, setCheck] = useState<MotionCheck | null>(null)
  const allAuto = useMotionJobs({ kind: 'auto' })
  useEffect(() => {
    window.studio.automationList().then(setList)
    return window.studio.onAutomationChanged(setList)
  }, [])
  useEffect(() => {
    if (visible) window.studio.motionCheck().then(setCheck).catch(() => undefined)
  }, [visible])
  // dem video dang chay theo du an (cap nhat song)
  const runningBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const j of allAuto) if (j.automationId && (j.status === 'running' || j.status === 'queued')) m.set(j.automationId, (m.get(j.automationId) || 0) + 1)
    return m
  }, [allAuto])
  const countBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const j of allAuto) if (j.automationId) m.set(j.automationId, (m.get(j.automationId) || 0) + 1)
    return m
  }, [allAuto])

  const problems: string[] = []
  if (check && !check.claude.installed) problems.push('Chưa cài Claude Code — vào “Cài đặt API” > Claude.')
  if (check && (list || []).some((p) => p.enabled && p.defaults.voice?.enabled) && !check.saydi.has_key)
    problems.push('Có dự án dùng lời đọc nhưng chưa có API key SaydiVoice — nhập ở “Cài đặt API” > SaydiVoice.')

  if (!list) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const detail = view.kind === 'detail' ? list.find((p) => p.id === view.id) : undefined

  return (
    <div className="w-full px-8 py-7">
      {view.kind === 'list' && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Automation Video</h1>
            <p className="mt-0.5 text-sm text-ink-800/45">
              Dự án tự theo dõi tin mới từ website / trang Facebook và tự tạo video hoàn chỉnh — không cần nhập thông tin từng video.
            </p>
          </div>
          <Button onClick={() => setView({ kind: 'edit', draft: newDraft() })}>
            <Plus className="h-4 w-4" /> Dự án mới
          </Button>
        </div>
      )}
      {view.kind === 'list' && <ReadinessBanner problems={problems} check={problems.length ? check : null} />}

      {view.kind === 'edit' && (
        <ProjectForm
          initial={view.draft}
          onCancel={() => setView(view.draft.id ? { kind: 'detail', id: view.draft.id } : { kind: 'list' })}
          onSaved={(p) => setView({ kind: 'detail', id: p.id })}
        />
      )}

      {view.kind === 'detail' && detail && (
        <ProjectDetail p={detail} onBack={() => setView({ kind: 'list' })} onEdit={() => setView({ kind: 'edit', draft: fromProject(detail) })} />
      )}

      {view.kind === 'list' &&
        (!list.length ? (
          <div className="card-surface rounded-2xl p-10 text-center">
            <Bot className="mx-auto h-10 w-10 text-brand-500" />
            <div className="mt-3 text-[15px] font-semibold text-ink-900">Chưa có dự án Automation</div>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-800/50">
              Tạo dự án, khai báo nguồn tin (website / RSS / trang Facebook) và thông tin chung (khung, thời lượng, giọng đọc…). App tự kiểm tin mới và làm video.
            </p>
            <Button className="mt-4" onClick={() => setView({ kind: 'edit', draft: newDraft() })}>
              <Plus className="h-4 w-4" /> Tạo dự án đầu tiên
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {list.map((p) => (
              <div key={p.id} className="card-surface rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', p.enabled ? 'border-brand-400/40 bg-brand-500/10' : 'border-black/8 bg-black/5')}>
                    <Bot className={cn('h-5 w-5', p.enabled ? 'text-brand-500' : 'text-ink-800/35')} />
                  </div>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setView({ kind: 'detail', id: p.id })}>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-ink-900">{p.name}</span>
                      {p.enabled ? <Badge tone="ok">đang chạy</Badge> : <Badge tone="neutral">đã tắt</Badge>}
                      {runningBy.get(p.id) ? <Badge tone="brand">{runningBy.get(p.id)} video đang tạo</Badge> : null}
                    </div>
                    <div className="mt-1 flex items-center gap-1 truncate text-[12px] text-ink-800/50">
                      <Globe className="h-3.5 w-3.5 shrink-0" /> {p.sources.map((s) => s.label || s.url).join(' · ')}
                    </div>
                    <div className="mt-1 text-[12px] text-ink-800/45">
                      {countBy.get(p.id) || 0} video · kiểm mỗi {p.intervalMin} phút · {p.lastCheckAt ? `kiểm lúc ${fmtDateTime(p.lastCheckAt)}` : 'chưa kiểm'}
                    </div>
                    {p.lastError && <div className="mt-1 truncate text-[12px] text-red-600">{p.lastError}</div>}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => window.studio.automationToggle(p.id, !p.enabled)}
                      title={p.enabled ? 'Tắt dự án' : 'Bật dự án'}
                      className={cn('no-drag rounded-lg p-2 hover:bg-black/5', p.enabled ? 'text-emerald-600' : 'text-ink-800/40')}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Xoá dự án “${p.name}”? Các video đã tạo vẫn giữ trong thư mục của app.`)) window.studio.automationDelete(p.id)
                      }}
                      title="Xoá dự án"
                      className="no-drag rounded-lg p-2 text-ink-800/40 hover:bg-black/5 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}
