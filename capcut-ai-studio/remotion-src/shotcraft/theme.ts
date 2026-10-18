// MAU CUA VIDEO cho kho shot: doi mau nhan (accent / accent2) cua 8 bo mau LOOKS + mau nhan dau hieu theo mau nhan
// cua video (R4 style.palette). Nen sang/toi cua tung mau GIU NGUYEN (AI lap ke hoach chon mau theo truong `dark`).
// Mau nhan duoc chinh do sang de du tuong phan voi nen cua tung bo (chu nhan tren nen sang van doc duoc).
// LOOKS la hang so cap module -> doi TAI CHO; ca video dung chung 1 bo mau nen goi 1 lan / lan ve la du.
import { LOOKS } from './fixtures/Look'
import { BRAND } from './fixtures/Brand'
import { FIXTURE_PAL, G } from './fixtures/Fixtures'

export interface ShotTheme {
  accent?: string
  accent2?: string
}

type RGB = [number, number, number]
const ORIG = JSON.parse(JSON.stringify(LOOKS)) as typeof LOOKS
const ORIG_AMBER = BRAND.amber
const ORIG_G = { accent: G.accent, accentSoft: G.accentSoft }
const ORIG_PAL = JSON.parse(JSON.stringify({ light: { accent: FIXTURE_PAL.light.accent, accentSoft: FIXTURE_PAL.light.accentSoft }, dark: { accent: FIXTURE_PAL.dark.accent, accentSoft: FIXTURE_PAL.dark.accentSoft } }))
let applied = ''

const hex = (c: string): RGB | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((c || '').trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const lum = (c: RGB) => {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const contrast = (a: RGB, b: RGB) => {
  const x = lum(a)
  const y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const mixTo = (c: RGB, t: RGB, k: number): RGB => [c[0] + (t[0] - c[0]) * k, c[1] + (t[1] - c[1]) * k, c[2] + (t[2] - c[2]) * k]

/** Mau `c` chinh sang / toi dan toi khi tuong phan voi nen `bg` >= min. */
export function readableOn(c: string, bg: string, min = 3): string {
  const a = hex(c)
  const b = hex(bg)
  if (!a || !b) return c
  if (contrast(a, b) >= min) return toHex(a)
  const target: RGB = lum(b) > 0.4 ? [0, 0, 0] : [255, 255, 255]
  for (let k = 0.1; k <= 0.9; k += 0.1) {
    const m = mixTo(a, target, k)
    if (contrast(m, b) >= min) return toHex(m)
  }
  return toHex(mixTo(a, target, 0.9))
}

/** Chu tren nen mau nhan: den hoac trang, cai nao tuong phan hon. */
const onColor = (c: string) => {
  const a = hex(c)
  if (!a) return '#ffffff'
  return contrast(a, [0, 0, 0]) >= contrast(a, [255, 255, 255]) ? '#0a0a0a' : '#ffffff'
}

export function applyShotTheme(theme: ShotTheme | null | undefined) {
  const key = JSON.stringify(theme || {})
  if (key === applied) return
  applied = key
  const looks = LOOKS as unknown as Record<string, Record<string, unknown>>
  for (const name of Object.keys(ORIG)) {
    const o = (ORIG as unknown as Record<string, Record<string, unknown>>)[name]
    const L = looks[name]
    Object.assign(L, JSON.parse(JSON.stringify(o)))
    const bg = (o.bg as string[])[1]
    if (theme?.accent && hex(theme.accent)) {
      L.accent = readableOn(theme.accent, bg, 3)
      L.onAccent = onColor(L.accent as string)
    }
    if (theme?.accent2 && hex(theme.accent2)) L.accent2 = readableOn(theme.accent2, bg, 2.2)
  }
  ;(BRAND as { amber: string }).amber = theme?.accent && hex(theme.accent) ? toHex(hex(theme.accent)!) : ORIG_AMBER
  // giao dien gia (Fixtures): G + bang sang / toi
  const g = G as unknown as Record<string, string>
  const pal = FIXTURE_PAL as unknown as Record<'light' | 'dark', Record<string, string>>
  if (theme?.accent && hex(theme.accent)) {
    const c = hex(theme.accent)!
    const soft = (a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
    g.accent = readableOn(theme.accent, '#ffffff', 3)
    g.accentSoft = soft(0.11)
    pal.light.accent = g.accent
    pal.light.accentSoft = soft(0.11)
    pal.dark.accent = readableOn(theme.accent, '#121318', 3)
    pal.dark.accentSoft = soft(0.16)
  } else {
    Object.assign(g, ORIG_G)
    Object.assign(pal.light, ORIG_PAL.light)
    Object.assign(pal.dark, ORIG_PAL.dark)
  }
}
