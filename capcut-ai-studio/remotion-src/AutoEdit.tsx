import React, { useEffect, useMemo, useState } from 'react'
import {
  AbsoluteFill,
  Freeze,
  Html5Audio,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig
} from 'remotion'
import type { AutoEditProps, RenderSpec, RSClip, RSEffect, RSOverlay } from './types'
import { CaptionsLayer } from './Captions'
import { fontLoadQueries } from './fonts'
import {
  LayerStyle,
  cameraAt,
  clamp01,
  easeOut,
  envelope,
  flashAmount,
  gradeFilter,
  gradeTint,
  neutralLayer,
  transitionStyle
} from './look'
import { LayersLayer } from './Layers'
import { FxLayer, fxTransformAt, fxTransformFilters } from './FxLayer'
import { SceneBackdrop, ScenePanels, arollStateAt } from './Scenes'

/** Duong dan file tren may -> URL ma trinh duyet (Player lan may render) tai duoc. */
export function mediaSrc(base: string | undefined, path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path
  if (!base) return 'file://' + path
  const name = path.split('/').pop() || 'media'
  return `${base}/${encodeURIComponent(name)}?p=${encodeURIComponent(path)}`
}

const toFrame = (t: number, fps: number) => Math.round(t * fps)

// SVG filter tach kenh mau (dung cho glitch / rgb_split). id rieng cho tung lop.
const RgbSplitDefs: React.FC<{ id: string; amount: number }> = ({ id, amount }) => (
  <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
    <filter id={id} x="-5%" y="0%" width="110%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
      <feOffset in="r" dx={amount} dy={0} result="ro" />
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
      <feOffset in="b" dx={-amount} dy={0} result="bo" />
      <feBlend in="ro" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="bo" mode="screen" />
    </filter>
  </svg>
)

// Ban do lech (displacement map) cho ong kinh MAT CA: giua phong to, vien bi ep cong.
// Ve 1 lan bang canvas -> data URL (dung duoc ca trong Player lan Chrome headless).
function useFisheyeMap(): string {
  return useMemo(() => {
    if (typeof document === 'undefined') return ''
    const N = 128
    const cv = document.createElement('canvas')
    cv.width = N
    cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return ''
    const img = ctx.createImageData(N, N)
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const u = (i / (N - 1)) * 2 - 1
        const v = (j / (N - 1)) * 2 - 1
        const r = Math.min(1.42, Math.hypot(u, v))
        // lay mau o ban kinh r^1.6 (gan tam hon) -> tam phong to, vien nen lai
        const k = r > 1e-4 ? Math.pow(r, 0.6) - 1 : -1
        const dx = u * k * 0.5 // gia tri trong [-0.5,0.5] cua nua canh
        const dy = v * k * 0.5
        const o = (j * N + i) * 4
        img.data[o] = Math.round(128 + dx * 255)
        img.data[o + 1] = Math.round(128 + dy * 255)
        img.data[o + 2] = 128
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return cv.toDataURL('image/png')
  }, [])
}

const FisheyeDefs: React.FC<{ id: string; amount: number; map: string; w: number; h: number }> = ({ id, amount, map, w, h }) => (
  <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
    <filter id={id} x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
      <feImage href={map} x={0} y={0} width={w} height={h} preserveAspectRatio="none" result="map" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={amount * Math.min(w, h) * 0.9} xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
)

function layerCss(s: LayerStyle, filterId: string | null): React.CSSProperties {
  const filters: string[] = []
  if (s.blur > 0.05) filters.push(`blur(${s.blur.toFixed(2)}px)`)
  if (filterId) filters.push(`url(#${filterId})`)
  return {
    opacity: s.opacity,
    transform: `translate(${s.tx}%, ${s.ty}%) rotate(${s.rotate}deg) scale(${s.scale})`,
    filter: filters.length ? filters.join(' ') : undefined,
    clipPath: s.clipPath,
    zIndex: s.z
  }
}

/** Vi tri anh (object-position, px) de khuon mat nam giua khung cat. `fy` = ti le cao do dat mat
 *  (0.42 = hoi cao hon giua; pop-out dat mat sat mep tren the de dau troi ra).
 *  Giu KHOP voi motion_design.face_in_canvas (Python) — ben do dung de ne chu khoi mat. */
function facePosition(clip: RSClip, cw: number, ch: number, fy = 0.42): string | undefined {
  if (!clip.face || !clip.srcW || !clip.srcH) return undefined
  const s = Math.max(cw / clip.srcW, ch / clip.srcH)
  const iw = clip.srcW * s
  const ih = clip.srcH * s
  const left = Math.min(0, Math.max(cw - iw, cw * 0.5 - clip.face.cx * iw))
  const top = Math.min(0, Math.max(ch - ih, ch * fy - clip.face.cy * ih))
  return `${left.toFixed(1)}px ${top.toFixed(1)}px`
}

// ---------------------------------------------------------------------------
// MOT CLIP tren timeline (co ca phan "tay cam" cho chuyen canh hoa tan/day)
// ---------------------------------------------------------------------------
const ClipLayer: React.FC<{ clip: RSClip; prev: RSClip | null; base?: string; cw: number; ch: number; fy?: number; subject?: boolean }> = ({
  clip,
  prev,
  base,
  cw,
  ch,
  fy,
  subject
}) => {
  const frame = useCurrentFrame() // da tinh tu dau Sequence
  const { fps } = useVideoConfig()
  const inTr = prev?.transitionOut || null
  const outTr = clip.transitionOut
  const inHalf = inTr?.overlap ? inTr.duration / 2 : 0
  const showStart = clip.start - inHalf
  const t = showStart + frame / fps

  const st: LayerStyle = neutralLayer()
  const apply = (p: Partial<LayerStyle> | null) => {
    if (!p) return
    if (p.opacity !== undefined) st.opacity *= p.opacity
    if (p.scale !== undefined) st.scale *= p.scale
    if (p.rotate !== undefined) st.rotate += p.rotate
    if (p.tx !== undefined) st.tx += p.tx
    if (p.ty !== undefined) st.ty += p.ty
    if (p.blur !== undefined) st.blur += p.blur
    if (p.rgbSplit !== undefined) st.rgbSplit = Math.max(st.rgbSplit, p.rgbSplit)
    if (p.clipPath) st.clipPath = p.clipPath
    if (p.z !== undefined) st.z = p.z
  }
  if (inTr && prev) apply(transitionStyle(inTr, clip.start, t, 'in', prev.id))
  if (outTr) apply(transitionStyle(outTr, clip.end, t, 'out', clip.id))

  const filterId = st.rgbSplit > 0.3 ? `rgb-${clip.id}` : null
  const src = mediaSrc(base, clip.path)
  const trim = Math.max(0, toFrame(clip.srcStart - inHalf * clip.speed, fps))
  // Tieng chi nam trong phan LOI cua clip. Phan tay cam (truoc start / sau end)
  // la chat lieu nam ngoai plan -> tat tieng, chi de lay hinh cho chuyen canh.
  const volumeAt = (f: number) => {
    const tt = showStart + f / fps
    if (tt < clip.start - 0.001 || tt > clip.end + 0.001) return 0
    const edgeIn = clamp01((tt - clip.start) / 0.03)
    const edgeOut = clamp01((clip.end - tt) / 0.05)
    return Math.min(1, clip.volume) * Math.min(edgeIn, edgeOut)
  }
  const inner: React.CSSProperties = {
    width: '100%',
    height: '100%',
    transform: `translate(${clip.x * 50}%, ${clip.y * 50}%) scale(${clip.scale})`
  }
  const pos = clip.fit === 'blur' ? undefined : facePosition(clip, cw, ch, fy)
  if (subject && clip.subject) {
    // Ban "chi co nguoi": cung khung/vi tri/chuyen canh voi clip goc, bat dau dung giay nguon cua file tach nen
    const sub = clip.subject
    const srcAtShow = clip.srcStart - inHalf * clip.speed
    const offF = Math.max(0, Math.round(((sub.srcStart - srcAtShow) / clip.speed) * fps))
    const durF = Math.max(1, Math.round(((sub.srcEnd - Math.max(sub.srcStart, srcAtShow)) / clip.speed) * fps))
    return (
      <AbsoluteFill style={layerCss(st, filterId)}>
        {filterId && <RgbSplitDefs id={filterId} amount={st.rgbSplit} />}
        <AbsoluteFill style={inner}>
          <Sequence from={offF} durationInFrames={durF} layout="none">
            <OffthreadVideo
              src={mediaSrc(base, sub.path)}
              trimBefore={Math.max(0, toFrame(srcAtShow - sub.srcStart, fps))}
              playbackRate={clip.speed}
              muted
              transparent
              pauseWhenBuffering
              acceptableTimeShiftInSeconds={SUBJECT_SYNC_SEC}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos }}
            />
          </Sequence>
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
  const videoProps = {
    src,
    trimBefore: trim,
    playbackRate: clip.speed,
    pauseWhenBuffering: true,
    // clip co lop tach nguoi: xem truoc giu 2 video sat nhau hon (mac dinh Remotion cho lech 0.45s)
    ...(clip.subject ? { acceptableTimeShiftInSeconds: SUBJECT_SYNC_SEC } : {})
  }
  const video = (vp: Record<string, unknown>, style: React.CSSProperties) => {
    const el = <OffthreadVideo {...videoProps} {...vp} style={style} />
    return clip.freeze ? <Freeze frame={0}>{el}</Freeze> : el
  }

  return (
    <AbsoluteFill style={layerCss(st, filterId)}>
      {filterId && <RgbSplitDefs id={filterId} amount={st.rgbSplit} />}
      {clip.fit === 'blur' ? (
        <>
          <AbsoluteFill style={{ transform: 'scale(1.18)', filter: 'blur(38px) brightness(0.62)' }}>
            {video({ muted: true }, { width: '100%', height: '100%', objectFit: 'cover' })}
          </AbsoluteFill>
          <AbsoluteFill style={inner}>{video({ volume: volumeAt }, { width: '100%', height: '100%', objectFit: 'contain' })}</AbsoluteFill>
        </>
      ) : (
        <AbsoluteFill style={inner}>
          {video({ volume: volumeAt }, { width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos })}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// LOP PHU: flash, vignette, vet sang, vien dien anh, hat phim, emoji, tap trung
// ---------------------------------------------------------------------------
const FxOverlays: React.FC<{ spec: RenderSpec }> = ({ spec }) => {
  const frame = useCurrentFrame()
  const { fps, width: W, height: H } = useVideoConfig()
  const t = frame / fps
  const layers: React.ReactNode[] = []

  const trFlash = flashAmount(spec.clips, t)
  let flash = trFlash * 0.95
  for (const fx of spec.effects) {
    if (t < fx.start || t > fx.end) continue
    const I = clamp01(fx.intensity ?? 0.7)
    const local = t - fx.start
    const dur = Math.max(0.05, fx.end - fx.start)
    switch (fx.type) {
      case 'flash':
        flash = Math.max(flash, 0.92 * I * (1 - easeOut(clamp01(local / Math.min(dur, 0.35)))))
        break
      case 'vignette':
        layers.push(
          <AbsoluteFill
            key={fx.id}
            style={{
              background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 42%, rgba(0,0,0,${(0.72 * I).toFixed(3)}) 100%)`,
              opacity: envelope(t, fx.start, fx.end, 0.3, 0.3)
            }}
          />
        )
        break
      case 'light_leak': {
        const p = local / dur
        const x = -20 + 140 * p
        layers.push(
          <AbsoluteFill
            key={fx.id}
            style={{
              mixBlendMode: 'screen',
              opacity: 0.6 * I * envelope(t, fx.start, fx.end, 0.35, 0.45),
              background: `radial-gradient(circle at ${x}% 30%, rgba(255,150,60,0.95) 0%, rgba(255,90,120,0.55) 22%, rgba(0,0,0,0) 55%)`
            }}
          />
        )
        break
      }
      case 'letterbox': {
        const k = envelope(t, fx.start, fx.end, 0.3, 0.3)
        const bar = H * 0.1 * I * easeOut(k)
        layers.push(
          <AbsoluteFill key={fx.id}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bar, background: '#000' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bar, background: '#000' }} />
          </AbsoluteFill>
        )
        break
      }
      case 'film_grain': {
        const seed = Math.round(t * 24) % 97
        layers.push(
          <AbsoluteFill key={fx.id} style={{ opacity: 0.22 * I * envelope(t, fx.start, fx.end), mixBlendMode: 'overlay' }}>
            <svg width="100%" height="100%" viewBox="0 0 270 480" preserveAspectRatio="none">
              <filter id={`grain-${fx.id}`}>
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed} />
                <feColorMatrix type="saturate" values="0" />
              </filter>
              <rect width="270" height="480" filter={`url(#grain-${fx.id})`} />
            </svg>
          </AbsoluteFill>
        )
        break
      }
      case 'emoji_pop':
        // icon emoji tho bi cam tu 2026-09-27 (sidecar da bo); spec cu con sot -> khong ve
        break
      default:
        break
    }
  }
  if (flash > 0.01) {
    layers.push(<AbsoluteFill key="flash" style={{ background: '#FFFFFF', opacity: Math.min(1, flash) }} />)
  }
  if (!layers.length) return null
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{layers}</AbsoluteFill>
}

// ---------------------------------------------------------------------------
// LOP VIDEO: nen + B-roll + KHUNG A-roll (camera + chinh mau ben trong khung)
// ---------------------------------------------------------------------------
const SubjectTintDefs: React.FC<{ color: string; opacity: number; blend: string }> = ({ color, opacity, blend }) => (
  // to mau (tint) CHI tren phan co nguoi — giong lop tint phu ca khung o ban goc
  <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
    <filter id="subject-tint" colorInterpolationFilters="sRGB">
      <feFlood floodColor={color} floodOpacity={opacity} result="f" />
      <feComposite in="f" in2="SourceAlpha" operator="in" result="fa" />
      <feBlend in="fa" in2="SourceGraphic" mode={blend as 'normal'} />
    </filter>
  </svg>
)

/** subject=true: ve lai A-roll CHI PHAN NGUOI (clip.subject) de dat len tren lop chu `behind`. */
const VideoLayer: React.FC<{ spec: RenderSpec; subject?: boolean }> = ({ spec, subject }) => {
  const frame = useCurrentFrame()
  const { fps, width: W, height: H } = useVideoConfig()
  const t = frame / fps
  const map = useFisheyeMap()
  const cam0 = cameraAt(spec.effects as RSEffect[], t, W)
  // bien doi khung tu viet (rung / zoom / nghieng / doi mau) — ap CA ban goc lan ban "chi nguoi"
  const ft = fxTransformAt(spec.fxTransforms, t, fps)
  const cam = { ...cam0, scale: cam0.scale * ft.scale, tx: cam0.tx + ft.x, ty: cam0.ty + ft.y, rotate: cam0.rotate + ft.rotate }
  const grade = gradeFilter(spec.grade?.preset || 'none', spec.grade?.intensity ?? 0.6)
  const tint = gradeTint(spec.grade?.preset || 'none', spec.grade?.intensity ?? 0.6)
  const A = arollStateAt(spec.scenes, t, W, H)
  const tintOn = !!tint && tint.opacity > 0.005
  // pop-out: mat ngay duoi mep tren the (5% canvas) -> nua tren dau troi ra ngoai the
  const faceY = A.ext > 1 ? (A.ext + 0.05 * H) / (A.height + A.ext) : 0.42
  const filters = subject && tintOn ? ['url(#subject-tint)', grade] : [grade]
  if (cam.grayscale > 0.01) filters.push(`grayscale(${cam.grayscale.toFixed(3)})`)
  if (cam.blur > 0.05) filters.push(`blur(${cam.blur.toFixed(2)}px)`)
  if (cam.rgbSplit > 0.3) filters.push('url(#rgb-camera)')
  if (cam.fisheye > 0.01 && map) filters.push('url(#fisheye-camera)')
  filters.push(...fxTransformFilters(ft))

  // "tap trung" (focus): chi nhoe + toi VIDEO o vien, giu ro vung giua — chu/do hoa phia tren van net
  let focus = 0
  for (const fx of spec.effects) {
    if (fx.type === 'focus' && t >= fx.start && t <= fx.end) focus = Math.max(focus, clamp01(fx.intensity ?? 0.7) * envelope(t, fx.start, fx.end, 0.1, 0.25))
  }
  const FOCUS_MASK = 'radial-gradient(ellipse 46% 40% at 50% 42%, transparent 55%, black 100%)'
  // ban "chi nguoi" mo dan ra mep -> lo phan vien da nhoe/toi (mat ca, focus) cua ban goc ben duoi
  const masks: string[] = []
  if (subject && cam.fisheye > 0.01)
    masks.push(`radial-gradient(ellipse 72% 60% at 50% 50%, black 78%, rgba(0,0,0,${(1 - 0.92 * cam.fisheye).toFixed(3)}) 100%)`)
  if (subject && focus > 0.01) masks.push(`radial-gradient(ellipse 46% 40% at 50% 42%, black 55%, rgba(0,0,0,${(1 - focus).toFixed(3)}) 100%)`)
  const ringMask = masks.length ? masks.join(', ') : undefined
  return (
    <AbsoluteFill>
      {!subject && <SceneBackdrop scenes={spec.scenes} base={spec.mediaBase} />}
      {!subject && <ScenePanels scenes={spec.scenes} base={spec.mediaBase} />}
      <div
        style={{
          position: 'absolute',
          left: A.left,
          top: A.top,
          width: A.width,
          height: A.height,
          borderRadius: A.radius,
          overflow: subject && A.ext > 1 ? 'visible' : 'hidden',
          opacity: A.opacity,
          border: subject ? undefined : A.border,
          boxShadow: !subject && A.shadow ? '0 24px 60px rgba(0,0,0,0.35)' : undefined,
          background: subject ? 'transparent' : '#000',
          maskImage: ringMask,
          WebkitMaskImage: ringMask,
          maskComposite: masks.length > 1 ? 'intersect' : undefined,
          WebkitMaskComposite: masks.length > 1 ? 'source-in' : undefined
        }}
      >
        {subject && tintOn && tint && <SubjectTintDefs color={tint.color} opacity={tint.opacity} blend={tint.blend || 'normal'} />}
        <div
          style={{
            // pop-out: khung video cao hon khung the `ext` px ve phia tren (ban goc bi the cat mat,
            // ban "chi nguoi" thi khong -> dau troi ra ngoai the)
            position: 'absolute',
            left: 0,
            top: -A.ext,
            width: A.width,
            height: A.height + A.ext,
            transform: `translate(${cam.tx}px, ${cam.ty}px) rotate(${cam.rotate}deg) scale(${cam.scale})`,
            filter: filters.filter(Boolean).join(' ') || undefined
          }}
        >
          {cam.rgbSplit > 0.3 && <RgbSplitDefs id="rgb-camera" amount={cam.rgbSplit} />}
          {cam.fisheye > 0.01 && map && <FisheyeDefs id="fisheye-camera" amount={cam.fisheye} map={map} w={A.width} h={A.height + A.ext} />}
          {spec.clips.map((clip, i) => {
            if (subject && (!clip.subject || clip.freeze)) return null
            const prev = i > 0 ? spec.clips[i - 1] : null
            const inHalf = prev?.transitionOut?.overlap ? prev.transitionOut.duration / 2 : 0
            const outHalf = clip.transitionOut?.overlap ? clip.transitionOut.duration / 2 : 0
            const from = toFrame(clip.start - inHalf, fps)
            const to = toFrame(clip.end + outHalf, fps)
            return (
              <Sequence key={clip.id} from={from} durationInFrames={Math.max(1, to - from)} premountFor={Math.round(fps)}>
                <ClipLayer clip={clip} prev={prev} base={spec.mediaBase} cw={A.width} ch={A.height + A.ext} fy={faceY} subject={subject} />
              </Sequence>
            )
          })}
          {!subject && tintOn && tint && (
            <AbsoluteFill style={{ background: tint.color, opacity: tint.opacity, mixBlendMode: tint.blend }} />
          )}
        </div>
        {!subject && focus > 0.01 && (
          <>
            <AbsoluteFill
              style={{
                backdropFilter: `blur(${(10 * focus).toFixed(1)}px)`,
                WebkitBackdropFilter: `blur(${(10 * focus).toFixed(1)}px)`,
                maskImage: FOCUS_MASK,
                WebkitMaskImage: FOCUS_MASK
              }}
            />
            <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 52% at 50% 42%, transparent 60%, rgba(0,0,0,${(0.5 * focus).toFixed(3)}) 100%)` }} />
          </>
        )}
        {!subject && cam.fisheye > 0.01 && (
          // vien toi tron cua ong kinh mat ca
          <AbsoluteFill style={{ background: `radial-gradient(ellipse 72% 60% at 50% 50%, transparent 78%, rgba(0,0,0,${(0.92 * cam.fisheye).toFixed(3)}) 100%)` }} />
        )}
      </div>
    </AbsoluteFill>
  )
}

const OverlayClip: React.FC<{ o: RSOverlay; base?: string }> = ({ o, base }) => {
  const frame = useCurrentFrame()
  const { fps, width: W, height: H } = useVideoConfig()
  const sp = spring({ frame, fps, config: { damping: 13, stiffness: 190 } })
  const dur = o.end - o.start
  const out = clamp01((dur - frame / fps) / 0.18)
  const w = W * 0.72 * (o.scale || 1)
  return (
    <div
      style={{
        position: 'absolute',
        width: w,
        left: W / 2 + (o.x * W) / 2 - w / 2,
        top: H * (0.5 + o.y / 2),
        transform: `translateY(-50%) scale(${(0.7 + 0.3 * sp) * out})`,
        opacity: out,
        borderRadius: W * 0.03,
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        border: `${Math.round(W * 0.006)}px solid rgba(255,255,255,0.9)`
      }}
    >
      <OffthreadVideo
        src={mediaSrc(base, o.path)}
        trimBefore={toFrame(o.srcStart, fps)}
        volume={Math.min(1, o.volume)}
        style={{ width: '100%', display: 'block' }}
      />
    </div>
  )
}

/** Xem truoc (Player): video nen va lop tach nguoi la 2 the video rieng, moi the tu bam dong ho
 *  va chi tua lai khi lech qua nguong -> nguong nho de nguoi tach khong troi khoi nguoi that khi cu dong.
 *  Render (tung khung) luon khop tuyet doi, khong dung nguong nay. */
const SUBJECT_SYNC_SEC = 0.15

// ---------------------------------------------------------------------------
// COMPOSITION
// ---------------------------------------------------------------------------
export const AutoEdit: React.FC<AutoEditProps> = ({ spec }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  // Doi font nap xong moi ve: khung dau khong bi chu font du phong roi nhay font.
  const [handle] = useState(() => delayRender('Nap font caption + lop chu'))
  useEffect(() => {
    const items: { font?: string; role?: 'hero' | 'support' | 'micro'; weight?: number; italic?: boolean }[] = [...(spec?.captions || [])]
    for (const L of spec?.layers || []) {
      items.push({ font: L.font, weight: L.weight, italic: L.italic })
      for (const s of L.spans || []) items.push({ font: s.font || L.font, weight: s.weight ?? L.weight, italic: s.italic ?? L.italic })
    }
    const queries = fontLoadQueries(items)
    const fontsApi = typeof document !== 'undefined' ? document.fonts : null
    if (!fontsApi || !queries.length) {
      continueRender(handle)
      return
    }
    Promise.all(queries.map((q) => fontsApi.load(q, 'Tiếng Việt ĐẦY ĐỦ dấu ắằẳẵặ ơờởỡợ ưừửữự 0123456789')))
      .catch(() => undefined)
      .then(() => continueRender(handle))
  }, [handle, spec])

  if (!spec || !spec.clips) {
    return <AbsoluteFill style={{ background: '#000' }} />
  }
  const layers = spec.layers || []
  // Chu nhan "thay cho phu de" dang hien -> an phu de de khong hai khoi chu danh nhau
  const hideSubs = layers.some((L) => L.replacesSubtitle && t >= L.start && t <= L.end)
  // Lop "sau nguoi": chi co nghia khi co ban tach nguoi cua clip -> ve A-roll, lop chu, roi NGUOI de len
  const behind = layers.filter((L) => L.behind)
  const hasSubject = spec.clips.some((c) => !!c.subject)
  const hasBehind = behind.length > 0 && hasSubject
  const front = hasBehind ? layers.filter((L) => !L.behind) : layers
  const drawSubject =
    hasSubject && (hasBehind || (spec.scenes || []).some((s) => !!s.popout) || (spec.fx || []).some((f) => f.layer === 'behind'))
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <VideoLayer spec={spec} />
      {spec.overlays.map((o) => (
        <Sequence key={o.id} from={toFrame(o.start, fps)} durationInFrames={Math.max(1, toFrame(o.end - o.start, fps))} premountFor={Math.round(fps)}>
          <OverlayClip o={o} base={spec.mediaBase} />
        </Sequence>
      ))}
      {hasBehind && <LayersLayer layers={behind} base={spec.mediaBase} maxTrack={100} />}
      {hasSubject && <FxLayer fx={spec.fx} layer="behind" base={spec.mediaBase} />}
      {drawSubject && <VideoLayer spec={spec} subject />}
      <FxLayer fx={hasSubject ? spec.fx : (spec.fx || []).map((f) => ({ ...f, layer: 'front' as const }))} layer="front" base={spec.mediaBase} />
      <LayersLayer layers={front} base={spec.mediaBase} maxTrack={100} />
      <FxOverlays spec={spec} />
      {!hideSubs && <CaptionsLayer captions={spec.captions} />}
      <LayersLayer layers={layers} base={spec.mediaBase} minTrack={100} />
      {spec.audio.map((a) => {
        const from = toFrame(a.start, fps)
        const len = a.srcEnd !== null && a.srcEnd !== undefined ? toFrame(a.srcEnd - a.srcStart, fps) : undefined
        return (
          <Sequence key={a.id} from={from} durationInFrames={len && len > 0 ? len : undefined} layout="none">
            <Html5Audio src={mediaSrc(spec.mediaBase, a.path)} trimBefore={toFrame(a.srcStart, fps)} volume={Math.min(1, Math.max(0, a.volume))} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
