import { useCallback, useEffect, useState } from 'react'
import { fileUrl } from './platform'
import { useLibrarySync } from './useLibrarySync'

// Kho font tai len (sidecar font_lib): danh sach + nap font de xem truoc chu bang chinh font do (FontFace file://).

const previewed = new Map<string, Promise<void>>()

/** Nap moi file cua 1 bo font vao trang (ho CSS = font.css) — de ten font / chu mau hien bang chinh no. */
export function usePreviewFont(font: UploadedFont | null | undefined): void {
  useEffect(() => {
    if (!font || typeof FontFace === 'undefined') return
    for (const f of font.files) {
      const key = `${font.css}|${f.path}|${f.weight}|${f.italic ? 1 : 0}`
      if (previewed.has(key)) continue
      const ff = new FontFace(font.css, `url("${fileUrl(f.path)}")`, {
        weight: String(f.weight),
        style: f.italic ? 'italic' : 'normal'
      })
      previewed.set(
        key,
        ff
          .load()
          .then((x) => {
            document.fonts.add(x)
          })
          .catch(() => {
            previewed.delete(key)
          })
      )
    }
  }, [font])
}

export function useUploadedFonts() {
  const [fonts, setFonts] = useState<UploadedFont[]>([])
  const [canPublish, setCanPublish] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(async () => {
    try {
      const r = await window.studio.fontsList()
      if (r.ok) {
        setFonts(r.fonts || [])
        setCanPublish(!!r.can_publish)
      }
    } catch {
      /* sidecar chua san sang -> giu danh sach cu */
    } finally {
      setLoaded(true)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  // dong bo kho xong (font kho chung moi ve) -> tai lai
  const syncing = useLibrarySync(reload)
  return { fonts, canPublish, loaded, reload, syncing }
}

/** Thu nap tung file bang CHINH Chromium (cung bo kiem font OTS voi trinh dung video) -> ten file khong doc duoc.
 *  File bi tu choi = video se hien chu do bang font du phong -> bao ngay luc tai len. */
export async function unreadableFiles(font: UploadedFont): Promise<string[]> {
  if (typeof FontFace === 'undefined') return []
  const bad: string[] = []
  for (const f of font.files) {
    try {
      await new FontFace(`check-${font.id}-${f.weight}`, `url("${fileUrl(f.path)}")`).load()
    } catch {
      bad.push(f.path.split(/[\\/]/).pop() || f.path)
    }
  }
  return bad
}

/** Nhap font + kiem doc duoc bang Chromium -> thong bao (them canh bao file khong doc duoc). */
export async function importAndCheck(
  paths: string[],
  scope: 'local' | 'shared'
): Promise<{ fonts: UploadedFont[]; msg: { text: string; tone: 'ok' | 'warn' | 'fail' } }> {
  const r = await window.studio.fontsImport(paths, scope)
  const msg = importMessage(r)
  const bad: string[] = []
  for (const f of r.fonts || []) bad.push(...(await unreadableFiles(f)))
  if (bad.length) {
    msg.text += ` · ⚠ Trình dựng video không đọc được: ${bad.join(', ')} — chữ dùng file này sẽ hiện bằng font dự phòng; thử bản .otf / .ttf khác của font`
    msg.tone = msg.tone === 'fail' ? 'fail' : 'warn'
  }
  return { fonts: r.fonts || [], msg }
}

/** Ten hien ngan cho vai cua font theo thu tu chon (khop brand_guide.uploaded). */
export function fontRole(i: number, n: number): string {
  if (n <= 1) return 'Mọi chữ'
  if (i === 0) return 'Tiêu đề'
  if (i === n - 1) return 'Nội dung'
  return 'Chữ phụ'
}

/** Ket qua nhap font -> 1 dong thong bao (font moi + file loi + canh bao thieu dau tieng Viet). */
export function importMessage(r: { fonts?: UploadedFont[]; failed?: { path: string; error: string }[]; error?: string }): {
  text: string
  tone: 'ok' | 'warn' | 'fail'
} {
  if (r.error && !r.fonts?.length) return { text: r.error, tone: 'fail' }
  const parts: string[] = []
  const got = r.fonts || []
  if (got.length) parts.push(`Đã lưu ${got.map((f) => `${f.label} (${f.weights.join(', ')})`).join(', ')}`)
  const thieu = got.filter((f) => f.vi_missing)
  if (thieu.length) {
    parts.push(
      `⚠ ${thieu.map((f) => f.label).join(', ')} thiếu ${thieu[0].vi_missing.length} chữ tiếng Việt có dấu (vd ${Array.from(thieu[0].vi_missing).slice(0, 6).join(' ')}) — chữ đó sẽ hiện bằng font dự phòng`
    )
  }
  for (const f of r.failed || []) parts.push(`${f.path.split(/[\\/]/).pop()}: ${f.error}`)
  return { text: parts.join(' · ') || 'Không có font nào được lưu.', tone: !got.length ? 'fail' : r.failed?.length || thieu.length ? 'warn' : 'ok' }
}
