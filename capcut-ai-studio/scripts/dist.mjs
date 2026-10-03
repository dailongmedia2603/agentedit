#!/usr/bin/env node
// DONG GOI BAN CAI (npm run dist / dist:dir / dist:win / dist:win:dir) — dat MA BUILD de nhan dien ban:
//   STUDIO_BUILD_ID = ngay-gio luc build (vd 20261003-2250; ban noi bo STUDIO_FULL_UI=1 them "-full")
//   -> hien trong app canh so phien ban ("v1.1.0 · build 20261003-2250", electron.vite.config define __APP_BUILD__)
//   -> nam trong TEN FILE (electron-builder.yml artifactName ${env.STUDIO_BUILD_ID}):
//      Agent Edit-1.1.0-b20261003-2250-arm64.dmg / Agent Edit-Setup-1.1.0-b20261003-2250-x64.exe
// So phien ban (1.1.0) van o package.json "version" — tang tay khi co dot tinh nang moi.
//   node scripts/dist.mjs --mac|--win [--dir]      (dat san STUDIO_BUILD_ID thi dung lai ma do)
import { spawnSync } from 'child_process'

const args = process.argv.slice(2)
const win = args.includes('--win')
const dir = args.includes('--dir')
const p = (n) => String(n).padStart(2, '0')
const d = new Date()
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
const id = process.env.STUDIO_BUILD_ID || stamp + (process.env.STUDIO_FULL_UI === '1' ? '-full' : '')
process.env.STUDIO_BUILD_ID = id

const steps = [
  'npx --no-install electron-vite build',
  'node scripts/bundle-remotion.mjs',
  'node scripts/bundle-ffmpeg.mjs',
  ...(win ? ['node scripts/bundle-models.mjs'] : []),
  'node scripts/bundle-python.mjs',
  'node scripts/compile-sidecar.mjs',
  'node scripts/protect-electron.mjs',
  `npx --no-install electron-builder ${win ? '--win --x64' : '--mac --arm64'}${dir ? ' --dir' : ''}`
]
console.log(`[dist] ma build ${id} (${win ? 'Windows x64' : 'macOS arm64'}${dir ? ', chi thu muc' : ''})`)
for (const s of steps) {
  console.log(`[dist] > ${s}`)
  const r = spawnSync(s, { stdio: 'inherit', shell: true, env: process.env })
  if (r.status !== 0) {
    console.error(`[dist] LOI o buoc: ${s}`)
    process.exit(r.status ?? 1)
  }
}
console.log(`[dist] xong — ma build ${id}`)
