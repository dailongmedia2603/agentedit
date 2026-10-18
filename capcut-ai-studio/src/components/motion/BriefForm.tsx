import { useEffect, useState, type ReactNode } from 'react'
import { ImagePlus, Mic, MicOff, Palette, Type, X, FileImage, Workflow } from 'lucide-react'
import { Input } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { ASPECTS, LANG_OPTIONS } from '@/lib/motion'
import { VoicePicker } from './VoicePicker'

const FALLBACK_TYPES = [
  { id: 'promo', label: 'Quảng cáo / giới thiệu sản phẩm' },
  { id: 'launch', label: 'Ra mắt sản phẩm' },
  { id: 'feature', label: 'Giới thiệu một tính năng' },
  { id: 'social_ad', label: 'Quảng cáo mạng xã hội' },
  { id: 'explainer', label: 'Video giải thích' },
  { id: 'kinetic', label: 'Chữ động (kinetic typography)' },
  { id: 'brand', label: 'Nhận diện thương hiệu (brand sting)' },
  { id: 'news', label: 'Tin tức ngắn' }
]
let typesCache: { id: string; label: string }[] | null = null
let mvdCache: MotionCheck['mvd'] | null = null

export function Field({ label, hint, required, children, className }: { label: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-ink-800/60">
        {label}
        {required && <span className="ml-0.5 text-brand-600">*</span>}
      </label>
      {children}
      {hint && <div className="mt-1 text-[11.5px] leading-relaxed text-ink-800/40">{hint}</div>}
    </div>
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'no-drag w-full rounded-xl border border-black/10 bg-ink-50 px-3 py-2 text-sm text-ink-900 outline-none transition placeholder:text-ink-800/35 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/15',
        props.className
      )}
    />
  )
}

export function Section({ title, icon, children, right }: { title: string; icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="card-surface rounded-2xl px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <div className="flex-1 text-[14px] font-semibold text-ink-900">{title}</div>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function AssetThumb({ path, onRemove }: { path: string; onRemove: () => void }) {
  const [url, setUrl] = useState('')
  const name = path.split(/[\\/]/).pop() || path
  useEffect(() => {
    if (/\.(png|jpe?g|webp|gif)$/i.test(path)) window.studio.remotionMediaUrl(path).then(setUrl).catch(() => setUrl(''))
  }, [path])
  return (
    <div className="group relative w-[92px]">
      <div className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-xl border border-black/8 bg-[repeating-conic-gradient(#f3f3f3_0%_25%,#fff_0%_50%)] bg-[length:14px_14px]">
        {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : <FileImage className="h-6 w-6 text-ink-800/30" />}
      </div>
      <div className="mt-1 truncate text-[10.5px] text-ink-800/50" title={path}>
        {name}
      </div>
      <button
        onClick={onRemove}
        title="Bỏ file này"
        className="no-drag absolute -right-1.5 -top-1.5 hidden rounded-full border border-black/10 bg-white p-0.5 text-ink-800/60 shadow group-hover:block"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * Form thong tin cho skill motionmaxxing.
 *  - mode 'single' (Tao video): co "Noi dung chinh" (bat buoc).
 *  - mode 'auto' (thong tin chung du an Automation): KHONG co noi dung (lay tu tin moi), co "Huong dan cach lam video".
 */
export function BriefForm({ value, onChange, mode = 'single' }: { value: MotionBrief | AutoDefaults; onChange: (v: MotionBrief) => void; mode?: 'single' | 'auto' }) {
  const b = value as MotionBrief
  const set = <K extends keyof MotionBrief>(k: K, v: MotionBrief[K]) => onChange({ ...b, [k]: v })
  const [types, setTypes] = useState(typesCache || FALLBACK_TYPES)
  useEffect(() => {
    if (!typesCache)
      window.studio
        .motionMeta()
        .then((m) => {
          typesCache = m.videoTypes
          setTypes(m.videoTypes)
        })
        .catch(() => undefined)
  }, [])

  // Quy trinh motion-video-director: CHI hien khi may nay da cai skill (thu nghiem ca nhan — electron/services/motion/mvd.ts)
  const [mvd, setMvd] = useState<MotionCheck['mvd'] | null>(mvdCache)
  useEffect(() => {
    if (!mvdCache)
      window.studio
        .motionCheck()
        .then((c) => {
          mvdCache = c.mvd || { available: false, elevenlabs: false }
          setMvd(mvdCache)
        })
        .catch(() => undefined)
  }, [])
  const engine = b.engine === 'mvd' && mvd?.available ? 'mvd' : 'motionmaxxing'

  const addAssets = async () => {
    const files = await window.studio.motionPickAssets()
    if (files.length) set('assets', Array.from(new Set([...(b.assets || []), ...files])))
  }

  return (
    <div className="space-y-4">
      <Section title={mode === 'auto' ? 'Kênh / thương hiệu' : 'Nội dung video'}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={mode === 'auto' ? 'Tên kênh / thương hiệu' : 'Tên sản phẩm / thương hiệu'} required>
            <Input value={b.name || ''} onChange={(e) => set('name', e.target.value)} placeholder={mode === 'auto' ? 'Ví dụ: Bản tin Công nghệ 60s' : 'Ví dụ: Agent Edit'} />
          </Field>
          <Field label="Loại video">
            <select
              value={b.videoType || (mode === 'auto' ? 'news' : 'promo')}
              onChange={(e) => set('videoType', e.target.value)}
              className="no-drag h-10 w-full rounded-xl border border-black/10 bg-ink-50 px-3 text-sm text-ink-900 outline-none focus:border-brand-400"
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {mode === 'single' && (
          <Field
            label="Nội dung chính muốn nói"
            required
            hint="Sản phẩm làm gì, điểm đáng nói nhất, một tình huống cụ thể. Càng cụ thể (tính năng thật, câu chữ thật) video càng hay — AI không bịa số liệu."
          >
            <TextArea rows={4} value={b.message || ''} onChange={(e) => set('message', e.target.value)} placeholder="Ví dụ: Agent Edit tự edit video TikTok bằng AI — thả video gốc vào, AI tự cắt khoảng lặng, thêm phụ đề, chữ nhấn, hiệu ứng, nhạc rồi xuất MP4." />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Khán giả" hint="Ai sẽ xem video">
            <Input value={b.audience || ''} onChange={(e) => set('audience', e.target.value)} placeholder="Ví dụ: chủ shop online, creator TikTok" />
          </Field>
          <Field label="Tông / cảm xúc" hint="Cảm giác video để lại">
            <Input value={b.tone || ''} onChange={(e) => set('tone', e.target.value)} placeholder="Ví dụ: nhanh, tự tin, hơi hài hước" />
          </Field>
          <Field label="Mục tiêu" hint="Người xem làm gì sau khi xem">
            <Input value={b.goal || ''} onChange={(e) => set('goal', e.target.value)} placeholder="Ví dụ: tải app dùng thử" />
          </Field>
          <Field label="Lời kêu gọi / câu kết (CTA)">
            <Input value={b.cta || ''} onChange={(e) => set('cta', e.target.value)} placeholder="Ví dụ: Dùng thử miễn phí tại agentedit.vn" />
          </Field>
        </div>
        {mode === 'auto' && (
          <Field label="Hướng dẫn cách làm video từ tin (không bắt buộc)" hint="Áp cho mọi video của dự án — ví dụ cách mở đầu, độ dài lời đọc, phong cách.">
            <TextArea rows={3} value={b.message || ''} onChange={(e) => set('message', e.target.value)} placeholder="Ví dụ: Mở đầu bằng con số đáng chú ý nhất trong bài, kết bằng câu hỏi gợi bình luận." />
          </Field>
        )}
      </Section>

      {mvd?.available && (
        <Section title="Quy trình dựng" icon={<Workflow className="h-4 w-4 text-brand-500" />}>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'motionmaxxing' as const, label: 'motionmaxxing', hint: 'Mặc định của app — motion graphics thương hiệu, chữ động, UI' },
              {
                id: 'mvd' as const,
                label: `motion-video-director${mvd.version ? ' v' + mvd.version : ''}`,
                hint: `Thử nghiệm (skill trên máy này) — ảnh AI nhân vật + đạo cụ ghép code, cắt theo nhịp nhạc${mvd.elevenlabs ? ', nhạc + SFX ElevenLabs' : ''}`
              }
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => set('engine', o.id)}
                className={cn(
                  'no-drag rounded-xl border px-3 py-2.5 text-left transition',
                  engine === o.id ? 'border-brand-400 bg-brand-500/10' : 'border-black/10 bg-white hover:border-brand-300'
                )}
              >
                <span className="block text-[13px] font-medium text-ink-900">{o.label}</span>
                <span className="block text-[11px] leading-snug text-ink-800/45">{o.hint}</span>
              </button>
            ))}
          </div>
          {engine === 'mvd' && (
            <div className="text-[11.5px] leading-relaxed text-ink-800/45">
              Ảnh nhân vật / đạo cụ của bạn (nền trắng) ở mục tư liệu bên dưới sẽ được dùng trước; thiếu thì AI tự tạo bằng Codex. Mỗi video
              mất khoảng 60–90 phút{mvd.elevenlabs ? ' và dùng khoảng 100 giây credit ElevenLabs' : ''}.
            </div>
          )}
        </Section>
      )}

      <Section title="Hình thức">
        <Field label="Khung hình">
          <div className="grid grid-cols-3 gap-2">
            {ASPECTS.map((a) => (
              <button
                key={a.id}
                onClick={() => set('aspect', a.id)}
                className={cn(
                  'no-drag flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                  b.aspect === a.id ? 'border-brand-400 bg-brand-500/10' : 'border-black/10 bg-white hover:border-brand-300'
                )}
              >
                <span
                  className={cn('shrink-0 rounded-[3px] border-2', b.aspect === a.id ? 'border-brand-500' : 'border-ink-800/30')}
                  style={a.id === '9:16' ? { width: 12, height: 21 } : a.id === '16:9' ? { width: 24, height: 14 } : { width: 18, height: 18 }}
                />
                <span>
                  <span className="block text-[13px] font-medium text-ink-900">{a.label}</span>
                  <span className="block text-[11px] text-ink-800/45">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Thời lượng" hint="Video quảng cáo hay nhất thường 15–30 giây">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={6}
                max={90}
                step={1}
                value={b.duration || 20}
                onChange={(e) => set('duration', Number(e.target.value))}
                className="no-drag flex-1 accent-brand-500"
              />
              <span className="w-16 text-right font-mono text-sm text-ink-900">{b.duration || 20} giây</span>
            </div>
          </Field>
          <Field label="Ngôn ngữ chữ trên video + lời đọc">
            <select
              value={b.language || 'vi'}
              onChange={(e) => set('language', e.target.value)}
              className="no-drag h-10 w-full rounded-xl border border-black/10 bg-ink-50 px-3 text-sm text-ink-900 outline-none focus:border-brand-400"
            >
              {LANG_OPTIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Nhận diện thương hiệu & tư liệu" icon={<Palette className="h-4 w-4 text-brand-500" />}>
        <Field label="Website (không bắt buộc)" hint="Có website thì AI tự lấy logo, màu, font, ảnh chụp sản phẩm thật từ trang.">
          <Input value={b.website || ''} onChange={(e) => set('website', e.target.value)} placeholder="https://..." />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Màu thương hiệu (không bắt buộc)">
            <Input value={b.colors || ''} onChange={(e) => set('colors', e.target.value)} placeholder="Ví dụ: #FF7A1A cam, nền trắng" />
          </Field>
          <Field label="Font thương hiệu (không bắt buộc)">
            <div className="relative">
              <Type className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-800/30" />
              <Input value={b.fonts || ''} onChange={(e) => set('fonts', e.target.value)} placeholder="Ví dụ: Be Vietnam Pro" className="pl-9" />
            </div>
          </Field>
        </div>
        <Field label="Logo, ảnh sản phẩm, ảnh chụp màn hình (không bắt buộc)" hint="Ảnh thật làm video đáng tin hơn. PNG nền trong cho logo là tốt nhất.">
          <div className="flex flex-wrap gap-3">
            {(b.assets || []).map((p) => (
              <AssetThumb key={p} path={p} onRemove={() => set('assets', (b.assets || []).filter((x) => x !== p))} />
            ))}
            <button
              onClick={addAssets}
              className="no-drag flex h-[92px] w-[92px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-400/60 text-[11.5px] font-medium text-brand-600 hover:bg-brand-50"
            >
              <ImagePlus className="h-5 w-5" /> Thêm ảnh
            </button>
          </div>
        </Field>
      </Section>

      <Section
        title="Lời đọc"
        icon={b.voice?.enabled ? <Mic className="h-4 w-4 text-brand-500" /> : <MicOff className="h-4 w-4 text-ink-800/40" />}
        right={
          <div className="inline-flex rounded-xl border border-black/10 bg-ink-50 p-1">
            {[
              { on: true, label: 'Có lời đọc' },
              { on: false, label: 'Không lời' }
            ].map((o) => (
              <button
                key={String(o.on)}
                onClick={() => set('voice', { ...b.voice, enabled: o.on })}
                className={cn(
                  'no-drag rounded-lg px-3 py-1 text-[12.5px] font-medium transition',
                  !!b.voice?.enabled === o.on ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-800/50 hover:text-ink-900'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        }
      >
        {b.voice?.enabled ? (
          <>
            <Field label="Giọng đọc (SaydiVoice)" required>
              <VoicePicker value={b.voice} onChange={(v) => set('voice', v)} language={b.language} />
            </Field>
            {mode === 'single' && (
              <Field label="Kịch bản lời đọc (không bắt buộc)" hint="Để trống thì AI tự viết theo nội dung, khớp độ dài video. Viết sẵn thì AI đọc nguyên văn.">
                <TextArea rows={3} value={b.voice.script || ''} onChange={(e) => set('voice', { ...b.voice, script: e.target.value })} placeholder="Mỗi câu một dòng…" />
              </Field>
            )}
          </>
        ) : (
          <div className="text-[12.5px] text-ink-800/50">Video không lời: AI dựng hình và chữ để xem không cần âm thanh.</div>
        )}
      </Section>

      <Section title="Ghi chú thêm cho AI (không bắt buộc)">
        <TextArea rows={2} value={b.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Ví dụ: tránh màu tím; nhấn mạnh tính năng xuất video nhanh" />
      </Section>
    </div>
  )
}
