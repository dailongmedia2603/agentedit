// Ve caption theo kieu trong remotion_catalog.json -> caption_styles.
// Khac CapCut: trinh duyet TU XUONG DONG trong khung 86% be ngang, nen khong co
// chuyen chu tran ra ngoai man hinh. Viec con lai la chon co chu vua so dong.
import React from 'react'
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import type { RSCaption, RSWord } from './types'
import { fontOf, nearestWeight } from './fonts'
import { captionFrac, clamp01, easeOut, pxScale } from './look'

const MAX_LINES: Record<string, number> = { hero: 3, support: 3, micro: 2 }

function norm(w: string): string {
  return w
    .toLocaleLowerCase('vi')
    .normalize('NFC')
    .replace(/[.,!?;:"'“”‘’()\[\]{}…-]/g, '')
}

/** Moc tung chu: chia thoi gian cau theo do dai chu (chu dai noi lau hon). */
export function wordTimings(c: RSCaption): RSWord[] {
  if (c.words && c.words.length) return c.words
  const toks = c.text.split(/\s+/).filter(Boolean)
  const span = Math.max(0.1, (c.end - c.start) * 0.92)
  const weights = toks.map((w) => Math.max(2, w.length + 1))
  const total = weights.reduce((a, b) => a + b, 0)
  let cur = c.start
  return toks.map((w, i) => {
    const d = (span * weights[i]) / total
    const out = { text: w, start: cur, end: cur + d }
    cur += d
    return out
  })
}

/** Co chu vua khung: khong vuot so dong toi da, chu dai nhat vua 1 dong. */
export function fitSize(c: RSCaption, W: number, H: number = 1920): number {
  const f = fontOf(c.font)
  const avail = W * captionFrac(W, H)
  const upper = c.uppercase ? 1.12 : 1
  const cw = f.width * upper
  const scaleW = pxScale(W, H)
  let size = c.size * scaleW
  const text = c.uppercase ? c.text.toLocaleUpperCase('vi') : c.text
  const longest = Math.max(...text.split(/\s+/).map((w) => w.length), 1)
  size = Math.min(size, avail / (longest * cw * 1.06))
  const lines = MAX_LINES[c.role] ?? 3
  const needed = text.length * 1.15
  const perLineAtSize = (s: number) => avail / (s * cw)
  if (needed > perLineAtSize(size) * lines) size = (avail * lines) / (needed * cw)
  return Math.max(size, c.size * scaleW * 0.5)
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return 1
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const readableOn = (bg: string) => (luminance(bg) > 0.4 ? '#111111' : '#FFFFFF')

/** Vien / bong chu cua phu de karaoke (plan chon). Khong khai = vien day nhu ban cu (spec cu render y nhu truoc). */
function edgeStyle(edge: string | undefined, size: number): React.CSSProperties {
  if (edge === 'soft_shadow') {
    return {
      WebkitTextStroke: '0px transparent',
      textShadow: `0 ${size * 0.04}px ${size * 0.16}px rgba(0,0,0,0.72), 0 0 ${size * 0.05}px rgba(0,0,0,0.45)`
    }
  }
  if (edge === 'thin_outline') {
    return {
      WebkitTextStroke: `${Math.max(1.5, size * 0.045)}px rgba(0,0,0,0.92)`,
      paintOrder: 'stroke fill',
      textShadow: `0 ${size * 0.04}px ${size * 0.1}px rgba(0,0,0,0.45)`
    }
  }
  // 'bold_outline' (va spec cu chua co edge): vien den day nhu truoc
  const stroke = Math.max(2, size * 0.085)
  return {
    WebkitTextStroke: `${stroke}px #000`,
    paintOrder: 'stroke fill',
    textShadow: `0 ${size * 0.06}px ${size * 0.14}px rgba(0,0,0,0.55)`
  }
}

const Caption: React.FC<{ c: RSCaption }> = ({ c }) => {
  const frame = useCurrentFrame()
  const { fps, width: W, height: H } = useVideoConfig()
  const t = frame / fps
  if (t < c.start || t > c.end) return null

  const local = t - c.start
  const dur = Math.max(0.1, c.end - c.start)
  const f = fontOf(c.font)
  const size = fitSize(c, W, H)
  const weight = c.weight ? nearestWeight(c.font, c.weight, c.role) : f.weights[c.role] ?? 700
  const text = c.uppercase ? c.text.toLocaleUpperCase('vi') : c.text
  // moc tung chu co san (Whisper) giu chu goc -> viet hoa o day cho giong ca cau
  const words = wordTimings({ ...c, text }).map((w) =>
    c.uppercase ? { ...w, text: w.text.toLocaleUpperCase('vi') } : w
  )
  const emph = new Set(
    (c.emphasis || []).flatMap((p) => p.split(/\s+/)).map(norm).filter(Boolean)
  )
  const isEmph = (w: string) => emph.has(norm(w))
  const exit = clamp01((c.end - t) / 0.15)
  const enterSpring = spring({ frame: Math.round(local * fps), fps, config: { damping: 11, stiffness: 170, mass: 0.7 } })
  const fadeIn = easeOut(clamp01(local / 0.22))

  const stroke = Math.max(2, size * 0.085)
  const outlined: React.CSSProperties = {
    WebkitTextStroke: `${stroke}px #000`,
    paintOrder: 'stroke fill',
    textShadow: `0 ${size * 0.06}px ${size * 0.14}px rgba(0,0,0,0.55)`
  }

  const top = (0.5 + c.y / 2) * H
  const base: React.CSSProperties = {
    position: 'absolute',
    left: (W * (1 - captionFrac(W, H))) / 2,
    width: W * captionFrac(W, H),
    top,
    transform: 'translateY(-50%)',
    textAlign: 'center',
    fontFamily: `"${f.family}", "Be Vietnam Pro", sans-serif`,
    fontWeight: weight,
    fontSize: size,
    lineHeight: 1.18,
    color: c.color,
    letterSpacing: c.role === 'hero' ? '-0.01em' : '0',
    wordBreak: 'keep-all',
    overflowWrap: 'break-word'
  }

  let body: React.ReactNode
  let anim: React.CSSProperties = {}

  switch (c.style) {
    case 'hero_title': {
      const s = 0.4 + 0.6 * enterSpring
      anim = {
        transform: `translateY(-50%) scale(${s * (1 + 0.08 * (1 - exit))}) rotate(${(1 - enterSpring) * -4}deg)`,
        opacity: fadeIn * exit
      }
      body = (
        <span style={{ ...outlined, WebkitTextStroke: `${stroke * 1.25}px #000` }}>
          {words.map((w, i) => (
            <span key={i} style={{ color: isEmph(w.text) || !emph.size ? c.accent : c.color }}>
              {w.text}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      )
      break
    }
    case 'tiktok_box': {
      const bg = c.role === 'hero' ? c.accent : 'rgba(255,255,255,0.96)'
      const fg = c.role === 'hero' ? readableOn(c.accent) : '#111111'
      anim = { transform: `translateY(-50%) scale(${0.85 + 0.15 * enterSpring})`, opacity: fadeIn * exit }
      body = (
        <span
          style={{
            background: bg,
            color: fg,
            padding: `${size * 0.1}px ${size * 0.28}px`,
            borderRadius: size * 0.22,
            boxDecorationBreak: 'clone',
            WebkitBoxDecorationBreak: 'clone',
            lineHeight: 1.42
          }}
        >
          {words.map((w, i) => (
            <span key={i} style={{ color: c.role !== 'hero' && isEmph(w.text) ? c.accent : fg }}>
              {w.text}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      )
      break
    }
    case 'karaoke':
    case 'pop_words': {
      const pop = c.style === 'pop_words'
      const fx = pop ? 'pop' : c.fx || 'color_pop'
      const edge = edgeStyle(c.edge, size)
      anim = { opacity: (pop ? 1 : fadeIn) * exit }
      // box: moi chu cung le ngang (trong suot khi khong sang) -> hop bat len khong lam xo chu
      const padX = fx === 'box' ? '0.14em' : 0
      body = (
        <span>
          {words.map((w, i) => {
            const active = t >= w.start && t < w.end
            const said = t >= w.start
            const wLocal = Math.round((t - w.start) * fps)
            const sp = said ? spring({ frame: wLocal, fps, config: { damping: 12, stiffness: 220, mass: 0.5 } }) : 0
            const prog = clamp01((t - w.start) / Math.max(0.05, w.end - w.start))
            const hot = active || (isEmph(w.text) && said)
            const style: React.CSSProperties = {
              ...edge,
              display: 'inline-block',
              position: 'relative',
              color: hot ? c.accent : c.color,
              opacity: said ? 1 : 0.82,
              padding: `0 ${padX}`,
              marginRight: i < words.length - 1 ? (fx === 'box' ? '0.08em' : '0.26em') : 0
            }
            let extra: React.ReactNode = null
            if (fx === 'pop') {
              style.transform = `scale(${said ? 0.5 + 0.5 * sp : 0.5})`
              style.opacity = said ? 1 : 0
            } else if (fx === 'color_pop') {
              style.transform = `scale(${active ? 1.08 : 1})`
            } else if (fx === 'fill_sweep') {
              // chu nen mau thuong + ban sao mau nhan bi cat theo tien do noi (trai -> phai)
              const fill = said ? (active ? prog : 1) : 0
              style.color = c.color
              style.opacity = 1
              extra = (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    color: c.accent,
                    clipPath: `inset(-20% ${(1 - fill) * 100}% -20% 0)`,
                    textShadow: 'none'
                  }}
                >
                  {w.text}
                </span>
              )
            } else if (fx === 'box') {
              const on = active ? 0.85 + 0.15 * sp : 0
              style.color = active ? readableOn(c.accent) : isEmph(w.text) && said ? c.accent : c.color
              style.opacity = 1
              if (active) {
                style.WebkitTextStroke = '0px transparent'
                style.textShadow = 'none'
              }
              extra = active ? (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: '0.02em 0',
                    background: c.accent,
                    borderRadius: '0.22em',
                    transform: `scale(${on})`,
                    zIndex: -1,
                    boxShadow: `0 ${size * 0.05}px ${size * 0.16}px rgba(0,0,0,0.35)`
                  }}
                />
              ) : null
              style.zIndex = 0
            } else if (fx === 'underline') {
              const bar = said ? (active ? easeOut(prog) : isEmph(w.text) ? 1 : 0) : 0
              style.color = active || (isEmph(w.text) && said) ? c.accent : c.color
              extra = bar > 0 ? (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    bottom: '-0.06em',
                    height: '0.11em',
                    width: `${bar * 100}%`,
                    background: c.accent,
                    borderRadius: '0.06em',
                    boxShadow: `0 ${size * 0.02}px ${size * 0.06}px rgba(0,0,0,0.45)`
                  }}
                />
              ) : null
            } else if (fx === 'glow') {
              if (active) {
                style.textShadow = [edge.textShadow, `0 0 ${size * 0.22}px ${c.accent}`, `0 0 ${size * 0.45}px ${c.accent}`]
                  .filter(Boolean)
                  .join(', ')
              }
            } else if (fx === 'lift') {
              const up = active ? sp : 0
              style.transform = `translateY(${-0.1 * up}em) scale(${1 + 0.12 * up})`
              style.opacity = said ? 1 : 0.55
              style.color = active ? c.accent : isEmph(w.text) && said ? c.accent : c.color
            }
            return (
              <span key={i} style={style}>
                {extra && fx === 'box' ? extra : null}
                {w.text}
                {extra && fx !== 'box' ? extra : null}
              </span>
            )
          })}
        </span>
      )
      break
    }
    case 'neon': {
      const flicker = local < 0.35 ? (Math.round(local * 30) % 3 === 0 ? 0.45 : 1) : 1
      anim = { opacity: fadeIn * exit * flicker }
      body = (
        <span
          style={{
            color: '#FFFFFF',
            // vien toi mong + bong sat chu truoc glow: chu trang glow mau tren nen sang van doc duoc (2026-09-27)
            WebkitTextStroke: `${Math.max(1.5, size * 0.022)}px rgba(14,10,10,0.75)`,
            paintOrder: 'stroke fill',
            textShadow: [`0 ${size * 0.03}px ${size * 0.06}px rgba(0,0,0,0.6)`]
              .concat([8, 22, 44].map((r) => `0 0 ${r * (size / 90)}px ${c.accent}`))
              .join(', ')
          }}
        >
          {text}
        </span>
      )
      break
    }
    case 'typewriter': {
      const chars = [...text]
      const speed = Math.min(dur * 0.65, chars.length * 0.045)
      const n = Math.floor(chars.length * clamp01(local / Math.max(0.05, speed)))
      anim = { opacity: exit }
      body = (
        <span style={outlined}>
          {chars.slice(0, n).join('')}
          <span style={{ color: 'transparent', WebkitTextStroke: '0px transparent', textShadow: 'none' }}>
            {chars.slice(n).join('')}
          </span>
        </span>
      )
      break
    }
    case 'highlight_marker': {
      anim = { transform: `translateY(-50%) translateY(${(1 - fadeIn) * size * 0.3}px)`, opacity: fadeIn * exit }
      const p = easeOut(clamp01((local - 0.12) / 0.35))
      body = (
        <span>
          {words.map((w, i) => {
            const on = isEmph(w.text)
            return (
              <span
                key={i}
                style={
                  on
                    ? {
                        color: '#111111',
                        backgroundImage: `linear-gradient(${c.accent}, ${c.accent})`,
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: `${p * 100}% 78%`,
                        backgroundPosition: '0 70%',
                        padding: `0 ${size * 0.08}px`,
                        borderRadius: size * 0.08
                      }
                    : { ...outlined, color: c.color }
                }
              >
                {w.text}
                {i < words.length - 1 ? ' ' : ''}
              </span>
            )
          })}
        </span>
      )
      break
    }
    case 'lower_third': {
      const slide = easeOut(clamp01(local / 0.3))
      return (
        <div
          style={{
            position: 'absolute',
            left: W * 0.06,
            top,
            transform: `translateY(-50%) translateX(${(1 - slide) * -W * 0.4}px)`,
            opacity: exit,
            display: 'flex',
            alignItems: 'stretch',
            maxWidth: W * 0.8
          }}
        >
          <div style={{ width: size * 0.18, background: c.accent, borderRadius: size * 0.06 }} />
          <div
            style={{
              background: 'rgba(12,12,16,0.78)',
              color: '#FFFFFF',
              fontFamily: `"${f.family}", sans-serif`,
              fontWeight: weight,
              fontSize: size,
              lineHeight: 1.2,
              padding: `${size * 0.28}px ${size * 0.5}px`,
              borderRadius: `0 ${size * 0.25}px ${size * 0.25}px 0`
            }}
          >
            {text}
          </div>
        </div>
      )
    }
    case 'minimal': {
      anim = { transform: `translateY(-50%) translateY(${(1 - fadeIn) * size * 0.25}px)`, opacity: fadeIn * exit }
      body = <span style={{ textShadow: `0 ${size * 0.05}px ${size * 0.25}px rgba(0,0,0,0.75)` }}>{text}</span>
      break
    }
    case 'outline_bold':
    default: {
      const s = c.role === 'hero' ? 0.6 + 0.4 * enterSpring : 0.9 + 0.1 * fadeIn
      anim = { transform: `translateY(-50%) scale(${s})`, opacity: fadeIn * exit }
      body = (
        <span style={outlined}>
          {words.map((w, i) => (
            <span key={i} style={{ color: isEmph(w.text) ? c.accent : c.color }}>
              {w.text}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      )
    }
  }

  return <div style={{ ...base, ...anim }}>{body}</div>
}

export const CaptionsLayer: React.FC<{ captions: RSCaption[] }> = ({ captions }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const visible = captions.filter((c) => t >= c.start && t <= c.end)
  if (!visible.length) return null
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {visible.map((c) => (
        <Caption key={c.id} c={c} />
      ))}
    </AbsoluteFill>
  )
}
