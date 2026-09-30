// HIEU UNG TU VIET — hien KHUNG DA VE SAN.
//
// Code hieu ung do AI viet KHONG chay o day: no chay trong hop cach ly (sidecar/fx_runtime.mjs) va da
// duoc ve thanh chuoi SVG/HTML DA LOC cho tung khung (chi the / thuoc tinh cho phep, khong script, khong
// url ngoai). Lop nay chi tai file khung (qua may chu media cuc bo) va hien dung khung theo gio ->
// xem truoc va render MP4 giong het nhau, render song song van tat dinh.
import React, { useEffect, useRef, useState } from 'react'
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion'
import type { RSFx, RSFxTransform } from './types'
import { mediaUrl } from './Layers'

interface FxData {
  fps: number
  n: number
  frames: string[]
  idx: number[]
}

const cache = new Map<string, FxData | null>()
const pending = new Map<string, Promise<FxData | null>>()

function load(url: string): Promise<FxData | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null)
  let p = pending.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const ok = d && Array.isArray(d.frames) && Array.isArray(d.idx) ? (d as FxData) : null
        cache.set(url, ok)
        return ok
      })
      .catch(() => {
        cache.set(url, null)
        return null
      })
    pending.set(url, p)
  }
  return p
}

const FxOne: React.FC<{ fx: RSFx; base?: string; t: number }> = ({ fx, base, t }) => {
  const url = mediaUrl(base, fx.file)
  const [data, setData] = useState<FxData | null>(cache.get(url) ?? null)
  // cho tai xong file khung moi cho render khung (render MP4) — luon tra lai handle ke ca khi loi / thao
  const handle = useRef<number | null>(null)
  if (handle.current === null && !cache.has(url)) handle.current = delayRender('hieu ung ' + fx.id)
  useEffect(() => {
    let alive = true
    const done = () => {
      if (handle.current !== null && handle.current >= 0) {
        continueRender(handle.current)
        handle.current = -1
      }
    }
    load(url).then((d) => {
      if (alive) setData(d)
      done()
    })
    return () => {
      alive = false
      done()
    }
  }, [url])
  if (!data || t < fx.start || t > fx.end) return null
  const i = Math.min(data.n - 1, Math.max(0, Math.round((t - fx.start) * data.fps)))
  const html = data.frames[data.idx[i]]
  if (!html) return null
  return (
    <div
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}
      // chuoi do hop cach ly tao tu cay phan tu DA LOC (khong script / su kien / url ngoai)
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Cac hieu ung tu viet thuoc lop `layer` (behind = giua nen video va nguoi; front = tren nguoi, duoi chu). */
export const FxLayer: React.FC<{ fx?: RSFx[]; layer: 'front' | 'behind'; base?: string }> = ({ fx, layer, base }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  // mount som 1 giay de kip tai file khung
  const vis = (fx || []).filter((f) => (f.layer || 'front') === layer && t >= f.start - 1 && t <= f.end)
  if (!vis.length) return null
  return (
    <>
      {vis.map((f) => (
        <FxOne key={f.id} fx={f} base={base} t={t} />
      ))}
    </>
  )
}

export interface FxTransformState {
  scale: number
  x: number
  y: number
  rotate: number
  blur: number
  brightness: number
  contrast: number
  saturate: number
  hueRotate: number
}

const NEUTRAL: FxTransformState = { scale: 1, x: 0, y: 0, rotate: 0, blur: 0, brightness: 1, contrast: 1, saturate: 1, hueRotate: 0 }

/** Bien doi KHUNG VIDEO tu cac hieu ung transform (so tinh san tung khung) tai giay t. */
export function fxTransformAt(list: RSFxTransform[] | undefined, t: number, fps: number): FxTransformState {
  const out = { ...NEUTRAL }
  for (const f of list || []) {
    if (t < f.start || t > f.end || !f.values) continue
    const i = Math.min(Math.max(0, (f.n || 1) - 1), Math.max(0, Math.round((t - f.start) * fps)))
    const v = (k: keyof FxTransformState) => {
      const arr = f.values[k]
      return arr && arr.length ? arr[Math.min(arr.length - 1, i)] : NEUTRAL[k]
    }
    out.scale *= v('scale')
    out.x += v('x')
    out.y += v('y')
    out.rotate += v('rotate')
    out.blur += v('blur')
    out.brightness *= v('brightness')
    out.contrast *= v('contrast')
    out.saturate *= v('saturate')
    out.hueRotate += v('hueRotate')
  }
  return out
}

export function fxTransformFilters(s: FxTransformState): string[] {
  const f: string[] = []
  if (s.blur > 0.05) f.push(`blur(${s.blur.toFixed(2)}px)`)
  if (Math.abs(s.brightness - 1) > 0.005) f.push(`brightness(${s.brightness.toFixed(3)})`)
  if (Math.abs(s.contrast - 1) > 0.005) f.push(`contrast(${s.contrast.toFixed(3)})`)
  if (Math.abs(s.saturate - 1) > 0.005) f.push(`saturate(${s.saturate.toFixed(3)})`)
  if (Math.abs(s.hueRotate) > 0.1) f.push(`hue-rotate(${s.hueRotate.toFixed(1)}deg)`)
  return f
}
