// QUY TRINH motion-video-director cho "Tao video" / "Automation Video" — THU NGHIEM CA NHAN (2026-10-19).
//
// motion-video-director (Miftahul Islam) la skill THUONG MAI 1 NGUOI DUNG: LICENSE.md cua tac gia CAM phan phoi lai / dong
// goi vao san pham dua cho nguoi khac (ke ca ban sua / viet lai). Vi vay:
//  - KHONG chep skill vao repo, KHONG dua vao electron-builder (extraResources), KHONG chep vao ~/.capcut-studio;
//  - app chi DOC ban da cai tren CHINH MAY NAY (~/.claude/skills/motion-video-director hoac $AGENT_EDIT_MVD_DIR) va LIEN KET
//    (symlink, khong chep) vao <job>/.claude/skills/motion-video-director;
//  - may khong co skill (may khach) -> mvdStatus().available = false -> form khong hien lua chon, Tao video chay motionmaxxing.
// Phan phoi cho khach chi khi da co giay phep bang van ban cua tac gia (user se xin sau khi thu xong).
//
// Module chi dung fs (khong electron) -> tests/test_motion.mts.
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

export const MVD_NAME = 'motion-video-director'

/** Thu muc skill da cai tren may nay (co SKILL.md), else null. */
export function mvdSkillDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const cands = [env.AGENT_EDIT_MVD_DIR, join(homedir(), '.claude', 'skills', MVD_NAME)].filter(Boolean) as string[]
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

export function mvdStatus(env: NodeJS.ProcessEnv = process.env): MvdStatus {
  const dir = mvdSkillDir(env)
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

/** <jobDir>/.claude/skills/motion-video-director -> skill tren may (CHI symlink / junction — khong bao gio chep ban sao). */
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
