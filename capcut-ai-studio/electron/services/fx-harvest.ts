// KHO HIEU UNG TU VIET — 2 viec nen phia main (dung chung ipc 'fxlib:*' cua giao dien va che do CLI):
//   preview  : sidecar chuan bi khung (/fxlib/preview_job) -> render composition FxPreview 540x960 khong tieng
//   share    : goi kho chung qua may chu ban quyen (may tin cay tu duyet, may khach cho duyet)
// Bo dieu phoi vong lap (lam tung viec, khi nao) nam o src/lib/fxHarvest.ts (giao dien) / electron/cli/pipeline.ts (CLI).
import { fxUpload } from './license'
import { renderStatus, startRender } from './remotion'
import { sidecarInfo, sidecarRequest, startSidecar } from './sidecar'

async function rmCall(path: string, payload?: unknown, timeoutMs?: number): Promise<any> {
  if (!sidecarInfo().ready) await startSidecar()
  return sidecarRequest(path, payload, timeoutMs)
}

export async function fxRenderPreview(id: string): Promise<{ ok: boolean; error?: string; busy?: boolean; cancelled?: boolean }> {
  const job = (await rmCall('/fxlib/preview_job', { id })) as {
    ok?: boolean
    spec?: Record<string, unknown>
    out?: string
    error?: string
  }
  if (!job?.ok || !job.spec || !job.out) return { ok: false, error: job?.error || 'Không chuẩn bị được preview' }
  if ((renderStatus() as { running: boolean }).running) return { ok: false, busy: true, error: 'Đang render video khác' }
  // 540x960 khong tieng: du cho Gemini xem + UI phat, render ~10-20s
  const res = await startRender(job.spec, job.out, () => undefined, { compositionId: 'FxPreview', scale: 0.5, muted: true })
  const ok = res.type === 'done'
  const error = ok ? undefined : String(res.message || res.type).split('\n')[0].slice(0, 300)
  if (res.type !== 'cancelled') await rmCall('/fxlib/preview_done', { id, ok, error })
  return { ok, error, cancelled: res.type === 'cancelled' }
}

// Loi tam thoi (mat mang...) -> khong danh dau, lan sau thu lai; loi han (goi hong / key khoa...) -> danh dau loi, nut "Thu lai"
export async function fxShare(id: string): Promise<{ ok: boolean; status?: string; error?: string; retry?: boolean }> {
  const r = (await rmCall('/fxlib/share_payload', { id })) as {
    ok?: boolean
    payload?: { meta: Record<string, unknown>; code: string; preview: string }
  }
  if (!r?.ok || !r.payload) {
    await rmCall('/fxlib/share_done', { id, status: 'error', error: 'Thiếu preview / nhãn / code' })
    return { ok: false, error: 'Thiếu preview / nhãn / code' }
  }
  const res = await fxUpload(r.payload)
  if (res.ok) await rmCall('/fxlib/share_done', { id, status: res.status })
  else if (!res.retry) await rmCall('/fxlib/share_done', { id, status: 'error', error: res.message || res.code })
  return { ok: res.ok, status: res.status, error: res.message, retry: res.retry }
}
