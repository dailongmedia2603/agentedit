// XEM THU 1 MAU SHOT (kho video-shotcraft): bundle RIENG mau do (khong qua registry -> mau khac dang sua do khong anh huong)
// roi chup cac khung, ghep thanh 1 tam "sheet.png" (hang tren: khung doc 9:16, hang duoi: khung ngang 16:9).
//
//   node scripts/shot-still.mjs <duong-dan-file.tsx> [--frames 10,60,119] [--props props.json] [--orient both|portrait|landscape]
//                               [--out <thu-muc>] [--video]
//
// - Do dai / bo cuc doc lay tu <Component>.meta.json canh file (chua co meta -> doc hang so <TEN>_DURATION trong file).
// - props.json: {"texts": {...}, "images": {...}, "theme": {"accent": "#.."}, "brand": {"name": ".."}, "rate": 1}
//   Khong co props: dung chu mau (sample) trong meta. Anh mau: remotion-src/shotcraft/.preview-public (staticFile).
// - props.preview = false: gia lap trong app (o anh thieu KHONG dung anh mau).
// - --video: render them video MP4 khung doc (out/portrait.mp4) de xem chuyen dong.
import { bundle } from '@remotion/bundler'
import { renderStill, renderMedia, selectComposition } from '@remotion/renderer'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = join(root, 'remotion-src', 'shotcraft')
const args = process.argv.slice(2)
const opt = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : d
}
const file = resolve(args.find((a) => a.endsWith('.tsx')) || '')
if (!existsSync(file)) {
  console.error('can duong dan file .tsx cua mau')
  process.exit(2)
}
const comp = basename(file, '.tsx')
const src = readFileSync(file, 'utf8')
const metaPath = file.replace(/\.tsx$/, '.meta.json')
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null
const component = meta?.component || comp
let duration = meta?.duration
if (!duration) {
  const m = /export const ([A-Z0-9_]+_DURATION)\s*=\s*(\d+)/.exec(src)
  duration = m ? Number(m[2]) : 150
}
const props = opt('--props') ? JSON.parse(readFileSync(resolve(opt('--props')), 'utf8')) : {}
const texts = props.texts || Object.fromEntries((meta?.slots || []).map((s) => [s.id, s.list ? s.sample.split('|') : s.sample]))
const orient = opt('--orient', 'both')
const frames = (opt('--frames') || [0.15, 0.4, 0.7, 1].map((k) => Math.round(k * (duration - 1))).join(','))
  .split(',')
  .map(Number)
const out = resolve(opt('--out', join(os.tmpdir(), 'shot-still', comp)))
mkdirSync(out, { recursive: true })

// entry rieng cho mau nay
const key = createHash('md5').update(file).digest('hex').slice(0, 8)
const pdir = join(base, '.preview', key)
mkdirSync(pdir, { recursive: true })
const relFile = './' + relative(pdir, file).replace(/\\/g, '/').replace(/\.tsx$/, '')
const metaImport = meta ? `import META from '${relFile}.meta.json'` : 'const META = null'
writeFileSync(
  join(pdir, 'index.tsx'),
  `import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { ${component} as C } from '${relFile}'
import { ShotStage } from '../../ShotStage'
import '../../../fonts'
${metaImport}
const FALLBACK = { id: 'preview', component: '${component}', card: '', category: '', duration: ${duration}, kind: 'insert', dark: true,
  portrait: { mode: 'band', zoom: 1 }, hold: ${duration - 1}, slots: [], images: [], brand: 'none', sfx: [], vi: {} }
const meta = (META || FALLBACK) as any
const P: React.FC<any> = (p) => <ShotStage id={meta.id} entry={{ C: C as React.FC, meta }} {...p} />
const Root = () => (
  <>
    <Composition id="portrait" component={P} width={1080} height={1920} fps={30} durationInFrames={${duration}} defaultProps={{ width: 1080, height: 1920 }} />
    <Composition id="landscape" component={P} width={1920} height={1080} fps={30} durationInFrames={${duration}} defaultProps={{ width: 1920, height: 1080 }} />
  </>
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
console.log(`[shot-still] bundle ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const brand = props.brand === undefined ? { name: 'Agent Edit' } : props.brand
const input = { texts, images: props.images || {}, theme: props.theme || null, brand, rate: props.rate || 1, preview: props.preview !== false, backdrop: props.backdrop || null }
const shots = []
for (const o of orient === 'both' ? ['portrait', 'landscape'] : [orient]) {
  const W = o === 'portrait' ? 1080 : 1920
  const H = o === 'portrait' ? 1920 : 1080
  const inputProps = { ...input, width: W, height: H }
  const composition = await selectComposition({ serveUrl, id: o, inputProps, browserExecutable })
  for (const f of frames) {
    const p = join(out, `${o}-f${f}.png`)
    await renderStill({ serveUrl, composition, frame: Math.min(duration - 1, f), output: p, inputProps, browserExecutable, overwrite: true })
    shots.push({ o, p })
  }
  if (args.includes('--video') && o === 'portrait') {
    await renderMedia({ serveUrl, composition, codec: 'h264', outputLocation: join(out, 'portrait.mp4'), inputProps, browserExecutable, overwrite: true })
  }
}
// ghep sheet: moi huong 1 tam (sheet-portrait.png / sheet-landscape.png), anh thu nho
const sheets = []
for (const o of ['portrait', 'landscape']) {
  const r = shots.filter((s) => s.o === o)
  if (!r.length) continue
  const h = o === 'portrait' ? 640 : 360
  const sheet = join(out, `sheet-${o}.png`)
  const inputs = r.flatMap((s) => ['-i', s.p])
  const filt = r.length > 1
    ? r.map((_, k) => `[${k}:v]scale=-2:${h}[v${k}]`).join(';') + ';' + r.map((_, k) => `[v${k}]`).join('') + `hstack=inputs=${r.length}[o]`
    : `[0:v]scale=-2:${h}[o]`
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filt, '-map', '[o]', sheet])
  sheets.push(sheet)
}
console.log(`[shot-still] xong ${shots.length} khung (${((Date.now() - t0) / 1000).toFixed(1)}s) -> ${sheets.join('  ')}`)
// bundle xem thu ~35MB / mau -> xoa ngay (khong de tich tu hang GB trong remotion-src/shotcraft/.preview)
rmSync(pdir, { recursive: true, force: true })
