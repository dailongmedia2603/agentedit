// Test dang nhap agy / Claude Code NGAY TRONG APP (electron/services/cli-login.ts) bang CLI GIA — khong mo trinh duyet,
// khong dung tai khoan that. Chay (Node >= 23, tu capcut-ai-studio):  HOME=$(mktemp -d) node tests/test_cli_login.mts
//  1. agy: ghi file phien roi treo (nhu agy that dang tra loi prompt) -> app tu dung tien trinh, bao THANH CONG
//  2. agy: KHONG duoc nhan bien SSH_* (bien do bat che do "in link + dan ma", khong tu xong)
//  3. claude: cho ma qua stdin -> sendCliInput gui ma -> CLI thoat 0 -> thanh cong; ma co xuong dong bi tu choi
//  4. Huy giua chung -> canceled
//  5. Dang xuat: codex logout / claude auth logout / agy -i /logout (HOME tam -> Keychain khong co phien agy)
//  macOS: agy chay trong pseudo-terminal (agy >= 1.2.16 khong TTY thi khong bat dau dang nhap)
//  (Windows: agy chay o cua so rieng — agyWindow — khong test bang CLI gia duoc; phan nay chi macOS / POSIX)
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

if (process.platform === 'win32') {
  console.log('(Windows: bo qua [1] — agy dang nhap bang cua so rieng thu nho)')
}
console.log('[1] agy: co file phien -> dung som, thanh cong')
const tokDir = join(HOME, '.gemini', 'antigravity-cli')
const agy = fake('agy', `
const fs = require('fs'), path = require('path'), os = require('os')
fs.writeFileSync(path.join(os.homedir(), 'agy-env.json'), JSON.stringify({ ssh: process.env.SSH_CONNECTION || null, args: process.argv.slice(2), tty: !!process.stdout.isTTY && !!process.stdin.isTTY, noUpdate: process.env.AGY_CLI_DISABLE_AUTO_UPDATE || null }))
if (process.argv[2] === '-i') { setInterval(() => {}, 1000); return }
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
check('macOS: app TU MO link dang nhap 1 lan (agy -p khong tu mo)', (globalThis as any).__OPENED?.length === 1 &&
      (globalThis as any).__OPENED[0].startsWith('https://accounts.google.com/'), (globalThis as any).__OPENED)
const env1 = JSON.parse(readFileSync(join(HOME, 'agy-env.json'), 'utf-8'))
check('KHONG truyen SSH_CONNECTION cho agy', env1.ssh === null, env1)
check('chay agy -p (che do in, khong giao dien)', env1.args[0] === '-p' && env1.args.includes('json'), env1.args)
check('file phien that su co', existsSync(join(tokDir, 'antigravity-oauth-token')))
if (process.platform === 'darwin') check('macOS: agy chay trong TTY (pseudo-terminal)', env1.tty === true, env1)
check('agy KHONG tu cap nhat khi app goi (AGY_CLI_DISABLE_AUTO_UPDATE=true — agy chi nhan "true")', env1.noUpdate === 'true', env1)

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

console.log('[4] dang xuat')
const codex = fake('codex', `
require('fs').writeFileSync(require('path').join(require('os').homedir(), 'codex-args.json'), JSON.stringify(process.argv.slice(2)))
console.log('Successfully logged out')
`)
const r4 = await L.startCliLogout('gpt', codex, '', () => {})
check('codex: chay `codex logout`', r4.ok && JSON.parse(readFileSync(join(HOME, 'codex-args.json'), 'utf-8')).join(' ') === 'logout', r4)
const claudeOut = fake('claude', `
require('fs').writeFileSync(require('path').join(require('os').homedir(), 'claude-args.json'), JSON.stringify({ args: process.argv.slice(2), key: process.env.ANTHROPIC_API_KEY || null }))
console.log('Successfully logged out from your Anthropic account.')
`)
process.env.ANTHROPIC_API_KEY = 'sk-test'
const r5 = await L.startCliLogout('claude', claudeOut, '', () => {})
const c5 = JSON.parse(readFileSync(join(HOME, 'claude-args.json'), 'utf-8'))
check('claude: chay `claude auth logout`, bo ANTHROPIC_API_KEY', r5.ok && c5.args.join(' ') === 'auth logout' && c5.key === null, { r5, c5 })
if (!IS_WIN) {
  // HOME tam: Keychain khong co muc phien agy -> agy coi nhu da dang xuat ngay; file phien kieu cu bi don
  const t6 = Date.now()
  const r6 = await L.startCliLogout('gemini', agy, join(HOME, 'agy-work'), () => {})
  const env6 = JSON.parse(readFileSync(join(HOME, 'agy-env.json'), 'utf-8'))
  check('agy: chay giao dien day du `agy -i /logout` (khong -p: agy chan /logout o che do in)', env6.args.join(' ') === '-i /logout', env6)
  check('agy: het phien -> dung agy, bao thanh cong', r6.ok && Date.now() - t6 < 15000, r6)
  check('agy: don file phien kieu cu', !existsSync(join(tokDir, 'antigravity-oauth-token')))
}

console.log('[5] bao loi agy de hieu + ban agy khac ban da kiem')
const { manifest } = await import('../electron/services/toolchain.ts')
const tested = manifest().cli.agy.tested as string
const rawErr = "Error: authentication required. Run 'agy' to log in, then retry.\nerror: authentication failed or timed out\n{\"status\":\"ERROR\"}"
const same = L.agyFailureText(rawErr, tested, 'login')
check('co ghi ban da kiem trong toolchain.json', /^\d+\.\d+\.\d+$/.test(tested || ''), tested)
check('bo dong JSON tho, noi ro khong mo duoc buoc dang nhap', !same.includes('{') && same.includes('không mở bước đăng nhập'), same)
check('cung ban da kiem -> khong canh bao ban', !same.includes('app đã kiểm'), same)
const newer = L.agyFailureText(rawErr, '9.9.9', 'login')
check('ban khac -> noi ro ban + chi cach Terminal', newer.includes('bản 9.9.9') && newer.includes(tested) && newer.includes('Mở cửa sổ'), newer)
const out = L.agyFailureText('boom', '9.9.9', 'logout')
check('dang xuat loi + ban khac -> chi /logout trong agy', out.includes('/logout'), out)
check('ma sai -> bao ma het han', L.agyFailureText('token exchange failed: oauth2: "invalid_grant"', tested, 'login').includes('Mã đăng nhập'))

console.log(FAILS.length ? `\nFAIL ${FAILS.length}: ${FAILS.join(', ')}` : '\nTAT CA PASS')
process.exit(FAILS.length ? 1 : 0)
