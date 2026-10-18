// Ve mau shot theo id (tra registry). Xem ShotStage.tsx.
import React from 'react'
import { SHOTS } from './registry'
import { ShotStage, type ShotStageProps } from './ShotStage'
import type { ShotMeta } from './meta'

export type ShotPlayerProps = Omit<ShotStageProps, 'entry'>

export function shotMeta(id: string): ShotMeta | null {
  return SHOTS[id]?.meta ?? null
}

export const ShotPlayer: React.FC<ShotPlayerProps> = (props) => {
  const entry = SHOTS[props.id]
  if (!entry) return null
  return <ShotStage {...props} entry={entry} />
}
