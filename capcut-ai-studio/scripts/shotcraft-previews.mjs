// VIDEO XEM TRUOC cho KHO SHOT (tab "Kho shot" o Tai nguyen + Gemini xem de viet mo ta): render MOI mau (khung doc
// 9:16, chu mau `sample` + anh mau trong .preview-public) -> sidecar/references/shot_previews/<id>.mp4 (540x960, khong
// tieng, ~100-300KB / mau). Thu muc references di kem ban cai (compile-sidecar) -> may khach xem duoc ngay.
//
//   node scripts/shotcraft-previews.mjs                 (chi render mau CHUA co / meta doi so voi lan render truoc)
//   node scripts/shotcraft-previews.mjs --all           (render lai het)
//   node scripts/shotcraft-previews.mjs --only id1,id2  (chi cac mau nay)
//   node scripts/shotcraft-previews.mjs --jobs 2        (so mau render song song, mac dinh 2)
//
// Chay sau `node scripts/shotcraft-sync.mjs` (doc registry.ts). Moi lan render ghi van tay meta + file .tsx vao
// shot_previews/index.json -> lan sau chi render lai mau da sua.
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, statSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = join(root, 'remotion-src', 'shotcraft')
const outDir = join(root, 'sidecar', 'references', 'shot_previews')
const args = process.argv.slice(2)
const opt = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : d
}
const all = args.includes('--all')
const only = opt('--only') ? new Set(opt('--only').split(',')) : null
const jobs = Math.max(1, Number(opt('--jobs', 2)))

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const metas = walk(join(base, 'shots'))
  .filter((p) => p.endsWith('.meta.json'))
  .map((p) => ({ path: p, meta: JSON.parse(readFileSync(p, 'utf8')) }))
const fp = ({ path, meta }) => {
  const { vi, ...rest } = meta // doi mo ta (Gemini viet lai) KHONG can render lai
  return createHash('sha1')
    .update(JSON.stringify(rest))
    .update(readFileSync(path.replace(/\.meta\.json$/, '.tsx')))
    .digest('hex')
    .slice(0, 16)
}

mkdirSync(outDir, { recursive: true })
const indexFile = join(outDir, 'index.json')
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {}
const todo = metas.filter((m) => {
  if (only) return only.has(m.meta.id)
  return all || index[m.meta.id] !== fp(m) || !existsSync(join(outDir, m.meta.id + '.mp4'))
})
if (!todo.length) {
  console.log('[shot-previews] khong co mau nao can render')
  process.exit(0)
}

// entry chung cho ca kho: 1 composition "shot", do dai theo meta cua mau (calculateMetadata)
const pdir = join(base, '.preview', 'all')
mkdirSync(pdir, { recursive: true })
writeFileSync(
  join(pdir, 'index.tsx'),
  `import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { SHOTS } from '../../registry'
import { ShotStage } from '../../ShotStage'
import '../../../fonts'
const P: React.FC<any> = (p) => {
  const entry = SHOTS[p.id]
  if (!entry) return null
  const m = entry.meta
  const bg = m.backdrop ? (m.dark ? 'samples/bg_dark.png' : 'samples/bg_tech.png') : null
  return <ShotStage {...p} entry={entry} backdrop={bg} />
}
const Root = () => (
  <Composition id="shot" component={P} width={1080} height={1920} fps={30} durationInFrames={30}
    defaultProps={{ id: '', width: 1080, height: 1920 }}
    calculateMetadata={({ props }: any) => ({ durationInFrames: SHOTS[props.id]?.meta.duration || 30 })} />
)
registerRoot(Root)
`
)
const chrome = join(os.homedir(), '.capcut-studio/remotion/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell')
const browserExecutable = existsSync(chrome) ? chrome : undefined
const t0 = Date.now()
const serveUrl = await bundle({
  entryPoint: join(pdir, 'index.tsx'),
  outDir: join(pdir, 'bundle'),
  publicDir: join(base, '.preview-public'),
  enableCaching: true
})
console.log(`[shot-previews] bundle ${((Date.now() - t0) / 1000).toFixed(1)}s — render ${todo.length} mau`)

const tmp = join(os.tmpdir(), 'shot-previews-' + process.pid)
mkdirSync(tmp, { recursive: true })
let done = 0
const failed = []
const renderOne = async (m) => {
  const meta = m.meta
  const texts = Object.fromEntries((meta.slots || []).map((s) => [s.id, s.list ? s.sample.split('|') : s.sample]))
  const inputProps = { id: meta.id, texts, images: {}, theme: null, brand: { name: 'Agent Edit' }, rate: 1, preview: true, width: 1080, height: 1920 }
  const raw = join(tmp, meta.id + '.raw.mp4')
  const fin = join(outDir, meta.id + '.mp4')
  try {
    const composition = await selectComposition({ serveUrl, id: 'shot', inputProps, browserExecutable })
    await renderMedia({ serveUrl, composition, codec: 'h264', outputLocation: raw, inputProps, browserExecutable, overwrite: true, muted: true, concurrency: 4, crf: 18 })
    // nen nho de di kem ban cai: 540x960, khong tieng
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-vf', 'scale=540:960:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow',
      '-crf', '30', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', fin + '.part.mp4'])
    renameSync(fin + '.part.mp4', fin)
    index[meta.id] = fp(m)
    writeFileSync(indexFile, JSON.stringify(index, Object.keys(index).sort(), 1) + '\n')
  } catch (e) {
    failed.push(`${meta.id}: ${String(e?.message || e).split('\n')[0]}`)
  } finally {
    rmSync(raw, { force: true })
    done++
    if (done % 10 === 0 || done === todo.length) console.log(`[shot-previews] ${done}/${todo.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  }
}
const queue = [...todo]
await Promise.all(Array.from({ length: jobs }, async () => {
  while (queue.length) await renderOne(queue.shift())
}))
rmSync(tmp, { recursive: true, force: true })
rmSync(pdir, { recursive: true, force: true })
const size = readdirSync(outDir).filter((f) => f.endsWith('.mp4')).reduce((a, f) => a + statSync(join(outDir, f)).size, 0)
console.log(`[shot-previews] xong ${todo.length - failed.length}/${todo.length} — tong ${(size / 1e6).toFixed(1)}MB o ${outDir}`)
if (failed.length) {
  console.error('LOI:\n' + failed.join('\n'))
  process.exit(1)
}
