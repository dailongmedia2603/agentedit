#!/usr/bin/env node
// SINH CHUNG CHI KY MA macOS TU TAO (mien phi, khong can Apple Developer) — chay 1 LAN tren may chu app.
//   node scripts/gen-mac-cert.mjs   -> ~/.capcut-studio/mac-codesign.p12 + mac-codesign.json (mat khau) — KHONG len git
//   node scripts/gen-mac-cert.mjs --print   -> in p12 dang base64 + mat khau (GitHub Secrets MAC_CERT_P12 / MAC_CERT_PASSWORD)
//
// Vi sao: ky ad-hoc -> "designated requirement" = cdhash, MOI ban build mot khac -> sau moi lan cap nhat macOS hoi mat khau
// Keychain ("auto-capcut Safe Storage" chua khoa API + key ban quyen). Ky bang chung chi CO DINH -> requirement =
// identifier + chung chi (khong doi giua cac ban) -> Keychain khong hoi lai (da thu 2026-10-09: 2 binary khac nhau cung
// chung chi doc duoc muc Keychain cua nhau khong hoi). Gatekeeper van coi la "chua xac minh" nhu ad-hoc (lan cai DAU tu
// .dmg van lam theo huong dan "Vẫn mở"); ban cap nhat do app tu tai khong gan quarantine nen khong bi Gatekeeper hoi.
// scripts/adhoc-sign.cjs dung file nay (hoac env STUDIO_MAC_SIGN_P12 / STUDIO_MAC_SIGN_PASSWORD tren GitHub Actions).
// MAT file = sinh moi: khach bi hoi Keychain 1 lan o ban dau tien ky chung chi moi. Giu ban sao an toan.
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

const dir = join(homedir(), '.capcut-studio')
const p12 = join(dir, 'mac-codesign.p12')
const meta = join(dir, 'mac-codesign.json')
if (process.argv.includes('--print')) {
  if (!existsSync(p12) || !existsSync(meta)) {
    console.error('Chua co chung chi: chay `node scripts/gen-mac-cert.mjs` truoc.')
    process.exit(1)
  }
  console.log('MAC_CERT_P12=' + readFileSync(p12).toString('base64'))
  console.log('MAC_CERT_PASSWORD=' + JSON.parse(readFileSync(meta, 'utf-8')).password)
  process.exit(0)
}
if (existsSync(p12) && !process.argv.includes('--force')) {
  console.log(`Da co ${p12} (${JSON.parse(readFileSync(meta, 'utf-8')).sha1}). Sinh lai = khach bi hoi Keychain 1 lan (--force).`)
  process.exit(0)
}
const tmp = mkdtempSync(join(tmpdir(), 'ae-cert-'))
try {
  writeFileSync(
    join(tmp, 'cs.cnf'),
    [
      '[req]',
      'distinguished_name=dn',
      'x509_extensions=ext',
      'prompt=no',
      '[dn]',
      'CN=Agent Edit Code Signing',
      'O=Agent Edit',
      '[ext]',
      'basicConstraints=critical,CA:false',
      'keyUsage=critical,digitalSignature',
      'extendedKeyUsage=critical,codeSigning',
      'subjectKeyIdentifier=hash',
      ''
    ].join('\n')
  )
  // 30 nam: chung chi het han thi ban ky sau do doi requirement? Khong — requirement chi so bam chung chi, khong xet han,
  // nhung codesign tu choi ky bang chung chi da het han -> de dai.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tmp, 'key.pem'), '-out', join(tmp, 'cert.pem'), '-days', '10950', '-config', join(tmp, 'cs.cnf')], { stdio: 'pipe' })
  const password = randomBytes(18).toString('base64url')
  // PBE-SHA1-3DES: `security import` cua macOS doc duoc (AES mac dinh cua OpenSSL 3 thi khong)
  execFileSync('openssl', ['pkcs12', '-export', '-inkey', join(tmp, 'key.pem'), '-in', join(tmp, 'cert.pem'), '-out', p12, '-passout', `pass:${password}`, '-name', 'Agent Edit Code Signing', '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1'], { stdio: 'pipe' })
  const fpr = execFileSync('openssl', ['x509', '-in', join(tmp, 'cert.pem'), '-noout', '-fingerprint', '-sha1'], { encoding: 'utf-8' })
  const sha1 = fpr.split('=').pop().replace(/:/g, '').trim().toUpperCase()
  writeFileSync(meta, JSON.stringify({ v: 1, password, sha1, name: 'Agent Edit Code Signing', created: new Date().toISOString() }, null, 2))
  chmodSync(p12, 0o600)
  chmodSync(meta, 0o600)
  console.log(`Da luu ${p12} (SHA-1 ${sha1}) + ${meta}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
