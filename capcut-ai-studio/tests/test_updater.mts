// Test TU CAP NHAT (electron/services/update-core.ts + updater.ts). Chay (Node >= 23, tu thu muc capcut-ai-studio):
//   HOME=$(mktemp -d) node tests/test_updater.mts
//
// Can dam bao:
//  1. So phien ban: version truoc, bang nhau thi ma build ngay-gio; ma build sai dang = cu nhat
//  2. Phieu: chi nhan khi chu ky dung + dung nen tang + moi hon (tru tu kiem force); moi truong hong -> tu choi
//  3. Khoa ky ~/.capcut-studio/update-signing.json (neu co) KHOP UPDATE_PUB nhung trong app
//  4. macOS: script thay app (MAC_APPLY_SH) voi goi .app GIA: cho app cu thoat, dung tien trinh con trong goi, doi cho,
//     mo ban moi kem tham so cu + co updated; ban moi khong mo -> TRA BAN CU + mo ban cu voi co failed; thieu ban moi
//  5. updater.ts: tai nen (tai tiep khi rot mang giua chung = Range), kiem SHA-512 (sai -> loi, khong dung file),
//     giai nen + kiem chu ky ma (macOS) -> 'ready'; phieu cu / sai chu ky khong lam gian doan
import { register } from 'node:module'
import { execFileSync, spawn } from 'child_process'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { createServer } from 'http'
import { tmpdir } from 'os'
import { join } from 'path'

register('./helpers/electron-mock-loader.mjs', import.meta.url)
const C = await import('../electron/services/update-core.ts')

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)?.slice(0, 600)))
  if (!cond) FAILS.push(name)
}
const IS_MAC = process.platform === 'darwin'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

console.log('[1] so phien ban')
check('1.2.10 > 1.2.9 (so, khong phai chu)', C.compareRelease('1.2.10', '20260101-0000', '1.2.9', '20991231-2359') > 0)
check('1.3.0 > 1.2.99', C.compareRelease('1.3.0', '', '1.2.99', '') > 0)
check('cung version, build moi hon', C.compareRelease('1.2.3', '20261009-1530', '1.2.3', '20261009-1529') > 0)
check('cung version + build -> 0', C.compareRelease('1.2.3', '20261009-1530', '1.2.3', '20261009-1530') === 0)
check('build sai dang (-full) = cu nhat', C.compareRelease('1.2.3', '20261009-1530', '1.2.3', '20261009-1530-full') > 0)
check('version sai dang = 0.0.0', C.compareRelease('abc', '', '0.0.1', '') < 0)
check('ten file an toan', C.safeFileName('Agent-Edit-1.2.3-b20261009-1530-mac-arm64.zip'))
check('ten file co .. / thu muc -> tu choi', !C.safeFileName('../x.zip') && !C.safeFileName('a/b.zip') && !C.safeFileName('a..b') && !C.safeFileName('.x'))
check('relaunchArgs bo -psn_ va co cap nhat cu', JSON.stringify(C.relaunchArgs(['--user-data-dir=/x y', '-psn_0_123', '--agent-edit-updated=1', '--agent-edit-update-failed=2', '--a'])) === '["--user-data-dir=/x y","--a"]')

console.log('[2] kiem phieu')
const kp = generateKeyPairSync('ed25519')
const PUB = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')
const SHA = createHash('sha512').update('x').digest('base64')
const baseM = { v: 1, channel: 'stable', platform: process.platform, arch: process.arch, version: '1.3.0', build: '20261009-1530', file: 'Agent-Edit-1.3.0-b20261009-1530-mac-arm64.zip', size: 5 * 1048576, sha512: SHA, notes: 'Sửa lỗi ✓', released_at: 1 }
const mk = (patch: Record<string, unknown> = {}, key = kp.privateKey) => {
  const m = JSON.stringify({ ...baseM, ...patch })
  return { m, sig: sign(null, Buffer.from(m), key).toString('base64'), url: 'https://x.test/v1/update/f?t=1' }
}
const ctx = { platform: process.platform, arch: process.arch, version: '1.2.2', build: '20261008-1500', pub: PUB }
let v = C.verifyOffer(mk(), ctx)
check('phieu dung -> ok', v.ok && v.manifest.version === '1.3.0' && v.manifest.notes === 'Sửa lỗi ✓', v)
const good = mk()
v = C.verifyOffer({ ...good, m: good.m.replace('1.3.0', '1.3.1') }, ctx)
check('sua phieu sau khi ky -> chu ky sai', !v.ok && /Chữ ký/.test(v.error), v)
v = C.verifyOffer(mk({}, generateKeyPairSync('ed25519').privateKey), ctx)
check('ky bang khoa khac -> chu ky sai', !v.ok && /Chữ ký/.test(v.error), v)
v = C.verifyOffer(mk(), { ...ctx, pub: undefined })
check('khoa thu khong qua duoc UPDATE_PUB that', !v.ok, v)
v = C.verifyOffer(mk({ platform: process.platform === 'darwin' ? 'win32' : 'darwin' }), ctx)
check('khac he dieu hanh -> tu choi', !v.ok && /dành cho/.test(v.error), v)
v = C.verifyOffer(mk({ arch: 'ia32' }), ctx)
check('khac kien truc -> tu choi', !v.ok, v)
v = C.verifyOffer(mk({ version: '1.2.2', build: '20261008-1500' }), ctx)
check('cung ban dang chay -> notNewer', !v.ok && v.notNewer, v)
v = C.verifyOffer(mk({ version: '1.2.1' }), ctx)
check('ban cu hon (chong ha cap) -> notNewer', !v.ok && v.notNewer, v)
v = C.verifyOffer(mk({ version: '1.2.1' }), { ...ctx, force: true })
check('tu kiem force -> nhan ca ban khong moi hon', v.ok, v)
v = C.verifyOffer(mk({ file: '../../evil.zip' }), ctx)
check('ten file nguy hiem -> tu choi', !v.ok, v)
v = C.verifyOffer(mk({ sha512: 'abc' }), ctx)
check('sha512 sai dang -> tu choi', !v.ok, v)
v = C.verifyOffer(mk({ size: 10 }), ctx)
check('dung luong vo ly -> tu choi', !v.ok, v)
v = C.verifyOffer(mk({ build: 'hom-nay' }), ctx)
check('ma build sai dang -> tu choi', !v.ok, v)
v = C.verifyOffer({ ...mk(), url: 'file:///etc/passwd' }, ctx)
check('link khong phai http(s) -> tu choi', !v.ok, v)
v = C.verifyOffer({ m: 1 }, ctx)
check('phieu thieu truong -> tu choi', !v.ok, v)

console.log('[3] khoa ky that khop UPDATE_PUB')
// HOME tam -> doc khoa o HOME that cua may (neu co), chi doc
const realKey = join(process.env.REAL_HOME || '/Users/' + (process.env.USER || ''), '.capcut-studio', 'update-signing.json')
if (existsSync(realKey)) {
  const k = JSON.parse(readFileSync(realKey, 'utf-8'))
  check('update-signing.json pub == UPDATE_PUB', k.pub === C.UPDATE_PUB, { file: k.pub, app: C.UPDATE_PUB })
} else console.log('  (bo qua — may nay khong co ~/.capcut-studio/update-signing.json)')

// ---------------------------------------------------------------------------
// [4] script thay app macOS voi goi .app gia
// ---------------------------------------------------------------------------
/** Goi .app gia o <parent>/<name>; khi chay ghi tham so vao <out>/launched-<tag>.txt, ban moi ghi <out>/marker. */
function fakeApp(parent: string, name: string, tag: string, writeMarker: boolean, out: string): string {
  const dir = out
  const app = join(parent, name)
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
  mkdirSync(join(app, 'Contents', 'Resources'), { recursive: true })
  const id = 'test.agentedit.upd.' + Math.random().toString(36).slice(2)
  writeFileSync(
    join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>run</string><key>CFBundleIdentifier</key><string>${id}</string>
<key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.0.0</string><key>LSUIElement</key><true/></dict></plist>`
  )
  writeFileSync(join(app, 'Contents', 'Resources', 'TAG'), tag)
  // ghi tham so nhan duoc + (ban moi) ghi MARKER nhu main.ts
  writeFileSync(
    join(app, 'Contents', 'MacOS', 'run'),
    `#!/bin/bash\nprintf '%s\\n' "${tag}" "$@" > "${dir}/launched-${tag}.txt"\n` +
      (writeMarker ? `for a in "$@"; do case "$a" in --agent-edit-updated=*) echo ok > "${dir}/marker";; esac; done\n` : '') +
      'exit 0\n'
  )
  chmodSync(join(app, 'Contents', 'MacOS', 'run'), 0o755)
  return app
}
// chay BAT DONG BO: vong lap Node con chay moi don duoc tien trinh con da thoat (spawnSync -> "app cu" thanh zombie,
// kill -0 van thay song)
async function runApply(dir: string, app: string, newApp: string, pid: number, extraEnv: Record<string, string> = {}) {
  const script = join(dir, 'apply.sh')
  writeFileSync(script, C.MAC_APPLY_SH, { mode: 0o755 })
  const p = spawn(
    '/bin/bash',
    [script, String(pid), app, newApp, join(dir, 'stage', 'old.app'), join(dir, 'apply.log'), join(dir, 'marker'), '1.2.2+20261008-1500', '1.3.0+20261009-1530', 'Cần quyền quản trị', '--user-data-dir=/tmp/có dấu cách', '--x'],
    { env: { ...process.env, AE_UPD_EXIT_TRIES: '6', AE_UPD_MARKER_TRIES: '16', ...extraEnv }, stdio: 'ignore' }
  )
  const code = await new Promise<number | null>((r) => p.on('exit', (c) => r(c)))
  return { code, log: existsSync(join(dir, 'apply.log')) ? readFileSync(join(dir, 'apply.log'), 'utf-8') : '' }
}
const waitFile = async (f: string, ms = 8000) => {
  const t0 = Date.now()
  while (!existsSync(f) && Date.now() - t0 < ms) await sleep(100)
  return existsSync(f)
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

if (IS_MAC) {
  console.log('[4a] macOS: thay app thanh cong')
  {
    const dir = mkdtempSync(join(tmpdir(), 'upd-sh-'))
    const app = fakeApp(dir, 'Agent Edit.app', 'OLD', false, dir)
    mkdirSync(join(dir, 'stage'))
    const newApp = fakeApp(join(dir, 'stage'), 'Agent Edit.app', 'NEW', true, dir)
    // "app cu": tien trinh se tu thoat sau 1.5s; them 1 tien trinh con chay TU TRONG goi app (nhu python sidecar)
    const old = spawn('/bin/sleep', ['1.5'])
    cpSync('/bin/sleep', join(app, 'Contents', 'Resources', 'sleep-helper'))
    const helper = spawn(join(app, 'Contents', 'Resources', 'sleep-helper'), ['300'], { detached: true, stdio: 'ignore' })
    const r = await runApply(dir, app, newApp, old.pid!)
    const launched = (await waitFile(join(dir, 'launched-NEW.txt'))) ? readFileSync(join(dir, 'launched-NEW.txt'), 'utf-8').split('\n') : []
    check('script thoat 0', r.code === 0, r)
    check('app o vi tri cu la BAN MOI', readFileSync(join(app, 'Contents', 'Resources', 'TAG'), 'utf-8') === 'NEW')
    check('ban cu (backup) da xoa', !existsSync(join(dir, 'stage', 'old.app')))
    check('ban moi mo lai voi tham so cu (co dau cach) + co updated', launched.includes('--user-data-dir=/tmp/có dấu cách') && launched.includes('--x') && launched.includes('--agent-edit-updated=1.2.2+20261008-1500'), launched)
    check('tien trinh con trong goi app bi dung', !alive(helper.pid!), helper.pid)
    check('nhat ky ghi OK', /OK: ban moi da mo/.test(r.log), r.log)
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('[4b] macOS: ban moi KHONG mo duoc -> tra ban cu')
  {
    const dir = mkdtempSync(join(tmpdir(), 'upd-sh-'))
    const app = fakeApp(dir, 'Agent Edit.app', 'OLD', false, dir)
    mkdirSync(join(dir, 'stage'))
    const newApp = fakeApp(join(dir, 'stage'), 'Agent Edit.app', 'BROKEN', false, dir) // khong ghi marker
    const r = await runApply(dir, app, newApp, 999999)
    const launched = (await waitFile(join(dir, 'launched-OLD.txt'))) ? readFileSync(join(dir, 'launched-OLD.txt'), 'utf-8').split('\n') : []
    check('script thoat 1', r.code === 1, r)
    check('app o vi tri cu la BAN CU', readFileSync(join(app, 'Contents', 'Resources', 'TAG'), 'utf-8') === 'OLD')
    check('ban cu duoc mo lai voi co failed + tham so cu', launched.includes('--agent-edit-update-failed=1.3.0+20261009-1530') && launched.includes('--x'), launched)
    check('khong de lai ban hong', !existsSync(join(dir, 'stage', 'old.app.failed')) && !existsSync(join(dir, 'stage', 'old.app')))
    check('nhat ky ghi da tra ban cu', /da tra ban cu/.test(r.log), r.log)
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('[4c] macOS: thieu ban moi -> giu app, mo lai ban cu')
  {
    const dir = mkdtempSync(join(tmpdir(), 'upd-sh-'))
    const app = fakeApp(dir, 'Agent Edit.app', 'OLD', false, dir)
    mkdirSync(join(dir, 'stage'))
    const r = await runApply(dir, app, join(dir, 'stage', 'Agent Edit.app'), 999999)
    check('script thoat 1 + app con nguyen', r.code === 1 && readFileSync(join(app, 'Contents', 'Resources', 'TAG'), 'utf-8') === 'OLD', r)
    check('mo lai ban cu voi co failed', (await waitFile(join(dir, 'launched-OLD.txt'))) && readFileSync(join(dir, 'launched-OLD.txt'), 'utf-8').includes('--agent-edit-update-failed='))
    rmSync(dir, { recursive: true, force: true })
  }

  console.log('[4d] macOS: app cu treo khong thoat -> buoc dung roi moi thay')
  {
    const dir = mkdtempSync(join(tmpdir(), 'upd-sh-'))
    const app = fakeApp(dir, 'Agent Edit.app', 'OLD', false, dir)
    mkdirSync(join(dir, 'stage'))
    const newApp = fakeApp(join(dir, 'stage'), 'Agent Edit.app', 'NEW', true, dir)
    const hung = spawn('/bin/sleep', ['600'], { detached: true, stdio: 'ignore' })
    const r = await runApply(dir, app, newApp, hung.pid!)
    check('app treo bi dung', !alive(hung.pid!))
    check('van thay xong', r.code === 0 && readFileSync(join(app, 'Contents', 'Resources', 'TAG'), 'utf-8') === 'NEW', r)
    rmSync(dir, { recursive: true, force: true })
  }
} else console.log('[4] (bo qua — chi macOS; Windows kiem bang scripts/selftest-update.mjs tren ban dong goi)')

// ---------------------------------------------------------------------------
// [5] updater.ts: tai nen + tai tiep + kiem SHA + giai nen
// ---------------------------------------------------------------------------
console.log('[5] updater.ts — tai nen / tai tiep / kiem SHA-512 / chuan bi')
{
  const g = globalThis as Record<string, unknown>
  g.__USERDATA = mkdtempSync(join(tmpdir(), 'upd-ud-'))
  g.__PACKAGED = true
  g.__CLIENT_UI__ = true
  g.__APP_BUILD__ = '20261008-1500'
  g.__APP_VERSION = '1.2.2'
  const U = await import('../electron/services/updater.ts')
  const supported = (IS_MAC && process.arch === 'arm64') || (process.platform === 'win32' && process.arch === 'x64')
  if (!supported) console.log('  (bo qua — nen tang khong ho tro tu cap nhat)')
  else {
    U.initUpdater()
    check('ban cai khach dong goi -> updater bat', U.updaterEnabled() && U.updateState().phase === 'idle', U.updateState())

    // goi cap nhat: macOS = zip chua .app (bundle id + version dung, ky ad-hoc); Windows = file bat ky
    const work = mkdtempSync(join(tmpdir(), 'upd-pkg-'))
    let payload: Buffer
    if (IS_MAC) {
      const app = join(work, 'Agent Edit.app')
      mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
      writeFileSync(
        join(app, 'Contents', 'Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>run</string><key>CFBundleIdentifier</key><string>app.autocapcut.desktop</string>
<key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.3.0</string></dict></plist>`
      )
      // ~3 MB du lieu ngau nhien de co the cat giua chung
      writeFileSync(join(app, 'Contents', 'MacOS', 'run'), '#!/bin/bash\nexit 0\n')
      chmodSync(join(app, 'Contents', 'MacOS', 'run'), 0o755)
      mkdirSync(join(app, 'Contents', 'Resources'))
      writeFileSync(join(app, 'Contents', 'Resources', 'blob'), randomBytes(3 * 1048576)) // ngau nhien -> zip khong nho lai
      execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'pipe' })
      execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, join(work, 'u.zip')])
      payload = readFileSync(join(work, 'u.zip'))
    } else payload = randomBytes(3 * 1048576)

    // may chu: lan 1 cat ket noi giua chung (rot mang), lan sau tai tiep bang Range; ghi lai cac Range nhan duoc
    const ranges: string[] = []
    let mode: 'drop-once' | 'ok' | 'corrupt' = 'drop-once'
    let dropped = false
    const srv = createServer((req, res) => {
      ranges.push(String(req.headers.range || ''))
      const body = mode === 'corrupt' ? Buffer.from(payload).fill(1, 1000, 2000) : payload
      const m = /^bytes=(\d+)-$/.exec(String(req.headers.range || ''))
      const start = m ? Number(m[1]) : 0
      const part = body.subarray(start)
      res.writeHead(m ? 206 : 200, { 'content-length': part.length, 'accept-ranges': 'bytes', ...(m ? { 'content-range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}) })
      if (mode === 'drop-once' && !dropped) {
        dropped = true
        res.write(part.subarray(0, Math.floor(part.length / 2)), () => setTimeout(() => res.socket?.destroy(), 50))
        return
      }
      res.end(part)
    })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
    const port = (srv.address() as { port: number }).port
    const fname = IS_MAC ? 'Agent-Edit-1.3.0-b20261009-1530-mac-arm64.zip' : 'Agent-Edit-Setup-1.3.0-b20261009-1530-x64.exe'
    const shaOf = (b: Buffer) => createHash('sha512').update(b).digest('base64')
    // ky bang khoa THAT (UPDATE_PUB) neu co, khong thi bo qua phan nay
    let realSk: string | null = null
    try {
      realSk = JSON.parse(readFileSync(realKey, 'utf-8')).sk
    } catch {
      /* khong co */
    }
    if (!realSk) console.log('  (bo qua [5] tai — can ~/.capcut-studio/update-signing.json de ky phieu that)')
    else {
      const { createPrivateKey } = await import('crypto')
      const sk = createPrivateKey({ key: Buffer.from(realSk, 'base64'), format: 'der', type: 'pkcs8' })
      const offerFor = (version: string, build: string, sha: string) => {
        const m = JSON.stringify({ ...baseM, version, build, file: fname, size: payload.length, sha512: sha })
        return { m, sig: sign(null, Buffer.from(m), sk).toString('base64'), url: `http://127.0.0.1:${port}/f` }
      }
      const waitPhase = async (ok: (p: string) => boolean, ms = 60000) => {
        const t0 = Date.now()
        while (!ok(U.updateState().phase) && Date.now() - t0 < ms) await sleep(100)
        return U.updateState()
      }
      // SHA sai: may chu tra du lieu hong -> loi, khong 'ready'
      mode = 'corrupt'
      await U.handleOffer(offerFor('1.3.0', '20261009-1500', shaOf(payload)), false)
      let s = await waitPhase((p) => p === 'error' || p === 'ready')
      check('du lieu tai ve hong -> loi, khong san sang', s.phase === 'error' && /hỏng/.test(s.message || ''), s)
      check('file hong khong duoc giu', !existsSync(join(g.__USERDATA as string, 'updates', fname)))

      // phieu sai chu ky trong luc dang co ban -> bo qua (khong lam hong trang thai)
      mode = 'drop-once'
      ranges.length = 0
      await U.handleOffer(offerFor('1.3.0', '20261009-1530', shaOf(payload)), false)
      s = await waitPhase((p) => p === 'ready' || p === 'error')
      check('rot mang giua chung -> tai tiep bang Range -> san sang', s.phase === 'ready', { s, ranges })
      check('lan 2 xin Range tu giua file', ranges.length >= 2 && ranges[0] === '' && /^bytes=\d+-$/.test(ranges[1]), ranges)
      check('file tai ve dung SHA-512', existsSync(join(g.__USERDATA as string, 'updates', fname)) && shaOf(readFileSync(join(g.__USERDATA as string, 'updates', fname))) === shaOf(payload))
      if (IS_MAC) {
        const staged = join(g.__USERDATA as string, 'updates', 'stage-1.3.0-20261009-1530', 'Agent Edit.app')
        check('macOS: da giai nen + kiem chu ky ban moi', existsSync(join(staged, 'Contents', 'Info.plist')))
      }
      check('trang thai co ghi chu + dung luong', s.offer?.notes === 'Sửa lỗi ✓' && s.offer?.size === payload.length, s.offer)
      const bad = offerFor('1.4.0', '20261010-0000', shaOf(payload))
      await U.handleOffer({ ...bad, sig: offerFor('9.9.9', '20261010-0000', 'x').sig }, false)
      check('phieu sai chu ky khi dang san sang -> giu nguyen', U.updateState().phase === 'ready' && U.updateState().offer?.version === '1.3.0', U.updateState())
      await U.handleOffer(null, false)
      check('may chu bao "khong co ban moi" khi da san sang -> giu ban da tai', U.updateState().phase === 'ready')
      await U.handleOffer(offerFor('1.2.0', '20261001-0000', shaOf(payload)), false)
      check('phieu ban cu hon -> giu nguyen', U.updateState().offer?.version === '1.3.0')
      const r = await U.applyUpdate(true)
      check('con video dang xu ly -> khong cap nhat', !r.ok && /xử lý video/.test(r.error || ''), r)
    }
    srv.close()
    rmSync(work, { recursive: true, force: true })
  }
}

console.log(FAILS.length ? `\n${FAILS.length} FAIL: ${FAILS.join(' | ')}` : '\nTAT CA PASS')
process.exit(FAILS.length ? 1 : 0)
