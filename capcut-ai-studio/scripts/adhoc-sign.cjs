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
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

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
  console.log('  • ad-hoc ky sau toan bo app: ' + app)
  // Ky bottom-up (nested binaries -> bundle). --deep: ky ca python nhung + .so/.dylib + helpers.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' })
  // Kiem: phai hop le thi may tai ve moi khong bao "bi hong"
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=1', app], { stdio: 'inherit' })
  console.log('  • chu ky ad-hoc hop le.')
}
