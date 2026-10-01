// Bien dich 1 file JS (da lam roi) -> bytecode V8 (.jsc) bang bytenode.
// PHAI chay duoi Electron-as-Node (ELECTRON_RUN_AS_NODE=1 <electron> ...) de bytecode khop dung
// phien ban V8 cua Electron dang ship (.jsc khoa theo V8). Duoc scripts/protect-electron.mjs goi.
// Dung: <electron-as-node> scripts/bytenode-compile.cjs <input.js> <output.jsc>
const bytenode = require('bytenode')
const [, , input, output] = process.argv
if (!input || !output) {
  console.error('usage: bytenode-compile.cjs <input.js> <output.jsc>')
  process.exit(2)
}
bytenode.compileFile({ filename: input, output, compileAsModule: true, electron: true })
console.log('[bytenode] ' + input + ' -> ' + output)
