// Test dang nhap agy / Claude Code NGAY TRONG APP (electron/services/cli-login.ts) bang CLI GIA — khong mo trinh duyet,
// khong dung tai khoan that. Chay (Node >= 23, tu capcut-ai-studio):  HOME=$(mktemp -d) node tests/test_cli_login.mts
//  1. agy: ghi file phien roi treo (nhu agy that dang tra loi prompt) -> app tu dung tien trinh, bao THANH CONG
//  2. agy: KHONG duoc nhan bien SSH_* (bien do bat che do "in link + dan ma", khong tu xong)
//  3. claude: cho ma qua stdin -> sendCliInput gui ma -> CLI thoat 0 -> thanh cong; ma co xuong dong bi tu choi
//  4. Huy giua chung -> canceled
import { register } from 'node:module'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

register('./helpers/electron-mock-loader.mjs', import.meta.url)
const L = await import('../electron/services/cli-login.ts')

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)))
  if (!cond) FAILS.push(name)
}
const HOME = homedir()
const H = HOME.replace(/\\/g, '/').toLowerCase()
if (!H.includes('tmp') && !H.includes('/t/') && !H.includes('/temp/') && !H.startsWith('/var/folders')) {
  console.log('Chay voi HOME tam: HOME=$(mktemp -d) node tests/test_cli_login.mts')
  process.exit(2)
}
const IS_WIN = process.platform === 'win32'
const bin = join(HOME, 'fakebin')
mkdirSync(bin, { recursive: true })
// CLI gia = script Node (Windows: .cmd goi node)
function fake(name: string, js: string): string {
  const src = join(bin, name + '.js')
  writeFileSync(src, js)
  if (IS_WIN) {
    const p = join(bin, name + '.cmd')
    writeFileSync(p, `@"${process.execPath}" "${src}" %*\r\n`)
    return p
  }
  const p = join(bin, name)
  writeFileSync(p, `#!/bin/sh\nexec "${process.execPath}" "${src}" "$@"\n`)
  chmodSync(p, 0o755)
  return p
}

console.log('[1] agy: co file phien -> dung som, thanh cong')
const tokDir = join(HOME, '.gemini', 'antigravity-cli')
const agy = fake('agy', `
const fs = require('fs'), path = require('path'), os = require('os')
fs.writeFileSync(path.join(os.homedir(), 'agy-env.json'), JSON.stringify({ ssh: process.env.SSH_CONNECTION || null, args: process.argv.slice(2) }))
console.log('Authentication required. Please visit the URL to log in:')
console.log('  https://accounts.google.com/o/oauth2/auth?client_id=x&state=y')
console.log('Waiting for authentication (timeout 60s)...')
setTimeout(() => { const d = path.join(os.homedir(), '.gemini', 'antigravity-cli'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'antigravity-oauth-token'), 'x') }, 1500)
setInterval(() => {}, 1000)   // treo nhu agy that dang goi model
`)
process.env.SSH_CONNECTION = '127.0.0.1 22 127.0.0.1 22'
const lines: string[] = []
const t0 = Date.now()
const r1 = await L.startAgyLogin(agy, join(HOME, 'agy-work'), (l) => lines.push(l))
check('thanh cong khi da co file phien', r1.ok, r1)
check('dung som (khong cho het gio)', Date.now() - t0 < 15000, Date.now() - t0)
check('chuyen link dang nhap ra log', lines.some((l) => l.includes('accounts.google.com')), lines)
const env1 = JSON.parse(readFileSync(join(HOME, 'agy-env.json'), 'utf-8'))
check('KHONG truyen SSH_CONNECTION cho agy', env1.ssh === null, env1)
check('chay agy -p (che do in, khong giao dien)', env1.args[0] === '-p' && env1.args.includes('json'), env1.args)
check('file phien that su co', existsSync(join(tokDir, 'antigravity-oauth-token')))

console.log('[2] claude: dan ma qua stdin')
const claude = fake('claude', `
console.log('Opening browser to sign in…')
console.log('If the browser didn\\'t open, visit: https://claude.com/cai/oauth/authorize?code=true')
process.stdout.write('Paste code here if prompted > ')
process.stdin.on('data', (d) => { if (String(d).trim() === 'MA-123') { console.log('Login successful.'); process.exit(0) } else { console.log('sai ma'); process.exit(3) } })
`)
const cl: string[] = []
const p2 = L.startClaudeLogin(claude, (l) => cl.push(l))
await new Promise((r) => setTimeout(r, 800))
check('tu choi ma co xuong dong', L.sendCliInput('a\nb') === false)
check('gui ma', L.sendCliInput('MA-123') === true)
const r2 = await p2
check('claude thoat 0 sau khi nhan ma -> thanh cong', r2.ok, { r2, cl })
check('khong con tien trinh -> gui ma bi tu choi', L.sendCliInput('x') === false)

console.log('[3] huy giua chung')
const p3 = L.startClaudeLogin(claude, () => {})
await new Promise((r) => setTimeout(r, 600))
L.cancelCliTask()
const r3 = await p3
check('huy -> canceled', !r3.ok && r3.canceled, r3)

console.log(FAILS.length ? `\nFAIL ${FAILS.length}: ${FAILS.join(', ')}` : '\nTAT CA PASS')
process.exit(FAILS.length ? 1 : 0)
