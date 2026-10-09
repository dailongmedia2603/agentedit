// electron-builder hook `afterPack` (macOS + Windows):
//
// 1) ELECTRON FUSES (ban quyen): tat NODE_OPTIONS + --inspect / --remote-debugging cua Node trong binary app ->
//    khong chen code / gan debugger vao main de sua trang thai ban quyen. GIU RunAsNode: hop cach ly hieu ung
//    (sidecar/fx_flow.py) chay chinh binary app voi ELECTRON_RUN_AS_NODE=1. Phai lat TRUOC khi ky.
//
// 2) macOS: AD-HOC ky SAU toan bo app bundle sau khi da nhet Python nhung + sidecar .so + out/ vao
//    Contents/Resources. Vi `identity: null` -> electron-builder BO QUA ky, nen chu ky goc cua Electron khong
//    con seal dung Resources moi => `codesign --verify` bao "code has no resources but signature indicates they
//    must be present" => tren may TAI VE (co quarantine) Gatekeeper bao "bi hong". Ad-hoc ky sau lai tao
//    _CodeSignature hop le -> app chuyen ve luong "app chua ky binh thuong" (nguoi dung chuot phai > Open /
//    hoac go quarantine), khong con "bi hong".
//
// 3) macOS 2026-10-09 (TU CAP NHAT): co chung chi ky ma TU TAO (scripts/gen-mac-cert.mjs -> ~/.capcut-studio/
//    mac-codesign.p12 + .json; GitHub Actions: env STUDIO_MAC_SIGN_P12 + STUDIO_MAC_SIGN_PASSWORD) -> ky bang chung chi do
//    thay vi ad-hoc. Ad-hoc: "designated requirement" = cdhash, moi ban build mot khac -> sau MOI lan cap nhat macOS hoi
//    mat khau Keychain ("auto-capcut Safe Storage"). Chung chi co dinh: requirement = identifier + chung chi -> khong hoi
//    lai. Gatekeeper van coi la chua xac minh (nhu ad-hoc). Ky qua keychain TAM (them vao danh sach tim kiem cua user roi
//    TRA LAI ngay — `codesign --keychain` khong nhan chung chi chua duoc tin cay). STUDIO_MAC_SIGN=adhoc = ep ad-hoc.
const { execFileSync } = require('node:child_process')
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { homedir, tmpdir } = require('node:os')
const { join } = require('node:path')
const { randomBytes } = require('node:crypto')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

function signCert() {
  if (process.env.STUDIO_MAC_SIGN === 'adhoc') return null
  const p12 = process.env.STUDIO_MAC_SIGN_P12 || join(homedir(), '.capcut-studio', 'mac-codesign.p12')
  let pw = process.env.STUDIO_MAC_SIGN_PASSWORD
  if (!pw) {
    try {
      pw = JSON.parse(readFileSync(join(homedir(), '.capcut-studio', 'mac-codesign.json'), 'utf-8')).password
    } catch {
      /* khong co */
    }
  }
  return existsSync(p12) && pw ? { p12, pw } : null
}

const sec = (args, opts = {}) => execFileSync('/usr/bin/security', args, { encoding: 'utf-8', ...opts })
const userKeychains = () =>
  sec(['list-keychains', '-d', 'user'])
    .split('\n')
    .map((l) => l.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)

/** Nap p12 vao keychain tam, goi fn(sha1 chung chi), luon don dep + tra danh sach keychain cua user. */
function withSigningIdentity({ p12, pw }, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ae-sign-'))
  const kc = join(dir, 'sign.keychain-db')
  const kpw = randomBytes(16).toString('hex')
  const orig = userKeychains()
  try {
    sec(['create-keychain', '-p', kpw, kc])
    sec(['set-keychain-settings', kc])
    sec(['unlock-keychain', '-p', kpw, kc])
    sec(['import', p12, '-k', kc, '-P', pw, '-T', '/usr/bin/codesign'], { stdio: 'pipe' })
    sec(['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', kpw, kc], { stdio: 'pipe' })
    sec(['list-keychains', '-d', 'user', '-s', ...orig, kc])
    const m = /\b([0-9A-F]{40})\b/.exec(sec(['find-identity', '-p', 'codesigning', kc]))
    if (!m) throw new Error('khong thay chung chi ky ma trong ' + p12)
    fn(m[1])
  } finally {
    try {
      sec(['list-keychains', '-d', 'user', '-s', ...orig])
    } catch (e) {
      console.error('  ! KHONG tra lai duoc danh sach keychain: ' + e.message)
    }
    try {
      sec(['delete-keychain', kc])
    } catch {
      /* da xoa */
    }
    rmSync(dir, { recursive: true, force: true })
  }
}

module.exports = async function (context) {
  const name = context.packager.appInfo.productFilename
  const isMac = context.electronPlatformName === 'darwin'
  const target = isMac ? join(context.appOutDir, name + '.app') : join(context.appOutDir, name + '.exe')

  console.log('  • Electron fuses (tat NODE_OPTIONS + --inspect): ' + target)
  await flipFuses(target, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false
  })

  if (!isMac) return
  const app = target
  // --deep: ky ca python nhung + .so/.dylib + helpers.
  const sign = (identity) => execFileSync('codesign', ['--force', '--deep', '--sign', identity, '--timestamp=none', app], { stdio: 'inherit' })
  const cert = signCert()
  if (cert) {
    console.log('  • ky bang chung chi tu tao (' + cert.p12 + '): ' + app)
    withSigningIdentity(cert, (sha1) => sign(sha1))
  } else {
    console.log('  • ad-hoc ky sau toan bo app (KHONG co chung chi -> sau moi lan cap nhat macOS se hoi Keychain): ' + app)
    sign('-')
  }
  // Kiem: phai hop le thi may tai ve moi khong bao "bi hong"
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=1', app], { stdio: 'inherit' })
  const dr = execFileSync('codesign', ['-dr', '-', app], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
  console.log('  • chu ky hop le — ' + (dr.split('\n').find((l) => l.includes('designated')) || '').trim())
}
