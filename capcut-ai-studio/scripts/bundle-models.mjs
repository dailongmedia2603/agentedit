// NHUNG model thi giac may ONNX (may KHONG co Apple Vision — Windows) vao app: moi model `bundle: true` trong
// sidecar/assets/toolchain.json -> vision_models (tai 1 lan, kiem SHA-256, cache node_modules/.cache/models) ->
// resources/models -> electron-builder ship (win.extraResources -> <resources>/models). Sidecar doc qua
// STUDIO_MODELS_DIR (vision_onnx.model_dirs). Model lon (bundle: false, vd BiRefNet 224 MB) Doctor tai luc can.
// macOS dung Apple Vision -> bo qua (khong nhung gi).
import { createHash } from 'node:crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const models = JSON.parse(readFileSync(join(root, 'sidecar', 'assets', 'toolchain.json'), 'utf-8')).vision_models || {}
const log = (...a) => console.log('[bundle-models]', ...a)
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const cacheDir = join(root, 'node_modules', '.cache', 'models')
const outDir = join(root, 'resources', 'models')

async function main() {
  rmSync(outDir, { recursive: true, force: true })
  if (process.platform === 'darwin' && !process.env.BUNDLE_MODELS_FORCE) {
    log('macOS dung Apple Vision — khong nhung model.')
    return
  }
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(outDir, { recursive: true })
  let n = 0
  for (const [name, m] of Object.entries(models)) {
    if (!m.bundle) continue
    const cached = join(cacheDir, name)
    if (!(existsSync(cached) && sha256(cached) === m.sha256)) {
      log(`Tai ${name} (${(m.size / 1e6).toFixed(1)} MB) ${m.url}`)
      const res = await fetch(m.url, { redirect: 'follow' })
      if (!res.ok || !res.body) throw new Error(`${name}: HTTP ${res.status}`)
      await pipeline(Readable.fromWeb(res.body), createWriteStream(cached))
    }
    const got = sha256(cached)
    if (got !== m.sha256) {
      rmSync(cached, { force: true })
      throw new Error(`${name}: SHA-256 khong khop (${got.slice(0, 12)}… can ${m.sha256.slice(0, 12)}…)`)
    }
    copyFileSync(cached, join(outDir, name))
    n++
    log(`Da nhung ${name} (${m.use}, ${m.license})`)
  }
  log(`Xong: ${n} model -> ${outDir}`)
}

main().catch((e) => {
  console.error('[bundle-models] LOI:', e.message || e)
  process.exit(1)
})
