import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { lstat, readdir } from 'fs/promises'
import { extname, join, resolve } from 'path'
import { randomBytes } from 'crypto'
import { shell } from 'electron'
import { ENGINE_HOME } from './paths'
import { insideDir } from './project-media'
import { runDir } from './runlog'

const FILE = join(ENGINE_HOME, 'projects.json')
/** Thu muc chua moi thu muc du an (ensureWorkDir). Chi thu muc NAM TRONG day moi duoc dua vao Thung rac. */
export const PROJECTS_DIR = join(ENGINE_HOME, 'projects')

export interface Project {
  id: string
  createdAt: number
  updatedAt: number
  status: string // upload|understanding|reference|analyzing_reference|planning|review|building|sample|done|error
  topic?: string
  video?: { path: string; name: string; duration: number; thumb?: string }
  videos?: { id: string; path: string; name: string; duration: number; thumb?: string }[]
  referenceVideo?: { path: string; name: string; duration: number; thumb?: string } | null
  editRequest?: { purpose?: string; style?: string; audience?: string; duration?: string }
  brandGuide?: { typography?: string; colors?: string; graphics?: string; imagery?: string; motion?: string }
  /** khung video xuat ra (vang mat = doc 9:16) */
  orientation?: 'portrait' | 'landscape'
  workDir?: string
  brief?: unknown
  sourceBrief?: unknown
  referenceAnalysis?: unknown
  plan?: unknown
  review?: unknown
  rounds?: number
  sampleDeploy?: string | null
  fullDeploy?: string | null
  error?: { step: string; message: string } | null
  /** 'remotion' = project cua menu Video Remotion; vang mat = du an cua luong CapCut cu (da go) */
  mode?: string
  [k: string]: unknown
}

interface Store {
  current: string | null
  /** project dang lam cua menu Video Remotion (`current` la con tro cu cua luong CapCut da go) */
  currentRemotion?: string | null
  /** Cac the video dang mo o "Tao video" (nhieu video chay cung luc), theo thu tu the */
  openRemotion?: string[]
  items: Record<string, Project>
}

const isRemotion = (mode?: string | null) => mode === 'remotion'

function read(): Store {
  if (existsSync(FILE)) {
    try {
      return JSON.parse(readFileSync(FILE, 'utf-8'))
    } catch {
      return { current: null, items: {} }
    }
  }
  return { current: null, items: {} }
}

function write(data: Store): void {
  if (!existsSync(ENGINE_HOME)) mkdirSync(ENGINE_HOME, { recursive: true })
  writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export function newId(): string {
  return 'p_' + randomBytes(6).toString('hex')
}

export function listProjects(): Project[] {
  const s = read()
  return Object.values(s.items).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getProject(id: string): Project | null {
  return read().items[id] || null
}

export function saveProject(p: Project): Project {
  const s = read()
  const now = Date.now()
  if (!p.id) p.id = newId()
  if (!p.createdAt) p.createdAt = now
  p.updatedAt = now
  s.items[p.id] = p
  // Nhieu the video (openRemotion) -> the dang xem do CreateVideo ghi (setOpenTabs); the chay nen luu khong duoc gianh
  if (isRemotion(p.mode)) {
    if (!Array.isArray(s.openRemotion)) s.currentRemotion = p.id
  } else s.current = p.id
  write(s)
  return p
}

/** File tren may cua 1 du an — cho hop xac nhan xoa */
export interface ProjectDiskInfo {
  /** Thu muc du an (video nguon/mau da chep vao + video da render) */
  workDir: string | null
  /** Dua duoc thu muc du an vao Thung rac khong (false -> chi go khoi danh sach) */
  trashable: boolean
  /** Ly do khong dua vao Thung rac duoc */
  reason?: string
  bytes: number
  files: number
  /** So video MP4 da render nam trong thu muc du an */
  renders: number
  /** Video nguon / mau nam NGOAI thu muc du an — khong bao gio bi dung toi */
  outside: string[]
  hasRunLog: boolean
}

async function dirUsage(dir: string): Promise<{ bytes: number; files: number; renders: number }> {
  const out = { bytes: 0, files: 0, renders: 0 }
  const walk = async (d: string, depth: number) => {
    let names: string[] = []
    try {
      names = await readdir(d)
    } catch {
      return
    }
    for (const n of names) {
      const p = join(d, n)
      try {
        // lstat: khong di theo symlink ra ngoai thu muc du an
        const st = await lstat(p)
        if (st.isDirectory()) {
          if (depth < 8) await walk(p, depth + 1)
        } else if (st.isFile()) {
          out.bytes += st.size
          out.files += 1
          // Video render nam ngay trong thu muc du an (video-nguon/ video-mau/ la ban chep)
          if (depth === 0 && extname(n).toLowerCase() === '.mp4') out.renders += 1
        }
      } catch {
        /* file vua bi xoa — bo qua */
      }
    }
  }
  await walk(dir, 0)
  return out
}

function projectMediaPaths(p: Project): string[] {
  const list = [...(p.videos || []).map((v) => v.path), p.video?.path, p.referenceVideo?.path]
  return Array.from(new Set(list.filter((x): x is string => !!x)))
}

/** Vi sao thu muc du an KHONG duoc dua vao Thung rac (null = duoc) */
function trashBlock(s: Store, id: string, workDir: string | undefined): string | null {
  if (!workDir) return 'Dự án không có thư mục riêng.'
  const wd = resolve(workDir)
  if (!insideDir(wd, PROJECTS_DIR) || wd === resolve(PROJECTS_DIR)) {
    return 'Thư mục dự án nằm ngoài ~/.capcut-studio/projects nên app không xoá.'
  }
  if (!existsSync(wd)) return 'Thư mục dự án không còn trên máy.'
  // Chi xet thu muc cua du an khac HOP LE (nam han trong projects/) — 1 du an hong tro vao chinh
  // projects/ khong duoc chan xoa moi du an con lai
  const shared = Object.values(s.items).find((o) => {
    if (o.id === id || !o.workDir) return false
    const ow = resolve(o.workDir)
    if (!insideDir(ow, PROJECTS_DIR) || ow === resolve(PROJECTS_DIR)) return false
    return insideDir(ow, wd) || insideDir(wd, ow)
  })
  if (shared) return `Thư mục đang dùng chung với dự án khác (“${shared.topic || shared.id}”).`
  return null
}

export async function projectDiskInfo(id: string): Promise<ProjectDiskInfo | null> {
  const s = read()
  const p = s.items[id]
  if (!p) return null
  const block = trashBlock(s, id, p.workDir)
  const usage = p.workDir && existsSync(p.workDir) ? await dirUsage(p.workDir) : { bytes: 0, files: 0, renders: 0 }
  return {
    workDir: p.workDir || null,
    trashable: !block,
    reason: block || undefined,
    ...usage,
    outside: p.workDir ? projectMediaPaths(p).filter((x) => !insideDir(x, p.workDir as string)) : projectMediaPaths(p),
    hasRunLog: existsSync(runDir(id))
  }
}

/**
 * Xoa du an khoi danh sach. withFiles = dua THU MUC DU AN (+ nhat ky xu ly) vao Thung rac — lay lai
 * duoc tu Thung rac. Khong bao gio dung toi file ngoai ~/.capcut-studio/projects (video goc cua nguoi
 * dung), thu vien phan tich va cache buoc AI (de lan sau dung lai). Dua vao Thung rac hong -> KHONG go
 * khoi danh sach, bao loi.
 */
export async function deleteProject(
  id: string,
  opts: { withFiles?: boolean } = {}
): Promise<{ ok: boolean; trashed: string[]; error?: string }> {
  const s = read()
  const p = s.items[id]
  const trashed: string[] = []
  if (p && opts.withFiles) {
    const block = trashBlock(s, id, p.workDir)
    if (block) return { ok: false, trashed, error: block }
    try {
      await shell.trashItem(resolve(p.workDir as string))
      trashed.push(resolve(p.workDir as string))
    } catch (e) {
      // Windows: file dang mo (xem truoc / dang render / trinh phat video) -> khong vao Thung rac duoc
      const busy = process.platform === 'win32' ? ' Có thể một video trong dự án đang được mở (xem trước, trình phát) — đóng lại rồi thử lại.' : ''
      return { ok: false, trashed, error: 'Không chuyển được thư mục dự án vào Thùng rác: ' + String(e) + busy }
    }
    const log = runDir(id)
    if (existsSync(log)) {
      try {
        await shell.trashItem(log)
        trashed.push(log)
      } catch {
        /* nhat ky nho — hong thi thoi, du an van xoa */
      }
    }
  }
  const cur = read()
  delete cur.items[id]
  if (cur.current === id) cur.current = null
  if (cur.currentRemotion === id) cur.currentRemotion = null
  if (cur.openRemotion) cur.openRemotion = cur.openRemotion.filter((x) => x !== id)
  write(cur)
  return { ok: true, trashed }
}

export function getCurrent(mode?: string): Project | null {
  const s = read()
  const id = isRemotion(mode) ? s.currentRemotion : s.current
  const p = id ? s.items[id] : null
  if (!p) return null
  // khong bao gio khoi phuc nham du an CapCut cu vao menu Video Remotion (va nguoc lai)
  return isRemotion(p.mode) === isRemotion(mode) ? p : null
}

export function setCurrent(id: string | null, mode?: string): void {
  const s = read()
  if (isRemotion(mode)) s.currentRemotion = id
  else s.current = id
  write(s)
}

/** The video dang mo o "Tao video" (chi du an Remotion con ton tai) + the dang xem */
export function getOpenTabs(): { ids: string[]; active: string | null } {
  const s = read()
  const ok = (id: unknown): id is string => typeof id === 'string' && isRemotion(s.items[id]?.mode)
  const ids = (Array.isArray(s.openRemotion) ? s.openRemotion : []).filter(ok)
  const uniq = ids.filter((id, i) => ids.indexOf(id) === i)
  return { ids: uniq, active: ok(s.currentRemotion) ? s.currentRemotion : null }
}

export function setOpenTabs(ids: string[], active?: string | null): void {
  const s = read()
  s.openRemotion = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && !!s.items[id])
  if (active !== undefined) s.currentRemotion = active && s.items[active] ? active : null
  write(s)
}
