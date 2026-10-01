// Test xoa du an o "Video da tao" (electron/services/projects.ts). Chay (Node >= 23):
//   HOME=$(mktemp -d) node tests/test_project_delete.mts
// HOME tam: service dung ~/.capcut-studio cua HOME -> khong dung projects.json that.
//
// Can dam bao:
//  1. diskInfo: dem dung dung luong / video da render / video goc NGOAI thu muc du an; khong di theo symlink
//  2. Xoa khong kem file -> chi go khoi danh sach, thu muc con nguyen
//  3. Xoa kem file -> thu muc du an + nhat ky vao Thung rac, video goc ngoai du an KHONG bi dung
//  4. Thu muc ngoai ~/.capcut-studio/projects, chinh thu muc projects, dung chung voi du an khac -> KHONG xoa file
//  5. Thung rac hong -> KHONG go khoi danh sach, bao loi
import { register } from 'node:module'
import { mkdirSync, writeFileSync, existsSync, readFileSync, symlinkSync, mkdtempSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { isAbsolute, join } from 'path'

register('./helpers/electron-mock-loader.mjs', import.meta.url)
const mock = await import('electron' as string)
const P = await import('../electron/services/projects.ts')

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)))
  if (!cond) FAILS.push(name)
}

const HOME = homedir()
const H = HOME.replace(/\\/g, '/').toLowerCase()
if (!H.includes('tmp') && !H.includes('/t/') && !H.includes('/temp/') && !H.startsWith('/var/folders')) {
  console.log('Chay voi HOME tam: HOME=$(mktemp -d) node tests/test_project_delete.mts  (Windows: $env:USERPROFILE = thu muc tam)')
  process.exit(2)
}
const ENG = join(HOME, '.capcut-studio')
const PROJ = join(ENG, 'projects')
;(globalThis as any).__TRASH_DIR = join(HOME, '.Trash-test')
const OUTSIDE = mkdtempSync(join(tmpdir(), 'desktop-'))
const origVideo = join(OUTSIDE, 'test 1.mp4')
writeFileSync(origVideo, 'goc'.repeat(100))

function mkProject(id: string, wdName: string | null, extra: Record<string, unknown> = {}) {
  let wd: string | undefined
  if (wdName) {
    wd = isAbsolute(wdName) ? wdName : join(PROJ, wdName)
    mkdirSync(join(wd, 'video-nguon'), { recursive: true })
    writeFileSync(join(wd, 'video-nguon', 'a-ban-sdr.mov'), 'x'.repeat(1000))
    writeFileSync(join(wd, 'video-1.mp4'), 'r'.repeat(500))
    writeFileSync(join(wd, 'video-2.mp4'), 'r'.repeat(500))
  }
  const runs = join(ENG, 'runs', id)
  mkdirSync(runs, { recursive: true })
  writeFileSync(join(runs, 'events.jsonl'), '{}\n')
  P.saveProject({
    id, createdAt: 0, updatedAt: 0, status: 'preview', mode: 'remotion', topic: id, workDir: wd,
    videos: [
      { id: 'source_1', path: wd ? join(wd, 'video-nguon', 'a-ban-sdr.mov') : origVideo, name: 'a', duration: 1 },
      { id: 'source_2', path: origVideo, name: 'goc', duration: 1 }
    ],
    ...extra
  } as any)
  return wd
}
const listed = (id: string) => !!P.getProject(id)

console.log('[1] diskInfo')
const wd1 = mkProject('r_one', 'remotion-video-one') as string
// Windows: symlink thu muc can admin / Developer Mode -> dung junction (cung la lien ket ra ngoai)
symlinkSync(OUTSIDE, join(wd1, 'lien-ket-ra-ngoai'), process.platform === 'win32' ? 'junction' : 'dir')
let info = await P.projectDiskInfo('r_one')
check('trashable', info?.trashable, info)
check('dung luong = 1000 + 2x500 (khong tinh symlink ra ngoai)', info?.bytes === 2000, info?.bytes)
check('2 video render', info?.renders === 2, info?.renders)
check('video goc ngoai du an duoc liet ke', info?.outside?.length === 1 && info.outside[0] === origVideo, info?.outside)
check('co nhat ky', info?.hasRunLog === true)
check('du an khong ton tai -> null', (await P.projectDiskInfo('khong-co')) === null)

console.log('[2] xoa khong kem file')
let r = await P.deleteProject('r_one')
check('ok', r.ok && r.trashed.length === 0, r)
check('go khoi danh sach', !listed('r_one'))
check('thu muc con nguyen', existsSync(join(wd1, 'video-1.mp4')))
check('nhat ky con nguyen', existsSync(join(ENG, 'runs', 'r_one')))

console.log('[3] xoa kem file')
const wd2 = mkProject('r_two', 'remotion-video-two') as string
r = await P.deleteProject('r_two', { withFiles: true })
check('ok + 2 muc vao Thung rac', r.ok && r.trashed.length === 2, r)
check('thu muc du an da vao Thung rac', !existsSync(wd2))
check('nhat ky da vao Thung rac', !existsSync(join(ENG, 'runs', 'r_two')))
check('video goc ngoai du an van con', existsSync(origVideo) && readFileSync(origVideo, 'utf-8').startsWith('goc'))
check('go khoi danh sach', !listed('r_two'))
check('chi dung Thung rac, khong xoa thang', mock.trashed.every((p: string) => p.startsWith(HOME)), mock.trashed)

console.log('[4] cac truong hop KHONG duoc xoa file')
const outWd = join(OUTSIDE, 'du-an-ngoai')
mkProject('r_out', outWd)
info = await P.projectDiskInfo('r_out')
check('thu muc ngoai projects -> khong trashable', info?.trashable === false && !!info.reason, info)
const n = mock.trashed.length
r = await P.deleteProject('r_out', { withFiles: true })
check('xoa kem file -> tu choi, giu trong danh sach', !r.ok && listed('r_out') && existsSync(outWd), r)
check('khong goi Thung rac', mock.trashed.length === n)

P.saveProject({ id: 'r_root', createdAt: 0, updatedAt: 0, status: 'x', mode: 'remotion', workDir: PROJ } as any)
r = await P.deleteProject('r_root', { withFiles: true })
check('chinh thu muc projects -> tu choi', !r.ok && existsSync(PROJ), r)

const shared = mkProject('r_a', 'remotion-video-shared') as string
P.saveProject({ id: 'r_b', createdAt: 0, updatedAt: 0, status: 'x', mode: 'remotion', workDir: shared } as any)
info = await P.projectDiskInfo('r_a')
check('dung chung thu muc -> khong trashable', info?.trashable === false && /dùng chung/.test(info.reason || ''), info)
r = await P.deleteProject('r_a', { withFiles: true })
check('dung chung -> tu choi, thu muc con', !r.ok && existsSync(shared) && listed('r_a'), r)

P.saveProject({ id: 'r_nowd', createdAt: 0, updatedAt: 0, status: 'x', mode: 'remotion' } as any)
info = await P.projectDiskInfo('r_nowd')
check('khong co thu muc -> khong trashable', info?.trashable === false, info)

console.log('[5] Thung rac hong')
const wd5 = mkProject('r_fail', 'remotion-video-fail') as string
;(globalThis as any).__TRASH_FAIL = true
r = await P.deleteProject('r_fail', { withFiles: true })
;(globalThis as any).__TRASH_FAIL = false
check('bao loi', !r.ok && /Thùng rác/.test(r.error || ''), r)
check('van trong danh sach + thu muc con', listed('r_fail') && existsSync(wd5))

console.log(FAILS.length ? `\n${FAILS.length} FAIL: ${FAILS.join(', ')}` : '\nTAT CA PASS')
process.exit(FAILS.length ? 1 : 0)
