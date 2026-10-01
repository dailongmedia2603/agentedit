// Dung PYTHON NHUNG cho app (python-build-standalone) -> nguoi dung KHONG cai Python rieng.
// Tai ban ghim (sidecar/assets/toolchain.json -> python_embed[<nen tang>]) + kiem SHA-256, giai nen vao
// resources/python, roi pip install requirements.lock vao chinh no. Chay trong `npm run dist` / `dist:win`.
//
// Ket qua: resources/python/ (macOS: bin/python3.12; Windows: python.exe) + site-packages day du -> electron-builder
// ship qua extraResources. macOS: interpreter + .so/.dylib deu adhoc linker-signed san (arm64 chay duoc).
// Windows: chep them thu vien chay Visual C++ (vcruntime140*.dll, msvcp140*.dll) canh python.exe — ban
// python-build-standalone KHONG kem, may Windows moi cai co the chua co -> python / onnxruntime / numpy khong nap duoc.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'sidecar', 'assets', 'toolchain.json'), 'utf-8'))
const pe = manifest.python_embed
const IS_WIN = process.platform === 'win32'
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const key = IS_WIN ? `win-${arch}` : `${process.platform}-${arch}`
const target = pe[key]

const log = (...a) => console.log('[bundle-python]', ...a)

if (!target || typeof target !== 'object' || !target.url) {
  console.error(`[bundle-python] Chua ho tro nen tang "${key}" (python_embed.${key} = null).`)
  process.exit(1)
}

const resourcesDir = join(root, 'resources')
const pyDir = join(resourcesDir, 'python')
const pyBin = join(pyDir, ...target.bin.split('/'))
const cacheDir = join(root, 'node_modules', '.cache', 'python-embed')
mkdirSync(cacheDir, { recursive: true })
const archive = join(cacheDir, `cpython-${pe.version}-${key}.tar.gz`)
// tar cua he thong (Windows: bsdtar trong System32 — tar cua Git hieu "C:" la may tu xa)
const TAR = IS_WIN ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
// Python in chu Viet ra ong dan: UTF-8
const PYENV = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }

function sha256(file) {
  const h = createHash('sha256')
  h.update(readFileSync(file))
  return h.digest('hex')
}

async function download(url, dest) {
  log(`Tai ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

/** Xoa moi thu muc __pycache__ (thay `find -exec rm`, chay ca Windows). */
function rmPycache(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (!e.isDirectory() || e.isSymbolicLink()) continue
    if (e.name === '__pycache__') rmSync(p, { recursive: true, force: true })
    else rmPycache(p)
  }
}

/** Windows: thu muc thu vien chay Visual C++ x64 (Microsoft.VC14x.CRT) cua Build Tools / Visual Studio. */
function vcRedistDir() {
  const vswhere = join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  const roots = []
  if (existsSync(vswhere)) {
    try {
      const out = execFileSync(vswhere, ['-all', '-products', '*', '-property', 'installationPath'], { encoding: 'utf-8' })
      roots.push(...out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))
    } catch {
      /* bo qua */
    }
  }
  for (const r of roots) {
    const base = join(r, 'VC', 'Redist', 'MSVC')
    if (!existsSync(base)) continue
    const vers = readdirSync(base).filter((v) => /^\d+\./.test(v)).sort().reverse()
    for (const v of vers) {
      const x64 = join(base, v, 'x64')
      if (!existsSync(x64)) continue
      const crt = readdirSync(x64).find((d) => /^Microsoft\.VC\d+\.CRT$/i.test(d))
      if (crt) return join(x64, crt)
    }
  }
  return null
}

function bundleVcRuntime() {
  const want = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll',
    'msvcp140_atomic_wait.dll', 'msvcp140_codecvt_ids.dll', 'concrt140.dll']
  const src = vcRedistDir()
  const sys32 = join(process.env.SystemRoot || 'C:\\Windows', 'System32')
  const got = []
  for (const n of want) {
    const p = src && existsSync(join(src, n)) ? join(src, n) : existsSync(join(sys32, n)) ? join(sys32, n) : null
    if (p) {
      copyFileSync(p, join(pyDir, n))
      got.push(n)
    }
  }
  const must = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll']
  const miss = must.filter((n) => !got.includes(n))
  if (miss.length) {
    throw new Error(`Khong tim thay thu vien chay Visual C++ (${miss.join(', ')}). Cai "Visual Studio 2022 Build Tools" ` +
      '(Desktop development with C++) — xem BUILD-WINDOWS.md.')
  }
  log(`Da kem thu vien chay Visual C++ (${got.length} DLL) tu ${src || sys32}`)
}

async function main() {
  // 1) Tai (dung lai cache neu SHA-256 khop) + kiem ma
  if (!(existsSync(archive) && sha256(archive) === target.sha256)) {
    await download(target.url, archive)
  }
  const got = sha256(archive)
  if (got !== target.sha256) {
    rmSync(archive, { force: true })
    throw new Error(`SHA-256 khong khop: tai ve ${got.slice(0, 12)}… can ${target.sha256.slice(0, 12)}…`)
  }
  log(`SHA-256 khop (${got.slice(0, 12)}…, ${(statSync(archive).size / 1e6).toFixed(1)} MB)`)

  // 2) Giai nen vao resources/ (archive_top = "python" -> tao resources/python)
  rmSync(pyDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
  mkdirSync(resourcesDir, { recursive: true })
  execFileSync(TAR, ['-xzf', archive, '-C', resourcesDir], { stdio: 'inherit' })
  if (!existsSync(pyBin)) throw new Error(`Khong thay interpreter sau giai nen: ${pyBin}`)
  log(`Da giai nen -> ${pyDir}`)
  if (IS_WIN) bundleVcRuntime()

  // 3) pip install requirements.lock (dung chinh interpreter nhung -> ABI khop; dieu kien nen tang PEP 508 tu loc)
  const lock = join(root, 'sidecar', manifest.python_packages.lock)
  log('pip install requirements.lock (co the mat vai phut)...')
  // Windows: chi nhan wheel (khong build tu source — may build co MSVC nhung ban dung wheel chinh thuc cho chac)
  execFileSync(pyBin, ['-m', 'pip', 'install', '--no-input', '--disable-pip-version-check', '--no-warn-script-location',
    ...(IS_WIN ? ['--only-binary=:all:'] : []), '-r', lock], { stdio: 'inherit', env: PYENV })

  // 4) Don rac cho nhe (khong dung luc chay): __pycache__, test suites, pip cache, file .pdb (Windows)
  log('Don __pycache__ + test dir...')
  rmPycache(pyDir)
  for (const t of [join(pyDir, 'lib', 'python3.12', 'test'), join(pyDir, 'Lib', 'test')]) {
    if (existsSync(t)) rmSync(t, { recursive: true, force: true })
  }
  if (IS_WIN) {
    for (const f of readdirSync(pyDir)) if (f.endsWith('.pdb')) rmSync(join(pyDir, f), { force: true })
  }

  // 5) macOS: kiem chu ky interpreter (arm64 phai hop le moi chay)
  if (process.platform === 'darwin') {
    try {
      execFileSync('codesign', ['-v', pyBin], { stdio: 'pipe' })
      log('Chu ky interpreter hop le.')
    } catch {
      log('Canh bao: interpreter chua ky hop le — thu adhoc re-sign.')
      execFileSync('codesign', ['--force', '--sign', '-', pyBin], { stdio: 'inherit' })
    }
  }

  // 6) Xac nhan import duoc cac goi trong yeu (probe)
  const probe = join(root, 'sidecar', 'scripts', 'toolchain.py')
  const out = execFileSync(pyBin, [probe, 'probe'], { encoding: 'utf-8', env: PYENV })
  const line = out.split(/\r?\n/).find((l) => l.startsWith('RESULT=')) || ''
  const r = JSON.parse(line.slice(7) || '{}')
  const nBad = (r.packages?.missing?.length || 0) + (r.packages?.wrong?.length || 0)
  log(`probe: python ${r.python}, goi ${r.packages?.total - nBad}/${r.packages?.total}, thi giac may ${r.vision?.backend || ''} ${r.vision?.ok}, whisper ${r.whisper?.ok ? 'co model' : 'chua co model (Doctor tai sau)'}`)
  if (!r.python_ok || nBad) {
    throw new Error('Python nhung thieu goi sau khi cai — kiem requirements.lock: ' + JSON.stringify(r.packages))
  }
  // Windows: thu nap that cac goi co DLL (bat loi thieu thu vien chay Visual C++ ngay luc build)
  if (IS_WIN) {
    const chk = execFileSync(pyBin, ['-c', 'import numpy, onnxruntime, ctranslate2, av, PIL, resvg_py, pillow_heif; print("NATIVE_OK", onnxruntime.__version__)'],
      { encoding: 'utf-8', env: PYENV })
    log(chk.trim())
  }

  log(`Xong. Python nhung san sang tai ${pyDir}`)
}

main().catch((e) => {
  console.error('[bundle-python] LOI:', e.message || e)
  process.exit(1)
})
