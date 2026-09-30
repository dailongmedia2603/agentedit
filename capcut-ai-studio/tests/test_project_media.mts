// Test chep video vao thu muc du an (electron/services/project-media.ts) + chuyen du an cu
// (src/lib/projectMedia.ts). Chay:  node tests/test_project_media.ts   (Node >= 23, tu bo kieu TypeScript)
//
// Su co that 2026-09-26: IMG_3839.MOV + tiktok_video.mp4 bi chuyen khoi Downloads -> du an mat video.
// Can dam bao:
//  1. Them video -> chep vao <workDir>/video-nguon | video-mau, giu noi dung + ngay; xoa file goc du an van con.
//  2. Them lai cung file -> khong chep them; khac noi dung cung ten -> ten-2; file da trong du an -> giu nguyen.
//  3. File khong ton tai -> bao loi, file khac van chep; khong de lai file tam.
//  4. Du an cu: video ngoai du an -> chep vao + doi duong dan o MOI noi (brief, plan, spec, phan tich mau).
//  5. Video nguon da mat + spec con ban lam viec SDR DUNG do dai -> khoi phuc tu do; sai do dai -> bao chon lai.
//  6. Chay lai tren du an da chuyen -> khong doi gi; replacePaths khong sua doi tuong truyen vao.
import { mkdtempSync, writeFileSync, readFileSync, statSync, existsSync, mkdirSync, rmSync, utimesSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { importMedia, missingFiles } from '../electron/services/project-media.ts'
import { adoptProjectMedia, replacePaths, specMediaPaths } from '../src/lib/projectMedia.ts'

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)))
  if (!cond) FAILS.push(name)
}

const T = mkdtempSync(join(tmpdir(), 'pm-test-'))
const DL = join(T, 'Downloads')
mkdirSync(DL)
const mk = (p: string, content: string) => {
  writeFileSync(p, content)
  return p
}

async function main() {
  console.log('[1] chep video vao du an')
  const wd = join(T, 'projects', 'remotion-video-abc')
  mkdirSync(wd, { recursive: true })
  const a = mk(join(DL, 'IMG_1.MOV'), 'video-a'.repeat(1000))
  const old = new Date('2026-01-02T03:04:05Z')
  utimesSync(a, old, old)
  let r = await importMedia(wd, [a], 'source')
  const pa = r[0].path as string
  check('chep vao video-nguon, giu ten', pa === join(wd, 'video-nguon', 'IMG_1.MOV'), r)
  check('noi dung giong het', readFileSync(pa, 'utf8') === readFileSync(a, 'utf8'))
  check('giu ngay sua cua file goc', Math.abs(statSync(pa).mtimeMs - old.getTime()) < 1000, statSync(pa).mtime)
  check('bao da chep (cung o -> clone)', r[0].copied === true && r[0].cloned === true, r[0])
  rmSync(a)
  check('xoa file goc -> ban trong du an van con', existsSync(pa) && readFileSync(pa, 'utf8').startsWith('video-a'))

  console.log('[2] trung lap')
  const a2 = mk(join(DL, 'IMG_1b.MOV'), readFileSync(pa, 'utf8'))
  r = await importMedia(wd, [a2], 'source', ['IMG_1.MOV'])
  check('cung noi dung -> dung lai, khong chep them', r[0].path === pa && r[0].copied === false, r[0])
  const b = mk(join(T, 'IMG_1.MOV'), 'khac-noi-dung'.repeat(900))
  r = await importMedia(wd, [b], 'source')
  check('khac noi dung cung ten -> IMG_1-2.MOV', r[0].path === join(wd, 'video-nguon', 'IMG_1-2.MOV'), r[0])
  r = await importMedia(wd, [pa], 'source')
  check('file da nam trong du an -> giu nguyen', r[0].path === pa && r[0].copied === false, r[0])

  console.log('[3] loi tung file')
  const c = mk(join(DL, 'mau.mp4'), 'mau'.repeat(500))
  r = await importMedia(wd, [join(DL, 'khong-co.mp4'), c], 'reference')
  check('file khong ton tai -> bao loi', !r[0].path && !!r[0].error, r[0])
  check('file sau van chep, vao video-mau', r[1].path === join(wd, 'video-mau', 'mau.mp4'), r[1])
  const leftovers = [...readdirSync(join(wd, 'video-nguon')), ...readdirSync(join(wd, 'video-mau'))].filter((n) =>
    n.includes('.dang-chep')
  )
  check('khong de lai file tam', leftovers.length === 0, leftovers)
  check('missingFiles', JSON.stringify(missingFiles([pa, join(DL, 'khong-co.mp4')])) === JSON.stringify([join(DL, 'khong-co.mp4')]))

  console.log('[4] du an cu: chep vao + doi duong dan o moi noi')
  const s1 = mk(join(DL, 'nguon1.mp4'), 'nguon-1'.repeat(800))
  const s2 = join(DL, 'IMG_3839.MOV') // da mat
  const ref = mk(join(DL, 'tiktok_video.mp4'), 'mau-tiktok'.repeat(700))
  const cacheDir = join(T, 'home', '.capcut-studio', 'cache', 'media-sdr')
  mkdirSync(cacheDir, { recursive: true })
  const sdr = mk(join(cacheDir, 'd889ffc875122eef2801.mov'), 'ban-sdr'.repeat(600))
  const sdrOther = mk(join(cacheDir, 'other.mov'), 'ban-sdr-khac'.repeat(600))
  const durations: Record<string, number> = { [sdr]: 126.9, [sdrOther]: 30 }
  const proj = {
    id: 'r_test',
    createdAt: 1,
    updatedAt: 1,
    status: 'preview',
    mode: 'remotion',
    workDir: '',
    videos: [
      { id: 'source_1', path: s1, name: 'nguon1.mp4', duration: 10 },
      { id: 'source_2', path: s2, name: 'IMG_3839.MOV', duration: 126.94 }
    ],
    video: { id: 'source_1', path: s1, name: 'nguon1.mp4', duration: 10 },
    referenceVideo: { path: ref, name: 'tiktok_video.mp4', duration: 215 },
    referenceAnalysis: { summary: 'mau', reference_video: { path: ref, name: 'tiktok_video.mp4' } },
    sourceBrief: { source_video: s1, source_videos: [{ id: 'source_1', path: s1 }, { id: 'source_2', path: s2 }] },
    rmPlan: { source_video: s1, source_videos: [{ id: 'source_1', path: s1 }, { id: 'source_2', path: s2 }] },
    rmSpec: {
      clips: [
        { kind: 'body', path: s1 },
        { kind: 'body', path: sdr },
        { kind: 'body', path: sdrOther },
        { kind: 'insert', path: join(T, 'meme.mp4') }
      ]
    }
  } as unknown as Project
  const before = JSON.stringify(proj)
  const newWd = join(T, 'projects', 'remotion-moi')
  const deps = {
    newWorkDir: async () => {
      mkdirSync(newWd, { recursive: true })
      return newWd
    },
    mediaImport: async (w: string, paths: string[], kind: 'source' | 'reference', names?: (string | undefined)[]) => {
      const items = await importMedia(w, paths, kind, names)
      return { ok: items.every((it) => !!it.path), items }
    },
    mediaMissing: async (paths: string[]) => missingFiles(paths),
    duration: async (p: string) => durations[p] || 0
  }
  const res = await adoptProjectMedia(proj, deps)
  const P = res.project as unknown as Record<string, any>
  const n1 = join(newWd, 'video-nguon', 'nguon1.mp4')
  const nRef = join(newWd, 'video-mau', 'tiktok_video.mp4')
  const nRec = join(newWd, 'video-nguon', 'IMG_3839-ban-sdr.mov')
  check('tao thu muc du an khi chua co', P.workDir === newWd, P.workDir)
  check('nguon con file -> chep vao du an', P.videos[0].path === n1 && existsSync(n1), P.videos[0])
  check('ghi lai noi chep tu (origPath)', P.videos[0].origPath === s1, P.videos[0])
  check('video mau -> chep vao video-mau', P.referenceVideo.path === nRef && existsSync(nRef), P.referenceVideo)
  check('doi duong dan trong brief + plan', P.sourceBrief.source_video === n1 && P.rmPlan.source_videos[0].path === n1, P.rmPlan)
  check('doi duong dan trong phan tich mau', P.referenceAnalysis.reference_video.path === nRef, P.referenceAnalysis)
  check('doi duong dan clip spec', P.rmSpec.clips[0].path === n1, P.rmSpec.clips[0])
  check('nguon mat -> khoi phuc tu ban SDR dung do dai', P.videos[1].path === nRec && existsSync(nRec), P.videos[1])
  check('khoi phuc dung noi dung ban SDR', existsSync(nRec) && readFileSync(nRec, 'utf8') === readFileSync(sdr, 'utf8'))
  check('danh dau recovered + origPath cu', P.videos[1].recovered === true && P.videos[1].origPath === s2, P.videos[1])
  check('plan tro toi ban khoi phuc', P.rmPlan.source_videos[1].path === nRec, P.rmPlan.source_videos)
  check(
    'bao nguon da mat (da khoi phuc)',
    res.missing.length === 1 && res.missing[0].recovered === true && res.missing[0].path === nRec,
    res.missing
  )
  check('spec phai dung lai', res.specStale === true)
  check('dem so video vua chep (2)', res.copied === 2, res.copied)
  check('du an truyen vao khong bi sua', JSON.stringify(proj) === before)
  check('video dau (video) cap nhat', P.video.path === n1, P.video)

  console.log('[5] chay lai tren du an da chuyen -> khong doi')
  const res2 = await adoptProjectMedia(res.project, deps)
  check('khong doi, khong chep', res2.changed === false && res2.copied === 0, res2)
  check(
    'video da khoi phuc van duoc nhac (chon file goc)',
    res2.missing.length === 1 && res2.missing[0].recovered === true && res2.missing[0].path === nRec,
    res2.missing
  )

  console.log('[6] khong chac dung video -> khong khoi phuc')
  const proj3 = JSON.parse(before)
  proj3.videos[1].duration = 60 // khong ban SDR nao dai 60s
  const res3 = await adoptProjectMedia(proj3, deps)
  const P3 = res3.project as unknown as Record<string, any>
  check('sai do dai -> giu duong dan cu, bao chon lai', P3.videos[1].path === s2 && res3.missing[0]?.recovered !== true, res3.missing)

  console.log('[7] tien ich')
  const x = { a: '/x/1.mp4', b: ['/x/1.mp4', { c: '/x/1.mp4b' }] }
  const y = replacePaths(x, { '/x/1.mp4': '/y/1.mp4' })
  check('replacePaths chi thay chuoi trung khop hoan toan', JSON.stringify(y) === JSON.stringify({ a: '/y/1.mp4', b: ['/y/1.mp4', { c: '/x/1.mp4b' }] }), y)
  check('replacePaths khong sua dau vao', x.a === '/x/1.mp4')
  check('specMediaPaths', specMediaPaths({ clips: [{ path: '/a', subject: { path: '/b' } }], audio: [{ path: '/c' }] }).length === 3)

  rmSync(T, { recursive: true, force: true })
  console.log('\n' + (FAILS.length ? `CO ${FAILS.length} TEST FAIL` : 'TAT CA PASS'))
  process.exit(FAILS.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
