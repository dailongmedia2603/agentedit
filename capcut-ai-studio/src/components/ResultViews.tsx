import { Badge } from '@/components/ui/primitives'
import { fmtTime, cn } from '@/lib/utils'
import { CheckCircle2, AlertTriangle, Wrench } from 'lucide-react'

/** Mot dong "tinh trang" doc duoc: bieu tuong + cau noi ro nguoi dung phai lam gi */
function StatusLine({
  tone,
  title,
  detail
}: {
  tone: 'ok' | 'auto' | 'todo'
  title: string
  detail?: string
}) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'auto' ? Wrench : AlertTriangle
  const color =
    tone === 'ok' ? 'text-emerald-600' : tone === 'auto' ? 'text-sky-600' : 'text-amber-600'
  const bg =
    tone === 'ok'
      ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
      : tone === 'auto'
        ? 'border-sky-500/25 bg-sky-500/[0.06]'
        : 'border-amber-500/30 bg-amber-500/[0.07]'
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5', bg)}>
      <Icon className={cn('mt-0.5 h-[17px] w-[17px] shrink-0', color)} />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink-900">{title}</div>
        {detail && <div className="mt-0.5 text-[12px] leading-relaxed text-ink-800/60">{detail}</div>}
      </div>
    </div>
  )
}

const SEV_TONE = (s: string) => (s === 'high' ? 'fail' : s === 'medium' ? 'warn' : 'neutral')

/** Danh sach loi cua lop kiem tra; 'da_sua' = gach ngang (may da tu sua xong) */
function IssueList({ items, status }: { items?: GuardIssue[]; status?: 'da_sua' }) {
  if (!items?.length) return null
  const nhan = status === 'da_sua' ? { cls: 'text-emerald-600 line-through decoration-emerald-600/30' } : null
  return (
    <ul className="space-y-1.5">
      {items.map((iss, i) => (
        <li key={i} className="flex gap-2 text-xs">
          <Badge tone={SEV_TONE(iss.severity)}>{iss.area}</Badge>
          <span className={cn('leading-relaxed', nhan?.cls || 'text-ink-800/65')}>{iss.problem}</span>
        </li>
      ))}
    </ul>
  )
}

export function BriefView({ brief }: { brief: Brief }) {
  return (
    <div className="space-y-3 text-sm">
      {brief.summary && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-800/40">Tóm tắt</div>
          <p className="text-ink-800/75">{brief.summary}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        {brief.duration ? <Badge tone="neutral">⏱ {fmtTime(brief.duration)}</Badge> : null}
        {brief.language ? <Badge tone="neutral">🗣 {brief.language}</Badge> : null}
        {brief.faces_region ? <Badge tone="neutral">😀 {brief.faces_region}</Badge> : null}
      </div>
      {brief.hook_strength && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-800/40">Hook 3s</div>
          <p className="text-ink-800/70">{brief.hook_strength}</p>
        </div>
      )}
      {!!brief.beats?.length && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-800/40">
            Beat cảm xúc ({brief.beats.length})
          </div>
          <div className="space-y-1.5">
            {brief.beats.map((b, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-black/6 bg-ink-50 px-2.5 py-1.5">
                <Badge tone="brand">{b.label}</Badge>
                <span className="text-xs text-ink-800/45">
                  {fmtTime(b.start)}–{fmtTime(b.end)}
                </span>
                <span className="flex-1 text-xs text-ink-800/70">{b.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!!brief.transcript?.length && (
        <div className="text-xs text-ink-800/45">
          Transcript: {brief.transcript.length} cụm câu (đã có timestamp)
        </div>
      )}
      {!!brief.warnings?.length && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-50 p-2 text-xs text-amber-800">
          ⚠ {brief.warnings.join(' · ')}
        </div>
      )}
    </div>
  )
}

export function SourceBriefView({ brief }: { brief: SourceBrief }) {
  if (!brief.sources?.length) return <BriefView brief={brief} />
  return (
    <div className="space-y-3 text-sm">
      {brief.summary && <p className="text-ink-800/75">{brief.summary}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="brand">{brief.sources.length} video nguồn</Badge>
        {brief.total_source_duration ? <Badge tone="neutral">{fmtTime(brief.total_source_duration)} tổng</Badge> : null}
        {brief.language ? <Badge tone="neutral">{brief.language}</Badge> : null}
      </div>
      <div className="space-y-2">
        {brief.sources.map((source) => (
          <div key={source.id} className="rounded-xl border border-black/6 bg-ink-50 p-3">
            <div className="flex items-center gap-2">
              <Badge tone="brand">{source.id}</Badge>
              <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{source.name}</span>
              {source.duration ? <span className="text-xs text-ink-800/45">{fmtTime(source.duration)}</span> : null}
            </div>
            {source.summary && <p className="mt-1.5 text-xs text-ink-800/65">{source.summary}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {source.role && <Badge tone="neutral">{source.role}</Badge>}
              {!!source.transcript?.length && <Badge tone="neutral">{source.transcript.length} câu</Badge>}
              {!!source.usable_ranges?.length && <Badge tone="ok">{source.usable_ranges.length} đoạn nên dùng</Badge>}
              {source.timing?.method === 'asr-align' && (
                <Badge
                  tone="ok"
                  title={`Gemini ghi giờ câu lệch lời nói thật trung vị ${source.timing.median_shift ?? 0}s (lớn nhất ${source.timing.max_shift ?? 0}s) — đã sửa theo Whisper`}
                >
                  giờ lời nói đã căn (Whisper, khớp {Math.round((source.timing.matched ?? 0) * 100)}%)
                </Badge>
              )}
              {source.timing?.method === 'gemini' && (
                <Badge tone="warn" title={source.timing.ly_do}>
                  giờ theo Gemini — có thể lệch 1-2s
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
      {!!brief.story_opportunities?.length && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-800/40">Hướng ghép nội dung</div>
          <ul className="list-disc pl-5 text-xs text-ink-800/70">
            {brief.story_opportunities.slice(0, 6).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Video mau co 2 doi schema: ban cu tra chuoi, ban moi tra object ({rule, how...}).
 *  React se crash neu render thang object -> luon ep ve chuoi truoc khi hien. */
function refText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(refText).filter(Boolean).join(', ')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['rule', 'pattern', 'issue', 'look', 'type', 'description']) {
      if (typeof o[k] === 'string' && o[k]) return o[k] as string
    }
    return Object.values(o).map(refText).filter(Boolean).join(' · ')
  }
  return ''
}

export function ReferenceAnalysisView({ analysis }: { analysis: ReferenceAnalysis }) {
  const fingerprint = (analysis.style_fingerprint || []).map(refText).filter(Boolean)
  const rules = (analysis.transfer_rules || []).map(refText).filter(Boolean)
  const shotSeconds = Number(analysis.pacing?.average_shot_seconds) || 0
  return (
    <div className="space-y-3 text-sm">
      {analysis.summary && <p className="text-ink-800/75">{refText(analysis.summary)}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        {analysis.format && <Badge tone="brand">{refText(analysis.format)}</Badge>}
        {analysis.pacing?.energy && <Badge tone="neutral">năng lượng {refText(analysis.pacing.energy)}</Badge>}
        {shotSeconds ? <Badge tone="neutral">~{shotSeconds}s/cảnh</Badge> : null}
      </div>
      {!!fingerprint.length && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-800/40">Dấu ấn phong cách</div>
          <ul className="list-disc pl-5 text-xs text-ink-800/70">
            {fingerprint.slice(0, 8).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
      {analysis.pacing?.rhythm_pattern && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-800/40">Nhịp dựng</div>
          <p className="text-xs text-ink-800/70">{refText(analysis.pacing.rhythm_pattern)}</p>
        </div>
      )}
      {!!rules.length && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-800/40">Nguyên tắc áp dụng</div>
          <ul className="list-disc pl-5 text-xs text-ink-800/70">
            {rules.slice(0, 8).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}
      {analysis.captions && (
        <div className="rounded-xl border border-black/6 bg-ink-50 p-3 text-xs text-ink-800/65">
          Caption: {refText(analysis.captions.density) || 'không rõ'} ·{' '}
          {refText(analysis.captions.words_per_chunk) || 'không rõ'} ·{' '}
          {refText(analysis.captions.position) || 'không rõ vị trí'}
        </div>
      )}
    </div>
  )
}

/**
 * Bao cao cua lop kiem tra VAT LY khi dung ban Remotion (remotion_plan.build_spec + plan_guard).
 * Luat deterministic, khong goi AI: gio nguon -> timeline, hook, meme cat vao, SFX, chu tranh meme.
 */
export function GuardView({ guard }: { guard: GuardReport }) {
  const before = guard.issues_before || []
  const high = before.filter((i) => i.severity === 'high')
  const fixed = guard.fixed || []
  const left = guard.issues || []
  const conNang = left.filter((i) => i.severity === 'high')

  return (
    <div className="space-y-3.5 text-sm">
      {/* Ket luan mot dong: co phai lam gi khong */}
      {left.length === 0 ? (
        <StatusLine
          tone="ok"
          title="Xong — không còn gì phải sửa"
          detail={
            fixed.length
              ? `Máy tự sửa ${fixed.length} chỗ và kiểm lại: mốc thời gian nằm trong timeline, hook, meme, SFX, chữ không đè meme.`
              : 'Kế hoạch qua hết các kiểm tra vật lý ngay từ đầu.'
          }
        />
      ) : (
        <StatusLine
          tone="todo"
          title={
            conNang.length
              ? `Còn ${conNang.length} lỗi NẶNG máy không tự sửa được`
              : `Còn ${left.length} chỗ máy không tự sửa được`
          }
          detail="Đây là việc cần bạn để mắt khi xem bản xem trước — máy đã cố nhưng không quyết thay bạn được. Xem mục “Việc còn lại” bên dưới."
        />
      )}

      {/* Da tu sua — khong can lo */}
      {(!!fixed.length || !!high.length) && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-sky-700">
            <Wrench className="h-3.5 w-3.5" />
            MÁY ĐÃ TỰ SỬA — không cần bạn làm gì
          </div>
          {!!high.length && (
            <div className="mb-2 rounded-lg border border-black/6 bg-ink-50/60 px-3 py-2">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-ink-800/40">
                AI đã mắc {high.length} lỗi nặng, tất cả đã được sửa xong
              </div>
              <IssueList items={high.slice(0, 6)} status="da_sua" />
              {high.length > 6 && (
                <div className="mt-1 text-[11px] text-ink-800/35">… và {high.length - 6} lỗi tương tự</div>
              )}
            </div>
          )}
          {!!fixed.length && (
            <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-ink-800/50">
              {fixed.slice(0, 10).map((f, i) => (
                <li key={i}>• {f}</li>
              ))}
              {fixed.length > 10 && (
                <li className="text-ink-800/35">… và {fixed.length - 10} chỗ nữa</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Con lai — viec cua nguoi dung */}
      {!!left.length && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            VIỆC CÒN LẠI — máy không tự quyết được
          </div>
          <IssueList items={left.slice(0, 8)} />
          {left.length > 8 && (
            <div className="mt-1 text-[11px] text-ink-800/35">… và {left.length - 8} chỗ nữa</div>
          )}
        </div>
      )}
    </div>
  )
}
