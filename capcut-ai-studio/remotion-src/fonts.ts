// Font cho chu (caption + lop do hoa). Chi dung font CO DU DAU TIENG VIET va dong goi san
// trong bundle -> render khong can mang. Them font moi: cai @fontsource/<ten> (hoac dat file
// vao src/assets/fonts + local-fonts.css), import o day, them 1 muc "fonts" trong
// sidecar/assets/remotion_catalog.json.
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/be-vietnam-pro/700.css'
import '@fontsource/be-vietnam-pro/900.css'
import '@fontsource/be-vietnam-pro/900-italic.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/800.css'
import '@fontsource/montserrat/900.css'
import '@fontsource/montserrat/800-italic.css'
import '@fontsource/montserrat/900-italic.css'
import '@fontsource/anton/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/700.css'
import '@fontsource/baloo-2/600.css'
import '@fontsource/baloo-2/800.css'
import '@fontsource/lexend/500.css'
import '@fontsource/lexend/700.css'
import '@fontsource/bungee/400.css'
import '@fontsource/dancing-script/500.css'
import '@fontsource/dancing-script/700.css'
import '@fontsource/roboto-condensed/600.css'
import '@fontsource/roboto-condensed/800.css'
import '@fontsource/great-vibes/400.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/700-italic.css'
import '@fontsource/playfair-display/900-italic.css'
import '@fontsource/barlow-condensed/800.css'
import '@fontsource/barlow-condensed/800-italic.css'
import '@fontsource/barlow-condensed/900.css'
import '@fontsource/barlow-condensed/900-italic.css'
import './local-fonts.css'
import type { CaptionRole, RSCustomFont } from './types'

interface FontDef {
  family: string
  /** do dam mac dinh cho tung vai chu */
  weights: Record<CaptionRole, number>
  /** cac do dam CO THAT (de lop do hoa chon gan nhat, khong de trinh duyet gia dam) */
  available: number[]
  /** co ban nghieng that khong */
  italic: boolean
  /** be rong trung binh 1 ky tu / co chu (de uoc luong ngat dong) */
  width: number
}

export const FONTS: Record<string, FontDef> = {
  be_vietnam_pro: { family: 'Be Vietnam Pro', weights: { hero: 900, support: 700, micro: 500 }, available: [500, 600, 700, 900], italic: true, width: 0.6 },
  montserrat: { family: 'Montserrat', weights: { hero: 900, support: 800, micro: 600 }, available: [600, 800, 900], italic: true, width: 0.64 },
  anton: { family: 'Anton', weights: { hero: 400, support: 400, micro: 400 }, available: [400], italic: false, width: 0.47 },
  oswald: { family: 'Oswald', weights: { hero: 700, support: 700, micro: 500 }, available: [500, 700], italic: false, width: 0.48 },
  baloo_2: { family: 'Baloo 2', weights: { hero: 800, support: 800, micro: 600 }, available: [600, 800], italic: false, width: 0.56 },
  lexend: { family: 'Lexend', weights: { hero: 700, support: 700, micro: 500 }, available: [500, 700], italic: false, width: 0.62 },
  bungee: { family: 'Bungee', weights: { hero: 400, support: 400, micro: 400 }, available: [400], italic: false, width: 0.8 },
  dancing_script: { family: 'Dancing Script', weights: { hero: 700, support: 700, micro: 700 }, available: [500, 700], italic: false, width: 0.5 },
  roboto_condensed: { family: 'Roboto Condensed', weights: { hero: 800, support: 800, micro: 600 }, available: [600, 800], italic: false, width: 0.5 },
  gilroy: { family: 'SVN-Gilroy', weights: { hero: 700, support: 700, micro: 600 }, available: [500, 600, 700], italic: false, width: 0.58 },
  great_vibes: { family: 'Great Vibes', weights: { hero: 400, support: 400, micro: 400 }, available: [400], italic: false, width: 0.42 },
  playfair_display: { family: 'Playfair Display', weights: { hero: 900, support: 700, micro: 700 }, available: [700, 900], italic: true, width: 0.55 },
  barlow_condensed: { family: 'Barlow Condensed', weights: { hero: 900, support: 800, micro: 800 }, available: [800, 900], italic: true, width: 0.45 }
}

export const DEFAULT_FONT = 'be_vietnam_pro'

/** Font TAI LEN cua ban dung (spec.fonts) -> them vao FONTS (dong bo, goi luc ve) — fontOf / fontCss / do be rong
 *  dung nhu font dong goi. Chi id "uf_*" (khong de font tai len ghi de font dong goi). */
export function registerCustomFonts(list: RSCustomFont[] | undefined) {
  for (const f of list || []) {
    if (!f || !/^uf_[0-9a-f]{10}$/.test(f.id) || !f.files?.length) continue
    const avail = (f.available?.length ? f.available : f.files.map((x) => x.weight)).slice().sort((a, b) => a - b)
    FONTS[f.id] = {
      family: f.family,
      weights: f.weights || { hero: avail[avail.length - 1], support: avail[0], micro: avail[0] },
      available: avail,
      italic: !!f.italic,
      width: f.width || 0.58
    }
  }
}

const loaded = new Map<string, Promise<void>>()

// = Layers.mediaUrl (khong import: Layers -> fonts -> Layers vong)
function fileSrc(base: string | undefined, path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path
  if (!base) return 'file://' + encodeURI((/^[A-Za-z]:/.test(path) ? '/' : '') + path.replace(/\\/g, '/'))
  const name = path.split(/[\\/]/).pop() || 'font'
  return `${base}/${encodeURIComponent(name)}?p=${encodeURIComponent(path)}`
}

/** Nap file font tai len (FontFace qua may chu media cuc bo — ca Player lan render). Loi 1 file -> bo qua file do
 *  (chu ve bang font du phong), khong treo render. */
export function loadCustomFonts(list: RSCustomFont[] | undefined, base: string | undefined): Promise<void> {
  const jobs: Promise<void>[] = []
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve()
  for (const f of list || []) {
    for (const file of f.files || []) {
      const key = `${f.family}|${file.path}|${file.weight}|${file.italic ? 1 : 0}`
      let p = loaded.get(key)
      if (!p) {
        const ff = new FontFace(f.family, `url("${fileSrc(base, file.path)}")`, {
          weight: String(file.weight),
          style: file.italic ? 'italic' : 'normal'
        })
        p = ff
          .load()
          .then((x) => {
            document.fonts.add(x)
          })
          .catch(() => {
            loaded.delete(key)
          })
        loaded.set(key, p)
      }
      jobs.push(p)
    }
  }
  return Promise.all(jobs).then(() => undefined)
}

export function fontOf(id: string | undefined): FontDef {
  return FONTS[id || ''] || FONTS[DEFAULT_FONT]
}

/** Do dam co that gan nhat voi do dam yeu cau. */
export function nearestWeight(id: string | undefined, want: number | undefined, role: CaptionRole = 'hero'): number {
  const f = fontOf(id)
  const w = want ?? f.weights[role]
  return f.available.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), f.available[0])
}

export function fontCss(id: string | undefined, weight?: number, italic?: boolean, role: CaptionRole = 'hero') {
  const f = fontOf(id)
  return {
    fontFamily: `"${f.family}", "Be Vietnam Pro", sans-serif`,
    fontWeight: nearestWeight(id, weight, role),
    fontStyle: italic && f.italic ? 'italic' : 'normal',
    // font khong co ban nghieng that -> nghieng bang skew o lop (de dong deu)
    fauxItalic: !!italic && !f.italic
  }
}

/** Cac chuoi `font` (CSS) can nap truoc khi ve khung dau tien. */
export function fontLoadQueries(items: { font?: string; role?: CaptionRole; weight?: number; italic?: boolean }[]): string[] {
  const seen = new Set<string>()
  for (const it of items) {
    const f = fontOf(it.font)
    const w = nearestWeight(it.font, it.weight, it.role || 'hero')
    const st = it.italic && f.italic ? 'italic ' : ''
    seen.add(`${st}${w} 64px "${f.family}"`)
  }
  return [...seen]
}
