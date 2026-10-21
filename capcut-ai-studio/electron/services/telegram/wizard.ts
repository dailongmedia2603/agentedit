// BOT TELEGRAM — BANG HOI TUNG BUOC (2026-10-21). Chi du lieu + cau hoi + nut bam (khong goi mang) -> bot.ts dung.
//
// EDIT VIDEO (giong form Edit Video tren app, dung thu tu user yeu cau):
//   source (video nguon / chon tu thu vien) -> reference (video mau, bo qua duoc) -> purpose (video nay lam gi) ->
//   style (phong cach) -> audience (khach hang) -> duration (do dai, bo qua duoc) -> font (chon trong kho / tai file len,
//   bo qua duoc) -> colors (mau, bo qua duoc) -> inserts (tu lieu: tai len xong hoi MO TA tung tep) -> tao video.
// TAO VIDEO (giong form Tao video): ten -> loai -> noi dung -> website -> nguoi xem -> khung hinh -> do dai -> loi doc ->
//   mau -> font -> anh tu lieu (+ mo ta) -> ghi chu -> tao video.
import { VIDEO_TYPES } from '../motion/prompt'
import type { InlineKeyboard } from './api'

export type Flow = 'edit' | 'motion'

export type EditStep = 'source' | 'reference' | 'purpose' | 'style' | 'audience' | 'duration' | 'font' | 'colors' | 'inserts'
export type MotionStep =
  | 'm_name' | 'm_type' | 'm_message' | 'm_website' | 'm_audience' | 'm_aspect' | 'm_duration' | 'm_voice'
  | 'm_colors' | 'm_fonts' | 'm_assets' | 'm_notes'
export type Step = EditStep | MotionStep

export const EDIT_STEPS: EditStep[] = ['source', 'reference', 'purpose', 'style', 'audience', 'duration', 'font', 'colors', 'inserts']
export const MOTION_STEPS: MotionStep[] = ['m_name', 'm_type', 'm_message', 'm_website', 'm_audience', 'm_aspect', 'm_duration', 'm_voice', 'm_colors', 'm_fonts', 'm_assets', 'm_notes']

export interface UpFile {
  path: string
  name: string
  size: number
  kind: 'video' | 'image' | 'font'
  duration?: number
  /** tin nhan chua file (tra loi vao do khi hoi mo ta) */
  msgId?: number
  /** mo ta (tu lieu): undefined = chua hoi xong; '' = bo qua */
  note?: string
  /** chon tu thu vien (khong phai file tai len) */
  fromLibrary?: boolean
}

/** Danh sach dang hien de chon (thu vien / font / giong) — nut bam chi mang so thu tu (callback_data <= 64 byte) */
export interface PickList {
  kind: 'lib-source' | 'lib-ref' | 'font' | 'voice'
  items: { label: string; value: string; extra?: number }[]
  page: number
  msgId?: number
}

export interface Session {
  /** ma ngan cua bang hoi (nut cua bang hoi cu bam lai -> bo qua) */
  sid: string
  flow: Flow
  step: Step
  createdAt: number
  updatedAt: number
  // ---- Edit video ----
  videos: UpFile[]
  reference?: UpFile | null
  purpose?: string
  style?: string
  audience?: string
  duration?: string
  /** font chon trong kho (id, ten) */
  fonts: { id: string; name: string }[]
  /** file font gui len */
  fontFiles: UpFile[]
  /** ten / mo ta font nguoi dung go (Brand Guideline "Kieu chu") */
  typography?: string
  colors?: string
  inserts: UpFile[]
  /** cau hoi vua gui (tranh hoi trung khi gom file) */
  asked?: string
  // ---- Tao video ----
  m: {
    name?: string
    videoType?: string
    message?: string
    website?: string
    audience?: string
    aspect?: '9:16' | '16:9' | '1:1'
    duration?: number
    voice?: { enabled: boolean; voiceId?: string; voiceName?: string }
    colors?: string
    fonts?: string
    assets: UpFile[]
    notes?: string
  }
  pick?: PickList
}

export function newSession(flow: Flow, sid: string): Session {
  const now = Date.now()
  return {
    sid,
    flow,
    step: flow === 'edit' ? 'source' : 'm_name',
    createdAt: now,
    updatedAt: now,
    videos: [],
    reference: null,
    fonts: [],
    fontFiles: [],
    inserts: [],
    m: { assets: [] }
  }
}

export const MAX_SOURCES = 6
export const MAX_INSERTS = 12
export const MAX_ASSETS = 10
export const MAX_FONTS = 3

/** Buoc tiep theo trong luong (null = het cau hoi -> tao video) */
export function nextStep(s: Session): Step | null {
  const list: Step[] = s.flow === 'edit' ? EDIT_STEPS : MOTION_STEPS
  const i = list.indexOf(s.step)
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null
}

/** "Buoc 3/9" */
export function stepNo(s: Session): string {
  const list: Step[] = s.flow === 'edit' ? EDIT_STEPS : MOTION_STEPS
  return `${list.indexOf(s.step) + 1}/${list.length}`
}

/** Tu lieu / anh dau tien chua co mo ta (dang cho nguoi dung go) */
export function pendingNote(s: Session): UpFile | undefined {
  const arr = s.flow === 'edit' ? s.inserts : s.m.assets
  return arr.find((f) => f.note === undefined)
}

// ---------------------------------------------------------------------------
// Nut bam: "<sid>|<buoc>|<viec>" — bam nut cua bang hoi cu / buoc cu -> bot bao "da cu"
// ---------------------------------------------------------------------------
export const cb = (s: Session, action: string) => `${s.sid}|${s.step}|${action}`.slice(0, 64)
export function parseCb(data: string): { sid: string; step: string; action: string } | null {
  const m = /^([a-z0-9]{4,10})\|([a-z_]{3,12})\|(.{1,48})$/.exec(data)
  return m ? { sid: m[1], step: m[2], action: m[3] } : null
}

export const fmtDur = (sec?: number) => {
  if (!sec || !Number.isFinite(sec)) return ''
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const fmtMb = (b: number) => `${(b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0)} MB`

export const PAGE = 8

/** Nut chon cua danh sach (2 nut / hang) + trang truoc / sau */
export function pickKeyboard(s: Session, selected: (v: string) => boolean = () => false): InlineKeyboard {
  const p = s.pick
  if (!p) return []
  const start = p.page * PAGE
  const slice = p.items.slice(start, start + PAGE)
  const rows: InlineKeyboard = []
  for (let i = 0; i < slice.length; i += 2) {
    rows.push(
      slice.slice(i, i + 2).map((it, k) => ({
        text: (selected(it.value) ? '✅ ' : '') + it.label.slice(0, 40),
        callback_data: cb(s, `pick:${start + i + k}`)
      }))
    )
  }
  const nav = []
  if (p.page > 0) nav.push({ text: '◀ Trước', callback_data: cb(s, `page:${p.page - 1}`) })
  if (start + PAGE < p.items.length) nav.push({ text: 'Sau ▶', callback_data: cb(s, `page:${p.page + 1}`) })
  if (nav.length) rows.push(nav)
  return rows
}

const skipBtn = (s: Session, label = '⏭ Bỏ qua') => ({ text: label, callback_data: cb(s, 'skip') })

/** Cau hoi + nut cua buoc hien tai. */
export function prompt(s: Session, opts: { hasSaydi?: boolean } = {}): { text: string; keyboard: InlineKeyboard } {
  const head = `<b>${s.flow === 'edit' ? '🎬 Edit video' : '✨ Tạo video'} · bước ${stepNo(s)}</b>\n`
  switch (s.step) {
    // ------------------------------------------------------------ Edit video
    case 'source':
      return {
        text: head + '📤 <b>Gửi video nguồn</b> cần edit (gửi dạng <i>Video</i> hoặc <i>File</i> để giữ chất lượng).\n' +
          'Có thể gửi nhiều video. Video trên 20 MB: gửi <b>link tải</b> (Google Drive / Dropbox) hoặc chọn video đã dùng trong thư viện.',
        keyboard: [
          [{ text: '📚 Chọn từ thư viện', callback_data: cb(s, 'lib') }],
          ...(s.videos.length ? [[{ text: `➡️ Tiếp tục (đã có ${s.videos.length} video)`, callback_data: cb(s, 'done') }]] : [])
        ]
      }
    case 'reference':
      return {
        text: head + '🎞 <b>Gửi video mẫu</b> (app bắt chước nhịp cắt, chữ, hiệu ứng của video này) — hoặc bấm <b>Bỏ qua</b>.',
        keyboard: [
          [{ text: '📚 Chọn từ thư viện', callback_data: cb(s, 'lib') }, skipBtn(s)],
          [{ text: '➕ Thêm video nguồn khác', callback_data: cb(s, 'addsrc') }]
        ]
      }
    case 'purpose':
      return { text: head + '🎯 <b>Video này để làm gì?</b>\nVD: để chạy quảng cáo, bán trà sữa, đăng hàng ngày…', keyboard: [] }
    case 'style':
      return { text: head + '🎨 <b>Thích style / phong cách như nào?</b>\nVD: nhanh, vui, bắt trend, sang, tối giản, cinematic…', keyboard: [] }
    case 'audience':
      return { text: head + '👥 <b>Khách hàng là ai?</b>\nVD: nữ 18-25, dân văn phòng, chủ shop, người mới skincare…', keyboard: [] }
    case 'duration':
      return {
        text: head + '⏱ <b>Độ dài video mong muốn?</b> Bấm chọn nhanh hoặc gõ (VD: 15s, 30-45s, khoảng 1 phút) — bỏ qua để AI tự quyết.',
        keyboard: [
          [{ text: '15 giây', callback_data: cb(s, 'dur:15 giây') }, { text: '30 giây', callback_data: cb(s, 'dur:30 giây') }],
          [{ text: '30–45 giây', callback_data: cb(s, 'dur:30-45 giây') }, { text: '~1 phút', callback_data: cb(s, 'dur:khoảng 1 phút') }],
          [skipBtn(s)]
        ]
      }
    case 'font': {
      const chosen = [...s.fonts.map((f) => f.name), ...s.fontFiles.map((f) => f.name)]
      const kb = pickKeyboard(s, (v) => s.fonts.some((f) => f.id === v))
      kb.push(chosen.length ? [{ text: `✅ Xong (${chosen.length} font)`, callback_data: cb(s, 'done') }] : [skipBtn(s, '⏭ Bỏ qua (AI tự chọn font)')])
      return {
        text: head + '🔤 <b>Font chữ</b> — bấm chọn font trong kho, <b>gửi file font</b> (.ttf / .otf / .woff) để tải lên, hoặc gõ tên / kiểu font muốn dùng.\n' +
          `Tối đa ${MAX_FONTS} font: font đầu cho tiêu đề, font cuối cho chữ nội dung.` +
          (chosen.length ? `\nĐã chọn: <b>${esc(chosen.join(', '))}</b>` : '') +
          (s.pick && !s.pick.items.length ? '\n<i>(Kho font chưa có font nào — gửi file font lên hoặc bỏ qua)</i>' : ''),
        keyboard: kb
      }
    }
    case 'colors':
      return { text: head + '🌈 <b>Màu sắc thương hiệu?</b> Gõ mã màu hoặc mô tả (VD: #FF6A00 cam + trắng, tông pastel) — hoặc bỏ qua.', keyboard: [[skipBtn(s)]] }
    case 'inserts':
      return {
        text: head + '📎 <b>Tư liệu chèn vào video</b> (logo, ảnh sản phẩm, clip phụ…) — gửi ảnh / video lên, mỗi tệp mình sẽ hỏi lại mô tả.\n' +
          (s.inserts.length ? `Đã có ${s.inserts.length} tư liệu. Gửi thêm, hoặc bấm <b>Xong</b> để tạo video.` : 'Không có tư liệu thì bấm nút bên dưới.'),
        keyboard: [[s.inserts.length ? { text: '✅ Xong — tạo video', callback_data: cb(s, 'done') } : skipBtn(s, '⏭ Không có tư liệu — tạo video luôn')]]
      }
    // ------------------------------------------------------------ Tao video
    case 'm_name':
      return { text: head + '🏷 <b>Tên sản phẩm / thương hiệu / kênh?</b>', keyboard: [] }
    case 'm_type': {
      const kb: InlineKeyboard = []
      for (let i = 0; i < VIDEO_TYPES.length; i += 2) {
        kb.push(VIDEO_TYPES.slice(i, i + 2).map((t) => ({ text: t.label, callback_data: cb(s, `type:${t.id}`) })))
      }
      return { text: head + '🎬 <b>Loại video?</b>', keyboard: kb }
    }
    case 'm_message':
      return { text: head + '💬 <b>Nội dung chính muốn nói trong video?</b>\nVD: ra mắt app học tiếng Anh 5 phút mỗi ngày, ưu đãi 50% tuần đầu…', keyboard: [] }
    case 'm_website':
      return { text: head + '🌐 <b>Website</b> (AI tự lấy logo, màu, font, ảnh chụp màn hình) — gõ link bắt đầu bằng https:// hoặc bỏ qua.', keyboard: [[skipBtn(s)]] }
    case 'm_audience':
      return { text: head + '👥 <b>Người xem / khách hàng là ai?</b> — hoặc bỏ qua.', keyboard: [[skipBtn(s)]] }
    case 'm_aspect':
      return {
        text: head + '📐 <b>Khung hình?</b>',
        keyboard: [
          [{ text: 'Dọc 9:16 (TikTok, Reels)', callback_data: cb(s, 'asp:9:16') }],
          [{ text: 'Ngang 16:9 (YouTube)', callback_data: cb(s, 'asp:16:9') }, { text: 'Vuông 1:1', callback_data: cb(s, 'asp:1:1') }]
        ]
      }
    case 'm_duration':
      return {
        text: head + '⏱ <b>Độ dài (giây)?</b> Bấm chọn hoặc gõ số từ 6 đến 90.',
        keyboard: [
          [15, 20, 30].map((n) => ({ text: `${n} giây`, callback_data: cb(s, `sec:${n}`) })),
          [45, 60].map((n) => ({ text: `${n} giây`, callback_data: cb(s, `sec:${n}`) }))
        ]
      }
    case 'm_voice': {
      if (!opts.hasSaydi) {
        return {
          text: head + '🎙 <b>Lời đọc</b>: máy chưa có key SaydiVoice nên video sẽ <b>không có lời đọc</b> (nhập key ở Cài đặt API của app để bật).',
          keyboard: [[{ text: '➡️ Tiếp tục (không lời đọc)', callback_data: cb(s, 'novoice') }]]
        }
      }
      const kb = pickKeyboard(s)
      kb.push([{ text: '🔇 Không lời đọc', callback_data: cb(s, 'novoice') }])
      return { text: head + '🎙 <b>Chọn giọng đọc</b> (AI tự viết lời) — hoặc không lời đọc.', keyboard: kb }
    }
    case 'm_colors':
      return { text: head + '🌈 <b>Màu thương hiệu?</b> (mã màu / mô tả) — hoặc bỏ qua.', keyboard: [[skipBtn(s)]] }
    case 'm_fonts':
      return { text: head + '🔤 <b>Font thương hiệu?</b> (tên font) — hoặc bỏ qua.', keyboard: [[skipBtn(s)]] }
    case 'm_assets':
      return {
        text: head + '🖼 <b>Ảnh tư liệu</b> (logo, ảnh sản phẩm, ảnh chụp màn hình) — gửi ảnh lên, mỗi ảnh mình sẽ hỏi lại mô tả.\n' +
          (s.m.assets.length ? `Đã có ${s.m.assets.length} ảnh. Gửi thêm, hoặc bấm <b>Xong</b>.` : 'Không có thì bấm bỏ qua.'),
        keyboard: [[s.m.assets.length ? { text: '✅ Xong', callback_data: cb(s, 'done') } : skipBtn(s)]]
      }
    case 'm_notes':
      return { text: head + '📝 <b>Ghi chú thêm cho AI?</b> (lời kêu gọi cuối video, ý tưởng muốn có…) — hoặc bấm tạo video luôn.', keyboard: [[skipBtn(s, '🚀 Tạo video luôn')]] }
  }
}

/** Tom tat bang hoi (bao luc bat dau tao video) */
export function summary(s: Session): string {
  const L: string[] = []
  const row = (k: string, v?: string | null) => v && L.push(`• ${k}: ${esc(v)}`)
  if (s.flow === 'edit') {
    row('Video nguồn', s.videos.map((v) => v.name).join(', '))
    row('Video mẫu', s.reference?.name || 'không')
    row('Mục đích', s.purpose)
    row('Phong cách', s.style)
    row('Khách hàng', s.audience)
    row('Độ dài', s.duration || 'AI tự quyết')
    row('Font', [...s.fonts.map((f) => f.name), ...s.fontFiles.map((f) => f.name)].join(', ') || 'AI tự chọn')
    row('Màu', s.colors)
    row('Tư liệu', s.inserts.length ? `${s.inserts.length} tệp` : 'không')
  } else {
    const m = s.m
    row('Tên', m.name)
    row('Loại', VIDEO_TYPES.find((t) => t.id === m.videoType)?.label)
    row('Nội dung', m.message)
    row('Website', m.website)
    row('Người xem', m.audience)
    row('Khung hình', m.aspect)
    row('Độ dài', m.duration ? `${m.duration} giây` : '')
    row('Lời đọc', m.voice?.enabled ? m.voice.voiceName || m.voice.voiceId : 'không')
    row('Màu', m.colors)
    row('Font', m.fonts)
    row('Ảnh tư liệu', m.assets.length ? `${m.assets.length} ảnh` : 'không')
  }
  return L.join('\n')
}

/** Escape cho parse_mode HTML cua Telegram */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
