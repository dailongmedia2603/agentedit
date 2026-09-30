// LOP DO HOA (motion graphics) — ve theo RSLayer (types.ts). Moi lop:
//   vi tri / kich thuoc / xoay / nghieng / diem neo (anchor)  +  keyframe co easing
//   + hieu ung VAO / RA / LAP (preset)  + hieu ung theo TUNG CHU CAI / TU cho chu.
// Tat ca la ham THUAN theo gio -> render nhieu khung song song van ra mot ket qua.
import React, { useMemo } from 'react'
import { AbsoluteFill, Easing, Img, OffthreadVideo, random, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import type { RSLayer, RSKeyframe, RSMotion, RSSpan, RSWord } from './types'
import { fontCss } from './fonts'

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// ---------------------------------------------------------------------------
// EASING (ease in / ease out / back / elastic / bounce)
// ---------------------------------------------------------------------------
export const EASINGS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  ease_in: Easing.in(Easing.cubic),
  ease_out: Easing.out(Easing.cubic),
  ease_in_out: Easing.inOut(Easing.cubic),
  expo_out: Easing.out(Easing.exp),
  back_out: Easing.out(Easing.back(1.7)),
  back_in: Easing.in(Easing.back(1.7)),
  elastic_out: Easing.out(Easing.elastic(1.1)),
  bounce_out: Easing.bounce
}
export const ease = (name: string | undefined, t: number) => (EASINGS[name || 'ease_out'] || EASINGS.ease_out)(clamp01(t))

// ---------------------------------------------------------------------------
// KEYFRAME
// ---------------------------------------------------------------------------
type Props = { x: number; y: number; scale: number; scaleX: number; rotation: number; skewX: number; opacity: number; blur: number }
const PROP_KEYS: (keyof Props)[] = ['x', 'y', 'scale', 'scaleX', 'rotation', 'skewX', 'opacity', 'blur']

function keyframed(base: Props, kfs: RSKeyframe[] | null | undefined, local: number): Props {
  if (!kfs || !kfs.length) return base
  const sorted = [...kfs].sort((a, b) => a.t - b.t)
  const out = { ...base }
  for (const k of PROP_KEYS) {
    const pts = sorted.filter((f) => typeof f[k] === 'number')
    if (!pts.length) continue
    if (local <= pts[0].t) {
      out[k] = pts[0][k] as number
      continue
    }
    const last = pts[pts.length - 1]
    if (local >= last.t) {
      out[k] = last[k] as number
      continue
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      if (local >= a.t && local <= b.t) {
        const p = ease(b.easing || 'ease_in_out', (local - a.t) / Math.max(1e-3, b.t - a.t))
        out[k] = (a[k] as number) + ((b[k] as number) - (a[k] as number)) * p
        break
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// HIEU UNG VAO / RA / LAP (ca khoi)
// ---------------------------------------------------------------------------
interface FxState {
  opacity: number
  scale: number
  scaleX: number
  scaleY: number
  dx: number // px
  dy: number
  rotation: number
  blur: number
  clip?: string
  draw: number // 0..1 cho duong / vong
}
const neutral = (): FxState => ({ opacity: 1, scale: 1, scaleX: 1, scaleY: 1, dx: 0, dy: 0, rotation: 0, blur: 0, draw: 1 })

/** p = 0 (chua vao) .. 1 (vao xong). `dir` = +1 vao, -1 ra (dung de dao huong truot). */
function motionFx(m: RSMotion, p: number, W: number, H: number, seed: string): FxState {
  const s = neutral()
  const e = ease(m.easing, p)
  const q = 1 - e
  const amt = m.amount ?? 1
  const slide = (from: string | undefined, dist: number) => {
    const f = from || 'bottom'
    if (f === 'left') s.dx = -dist * q
    else if (f === 'right') s.dx = dist * q
    else if (f === 'top') s.dy = -dist * q
    else s.dy = dist * q
  }
  switch (m.preset) {
    case 'fade':
      s.opacity = e
      break
    case 'pop': {
      const b = ease('back_out', p)
      s.scale = 0.35 + 0.65 * b
      s.opacity = clamp01(p * 3)
      break
    }
    case 'scale_in':
      s.scale = 0.6 + 0.4 * e
      s.opacity = e
      break
    case 'zoom_out':
      s.scale = 1 + 0.7 * amt * q
      s.blur = 14 * q
      s.opacity = clamp01(p * 2)
      break
    case 'blur_in':
      s.blur = 22 * q
      s.opacity = e
      s.scale = 1 + 0.06 * q
      break
    case 'slide':
    case 'slide_left':
    case 'slide_right':
    case 'slide_up':
    case 'slide_down': {
      const from =
        m.preset === 'slide_left' ? 'right' : m.preset === 'slide_right' ? 'left' : m.preset === 'slide_up' ? 'bottom' : m.preset === 'slide_down' ? 'top' : m.from
      slide(from, (from === 'left' || from === 'right' ? W : H) * 0.35 * amt)
      s.opacity = clamp01(p * 2.5)
      s.blur = 10 * q // motion blur khi dang lao toi
      break
    }
    case 'rise':
      slide('bottom', H * 0.05 * amt)
      s.opacity = e
      break
    case 'drop': {
      const b = ease('bounce_out', p)
      s.dy = -H * 0.25 * (1 - b)
      s.opacity = clamp01(p * 4)
      break
    }
    case 'expand_y':
      // mo ra tu mot vach ngang (chu nhan kieu "KHONG CO")
      s.scaleY = 0.04 + 0.96 * ease('expo_out', p)
      s.scaleX = 1 + 0.25 * q
      s.blur = 8 * q
      s.opacity = clamp01(p * 4)
      break
    case 'stretch_x':
      s.scaleX = 0.02 + 0.98 * ease('expo_out', p)
      s.blur = 10 * q
      s.opacity = clamp01(p * 4)
      break
    case 'wipe':
    case 'write_on': {
      const from = m.from || 'left'
      const r = (1 - e) * 100
      s.clip =
        from === 'left'
          ? `inset(-20% ${r}% -20% -5%)`
          : from === 'right'
            ? `inset(-20% -5% -20% ${r}%)`
            : from === 'top'
              ? `inset(-5% -20% ${r}% -20%)`
              : `inset(${r}% -20% -5% -20%)`
      if (m.preset === 'write_on') s.blur = 2 * q
      break
    }
    case 'spin_in':
      s.rotation = -180 * q
      s.scale = 0.3 + 0.7 * e
      s.opacity = e
      break
    case 'flip':
      s.scaleX = Math.max(0.02, Math.abs(Math.cos((1 - e) * Math.PI * 0.5)))
      s.opacity = clamp01(p * 3)
      break
    case 'draw':
      s.draw = e
      break
    case 'glitch_in': {
      const k = Math.round(p * 30)
      s.dx = (random(`${seed}g${k}`) - 0.5) * 30 * q
      s.opacity = p < 0.9 ? (random(`${seed}o${k}`) > 0.35 ? 1 : 0.2) : 1
      break
    }
    default:
      s.opacity = e
  }
  return s
}

function loopFx(m: RSMotion, local: number, seed: string): FxState {
  const s = neutral()
  const amt = m.amount ?? 1
  const sp = m.speed ?? 1
  switch (m.preset) {
    case 'float':
      s.dy = Math.sin(local * 2.2 * sp) * 8 * amt
      break
    case 'bob':
      s.dy = Math.abs(Math.sin(local * 3 * sp)) * -10 * amt
      break
    case 'pulse':
      s.scale = 1 + 0.045 * amt * Math.sin(local * 5 * sp) ** 2
      break
    case 'wiggle':
      s.rotation = Math.sin(local * 7 * sp) * 3 * amt
      break
    case 'shake': {
      const k = Math.round(local * 24 * sp)
      s.dx = (random(`${seed}x${k}`) - 0.5) * 12 * amt
      s.dy = (random(`${seed}y${k}`) - 0.5) * 12 * amt
      break
    }
    case 'spin':
      s.rotation = local * 60 * sp
      break
    case 'kenburns':
      s.scale = 1 + 0.08 * amt * local * 0.25 * sp
      break
    default:
      break
  }
  return s
}

function combine(a: FxState, b: FxState): FxState {
  return {
    opacity: a.opacity * b.opacity,
    scale: a.scale * b.scale,
    scaleX: a.scaleX * b.scaleX,
    scaleY: a.scaleY * b.scaleY,
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    rotation: a.rotation + b.rotation,
    blur: a.blur + b.blur,
    clip: a.clip || b.clip,
    draw: Math.min(a.draw, b.draw)
  }
}

/** Hieu ung RA = chay nguoc mot hieu ung VAO. "slide_left" khi ra = truot ra ben TRAI. */
function exitAsEnter(m: RSMotion): RSMotion {
  const map: Record<string, RSMotion> = {
    pop_out: { ...m, preset: 'pop' },
    blur_out: { ...m, preset: 'blur_in' },
    shrink: { ...m, preset: 'scale_in' },
    wipe_out: { ...m, preset: 'wipe', from: m.from === 'left' ? 'right' : 'left' },
    slide_left: { ...m, preset: 'slide', from: 'left' },
    slide_right: { ...m, preset: 'slide', from: 'right' },
    slide_up: { ...m, preset: 'slide', from: 'top' },
    slide_down: { ...m, preset: 'slide', from: 'bottom' }
  }
  return map[m.preset] || m
}

// hieu ung theo TUNG DON VI (chu cai / tu) — chi dung cho lop chu
const UNIT_PRESETS = new Set(['letters_blur', 'words_blur', 'typewriter', 'words_pop', 'letters_drop', 'words_rise', 'letters_fade'])
const unitKind = (preset: string) => (preset.startsWith('letters') || preset === 'typewriter' ? 'char' : 'word')

function unitFx(preset: string, p: number): React.CSSProperties {
  const e = ease('ease_out', p)
  const q = 1 - e
  switch (preset) {
    case 'letters_blur':
    case 'words_blur':
      return { opacity: e, filter: q > 0.01 ? `blur(${(q * 12).toFixed(1)}px)` : undefined, transform: `translateY(${(q * 0.15).toFixed(3)}em)` }
    case 'typewriter':
      return { opacity: p > 0 ? 1 : 0 }
    case 'words_pop': {
      const b = ease('back_out', p)
      return { opacity: clamp01(p * 3), transform: `scale(${(0.3 + 0.7 * b).toFixed(3)})` }
    }
    case 'letters_drop':
      return { opacity: clamp01(p * 3), transform: `translateY(${(-(1 - ease('bounce_out', p)) * 0.6).toFixed(3)}em)` }
    case 'words_rise':
      return { opacity: e, transform: `translateY(${(q * 0.5).toFixed(3)}em)` }
    case 'letters_fade':
    default:
      return { opacity: e }
  }
}

// ---------------------------------------------------------------------------
// CHU (nhieu span, nhieu font)
// ---------------------------------------------------------------------------
function spanStyle(sp: RSSpan, L: RSLayer, scaleW: number): React.CSSProperties & { fauxItalic?: boolean } {
  const f = fontCss(sp.font || L.font, sp.weight ?? L.weight, sp.italic ?? L.italic)
  const size = (sp.size ?? L.size ?? 80) * scaleW
  const color = sp.color || L.color || '#FFFFFF'
  const grad = sp.gradient || L.gradient
  const stroke = sp.stroke === undefined ? L.stroke : sp.stroke
  const glow = sp.glow === undefined ? L.glow : sp.glow
  const shadows: string[] = []
  const filters: string[] = []
  if (glow) {
    // Quang sang NHE, tach khoi net chu: lop glow dam sat chu (0.25g, 100% mau) lam nhoe canh chu —
    // 'KHOA NICK' do phat sang tren nen go sang kho doc (user 2026-09-27). Giu canh sac, glow loang ra ngoai.
    const g = glow.size * scaleW
    const soft = (pct: number) => `color-mix(in srgb, ${glow.color} ${pct}%, transparent)`
    if (grad) filters.push(`drop-shadow(0 0 ${g * 0.5}px ${soft(60)}) drop-shadow(0 0 ${g}px ${soft(40)})`)
    else shadows.push(`0 0 ${g * 0.55}px ${soft(65)}`, `0 0 ${g}px ${soft(40)}`)
  }
  for (const s of L.shadow || []) {
    if (grad) filters.push(`drop-shadow(${s.x * scaleW}px ${s.y * scaleW}px ${s.blur * scaleW}px ${s.color})`)
    else shadows.push(`${s.x * scaleW}px ${s.y * scaleW}px ${s.blur * scaleW}px ${s.color}`)
  }
  const st: React.CSSProperties & { fauxItalic?: boolean } = {
    fontFamily: f.fontFamily,
    fontWeight: f.fontWeight,
    fontStyle: f.fontStyle as React.CSSProperties['fontStyle'],
    fontSize: size,
    color,
    letterSpacing: L.letterSpacing !== undefined ? `${L.letterSpacing}em` : undefined,
    textTransform: (sp.uppercase ?? L.uppercase) ? 'uppercase' : undefined,
    opacity: sp.opacity,
    textShadow: shadows.length ? shadows.join(', ') : undefined,
    filter: filters.length ? filters.join(' ') : undefined,
    fauxItalic: f.fauxItalic
  }
  if (stroke && stroke.width > 0) {
    st.WebkitTextStroke = `${stroke.width * scaleW}px ${stroke.color}`
    st.paintOrder = 'stroke fill'
  }
  if (grad && grad.length) {
    st.backgroundImage = `linear-gradient(${grad.length > 2 ? 90 : 180}deg, ${grad.join(', ')})`
    st.WebkitBackgroundClip = 'text'
    st.backgroundClip = 'text'
    st.color = 'transparent'
    st.WebkitTextFillColor = 'transparent'
  }
  if (sp.dy) st.transform = `translateY(${sp.dy}em)`
  return st
}

function wordTimesFor(L: RSLayer, count: number, local: number): number[] {
  // moc (gio tinh tu dau lop) tung tu duoc "doc toi" — tu Whisper neu co, khong thi chia deu
  if (L.words && L.words.length >= count) return L.words.slice(0, count).map((w) => w.start - L.start)
  const span = Math.max(0.3, (L.end - L.start) * 0.85)
  return Array.from({ length: count }, (_, i) => (span * i) / Math.max(1, count))
}

// CHU ANH AI: moi tang la 1 anh; hieu ung theo tu -> cung anh do, moi tu mot ban cat bang clip-path, vao lech nhau
function artWordFx(preset: string, p: number, h: number): React.CSSProperties {
  const e = ease('ease_out', p)
  const q = 1 - e
  if (preset === 'typewriter') return { opacity: p > 0 ? 1 : 0 }
  if (preset === 'words_pop' || preset === 'letters_drop') {
    const b = ease('back_out', p)
    return { opacity: clamp01(p * 3), transform: `scale(${(0.35 + 0.65 * b).toFixed(3)})` }
  }
  if (preset === 'words_rise') return { opacity: e, transform: `translateY(${(q * h * 0.35).toFixed(1)}px)` }
  return { opacity: e, filter: q > 0.01 ? `blur(${(q * 10).toFixed(1)}px)` : undefined, transform: `translateY(${(q * h * 0.12).toFixed(1)}px)` }
}

const ArtText: React.FC<{ L: RSLayer; local: number; base?: string }> = ({ L, local, base }) => {
  const enter = L.enter || null
  const unit = enter && UNIT_PRESETS.has(enter.preset) ? enter.preset : null
  const stagger = enter?.stagger ?? 0.09
  const dur = unit === 'typewriter' ? 0.01 : Math.min(0.45, enter?.duration ?? 0.35)
  const align = L.align || 'center'
  let k = 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center' }}>
      {(L.art || []).map((t, i) => {
        const src = mediaUrl(base, t.src)
        const parts: [number, number][] = unit && t.words && t.words.length ? t.words : [[0, 1]]
        return (
          <div key={i} style={{ position: 'relative', width: t.w, height: t.h, marginTop: t.mt || 0 }}>
            {parts.map(([a, b], j) => {
              const pr = unit ? clamp01((local - k++ * stagger) / dur) : 1
              const fx = unit ? artWordFx(unit, pr, t.h) : {}
              const whole = parts.length === 1
              return (
                <Img
                  key={j}
                  src={src}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    clipPath: whole ? undefined : `inset(-15% ${((1 - b) * 100).toFixed(2)}% -15% ${(a * 100).toFixed(2)}%)`,
                    transformOrigin: `${(((a + b) / 2) * 100).toFixed(1)}% 55%`,
                    ...fx
                  }}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

const TextLayer: React.FC<{ L: RSLayer; local: number; W: number; base?: string }> = ({ L, local, W, base }) => {
  if (L.art && L.art.length) return <ArtText L={L} local={local} base={base} />
  const scaleW = W / 1080
  const spans: RSSpan[] = L.spans && L.spans.length ? L.spans : [{ text: '' }]
  const enter = L.enter || null
  const unit = enter && UNIT_PRESETS.has(enter.preset) ? enter.preset : null
  const stagger = enter?.stagger ?? (unit && unitKind(unit) === 'char' ? 0.035 : 0.09)
  const unitDur = unit === 'typewriter' ? 0.01 : Math.min(0.45, enter?.duration ?? 0.35)
  let unitIdx = 0
  // dim_to_bright: dem so tu de tinh moc sang
  const allWords = spans.flatMap((s) => s.text.split(/\s+/).filter(Boolean))
  const wtimes = L.reveal === 'dim_to_bright' ? wordTimesFor(L, allWords.length, local) : []
  let wordIdx = 0

  const lines: React.ReactNode[][] = [[]]
  const lineSize: number[] = [0] // co chu lon nhat moi dong -> khoang cach giua cac span cung dong
  spans.forEach((sp, si) => {
    if (sp.newline && lines[lines.length - 1].length) {
      lines.push([])
      lineSize.push(0)
    }
    lineSize[lineSize.length - 1] = Math.max(lineSize[lineSize.length - 1], (sp.size ?? L.size ?? 80) * scaleW)
    const { fauxItalic, ...st } = spanStyle(sp, L, scaleW)
    const words = sp.text.split(/(\s+)/)
    const parts: React.ReactNode[] = []
    words.forEach((w, wi) => {
      if (!w) return
      if (/^\s+$/.test(w)) {
        parts.push(<span key={`s${si}-${wi}`}> </span>)
        return
      }
      let wordOpacity = 1
      if (L.reveal === 'dim_to_bright') {
        const t0 = wtimes[wordIdx] ?? 0
        wordOpacity = local >= t0 ? 1 : 0.32
        wordIdx++
      }
      if (unit && unitKind(unit) === 'char') {
        const chars = [...w].map((ch, ci) => {
          const p = clamp01((local - unitIdx * stagger) / unitDur)
          unitIdx++
          return (
            <span key={ci} style={{ display: 'inline-block', ...unitFx(unit, p) }}>
              {ch}
            </span>
          )
        })
        parts.push(
          <span key={`w${si}-${wi}`} style={{ display: 'inline-block', whiteSpace: 'nowrap', opacity: wordOpacity }}>
            {chars}
          </span>
        )
      } else if (unit) {
        const p = clamp01((local - unitIdx * stagger) / unitDur)
        unitIdx++
        parts.push(
          <span key={`w${si}-${wi}`} style={{ display: 'inline-block', opacity: wordOpacity, ...unitFx(unit, p) }}>
            {w}
          </span>
        )
      } else {
        parts.push(
          <span key={`w${si}-${wi}`} style={{ opacity: wordOpacity, transition: 'none' }}>
            {w}
          </span>
        )
      }
    })
    lines[lines.length - 1].push(
      <span
        key={`sp${si}`}
        style={{
          ...st,
          display: 'inline-block',
          transform: [st.transform, fauxItalic ? 'skewX(-10deg)' : ''].filter(Boolean).join(' ') || undefined,
          lineHeight: L.lineHeight ?? 1.08
        }}
      >
        {parts}
      </span>
    )
  })

  const box = L.box
  const align = L.align || 'center'
  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
        textAlign: align,
        gap: 0
      }}
    >
      {lines.map((ln, i) => (
        // columnGap theo co chu THAT cua dong (truoc la 0.28em cua co mac dinh 16px -> 'KHOANCUA' dinh nhau)
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center', columnGap: `${(0.28 * (lineSize[i] || 80)).toFixed(1)}px` }}>
          {ln}
        </div>
      ))}
    </div>
  )
  if (!box) return content
  return (
    <div
      style={{
        background: box.color,
        borderRadius: (box.radius ?? 0.02) * W,
        padding: `${(box.padY ?? 0.012) * W}px ${(box.padX ?? 0.03) * W}px`,
        border: box.border,
        backdropFilter: box.blur ? `blur(${box.blur}px)` : undefined
      }}
    >
      {content}
    </div>
  )
}

// ---------------------------------------------------------------------------
// HINH / ANH / HUY HIEU / BO DEM / THANH / VET TOC DO
// ---------------------------------------------------------------------------
function fillOf(L: RSLayer): string | undefined {
  if (L.fillGradient && L.fillGradient.length) return `linear-gradient(160deg, ${L.fillGradient.join(', ')})`
  return L.fill
}

const ShapeLayer: React.FC<{ L: RSLayer; fx: FxState; W: number; H: number; local: number; base?: string }> = ({ L, fx, W, H, local, base }) => {
  const { fps } = useVideoConfig()
  const w = (L.w ?? 0.3) * W
  const h = L.h !== undefined ? L.h * H : w
  switch (L.type) {
    case 'box':
      return (
        <div
          style={{
            width: w,
            height: h,
            background: fillOf(L) || 'rgba(20,16,16,0.85)',
            borderRadius: (L.radius ?? 0.03) * W,
            border: L.border || (L.strokeWidth ? `${L.strokeWidth}px solid ${L.strokeColor || '#fff'}` : undefined),
            boxShadow: (L.shadow || []).map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.color}`).join(', ') || undefined,
            backdropFilter: L.box?.blur ? `blur(${L.box.blur}px)` : undefined
          }}
        />
      )
    case 'circle':
      return <div style={{ width: w, height: w, borderRadius: '50%', background: fillOf(L) || '#FFFFFF', border: L.border }} />
    case 'ring': {
      const sw = (L.strokeWidth ?? 6) * (W / 1080)
      const r = w / 2 - sw
      const c = 2 * Math.PI * r
      return (
        <svg width={w} height={w} style={{ overflow: 'visible', transform: 'rotate(-90deg)' }}>
          <circle cx={w / 2} cy={w / 2} r={r} fill="none" stroke={L.strokeColor || '#FFFFFF'} strokeWidth={sw} strokeDasharray={c} strokeDashoffset={c * (1 - fx.draw)} strokeLinecap="round" />
        </svg>
      )
    }
    case 'emoji':
      // icon emoji tho bi cam tu 2026-09-27 (sidecar da bo); spec cu con sot -> khong ve
      return null
    case 'image': {
      if (!L.path) return null
      const src = mediaUrl(base, L.path)
      const radius = L.mask === 'circle' ? '50%' : L.mask === 'round' ? (L.radius ?? 0.04) * W : 0
      const kb = L.loop?.preset === 'kenburns' ? 1 + 0.06 * local * 0.3 : 1
      return (
        <div
          style={{
            width: w,
            height: L.h !== undefined ? h : undefined,
            borderRadius: radius,
            overflow: 'hidden',
            border: L.border,
            boxShadow: (L.shadow || []).map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.color}`).join(', ') || undefined
          }}
        >
          <Img src={src} style={{ width: '100%', height: L.h !== undefined ? '100%' : 'auto', display: 'block', objectFit: L.fit || 'cover', transform: `scale(${kb})` }} />
        </div>
      )
    }
    case 'video': {
      // TU LIEU VIDEO cua nguoi dung (khung noi tren video, tat tieng). Lop nay luon nam trong <Sequence> rieng
      // (LayersLayer) nen khung cua OffthreadVideo tinh tu luc lop bat dau + mediaStart.
      if (!L.path) return null
      const radius = L.mask === 'circle' ? '50%' : L.mask === 'round' ? (L.radius ?? 0.04) * W : 0
      return (
        <div
          style={{
            width: w,
            height: L.h !== undefined ? h : undefined,
            borderRadius: radius,
            overflow: 'hidden',
            border: L.border,
            background: '#000',
            boxShadow: (L.shadow || []).map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.color}`).join(', ') || undefined
          }}
        >
          <OffthreadVideo
            src={mediaUrl(base, L.path)}
            trimBefore={Math.round((L.mediaStart || 0) * fps)}
            muted
            style={{ width: '100%', height: L.h !== undefined ? '100%' : 'auto', display: 'block', objectFit: L.fit || 'cover' }}
          />
        </div>
      )
    }
    case 'badge': {
      const d = w
      const active = !!L.active
      const f = fontCss(L.font || 'barlow_condensed', 900)
      const grad = L.fillGradient || (active ? ['#FFF3E6', '#FFD2A8'] : ['#FFE3CC', '#F6B98A'])
      return (
        <div
          style={{
            width: d,
            height: d,
            borderRadius: '50%',
            background: `radial-gradient(circle at 50% 35%, ${grad[0]}, ${grad[grad.length - 1]})`,
            border: `${d * 0.06}px solid ${L.strokeColor || (active ? '#F28B3C' : 'rgba(242,139,60,0.55)')}`,
            boxShadow: active ? `0 0 ${d * 0.35}px rgba(255,140,50,0.75), inset 0 0 ${d * 0.12}px rgba(255,255,255,0.8)` : 'inset 0 0 12px rgba(255,255,255,0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: active ? 1 : 0.6,
            color: L.color || '#E2601F'
          }}
        >
          {L.label && <div style={{ ...f, fontSize: d * 0.14, lineHeight: 1, letterSpacing: '0.04em' }}>{L.label}</div>}
          <div style={{ ...f, fontSize: d * 0.5, lineHeight: 0.95 }}>{L.value}</div>
        </div>
      )
    }
    case 'counter': {
      const d = L.enter?.duration ?? 1.0
      const p = ease('ease_out', local / Math.max(0.1, d))
      const v = (L.from ?? 0) + ((L.to ?? 100) - (L.from ?? 0)) * p
      const txt = `${L.prefix || ''}${v.toFixed(L.decimals ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${L.suffix || ''}`
      return <TextLayer L={{ ...L, enter: null, spans: [{ text: txt }] }} local={local} W={W} />
    }
    case 'progress': {
      const d = L.enter?.duration ?? 1.0
      const p = ease('ease_in_out', local / Math.max(0.1, d)) * ((L.to ?? 100) / 100)
      return (
        <div style={{ width: w, height: h, borderRadius: h / 2, background: L.fill || 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
          <div style={{ width: `${p * 100}%`, height: '100%', background: L.fillGradient ? `linear-gradient(90deg, ${L.fillGradient.join(', ')})` : L.color || '#FF8A00' }} />
        </div>
      )
    }
    default:
      return null
  }
}

/** Duong / mui ten: SVG phu ca khung, di qua `points` (phan so canvas), cong theo `curve`. */
const PathLayer: React.FC<{ L: RSLayer; fx: FxState; W: number; H: number }> = ({ L, fx, W, H }) => {
  const pts = (L.points && L.points.length >= 2 ? L.points : [[0.3, 0.5], [0.7, 0.5]]).map(([x, y]) => [x * W, y * H])
  const [a, b] = [pts[0], pts[pts.length - 1]]
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const nx = -(b[1] - a[1]) / (len || 1)
  const ny = (b[0] - a[0]) / (len || 1)
  const c = (L.curve ?? 0.25) * len
  const d = pts.length > 2 ? 'M ' + pts.map((p) => p.join(' ')).join(' L ') : `M ${a[0]} ${a[1]} Q ${mx + nx * c} ${my + ny * c} ${b[0]} ${b[1]}`
  const sw = (L.strokeWidth ?? 8) * (W / 1080)
  const color = L.strokeColor || L.color || '#E53935'
  // huong dau mui ten = tiep tuyen tai diem cuoi
  const cx = pts.length > 2 ? pts[pts.length - 2][0] : mx + nx * c
  const cy = pts.length > 2 ? pts[pts.length - 2][1] : my + ny * c
  const ang = Math.atan2(b[1] - cy, b[0] - cx)
  const hs = sw * 3.2
  const head = `M ${b[0] - hs * Math.cos(ang - 0.5)} ${b[1] - hs * Math.sin(ang - 0.5)} L ${b[0]} ${b[1]} L ${b[0] - hs * Math.cos(ang + 0.5)} ${b[1] - hs * Math.sin(ang + 0.5)}`
  return (
    <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: fx.opacity, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))' }}>
      <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - fx.draw} />
      {L.type === 'arrow' && fx.draw > 0.95 && <path d={head} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

/** Vet toc do toa ra tu tam (hieu ung "tap trung"). */
const SpeedLines: React.FC<{ L: RSLayer; local: number; W: number; H: number; opacity: number }> = ({ L, local, W, H, opacity }) => {
  const n = 46
  const cx = L.x * W
  const cy = L.y * H
  const R = Math.hypot(W, H)
  const rot = local * 25
  const lines = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        a: (i / n) * Math.PI * 2 + random(`sl${L.id}${i}`) * 0.12,
        inner: 0.32 + random(`sli${L.id}${i}`) * 0.12,
        wdt: 2 + random(`slw${L.id}${i}`) * 5
      })),
    [L.id]
  )
  return (
    <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, opacity }}>
      <g transform={`rotate(${rot} ${cx} ${cy})`}>
        {lines.map((l, i) => {
          const r0 = l.inner * Math.min(W, H) * 0.9
          const x0 = cx + Math.cos(l.a) * r0
          const y0 = cy + Math.sin(l.a) * r0
          const x1 = cx + Math.cos(l.a) * R
          const y1 = cy + Math.sin(l.a) * R
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={L.color || 'rgba(255,255,255,0.55)'} strokeWidth={l.wdt} strokeLinecap="round" />
        })}
      </g>
    </svg>
  )
}

export function mediaUrl(base: string | undefined, path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path
  if (!base) return 'file://' + path
  const name = path.split('/').pop() || 'media'
  return `${base}/${encodeURIComponent(name)}?p=${encodeURIComponent(path)}`
}

// ---------------------------------------------------------------------------
// MOT LOP
// ---------------------------------------------------------------------------
const Layer: React.FC<{ L: RSLayer; t: number; base?: string }> = ({ L, t, base }) => {
  const { width: W, height: H } = useVideoConfig()
  const local = t - L.start
  const remain = L.end - t
  const baseP: Props = {
    x: L.x,
    y: L.y,
    scale: L.scale ?? 1,
    scaleX: 1,
    rotation: L.rotation ?? 0,
    skewX: L.skewX ?? 0,
    opacity: L.opacity ?? 1,
    blur: 0
  }
  const k = keyframed(baseP, L.keyframes, local)
  let fx = neutral()
  const enter = L.enter
  if (enter && !UNIT_PRESETS.has(enter.preset)) {
    fx = combine(fx, motionFx(enter, clamp01(local / Math.max(0.05, enter.duration ?? 0.35)), W, H, L.id))
  } else if (enter && UNIT_PRESETS.has(enter.preset) && L.type !== 'text') {
    fx = combine(fx, motionFx({ ...enter, preset: 'fade' }, clamp01(local / 0.3), W, H, L.id))
  }
  if (L.exit) {
    const d = Math.max(0.05, L.exit.duration ?? 0.25)
    if (remain < d) fx = combine(fx, motionFx(exitAsEnter(L.exit), clamp01(remain / d), W, H, L.id + 'x'))
  }
  if (L.loop && L.loop.preset !== 'kenburns') fx = combine(fx, loopFx(L.loop, local, L.id))

  if (L.type === 'line' || L.type === 'arrow') return <PathLayer L={L} fx={fx} W={W} H={H} />
  if (L.type === 'speedlines') return <SpeedLines L={L} local={local} W={W} H={H} opacity={k.opacity * fx.opacity} />

  const anchor = L.anchor || 'center'
  const tr0 =
    anchor === 'left' ? 'translate(0,-50%)' : anchor === 'right' ? 'translate(-100%,-50%)' : anchor === 'top' ? 'translate(-50%,0)' : anchor === 'bottom' ? 'translate(-50%,-100%)' : 'translate(-50%,-50%)'
  const blur = k.blur + fx.blur
  const style: React.CSSProperties = {
    position: 'absolute',
    left: k.x * W,
    top: k.y * H,
    maxWidth: L.maxWidth ? L.maxWidth * W : undefined,
    // khong maxWidth: rong theo noi dung (max-content) — truoc day lop dat giua chi con 540px -> chu tu xuong dong
    // ngoai y thiet ke + code tinh sai chieu cao khoi (2026-09-27, phu de de len 'TAI KHOAN CUA MINH')
    width: L.type === 'text' ? (L.maxWidth ? L.maxWidth * W : 'max-content') : undefined,
    transform: `${tr0} translate(${fx.dx}px, ${fx.dy}px) rotate(${k.rotation + fx.rotation}deg) skewX(${k.skewX}deg) scale(${k.scale * fx.scale}) scale(${k.scaleX * fx.scaleX}, ${fx.scaleY})`,
    opacity: k.opacity * fx.opacity,
    filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
    clipPath: fx.clip,
    whiteSpace: L.type === 'text' && !L.maxWidth ? 'nowrap' : undefined
  }
  return (
    <div style={style}>
      {L.type === 'text' ? <TextLayer L={L} local={local} W={W} base={base} /> : <ShapeLayer L={L} fx={fx} W={W} H={H} local={local} base={base} />}
    </div>
  )
}

/** Lop VIDEO (tu lieu nguoi dung): ve trong Sequence rieng -> gio lop = khung cua Sequence + luc bat dau. */
const VideoLayerAt: React.FC<{ L: RSLayer; from: number; base?: string }> = ({ L, from, base }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return <Layer L={L} t={(frame + from) / fps} base={base} />
}

export const LayersLayer: React.FC<{ layers: RSLayer[]; base?: string; minTrack?: number; maxTrack?: number }> = ({ layers, base, minTrack = -Infinity, maxTrack = Infinity }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const inTrack = (L: RSLayer) => (L.track ?? 10) >= minTrack && (L.track ?? 10) < maxTrack
  // lop video luon gan san (Sequence tu an / hien + tai truoc 1s) -> video vao dung khung, xem truoc khong khung den
  const vids = layers.filter((L) => L.type === 'video' && !!L.path && inTrack(L))
  const vis = [...layers.filter((L) => L.type !== 'video' && t >= L.start && t <= L.end && inTrack(L)), ...vids].sort(
    (a, b) => (a.track ?? 10) - (b.track ?? 10)
  )
  // chu anh AI sap hien (<= 2.5s): tai + giai ma anh truoc -> xem truoc khong tre nhip khi anh moi tai
  const soon = layers.filter((L) => L.art && L.art.length && t < L.start && t >= L.start - 2.5 && inTrack(L))
  if (!vis.length && !soon.length) return null
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {vis.map((L) => {
        if (L.type !== 'video') return <Layer key={L.id} L={L} t={t} base={base} />
        const from = Math.round(L.start * fps)
        return (
          <Sequence key={L.id} from={from} durationInFrames={Math.max(1, Math.round((L.end - L.start) * fps))} premountFor={Math.round(fps)}>
            <VideoLayerAt L={L} from={from} base={base} />
          </Sequence>
        )
      })}
      {soon.flatMap((L) =>
        (L.art || []).map((a, i) => (
          <img key={`pre-${L.id}-${i}`} src={mediaUrl(base, a.src)} alt="" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, opacity: 0 }} />
        ))
      )}
    </AbsoluteFill>
  )
}

/** Tu gio nguon (Whisper) cua tung tu -> dung cho reveal dim_to_bright. */
export type { RSWord }
