import React from 'react'
import { Composition, type CalculateMetadataFunction } from 'remotion'
import { AutoEdit } from './AutoEdit'
import type { AutoEditProps, RenderSpec } from './types'
import { TextTemplate } from './textTemplate/TextTemplate'
import type { TextTemplateProps, TextTemplateSpec } from './textTemplate/spec'
import { FxPreview, FX_PREVIEW_ID, type FxPreviewProps } from './FxPreview'

export const COMPOSITION_ID = 'AutoEdit'
/** Mau chu dong (Kho Text) — render xem truoc / ghep vao video */
export const TEXT_TEMPLATE_ID = 'TextTemplate'

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
  <>
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
  <Composition
    id={TEXT_TEMPLATE_ID}
    component={TextTemplate}
    defaultProps={{ spec: EMPTY_TEMPLATE, assetBase: '' } as TextTemplateProps}
    calculateMetadata={calcTemplateMetadata}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={60}
  />
  <Composition
    id={FX_PREVIEW_ID}
    component={FxPreview}
    defaultProps={{ spec: { width: 1080, height: 1920, fps: 30, duration: 2 } } as FxPreviewProps}
    calculateMetadata={calcFxPreviewMetadata}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={60}
  />
  </>
)

/** Preview Kho hieu ung: khung + do dai theo spec (sidecar fx_lib.preview_job) */
const calcFxPreviewMetadata: CalculateMetadataFunction<FxPreviewProps> = ({ props }) => {
  const s = props.spec
  const fps = s?.fps || 30
  return { fps, width: s?.width || 1080, height: s?.height || 1920, durationInFrames: Math.max(1, Math.round((s?.duration || 2) * fps)) }
}

const EMPTY_TEMPLATE: TextTemplateSpec = {
  id: 'empty',
  name: '',
  version: 1,
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 2,
  slots: [],
  fonts: [],
  audio: [],
  root: { type: 'group', id: 'root', start: 0, duration: 2, sourceStart: 0, children: [] }
}

const calcTemplateMetadata: CalculateMetadataFunction<TextTemplateProps> = ({ props }) => {
  const spec = props.spec || EMPTY_TEMPLATE
  const fps = spec.fps || 30
  return { fps, width: spec.width || 1080, height: spec.height || 1920, durationInFrames: Math.max(1, Math.round((spec.duration || 1) * fps)) }
}
