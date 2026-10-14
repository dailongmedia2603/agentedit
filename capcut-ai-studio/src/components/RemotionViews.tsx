import { useMemo } from 'react'
import { Player } from '@remotion/player'
import { Badge } from '@/components/ui/primitives'
import { AutoEdit } from '../../remotion-src/AutoEdit'
import type { RenderSpec, RSLayer } from '../../remotion-src/types'
import { fmtTime } from '@/lib/utils'

/** Xem truoc NGAY trong app bang chinh composition se render (Remotion Player). */
export function RemotionPreview({ spec, mediaBase }: { spec: RenderSpec; mediaBase: string }) {
  const inputProps = useMemo(() => ({ spec: { ...spec, mediaBase } }), [spec, mediaBase])
  const fps = spec.fps || 30
  return (
    <Player
      component={AutoEdit}
      inputProps={inputProps}
      durationInFrames={Math.max(1, Math.round((spec.duration || 1) * fps))}
      fps={fps}
      compositionWidth={spec.width || 1080}
      compositionHeight={spec.height || 1920}
      controls
      clickToPlay
      showVolumeControls
      allowFullscreen
      numberOfSharedAudioTags={10}
      acknowledgeRemotionLicense
      style={{
        width: '100%',
        aspectRatio: `${spec.width || 1080} / ${spec.height || 1920}`,
        borderRadius: 16,
        overflow: 'hidden',
        background: '#000'
      }}
    />
  )
}

function label(catalog: RemotionCatalog | null, kind: keyof RemotionCatalog, id?: string) {
  if (!id) return ''
  const list = (catalog?.[kind] || []) as RemotionCatalogItem[]
  return list.find((x) => x.id === id)?.label || id
}

/** Tom tat ke hoach Remotion: bo cuc timeline, chu, hieu ung, am thanh. */
const LAYOUT_LABEL: Record<string, string> = {
  full: 'Toàn khung',
  split: 'Chia đôi (B-roll trên)',
  card: 'Thẻ bo góc',
  circle: 'Khung tròn',
  broll: 'B-roll toàn khung',
  graphic: 'Cảnh đồ hoạ'
}

const LAYER_TYPE_LABEL: Record<string, string> = {
  box: 'khối màu',
  circle: 'hình tròn',
  ring: 'vòng tự vẽ',
  line: 'đường kẻ',
  arrow: 'mũi tên',
  image: 'ảnh',
  emoji: 'emoji',
  badge: 'huy hiệu',
  counter: 'số chạy',
  progress: 'thanh tiến độ',
  speedlines: 'vệt tốc độ'
}

function layerLabel(L: RSLayer): string {
  const text = (L.spans || []).map((sp) => sp.text).join(' ').trim()
  if (L.type === 'text') return text ? `“${text.length > 36 ? text.slice(0, 34) + '…' : text}”` : 'chữ'
  if (L.type === 'badge') return `huy hiệu ${[L.label, L.value].filter(Boolean).join(' ')}`
  if (L.type === 'counter') return `số chạy → ${L.prefix || ''}${L.to ?? ''}${L.suffix || ''}`
  return LAYER_TYPE_LABEL[L.type] || L.type
}

const SOUND_WORLD_LABEL: Record<string, string> = {
  am_ap: 'Ấm áp',
  cong_nghe: 'Công nghệ',
  dien_anh: 'Điện ảnh',
  vui_nhon: 'Vui nhộn',
  toi_gian: 'Tối giản'
}

const BEAT_ROLE_LABEL: Record<string, string> = {
  hook: 'Hook',
  mo: 'Mở',
  dan: 'Dẫn',
  day_len: 'Dâng lên',
  cao_trao: 'Cao trào',
  lang: 'Lắng',
  xoay: 'Xoay chuyển',
  chot: 'Chốt',
  cta: 'Kêu gọi'
}

const REVIEW_SCORE_LABEL: Record<string, string> = {
  dung_chu_de: 'Đúng chủ đề',
  khac_biet: 'Khác biệt',
  cam_xuc: 'Cảm xúc'
}

/** Ban chi dao cua dao dien (director.py) + ket qua buoc duyet. */
function DirectorView({ cd, review }: { cd: DirectorTreatment; review?: DirectorReview | null }) {
  const am = cd.am_thanh
  return (
    <div className="space-y-2.5 rounded-xl border border-violet-300/40 bg-violet-50/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-violet-800">Chỉ đạo của đạo diễn</span>
        <Badge tone="neutral">Cường độ {cd.cuong_do}/5</Badge>
        {am?.the_gioi && <Badge tone="neutral">Âm thanh: {SOUND_WORLD_LABEL[am.the_gioi] || am.the_gioi}</Badge>}
        {cd.hook?.muc_do && <Badge tone="neutral">Hook {cd.hook.muc_do}</Badge>}
      </div>
      {cd.y_tuong_lon && <p className="text-[13px] font-medium leading-relaxed text-ink-900">{cd.y_tuong_lon}</p>}
      <div className="space-y-1 text-xs leading-relaxed text-ink-800/70">
        {cd.chu_de_that && (
          <div>
            <b className="text-ink-800/85">Chủ đề thật:</b> {cd.chu_de_that}
            {cd.dieu_dong_lai ? ` — đọng lại: ${cd.dieu_dong_lai}` : ''}
          </div>
        )}
        {cd.the_gioi_hinh && (
          <div>
            <b className="text-ink-800/85">Thế giới hình:</b> {cd.the_gioi_hinh}
          </div>
        )}
        {!!cd.mo_tip?.length && (
          <div>
            <b className="text-ink-800/85">Mô-típ:</b> {cd.mo_tip.map((m) => `${m.ten} — ${m.mo_ta}`).join(' · ')}
          </div>
        )}
        {cd.hook?.cach_mo && (
          <div>
            <b className="text-ink-800/85">Mở hook:</b> {cd.hook.cach_mo}
          </div>
        )}
        {am && (am.nhac || am.ly_do) && (
          <div>
            <b className="text-ink-800/85">Âm thanh:</b> {[am.ly_do, am.nhac].filter(Boolean).join(' · ')}
            {am.nhac_tat?.loi_noi ? ` · tắt nhạc ${am.nhac_tat.khi === 'truoc' ? 'trước' : 'sau'} “${am.nhac_tat.loi_noi}”` : ''}
          </div>
        )}
      </div>
      {!!cd.nhip?.length && (
        <div className="space-y-1">
          {cd.nhip.map((b, i) => (
            <div key={i} className="flex gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs leading-relaxed">
              <div className="w-20 shrink-0 text-ink-800/50">
                {b.timeline_tu != null ? fmtTime(b.timeline_tu) : ''}–{b.timeline_den != null ? fmtTime(b.timeline_den) : ''}
                <div className="mt-0.5 flex gap-0.5" title={`Năng lượng ${b.nang_luong}/5`}>
                  {[1, 2, 3, 4, 5].map((k) => (
                    <span key={k} className={`h-1.5 w-2.5 rounded-sm ${k <= b.nang_luong ? 'bg-violet-500' : 'bg-black/10'}`} />
                  ))}
                </div>
              </div>
              <div className="min-w-0 text-ink-800/70">
                <b className="text-ink-900">{BEAT_ROLE_LABEL[b.vai_tro] || b.vai_tro}</b>
                {b.cam_xuc ? ` · ${b.cam_xuc}` : ''}
                {b.hinh && <div>{b.hinh}</div>}
                {b.tiet_che && <div className="text-ink-800/45">Tiết chế: {b.tiet_che}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!!cd.khoanh_khac_dau_an?.length && (
        <div className="text-xs leading-relaxed text-ink-800/70">
          <b className="text-ink-800/85">Khoảnh khắc dấu ấn:</b>{' '}
          {cd.khoanh_khac_dau_an.map((k) => `“${k.loi_noi}” — ${k.y_tuong}`).join(' · ')}
        </div>
      )}
      {!!cd.khoang_lang?.length && (
        <div className="text-xs leading-relaxed text-ink-800/70">
          <b className="text-ink-800/85">Khoảng lặng:</b> {cd.khoang_lang.map((k) => `“${k.loi_noi}”`).join(' · ')}
        </div>
      )}
      {!!cd.cam?.length && (
        <div className="text-xs leading-relaxed text-ink-800/55">
          <b className="text-ink-800/75">Không dùng:</b> {cd.cam.join(' · ')}
        </div>
      )}
      {review && (review.nhan_xet || review.thay_doi?.length) && (
        <div className="rounded-lg bg-white/70 px-2.5 py-2 text-xs leading-relaxed text-ink-800/70">
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <b className="text-ink-900">Đạo diễn duyệt bản dựng</b>
            {Object.entries(review.diem || {}).map(([k, v]) => (
              <Badge key={k} tone="neutral">
                {REVIEW_SCORE_LABEL[k] || k} {v}/10
              </Badge>
            ))}
          </div>
          {review.nhan_xet && <div>{review.nhan_xet}</div>}
          {!!review.thay_doi?.length && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-800/55">
              {review.thay_doi.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function RemotionPlanView({
  plan,
  spec,
  catalog
}: {
  plan: RemotionPlan
  spec: RenderSpec | null
  catalog: RemotionCatalog | null
}) {
  const pipe = plan._pipeline || {}
  const theme = (plan.caption_theme || {}) as Record<string, string | boolean>
  const clips = spec?.clips || []
  const hook = clips.find((c) => c.kind === 'hook')
  const memes = clips.filter((c) => c.kind === 'insert').length + (spec?.overlays.length || 0)
  // hieu ung tu viet (kem boi canh / muc tieu / ly do) de nguoi dung soat dung ngu canh
  const fxList = ((plan as { fx?: unknown }).fx as
    | { id: string; kind?: string; layer?: string; src_start?: number; src_end?: number; context?: string; goal?: string; why_fit?: string; visual?: string }[]
    | undefined) || []
  // tu lieu cua nguoi dung: hien o dau (gio timeline) — sidecar user_media.usage_report
  const tuLieu = (pipe.tu_lieu as UserMediaUsage[] | undefined) || []
  return (
    <div className="space-y-3 text-sm">
      {plan.chi_dao && <DirectorView cd={plan.chi_dao} review={pipe.dao_dien_duyet as DirectorReview | null | undefined} />}
      {(pipe.story_arc || pipe.tone) && (
        <p className="text-ink-800/75">
          {pipe.story_arc && <span>{String(pipe.story_arc)}</span>}
          {pipe.tone && <span className="text-ink-800/45"> · giọng {String(pipe.tone)}</span>}
        </p>
      )}
      <div className="grid grid-cols-4 gap-2.5 lg:grid-cols-8">
        {[
          ['Độ dài', spec ? fmtTime(spec.duration) : '—'],
          ['Đoạn cắt', clips.filter((c) => c.kind === 'body').length],
          ['Caption', spec?.captions.length ?? plan.captions?.length ?? 0],
          ['Hiệu ứng', (spec?.effects.length ?? 0) + (spec?.fx?.length ?? 0) + (spec?.fxTransforms?.length ?? 0)],
          ['SFX', spec?.audio.filter((a) => a.role !== 'bgm').length ?? 0],
          ['Meme', memes],
          ['Bố cục', spec?.scenes?.length ?? 0],
          ['Lớp đồ hoạ', spec?.layers?.length ?? 0]
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border border-black/6 bg-ink-50 p-2.5 text-center">
            <div className="text-lg font-bold text-ink-900">{v as string | number}</div>
            <div className="text-[11px] text-ink-800/45">{k as string}</div>
          </div>
        ))}
      </div>
      {!!tuLieu.length && (
        <div className="space-y-1 rounded-xl border border-black/6 bg-ink-50 p-3">
          <div className="text-xs font-semibold text-ink-900">Tư liệu của bạn ({tuLieu.filter((u) => u.dung.length).length}/{tuLieu.length} đã hiện)</div>
          {tuLieu.map((u) => (
            <div key={u.id} className="text-xs leading-relaxed text-ink-800/65">
              <b className="text-ink-800/85">{u.name}</b>:{' '}
              {u.dung.length
                ? u.dung.map((d) => `${fmtTime(d.start)}–${fmtTime(d.end)} ${d.cach}`).join(' · ')
                : u.use === 'ai_ref'
                  ? 'chỉ làm mẫu ảnh AI'
                  : `chưa chèn${u.bo_qua ? ` (${u.bo_qua})` : ''}`}
              {u.anh_ai_dung_mau ? ` · làm mẫu cho ${u.anh_ai_dung_mau} ảnh AI` : ''}
              {u.du_phong ? ' · hệ thống tự đặt theo lời nói khớp' : ''}
            </div>
          ))}
        </div>
      )}
      {!!fxList.length && (
        <div className="space-y-1.5 rounded-xl border border-brand-400/25 bg-brand-50/50 p-3">
          <div className="text-xs font-semibold text-brand-700">
            {fxList.length} hiệu ứng AI tự thiết kế theo bối cảnh
          </div>
          {fxList.map((e) => (
            <div key={e.id} className="rounded-lg bg-white/70 px-2.5 py-2 text-xs leading-relaxed text-ink-800/70">
              <div className="font-medium text-ink-900">
                {e.id} · {e.kind === 'transform' ? 'tác động khung video' : e.layer === 'behind' ? 'lớp sau người' : 'lớp phủ'} ·{' '}
                {Number(e.src_start).toFixed(1)}–{Number(e.src_end).toFixed(1)}s (giờ nguồn)
              </div>
              <div>
                <b className="text-ink-800/80">Bối cảnh:</b> {e.context}
              </div>
              <div>
                <b className="text-ink-800/80">Mục tiêu:</b> {e.goal}
              </div>
              <div>
                <b className="text-ink-800/80">Vì sao hợp:</b> {e.why_fit}
              </div>
              <div className="text-ink-800/50">
                <b className="text-ink-800/70">Hình ảnh:</b> {e.visual}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {hook && (
          <Badge tone="brand">
            Hook {fmtTime(hook.end - hook.start)} → {label(catalog, 'transitions', hook.transitionOut?.type) || 'cắt'}
          </Badge>
        )}
        {spec?.grade && spec.grade.preset !== 'none' && (
          <Badge tone="neutral">
            Màu: {label(catalog, 'grades', spec.grade.preset)} {Math.round((spec.grade.intensity || 0) * 100)}%
          </Badge>
        )}
        {theme.style_body && <Badge tone="neutral">Phụ đề: {label(catalog, 'caption_styles', String(theme.style_body))}</Badge>}
        {theme.style_hero && <Badge tone="neutral">Chữ nhấn: {label(catalog, 'caption_styles', String(theme.style_hero))}</Badge>}
        {theme.font_body && <Badge tone="neutral">Font: {label(catalog, 'fonts', String(theme.font_body))}</Badge>}
        {theme.font_hero && theme.font_hero !== theme.font_body && (
          <Badge tone="neutral">Font nhấn: {label(catalog, 'fonts', String(theme.font_hero))}</Badge>
        )}
      </div>
      {!!(spec?.scenes?.length || spec?.layers?.length) && (
        <div className="rounded-xl border border-black/6 bg-ink-50 p-3">
          <div className="mb-1.5 text-xs uppercase tracking-wider text-ink-800/40">Thiết kế chuyển động</div>
          {!!(plan as { concept?: string }).concept && (
            <p className="mb-2 text-[12px] leading-relaxed text-ink-800/70">{(plan as { concept?: string }).concept}</p>
          )}
          {!!spec?.scenes?.length && (
            <div className="mb-2 flex flex-wrap gap-1.5 text-xs text-ink-800/70">
              {spec.scenes.map((sc) => (
                <span key={sc.id} className="rounded-md bg-black/5 px-2 py-0.5">
                  {fmtTime(sc.start)}–{fmtTime(sc.end)} · {LAYOUT_LABEL[sc.layout] || sc.layout}
                  {sc.popout ? ' · đầu trồi khỏi khung' : ''}
                </span>
              ))}
            </div>
          )}
          {!!spec?.layers?.length && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {spec.layers.map((L) => (
                <span
                  key={L.id}
                  title={`${fmtTime(L.start)} → ${fmtTime(L.end)}${L.enter?.preset ? ' · vào: ' + L.enter.preset : ''}`}
                  className="rounded-md bg-white px-2 py-0.5 text-ink-800/80 ring-1 ring-black/5"
                >
                  {fmtTime(L.start)} · {layerLabel(L)}
                  {L.behind ? ' · sau người' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {clips.some((c) => c.transitionOut) && (
        <div className="rounded-xl border border-black/6 bg-ink-50 p-3">
          <div className="mb-1.5 text-xs uppercase tracking-wider text-ink-800/40">Chuyển cảnh</div>
          <div className="flex flex-wrap gap-1.5 text-xs text-ink-800/70">
            {clips
              .filter((c) => c.transitionOut)
              .map((c) => (
                <span key={c.id} className="rounded-md bg-black/5 px-2 py-0.5">
                  {fmtTime(c.end)} · {label(catalog, 'transitions', c.transitionOut!.type)}
                </span>
              ))}
          </div>
        </div>
      )}
      {!!spec?.effects.length && (
        <div className="rounded-xl border border-black/6 bg-ink-50 p-3">
          <div className="mb-1.5 text-xs uppercase tracking-wider text-ink-800/40">Hiệu ứng</div>
          <div className="flex flex-wrap gap-1.5 text-xs text-ink-800/70">
            {spec.effects.map((e) => (
              <span key={e.id} className="rounded-md bg-black/5 px-2 py-0.5">
                {fmtTime(e.start)} · {label(catalog, 'effects', e.type)}
                {e.params?.emoji ? ` ${e.params.emoji}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      {!!spec?.captions.length && (
        <div className="rounded-xl border border-black/6 bg-ink-50 p-3">
          <div className="mb-2 text-xs uppercase tracking-wider text-ink-800/40">Caption (theo thứ tự hiện)</div>
          <div className="flex flex-wrap gap-1.5">
            {spec.captions.slice(0, 40).map((c) => (
              <span
                key={c.id}
                title={`${fmtTime(c.start)} → ${fmtTime(c.end)} · ${label(catalog, 'caption_styles', c.style)}`}
                className="rounded-md px-2 py-1 text-xs font-medium"
                style={
                  c.role === 'hero'
                    ? { background: c.accent, color: '#111' }
                    : { background: 'rgba(0,0,0,0.05)', color: '#1a1c22' }
                }
              >
                {c.uppercase ? c.text.toLocaleUpperCase('vi') : c.text}
              </span>
            ))}
            {spec.captions.length > 40 && (
              <span className="text-xs text-ink-800/40">… và {spec.captions.length - 40} caption nữa</span>
            )}
          </div>
        </div>
      )}
      {!!spec?.audio.some((a) => a.role !== 'bgm') && (
        <div className="text-xs text-ink-800/55">
          SFX:{' '}
          {spec.audio
            .filter((a) => a.role !== 'bgm')
            .map((a) => `${a.name || 'sfx'} @${fmtTime(a.start)}`)
            .join(' · ')}
        </div>
      )}
      {(() => {
        const bgm = spec?.audio.filter((a) => a.role === 'bgm') || []
        const m = plan.music
        if (!bgm.length && !m) return null
        return (
          <div className="text-xs text-ink-800/55">
            Nhạc nền:{' '}
            {bgm.length
              ? `${bgm[0].name} từ ${fmtTime(bgm[0].start)} (sau hook)${
                  bgm[0].rel != null ? ` · ${bgm[0].rel.toFixed(1)} dB so với giọng nói` : ''
                }${bgm.length > 1 ? ` · nối bài ${bgm.length - 1} lần` : ''}`
              : 'không dùng'}
            {m?.ly_do ? ` — ${m.ly_do}` : ''}
          </div>
        )
      })()}
    </div>
  )
}

/** Phan rieng cua ban GPT: so do bang may + goi y Remotion. */
export function RemotionReferenceExtra({
  analysis,
  catalog
}: {
  analysis: RemotionReferenceAnalysis
  catalog: RemotionCatalog | null
}) {
  const m = analysis._measured
  const h = analysis.remotion_hints
  if (!m && !h) return null
  return (
    <div className="mt-3 space-y-2 text-xs">
      {m && (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="neutral">đo bằng máy</Badge>
          {m.so_lan_cat_canh !== undefined && <Badge tone="neutral">{m.so_lan_cat_canh} lần cắt</Badge>}
          {m.giay_moi_shot_tb !== undefined && <Badge tone="neutral">~{m.giay_moi_shot_tb}s/shot</Badge>}
          {m.kich_thuoc && <Badge tone="neutral">{m.kich_thuoc}</Badge>}
          {analysis._media && (
            <Badge tone="neutral">
              Gemini xem video {analysis._media.video_mb} MB + {analysis._media.strips} dải khung
            </Badge>
          )}
          {analysis._frames && <Badge tone="neutral">GPT xem {analysis._frames.frames} khung (bản cũ)</Badge>}
        </div>
      )}
      {h && (
        <div className="rounded-xl border border-brand-500/20 bg-brand-50/50 p-3 text-ink-800/70">
          <div className="mb-1 font-medium text-ink-900">Gợi ý cho bản dựng Remotion</div>
          <div className="flex flex-wrap gap-1.5">
            {h.caption_style_body && <Badge tone="brand">Phụ đề: {label(catalog, 'caption_styles', h.caption_style_body)}</Badge>}
            {h.caption_style_hero && <Badge tone="brand">Chữ nhấn: {label(catalog, 'caption_styles', h.caption_style_hero)}</Badge>}
            {h.font_body && <Badge tone="neutral">Font: {label(catalog, 'fonts', h.font_body)}</Badge>}
            {h.grade && <Badge tone="neutral">Màu: {label(catalog, 'grades', h.grade)}</Badge>}
            {(h.transitions || []).slice(0, 4).map((t) => (
              <Badge key={t} tone="neutral">
                {label(catalog, 'transitions', t)}
              </Badge>
            ))}
            {(h.accent_colors || []).slice(0, 3).map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5">
                <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: c }} />
                {c}
              </span>
            ))}
          </div>
          {h.notes && <p className="mt-1.5">{h.notes}</p>}
        </div>
      )}
    </div>
  )
}

/** AI da lap plan nay (sidecar ghi van tay vao _pipeline.ai, vd "claude|sub|claude-opus-5"); plan cu = GPT */
export function planAiName(plan?: RemotionPlan | null): string {
  const ai = plan?._pipeline?.ai
  return typeof ai === 'string' && ai.startsWith('claude') ? 'Claude' : 'GPT'
}

export function fmtBytes(n?: number): string {
  if (!n) return ''
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`
  return `${Math.round(n / 1e3)} KB`
}
