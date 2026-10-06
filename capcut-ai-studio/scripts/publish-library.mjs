// PUBLISH kho SFX + Meme + Text + Nhac nen (kem nhan Gemini) len Cloudflare R2 — CHI chay o may tac gia.
//   npm run publish:library
// Doc kho tu ~/.capcut-studio (sfx_library.json + sfx/, meme_library.json + memes/,
// text_library.json + text_templates/<id>/ — thu muc NHIEU file: template.json, preview.mp4,
// fonts/, audio/, assets/), tinh SHA-256 tung file, tao library-manifest.json (sfx/memes: file=ten
// co ban; texts: files=[{path tuong doi, sha256, size}] vi 1 mau co nhieu file), roi upload nhung
// file MOI / DOI (so voi manifest tren R2) + manifest moi. R2 key: `sfx/<file>`, `memes/<file>`,
// `texts/<id>/<path tuong doi>`, `music/<file>`.
// NHAC NEN: CHI bai giay phep CC0 (`license` bat dau "CC0") duoc dua len — nhac nguoi dung tu nhap / nhac co giay phep
// cam phat lai (Mixkit, Pixabay...) KHONG BAO GIO len kho chung. Chinh rieng tung may (disabled) bi bo.
//
// Token R2 nam o ~/.capcut-studio/r2-publish.json (KHONG nhung vao app, KHONG len git):
//   { "account_id","access_key_id","secret_access_key","bucket" }
// (hoac bien moi truong R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET)
// Bucket KHONG con cong khai: app chi tai qua may chu ban quyen (license-server/) -> doc manifest cu bang S3.
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

const HOME = homedir()
const ENGINE = join(HOME, '.capcut-studio')
const DRY_RUN = process.argv.includes('--dry-run') || process.env.PUBLISH_DRY_RUN === '1'
// --only music[,sfx,...]: CHI dua cac kho nay len; kho khac giu NGUYEN nhu manifest dang co tren R2 (vd chi phat hanh
// nhac nen ma khong day kem mau chu chua muon phat hanh). Dry-run khong doc R2 -> kho khac de trong.
const ONLY = (() => {
  const i = process.argv.indexOf('--only')
  const v = i >= 0 ? process.argv[i + 1] : (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
  return v ? new Set(v.split(',').map((x) => x.trim()).filter(Boolean)) : null
})()
const want = (kind) => !ONLY || ONLY.has(kind)
const log = (...a) => console.log('[publish-library]', ...a)

function creds() {
  let c = {}
  const f = join(ENGINE, 'r2-publish.json')
  if (existsSync(f)) c = JSON.parse(readFileSync(f, 'utf-8'))
  const g = (k, e) => process.env[e] || c[k]
  const out = {
    account_id: g('account_id', 'R2_ACCOUNT_ID'),
    access_key_id: g('access_key_id', 'R2_ACCESS_KEY_ID'),
    secret_access_key: g('secret_access_key', 'R2_SECRET_ACCESS_KEY'),
    bucket: g('bucket', 'R2_BUCKET')
  }
  const miss = Object.entries(out).filter(([, v]) => !v).map(([k]) => k)
  if (miss.length) {
    console.error(`[publish-library] Thieu cau hinh: ${miss.join(', ')}`)
    console.error(`  Tao ${join(ENGINE, 'r2-publish.json')} voi { account_id, access_key_id, secret_access_key, bucket }`)
    process.exit(1)
  }
  return out
}

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const CTYPES = { mp3: 'audio/mpeg', mp4: 'video/mp4', json: 'application/json', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac' }
const ctype = (f) => CTYPES[f.split('.').pop().toLowerCase()] || 'application/octet-stream'

function readLib(file, key) {
  const p = join(ENGINE, file)
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))[key] || []
  } catch {
    return []
  }
}

/** 1 entry kho -> entry manifest: bo duong dan tuyet doi (giu ten file), them sha256 + size. */
function manifestEntry(e, mediaDir) {
  const fname = basename(e.file || '')
  const abs = join(ENGINE, mediaDir, fname)
  if (!fname || !existsSync(abs)) return null
  const { file, ...rest } = e // bo duong dan tuyet doi
  void file
  return { ...rest, file: fname, sha256: sha256(abs), size: statSync(abs).size }
}

/** Duyet 1 thu muc, tra ve duong dan TUONG DOI (dung "/", bo file an) cua moi file ben trong. */
function walkFiles(dir, base = '') {
  let out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) out = out.concat(walkFiles(abs, rel))
    else out.push(rel)
  }
  return out
}

async function main() {
  if (DRY_RUN) log('CHE DO THU (--dry-run): chi tao + kiem manifest, KHONG can token, KHONG upload.')
  const c = DRY_RUN ? {} : creds()
  const client = DRY_RUN
    ? null
    : new S3Client({
        region: 'auto',
        endpoint: `https://${c.account_id}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: c.access_key_id, secretAccessKey: c.secret_access_key }
      })

  // manifest hien co tren R2 -> bo qua file trung SHA (tiet kiem bang thong)
  let remote = { sfx: [], memes: [], texts: [], music: [] }
  if (!DRY_RUN) {
    try {
      const r = await client.send(new GetObjectCommand({ Bucket: c.bucket, Key: 'library-manifest.json' }))
      remote = JSON.parse(await r.Body.transformToString())
    } catch (e) {
      // --only giu kho khac theo R2: khong doc duoc manifest thi DUNG (khong ghi de kho khac thanh rong)
      if (ONLY) throw new Error(`--only can doc manifest R2 nhung that bai: ${e?.message || e}`)
      /* chua co manifest */
    }
  }
  const remoteSha = new Map()
  for (const kind of ['sfx', 'memes', 'music']) for (const e of remote[kind] || []) remoteSha.set(`${kind}/${e.file}`, e.sha256)
  for (const e of remote.texts || []) for (const f of e.files || []) remoteSha.set(`texts/${e.id}/${f.path}`, f.sha256)

  const kinds = [
    { key: 'sfx', lib: 'sfx_library.json', libKey: 'sfx', dir: 'sfx' },
    { key: 'memes', lib: 'meme_library.json', libKey: 'memes', dir: 'memes' },
    {
      key: 'music',
      lib: 'music_library.json',
      libKey: 'tracks',
      dir: 'music',
      keep: (e) => /^CC0/i.test(String(e.license || '')),
      strip: ['disabled']
    }
  ]
  const manifest = { updated: new Date().toISOString(), sfx: [], memes: [], texts: [], music: [] }
  let uploaded = 0
  let skipped = 0

  async function putObject(key, body, contentType) {
    if (DRY_RUN) return
    await client.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: body, ContentType: contentType }))
  }

  for (const k of kinds) {
    if (!want(k.key)) {
      manifest[k.key] = remote[k.key] || []
      continue
    }
    const entries = readLib(k.lib, k.libKey)
    for (const e of entries) {
      if (k.keep && !k.keep(e)) {
        log(`  bo qua (khong phai CC0 — khong duoc phat lai): ${e.id || e.name}`)
        continue
      }
      const me = manifestEntry(e, k.dir)
      for (const f of k.strip || []) delete me?.[f]
      if (!me) {
        log(`  bo qua (thieu file): ${e.id || e.name}`)
        continue
      }
      manifest[k.key].push(me)
      const objKey = `${k.key}/${me.file}`
      if (remoteSha.get(objKey) === me.sha256) {
        skipped++
        continue
      }
      await putObject(objKey, readFileSync(join(ENGINE, k.dir, me.file)), ctype(me.file))
      uploaded++
      log(`  ↑ ${objKey}`)
    }
  }

  // Kho Text: moi mau la 1 THU MUC nhieu file (template.json, preview.mp4, fonts/, audio/, assets/)
  if (!want('texts')) manifest.texts = remote.texts || []
  const texts = want('texts') ? readLib('text_library.json', 'templates') : []
  for (const t of texts) {
    if (!t.id) continue
    const tdir = join(ENGINE, 'text_templates', t.id)
    if (!existsSync(tdir)) {
      log(`  bo qua (thieu thu muc mau): ${t.id}`)
      continue
    }
    const relFiles = walkFiles(tdir)
    if (!relFiles.length) {
      log(`  bo qua (thu muc mau rong): ${t.id}`)
      continue
    }
    const { dir, ...rest } = t // bo duong dan tuyet doi (viet lai theo may khi pull)
    void dir
    const files = relFiles.map((rel) => {
      const abs = join(tdir, ...rel.split('/'))
      return { path: rel, sha256: sha256(abs), size: statSync(abs).size }
    })
    manifest.texts.push({ ...rest, files })
    for (const f of files) {
      const objKey = `texts/${t.id}/${f.path}`
      if (remoteSha.get(objKey) === f.sha256) {
        skipped++
        continue
      }
      await putObject(objKey, readFileSync(join(tdir, ...f.path.split('/'))), ctype(f.path))
      uploaded++
      log(`  ↑ ${objKey}`)
    }
  }

  // manifest cuoi cung
  await putObject('library-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json')
  const tong = `SFX ${manifest.sfx.length} + Meme ${manifest.memes.length} + Text ${manifest.texts.length} + Nhac nen ${manifest.music.length}`
  if (DRY_RUN) {
    log(`THU xong. ${tong}; se upload ${uploaded} file (tat ca, vi khong so voi R2). Khong co gi duoc gui len.`)
  } else {
    log(`Xong. ${tong}; upload ${uploaded} file, bo qua ${skipped} (da co, trung SHA).`)
    log(`Manifest: r2://${c.bucket}/library-manifest.json (app tai qua may chu ban quyen)`)
  }
}

main().catch((e) => {
  console.error('[publish-library] LOI:', e?.message || e)
  process.exit(1)
})
