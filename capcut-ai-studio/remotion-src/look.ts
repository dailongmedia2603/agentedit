// Cach VE tung muc trong remotion_catalog.json: chinh mau, chuyen canh, hieu ung
// camera. Moi ham la ham THUAN theo gio (giay) -> render tung khung doc lap, may
// render song song nhieu khung van ra dung mot ket qua.
import { Easing, interpolate, random } from 'remotion'
import type { RSClip, RSEffect, RSTransition } from './types'

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const easeInOut = Easing.inOut(Easing.cubic)
const easeOut = Easing.out(Easing.cubic)
const easeIn = Easing.in(Easing.cubic)

// ---------------------------------------------------------------------------
// CHINH MAU (grade) — CSS filter noi suy tu "khong doi" -> preset theo intensity
// ---------------------------------------------------------------------------
interface GradeDef {
  brightness?: number
  contrast?: number
  saturate?: number
  sepia?: number
  grayscale?: number
  hueRotate?: number
  tint?: { color: string; opacity: number; blend: 'soft-light' | 'overlay' | 'color' | 'screen' | 'multiply' }
}

export const GRADES: Record<string, GradeDef> = {
  none: {},
  warm: { sepia: 0.16, saturate: 1.12, hueRotate: -6, brightness: 1.03, tint: { color: '#ff9a3c', opacity: 0.12, blend: 'soft-light' } },
  cool: { saturate: 0.96, hueRotate: 8, contrast: 1.04, brightness: 1.02, tint: { color: '#3aa0ff', opacity: 0.14, blend: 'soft-light' } },
  vivid: { saturate: 1.38, contrast: 1.1, brightness: 1.02 },
  cinematic: { contrast: 1.16, saturate: 1.08, brightness: 0.97, tint: { color: '#0e7c86', opacity: 0.18, blend: 'soft-light' } },
  vintage: { sepia: 0.36, saturate: 0.86, contrast: 0.94, brightness: 1.05, tint: { color: '#f2c38b', opacity: 0.16, blend: 'multiply' } },
  moody: { brightness: 0.9, contrast: 1.22, saturate: 0.78 },
  clean_bright: { brightness: 1.08, contrast: 0.96, saturate: 1.06 },
  bw: { grayscale: 1, contrast: 1.12 },
  pastel: { saturate: 0.8, brightness: 1.1, contrast: 0.9, tint: { color: '#ffb3d1', opacity: 0.12, blend: 'soft-light' } }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function gradeFilter(preset: string, intensity: number): string {
  const g = GRADES[preset] || GRADES.none
  const k = clamp01(intensity)
  const parts: string[] = []
  if (g.brightness !== undefined) parts.push(`brightness(${lerp(1, g.brightness, k).toFixed(3)})`)
  if (g.contrast !== undefined) parts.push(`contrast(${lerp(1, g.contrast, k).toFixed(3)})`)
  if (g.saturate !== undefined) parts.push(`saturate(${lerp(1, g.saturate, k).toFixed(3)})`)
  if (g.sepia !== undefined) parts.push(`sepia(${(g.sepia * k).toFixed(3)})`)
  if (g.grayscale !== undefined) parts.push(`grayscale(${(g.grayscale * k).toFixed(3)})`)
  if (g.hueRotate !== undefined) parts.push(`hue-rotate(${(g.hueRotate * k).toFixed(2)}deg)`)
  return parts.join(' ')
}

export function gradeTint(preset: string, intensity: number) {
  const g = GRADES[preset] || GRADES.none
  if (!g.tint) return null
  return { ...g.tint, opacity: g.tint.opacity * clamp01(intensity) }
}

// ---------------------------------------------------------------------------
// CHUYEN CANH
// ---------------------------------------------------------------------------
export interface LayerStyle {
  opacity: number
  scale: number
  rotate: number // deg
  tx: number // % khung
  ty: number
  blur: number // px
  clipPath?: string
  rgbSplit: number // px, 0 = tat
  z: number
}

export const neutralLayer = (): LayerStyle => ({ opacity: 1, scale: 1, rotate: 0, tx: 0, ty: 0, blur: 0, rgbSplit: 0, z: 0 })

/** Clip A (dang ra) va B (dang vao) quanh diem cat `b`. Tra style cho mot trong hai. */
export function transitionStyle(
  tr: RSTransition,
  b: number,
  t: number,
  side: 'out' | 'in',
  seed: string
): Partial<LayerStyle> | null {
  const d = Math.max(0.05, tr.duration)
  const half = d / 2
  if (t < b - half || t > b + half) return null

  if (tr.overlap) {
    const p = easeInOut(clamp01((t - (b - half)) / d))
    switch (tr.type) {
      case 'crossfade':
        return side === 'in' ? { opacity: p, z: 1 } : {}
      case 'slide_up':
        return side === 'out' ? { ty: -p * 100 } : { ty: (1 - p) * 100, z: 1 }
      case 'slide_left':
        return side === 'out' ? { tx: -p * 100 } : { tx: (1 - p) * 100, z: 1 }
      case 'wipe': {
        if (side === 'out') return {}
        const x1 = p * 160
        const x2 = x1 - 60
        return { clipPath: `polygon(0% 0%, ${x1}% 0%, ${x2}% 100%, 0% 100%)`, z: 1 }
      }
      case 'iris':
        return side === 'in' ? { clipPath: `circle(${(p * 72).toFixed(2)}% at 50% 50%)`, z: 1 } : {}
      case 'blur':
        return side === 'out' ? { blur: p * 22 } : { opacity: p, blur: (1 - p) * 22, z: 1 }
      default:
        return side === 'in' ? { opacity: p, z: 1 } : {}
    }
  }

  // Kieu cat (khong can chat lieu hai ben): A dien trong nua cuoi, B trong nua dau.
  if (side === 'out' && t > b) return null
  if (side === 'in' && t < b) return null
  const q = side === 'out' ? easeIn(clamp01((t - (b - half)) / half)) : easeOut(clamp01((t - b) / half))
  // q_out: 0 -> 1 khi tien toi diem cat; q_in: 0 -> 1 khi roi xa diem cat
  const r = side === 'out' ? q : 1 - q // "do manh" cua hieu ung tai thoi diem nay
  switch (tr.type) {
    case 'fade_black':
      return { opacity: 1 - r }
    case 'flash':
      return { scale: 1 + 0.06 * r } // lop trang ve rieng o FlashLayer
    case 'zoom_in':
      return side === 'out' ? { scale: 1 + 0.9 * r, blur: 14 * r } : { scale: 1 + 0.6 * r, blur: 14 * r }
    case 'zoom_out':
      return side === 'out' ? { scale: 1 - 0.35 * r, blur: 10 * r } : { scale: 1 + 0.4 * r, blur: 10 * r }
    case 'whip_left':
      return side === 'out' ? { tx: -70 * r, blur: 18 * r } : { tx: 70 * r, blur: 18 * r }
    case 'whip_right':
      return side === 'out' ? { tx: 70 * r, blur: 18 * r } : { tx: -70 * r, blur: 18 * r }
    case 'spin':
      return side === 'out'
        ? { rotate: 100 * r, scale: 1 + 0.7 * r, blur: 12 * r }
        : { rotate: -100 * r, scale: 1 + 0.7 * r, blur: 12 * r }
    case 'glitch': {
      const j = (k: string) => (random(`${seed}-${k}-${Math.round(t * 60)}`) - 0.5) * 2
      return { rgbSplit: 22 * r, tx: 4 * r * j('x'), ty: 1.5 * r * j('y') }
    }
    default:
      return null
  }
}

/** Do sang cua lop trang cho chuyen canh 'flash' tai gio t (0..1). */
export function flashAmount(clips: RSClip[], t: number): number {
  let best = 0
  for (const c of clips) {
    const tr = c.transitionOut
    if (!tr || tr.type !== 'flash') continue
    const half = Math.max(0.05, tr.duration) / 2
    const dist = Math.abs(t - c.end)
    if (dist <= half) best = Math.max(best, 1 - dist / half)
  }
  return best
}

// ---------------------------------------------------------------------------
// HIEU UNG CAMERA (ap len ca lop video)
// ---------------------------------------------------------------------------
export interface Camera {
  scale: number
  tx: number // px
  ty: number
  rotate: number
  blur: number
  grayscale: number
  rgbSplit: number
  /** 0..1 — do cong ong kinh mat ca (ve bang SVG displacement) */
  fisheye: number
  /** 0..1 — mo vien + vet toc do, giu ro o giua ("tap trung") */
  focus: number
}

/** Do "vao/ra" mem o hai dau khoang hieu ung, tranh bat/tat giat cuc. */
function envelope(t: number, s: number, e: number, fadeIn = 0.18, fadeOut = 0.18) {
  if (t < s || t > e) return 0
  const a = fadeIn > 0 ? clamp01((t - s) / fadeIn) : 1
  const b = fadeOut > 0 ? clamp01((e - t) / fadeOut) : 1
  return Math.min(a, b)
}

/** Do 'vao' / 'ra' cua phan ZOOM trong hieu ung camera: smoothstep (ease in-out) thay vi bat / tat tuc thi.
 *  Luat 2026-10-01: muc zoom KHONG BAO GIO nhay trong 1 khung — moi thay doi scale deu la chuyen dong muot. */
const ZOOM_EASE = 0.28
function zoomEnv(t: number, s: number, e: number, fadeIn = ZOOM_EASE, fadeOut = ZOOM_EASE) {
  return easeInOut(envelope(t, s, e, fadeIn, fadeOut))
}

export function cameraAt(effects: RSEffect[], t: number, W: number): Camera {
  const cam: Camera = { scale: 1, tx: 0, ty: 0, rotate: 0, blur: 0, grayscale: 0, rgbSplit: 0, fisheye: 0, focus: 0 }
  for (const fx of effects) {
    if (t < fx.start || t > fx.end) continue
    const I = clamp01(fx.intensity ?? 0.7)
    const dur = Math.max(0.05, fx.end - fx.start)
    const local = t - fx.start
    switch (fx.type) {
      case 'zoom_punch': {
        // day nhanh len dinh trong 0.2s (ease in-out: van la CHUYEN DONG, khong nhay khung), lui ve muc giu,
        // tha ra muot trong 0.3s cuoi
        const peak = 0.2 * I
        const hold = 0.11 * I
        const up = interpolate(local, [0, 0.2, 0.45], [0, peak, hold], { extrapolateRight: 'clamp', easing: easeInOut })
        const release = easeInOut(clamp01((fx.end - t) / 0.3))
        cam.scale *= 1 + up * release
        break
      }
      case 'ken_burns':
        cam.scale *= 1 + 0.13 * I * easeInOut(clamp01(local / dur)) * zoomEnv(t, fx.start, fx.end, 0, 0.35)
        break
      case 'zoom_out_reveal': {
        // truoc day bat dau O NGAY muc phong 1.32 (nhay zoom 1 khung) -> gio day vao muot 0.25s roi lui ra
        const inn = easeInOut(clamp01(local / 0.25))
        const out = 1 - easeInOut(clamp01((local - 0.25) / Math.max(0.1, dur * 0.7 - 0.25)))
        cam.scale *= 1 + 0.32 * I * inn * out
        break
      }
      case 'shake': {
        const amp = 26 * I * (1 - 0.6 * clamp01(local / dur))
        const k = Math.round(t * 30)
        cam.tx += (random(`${fx.id}x${k}`) - 0.5) * 2 * amp * (W / 1080)
        cam.ty += (random(`${fx.id}y${k}`) - 0.5) * 2 * amp * (W / 1080)
        cam.rotate += (random(`${fx.id}r${k}`) - 0.5) * 2.4 * I
        cam.scale *= 1 + 0.04 * zoomEnv(t, fx.start, fx.end, 0.12, 0.2) // phong nhe de rung khong lo vien den
        break
      }
      case 'pulse':
        cam.scale *= 1 + 0.045 * I * Math.abs(Math.sin(Math.PI * 1.7 * local)) * envelope(t, fx.start, fx.end)
        break
      case 'blur_focus':
        cam.blur += 20 * I * (1 - easeOut(clamp01(local / dur)))
        break
      case 'bw':
        cam.grayscale = Math.max(cam.grayscale, I * envelope(t, fx.start, fx.end, 0.25, 0.25))
        break
      case 'fisheye':
        cam.fisheye = Math.max(cam.fisheye, I * envelope(t, fx.start, fx.end, 0.12, 0.2))
        cam.scale *= 1 + 0.06 * I * zoomEnv(t, fx.start, fx.end)
        break
      case 'focus':
        cam.focus = Math.max(cam.focus, I * envelope(t, fx.start, fx.end, 0.1, 0.25))
        break
      case 'pan_left':
      case 'pan_right': {
        const dir = fx.type === 'pan_left' ? -1 : 1
        const k = zoomEnv(t, fx.start, fx.end)
        cam.scale *= 1 + 0.12 * I * k
        cam.tx += dir * (clamp01(local / dur) - 0.5) * W * 0.09 * I * k
        break
      }
      case 'rgb_split': {
        const k = Math.round(t * 24)
        cam.rgbSplit = Math.max(cam.rgbSplit, (8 + 10 * random(`${fx.id}${k}`)) * I * envelope(t, fx.start, fx.end, 0.08, 0.12))
        break
      }
      default:
        break
    }
  }
  return cam
}

export { clamp01, easeOut, easeInOut, envelope }
