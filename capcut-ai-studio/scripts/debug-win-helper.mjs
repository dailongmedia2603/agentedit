// CHAN DOAN script cai de Windows (WIN_APPLY_PS1) — chay tren may Windows / CI, KHONG can build app:
//   node --experimental-strip-types scripts/debug-win-helper.mjs
// Gia lap dung cach app goi: tien trinh cha (app) spawn PowerShell TACH ROI roi THOAT NGAY; bo cai gia (.cmd ghi file),
// "app" gia = node ghi dau khoi dong. In nhat ky script + loi PowerShell (neu co).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const C = await import('../electron/services/update-core.ts')
const dir = mkdtempSync(join(tmpdir(), 'ae dbg '))
const ps1 = join(dir, 'apply.ps1')
writeFileSync(ps1, '\ufeff' + C.WIN_APPLY_PS1, 'utf-8')
const log = join(dir, 'apply.log')
const marker = join(dir, 'launched.ok')
const inst = join(dir, 'Agent Edit')
const ranSetup = join(dir, 'setup-ran.txt')
// bo cai gia: ghi tham so nhan duoc
const setup = join(dir, 'fake-setup.cmd')
writeFileSync(setup, `@echo off\r\necho %* > "${ranSetup}"\r\nexit /b 0\r\n`)
// "app" gia: ghi marker
const fakeApp = join(dir, 'fakeapp.cmd')
writeFileSync(fakeApp, `@echo off\r\necho started %* > "${marker}"\r\n`)
const psExe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

// 1) soat cu phap bang PowerShell 5.1 that
const parse = spawnSync(psExe, ['-NoProfile', '-Command', `$e=$null; $null=[System.Management.Automation.Language.Parser]::ParseFile('${ps1}',[ref]$null,[ref]$e); if ($e) { $e | % { $_.ToString() } } else { 'PARSE OK' }`], { encoding: 'utf-8' })
console.log('[1] parse:', (parse.stdout + parse.stderr).trim())

// 2) goi giong app: cha spawn PS tach roi (stdio ignore, windowsHide) roi thoat ngay
const b64 = (s) => Buffer.from(s, 'utf-8').toString('base64')
const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1,
  '-AppPid', '999999', '-Setup', setup, '-InstDir', inst, '-Exe', fakeApp, '-Log', log, '-Marker', marker,
  '-FromVer', '1.2.2+20261008-1500', '-ToVer', '1.3.0+20261009-1530', '-ArgsB64', b64(JSON.stringify(['--user-data-dir=C:\\a b\\c', '--x'])), '-MsgB64', b64('Lỗi thử')]
const parentCode = `const {spawn}=require('child_process');const c=spawn(${JSON.stringify(psExe)},${JSON.stringify(args)},{detached:true,stdio:'ignore',windowsHide:true});c.on('spawn',()=>{c.unref();process.exit(0)});c.on('error',e=>{console.log('SPAWN ERR',e.message);process.exit(1)})`
const parent = spawnSync(process.execPath, ['-e', parentCode], { encoding: 'utf-8' })
console.log('[2] cha thoat:', parent.status, (parent.stdout || '').trim())
const t0 = Date.now()
while (Date.now() - t0 < 60000 && !existsSync(marker)) await new Promise((r) => setTimeout(r, 1000))
await new Promise((r) => setTimeout(r, 3000))
console.log('[2] bo cai gia chay:', existsSync(ranSetup) ? readFileSync(ranSetup, 'utf-8').trim() : 'KHONG')
console.log('[2] app gia mo:', existsSync(marker) ? readFileSync(marker, 'utf-8').trim() : 'KHONG')
console.log('[2] apply.log:\n' + (existsSync(log) ? readFileSync(log, 'utf-8') : '(khong co)'))

// 3) neu (2) khong chay: chay lai CO stdout/stderr de thay loi PowerShell
if (!existsSync(marker)) {
  const r = spawnSync(psExe, args, { encoding: 'utf-8', timeout: 90000 })
  console.log('[3] chay truc tiep: ma', r.status, '\nstdout:', r.stdout, '\nstderr:', r.stderr)
  console.log('[3] apply.log:\n' + (existsSync(log) ? readFileSync(log, 'utf-8') : '(khong co)'))
}
void spawn
