// Bao ve ma Electron phia BE (main / preload / remotion-worker — gom ca contract IPC):
//   1) LAM ROI (javascript-obfuscator): string array + doi ten dinh danh + control-flow (vua phai).
//   2) BIEN DICH bytecode V8 (.jsc) bang bytenode, chay duoi Electron-as-Node (khop V8 dang ship).
//   3) Thay file .js goc bang STUB nho nap bytenode + require('./<ten>.jsc').
// Chay trong `npm run dist` SAU `electron-vite build`.
//
// LUU Y: KHONG bat selfDefending / debugProtection / renameGlobals (lam hong Electron). __dirname
// van dung (bytenode dat theo vi tri .jsc = out/main). bytenode nam trong dependencies -> co trong asar.
import JavaScriptObfuscator from 'javascript-obfuscator'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'out')
const electronBin = require('electron')
const compileHelper = join(root, 'scripts', 'bytenode-compile.cjs')
const log = (...a) => console.log('[protect-electron]', ...a)

// File BE can bao ve (deu la CJS do electron-vite build ra)
const TARGETS = [
  join(out, 'main', 'index.js'),
  join(out, 'main', 'remotion-worker.js'),
  join(out, 'preload', 'index.js')
]

const OBFUSCATE_OPTS = {
  target: 'node',
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: false,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: false,
  simplify: true,
  transformObjectKeys: false,
  // BAT BUOC tat: lam hong khi chay duoi Electron / bytecode
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  renameGlobals: false
}

function stub(jscName) {
  return `'use strict';\nrequire('bytenode');\nmodule.exports = require('./${jscName}');\n`
}

let done = 0
for (const file of TARGETS) {
  if (!existsSync(file)) {
    log(`Bo qua (khong thay): ${file}`)
    continue
  }
  const dir = dirname(file)
  const name = basename(file, '.js') // index / remotion-worker
  const src = readFileSync(file, 'utf-8')

  // 1) lam roi
  const obf = JavaScriptObfuscator.obfuscate(src, OBFUSCATE_OPTS).getObfuscatedCode()
  const obfPath = join(dir, name + '.obf.cjs')
  writeFileSync(obfPath, obf)

  // 2) bien dich .jsc duoi Electron-as-Node
  const jsc = join(dir, name + '.jsc')
  rmSync(jsc, { force: true })
  execFileSync(electronBin, [compileHelper, obfPath, jsc], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  if (!existsSync(jsc)) throw new Error('Khong tao duoc ' + jsc)
  rmSync(obfPath, { force: true })

  // 3) thay .js goc bang stub nap .jsc
  writeFileSync(file, stub(name + '.jsc'))
  log(`Bao ve xong: ${name}.js -> ${name}.jsc (+ stub)`)
  done++
}

if (!done) throw new Error('Khong bao ve duoc file BE nao — da chay `electron-vite build` chua?')
log(`Xong. Da bao ve ${done} file BE (obfuscate + bytenode).`)
