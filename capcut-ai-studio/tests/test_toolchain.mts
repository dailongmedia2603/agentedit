// Test bo cai cong cu cua Doctor (electron/services/toolchain.ts). Chay (Node >= 23, tu thu muc capcut-ai-studio):
//   HOME=$(mktemp -d) node tests/test_toolchain.mts
// HOME tam: moi thu cai vao ~/.capcut-studio/tools/bin cua HOME do.
//
// Can dam bao:
//  1. So phien ban: "codex-cli 0.156.1", "2.1.283 (Claude Code)"...; >= dung ca khi khac so chu so
//  2. Tai ve SAI ma SHA-256 -> nem loi + XOA file (khong bao gio dung file la); dung ma -> giu
//  3. ffmpeg: may da co DUNG ban ghim -> chep (khong tai); du bo ma hoa / bo loc; file bi sua -> "Sai ban"
//  4. Tim CLI: ban trong tools/bin cua app duoc uu tien hon ban o ~/.local/bin
import { register } from 'node:module'
import { createHash as nodeHash } from 'crypto'
import { appendFileSync, chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'fs'
import { createServer } from 'http'
import { homedir } from 'os'
import { join, resolve } from 'path'

register('./helpers/electron-mock-loader.mjs', import.meta.url)
const T = await import('../electron/services/toolchain.ts')
const { TOOLS_BIN } = await import('../electron/services/paths.ts')

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)))
  if (!cond) FAILS.push(name)
}

const HOME = homedir()
if (!HOME.includes('tmp') && !HOME.includes('/T/') && !HOME.startsWith('/var/folders')) {
  console.log('Chay voi HOME tam: HOME=$(mktemp -d) node tests/test_toolchain.mts')
  process.exit(2)
}

console.log('[1] phien ban')
check('doc "codex-cli 0.156.1"', JSON.stringify(T.parseVersion('codex-cli 0.156.1')) === '[0,156,1]')
check('doc "2.1.283 (Claude Code)"', JSON.stringify(T.parseVersion('2.1.283 (Claude Code)')) === '[2,1,283]')
check('0.157.0 >= 0.156.1', T.versionGte('0.157.0', '0.156.1'))
check('0.156.1 >= 0.156.1', T.versionGte('0.156.1', '0.156.1'))
check('0.99.9 < 0.156.1 (so, khong phai chu)', !T.versionGte('0.99.9', '0.156.1'))
check('2.1.28 < 2.1.283', !T.versionGte('2.1.28', '2.1.283'))
check('khong doc duoc -> chua dat', !T.versionGte(null, '1.0.0') && !T.versionGte('abc', '1.0.0'))
check('macOS 26.3.0 >= 14.0', T.versionGte('26.3.0', T.manifest().macos_min))

console.log('[2] tai + kiem SHA-256')
const body = Buffer.from('noi dung that '.repeat(1000))
const srv = createServer((_req, res) => {
  res.writeHead(200, { 'content-length': body.length })
  res.end(body)
})
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/f.bin`
const good = createHash(body)
mkdirSync(join(HOME, 'dl'), { recursive: true })
const logs: string[] = []
await T.download(url, join(HOME, 'dl', 'ok.bin'), (l) => logs.push(l), good)
check('dung ma -> giu file', existsSync(join(HOME, 'dl', 'ok.bin')))
check('bao da kiem SHA-256', logs.some((l) => l.includes('khớp')), logs)
let err = ''
try {
  await T.download(url, join(HOME, 'dl', 'bad.bin'), () => {}, '0'.repeat(64))
} catch (e) {
  err = String(e)
}
check('sai ma -> nem loi', err.includes('không khớp'), err)
check('sai ma -> XOA file vua tai', !existsSync(join(HOME, 'dl', 'bad.bin')))
check('sai ma -> tai lai tu dau 3 luot roi moi bao loi', err.includes('sau 3 lượt'), err)
srv.close()

// mang chap chon: lan dau may chu cat ket noi giua chung -> tai TIEP bang Range, van kiem dung ma
const big = Buffer.alloc(300000, 7)
for (const ranged of [true, false]) {
  let hits = 0
  const flaky = createServer((req, res) => {
    hits++
    const m = /bytes=(\d+)-/.exec(String(req.headers.range || ''))
    if (hits === 1) {
      res.writeHead(200, { 'content-length': big.length })
      res.write(big.subarray(0, 120000))
      setTimeout(() => res.socket?.destroy(), 50)          // dut giua chung
      return
    }
    if (m && ranged) {
      const from = Number(m[1])
      res.writeHead(206, { 'content-length': big.length - from, 'content-range': `bytes ${from}-${big.length - 1}/${big.length}` })
      res.end(big.subarray(from))
    } else {
      res.writeHead(200, { 'content-length': big.length })
      res.end(big)
    }
  })
  await new Promise<void>((r) => flaky.listen(0, '127.0.0.1', () => r()))
  const furl = `http://127.0.0.1:${(flaky.address() as { port: number }).port}/big.bin`
  const fl: string[] = []
  let ferr = ''
  try {
    await T.download(furl, join(HOME, 'dl', `big-${ranged}.bin`), (l) => fl.push(l), createHash(big))
  } catch (e) {
    ferr = String(e)
  }
  check(`bi ngat giua chung -> ${ranged ? 'tai TIEP (Range)' : 'may chu khong cho Range -> tai lai tu dau'}, dung ma`,
        !ferr && fl.some((l) => l.includes('tải tiếp')) && fl.some((l) => l.includes('khớp')) &&
        (ranged || fl.some((l) => l.includes('từ đầu'))), { ferr, fl })
  flaky.close()
}

console.log('[3] ffmpeg ban ghim')
const st0 = await T.ffmpegStatus()
check('chua cai -> chua dat', !st0.ok && st0.detail.includes('Chưa cài'), st0)
// ban static_ffmpeg cu cua may (venv CapCutAPI) chinh la ban ghim -> dung lam "may da co san", khong tai mang
const legacy = resolve('../CapCutAPI/.venv/lib/python3.12/site-packages/static_ffmpeg/bin/darwin_arm64')
if (existsSync(join(legacy, 'ffmpeg'))) {
  mkdirSync(join(HOME, '.local', 'bin'), { recursive: true })
  symlinkSync(join(legacy, 'ffmpeg'), join(HOME, '.local', 'bin', 'ffmpeg'))
  symlinkSync(join(legacy, 'ffprobe'), join(HOME, '.local', 'bin', 'ffprobe'))
  const stL = await T.ffmpegStatus()
  check('may da co dung ban -> bao se CHEP sang (khong tai)', !stL.ok && stL.detail.includes('chép sang') && stL.detail.includes('không tải'), stL)
  const il: string[] = []
  await T.installFfmpeg((l) => il.push(l))
  check('may da co dung ban -> chep, khong tai', il.some((l) => l.includes('không tải lại')) && !il.some((l) => l.startsWith('Tải ')), il)
  const st1 = await T.ffmpegStatus()
  check('sau khi cai: dung ban ghim, chay duoc', st1.ok && st1.found === T.manifest().ffmpeg.version, st1)
  check('du bo ma hoa + bo loc app dung', (await T.ffmpegFeatures()).length === 0, await T.ffmpegFeatures())
  appendFileSync(join(TOOLS_BIN, 'ffprobe'), 'x')
  const st2 = await T.ffmpegStatus()
  check('file bi sua -> "Sai ban", chua dat', !st2.ok && st2.detail.includes('Sai bản') && st2.detail.includes('ffprobe'), st2)
} else {
  console.log('  (bo qua: may khong co ban static_ffmpeg de chep)')
}

console.log('[4] tim CLI: ban cua app truoc')
const mk = (dir: string, name: string) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), '#!/bin/sh\necho "codex-cli 0.1.0"\n')
  chmodSync(join(dir, name), 0o755)
}
mk(join(HOME, '.local', 'bin'), 'codex-test')
check('chi co ~/.local/bin -> tim thay o do', T.findCli('codex-test') === join(HOME, '.local', 'bin', 'codex-test'))
mk(TOOLS_BIN, 'codex-test')
check('co ca tools/bin -> uu tien ban cua app', T.findCli('codex-test') === join(TOOLS_BIN, 'codex-test'))
check('doc phien ban CLI', (await T.cliVersion(join(TOOLS_BIN, 'codex-test'))) === 'codex-cli 0.1.0')

function createHash(b: Buffer): string {
  return nodeHash('sha256').update(b).digest('hex')
}

console.log(FAILS.length ? `\nFAIL ${FAILS.length}: ${FAILS.join(', ')}` : '\nTAT CA PASS')
process.exit(FAILS.length ? 1 : 0)
