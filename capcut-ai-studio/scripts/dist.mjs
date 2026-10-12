#!/usr/bin/env node
// DONG GOI BAN CAI (npm run dist / dist:dir / dist:win / dist:win:dir) — dat MA BUILD de nhan dien ban:
//   STUDIO_BUILD_ID = ngay-gio luc build (vd 20261003-2250; ban noi bo STUDIO_FULL_UI=1 them "-full")
//   -> hien trong app canh so phien ban ("v1.1.0 · build 20261003-2250", electron.vite.config define __APP_BUILD__)
//   -> nam trong TEN FILE (electron-builder.yml artifactName ${env.STUDIO_BUILD_ID}):
//      Agent Edit-1.1.0-b20261003-2250-arm64.dmg / Agent Edit-Setup-1.1.0-b20261003-2250-x64.exe
// So phien ban (1.1.0) van o package.json "version" — tang tay khi co dot tinh nang moi.
//   node scripts/dist.mjs --mac|--win [--dir]      (dat san STUDIO_BUILD_ID thi dung lai ma do)
// macOS theo KIEN TRUC cua Node dang chay (2026-10-12): Apple Silicon -> arm64; Mac Intel (CI macos-15-intel) hoac
// Node x64 qua Rosetta (`arch -x86_64 node scripts/dist.mjs --mac`) -> x64. Khong build cheo: Python nhung + .so Cython
// + bytecode V8 (.jsc) phai tao bang dung kien truc may se chay.
import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

const args = process.argv.slice(2)
const win = args.includes('--win')
const dir = args.includes('--dir')
const macArch = process.arch === 'x64' ? 'x64' : 'arm64'
if (!win && (args.includes('--x64') || args.includes('--arm64')) && !args.includes(`--${macArch}`)) {
  console.error(`[dist] Node dang chay la ${process.arch} — khong build cheo kien truc. Mac Intel: chay tren may Intel hoac ` +
    '`arch -x86_64 <node x64> scripts/dist.mjs --mac` (node_modules cai bang Node x64).')
  process.exit(1)
}
const arch = win ? 'x64' : macArch
const p = (n) => String(n).padStart(2, '0')
const d = new Date()
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
let id = process.env.STUDIO_BUILD_ID || stamp
// ban day du LUON co "-full" (ke ca khi dat san STUDIO_BUILD_ID): app ban day du khong tu cap nhat va
// scripts/publish-update.mjs tu choi phat hanh ban -full cho khach
if (process.env.STUDIO_FULL_UI === '1' && !id.endsWith('-full')) id += '-full'
process.env.STUDIO_BUILD_ID = id

const steps = [
  'npx --no-install electron-vite build',
  'node scripts/bundle-remotion.mjs',
  'node scripts/bundle-ffmpeg.mjs',
  ...(win ? ['node scripts/bundle-models.mjs'] : []),
  'node scripts/bundle-python.mjs',
  'node scripts/compile-sidecar.mjs',
  'node scripts/protect-electron.mjs',
  `npx --no-install electron-builder ${win ? '--win --x64' : `--mac --${macArch}`}${dir ? ' --dir' : ''}`
]
console.log(`[dist] ma build ${id} (${win ? 'Windows x64' : `macOS ${macArch}`}${dir ? ', chi thu muc' : ''})`)
for (const s of steps) {
  console.log(`[dist] > ${s}`)
  const r = spawnSync(s, { stdio: 'inherit', shell: true, env: process.env })
  if (r.status !== 0) {
    console.error(`[dist] LOI o buoc: ${s}`)
    process.exit(r.status ?? 1)
  }
}
// Ghi lai lan dong goi nay -> scripts/publish-update.mjs biet CHAC file nao (khong doan theo ten / gio sua file)
const version = JSON.parse(readFileSync('package.json', 'utf-8')).version
writeFileSync(
  `release/build-info-${win ? 'win' : 'mac'}.json`,
  JSON.stringify({ version, build: id, platform: win ? 'win32' : 'darwin', arch, dir, fullUi: process.env.STUDIO_FULL_UI === '1', at: new Date().toISOString() }, null, 2)
)
console.log(`[dist] xong — ma build ${id}`)
