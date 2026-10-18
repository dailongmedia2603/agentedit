// RUNTIME CHO KHO SHOT (video-shotcraft, Apache-2.0 — xem LICENSE / NOTICE.md).
// Moi mau trong shots/ duoc viet cho san khau 1920x1080 @30fps, khong props. Khi vendor, cac lenh
// useCurrentFrame / useVideoConfig / staticFile cua 'remotion' trong code mau duoc tro sang file nay:
//   - useCurrentFrame: khung "goc" cua mau (30fps, nhan toc do `rate`, dung o khung cuoi = giu hinh)
//   - useVideoConfig : san khau ao 1920 x height @30fps, durationInFrames = do dai goc cua mau
//   - staticFile     : anh mau (textures/live/x.png) -> anh THAT cua video qua o anh (images)
// Noi dung that (chu tu loi noi, anh B-roll, thuong hieu, font) di qua ShotRuntimeProvider (ShotPlayer.tsx).
// Ngoai ShotPlayer (khong co provider) moi ham tra ve dung nhu remotion -> code mau van chay doc lap.
import React, { createContext, useContext } from 'react'
import {
  staticFile as rStaticFile,
  useCurrentFrame as rUseCurrentFrame,
  useVideoConfig as rUseVideoConfig
} from 'remotion'

export const SHOT_W = 1920
export const SHOT_H = 1080
export const SHOT_FPS = 30

export type ShotTexts = Record<string, string | string[]>

export interface ShotFonts {
  /** chuoi font-family day du (da gom du phong) */
  sans: string
  serif: string
  display: string
  mono: string
}

export interface ShotRuntimeData {
  id: string
  /** do dai goc cua mau (khung @30fps) */
  native: number
  /** toc do phat (1 = goc; 1.2 = nhanh hon 20%) */
  rate: number
  texts: ShotTexts
  /** o anh -> URL da giai (may chu media cua app / staticFile khi xem thu) */
  images: Record<string, string>
  brand: { name: string; logo?: string } | null
  /** khung doc (9:16) */
  portrait: boolean
  /** chieu cao san khau ao: 1080 (dai ngang) hoac cao hon khi mau tu bo cuc doc (portrait.mode = 'native') */
  height: number
  /** px phu them tren / duoi khoi 1920x1080 (khung doc, mode 'band') de nen san khau phu kin khung */
  bleed: { top: number; bottom: number }
  fonts: ShotFonts
  /** id cac o chu KHAI trong meta: o khai ma khong duoc gui chu = de TRONG (khong hien chu mau lac de) */
  slotIds?: string[]
  /** xem thu kho (scripts/shot-still.mjs): o anh thieu -> anh mau trong public. Trong app = false: anh mau KHONG ton tai
   *  trong bundle -> o anh thieu tra undefined / anh trong suot (mau tu ve ban thay the) */
  preview?: boolean
}

const Ctx = createContext<ShotRuntimeData | null>(null)
export const ShotRuntimeProvider = Ctx.Provider
export const useShot = (): ShotRuntimeData | null => useContext(Ctx)

/** Khung hien tai THEO DONG HO CUA MAU (30fps, nhan rate, kep [0, native-1]: het mau thi giu khung cuoi). */
export function useCurrentFrame(): number {
  const f = rUseCurrentFrame()
  const d = useContext(Ctx)
  const { fps } = rUseVideoConfig()
  if (!d) return f
  const raw = (f / fps) * SHOT_FPS * d.rate
  // khung nguyen -> lam tron (code mau danh chi so theo khung); khung LE (Freeze cua @remotion/motion-blur lay mau
  // nhieu thoi diem trong 1 khung) -> giu phan le, khong thi vet nhoe chuyen dong bien mat
  const nf = Number.isInteger(f) ? Math.floor(raw + 1e-6) : raw
  return Math.max(0, Math.min(d.native - 1, nf))
}

export function useVideoConfig(): ReturnType<typeof rUseVideoConfig> {
  const c = rUseVideoConfig()
  const d = useContext(Ctx)
  if (!d) return c
  return { ...c, width: SHOT_W, height: d.height, fps: SHOT_FPS, durationInFrames: d.native }
}

/** Gia tri o anh: URL day du (app gui) hoac duong dan trong thu muc public (xem thu kho). */
export const resolveUrl = (v: string) => (/^(https?:|data:|blob:|file:)/.test(v) ? v : rStaticFile(v.replace(/^\/+/, '')))

const basename = (p: string) => p.split('/').pop()!.replace(/\.[a-z0-9]+$/i, '')

/** staticFile cua code mau: 'textures/live/card4.png' -> o anh 'card4' neu app gui anh cho o do. */
export function staticFile(path: string): string {
  // khong dung hook: staticFile duoc goi ca o ngoai component -> doc ngu canh qua bien toan cuc cua lan ve hien tai
  const d = currentData
  const key = basename(path)
  if (d && d.images[key]) return resolveUrl(d.images[key])
  if (d && d.images[path]) return resolveUrl(d.images[path])
  if (/^(https?:|data:|blob:)/.test(path)) return path
  if (d && !d.preview) return BLANK
  return rStaticFile(path)
}

/** anh trong suot 1x1 — o anh thieu trong app (khong de trinh duyet tai file mau khong ton tai) */
export const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

// Ngu canh cua shot dang ve (staticFile / text o muc module duoc goi trong luc ve). ShotPlayer dat truoc khi ve con.
let currentData: ShotRuntimeData | null = null
export function setCurrentShot(d: ShotRuntimeData | null) {
  currentData = d
}

/** Chu THAT cho o `id` (loi noi cua video); khong co -> chu mau `sample` (khi xem thu kho). */
export function useText(id: string, sample: string): string {
  const d = useContext(Ctx)
  const v = d?.texts[id]
  if (Array.isArray(v)) return v.join(' ')
  if (typeof v === 'string' && v.trim()) return v
  // o chu khai trong meta ma app khong gui (o tuy chon de trong) -> rong; chu trang tri khong khai -> chu mau
  return d?.slotIds?.includes(id) ? '' : sample
}

/** Danh sach chu (o kieu list). Co chu that -> dung dung so muc app gui (code mau phai chiu duoc so muc trong [min,max] cua meta). */
export function useList(id: string, samples: string[]): string[] {
  const d = useContext(Ctx)
  const v = d?.texts[id]
  if (Array.isArray(v) && v.length) return v.map((x) => String(x))
  if (typeof v === 'string' && v.trim()) return v.split('\n').map((x) => x.trim()).filter(Boolean)
  return d?.slotIds?.includes(id) ? [] : samples
}

/** Anh THAT cho o `id`; khong co -> anh mau (staticFile) neu cho san duong dan mau. */
export function useImage(id: string, sample?: string): string | undefined {
  const d = useContext(Ctx)
  if (d?.images[id]) return resolveUrl(d.images[id])
  if (d && !d.preview) return undefined // app khong gui anh cho o nay -> mau ve ban thay the cua no
  return sample ? staticFile(sample) : undefined
}

/** Thuong hieu cua video (Brand Guideline). null = khong co -> mau ve dau hieu trung tinh / an. */
export function useBrand(): { name: string; logo?: string } | null {
  return useContext(Ctx)?.brand ?? null
}

/** Thuong hieu cua shot dang ve (doc trong luc ve — BRAND / ShotcraftMark cua fixtures goi ham nay). */
export function currentBrand(): { name: string; logo?: string } | null {
  return currentData?.brand ?? null
}

/** Font cua shot dang ve (doc trong luc ve, ke ca ngoai hook — FONT.sans cua fixtures goi ham nay). */
export function currentShotFonts(): ShotFonts {
  return currentData?.fonts ?? DEFAULT_FONTS
}

export function useShotFonts(): ShotFonts {
  return useContext(Ctx)?.fonts ?? DEFAULT_FONTS
}

export const DEFAULT_FONTS: ShotFonts = {
  sans: '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Inter, Arial, sans-serif',
  serif: '"Playfair Display", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  display: '"Barlow Condensed", "Avenir Next Condensed", "Roboto Condensed", "Arial Narrow", sans-serif',
  mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace'
}

// ---------------------------------------------------------------------------
// CO CHU VUA KHUNG: chu that (tieng Viet, dai ngan bat ky) thay chu mau -> do be ngang that bang canvas
// ---------------------------------------------------------------------------
let measureCtx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()
/** Font vua nap xong -> bo ket qua do cu (do bang font du phong truoc khi nap). */
export function clearMeasureCache() {
  cache.clear()
}

/** Be ngang (px) cua `text` voi co `size`. family: chuoi font-family (khong dung var()). */
export function measureText(text: string, family: string, size: number, weight: number | string = 400, italic = false): number {
  const k = `${family}|${size}|${weight}|${italic}|${text}`
  const hit = cache.get(k)
  if (hit !== undefined) return hit
  if (!measureCtx && typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d')
  let w = text.length * size * 0.58
  if (measureCtx) {
    measureCtx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`
    w = measureCtx.measureText(text).width
  }
  cache.set(k, w)
  return w
}

/** Co chu lon nhat <= `size` de `text` nam tren 1 dong rong <= maxWidth (khong nho hon minSize). */
export function fitSize(
  text: string,
  opts: { family: string; size: number; maxWidth: number; weight?: number | string; italic?: boolean; minSize?: number; letterSpacingEm?: number }
): number {
  const { family, size, maxWidth, weight = 400, italic = false, minSize = size * 0.4, letterSpacingEm = 0 } = opts
  const w = measureText(text, family, size, weight, italic) + Math.max(0, text.length - 1) * letterSpacingEm * size
  if (w <= maxWidth) return size
  return Math.max(minSize, Math.floor(size * (maxWidth / w) * 100) / 100)
}

/** Hook: co chu vua khung voi font cua shot (role: sans | serif | display | mono). */
export function useFitSize(
  text: string,
  size: number,
  maxWidth: number,
  opts: { role?: keyof ShotFonts; weight?: number | string; italic?: boolean; minSize?: number; letterSpacingEm?: number } = {}
): number {
  const fonts = useShotFonts()
  return fitSize(text, { family: fonts[opts.role ?? 'sans'], size, maxWidth, ...opts })
}

/** Tach chu thanh cac dong (be ngang <= maxWidth) — cho mau can xuong dong theo noi dung that. */
export function wrapLines(text: string, family: string, size: number, maxWidth: number, weight: number | string = 400, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (cur && measureText(t, family, size, weight) > maxWidth) {
      lines.push(cur)
      cur = w
    } else cur = t
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1)
    head.push(lines.slice(maxLines - 1).join(' '))
    return head
  }
  return lines
}

/** Dau hieu thuong hieu: logo that (anh) hoac ten viet tat — dung thay ShotcraftMark khi can logo tron. */
export const BrandLogo: React.FC<{ size: number; style?: React.CSSProperties; color?: string; bg?: string }> = ({ size, style, color, bg }) => {
  const b = useBrand()
  const fonts = useShotFonts()
  if (b?.logo) return <img src={b.logo} style={{ width: size, height: size, objectFit: 'contain', display: 'block', ...style }} />
  const name = (b?.name || '').trim()
  if (!name) return null
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: bg ?? 'currentColor',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      <span style={{ fontFamily: fonts.sans, fontWeight: 800, fontSize: size * (initials.length > 1 ? 0.4 : 0.5), color: color ?? '#fff', lineHeight: 1 }}>
        {initials}
      </span>
    </div>
  )
}
