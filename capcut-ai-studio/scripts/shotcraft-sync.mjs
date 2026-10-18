// KHO SHOT (video-shotcraft): doc moi shots/**/<Component>.meta.json ->
//   1. remotion-src/shotcraft/registry.ts  (import component + meta cho ShotPlayer)
//   2. sidecar/references/shotcraft_catalog.json (buoc lap ke hoach R4 doc TOAN BO kho tu file nay)
// Kiem: id duy nhat, component co export trong file .tsx, truong bat buoc. Chay lai moi khi them / sua meta:
//   node scripts/shotcraft-sync.mjs        (--check: chi kiem, khong ghi; loi -> exit 1)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = join(root, 'remotion-src', 'shotcraft')
const shotsDir = join(base, 'shots')
const check = process.argv.includes('--check')

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

const ROLES = new Set(['title', 'subtitle', 'kicker', 'label', 'number', 'item', 'quote', 'cta', 'name', 'code'])
const IMG_ROLES = new Set(['screen', 'photo', 'product', 'video'])
const SFX = new Set(['whoosh', 'swoosh', 'pop', 'click', 'boom', 'riser', 'ding', 'typing'])
const errors = []
const metas = []
for (const f of walk(shotsDir).filter((p) => p.endsWith('.meta.json')).sort()) {
  const rel = relative(base, f)
  let m
  try {
    m = JSON.parse(readFileSync(f, 'utf8'))
  } catch (e) {
    errors.push(`${rel}: JSON hong (${e.message})`)
    continue
  }
  const tsx = f.replace(/\.meta\.json$/, '.tsx')
  const err = (s) => errors.push(`${rel}: ${s}`)
  if (!existsSync(tsx)) err('khong co file .tsx cung ten')
  else if (!new RegExp(`export const ${m.component}\\b`).test(readFileSync(tsx, 'utf8'))) err(`khong thay "export const ${m.component}"`)
  for (const k of ['id', 'component', 'card', 'category', 'duration', 'kind', 'dark', 'portrait', 'hold', 'slots', 'images', 'brand', 'sfx', 'vi'])
    if (m[k] === undefined) err(`thieu truong ${k}`)
  if (!(m.duration > 0)) err('duration phai > 0')
  if (!(m.hold >= 0 && m.hold <= m.duration)) err('hold phai trong [0, duration]')
  if (!['insert', 'overlay'].includes(m.kind)) err('kind sai')
  if (!['native', 'band'].includes(m.portrait?.mode)) err('portrait.mode sai')
  if (!['required', 'optional', 'none'].includes(m.brand)) err('brand sai')
  const ids = new Set()
  for (const s of m.slots || []) {
    if (!s.id || ids.has(s.id)) err(`o chu trung / thieu id: ${s.id}`)
    ids.add(s.id)
    if (!ROLES.has(s.role)) err(`o ${s.id}: role '${s.role}' sai`)
    if (!(s.max > 0)) err(`o ${s.id}: max phai > 0`)
    if (typeof s.sample !== 'string') err(`o ${s.id}: thieu sample`)
  }
  for (const im of m.images || []) {
    if (!im.id || ids.has(im.id)) err(`o anh trung / thieu id: ${im.id}`)
    ids.add(im.id)
    if (!IMG_ROLES.has(im.role)) err(`o anh ${im.id}: role '${im.role}' sai`)
  }
  for (const x of m.sfx || []) if (!SFX.has(x.type) || !(x.at >= 0)) err(`sfx sai: ${JSON.stringify(x)}`)
  for (const k of ['ten', 'mo_ta', 'hop_khi', 'tranh_khi', 'nang_luong', 'chu_de']) if (!m.vi?.[k]) err(`vi.${k} thieu`)
  metas.push({ ...m, _file: relative(base, tsx).replace(/\\/g, '/').replace(/\.tsx$/, '') })
}
const seen = new Map()
for (const m of metas) {
  if (seen.has(m.id)) errors.push(`id trung: ${m.id} (${seen.get(m.id)} / ${m._file})`)
  seen.set(m.id, m._file)
}
const styles = JSON.parse(readFileSync(join(base, 'styles.json'), 'utf8')).styles
const missing = styles.filter((s) => !seen.has(s.id)).map((s) => s.id)
const unknown = metas.filter((m) => !styles.some((s) => s.id === m.id)).map((m) => m.id)
if (unknown.length) errors.push(`id khong co trong styles.json: ${unknown.join(', ')}`)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`[shotcraft] ${metas.length}/${styles.length} mau co meta${missing.length ? ` — chua port: ${missing.join(', ')}` : ''}`)
if (check) process.exit(0)

const lines = [
  '// FILE SINH TU DONG boi scripts/shotcraft-sync.mjs — KHONG SUA TAY.',
  "import type React from 'react'",
  "import type { ShotMeta } from './meta'"
]
const entries = []
metas.forEach((m, i) => {
  lines.push(`import { ${m.component} as C${i} } from './${m._file}'`)
  lines.push(`import M${i} from './${m._file}.meta.json'`)
  entries.push(`  ${JSON.stringify(m.id)}: { C: C${i} as React.FC, meta: M${i} as unknown as ShotMeta },`)
})
lines.push('', 'export const SHOTS: Record<string, { C: React.FC; meta: ShotMeta }> = {', ...entries, '}', '')
writeFileSync(join(base, 'registry.ts'), lines.join('\n'))

const order = ['opening', 'typography', 'ui-entrance', 'camera', 'data', 'interaction', 'transition', 'rhythm', 'effects', 'outro']
const catalog = metas
  .map(({ _file, component, ...m }) => m)
  .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.id.localeCompare(b.id))
writeFileSync(
  join(root, 'sidecar', 'references', 'shotcraft_catalog.json'),
  JSON.stringify({ version: 1, upstream: 'github.com/Vincentwei1021/video-shotcraft (Apache-2.0)', shots: catalog }, null, 1) + '\n'
)
console.log('[shotcraft] da ghi registry.ts + sidecar/references/shotcraft_catalog.json')
