// AM THANH cho "Tao video" (2026-10-15, user: video tao ra khong con cam). Truoc day prompt bao skill bo SFX + nhac vi
// khong co ElevenLabs. Nay sidecar `/sound/catalog` (director.sound_catalog) tra: 5 bo tieng "the gioi" tong hop + SFX
// trong kho (khong giong noi) + nhac nen da gan nhan, kem duong dan file. Module nay (thuan fs, khong electron ->
// tests/test_motion.mts) lien ket thu muc tieng / nhac vao <job>/sound/ (Windows: junction, khong can quyen admin) va
// ghi <job>/sound/catalog.json voi duong dan TUONG DOI trong job -> Claude chi lam viec trong thu muc job.
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs'
import { join, relative, sep } from 'path'

export interface SoundCatalog {
  sfx_worlds?: Record<string, { name: string; character: string; sounds: { family: string; file: string; [k: string]: unknown }[] }>
  sfx_library?: { id: string; file: string; [k: string]: unknown }[]
  music?: { id: string; file: string; [k: string]: unknown }[]
}

export interface SoundSummary {
  worlds: number
  library: number
  music: number
}

function linkDir(target: string, link: string): boolean {
  try {
    const st = lstatSync(link)
    if (st.isSymbolicLink() || st.isFile()) unlinkSync(link)
    else rmSync(link, { recursive: true, force: true })
  } catch {
    /* chua co */
  }
  try {
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  } catch {
    return false
  }
}

/** file tuyet doi trong `root` -> "sound/<name>/<duong dan con>"; khong nam trong root -> giu tuyet doi (neu da lien
 *  ket duoc) hoac null. */
function rel(file: string, root: string, name: string, linked: boolean): string | null {
  if (!file || !existsSync(file)) return null
  const r = relative(root, file)
  if (!r || r.startsWith('..') || r.includes(':')) return linked ? null : file
  return linked ? ['sound', name, ...r.split(sep)].join('/') : file
}

/** Chuan bi <job>/sound/ tu danh muc sidecar. Tra so muc dung duoc, hoac null (khong co gi -> video khong am thanh kho). */
export function prepareSound(jobDir: string, cat: SoundCatalog | null | undefined, sfxDir: string, musicDir: string): SoundSummary | null {
  if (!cat) return null
  const dir = join(jobDir, 'sound')
  mkdirSync(dir, { recursive: true })
  const sfxLinked = existsSync(sfxDir) && linkDir(sfxDir, join(dir, 'sfx'))
  const musicLinked = existsSync(musicDir) && linkDir(musicDir, join(dir, 'music'))
  const worlds: NonNullable<SoundCatalog['sfx_worlds']> = {}
  for (const [w, v] of Object.entries(cat.sfx_worlds || {})) {
    const sounds = (v.sounds || [])
      .map((s) => ({ ...s, file: rel(s.file, sfxDir, 'sfx', sfxLinked) }))
      .filter((s): s is typeof s & { file: string } => !!s.file)
    if (sounds.length) worlds[w] = { ...v, sounds }
  }
  const library = (cat.sfx_library || [])
    .map((s) => ({ ...s, file: rel(s.file, sfxDir, 'sfx', sfxLinked) }))
    .filter((s): s is typeof s & { file: string } => !!s.file)
  const music = (cat.music || [])
    .map((m) => ({ ...m, file: rel(m.file, musicDir, 'music', musicLinked) }))
    .filter((m): m is typeof m & { file: string } => !!m.file)
  const sum = { worlds: Object.keys(worlds).length, library: library.length, music: music.length }
  if (!sum.worlds && !sum.music) return null
  writeFileSync(
    join(dir, 'catalog.json'),
    JSON.stringify(
      {
        _readme:
          'Local sound library for this film. Paths are relative to the job folder (use them as-is with mix.py). ' +
          'sfx_worlds: synthesized sound sets, each with ONE character - pick one world for the whole film. ' +
          'sfx_library: labelled sound effects (summary / use_when / avoid_when). music: labelled background tracks ' +
          '(energy, tempo, moods, use_when) - all instrumental.',
        sfx_worlds: worlds,
        sfx_library: library,
        music
      },
      null,
      1
    )
  )
  return sum
}
