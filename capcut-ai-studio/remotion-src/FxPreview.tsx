// KHO HIEU UNG — preview 1 hieu ung tu viet (2026-10-05).
//
// Nen TRUNG TINH + bong nguoi gia dat dung vi tri mat mau (sidecar fx_lib.preview_job ve khung voi ctx.face nay),
// KHONG dung hinh video that cua khach -> preview gui Gemini gan nhan + gui kho chung khong lo noi dung video goc.
// Hieu ung "behind" nam giua nen va bong nguoi, "front" nam tren; transform tac dong ca nen + bong nguoi
// (giong khung video that trong AutoEdit).
import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { FxLayer, fxTransformAt, fxTransformFilters } from './FxLayer'
import type { RSFx, RSFxTransform } from './types'

export const FX_PREVIEW_ID = 'FxPreview'

export interface FxPreviewSpec {
  width: number
  height: number
  fps: number
  duration: number
  /** mat mau, phan so khung (tam + kich thuoc) */
  face?: { cx: number; cy: number; w: number; h: number }
  fx?: RSFx[]
  fxTransforms?: RSFxTransform[]
  mediaBase?: string
}

export interface FxPreviewProps {
  spec: FxPreviewSpec
  [key: string]: unknown
}

const Stage: React.FC<{ W: number; H: number; face: NonNullable<FxPreviewSpec['face']>; fx?: RSFx[]; base?: string }> = ({
  W,
  H,
  face,
  fx,
  base
}) => {
  const fx0 = face.cx * W
  const fy0 = face.cy * H
  const fw = face.w * W
  const fh = face.h * H
  const sw = fw * 2.6 // vai
  const grid = Math.round(Math.min(W, H) / 9)
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(160deg, #3a3f4b 0%, #23262e 55%, #191b21 100%)' }} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: Math.ceil(W / grid) + 1 }, (_, i) => (
          <line key={'v' + i} x1={i * grid} y1={0} x2={i * grid} y2={H} stroke="rgba(255,255,255,0.05)" strokeWidth={2} />
        ))}
        {Array.from({ length: Math.ceil(H / grid) + 1 }, (_, i) => (
          <line key={'h' + i} x1={0} y1={i * grid} x2={W} y2={i * grid} stroke="rgba(255,255,255,0.05)" strokeWidth={2} />
        ))}
      </svg>
      <FxLayer fx={fx} layer="behind" base={base} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <path
          d={`M ${fx0 - sw / 2} ${H} L ${fx0 - sw / 2} ${fy0 + fh * 1.25} Q ${fx0 - sw / 2} ${fy0 + fh * 0.75} ${fx0 - fw * 0.55} ${fy0 + fh * 0.72}
              L ${fx0 + fw * 0.55} ${fy0 + fh * 0.72} Q ${fx0 + sw / 2} ${fy0 + fh * 0.75} ${fx0 + sw / 2} ${fy0 + fh * 1.25} L ${fx0 + sw / 2} ${H} Z`}
          fill="#8a909c"
        />
        <rect x={fx0 - fw * 0.18} y={fy0 + fh * 0.35} width={fw * 0.36} height={fh * 0.45} fill="#8a909c" />
        <ellipse cx={fx0} cy={fy0} rx={fw / 2} ry={fh / 2} fill="#a3a9b4" />
      </svg>
    </AbsoluteFill>
  )
}

export const FxPreview: React.FC<FxPreviewProps> = ({ spec }) => {
  const frame = useCurrentFrame()
  const { fps, width: W, height: H } = useVideoConfig()
  const t = frame / fps
  const face = spec.face || { cx: 0.5, cy: 0.36, w: 0.3, h: 0.22 }
  const ft = fxTransformAt(spec.fxTransforms, t, fps)
  const filters = fxTransformFilters(ft)
  return (
    <AbsoluteFill style={{ background: '#15171c', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translate(${ft.x}px, ${ft.y}px) rotate(${ft.rotate}deg) scale(${ft.scale})`,
          transformOrigin: '50% 50%',
          filter: filters.length ? filters.join(' ') : undefined
        }}
      >
        <Stage W={W} H={H} face={face} fx={spec.fx} base={spec.mediaBase} />
      </AbsoluteFill>
      <FxLayer fx={spec.fx} layer="front" base={spec.mediaBase} />
    </AbsoluteFill>
  )
}
