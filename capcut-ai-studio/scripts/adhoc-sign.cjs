// electron-builder hook `afterPack`: AD-HOC ky SAU toan bo app bundle sau khi da nhet Python nhung +
// sidecar .so + out/ vao Contents/Resources. Vi `identity: null` -> electron-builder BO QUA ky, nen
// chu ky goc cua Electron khong con seal dung Resources moi => `codesign --verify` bao "code has no
// resources but signature indicates they must be present" => tren may TAI VE (co quarantine) Gatekeeper
// bao "bi hong". Ad-hoc ky sau lai tao _CodeSignature hop le -> app chuyen ve luong "app chua ky binh
// thuong" (nguoi dung chuot phai > Open / hoac go quarantine), khong con "bi hong".
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

module.exports = async function (context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, context.packager.appInfo.productFilename + '.app')
  console.log('  • ad-hoc ky sau toan bo app: ' + app)
  // Ky bottom-up (nested binaries -> bundle). --deep: ky ca python nhung + .so/.dylib + helpers.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' })
  // Kiem: phai hop le thi may tai ve moi khong bao "bi hong"
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=1', app], { stdio: 'inherit' })
  console.log('  • chu ky ad-hoc hop le.')
}
