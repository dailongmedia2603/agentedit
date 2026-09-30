// Dong goi composition Remotion (remotion-src/index.ts) thanh trang web tinh o
// out/remotion-bundle. App dung thu muc nay lam `serveUrl` khi render MP4, nen
// luc chay KHONG can webpack. Chay tu dong trong `npm run build` / `npm run dist`.
import { bundle } from '@remotion/bundler'
import { rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'out', 'remotion-bundle')
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })

const started = Date.now()
let last = -10
await bundle({
  entryPoint: join(root, 'remotion-src', 'index.ts'),
  outDir,
  // Khong co thu muc public: moi media di qua may chu media cuc bo cua app.
  publicDir: join(root, 'remotion-src', 'public'),
  enableCaching: false,
  onProgress: (p) => {
    if (p - last >= 25 || p === 100) {
      last = p
      console.log(`[remotion-bundle] ${p}%`)
    }
  }
})
console.log(`[remotion-bundle] xong -> ${outDir} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
