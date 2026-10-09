#!/usr/bin/env node
// PHAT HANH BAN CAP NHAT cho app da cai cua khach (chay SAU `npm run dist` tren macOS / `dist:win` tren Windows — may
// chu app hoac GitHub Actions .github/workflows/release.yml). PROJECT_OVERVIEW muc 15.
//
//   node scripts/publish-update.mjs [--channel stable|test] [--notes "..." | --notes-file <f>] [--dry-run] [--force]
//                                   [--allow-adhoc]
//
// 1. Doc release/build-info-<mac|win>.json (dist.mjs ghi) -> phien ban + ma build cua LAN DONG GOI VUA XONG.
//    Tu choi: ban day du (-full / STUDIO_FULL_UI) — app cua chu app, khong phat cho khach; ban --dir khong co bo cai.
// 2. macOS: kiem chu ky ma (chung chi tu tao — ad-hoc thi khach bi hoi Keychain sau cap nhat: chan, --allow-adhoc de bo
//    qua), nen release/mac-arm64/Agent Edit.app bang `ditto` (giu symlink Electron Framework + chu ky) -> .zip.
//    Windows: chinh file Setup .exe (NSIS) — app chay `/S --updated` de cai im lang.
// 3. Phieu m = JSON {v,channel,platform,arch,version,build,file,size,sha512,notes,released_at}, KY Ed25519 bang khoa
//    ~/.capcut-studio/update-signing.json (hoac env UPDATE_SIGNING_KEY = khoa pkcs8 base64). App kiem bang UPDATE_PUB.
// 4. R2 (bucket agent-edit): file -> updates/files/<ten>, phieu -> updates/<kenh>/<platform>-<arch>.json (day CUOI CUNG:
//    file chua len du thi chua co ai thay phieu). Phieu tren R2 dang moi hon / bang -> tu choi (--force de ghi de).
//    Token R2: ~/.capcut-studio/r2-publish.json hoac env R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET.
import { execFileSync } from 'node:child_process'
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const root = resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const flag = (k) => argv.includes(k)
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const DRY = flag('--dry-run')
const FORCE = flag('--force')
const channel = opt('--channel') || 'stable'
const IS_MAC = process.platform === 'darwin'
const IS_WIN = process.platform === 'win32'
const log = (...a) => console.log('[publish-update]', ...a)
const die = (m) => {
  console.error('[publish-update] LOI: ' + m)
  process.exit(1)
}

if (!['stable', 'test'].includes(channel)) die(`kenh "${channel}" khong hop le (stable | test)`)
if (!IS_MAC && !IS_WIN) die('chi chay tren macOS (ban mac) hoac Windows (ban win)')

// ---- 1. lan dong goi vua xong ----
const infoFile = join(root, 'release', `build-info-${IS_MAC ? 'mac' : 'win'}.json`)
if (!existsSync(infoFile)) die(`chua co ${infoFile} — chay \`npm run ${IS_MAC ? 'dist' : 'dist:win'}\` truoc`)
const info = JSON.parse(readFileSync(infoFile, 'utf-8'))
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).version
if (info.version !== pkgVersion) die(`build-info (${info.version}) khac package.json (${pkgVersion}) — dong goi lai`)
if (info.fullUi || String(info.build).endsWith('-full')) die('day la ban DAY DU (STUDIO_FULL_UI=1) — khong phat cho khach. Build lai bang `npm run dist` / `dist:win`.')
if (info.dir) die('lan dong goi la --dir (khong co bo cai) — chay `npm run dist` / `dist:win`')
if (!/^\d{8}-\d{4}$/.test(info.build)) die(`ma build "${info.build}" khong dung dang ngay-gio (dist.mjs dat)`)
if (!/^\d+\.\d+\.\d+$/.test(info.version)) die(`phien ban "${info.version}" khong dung dang x.y.z`)
const { version, build } = info

let notes = opt('--notes') || ''
if (opt('--notes-file')) notes = readFileSync(opt('--notes-file'), 'utf-8')
notes = notes.trim().slice(0, 4000)

// ---- 2. file phat hanh ----
let src
let file
if (IS_MAC) {
  const app = join(root, 'release', 'mac-arm64', 'Agent Edit.app')
  if (!existsSync(app)) die(`khong thay ${app}`)
  const plistVer = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(app, 'Contents', 'Info.plist')], { encoding: 'utf-8' }).trim()
  if (plistVer !== version) die(`app trong release/mac-arm64 la ${plistVer}, khong phai ${version}`)
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  const dr = execFileSync('/usr/bin/codesign', ['-dr', '-', app], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (!/certificate/.test(dr)) {
    if (!flag('--allow-adhoc')) die('app ky AD-HOC (khong co chung chi) -> khach bi hoi mat khau Keychain sau cap nhat. Chay `node scripts/gen-mac-cert.mjs` roi dong goi lai (hoac --allow-adhoc).')
    log('CANH BAO: ban ky ad-hoc (--allow-adhoc)')
  }
  file = `Agent-Edit-${version}-b${build}-mac-arm64.zip`
  src = join(root, 'release', file)
  rmSync(src, { force: true })
  log(`nen ${app} -> ${file}`)
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, src], { stdio: 'inherit' })
} else {
  const setup = join(root, 'release', `Agent Edit-Setup-${version}-b${build}-x64.exe`)
  if (!existsSync(setup)) die(`khong thay ${setup}`)
  file = `Agent-Edit-Setup-${version}-b${build}-x64.exe`
  src = setup
}
const buf = readFileSync(src)
const size = buf.length
const sha512 = createHash('sha512').update(buf).digest('base64')
log(`${file}: ${(size / 1048576).toFixed(1)} MB, sha512 ${sha512.slice(0, 16)}…`)

// ---- 3. phieu + chu ky ----
function signingKey() {
  const env = process.env.UPDATE_SIGNING_KEY
  if (env) return env.trim()
  const f = join(homedir(), '.capcut-studio', 'update-signing.json')
  if (!existsSync(f)) die(`thieu khoa ky: ${f} (node scripts/gen-update-key.mjs) hoac env UPDATE_SIGNING_KEY`)
  return JSON.parse(readFileSync(f, 'utf-8')).sk
}
const platform = IS_MAC ? 'darwin' : 'win32'
const arch = IS_MAC ? 'arm64' : 'x64'
const m = JSON.stringify({ v: 1, channel, platform, arch, version, build, file, size, sha512, notes, released_at: Date.now() })
const sk = createPrivateKey({ key: Buffer.from(signingKey(), 'base64'), format: 'der', type: 'pkcs8' })
const sig = sign(null, Buffer.from(m, 'utf-8'), sk).toString('base64')
// khoa ky phai khop khoa cong khai NHUNG trong app (sai -> app khach tu choi moi ban)
const pubInApp = /UPDATE_PUB = '([^']+)'/.exec(readFileSync(join(root, 'electron', 'services', 'update-core.ts'), 'utf-8'))?.[1]
const pubKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pubInApp || '', 'base64')]), format: 'der', type: 'spki' })
if (!verify(null, Buffer.from(m, 'utf-8'), pubKey, Buffer.from(sig, 'base64'))) die('khoa ky KHONG khop UPDATE_PUB trong electron/services/update-core.ts')
const manifestKey = `updates/${channel}/${platform}-${arch}.json`
const record = JSON.stringify({ m, sig })

// ---- 4. R2 ----
function creds() {
  let c = {}
  const f = join(homedir(), '.capcut-studio', 'r2-publish.json')
  if (existsSync(f)) c = JSON.parse(readFileSync(f, 'utf-8'))
  const g = (k, e) => process.env[e] || c[k]
  const out = {
    account_id: g('account_id', 'R2_ACCOUNT_ID'),
    access_key_id: g('access_key_id', 'R2_ACCESS_KEY_ID'),
    secret_access_key: g('secret_access_key', 'R2_SECRET_ACCESS_KEY'),
    bucket: g('bucket', 'R2_BUCKET')
  }
  const miss = Object.entries(out).filter(([, v]) => !v).map(([k]) => k)
  if (miss.length) die(`thieu cau hinh R2: ${miss.join(', ')} (~/.capcut-studio/r2-publish.json hoac env R2_*)`)
  return out
}
const relNewer = (aV, aB, bV, bB) => {
  const a = aV.split('.').map(Number)
  const b = bV.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  return aB === bB ? 0 : aB > bB ? 1 : -1
}

if (DRY) {
  log(`--dry-run: KHONG day len. Phieu ${manifestKey}:`)
  console.log(JSON.stringify(JSON.parse(m), null, 2))
  process.exit(0)
}
const c = creds()
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${c.account_id}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: c.access_key_id, secretAccessKey: c.secret_access_key }
})
async function retry(what, fn) {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i >= 4) throw e
      log(`${what} loi (${e.name || e.message}) — thu lai ${i}/3`)
      await new Promise((r) => setTimeout(r, 3000 * i))
    }
  }
}

try {
  const cur = await s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: manifestKey }))
  const cm = JSON.parse(JSON.parse(await cur.Body.transformToString()).m)
  const cmp = relNewer(version, build, cm.version, cm.build)
  log(`dang phat hanh tren kenh ${channel}: ${cm.version} (${cm.build})`)
  if (cmp <= 0 && !FORCE) die(`ban ${version} (${build}) ${cmp === 0 ? 'DA phat hanh' : 'CU hon ban dang phat hanh'} — them --force neu that su muon`)
} catch (e) {
  if (e.name !== 'NoSuchKey' && e.$metadata?.httpStatusCode !== 404) throw e
  log(`kenh ${channel} chua co ban nao`)
}

const fileKey = `updates/files/${file}`
let have = false
try {
  const h = await s3.send(new HeadObjectCommand({ Bucket: c.bucket, Key: fileKey }))
  have = h.ContentLength === size && h.Metadata?.sha512 === sha512
} catch {
  /* chua co */
}
if (have) log(`${fileKey} da co (cung SHA-512) — bo qua tai len`)
else {
  log(`tai len ${fileKey} (${(size / 1048576).toFixed(1)} MB)…`)
  const t0 = Date.now()
  await retry('tai file', () =>
    s3.send(new PutObjectCommand({ Bucket: c.bucket, Key: fileKey, Body: buf, ContentType: 'application/octet-stream', Metadata: { sha512 } }))
  )
  log(`xong sau ${Math.round((Date.now() - t0) / 1000)}s`)
}
await retry('tai phieu', () =>
  s3.send(new PutObjectCommand({ Bucket: c.bucket, Key: manifestKey, Body: record, ContentType: 'application/json', CacheControl: 'no-store' }))
)
log(`DA PHAT HANH ${version} (${build}) ${platform}-${arch} kenh ${channel} — app khach nhan o lan mo app / kiem tra cap nhat ke tiep`)
if (IS_MAC) rmSync(src, { force: true })
