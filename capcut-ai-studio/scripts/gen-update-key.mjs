#!/usr/bin/env node
// SINH KHOA KY BAN CAP NHAT (Ed25519) — chay 1 LAN tren may chu app.
//   node scripts/gen-update-key.mjs            -> ~/.capcut-studio/update-signing.json (chmod 600, KHONG len git)
//   node scripts/gen-update-key.mjs --print    -> in khoa bi mat dang 1 dong (dan vao GitHub Secret UPDATE_SIGNING_KEY)
//
// Khoa bi mat: ky "phieu phien ban" (manifest) moi lan phat hanh (scripts/publish-update.mjs, may nay hoac GitHub Actions).
// Khoa cong khai: NHUNG CUNG trong app (electron/services/update-core.ts UPDATE_PUB) — app chi cai ban co chu ky dung,
// ke ca khi R2 / may chu ban quyen bi chiem. MAT khoa bi mat = khong phat hanh duoc cho app da cai (phai cai tay ban moi
// co khoa moi). LO khoa = sinh khoa moi, nhung khoa moi vao app, phat hanh + bao khach cai tay 1 lan.
import { generateKeyPairSync } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const file = join(homedir(), '.capcut-studio', 'update-signing.json')
if (process.argv.includes('--print')) {
  if (!existsSync(file)) {
    console.error('Chua co khoa: chay `node scripts/gen-update-key.mjs` truoc.')
    process.exit(1)
  }
  console.log(JSON.parse(readFileSync(file, 'utf-8')).sk)
  process.exit(0)
}
if (existsSync(file) && !process.argv.includes('--force')) {
  const cur = JSON.parse(readFileSync(file, 'utf-8'))
  console.log(`Da co khoa (${file}) — khoa cong khai: ${cur.pub}`)
  console.log('Sinh lai = app da cai KHONG nhan ban moi nua (them --force neu that su muon).')
  process.exit(0)
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const sk = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')
mkdirSync(join(homedir(), '.capcut-studio'), { recursive: true })
writeFileSync(file, JSON.stringify({ v: 1, sk, pub, created: new Date().toISOString() }, null, 2))
chmodSync(file, 0o600)
console.log(`Da luu ${file}`)
console.log(`Khoa cong khai (dan vao update-core.ts UPDATE_PUB): ${pub}`)
