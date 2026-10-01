// PUBLISH kho SFX + Meme (kem nhan Gemini) len Cloudflare R2 — CHI chay o may tac gia.
//   npm run publish:library
// Doc kho tu ~/.capcut-studio (sfx_library.json + sfx/, meme_library.json + memes/), tinh SHA-256
// tung file media, tao library-manifest.json (file=ten co ban, khong duong dan tuyet doi), roi upload
// nhung file MOI / DOI (so voi manifest tren R2) + manifest moi.
//
// Token R2 nam o ~/.capcut-studio/r2-publish.json (KHONG nhung vao app, KHONG len git):
//   { "account_id","access_key_id","secret_access_key","bucket","public_base_url" }
// (hoac bien moi truong R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_BASE_URL)
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

const HOME = homedir()
const ENGINE = join(HOME, '.capcut-studio')
const DRY_RUN = process.argv.includes('--dry-run') || process.env.PUBLISH_DRY_RUN === '1'
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
    bucket: g('bucket', 'R2_BUCKET'),
    public_base_url: (g('public_base_url', 'R2_PUBLIC_BASE_URL') || '').replace(/\/$/, '')
  }
  const miss = Object.entries(out).filter(([, v]) => !v).map(([k]) => k)
  if (miss.length) {
    console.error(`[publish-library] Thieu cau hinh: ${miss.join(', ')}`)
    console.error(`  Tao ${join(ENGINE, 'r2-publish.json')} voi { account_id, access_key_id, secret_access_key, bucket, public_base_url }`)
    process.exit(1)
  }
  return out
}

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const ctype = (f) => (f.endsWith('.mp3') ? 'audio/mpeg' : f.endsWith('.mp4') ? 'video/mp4' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream')

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
  let remote = { sfx: [], memes: [] }
  if (!DRY_RUN) {
    try {
      const r = await fetch(`${c.public_base_url}/library-manifest.json`, { cache: 'no-store' })
      if (r.ok) remote = await r.json()
    } catch {
      /* chua co manifest */
    }
  }
  const remoteSha = new Map()
  for (const kind of ['sfx', 'memes']) for (const e of remote[kind] || []) remoteSha.set(`${kind}/${e.file}`, e.sha256)

  const kinds = [
    { key: 'sfx', lib: 'sfx_library.json', libKey: 'sfx', dir: 'sfx' },
    { key: 'memes', lib: 'meme_library.json', libKey: 'memes', dir: 'memes' }
  ]
  const manifest = { updated: new Date().toISOString(), sfx: [], memes: [] }
  let uploaded = 0
  let skipped = 0

  async function putObject(key, body, contentType) {
    if (DRY_RUN) return
    await client.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: body, ContentType: contentType }))
  }

  for (const k of kinds) {
    const entries = readLib(k.lib, k.libKey)
    for (const e of entries) {
      const me = manifestEntry(e, k.dir)
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

  // manifest cuoi cung
  await putObject('library-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json')
  if (DRY_RUN) {
    log(`THU xong. SFX ${manifest.sfx.length} + Meme ${manifest.memes.length}; se upload ${uploaded} file (tat ca, vi khong so voi R2). Khong co gi duoc gui len.`)
  } else {
    log(`Xong. SFX ${manifest.sfx.length} + Meme ${manifest.memes.length}; upload ${uploaded} file, bo qua ${skipped} (da co, trung SHA).`)
    log(`Manifest: ${c.public_base_url}/library-manifest.json`)
  }
}

main().catch((e) => {
  console.error('[publish-library] LOI:', e?.message || e)
  process.exit(1)
})
