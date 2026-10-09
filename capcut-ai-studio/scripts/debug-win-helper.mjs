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

// 2) nhieu cach goi TACH ROI (cha thoat ngay sau khi spawn) — moi cach 1 bo log/marker rieng
const b64 = (x) => Buffer.from(x, 'utf-8').toString('base64')
const sysRoot = process.env.SystemRoot || 'C:\\Windows'
function mkArgs(tag, extraPs = []) {
  return {
    log: join(dir, `apply-${tag}.log`),
    marker: join(dir, `m-${tag}.ok`),
    ps: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...extraPs, '-File', ps1,
      '-AppPid', '999999', '-Setup', setup, '-InstDir', inst, '-Exe', join(dir, `app-${tag}.cmd`), '-Log', join(dir, `apply-${tag}.log`), '-Marker', join(dir, `m-${tag}.ok`),
      '-FromVer', '1.2.2+20261008-1500', '-ToVer', '1.3.0+20261009-1530', '-ArgsB64', b64(JSON.stringify(['--user-data-dir=C:\\a b\\c', '--x'])), '-MsgB64', b64('Lỗi thử')]
  }
}
const variants = {
  A_app_hien_tai: { opts: { detached: true, stdio: 'ignore', windowsHide: true }, extra: ['-WindowStyle', 'Hidden'] },
  B_khong_windowstyle: { opts: { detached: true, stdio: 'ignore', windowsHide: true }, extra: [] },
  C_detached_khong_hide: { opts: { detached: true, stdio: 'ignore' }, extra: ['-WindowStyle', 'Hidden'] },
  D_khong_detached: { opts: { stdio: 'ignore', windowsHide: true }, extra: ['-WindowStyle', 'Hidden'] },
  E_qua_cmd_start: { viaCmd: true, opts: { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }, extra: ['-WindowStyle', 'Hidden'] }
}
for (const [tag, v] of Object.entries(variants)) {
  const a = mkArgs(tag, v.extra)
  writeFileSync(join(dir, `app-${tag}.cmd`), `@echo off\r\necho started %* > "${a.marker}"\r\n`)
  let cmd = psExe
  let args = a.ps
  if (v.viaCmd) {
    const q = (x) => (/[\s"]/.test(x) ? '"' + x.replace(/"/g, '\\"') + '"' : x)
    cmd = join(sysRoot, 'System32', 'cmd.exe')
    args = ['/d /s /c "start "" /min ' + [psExe, ...a.ps].map(q).join(' ') + '"']
  }
  const code = `const {spawn}=require('child_process');const c=spawn(${JSON.stringify(cmd)},${JSON.stringify(args)},${JSON.stringify(v.opts)});c.on('spawn',()=>{c.unref();process.exit(0)});c.on('error',e=>{console.log('SPAWN ERR',e.message);process.exit(1)})`
  const parent = spawnSync(process.execPath, ['-e', code], { encoding: 'utf-8' })
  const t0 = Date.now()
  while (Date.now() - t0 < 30000 && !existsSync(a.marker)) await new Promise((r) => setTimeout(r, 500))
  console.log(`[2] ${tag}: cha=${parent.status} ${String(parent.stdout || '').trim()} | app gia mo=${existsSync(a.marker)} | log=${existsSync(a.log) ? readFileSync(a.log, 'utf-8').replace(/\r?\n/g, ' / ').slice(0, 200) : '(khong co)'}`)
}
void spawn
