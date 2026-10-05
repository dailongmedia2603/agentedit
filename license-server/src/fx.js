// KHO HIEU UNG CHUNG (2026-10-05) — phan dung chung cho api.js (nhan / phat) va admin.js (duyet).
// App gui hieu ung tu viet (code + preview + nhan Gemini) da dong goi o may khach; may chu kiem chu ky thiet bi + key,
// kiem id = bam code (khop sidecar fx_lib.code_id), loc meta roi luu R2 fx/<id>/ + D1 fx_items.
import { hex } from './shared.js'

const enc = new TextEncoder()

export const FX_ID_RE = /^fx-[0-9a-f]{12}$/
export const FX_FILES = ['code.js', 'preview.mp4']
export const FX_MAX_CODE = 14000 // khop fx_runtime.mjs MAX_CODE
export const FX_MAX_PREVIEW = 3 * 1024 * 1024
export const FX_MAX_META = 20000
export const FX_DAILY_LIMIT = 60 // so muc / key / 24h
const SFX = ['whoosh', 'swoosh', 'pop', 'click', 'ding', 'boom', 'riser', 'typing']

export async function sha256bytes(buf) {
  return hex(await crypto.subtle.digest('SHA-256', buf))
}

/** Khop sidecar fx_lib._norm_code + code_id: bo khoang trang cuoi dong, bo dong trong, sha1(kind + "\n" + code). */
export async function fxIdOf(kind, code) {
  const norm = String(code)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim())
    .join('\n')
  return 'fx-' + hex(await crypto.subtle.digest('SHA-1', enc.encode(`${kind}\n${norm}`))).slice(0, 12)
}

const s = (v, n = 600) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const arr = (v, n = 8, m = 80) => (Array.isArray(v) ? v.map((x) => s(String(x ?? ''), m)).filter(Boolean).slice(0, n) : [])
const num = (v, lo, hi, d) => {
  const x = Number(v)
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d
}

/** Meta app gui -> chi giu truong biet truoc, cat do dai (trang quan tri + may khac chi thay ban da loc). */
export function cleanMeta(m, id, kind) {
  const lb = m && typeof m.label === 'object' && m.label ? m.label : {}
  const params = m && typeof m.params === 'object' && m.params ? m.params : {}
  const works = m && typeof m.works === 'object' && m.works ? m.works : {}
  const out = {
    id,
    kind,
    layer: m?.layer === 'behind' ? 'behind' : 'front',
    duration: num(m?.duration, 0.1, 8, 1.5),
    params: {
      colors: arr(params.colors, 4, 40).filter((c) => /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%deg]+\))$/.test(c)),
      intensity: num(params.intensity, 0.1, 1, 0.7)
    },
    works: { portrait: !!works.portrait, landscape: !!works.landscape },
    needs_face: !!m?.needs_face,
    rt: Math.round(num(m?.rt, 1, 99, 1)),
    label: {
      name: s(lb.name, 80),
      summary: s(lb.summary),
      visual: s(lb.visual, 1000),
      use_when: s(lb.use_when),
      avoid_when: arr(lb.avoid_when),
      moods: arr(lb.moods),
      moments: arr(lb.moments),
      placement: s(lb.placement, 80),
      energy: ['nhe', 'vua', 'manh'].includes(lb.energy) ? lb.energy : 'vua',
      tags: arr(lb.tags),
      quality: Math.round(num(lb.quality, 1, 5, 3)),
      quality_note: s(lb.quality_note, 300)
    },
    created: s(m?.created, 30)
  }
  if (typeof m?.parent === 'string' && FX_ID_RE.test(m.parent)) out.parent = m.parent
  if (SFX.includes(m?.sfx)) out.sfx = m.sfx
  return out
}
