import { app, BrowserWindow, Menu, nativeTheme } from 'electron'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { registerIpc } from './ipc'
import { stopSidecar } from './services/sidecar'
import { stopRender } from './services/remotion'
import { stopMediaServer } from './services/media-server'
import { cancelCliTask } from './services/cli-login'
import { initUpdater, markLaunchedIfUpdated, runUpdateSelftest, selftestConfigPath } from './services/updater'

let mainWindow: BrowserWindow | null = null

/** Ten hien thi. app.name van la "auto-capcut" (package.json) — Electron dung no cho thu muc du lieu
 *  + muc Keychain chua khoa API; doi thi mat khoa da luu. Menu mac dinh cua Electron in app.name
 *  ("About auto-capcut", "Quit auto-capcut") nen tu dung menu voi ten hien thi. */
const APP_DISPLAY_NAME = 'Agent Edit'

const IS_WIN = process.platform === 'win32'

// ---- NHAT KY KHOI DONG: <userData>/logs/main.log (Windows: %APPDATA%\auto-capcut\logs\main.log) ----
// App mo len khong hien cua so (may Windows that, 2026-10-01) -> can biet ket o buoc nao ma khong can terminal.
function bootLog(msg: string): void {
  try {
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'main.log'), `${new Date().toISOString()} [${process.pid}] ${msg}\n`)
  } catch {
    /* khong ghi duoc log -> bo qua */
  }
}
// GPU loi o lan truoc -> lan nay tat tang toc do hoa (phai goi TRUOC app ready)
const GPU_OFF = () => join(app.getPath('userData'), 'gpu-off')
if (existsSync(GPU_OFF()) || process.argv.includes('--disable-gpu')) {
  app.disableHardwareAcceleration()
}
// Ma build (scripts/dist.mjs, ngay-gio dong goi) — '' khi dev / build thuong
declare const __APP_BUILD__: string
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : ''
bootLog(`khoi dong v${app.getVersion()}${APP_BUILD ? ' build ' + APP_BUILD : ''} ${process.platform}-${process.arch} gpu=${existsSync(GPU_OFF()) ? 'tat' : 'bat'}`)
// Python NHUNG khong duoc ghi __pycache__ vao TRONG goi app: lam hong niem phong chu ky ma macOS (codesign --verify bao
// "a sealed resource is missing or invalid") -> ban cap nhat nen tu app do bi tu choi; Windows thi ban dong thu muc cai.
// Moi tien trinh Python con (sidecar, Doctor, script) ke thua bien nay -> cache vao ~/.capcut-studio/pycache.
if (!process.env.PYTHONPYCACHEPREFIX) process.env.PYTHONPYCACHEPREFIX = join(homedir(), '.capcut-studio', 'pycache')
// Vua duoc script tu cap nhat mo lai -> bao "ban moi da khoi dong" NGAY (truoc moi buoc co the treo, vd hop thoai Keychain);
// khong co dau nay trong 120s script se tra ban cu ve (updater.ts / update-core.ts)
markLaunchedIfUpdated()
app.on('child-process-gone', (_e, d) => {
  bootLog(`tien trinh con ${d.type} dung: ${d.reason} (ma ${d.exitCode})`)
  if (d.type === 'GPU' && d.reason !== 'clean-exit' && d.reason !== 'killed') {
    try {
      writeFileSync(GPU_OFF(), new Date().toISOString())
      bootLog('GPU loi -> lan mo sau tat tang toc do hoa')
    } catch {
      /* bo qua */
    }
  }
})

// Ban cai cho may khac (electron.vite.config.ts): khong co DevTools (mo ra xem duoc moi buoc / prompt / nhat ky)
declare const __CLIENT_UI__: boolean
const CLIENT_UI = typeof __CLIENT_UI__ !== 'undefined' && __CLIENT_UI__

function setAppMenu() {
  app.setAboutPanelOptions({
    applicationName: APP_DISPLAY_NAME,
    applicationVersion: app.getVersion() + (APP_BUILD ? ` (build ${APP_BUILD})` : '')
  })
  if (process.platform !== 'darwin') {
    // Windows: bo menu mac dinh cua Electron (Ctrl+R tai lai trang giua luc dung video, Ctrl+W, DevTools...).
    // Sao chep / dan trong o nhap van chay (Chromium tu xu ly, khong can menu).
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: APP_DISPLAY_NAME,
        submenu: [
          { role: 'about', label: `Giới thiệu ${APP_DISPLAY_NAME}` },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide', label: `Ẩn ${APP_DISPLAY_NAME}` },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit', label: `Thoát ${APP_DISPLAY_NAME}` }
        ]
      },
      { role: 'editMenu' },
      CLIENT_UI
        ? {
            label: 'Xem',
            submenu: [
              { role: 'resetZoom' },
              { role: 'zoomIn' },
              { role: 'zoomOut' },
              { type: 'separator' },
              { role: 'togglefullscreen' }
            ]
          }
        : { role: 'viewMenu' },
      { role: 'windowMenu' }
    ])
  )
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    // macOS: an thanh tieu de, giu 3 nut den. Windows: an thanh tieu de NHUNG ve lai 3 nut thu nho / phong to / dong
    // tren thanh tren cung cua app (titleBarOverlay) — 'hiddenInset' tren Windows lam mat het nut cua so.
    ...(IS_WIN
      ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#FDF6EF', symbolColor: '#1a1c22', height: 47 } }
      : { titleBarStyle: 'hiddenInset' as const }),
    backgroundColor: '#FDF6EF',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !CLIENT_UI
    }
  })

  bootLog('tao cua so')
  const win = mainWindow
  mainWindow.on('ready-to-show', () => {
    bootLog('ready-to-show -> hien cua so')
    win.show()
  })
  // Giao dien chua ve xong khung dau sau 6s (GPU / driver loi...) -> van hien cua so, khong de app "vo hinh"
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      bootLog('6s chua ready-to-show -> ep hien cua so')
      win.show()
    }
  }, 6000)
  mainWindow.webContents.on('did-finish-load', () => bootLog('giao dien nap xong'))
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => bootLog(`giao dien nap LOI ${code} ${desc}`))
  mainWindow.webContents.on('render-process-gone', (_e, d) => bootLog(`renderer dung: ${d.reason} (ma ${d.exitCode})`))
  mainWindow.on('unresponsive', () => bootLog('cua so khong phan hoi'))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Chi 1 phien app: mo lan 2 (Windows hay bam 2 lan) -> 2 sidecar + 2 Doctor tu cai tranh nhau tools/bin,
// 2 ben cung ghi projects.json. Lan 2 chi dua cua so dang mo len truoc roi thoat. Che do tu kiem (STUDIO_*) bo qua.
const SELF_TEST = Object.keys(process.env).some((k) =>
  ['STUDIO_TESTCONN', 'STUDIO_DUMPCFG', 'STUDIO_RAWGPT', 'STUDIO_DOCTOR', 'STUDIO_REMOTION_RENDER', 'STUDIO_SIDECAR_SMOKE'].includes(k)
)
if (!SELF_TEST && !app.requestSingleInstanceLock()) {
  bootLog('da co 1 phien dang chay -> bao phien do mo cua so, thoat')
  app.quit()
} else {
  app.on('second-instance', () => {
    // Phien dang chay MAT cua so (vd dong cua so nhung qua trinh tat bi ket) -> mo lai cua so thay vi im lang
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (app.isReady()) createWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}
// Windows: gom nhom thanh tac vu + thong bao dung app (cung appId cua electron-builder)
if (IS_WIN) app.setAppUserModelId('app.autocapcut.desktop')

app.whenReady().then(async () => {
  bootLog('app ready')
  nativeTheme.themeSource = 'light'
  setAppMenu()
  registerIpc(() => mainWindow)
  initUpdater()

  // Tu kiem TU CAP NHAT (ban dong goi): --update-selftest=<json> — khong mo cua so (scripts/selftest-update.mjs)
  const updSelftest = selftestConfigPath()
  if (updSelftest) {
    bootLog('tu kiem cap nhat: ' + updSelftest)
    await runUpdateSelftest(updSelftest)
    return
  }

  // Che do test connection cac provider luong Remotion dung (dung key that da luu)
  // Tu kiem SIDECAR QUA MAIN (dung duong cua trang Cai dat API: startSidecar() khong kem onLog + /cli_status), bat moi
  // loi chua xu ly cua main. Su co that 2026-10-01: obfuscator dich sai `onLog?.(s)` -> main nem loi moi khi sidecar in log
  // — tu kiem cu goi Python truc tiep nen khong bat duoc. selftest-packaged.mjs [5b] dung che do nay.
  if (process.env.STUDIO_SIDECAR_SMOKE) {
    const fail = (e: unknown) => {
      console.log('[SMOKE] UNCAUGHT', String((e as Error)?.stack || e).slice(0, 800))
      app.exit(1)
    }
    process.on('uncaughtException', fail)
    process.on('unhandledRejection', fail)
    const { startSidecar, sidecarRequest, stopSidecar: stopSc } = await import('./services/sidecar')
    const s = await startSidecar()
    console.log('[SMOKE] sidecar:', JSON.stringify(s))
    try {
      const st = await sidecarRequest('/cli_status', { name: 'claude' }, 120000)
      console.log('[SMOKE] cli_status ok:', JSON.stringify(st).slice(0, 160))
    } catch (e) {
      console.log('[SMOKE] cli_status loi:', String(e).slice(0, 200))
    }
    await new Promise((r) => setTimeout(r, 3000)) // de sidecar kip in log (stdout / stderr) qua main
    stopSc()
    console.log(s.ok ? '[SMOKE] PASS' : '[SMOKE] FAIL')
    app.exit(s.ok ? 0 : 1)
    return
  }

  if (process.env.STUDIO_TESTCONN) {
    const { startSidecar, sidecarRequest } = await import('./services/sidecar')
    const s = await startSidecar()
    console.log('[TC] sidecar:', JSON.stringify(s))
    for (const name of ['gemini', 'gpt']) {
      try {
        const r = await sidecarRequest('/test_connection', { name })
        console.log(`[TC] ${name}: ok=${r.ok} ${r.detail || r.error || ''}`)
      } catch (e) {
        console.log(`[TC] ${name}: ERROR ${String(e)}`)
      }
    }
    app.quit()
    return
  }

  // Dump config (keys) ra file de iterate sidecar nhanh khi debug (xoa sau khi xong)
  if (process.env.STUDIO_DUMPCFG) {
    const { loadProviders } = await import('./services/secrets')
    const fs = await import('fs')
    fs.writeFileSync(join(tmpdir(), 'autocapcut_cfg.json'), JSON.stringify({ providers: loadProviders() }))
    console.log('[CFG] dumped')
    app.quit()
    return
  }

  // Che do soi raw response cua GPT (xem co thinking/reasoning khong)
  if (process.env.STUDIO_RAWGPT) {
    const { startSidecar, sidecarRequest } = await import('./services/sidecar')
    await startSidecar()
    const r = await sidecarRequest('/debug_raw', { name: 'gpt', json_mode: process.env.RAWJSON === '1' })
    console.log('[RAW]', JSON.stringify(r).slice(0, 2000))
    app.quit()
    return
  }

  // Che do test rieng Doctor (Electron-side)
  // Tu kiem Doctor khong mo cua so: STUDIO_DOCTOR=1 (in ket qua), them STUDIO_DOCTOR_FIX=1 = tu cai nhu luc mo app
  // (kiem may moi: chay voi HOME tam -> moi thu cai vao HOME do)
  if (process.env.STUDIO_DOCTOR) {
    const { runDoctor, autoFix, fixCheck } = await import('./services/doctor')
    const { providersConfigured } = await import('./services/secrets')
    const print = (checks: Awaited<ReturnType<typeof runDoctor>>) => {
      for (const c of checks) {
        console.log(`[DOCTOR] ${c.group}/${c.id}: ${c.status} — ${c.label} | yeu cau: ${c.required || '-'} | may co: ${c.found || '-'} | ${c.detail}`)
      }
    }
    print(await runDoctor(providersConfigured()))
    if (process.env.STUDIO_DOCTOR_FIX) {
      const t0 = Date.now()
      const res = await autoFix(
        () => providersConfigured(),
        (id, line) => console.log(`[FIX ${id}] ${line}`),
        (p) => console.log(`[PROGRESS] ${JSON.stringify(p)}`)
      )
      console.log(`[DOCTOR] --- sau khi tu cai (${Math.round((Date.now() - t0) / 1000)}s) ---`)
      print(res.checks)
    }
    // STUDIO_DOCTOR_FIX_ONLY=claude,agy: chay RIENG cac bo cai do (kiem bo cai CLI khong can cau hinh AI)
    for (const id of (process.env.STUDIO_DOCTOR_FIX_ONLY || '').split(',').filter(Boolean)) {
      const r = await fixCheck(id, (line) => console.log(`[FIX ${id}] ${line}`))
      console.log(`[FIX ${id}] => ${r.ok ? 'OK' : 'LOI: ' + r.error}`)
    }
    app.quit()
    return
  }

  // Che do tu kiem RENDER Remotion (utilityProcess + may chu media + binary da dong goi):
  // STUDIO_REMOTION_RENDER=<spec.json> STUDIO_REMOTION_OUT=<out.mp4> <app binary>
  if (process.env.STUDIO_REMOTION_RENDER) {
    const { startRender } = await import('./services/remotion')
    const fs = await import('fs')
    const log = (...a: unknown[]) => console.log('[RMR]', ...a)
    try {
      const spec = JSON.parse(fs.readFileSync(process.env.STUDIO_REMOTION_RENDER, 'utf-8'))
      const out = process.env.STUDIO_REMOTION_OUT || join(tmpdir(), 'autocapcut_remotion.mp4')
      let lastPct = -1
      const res = await startRender(spec, out, (e) => {
        if (e.type === 'progress') {
          const pct = Math.round((e.progress || 0) * 100)
          if (pct >= lastPct + 10) {
            lastPct = pct
            log(e.stage, pct + '%')
          }
        } else log(e.type, e.message || '')
      })
      log('RESULT:', res.type === 'done' ? 'PASS' : 'FAIL', JSON.stringify(res).slice(0, 1500))
    } catch (e) {
      log('RESULT: FAIL', String(e))
    }
    app.quit()
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopSidecar()
  if (process.platform !== 'darwin') {
    app.quit()
    // Windows: tat bi ket (tien trinh con / tai do dang) -> phien ma giu khoa "1 phien" -> lan mo sau khong len.
    // Sau 8s van chua thoat thi thoat han.
    setTimeout(() => app.exit(0), 8000)
  }
})

app.on('before-quit', () => {
  stopSidecar()
  stopRender()
  stopMediaServer()
  cancelCliTask()
})
