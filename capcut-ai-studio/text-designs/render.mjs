// Render thu mau chu (khong can app): node text-designs/render.mjs <thu muc mau> <out.png|mp4> [--frames 0,30,60 | --video]
//   [--bg #27254a] [--texts '{"s1":"..."}'] [--rebundle]. Chay voi cwd = ~/.capcut-studio/remotion (Chrome Headless cua app).
// Bundle Remotion (remotion-src) cache o text-designs/.bundle, tu bundle lai khi remotion-src doi.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'

const PROJ = join(dirname(new URL(import.meta.url).pathname), '..')
const require = createRequire(join(PROJ, 'package.json'))
const { bundle } = require('@remotion/bundler')
const { renderStill, renderMedia, selectComposition } = require('@remotion/renderer')

const args = process.argv.slice(2)
const opt = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : d
}
const dir = args[0]
const out = args[1]
const spec = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'))
const BUNDLE = join(dirname(new URL(import.meta.url).pathname), '.bundle')

function newest(p) {
  let t = 0
  for (const f of readdirSync(p, { withFileTypes: true })) {
    const q = join(p, f.name)
    t = Math.max(t, f.isDirectory() ? newest(q) : statSync(q).mtimeMs)
  }
  return t
}
if (args.includes('--rebundle') || !existsSync(join(BUNDLE, 'index.html')) || statSync(join(BUNDLE, 'index.html')).mtimeMs < newest(join(PROJ, 'remotion-src'))) {
  await bundle({ entryPoint: join(PROJ, 'remotion-src', 'index.ts'), outDir: BUNDLE, publicDir: join(PROJ, 'remotion-src', 'public'), enableCaching: true })
  console.log('bundled')
}

const MIME = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.json': 'application/json' }
const srv = createServer((req, res) => {
  const p = join(dir, decodeURIComponent(req.url.split('?')[0]))
  if (!p.startsWith(dir) || !existsSync(p)) {
    res.writeHead(404)
    return res.end()
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' })
  res.end(readFileSync(p))
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const assetBase = `http://127.0.0.1:${srv.address().port}`
const texts = opt('--texts') ? JSON.parse(opt('--texts')) : undefined
const inputProps = { spec, assetBase, background: opt('--bg', '#000000'), texts, fit: !!texts }
const composition = await selectComposition({ serveUrl: BUNDLE, id: 'TextTemplate', inputProps })
mkdirSync(dirname(out), { recursive: true })
if (args.includes('--video')) {
  await renderMedia({ composition, serveUrl: BUNDLE, codec: 'h264', outputLocation: out, inputProps, concurrency: 4, crf: 16 })
  console.log('video', out)
} else {
  const frames = (opt('--frames', '0') || '0').split(',').map(Number)
  for (const f of frames) {
    const o = frames.length > 1 ? out.replace(/(\.\w+)$/, `_${String(f).padStart(3, '0')}$1`) : out
    await renderStill({ composition, serveUrl: BUNDLE, output: o, frame: f, inputProps })
    console.log('still', o)
  }
}
srv.close()
