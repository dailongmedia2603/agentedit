// VE MOT MAU SHOT vao khung video (9:16 hoac 16:9) voi noi dung THAT cua video.
// Mau duoc viet cho san khau 1920x1080: khung ngang -> phong vua; khung doc -> 'native' (mau tu bo cuc theo chieu cao that)
// hoac 'band' (giu khoi 1920x1080, phong `zoom`, nen san khau <Stage> / mau `bleed` phu kin phan tren-duoi).
import React, { useEffect, useState } from 'react'
import { AbsoluteFill, Img, continueRender, delayRender } from 'remotion'
import { DEFAULT_FONTS, SHOT_H, SHOT_W, ShotRuntimeProvider, clearMeasureCache, resolveUrl, setCurrentShot, type ShotFonts, type ShotRuntimeData, type ShotTexts } from './runtime'
import { applyShotTheme, type ShotTheme } from './theme'
import type { ShotMeta } from './meta'

export interface ShotStageProps {
  id: string
  entry: { C: React.FC; meta: ShotMeta }
  texts?: ShotTexts
  /** o anh -> URL da giai */
  images?: Record<string, string>
  /** toc do phat (sidecar tinh tu do dai canh; khong co = 1) */
  rate?: number
  width: number
  height: number
  theme?: ShotTheme | null
  brand?: { name: string; logo?: string } | null
  fonts?: Partial<ShotFonts> | null
  /** xem thu kho (scripts/shot-still.mjs) */
  preview?: boolean
  /** anh nen AI (URL) — chi dung khi meta.backdrop (mau ho tro nen anh) */
  backdrop?: string | null
}

// Nap font cua shot TRUOC khi ve: mau do be ngang chu (fitSize / wrapLines) bang canvas — do luc font chua nap se ra so
// cua font du phong (hep hon) -> chu tran khung. Moi ho font: cac do dam thuong dung + nghieng.
const firstFamily = (stack: string) => (stack.split(',')[0] || '').trim()
let fontsReady: Promise<unknown> | null = null
let fontsKey = ''
function loadShotFonts(f: ShotFonts): Promise<unknown> {
  const key = JSON.stringify(f)
  if (fontsReady && key === fontsKey) return fontsReady
  fontsKey = key
  if (typeof document === 'undefined' || !document.fonts) return (fontsReady = Promise.resolve())
  const jobs: Promise<unknown>[] = []
  for (const fam of new Set([f.sans, f.serif, f.display, f.mono].map(firstFamily).filter(Boolean)))
    for (const w of [300, 400, 500, 600, 700, 800, 900])
      for (const st of ['', 'italic ']) jobs.push(document.fonts.load(`${st}${w} 40px ${fam}`, 'AaĐđƯươắẫ').catch(() => null))
  fontsReady = Promise.all(jobs).then(() => clearMeasureCache())
  return fontsReady
}

export const ShotStage: React.FC<ShotStageProps> = (props) => {
  const fonts = { ...DEFAULT_FONTS, ...(props.fonts || {}) }
  const [ready, setReady] = useState(false)
  const [handle] = useState(() => delayRender('shotcraft: nap font'))
  useEffect(() => {
    let live = true
    loadShotFonts(fonts).then(() => {
      if (live) setReady(true)
      continueRender(handle)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!ready) return null
  return <ShotStageInner {...props} />
}

const ShotStageInner: React.FC<ShotStageProps> = ({ id, entry, texts, images, rate, width: W, height: H, theme, brand, fonts, preview, backdrop }) => {
  const meta = entry.meta
  applyShotTheme(theme)
  const portrait = H > W * 1.05
  const s = W / SHOT_W // he so tu san khau ao ra khung that (theo be ngang)
  const LH = H / s // chieu cao san khau ao tuong ung khung that
  const native = portrait && meta.portrait.mode === 'native'
  const zoom = portrait && !native ? Math.max(1, meta.portrait.zoom ?? 1) : 1
  const focusY = portrait && !native ? meta.portrait.focusY ?? 0.5 : 0.5
  // band: khoi 1920x1080 (phong zoom) dat tam tai focusY cua khung; phan con lai = bleed (don vi px san khau)
  const boxH = native ? LH : SHOT_H
  const top = native ? 0 : (LH * focusY) / zoom - SHOT_H / 2
  const bleed = native || !portrait ? { top: 0, bottom: 0 } : { top: Math.max(0, top), bottom: Math.max(0, LH / zoom - SHOT_H - top) }
  const landscapeFit = !portrait ? Math.min(W / SHOT_W, H / SHOT_H) : s
  const data: ShotRuntimeData = {
    id,
    native: meta.duration,
    rate: rate && rate > 0 ? rate : 1,
    texts: texts || {},
    images: images || {},
    brand: brand && (brand.name || brand.logo) ? brand : null,
    portrait,
    height: boxH,
    bleed,
    fonts: { ...DEFAULT_FONTS, ...(fonts || {}) },
    slotIds: (meta.slots || []).map((x) => x.id),
    preview: !!preview,
    backdrop: backdrop && meta.backdrop && meta.kind !== 'overlay' ? { src: resolveUrl(backdrop), dark: meta.dark } : null
  }
  setCurrentShot(data)
  const C = entry.C
  const overlay = meta.kind === 'overlay' // lop trong suot (chop sang...) de len canh cat: khong ve nen
  const bleedBg = overlay ? 'transparent' : meta.bleed ? `linear-gradient(180deg, ${meta.bleed[0]} 0%, ${meta.bleed[1]} 100%)` : meta.dark ? '#08090c' : '#f2efe8'
  const bd = data.backdrop
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: bd ? (bd.dark ? '#000' : '#fff') : portrait || overlay ? bleedBg : meta.dark ? '#000' : '#fff' }}>
      {bd ? <Backdrop src={bd.src} dark={bd.dark} /> : null}
      <div
        style={{
          position: 'absolute',
          left: portrait ? (W - SHOT_W * s * zoom) / 2 : (W - SHOT_W * landscapeFit) / 2,
          top: portrait ? 0 : (H - SHOT_H * landscapeFit) / 2,
          width: SHOT_W,
          height: portrait ? LH / zoom : SHOT_H,
          transform: `scale(${(portrait ? s * zoom : landscapeFit).toFixed(6)})`,
          transformOrigin: '0 0'
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: native ? 0 : top, width: SHOT_W, height: boxH }}>
          <ShotRuntimeProvider value={data}>
            <C />
          </ShotRuntimeProvider>
        </div>
      </div>
    </AbsoluteFill>
  )
}

/** NEN ANH AI cua canh shot: anh phu kin khung (cover), mo nhe + lop toi (mau nen toi) / lop sang (mau nen sang) de
 *  CHU cua mau luon noi ro tren anh — nen chi la khong khi cua chu de, khong tranh mat voi chu. */
const Backdrop: React.FC<{ src: string; dark: boolean }> = ({ src, dark }) => (
  <AbsoluteFill>
    <Img
      src={src}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: 'scale(1.06)',
        filter: dark ? 'blur(4px) brightness(0.62) saturate(0.95)' : 'blur(6px) brightness(1.04) saturate(0.88)'
      }}
    />
    <AbsoluteFill
      style={{
        background: dark
          ? 'linear-gradient(180deg, rgba(4,6,10,0.46) 0%, rgba(4,6,10,0.26) 45%, rgba(4,6,10,0.52) 100%)'
          : 'linear-gradient(180deg, rgba(250,248,244,0.66) 0%, rgba(250,248,244,0.52) 50%, rgba(250,248,244,0.68) 100%)'
      }}
    />
    <AbsoluteFill
      style={{
        background: dark
          ? 'radial-gradient(ellipse 75% 60% at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.45) 100%)'
          : 'radial-gradient(ellipse 75% 60% at 50% 50%, rgba(255,255,255,0) 45%, rgba(255,255,255,0.35) 100%)'
      }}
    />
  </AbsoluteFill>
)
