/**
 * KHO HIEU UNG — bo dieu phoi viec NEN (2026-10-05).
 *
 * KHONG tu dong goi hieu ung sau khi render nua (user 2026-10-17: tac gia tu viet code hieu ung roi bo sung vao kho).
 * Vong lap nen chi xu ly cac muc da co trong kho, lam TUNG viec mot, cho toi khi het viec:
 *   1. render preview.mp4   — lan 'render' UU TIEN THAP (acquireIdle): chi khi khong video nao dang / cho render,
 *                             video nguoi dung bam sau van chen len truoc (moi preview ~10-20s).
 *   2. Gemini gan nhan       — lan 'gemini' uu tien thap, 4 preview / luot.
 *   3. gui kho chung         — qua may chu ban quyen (may tac gia tu duyet, may khach cho duyet).
 * Trang thai tung muc nam o sidecar (fx_library.json) -> tat app giua chung, lan mo sau lam tiep. Muc loi khong
 * tu lap lai (nut "Thử lại" o Kho hiệu ứng); loi mang khi gui -> thu lai o lan mo app sau.
 */
import { acquireIdle } from './jobQueue'

const JOB = 'fxlib'
const LABEL_BATCH = 4

export interface FxHarvestStatus {
  busy: boolean
  /** viec dang lam (cho UI): 'preview' | 'label' | 'share' */
  phase?: 'preview' | 'label' | 'share'
  ids?: string[]
  /** gui kho chung loi mang trong phien nay (dung gui tiep, lan mo app sau thu lai) */
  offline?: boolean
  /** Gemini chua dung duoc (chua dang nhap / mat mang) — hieu ung cho mo ta, lan mo app sau thu lai */
  labelOffline?: boolean
}

let running = false
let again = false
let status: FxHarvestStatus = { busy: false }
const listeners = new Set<() => void>()
let shareOffline = false
// Gemini loi chung (chua dang nhap / mat mang / het han muc) -> dung gan nhan trong phien nay, lan mo app sau thu lai
let labelOffline = false

function setStatus(s: FxHarvestStatus): void {
  status = s
  for (const fn of [...listeners]) {
    try {
      fn()
    } catch {
      /* bo qua */
    }
  }
}

export function harvestStatus(): FxHarvestStatus {
  return status
}

export function subscribeHarvest(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Danh thuc vong lap nen (mo app, sau "Thu lai"). Dang chay -> chay them 1 vong sau khi xong.
 *  retryOffline: nguoi dung bam thu lai -> bo co "Gemini / may chu khong dung duoc" cua phien nay. */
export function kickHarvest(retryOffline = false): void {
  if (retryOffline) {
    labelOffline = false
    shareOffline = false
  }
  if (!window.studio.fxlibList) return
  if (running) {
    again = true
    return
  }
  void loop()
}

async function step(): Promise<boolean> {
  const r = await window.studio.fxlibList()
  const p = r.pending
  if (!r.ok || !p) return false
  if (p.preview.length) {
    const id = p.preview[0]
    const release = await acquireIdle('render', JOB, 'Kho hiệu ứng · xem trước')
    try {
      setStatus({ busy: true, phase: 'preview', ids: [id] })
      const res = await window.studio.fxlibRenderPreview(id)
      if (res.busy || res.cancelled) return false // render khac dang chay ngoai hang doi -> lan sau
    } finally {
      release()
    }
    return true
  }
  if (p.label.length && !labelOffline) {
    const ids = p.label.slice(0, LABEL_BATCH)
    const release = await acquireIdle('gemini', JOB, 'Kho hiệu ứng · Gemini gắn nhãn')
    try {
      setStatus({ busy: true, phase: 'label', ids })
      const res = await window.studio.fxlibLabel(ids)
      if (!res.ok || res.stop) labelOffline = true
    } finally {
      release()
    }
    return true
  }
  if (p.share.length && !shareOffline && window.studio.fxlibShare) {
    const id = p.share[0]
    setStatus({ busy: true, phase: 'share', ids: [id] })
    const res = await window.studio.fxlibShare(id)
    if (!res.ok && res.retry) {
      shareOffline = true // mat mang / may chu ban -> dung gui trong phien nay
      return false
    }
    return true
  }
  return false
}

async function loop(): Promise<void> {
  running = true
  try {
    do {
      again = false
      for (let guard = 0; guard < 200; guard++) {
        let more = false
        try {
          more = await step()
        } catch {
          more = false
        }
        if (!more) break
      }
    } while (again)
  } finally {
    running = false
    setStatus({ busy: false, offline: shareOffline || undefined, labelOffline: labelOffline || undefined })
  }
}
