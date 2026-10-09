// TU KIEM BAN DONG GOI (Windows: release/win-unpacked; macOS: release/mac-arm64/Agent Edit.app) — chay sau
// `npm run dist:win` (build-windows.ps1 tu goi). HOME / USERPROFILE TAM + --user-data-dir tam: khong dung toi du lieu
// that (khoa API, du an, ~/.capcut-studio) cua may build.
//
//   node scripts/selftest-packaged.mjs [--app <duong dan exe / .app>] [--keep]
//
// Kiem: (1) Doctor tu cai ffmpeg (tu ban NHUNG) + Chrome Headless -> bao cao Doctor; (2) Python nhung + sidecar da bien
// dich (.pyd/.so) nap duoc, ffmpeg cua app dung; (3) thi giac may (Windows: model ONNX — tach nguoi ra WebM alpha,
// tim mat, OCR, ve SVG) ; (4) hop cach ly hieu ung chay bang chinh exe app (Electron-as-Node); (5) sidecar Flask
// tra loi /health; (6) render MP4 that qua Remotion (compositor + Chrome) co phu de tieng Viet.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const IS_WIN = process.platform === 'win32'
const argv = process.argv.slice(2)
const argOf = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null)
const KEEP = argv.includes('--keep')

// ---- vi tri app + resources ----
let app = argOf('--app')
if (!app) {
  app = IS_WIN
    ? join(root, 'release', 'win-unpacked', 'Agent Edit.exe')
    : join(root, 'release', 'mac-arm64', 'Agent Edit.app')
}
app = resolve(app)
let exe = app
let resDir
if (app.endsWith('.app')) {
  exe = join(app, 'Contents', 'MacOS', 'Agent Edit')
  resDir = join(app, 'Contents', 'Resources')
} else {
  resDir = join(dirname(app), 'resources')
}
const pyBin = IS_WIN ? join(resDir, 'python', 'python.exe') : join(resDir, 'python', 'bin', 'python3.12')
const sidecar = join(resDir, 'sidecar')
const modelsDir = join(resDir, 'models')

if (!existsSync(exe)) {
  console.error(`[selftest] Khong thay app: ${exe} — build truoc (npm run dist:win:dir) hoac truyen --app <duong dan>.`)
  process.exit(2)
}

// ---- moi truong co lap ----
const home = mkdtempSync(join(tmpdir(), 'ae-selftest-'))
const ud = join(home, 'ud')
const env = { ...process.env, HOME: home, USERPROFILE: home, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
delete env.ELECTRON_RUN_AS_NODE // VSCode / terminal IDE dat bien nay -> exe app chay nhu node roi thoat
const tools = join(home, '.capcut-studio', 'tools', 'bin')
const ffmpeg = join(tools, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg')
const ffprobe = join(tools, IS_WIN ? 'ffprobe.exe' : 'ffprobe')

const results = []
const t0 = Date.now()
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + String(detail).split('\n').slice(0, 6).join(' | ').slice(0, 400) : ''}`)
}

/** Chay exe app (Electron GUI) va lay stdout (GUI app tren Windows chi co stdout khi ong dan duoc chuyen). */
function runApp(extraEnv, timeoutMs) {
  return new Promise((resolveP) => {
    const p = spawn(exe, [`--user-data-dir=${ud}`], { env: { ...env, ...extraEnv }, windowsHide: true })
    let out = ''
    p.stdout.on('data', (d) => (out += d.toString('utf-8')))
    p.stderr.on('data', (d) => (out += d.toString('utf-8')))
    const timer = setTimeout(() => {
      out += '\n[selftest] HET GIO'
      try {
        if (IS_WIN) execFileSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
        else p.kill('SIGKILL')
      } catch {
        /* da thoat */
      }
    }, timeoutMs)
    p.on('close', (code) => {
      clearTimeout(timer)
      resolveP({ code, out })
    })
  })
}

function py(code, extraEnv = {}, timeout = 300000) {
  return execFileSync(pyBin, ['-c', code], {
    cwd: sidecar,
    env: { ...env, ...(existsSync(modelsDir) ? { STUDIO_MODELS_DIR: modelsDir } : {}), STUDIO_NODE_BIN: exe, ...extraEnv },
    encoding: 'utf-8',
    timeout,
    windowsHide: true
  })
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer()
    s.on('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port
      s.close(() => res(port))
    })
  })
}

async function main() {
  console.log(`[selftest] app: ${exe}\n[selftest] HOME tam: ${home}\n`)

  // 1) Doctor: tu cai ffmpeg (ban nhung) + Chrome, roi bao cao
  console.log('[1] Doctor (tu cai ffmpeg tu ban nhung + Chrome Headless Shell ~90 MB)...')
  const fix = await runApp({ STUDIO_DOCTOR: '1', STUDIO_DOCTOR_FIX_ONLY: 'ffmpeg,chrome' }, 20 * 60 * 1000)
  for (const id of ['ffmpeg', 'chrome']) {
    const m = new RegExp(`\\[FIX ${id}\\] => (.*)`).exec(fix.out)
    record(`Doctor tự cài ${id}`, !!m && m[1].startsWith('OK'), m ? m[1] : fix.out.split('\n').slice(-5).join(' | '))
  }
  const doc = await runApp({ STUDIO_DOCTOR: '1' }, 5 * 60 * 1000)
  const rows = {}
  for (const line of doc.out.split(/\r?\n/)) {
    const m = /^\[DOCTOR\] (\w+)\/(\w+): (\w+) — (.*)$/.exec(line)
    if (m) rows[m[2]] = { status: m[3], text: m[4] }
  }
  const must = IS_WIN ? ['os', 'bundle', 'ffmpeg', 'chrome', 'python', 'pypkgs'] : ['macos', 'bundle', 'ffmpeg', 'chrome', 'python', 'pypkgs']
  for (const id of must) record(`Doctor: ${id}`, rows[id]?.status === 'ok', rows[id] ? `${rows[id].status} — ${rows[id].text}` : 'không có dòng này')
  if (rows.vision) {
    // thieu MOI model lon (Doctor tai luc dung that) van chap nhan; con lai phai dat
    // dong Doctor = "label | yeu cau: ... | may co: ... | <chi tiet>" — chi xet phan CHI TIET (phan yeu cau
    // co chu "resvg / PP-OCR" -> truoc day bi doc nham la thieu)
    const v = rows.vision
    const detail = v.text.split(' | ').pop() || ''
    const okv = v.status === 'ok' ||
      (v.status === 'warn' && /^Thiếu model: BiRefNet[^,]*\(~\d+ MB\)/.test(detail))
    record('Doctor: thị giác máy', okv, `${v.status} — ${v.text}`)
  }
  for (const id of ['whisper', 'ai_gemini', 'ai_planner', 'codex']) {
    if (rows[id]) console.log(`  info  Doctor ${id}: ${rows[id].status} — ${rows[id].text.slice(0, 160)}  (máy build: không bắt buộc)`)
  }

  // 2) Python nhung + sidecar bien dich
  console.log('\n[2] Python nhúng + sidecar đã biên dịch...')
  try {
    const out = py(
      'import sys, server, winsupport, remotion_plan as RP\n' +
        'print("PY", sys.version.split()[0], "| server", server.__file__.rsplit(".",1)[-1], "| ffmpeg", RP._ffbin("ffmpeg"))'
    )
    const compiled = /\| server (pyd|so)/.test(out)
    record('Nạp sidecar đã biên dịch', compiled, out.trim())
    record('ffmpeg của app được dùng', out.includes(tools), out.trim().split('ffmpeg ')[1])
  } catch (e) {
    record('Nạp sidecar đã biên dịch', false, String(e.stderr || e.message))
  }

  // 3) Video thu + thi giac may
  console.log('\n[3] Thị giác máy...')
  const work = join(home, 'work')
  mkdirSync(work, { recursive: true })
  const vid = join(work, 'thử nghiệm video.mp4') // ten co dau tieng Viet + khoang trang (bay UTF-8 / quote)
  try {
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-shortest', vid], { windowsHide: true })
    record('Tạo video thử bằng ffmpeg của app', existsSync(vid) && statSync(vid).size > 10000)
  } catch (e) {
    record('Tạo video thử bằng ffmpeg của app', false, String(e.stderr || e.message))
  }
  try {
    const out = py(
      [
        'import json, os, numpy as np',
        'from PIL import Image, ImageDraw, ImageFont',
        'import media_vision as MV, text_art, hook_rule',
        `v = ${JSON.stringify(vid)}`,
        'res = {"backend": "vision" if MV._vision() else "onnx", "available": MV.available()}',
        'm = MV.subject_matte(v, 0.5, 2.0)',
        'res["matte"] = bool(m and os.path.getsize(m["path"]) > 1000)',
        'res["matte_mask"] = MV.matte_mask(m["path"], 0.5) is not None if m else False',
        'res["face_box_ran"] = True; MV.face_box(v)',
        'im = Image.new("RGBA", (1200, 180), (0, 0, 0, 0))',
        'ImageDraw.Draw(im).text((20, 20), "GIAM GIA 50 HOM NAY", font=ImageFont.load_default(size=110), fill=(255, 220, 0, 255), stroke_width=5, stroke_fill=(0, 0, 0, 255))',
        'txt, words = text_art._ocr(np.asarray(im.crop(im.getbbox())), want_words=True)',
        'res["ocr"] = txt; res["ocr_sim"] = round(text_art._sim(txt or "", "GIAM GIA 50 HOM NAY"), 2); res["ocr_words"] = len(words or [])',
        'r = hook_rule._raster(\'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920"><rect width="540" height="1920" fill="#000"/></svg>\')',
        'res["svg_cover"] = None if r is None else round(float(r[..., 3].mean()), 2)',
        'print("VISION=" + json.dumps(res, ensure_ascii=False))'
      ].join('\n')
    )
    const r = JSON.parse((out.split(/\r?\n/).find((l) => l.startsWith('VISION=')) || 'VISION={}').slice(7))
    const seg = JSON.stringify({ backend: r.backend, matte: r.matte, mask: r.matte_mask })
    // May ao macOS cua GitHub Actions khong co Neural Engine / GPU that -> Vision khong tach nguoi duoc (dat tren may that
    // cung ma nguon). release.yml dat SELFTEST_VM_NO_PERSON_SEG=1 cho buoc nay: chi ghi lai, khong danh hong ca lan build.
    if (!(r.matte && r.matte_mask) && process.env.SELFTEST_VM_NO_PERSON_SEG === '1') {
      console.log(`  info  Tách người → WebM alpha: máy ảo CI không tách được (${seg}) — đã kiểm trên máy thật`)
    } else record('Tách người → WebM alpha (chữ sau người)', r.matte && r.matte_mask, seg)
    record('Dò mặt chạy được', r.face_box_ran === true)
    record('OCR chữ ảnh AI', (r.ocr_sim || 0) >= 0.72, `đọc "${r.ocr}" (khớp ${r.ocr_sim}), ${r.ocr_words} từ`)
    record('Vẽ SVG đo hook', r.svg_cover === 0.5, `phủ ${r.svg_cover}`)
  } catch (e) {
    record('Thị giác máy', false, String(e.stderr || e.message))
  }

  // 4) Hop cach ly hieu ung (Electron-as-Node = chinh exe app)
  console.log('\n[4] Hộp cách ly hiệu ứng tự viết...')
  try {
    const out = py(
      'import json, fx_flow\n' +
        'r = fx_flow.run_runtime("check", [{"id": "g", "kind": "overlay", "duration": 1, "fps": 30, "W": 1080, "H": 1920, ' +
        '"code": "function render(ctx){ return h(\'svg\', {width: ctx.W, height: ctx.H}, h(\'circle\', {cx: 540, cy: 960, r: 100 + 50 * ctx.t, fill: \'#FF6FA3\'})) }"}, ' +
        '{"id": "bad", "kind": "overlay", "duration": 1, "fps": 30, "code": "function render(ctx){ return process.exit(1) }"}])\n' +
        'print("FX=" + json.dumps({k: v.get("ok") for k, v in r.items()}) + " " + json.dumps(r.get("g", {}).get("errors")))'
    )
    const line = out.split(/\r?\n/).find((l) => l.startsWith('FX=')) || ''
    record('Hộp cách ly chạy code đúng + chặn code nguy hiểm', /"g": true/.test(line) && /"bad": false/.test(line), line)
  } catch (e) {
    record('Hộp cách ly hiệu ứng', false, String(e.stderr || e.message))
  }

  // 5) Sidecar Flask /health
  console.log('\n[5] Sidecar /health...')
  {
    const port = await freePort()
    const token = 'selftest' + Date.now()
    const sc = spawn(pyBin, [join(sidecar, 'server_launch.py'), '--port', String(port), '--token', token], {
      cwd: sidecar,
      // STUDIO_LICENSE_OFF chi co tac dung voi server.py nguon -> ban bien dich PHAI van chan
      env: { ...env, STUDIO_TOKEN: token, STUDIO_LICENSE_OFF: '1' },
      windowsHide: true
    })
    let log = ''
    sc.stdout.on('data', (d) => (log += d))
    sc.stderr.on('data', (d) => (log += d))
    let ok = false
    for (let i = 0; i < 60 && !ok; i++) {
      await new Promise((r) => setTimeout(r, 500))
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'X-Studio-Token': token } })
        ok = r.ok
      } catch {
        /* chua len */
      }
    }
    record('Sidecar trả lời /health', ok, ok ? '' : log.slice(-400))
    if (ok) {
      // Cong ban quyen: khong co ve -> moi viec AI tra 403 code=license
      let gate = ''
      try {
        const r = await fetch(`http://127.0.0.1:${port}/remotion/autoplan`, {
          method: 'POST',
          headers: { 'X-Studio-Token': token, 'Content-Type': 'application/json' },
          body: '{}'
        })
        gate = r.status + ' ' + ((await r.json().catch(() => ({}))).code || '')
      } catch (e) {
        gate = String(e)
      }
      record('Sidecar chặn việc AI khi chưa có vé bản quyền', gate === '403 license', gate)
    }
    try {
      if (IS_WIN) execFileSync('taskkill', ['/PID', String(sc.pid), '/T', '/F'], { stdio: 'ignore' })
      else sc.kill('SIGTERM')
    } catch {
      /* da thoat */
    }
  }

  // 5b) Sidecar QUA tien trinh main cua app (duong trang Cai dat API dung) — bat loi main nem khi doc log sidecar
  console.log('\n[5b] Sidecar qua tiến trình chính của app...')
  {
    const sm = await runApp({ STUDIO_SIDECAR_SMOKE: '1' }, 3 * 60 * 1000)
    const ok = /\[SMOKE\] PASS/.test(sm.out) && !/UNCAUGHT/.test(sm.out) && /cli_status ok/.test(sm.out)
    record('Main khởi động sidecar + /cli_status, không lỗi chưa bắt', ok,
      ok ? '' : sm.out.split(/\r?\n/).filter((l) => /SMOKE|rror/.test(l)).slice(-6).join(' | '))
  }

  // 6) Render MP4 that
  console.log('\n[6] Render MP4 (Remotion + Chrome Headless + compositor)...')
  const out = join(work, 'ket qua render.mp4')
  const spec = {
    version: 1,
    media: 7,
    title: 'Tự kiểm bản đóng gói',
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 3,
    clips: [{ id: 'clip0', kind: 'body', path: vid, start: 0, end: 3, srcStart: 0, speed: 1, volume: 1, fit: 'cover',
      scale: 1, x: 0, y: 0, transitionOut: null, srcW: 1080, srcH: 1920 }],
    captions: [{ id: 'cap0', start: 0.3, end: 2.7, text: 'Xin chào — phụ đề tiếng Việt có dấu', style: 'karaoke',
      font: 'be_vietnam_pro', size: 66, color: '#FFFFFF', accent: '#FF3B5C', emphasis: ['tiếng'], role: 'support',
      uppercase: false, y: 0.54, words: [] }],
    layers: [{ id: 'l0', type: 'text', start: 0.2, end: 2.8, x: 0.08, y: 0.13, anchor: 'left', maxWidth: 0.8, track: 30,
      spans: [{ text: 'Agent Edit trên Windows', font: 'baloo_2', size: 64, weight: 700, color: '#2A0E24' }],
      box: { color: '#FFFFFF', padX: 0.035, padY: 0.014, radius: 0.035, blur: 0 },
      enter: { preset: 'pop', duration: 0.3 }, exit: { preset: 'fade', duration: 0.15 }, loop: null }],
    audio: [],
    scenes: [],
    overlays: [],
    effects: [],
    fx: [],
    fxTransforms: [],
    grade: { preset: 'vivid', intensity: 0.3 }
  }
  const specPath = join(work, 'spec.json')
  writeFileSync(specPath, JSON.stringify(spec), 'utf-8')
  const rr = await runApp({ STUDIO_REMOTION_RENDER: specPath, STUDIO_REMOTION_OUT: out }, 20 * 60 * 1000)
  const pass = /RESULT: PASS/.test(rr.out) && existsSync(out)
  let dur = ''
  if (pass) {
    try {
      dur = execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf-8' }).trim()
    } catch {
      /* bo qua */
    }
  }
  record('Render MP4', pass && Math.abs(Number(dur) - 3) < 0.3, pass ? `${out} (${dur}s, ${(statSync(out).size / 1e6).toFixed(1)} MB)` : rr.out.split(/\r?\n/).filter((l) => /RMR|rror/.test(l)).slice(-6).join(' | '))

  // ---- tong ket ----
  const bad = results.filter((r) => !r.ok)
  console.log(`\n[selftest] ${results.length - bad.length}/${results.length} PASS sau ${Math.round((Date.now() - t0) / 1000)}s`)
  if (bad.length) console.log('[selftest] LỖI: ' + bad.map((r) => r.name).join('; '))
  if (KEEP || bad.length) console.log(`[selftest] Giữ thư mục thử: ${home}`)
  else rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  process.exit(bad.length ? 1 : 0)
}

main().catch((e) => {
  console.error('[selftest] LOI:', e)
  process.exit(1)
})
