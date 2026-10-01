// BAN CAI CHO MAY KHAC (user 2026-10-02): an moi thu de lo QUY TRINH / CO CHE — nhat ky xu ly, Prompt & quy tac, thanh
// cac buoc, khung ket qua tung buoc, ten AI / ten buoc trong loi nhan. Chuc nang giu nguyen; chi giao dien gon lai.
//   - __CLIENT_UI__ dat luc BUILD (electron.vite.config.ts): `npm run build` / `dist` / `dist:win` = BAN CAI (an);
//     `npm run dev` hoac STUDIO_FULL_UI=1 khi build = giao dien day du (ban cua chu app tren may minh).
//   - Cua bi mat: Ctrl/Cmd + Shift + Alt + D bat / tat giao dien day du — chi luu tren may do (localStorage).
import { useEffect, useState } from 'react'

declare const __CLIENT_UI__: boolean

export const CLIENT_UI_BUILD: boolean = typeof __CLIENT_UI__ !== 'undefined' && __CLIENT_UI__

const KEY = 'studio.fullUi'
const EVT = 'studio-full-ui'

function unlocked(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Giao dien DAY DU (thay quy trinh, nhat ky, prompt...)? Ban cai -> chi khi da mo cua bi mat. */
export function isFullUi(): boolean {
  return !CLIENT_UI_BUILD || unlocked()
}

export function toggleFullUi(): boolean {
  const next = !unlocked()
  try {
    if (next) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* khong luu duoc -> chi doi trong phien nay */
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: next }))
  return next
}

export function useFullUi(): boolean {
  const [full, setFull] = useState(isFullUi)
  useEffect(() => {
    const on = () => setFull(isFullUi())
    window.addEventListener(EVT, on)
    return () => window.removeEventListener(EVT, on)
  }, [])
  return full
}

/** Lang nghe phim tat cua bi mat (chi gan o ban cai). Tra ham go. */
export function installSecretToggle(onToggle?: (full: boolean) => void): () => void {
  if (!CLIENT_UI_BUILD) return () => {}
  const h = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.altKey && e.code === 'KeyD') {
      e.preventDefault()
      const full = toggleFullUi()
      onToggle?.(full)
    }
  }
  window.addEventListener('keydown', h)
  return () => window.removeEventListener('keydown', h)
}
