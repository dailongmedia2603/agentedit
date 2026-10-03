// Chup build/dmg/background.html -> build/background.png (660x480) + build/background@2x.png (1320x960)
// bang Chrome headless. electron-builder tu thay 2 file nay (dmg-builder computeBackground) va ghep thanh
// .tiff retina; cua so DMG lay dung kich thuoc nen. Chi chay lai khi sua background.html:
//   node scripts/make-dmg-background.mjs
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const html = pathToFileURL(join(root, 'build', 'dmg', 'background.html')).href
const chrome = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find((p) => p && existsSync(p))
if (!chrome) throw new Error('Khong thay Chrome — dat CHROME_PATH')

for (const [scale, name] of [[1, 'background.png'], [2, 'background@2x.png']]) {
  const out = join(root, 'build', name)
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--window-size=660,480', `--force-device-scale-factor=${scale}`, `--screenshot=${out}`, html,
  ], { stdio: 'ignore' })
  console.log('  • ' + out)
}
