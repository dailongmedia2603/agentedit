// Skill motionmaxxing DONG GOI TRONG APP (capcut-ai-studio/skills/motionmaxxing -> Resources/skills/motionmaxxing).
//
// Vi sao chep ra ~/.capcut-studio/motion/skill/<phien-ban>/ thay vi dung thang trong app:
//  - thu muc trong .app chi doc + co chu ky (macOS) — skill ghi file (taste/verdicts.md...) se hong chu ky;
//  - cap nhat app (thay ca .app) giua luc dang tao video khong lam doi skill cua video do.
// Phien ban = bam noi dung skill -> cap nhat app co skill moi thi lan dau chay tu chep ban moi (khach khong lam gi),
// skill khong doi thi giu nguyen. Moi job tro toi skill qua <job>/.claude/skills/motionmaxxing (Claude Code tu nap
// skill cua thu muc du an khi chay `--setting-sources project`) — KHONG cai vao ~/.claude/skills cua khach.
//
// Module chi dung fs/crypto (khong electron) -> test duoc bang Node (tests/test_motion.mts).
import { createHash } from 'crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, renameSync, writeFileSync, lstatSync, unlinkSync } from 'fs'
import { dirname, join, relative, sep } from 'path'

const MARK = '.agent-edit-complete'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    if (name === '.git' || name === '.DS_Store' || name === MARK) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (st.isFile()) out.push(p)
  }
  return out
}

/** Bam noi dung skill (duong dan tuong doi + noi dung tung file) — 12 ky tu dau. */
export function skillVersion(bundleDir: string): string {
  const h = createHash('sha1')
  for (const f of walk(bundleDir)) {
    h.update(relative(bundleDir, f).split(sep).join('/'))
    h.update('\0')
    h.update(readFileSync(f))
    h.update('\0')
  }
  return h.digest('hex').slice(0, 12)
}

/** Chep skill vao <motionHome>/skill/<phien-ban>/ (neu chua co ban do), xoa cac ban cu khac. Tra thu muc skill. */
export function installSkill(bundleDir: string, motionHome: string, opts: { cleanup?: boolean } = {}): { dir: string; version: string; fresh: boolean } {
  if (!existsSync(join(bundleDir, 'SKILL.md'))) throw new Error('Thiếu SKILL.md trong gói kỹ năng: ' + bundleDir)
  const version = skillVersion(bundleDir)
  const root = join(motionHome, 'skill')
  const dir = join(root, version)
  let fresh = false
  if (!existsSync(join(dir, MARK))) {
    mkdirSync(root, { recursive: true })
    const tmp = `${dir}.tmp-${process.pid}-${Date.now()}`
    rmSync(tmp, { recursive: true, force: true })
    cpSync(bundleDir, tmp, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) })
    writeFileSync(join(tmp, MARK), version)
    rmSync(dir, { recursive: true, force: true })
    renameSync(tmp, dir)
    fresh = true
  }
  if (opts.cleanup !== false) {
    for (const name of readdirSync(root)) {
      if (name === version) continue
      try {
        rmSync(join(root, name), { recursive: true, force: true })
      } catch {
        /* dang bi khoa (Windows) -> lan sau */
      }
    }
  }
  return { dir, version, fresh }
}

/** <jobDir>/.claude/skills/motionmaxxing -> skillDir (Windows: junction, khong can quyen admin). */
export function linkSkill(jobDir: string, skillDir: string): string {
  const link = join(jobDir, '.claude', 'skills', 'motionmaxxing')
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
  } catch {
    // he thong tep khong cho tao lien ket -> chep ban sao
    cpSync(skillDir, link, { recursive: true })
  }
  return link
}
