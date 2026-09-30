import { useCallback, useEffect, useRef, useState } from 'react'

/** Muc nao con can tu cai (thieu / sai phien ban va app cai duoc) */
export const needsAutoFix = (c: DoctorCheck[]): boolean => c.some((x) => x.fix && x.auto && x.status !== 'ok')

/** San sang tao video = khong con muc nao "fail" (warn = mat 1 phan, van tao duoc) */
export const doctorReady = (c: DoctorCheck[], p: DoctorProgress | null): boolean =>
  c.length > 0 && !p?.running && c.every((x) => x.status !== 'fail')

/**
 * Trang thai Doctor dung chung cho ca app (App luon mounted -> doi tab khong ngat viec tu cai):
 * mo app -> kiem -> con thieu thi TU CAI 1 luot (main process chay, bao tien trinh qua su kien) -> kiem lai.
 */
export function useDoctor() {
  const [checks, setChecks] = useState<DoctorCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<DoctorProgress | null>(null)
  const [fixing, setFixing] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const started = useRef(false)
  const busy = !!progress?.running || !!fixing

  const run = useCallback(async () => {
    setLoading(true)
    try {
      const c = await window.studio.doctorRun()
      setChecks(c)
      return c
    } finally {
      setLoading(false)
    }
  }, [])

  const autoFix = useCallback(async () => {
    setLogs((l) => [...l, '▶ Tự kiểm tra xong — bắt đầu cài các công cụ còn thiếu / sai phiên bản'])
    const r = await window.studio.doctorAutoFix()
    setChecks(r.checks)
    setProgress(r.progress)
  }, [])

  const fix = useCallback(
    async (id: string) => {
      setFixing(id)
      setLogs((l) => [...l, `▶ Bắt đầu cài: ${id}`])
      try {
        const res = await window.studio.doctorFix(id)
        setLogs((l) => [...l, res.ok ? `✓ Hoàn tất: ${id}` : `✗ Lỗi: ${res.error}`])
      } finally {
        setFixing(null)
      }
      await run()
    },
    [run]
  )

  useEffect(() => {
    const offLog = window.studio.onDoctorLog(({ line }) => setLogs((l) => [...l.slice(-400), line]))
    const offProg = window.studio.onDoctorProgress(setProgress)
    if (!started.current) {
      started.current = true
      ;(async () => {
        const st = await window.studio.doctorStatus().catch(() => null)
        // tai lai cua so trong luc main dang cai -> gan vao luot dang chay thay vi chay luot moi
        if (st?.running) {
          setProgress(st)
          await autoFix()
          return
        }
        const c = await run()
        if (needsAutoFix(c)) await autoFix()
      })()
    }
    return () => {
      offLog()
      offProg()
    }
  }, [run, autoFix])

  return { checks, loading, progress, fixing, logs, busy, run, fix, ready: doctorReady(checks, progress) }
}
