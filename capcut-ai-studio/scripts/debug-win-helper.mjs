// CHAN DOAN bo cai NSIS + script cai de Windows (WIN_APPLY_PS1 lay TU MA NGUON) tren may CI, khong build lai app:
//   node --experimental-strip-types scripts/debug-win-helper.mjs      (can release/*-Setup-*.exe)
// 1) cai im lang that  2) mo app da cai (user-data-dir tam)  3) chay script cai de giong app (qua cmd start, cwd tach rieng)
// voi PID app that -> app bi dung, bo cai chay /S --updated, mo lai app  4) in nhat ky + tien trinh + thu muc cai.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const C = await import('../electron/services/update-core.ts')
const root = resolve(import.meta.dirname, '..')
const setupName = readdirSync(join(root, 'release')).find((f) => /-Setup-.*\.exe$/.test(f))
if (!setupName) throw new Error('khong co release/*-Setup-*.exe')
const setup = join(root, 'release', setupName)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ps = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf-8' })
const procs = () => ps("Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'Agent|Setup|Un_|Au_|python|powershell' } | ForEach-Object { $_.Name + ' ' + $_.ProcessId + ' cha=' + $_.ParentProcessId + ' ' + ($_.CommandLine -replace '\\s+', ' ').Substring(0, [Math]::Min(160, ($_.CommandLine + '').Length)) }")

console.log('[1] cai im lang', setupName)
let t0 = Date.now()
execFileSync(setup, ['/S'], { stdio: 'inherit', timeout: 15 * 60000 })
console.log(`    xong sau ${Math.round((Date.now() - t0) / 1000)}s`)
let inst = ''
try {
  inst = ps("Get-ItemProperty HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Agent Edit*' } | ForEach-Object { $_.UninstallString }").trim()
  console.log('    UninstallString:', inst)
  inst = (/"([^"]+)\\[^\\"]+\.exe"/.exec(inst) || [])[1] || ''
} catch {}
if (!inst) inst = join(process.env.LOCALAPPDATA || '', 'Programs', 'Agent Edit')
const exe = join(inst, 'Agent Edit.exe')
console.log('    thu muc cai:', inst, '| co exe:', existsSync(exe))

const work = mkdtempSync(join(tmpdir(), 'aedbg-'))
const ud = join(work, 'ud')
console.log('[2] mo app da cai')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = spawn(exe, [`--user-data-dir=${ud}`], { env, stdio: 'ignore', detached: true })
app.unref()
await sleep(15000)
console.log(procs())

console.log('[3] chay script cai de (giong updater.ts)')
const upd = join(work, 'updates')
execFileSync('cmd.exe', ['/c', 'mkdir', upd])
const ps1 = join(upd, 'apply.ps1')
writeFileSync(ps1, '\ufeff' + C.WIN_APPLY_PS1, 'utf-8')
const log = join(upd, 'apply.log')
const marker = join(upd, 'launched.ok')
const b64 = (x) => Buffer.from(x, 'utf-8').toString('base64')
const psExe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1,
  '-AppPid', String(app.pid), '-Setup', setup, '-InstDir', inst, '-Exe', exe, '-Log', log, '-Marker', marker,
  '-FromVer', 'x', '-ToVer', 'y', '-ArgsB64', b64(JSON.stringify([`--user-data-dir=${ud}`])), '-MsgB64', b64('loi thu')]
const q = (x) => '"' + x.replace(/"/g, '\\"') + '"'
const line = `/d /s /c "start "" /min ${[psExe, ...args].map(q).join(' ')}"`
spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), [line], { cwd: upd, detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref()
// app tu thoat nhu khi bam "Cap nhat" (o day dung tien trinh de mo phong)
await sleep(3000)
try {
  execFileSync('taskkill', ['/PID', String(app.pid)], { stdio: 'pipe' })
} catch {}
t0 = Date.now()
let last = ''
while (Date.now() - t0 < 20 * 60000) {
  const cur = existsSync(log) ? readFileSync(log, 'utf-8') : ''
  if (cur !== last) {
    process.stdout.write(cur.slice(last.length))
    last = cur
  }
  if (/OK: app da mo|LOI: app khong mo|khong thay app sau khi cai/.test(cur)) break
  await sleep(5000)
}
console.log('[4] tien trinh:\n' + procs())
console.log('[4] thu muc cai:', existsSync(inst) ? readdirSync(inst).join(', ') : '(mat)')
console.log('[4] marker:', existsSync(marker) ? readFileSync(marker, 'utf-8') : '(khong co)')
