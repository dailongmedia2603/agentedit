import { useMemo, useSyncExternalStore } from 'react'
import { getVersion, snapshot, subscribe } from './jobQueue'

/** Anh chup hang doi (src/lib/jobQueue.ts) — ve lai moi khi co video xin / nha / huy luot. */
export function useJobQueue() {
  const v = useSyncExternalStore(subscribe, getVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => snapshot(), [v])
}
