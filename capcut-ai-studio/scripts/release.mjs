#!/usr/bin/env node
// PHAT HANH 1 LENH (may chu app) — GitHub Actions (.github/workflows/release.yml) build Mac + Windows, tu kiem roi day ban
// cap nhat len R2 -> app da cai cua khach tu tai. PROJECT_OVERVIEW muc 15.
//
//   npm run release -- 1.3.0 --notes "Sửa lỗi xuất video; thêm hiệu ứng mới"   -> kenh STABLE (moi khach)
//   npm run release -- 1.3.0 --notes-file ghi-chu.txt
//   npm run release -- --test --notes "thu tinh nang X"                         -> kenh TEST (chi may co file update-channel)
//   them --dry-run de xem se lam gi (khong sua / khong day gi)
//
// STABLE: tang "version" (package.json + package-lock.json) -> commit "chore: release vX" -> tag co ghi chu vX -> day nhanh
// + tag len GitHub (remote agentedit) -> Actions tu chay. TEST: day nhanh hien tai roi goi `gh workflow run` (phien ban giu
// nguyen, ma build moi hon -> may kenh test van nhan). Thay doi chua commit -> dung lai (khong phat hanh code chua luu).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const DRY = argv.includes('--dry-run')
const TEST = argv.includes('--test')
const die = (m) => {
  console.error('[release] ' + m)
  process.exit(1)
}
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf-8' }).trim()
const run = (cmd, args) => {
  console.log(`[release] > ${cmd} ${args.join(' ')}`)
  if (!DRY) execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })
}

const remotes = git('remote').split('\n')
const remote = opt('--remote') || (remotes.includes('agentedit') ? 'agentedit' : 'origin')
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
// chi xet file DA theo doi (file moi chua add nhu video thu khong chan)
const dirty = git('status', '--porcelain', '--untracked-files=no')
if (dirty) die(`con thay doi chua commit:\n${dirty}\n-> commit (hoac bo) truoc khi phat hanh.`)

let notes = opt('--notes') || ''
if (opt('--notes-file')) notes = readFileSync(opt('--notes-file'), 'utf-8')
notes = notes.trim()

const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

if (TEST) {
  run('git', ['push', remote, branch])
  run('gh', ['workflow', 'run', 'release.yml', '--ref', branch, '-f', 'channel=test', '-f', `notes=${notes || `Bản thử ${pkg.version}`}`])
  console.log(`[release] da goi build kenh TEST tu nhanh ${branch} (v${pkg.version}). Xem: gh run list --workflow release.yml`)
  process.exit(0)
}

const version = argv.find((a) => /^\d+\.\d+\.\d+$/.test(a))
if (!version) die('thieu so phien ban moi (vd: npm run release -- 1.3.0 --notes "...")')
const num = (v) => v.split('.').map(Number)
const [a, b] = [num(version), num(pkg.version)]
const newer = a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]
if (!newer) die(`${version} phai LON hon phien ban hien tai ${pkg.version}`)
if (branch !== 'main') die(`dang o nhanh "${branch}" — ban STABLE phat hanh tu main`)
if (!notes) die('them ghi chu phien ban: --notes "..." (khach thay trong hop thoai cap nhat)')
if (git('tag', '-l', `v${version}`)) die(`tag v${version} da co`)

console.log(`[release] ${pkg.version} -> ${version} (remote ${remote})\n--- ghi chu ---\n${notes}\n---------------`)
if (!DRY) {
  writeFileSync(pkgPath, readFileSync(pkgPath, 'utf-8').replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`))
  const lockPath = join(root, 'package-lock.json')
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8'))
    lock.version = version
    if (lock.packages && lock.packages['']) lock.packages[''].version = version
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
  }
}
run('git', ['add', 'package.json', 'package-lock.json'])
run('git', ['commit', '-m', `chore: release v${version}`])
const notesFile = join(root, 'release', `.tag-notes-${version}.txt`)
if (!DRY) {
  mkdirSync(join(root, 'release'), { recursive: true })
  writeFileSync(notesFile, notes + '\n')
}
run('git', ['tag', '-a', `v${version}`, '-F', notesFile])
run('git', ['push', remote, branch])
run('git', ['push', remote, `v${version}`])
console.log(`[release] XONG — GitHub Actions dang build v${version} cho Mac + Windows (~30-60 phut). Theo doi: gh run list --workflow release.yml`)
