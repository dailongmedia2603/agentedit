// electron-builder hook `afterAllArtifactBuild`: gan ICON LOGO cho chinh FILE .dmg trong Finder.
// (Cau hinh dmg.icon chi dat icon cho DIA khi mount, khong dat icon cho file .dmg.)
// Dung cong cu macOS co san: sips + DeRez + Rez + SetFile. Khong co -> bo qua (khong chan build).
const { execFileSync } = require('node:child_process')
const { copyFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

module.exports = function (buildResult) {
  const icon = join(__dirname, '..', 'build', 'icon.icns')
  const dmgs = (buildResult.artifactPaths || []).filter((p) => p.endsWith('.dmg'))
  for (const dmg of dmgs) {
    try {
      const tmpIcns = join(tmpdir(), 'dmg-icon-' + Date.now() + '.icns')
      const tmpRsrc = tmpIcns + '.rsrc'
      copyFileSync(icon, tmpIcns)
      execFileSync('sips', ['-i', tmpIcns], { stdio: 'ignore' })
      const rsrc = execFileSync('DeRez', ['-only', 'icns', tmpIcns], { maxBuffer: 64 * 1024 * 1024 })
      require('node:fs').writeFileSync(tmpRsrc, rsrc)
      execFileSync('Rez', ['-append', tmpRsrc, '-o', dmg])
      execFileSync('SetFile', ['-a', 'C', dmg])
      rmSync(tmpIcns, { force: true })
      rmSync(tmpRsrc, { force: true })
      console.log('  • da gan icon logo cho file .dmg: ' + dmg)
    } catch (e) {
      console.warn('  • khong gan duoc icon cho .dmg (bo qua): ' + String(e).slice(0, 120))
    }
  }
  return []
}
