// BO CUC theo thoi gian (RSScene): nen, B-roll (panel) va KHUNG chua A-roll.
// Doi bo cuc co the "morph" (khung A-roll truot/co gian sang vi tri moi) thay vi cat thang.
import React from 'react'
import { AbsoluteFill, Img, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import type { RSBackground, RSMedia, RSRect, RSScene } from './types'
import { ease, mediaUrl } from './Layers'
import { gradeFilter } from './look'

export const FULL: RSRect = { x: 0, y: 0, w: 1, h: 1, radius: 0 }

export function sceneAt(scenes: RSScene[] | undefined, t: number): { cur: RSScene | null; prev: RSScene | null; p: number } {
  if (!scenes || !scenes.length) return { cur: null, prev: null, p: 1 }
  let idx = -1
  for (let i = 0; i < scenes.length; i++) if (t >= scenes[i].start && t < scenes[i].end) idx = i
  if (idx < 0) {
    // khoang trong giua cac scene = A-roll FULL. Vua het scene co morph -> truot ve full.
    const before = scenes.filter((s) => s.end <= t)
    const last = before.length ? before[before.length - 1] : null
    const m = last?.morph ?? 0
    if (last && m > 0 && t - last.end < m) return { cur: null, prev: last, p: ease('ease_in_out', (t - last.end) / m) }
    return { cur: null, prev: null, p: 1 }
  }
  const cur = scenes[idx]
  const prev = idx > 0 && Math.abs(scenes[idx - 1].end - cur.start) < 0.05 ? scenes[idx - 1] : null
  const m = cur.morph ?? 0
  const p = m > 0 ? ease('ease_in_out', (t - cur.start) / m) : 1
  return { cur, prev, p }
}

const hidesAroll = (s: RSScene | null) => !!s && (s.layout === 'broll' || s.layout === 'graphic')

export function arollRect(s: RSScene | null): RSRect {
  if (!s || s.layout === 'full' || !s.aroll) return FULL
  return s.aroll
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p

/** Khung A-roll tai gio t (px) + do hien. */
export function arollStateAt(scenes: RSScene[] | undefined, t: number, W: number, H: number) {
  const { cur, prev, p } = sceneAt(scenes, t)
  const to = arollRect(cur)
  const from = prev ? arollRect(prev) : to
  const r: RSRect = {
    x: lerp(from.x, to.x, p),
    y: lerp(from.y, to.y, p),
    w: lerp(from.w, to.w, p),
    h: lerp(from.h, to.h, p),
    radius: lerp(from.radius, to.radius, p)
  }
  const visTo = hidesAroll(cur) ? 0 : 1
  const visFrom = prev ? (hidesAroll(prev) ? 0 : 1) : visTo
  const extTo = cur?.popout || 0
  const extFrom = prev ? prev.popout || 0 : extTo
  return {
    left: r.x * W,
    top: r.y * H,
    width: r.w * W,
    height: r.h * H,
    radius: r.radius * W,
    opacity: lerp(visFrom, visTo, p),
    /** px keo dai khung video len tren (pop-out) */
    ext: lerp(extFrom, extTo, p) * H,
    border: cur?.aroll?.border,
    shadow: cur?.aroll?.shadow
  }
}

// ---------------------------------------------------------------------------
// NEN
// ---------------------------------------------------------------------------
const Pattern: React.FC<{ kind: string; color: string; W: number; H: number; t: number }> = ({ kind, color, W, H, t }) => {
  if (kind === 'curves') {
    const drift = Math.sin(t * 0.4) * W * 0.01
    return (
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {[
          `M ${-0.1 * W} ${0.25 * H + drift} C ${0.3 * W} ${0.05 * H}, ${0.6 * W} ${0.45 * H}, ${1.1 * W} ${0.2 * H}`,
          `M ${0.55 * W} ${-0.05 * H} C ${0.45 * W} ${0.3 * H}, ${0.9 * W} ${0.45 * H}, ${0.8 * W} ${1.05 * H}`,
          `M ${-0.05 * W} ${0.8 * H} C ${0.35 * W} ${0.6 * H - drift}, ${0.7 * W} ${0.95 * H}, ${1.05 * W} ${0.7 * H}`
        ].map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth={W * 0.0035} />
        ))}
      </svg>
    )
  }
  if (kind === 'grid' || kind === 'dots') {
    const step = W / 12
    const pts: React.ReactNode[] = []
    for (let x = step / 2; x < W; x += step)
      for (let y = step / 2; y < H; y += step)
        pts.push(kind === 'dots' ? <circle key={`${x}-${y}`} cx={x} cy={y} r={W * 0.003} fill={color} /> : null)
    return (
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {kind === 'grid' && (
          <>
            {Array.from({ length: 13 }, (_, i) => (
              <line key={`v${i}`} x1={i * step} y1={0} x2={i * step} y2={H} stroke={color} strokeWidth={1} />
            ))}
            {Array.from({ length: Math.ceil(H / step) + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * step} x2={W} y2={i * step} stroke={color} strokeWidth={1} />
            ))}
          </>
        )}
        {pts}
      </svg>
    )
  }
  if (kind === 'rays') {
    return (
      <AbsoluteFill
        style={{
          background: `repeating-conic-gradient(from ${t * 8}deg at 50% 45%, ${color} 0deg 4deg, transparent 4deg 16deg)`,
          maskImage: 'radial-gradient(circle at 50% 45%, transparent 18%, black 70%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 45%, transparent 18%, black 70%)'
        }}
      />
    )
  }
  return null
}

const Backdrop: React.FC<{ bg: RSBackground; base?: string; t: number }> = ({ bg, base, t }) => {
  const { width: W, height: H } = useVideoConfig()
  let fill: React.ReactNode = null
  if (bg.kind === 'gradient' || bg.kind === 'color') {
    const cols = bg.colors && bg.colors.length ? bg.colors : ['#F7C9A6', '#E0703A']
    fill = (
      <AbsoluteFill
        style={{
          background: bg.kind === 'color' ? cols[0] : `linear-gradient(${bg.angle ?? 165}deg, ${cols.join(', ')})`
        }}
      />
    )
  } else if (bg.kind === 'image' && bg.path) {
    fill = (
      <AbsoluteFill style={{ filter: [bg.blur ? `blur(${bg.blur}px)` : '', bg.grade ? gradeFilter(bg.grade, 1) : ''].filter(Boolean).join(' ') || undefined, transform: `scale(${1.08 + t * 0.004})` }}>
        <Img src={mediaUrl(base, bg.path)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    )
  }
  return (
    <AbsoluteFill>
      {fill}
      {bg.pattern && bg.pattern !== 'none' && <Pattern kind={bg.pattern} color={bg.patternColor || 'rgba(255,255,255,0.28)'} W={W} H={H} t={t} />}
    </AbsoluteFill>
  )
}

export const SceneBackdrop: React.FC<{ scenes?: RSScene[]; base?: string }> = ({ scenes, base }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const { cur, prev, p } = sceneAt(scenes, t)
  // dang truot ve full: giu nen cua scene vua het cho toi khi A-roll phu kin khung
  if (!cur && prev && prev.bg) return <Backdrop bg={prev.bg} base={base} t={t} />
  if (!cur || !cur.bg) return null
  return (
    <AbsoluteFill>
      {prev && prev.bg && p < 1 && <Backdrop bg={prev.bg} base={base} t={t} />}
      <AbsoluteFill style={{ opacity: prev && prev.bg ? p : 1 }}>
        <Backdrop bg={cur.bg} base={base} t={t} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// B-ROLL (panel)
// ---------------------------------------------------------------------------
const PanelMedia: React.FC<{ m: RSMedia; dur: number; base?: string }> = ({ m, dur, base }) => {
  const frame = useCurrentFrame() // tinh tu dau scene
  const { fps } = useVideoConfig()
  const local = frame / fps
  const p = Math.min(1, local / Math.max(0.5, dur))
  const kb = m.kenburns || 'in'
  const sc = kb === 'out' ? 1.14 - 0.1 * p : kb === 'none' ? 1 : 1.02 + 0.1 * p
  const tx = kb === 'left' ? 3 - 6 * p : kb === 'right' ? -3 + 6 * p : 0
  const ty = kb === 'up' ? 2 - 4 * p : 0
  const filt = [m.grade ? gradeFilter(m.grade, 1) : '', m.blur ? `blur(${m.blur}px)` : ''].filter(Boolean).join(' ') || undefined
  const style: React.CSSProperties = { width: '100%', height: '100%', objectFit: m.fit || 'cover' }
  const media =
    m.kind === 'image' ? (
      <Img src={mediaUrl(base, m.path)} style={style} />
    ) : (
      <OffthreadVideo src={mediaUrl(base, m.path)} trimBefore={Math.round((m.srcStart || 0) * fps)} muted style={style} />
    )
  if (m.fit === 'contain') {
    // tu lieu (anh chup man hinh, bang gia...) giu NGUYEN khung, khong cat chu: lot ban mo cua chinh anh phia sau
    // (video: nen toi — giai ma them 1 ban video thi xem truoc giat)
    return (
      <AbsoluteFill style={{ transform: `scale(${sc}) translate(${tx}%, ${ty}%)`, filter: filt }}>
        {m.kind === 'image' ? (
          <AbsoluteFill style={{ filter: 'blur(28px) brightness(0.55)', transform: 'scale(1.15)' }}>
            <Img src={mediaUrl(base, m.path)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </AbsoluteFill>
        ) : (
          <AbsoluteFill style={{ background: '#111114' }} />
        )}
        <AbsoluteFill>{media}</AbsoluteFill>
      </AbsoluteFill>
    )
  }
  return <AbsoluteFill style={{ transform: `scale(${sc}) translate(${tx}%, ${ty}%)`, filter: filt }}>{media}</AbsoluteFill>
}

export const ScenePanels: React.FC<{ scenes?: RSScene[]; base?: string }> = ({ scenes, base }) => {
  const { fps, width: W, height: H } = useVideoConfig()
  if (!scenes) return null
  return (
    <>
      {scenes
        .filter((s) => s.panel && s.panel.path)
        .map((s) => {
          const r = s.panelRect || FULL
          const from = Math.round(s.start * fps)
          // giu B-roll them 1 nhip morph sau scene (A-roll dang truot/hien lai de len), khong de lo nen den
          const next = scenes.find((x) => x.start >= s.end - 0.001 && x !== s)
          const tail = Math.min(s.morph ?? 0, next ? Math.max(0, next.start - s.end) : Infinity)
          const dur = Math.max(1, Math.round((s.end - s.start + tail) * fps))
          return (
            <Sequence key={s.id} from={from} durationInFrames={dur} premountFor={Math.round(fps)}>
              <div
                style={{
                  position: 'absolute',
                  left: r.x * W,
                  top: r.y * H,
                  width: r.w * W,
                  height: r.h * H,
                  borderRadius: r.radius * W,
                  overflow: 'hidden'
                }}
              >
                <PanelMedia m={s.panel!} dur={s.end - s.start} base={base} />
              </div>
            </Sequence>
          )
        })}
    </>
  )
}
