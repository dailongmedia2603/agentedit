// Bao ve ma Python sidecar: bien dich CYTHON moi module lo (.py -> .so native) roi lap
// resources/sidecar-dist/ (chi con .so + launcher + scripts wrapper + assets/references) de
// electron-builder ship thay cho source. Chay trong `npm run dist` SAU bundle-python.
//
// Bien dich: moi file sidecar/*.py TRU server_launch.py (launcher chay bang source vi khong the
// co server.py + server.so cung ten). sidecar/scripts/*.py giu dang source (goi bang duong dan,
// import module .so cung thu muc). fx_runtime.mjs la Node ESM (khong bien dich).
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sidecar = join(root, 'sidecar')
const IS_WIN = process.platform === 'win32'
// Windows: python.exe + extension .pyd (Cython can MSVC — "Desktop development with C++"; setuptools tu tim qua vswhere)
const pyBin = IS_WIN ? join(root, 'resources', 'python', 'python.exe') : join(root, 'resources', 'python', 'bin', 'python3.12')
const EXT = IS_WIN ? '.pyd' : '.so'
const dist = join(root, 'resources', 'sidecar-dist')
const PYENV = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
const log = (...a) => console.log('[compile-sidecar]', ...a)

if (!existsSync(pyBin)) {
  console.error('[compile-sidecar] Chua co Python nhung (resources/python). Chay `npm run bundle:python` truoc.')
  process.exit(1)
}

// Cac module lo can bien dich = sidecar/*.py tru launcher
const LAUNCHER = 'server_launch.py'
const coreModules = readdirSync(sidecar).filter((f) => f.endsWith('.py') && f !== LAUNCHER)
log(`Bien dich ${coreModules.length} module: ${coreModules.map((f) => f.replace('.py', '')).join(', ')}`)

function py(args, opts = {}) {
  return execFileSync(pyBin, args, { stdio: 'inherit', env: PYENV, ...opts })
}

// 1) Bao dam co Cython (cai tam vao python nhung, go sau khi build de ban ship sach)
let cythonWasInstalled = false
try {
  execFileSync(pyBin, ['-c', 'import Cython'], { stdio: 'pipe' })
} catch {
  log('Cai Cython (tam) vao Python nhung...')
  py(['-m', 'pip', 'install', '--no-input', '--disable-pip-version-check', 'cython'])
  cythonWasInstalled = true
}

// 2) Copy module vao thu muc build tam roi cythonize -i (khong dung vao source sidecar/)
const build = mkdtempSync(join(tmpdir(), 'cybuild-'))
try {
  for (const f of coreModules) cpSync(join(sidecar, f), join(build, f))
  log('cythonize -i (native .so)...')
  py(['-m', 'Cython.Build.Cythonize', '-i', '-3', '-j', '4', ...coreModules], { cwd: build })

  const soFiles = readdirSync(build).filter((f) => f.endsWith(EXT))
  if (soFiles.length !== coreModules.length) {
    throw new Error(`Chi ra ${soFiles.length}/${coreModules.length} ${EXT} — co module khong bien dich duoc` +
      (IS_WIN ? ' (Windows: can Visual Studio Build Tools, "Desktop development with C++").' : '.'))
  }

  // 3) Lap dist: .so (mã đã bảo vệ) + launcher + MỌI file top-level không phải .py
  //    (requirements.lock cho probe, fx_runtime.mjs cho hộp cách ly FX...) + scripts/assets/references.
  //    KHÔNG copy .py lõi (chỉ còn .so); giữ launcher .py + scripts/*.py (gọi bằng đường dẫn).
  rmSync(dist, { recursive: true, force: true })
  mkdirSync(dist, { recursive: true })
  for (const f of soFiles) cpSync(join(build, f), join(dist, f))
  cpSync(join(sidecar, LAUNCHER), join(dist, LAUNCHER))
  for (const entry of readdirSync(sidecar, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.endsWith('.py') && entry.name !== '.DS_Store') {
      cpSync(join(sidecar, entry.name), join(dist, entry.name))
    }
  }
  for (const d of ['scripts', 'assets', 'references']) {
    if (existsSync(join(sidecar, d))) {
      cpSync(join(sidecar, d), join(dist, d), {
        recursive: true,
        filter: (src) => !src.includes('__pycache__') && !src.endsWith('.pyc')
      })
    }
  }

  // 4) macOS: ky adhoc moi .so (arm64: phai co chu ky moi chay; clang da ky san, ky lai cho chac)
  for (const f of process.platform === 'darwin' ? soFiles : []) {
    try {
      execFileSync('codesign', ['--force', '--sign', '-', join(dist, f)], { stdio: 'pipe' })
    } catch (e) {
      log(`Canh bao: khong ky duoc ${f}: ${String(e).slice(0, 100)}`)
    }
  }

  // 5) Xac nhan import het cac .so tu dist (chi co .so, khong con source lo)
  const names = soFiles.map((f) => f.split('.')[0]).filter((n) => n !== '__init__')
  const check = `import importlib,sys\nbad=[]\nfor m in ${JSON.stringify(names)}:\n try: importlib.import_module(m)\n except Exception as e: bad.append('%s: %r'%(m,e))\nprint('DIST_IMPORT_OK' if not bad else 'DIST_IMPORT_FAIL')\n[print(' ',x) for x in bad]\nsys.exit(1 if bad else 0)`
  const res = execFileSync(pyBin, ['-c', check], { cwd: dist, encoding: 'utf-8', env: PYENV })
  log(res.trim())
} finally {
  rmSync(build, { recursive: true, force: true })
  // 6) Go Cython khoi Python nhung (ship sach) neu ta vua cai
  if (cythonWasInstalled) {
    try {
      py(['-m', 'pip', 'uninstall', '-y', 'cython'], { stdio: 'pipe' })
      log('Da go Cython khoi Python nhung.')
    } catch {
      /* khong quan trong */
    }
  }
}

// Xac nhan launcher goi duoc (server.main ton tai) — khong khoi dong server that
const smoke = execFileSync(pyBin, ['-c', 'import server; assert hasattr(server,"main"); print("LAUNCH_OK")'], {
  cwd: dist,
  encoding: 'utf-8',
  env: PYENV
})
log(smoke.trim())
log(`Xong. sidecar-dist san sang tai ${dist}`)
