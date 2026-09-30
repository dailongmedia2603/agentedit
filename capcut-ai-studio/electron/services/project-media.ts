// VIDEO CUA DU AN (2026-09-26): video nguon / video mau nguoi dung them vao duoc CHEP vao thu muc rieng
// cua du an (<workDir>/video-nguon, <workDir>/video-mau) va moi buoc dung ban chep nay. Nguoi dung
// chuyen / xoa file goc (Downloads...) du an van con nguyen (su co that: IMG_3839.MOV + tiktok_video.mp4
// bi chuyen khoi Downloads -> du an mat video).
//
// Chep bang COPYFILE_FICLONE: cung o APFS = clone (tuc thi, KHONG ton them dung luong, file goc giu nguyen
// cho cu); khac o -> chep that (kiem dung luong trong truoc). Khong import 'electron' -> test duoc bang node.
import { promises as fsp, constants, existsSync } from 'fs'
import type { FileHandle } from 'fs/promises'
import { basename, extname, join, resolve, sep } from 'path'

// insert = TU LIEU cua nguoi dung (anh / video chen LEN video dang edit — sidecar user_media.py)
export type MediaKind = 'source' | 'reference' | 'insert'

export const MEDIA_SUBDIR: Record<MediaKind, string> = { source: 'video-nguon', reference: 'video-mau', insert: 'tu-lieu-chen' }

export interface ImportedMedia {
  /** duong dan nguoi dung dua vao */
  src: string
  /** duong dan ban trong du an (vang mat = loi) */
  path?: string
  /** true = vua chep; false = da nam trong du an / da co ban giong het */
  copied?: boolean
  /** chep bang clone APFS (khong ton them dung luong) */
  cloned?: boolean
  error?: string
}

const CHUNK = 1 << 20
const SPACE_MARGIN = 512 * 1024 * 1024 // chua lai it nhat 512MB sau khi chep

export function insideDir(p: string, dir: string): boolean {
  if (!p || !dir) return false
  const a = resolve(p)
  const d = resolve(dir)
  return a === d || a.startsWith(d + sep)
}

async function readAt(fh: FileHandle, pos: number, len: number): Promise<Buffer> {
  const buf = Buffer.alloc(len)
  const { bytesRead } = await fh.read(buf, 0, len, pos)
  return buf.subarray(0, bytesRead)
}

/** Hai file cung noi dung (nhanh: kich thuoc + 1MB dau / giua / cuoi) — nhan ra file da chep truoc do. */
export async function sameContent(a: string, b: string): Promise<boolean> {
  try {
    const [sa, sb] = await Promise.all([fsp.stat(a), fsp.stat(b)])
    if (!sa.isFile() || !sb.isFile() || sa.size !== sb.size) return false
    const fa = await fsp.open(a, 'r')
    const fb = await fsp.open(b, 'r')
    try {
      for (const pos of [0, Math.max(0, Math.floor(sa.size / 2) - CHUNK / 2), Math.max(0, sa.size - CHUNK)]) {
        const [x, y] = await Promise.all([readAt(fa, pos, CHUNK), readAt(fb, pos, CHUNK)])
        if (!x.equals(y)) return false
      }
      return true
    } finally {
      await fa.close()
      await fb.close()
    }
  } catch {
    return false
  }
}

async function importOne(workDir: string, src: string, kind: MediaKind, name?: string): Promise<ImportedMedia> {
  let st
  try {
    st = await fsp.stat(src)
  } catch {
    return { src, error: 'Không tìm thấy file' }
  }
  if (!st.isFile()) return { src, error: kind === 'insert' ? 'Không phải file ảnh / video' : 'Không phải file video' }
  if (insideDir(src, workDir)) return { src, path: resolve(src), copied: false }

  const dir = join(workDir, MEDIA_SUBDIR[kind])
  await fsp.mkdir(dir, { recursive: true })
  const base = basename(name || src)
  const ext = extname(base)
  const stem = base.slice(0, base.length - ext.length) || (kind === 'insert' ? 'tu-lieu' : 'video')
  let dest = join(dir, base)
  for (let k = 2; existsSync(dest); k++) {
    if (await sameContent(src, dest)) return { src, path: dest, copied: false }
    dest = join(dir, `${stem}-${k}${ext}`)
  }

  const sameDevice = (await fsp.stat(dir)).dev === st.dev
  if (!sameDevice) {
    try {
      const fs = await fsp.statfs(dir)
      const free = Number(fs.bavail) * Number(fs.bsize)
      if (free < st.size + SPACE_MARGIN) {
        const gb = (n: number) => (n / 1024 ** 3).toFixed(1)
        return { src, error: `Không đủ dung lượng trống để chép (cần ${gb(st.size)} GB, còn ${gb(free)} GB)` }
      }
    } catch {
      /* khong doc duoc dung luong trong -> cu chep, loi thi bao sau */
    }
  }
  const tmp = dest + '.dang-chep'
  try {
    await fsp.copyFile(src, tmp, constants.COPYFILE_FICLONE)
    const out = await fsp.stat(tmp)
    if (out.size !== st.size) throw new Error(`chép thiếu (${out.size}/${st.size} byte)`)
    await fsp.utimes(tmp, st.atime, st.mtime) // giu ngay cua file goc
    await fsp.rename(tmp, dest)
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => {})
    return { src, error: `Chép file lỗi: ${(e as Error).message || e}` }
  }
  return { src, path: dest, copied: true, cloned: sameDevice }
}

/**
 * Chep cac video vao thu muc du an. `names[i]` = ten file muon dat (vd ban khoi phuc), mac dinh ten goc.
 * Tra ket qua theo dung thu tu `paths`; loi tung file khong lam hong file khac.
 */
export async function importMedia(
  workDir: string,
  paths: string[],
  kind: MediaKind,
  names?: (string | undefined)[]
): Promise<ImportedMedia[]> {
  const out: ImportedMedia[] = []
  for (let i = 0; i < paths.length; i++) {
    try {
      out.push(await importOne(workDir, paths[i], kind, names?.[i]))
    } catch (e) {
      out.push({ src: paths[i], error: String((e as Error).message || e) })
    }
  }
  return out
}

/** Nhung duong dan KHONG con file. */
export function missingFiles(paths: string[]): string[] {
  return (paths || []).filter((p) => !!p && !existsSync(p))
}
