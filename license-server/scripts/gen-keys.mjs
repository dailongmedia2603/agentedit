// Sinh bo bi mat cho may chu ban quyen.
//
//   node scripts/gen-keys.mjs          -> BAN THAT: ghi ~/.capcut-studio/license-secrets.json (chmod 600, KHONG ghi de)
//                                         + day len Cloudflare bang `--push`
//   node scripts/gen-keys.mjs --dev    -> ban THU: ghi .dev.vars (wrangler dev doc) bang bo khoa rieng, khong dung cho ban that
//
// TICKET_SK  : khoa BI MAT Ed25519 ky "ve" — chi nam trong Worker. Khoa CONG KHAI tuong ung nhung trong app
//              (electron/services/license.ts + sidecar/server.py). Mat khoa nay = moi ban app phai build lai.
// DL_SECRET  : HMAC cho link tai file kho.
// KEY_ENC_SECRET : AES-GCM ma hoa key trong D1 de trang quan tri xem lai.
import { generateKeyPairSync, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dev = process.argv.includes('--dev')
const push = process.argv.includes('--push')

function fresh() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')
  return {
    TICKET_SK: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    TICKET_PUB: pub,
    DL_SECRET: randomBytes(32).toString('base64'),
    KEY_ENC_SECRET: randomBytes(32).toString('base64')
  }
}

if (dev) {
  const s = fresh()
  const vars = [
    `TICKET_SK=${s.TICKET_SK}`,
    `DL_SECRET=${s.DL_SECRET}`,
    `KEY_ENC_SECRET=${s.KEY_ENC_SECRET}`,
    'DEV_NO_AUTH=1',
    `# khoa cong khai (app dev: STUDIO_LICENSE_PUB)`,
    `TICKET_PUB=${s.TICKET_PUB}`
  ]
  writeFileSync(join(root, '.dev.vars'), vars.join('\n') + '\n')
  console.log('Da ghi .dev.vars (ban THU). STUDIO_LICENSE_PUB=' + s.TICKET_PUB)
  process.exit(0)
}

const file = join(homedir(), '.capcut-studio', 'license-secrets.json')
let s
if (existsSync(file)) {
  s = JSON.parse(readFileSync(file, 'utf-8'))
  console.log('Da co ' + file + ' -> dung lai (KHONG sinh moi).')
} else {
  s = { ...fresh(), created_at: new Date().toISOString() }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(s, null, 2))
  chmodSync(file, 0o600)
  console.log('Da sinh bo bi mat moi: ' + file + ' (chi may nay, KHONG dua len git)')
}
console.log('Khoa CONG KHAI (nhung vao app): ' + s.TICKET_PUB)

if (push) {
  const put = (name, value, cfg) =>
    execFileSync('npx', ['wrangler', 'secret', 'put', name, ...(cfg ? ['-c', cfg] : [])], {
      cwd: root,
      input: value,
      stdio: ['pipe', 'inherit', 'inherit']
    })
  put('TICKET_SK', s.TICKET_SK)
  put('DL_SECRET', s.DL_SECRET)
  put('KEY_ENC_SECRET', s.KEY_ENC_SECRET, 'wrangler.admin.toml')
  console.log('Da day bi mat len Cloudflare.')
}
