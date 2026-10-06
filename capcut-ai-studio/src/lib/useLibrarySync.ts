import { useEffect, useRef, useState } from 'react'

/**
 * Trang Tai nguyen (SFX / Meme / Text / Nhac nen / Hieu ung) theo doi luot dong bo kho dang chay — ke ca luot app tu chay
 * luc mo: tra true khi dang dong bo; dong bo xong (thanh cong) -> goi reload de danh sach hien muc moi tai ve.
 */
export function useLibrarySync(reload: () => unknown): boolean {
  const [running, setRunning] = useState(false)
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    let alive = true
    window.studio.librarySyncRunning?.().then((r) => alive && setRunning(!!r)).catch(() => {})
    const off = window.studio.onLibrarySyncState?.((s) => {
      setRunning(s.running)
      if (!s.running && s.result?.ok) reloadRef.current()
    })
    return () => {
      alive = false
      off?.()
    }
  }, [])
  return running
}

/** Trang thai dong bo kho cho ca app (muc "Dong bo tai nguyen" o Doctor): dang chay + ket qua luot gan nhat. */
export function useLibrarySyncStatus(): LibrarySyncStatus {
  const [st, setSt] = useState<LibrarySyncStatus>({ running: false })
  useEffect(() => {
    let alive = true
    window.studio.librarySyncStatus?.().then((r) => alive && r && setSt(r)).catch(() => {})
    const off = window.studio.onLibrarySyncState?.((s) => setSt(s))
    return () => {
      alive = false
      off?.()
    }
  }, [])
  return st
}
