// NHUNG ffmpeg + ffprobe vao app: chep NGUYEN file zip da ghim (sidecar/assets/toolchain.json -> ffmpeg)
// vao resources/ffmpeg/ -> electron-builder ship qua extraResources. Doctor (toolchain.installFfmpeg) giai
// nen tu ban nay (kiem SHA tung file) thay vi tai GitHub -> may moi khong phu thuoc mang.
// Giu dang ZIP (khong giai nen san) vi buoc ad-hoc ky sau app (scripts/adhoc-sign.cjs) co the ky lai
// binary Mach-O -> doi byte -> lech SHA ghim; zip thi codesign khong dung toi.
import { createHash } from 'node:crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const M = JSON.parse(readFileSync(join(root, 'sidecar', 'assets', 'toolchain.json'), 'utf-8'))
// ban theo nen tang (toolchain.json -> platforms.<khoa>.ffmpeg ghi de; macOS arm64 = truong goc)
const pkey = (process.platform === 'win32' ? 'win' : process.platform) + '-' + (process.arch === 'arm64' ? 'arm64' : 'x64')
const ff = { ...M.ffmpeg, ...(M.platforms?.[pkey]?.ffmpeg || {}) }
const log = (...a) => console.log('[bundle-ffmpeg]', ...a)
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

const cacheDir = join(root, 'node_modules', '.cache', 'ffmpeg')
const cached = join(cacheDir, basename(new URL(ff.url).pathname))
const outDir = join(root, 'resources', 'ffmpeg')
const out = join(outDir, basename(cached))

async function main() {
  mkdirSync(cacheDir, { recursive: true })
  if (!(existsSync(cached) && sha256(cached) === ff.zip_sha256)) {
    log(`Tai ${ff.url}`)
    const res = await fetch(ff.url, { redirect: 'follow' })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    await pipeline(Readable.fromWeb(res.body), createWriteStream(cached))
  }
  const got = sha256(cached)
  if (got !== ff.zip_sha256) {
    rmSync(cached, { force: true })
    throw new Error(`SHA-256 zip khong khop: ${got.slice(0, 12)}… can ${ff.zip_sha256.slice(0, 12)}…`)
  }
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  copyFileSync(cached, out)
  log(`Da nhung ${basename(out)} (ffmpeg ${ff.version}, SHA khop) -> ${outDir}`)
}

main().catch((e) => {
  console.error('[bundle-ffmpeg] LOI:', e.message || e)
  process.exit(1)
})
