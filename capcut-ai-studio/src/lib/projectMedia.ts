// VIDEO CUA DU AN (phia giao dien) — xem electron/services/project-media.ts.
// - replacePaths: doi duong dan video trong TOAN BO du an (danh sach video, brief, phan tich mau, plan,
//   spec) — cac noi nay luu duong dan tuyet doi.
// - adoptProjectMedia: mo du an cu -> chep video con ton tai vao thu muc du an + doi duong dan; video da
//   mat -> khoi phuc tu ban lam viec SDR app con giu (neu chac chan dung video) hoac bao de chon lai.
// Khong import alias '@/...' / window o muc module -> test duoc bang node.

export type MediaKind = 'source' | 'reference'

export interface MissingMedia {
  kind: MediaKind
  /** id nguon (source_1...) | 'reference' */
  key: string
  name: string
  /** duong dan dang ghi trong du an: file da mat, hoac ban khoi phuc (recovered) */
  path: string
  duration?: number
  recovered?: boolean
}

export interface AdoptDeps {
  newWorkDir(name: string): Promise<string>
  mediaImport(
    workDir: string,
    paths: string[],
    kind: MediaKind,
    names?: (string | undefined)[]
  ): Promise<{ ok: boolean; items: ImportedMedia[]; error?: string }>
  mediaMissing(paths: string[]): Promise<string[]>
  /** do dai video (giay) — so khop ban khoi phuc */
  duration(path: string): Promise<number>
}

export interface AdoptResult {
  project: Project
  changed: boolean
  /** so video vua chep vao du an */
  copied: number
  missing: MissingMedia[]
  /** spec phai dung lai tu plan (duong dan nguon doi / file cua spec da mat) */
  specStale: boolean
  errors: string[]
}

/** Ban lam viec SDR cua video HDR (sidecar/media_sdr.py) */
export const SDR_CACHE_MARK = '/.capcut-studio/cache/media-sdr/'

/** Duong dan Windows (C:\... / \\may\...) — so sanh khong phan biet hoa thuong, \ va / nhu nhau. */
const isWinPath = (p: string) => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')

/** Chuan hoa de SO SANH: \ -> /, bo / cuoi; Windows -> chu thuong. (Khong dung de luu.) */
function normPath(p: string): string {
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return isWinPath(p) ? s.toLowerCase() : s
}

export function insideDir(p: string, dir: string): boolean {
  if (!p || !dir) return false
  const a = normPath(p)
  const d = normPath(dir)
  return a === d || a.startsWith(d + '/')
}

export function baseName(p: string): string {
  return (p || '').split(/[\\/]/).pop() || p
}

/** Duong dan tuyet doi (macOS /..., Windows C:\... hoac \\may\...). */
export function isAbsPath(p: string): boolean {
  return p.startsWith('/') || isWinPath(p)
}

/** File nam trong cache ban lam viec SDR (sidecar/media_sdr.py) */
export function isSdrCachePath(p: string): boolean {
  return normPath(p).includes(SDR_CACHE_MARK)
}

/** Thay moi chuoi TRUNG KHOP HOAN TOAN voi mot khoa cua `map` (khong sua doi tuong truyen vao). */
export function replacePaths<T>(x: T, map: Record<string, string>): T {
  if (typeof x === 'string') return (Object.prototype.hasOwnProperty.call(map, x) ? map[x] : x) as T
  if (Array.isArray(x)) return x.map((v) => replacePaths(v, map)) as T
  if (x && typeof x === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) o[k] = replacePaths(v, map)
    return o as T
  }
  return x
}

/** Moi duong dan file (khoa "path") ma spec can: clip, lop tach nguoi, am thanh, anh... */
export function specMediaPaths(spec: unknown): string[] {
  const out = new Set<string>()
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        if (k === 'path' && typeof v === 'string' && isAbsPath(v)) out.add(v)
        else walk(v)
      }
    }
  }
  walk(spec)
  return [...out]
}

/** Ban lam viec SDR ma cac clip THAN video cua spec dang dung (ung vien khoi phuc video nguon da mat). */
export function sdrCandidates(spec: unknown): string[] {
  const clips = ((spec as { clips?: { path?: string; kind?: string }[] })?.clips || []) as {
    path?: string
    kind?: string
  }[]
  const out = new Set<string>()
  for (const c of clips) {
    if (c && c.kind !== 'insert' && typeof c.path === 'string' && isSdrCachePath(c.path)) out.add(c.path)
  }
  return [...out]
}

function stemOf(name: string): string {
  const b = baseName(name)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(0, i) : b
}

/**
 * Du an mo len: chep video (nguon + mau) con nam NGOAI thu muc du an vao `<workDir>/video-nguon|video-mau`,
 * doi duong dan trong ca du an. Video nguon da mat + spec con ban lam viec SDR dung do dai -> khoi phuc tu do.
 * Loi chep 1 file -> giu duong dan cu (file van con), bao loi; khong nem loi.
 */
export async function adoptProjectMedia(p: Project, deps: AdoptDeps): Promise<AdoptResult> {
  const res: AdoptResult = { project: p, changed: false, copied: 0, missing: [], specStale: false, errors: [] }
  type Entry = { kind: MediaKind; key: string; v: VideoFile }
  const entries: Entry[] = [
    ...(p.videos || []).map((v) => ({ kind: 'source' as MediaKind, key: v.id, v })),
    ...(p.referenceVideo ? [{ kind: 'reference' as MediaKind, key: 'reference', v: p.referenceVideo }] : [])
  ].filter((e) => !!e.v?.path)
  if (!entries.length) return res

  let wd = p.workDir || ''
  const gone = new Set(await deps.mediaMissing(entries.map((e) => e.v.path)))
  const external = entries.filter((e) => !gone.has(e.v.path) && !insideDir(e.v.path, wd))
  const lost = entries.filter((e) => gone.has(e.v.path))

  // ung vien khoi phuc: ban SDR spec dang dung, con file, dung do dai (+-0.6s), chi 1 ung vien cho 1 video
  const recover: { e: Entry; from: string }[] = []
  const lostSources = lost.filter((e) => e.kind === 'source')
  if (lostSources.length && p.rmSpec) {
    const cands = sdrCandidates(p.rmSpec)
    const goneC = new Set(await deps.mediaMissing(cands))
    const live = cands.filter((c) => !goneC.has(c))
    const durs = await Promise.all(live.map((c) => deps.duration(c).catch(() => 0)))
    const taken = new Set<string>()
    for (const e of lostSources) {
      if (!e.v.duration) continue
      const hit = live.filter((c, i) => durs[i] > 0 && Math.abs(durs[i] - e.v.duration) <= 0.6)
      if (hit.length === 1 && !taken.has(hit[0])) {
        taken.add(hit[0])
        recover.push({ e, from: hit[0] })
      }
    }
  }

  if ((external.length || recover.length) && !wd) {
    wd = await deps.newWorkDir('remotion-' + (p.topic || 'video'))
  }
  const map: Record<string, string> = {}
  const recovered = new Set<string>()
  for (const kind of ['source', 'reference'] as MediaKind[]) {
    const list = external.filter((e) => e.kind === kind)
    if (!list.length) continue
    const r = await deps.mediaImport(wd, list.map((e) => e.v.path), kind)
    list.forEach((e, i) => {
      const it = r.items[i]
      if (it?.path) {
        if (it.path !== e.v.path) map[e.v.path] = it.path
        if (it.copied) res.copied++
      } else res.errors.push(`${e.v.name}: ${it?.error || r.error || 'không chép được'}`)
    })
  }
  if (recover.length) {
    const r = await deps.mediaImport(
      wd,
      recover.map((x) => x.from),
      'source',
      recover.map((x) => `${stemOf(x.e.v.name)}-ban-sdr.mov`)
    )
    recover.forEach((x, i) => {
      const it = r.items[i]
      if (it?.path) {
        map[x.e.v.path] = it.path
        recovered.add(x.e.key)
      } else res.errors.push(`${x.e.v.name}: không khôi phục được (${it?.error || r.error || 'lỗi'})`)
    })
  }

  let proj = p
  if (Object.keys(map).length || wd !== (p.workDir || '')) {
    proj = replacePaths(p, map)
    proj.workDir = wd
    const fix = <V extends VideoFile>(v: V, key: string): V => {
      const old = entries.find((e) => e.key === key)?.v.path
      if (!old || !map[old]) return v
      return { ...v, origPath: v.origPath || old, ...(recovered.has(key) ? { recovered: true } : {}) }
    }
    const vids = (proj.videos || []).map((v) => fix(v, v.id))
    proj.videos = vids
    if (proj.referenceVideo) proj.referenceVideo = fix(proj.referenceVideo, 'reference')
    if (vids.length) proj.video = vids[0]
    res.changed = true
  }
  res.project = proj

  // da khoi phuc tu truoc (dang dung ban SDR 1080p) -> van nhac, cho chon lai file goc
  for (const e of entries) {
    if (!gone.has(e.v.path) && e.v.recovered)
      res.missing.push({ kind: e.kind, key: e.key, name: e.v.name, path: map[e.v.path] || e.v.path, duration: e.v.duration, recovered: true })
  }
  for (const e of lost) {
    const now = map[e.v.path]
    res.missing.push({
      kind: e.kind,
      key: e.key,
      name: e.v.name,
      path: now || e.v.path,
      duration: e.v.duration,
      ...(recovered.has(e.key) ? { recovered: true } : {})
    })
  }
  // spec dung duong dan nguon cu / ban SDR cua file goc -> dung lai tu plan; file cua spec bi don -> cung vay
  if (proj.rmSpec && proj.rmPlan) {
    const srcChanged = entries.some((e) => e.kind === 'source' && map[e.v.path])
    const specGone = srcChanged ? [] : await deps.mediaMissing(specMediaPaths(proj.rmSpec))
    res.specStale = srcChanged || specGone.length > 0
  }
  return res
}
