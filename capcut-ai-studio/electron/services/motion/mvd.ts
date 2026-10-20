// motion-video-director cho "Tao video" / "Automation Video".
// User xac nhan da co quyen phan phoi rieng (2026-10-20): dong goi trong Resources/skills,
// giu nguyen LICENSE.md / thong tin tac gia. Runner cai ban theo hash vao motion/mvd/skill
// de job khong phu thuoc vao .app bi thay khi cap nhat. Khong cai vao ~/.claude/skills cua khach.
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { bundledSkillDir } from './paths'

export const MVD_NAME = 'motion-video-director'

/** Uu tien override ro rang, roi ban dong goi, cuoi cung ban cai rieng cu. */
export function mvdSkillDir(env: NodeJS.ProcessEnv = process.env, bundleDir = bundledSkillDir(MVD_NAME)): string | null {
  const cands = [env.AGENT_EDIT_MVD_DIR, bundleDir, join(homedir(), '.claude', 'skills', MVD_NAME)].filter(Boolean) as string[]
  for (const d of cands) {
    try {
      if (existsSync(join(d, 'SKILL.md')) && /name:\s*motion-video-director/.test(readFileSync(join(d, 'SKILL.md'), 'utf-8').slice(0, 400))) return d
    } catch {
      /* khong doc duoc */
    }
  }
  return null
}

export interface MvdStatus {
  available: boolean
  version?: string
  dir?: string
  /** co key ElevenLabs tren may (nhac / SFX tao rieng cho video) */
  elevenlabs: boolean
}

export function mvdStatus(env: NodeJS.ProcessEnv = process.env, bundleDir = bundledSkillDir(MVD_NAME)): MvdStatus {
  const dir = mvdSkillDir(env, bundleDir)
  const eleven = !!elevenLabsKey(env)
  if (!dir) return { available: false, elevenlabs: eleven }
  let version: string | undefined
  try {
    version = /Motion Video Director\s*[—-]\s*v?([\d.]+)/i.exec(readFileSync(join(dir, 'SKILL.md'), 'utf-8'))?.[1]
  } catch {
    /* bo qua */
  }
  return { available: true, version, dir, elevenlabs: eleven }
}

/** <jobDir>/.claude/skills/motion-video-director -> ban skill da cai (Windows: junction). */
export function linkMvd(jobDir: string, skillDir: string): string {
  const link = join(jobDir, '.claude', 'skills', MVD_NAME)
  mkdirSync(dirname(link), { recursive: true })
  try {
    const st = lstatSync(link)
    if (st.isSymbolicLink() || st.isFile()) unlinkSync(link)
    else rmSync(link, { recursive: true, force: true })
  } catch {
    /* chua co */
  }
  try {
    symlinkSync(skillDir, link, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (e) {
    throw new Error('Không liên kết được skill motion-video-director vào thư mục video: ' + String((e as Error)?.message || e))
  }
  return link
}

/** Key ElevenLabs cua may (bien moi truong, ~/.elevenlabs, ~/.config/elevenlabs) — cung cho do voice.py tim. */
export function elevenLabsKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = String(env.ELEVENLABS_API_KEY || '').trim()
  if (v) return v
  for (const p of [join(homedir(), '.elevenlabs'), join(homedir(), '.config', 'elevenlabs')]) {
    try {
      if (!existsSync(p)) continue
      const line = readFileSync(p, 'utf-8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s && !s.startsWith('#'))
      const key = line?.replace(/^(export\s+)?ELEVENLABS_API_KEY\s*=\s*/, '').replace(/^['"]|['"]$/g, '')
      if (key) return key
    } catch {
      /* bo qua */
    }
  }
  return null
}
