import React from 'react'
import { Composition, type CalculateMetadataFunction } from 'remotion'
import { AutoEdit } from './AutoEdit'
import type { AutoEditProps, RenderSpec } from './types'

export const COMPOSITION_ID = 'AutoEdit'

const EMPTY: RenderSpec = {
  version: 1,
  fps: 30,
  width: 1080,
  height: 1920,
  duration: 3,
  grade: { preset: 'none', intensity: 0 },
  clips: [],
  captions: [],
  effects: [],
  audio: [],
  overlays: []
}

/** Kich thuoc / fps / do dai lay tu CHINH spec -> moi video mot do dai rieng. */
export const calcMetadata: CalculateMetadataFunction<AutoEditProps> = ({ props }) => {
  const spec = props.spec || EMPTY
  const fps = spec.fps || 30
  return {
    fps,
    width: spec.width || 1080,
    height: spec.height || 1920,
    durationInFrames: Math.max(1, Math.round((spec.duration || 1) * fps))
  }
}

export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={AutoEdit}
    defaultProps={{ spec: EMPTY } as AutoEditProps}
    calculateMetadata={calcMetadata}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={90}
  />
)
