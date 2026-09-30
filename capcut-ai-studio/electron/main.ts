import { app, BrowserWindow, Menu, nativeTheme } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { stopSidecar } from './services/sidecar'
import { stopRender } from './services/remotion'
import { stopMediaServer } from './services/media-server'
import { cancelCliTask } from './services/cli-login'

let mainWindow: BrowserWindow | null = null

/** Ten hien thi. app.name van la "auto-capcut" (package.json) — Electron dung no cho thu muc du lieu
 *  + muc Keychain chua khoa API; doi thi mat khoa da luu. Menu mac dinh cua Electron in app.name
 *  ("About auto-capcut", "Quit auto-capcut") nen tu dung menu voi ten hien thi. */
const APP_DISPLAY_NAME = 'Agent Edit'

function setAppMenu() {
  app.setAboutPanelOptions({ applicationName: APP_DISPLAY_NAME, applicationVersion: app.getVersion() })
  if (process.platform !== 'darwin') return
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
      { role: 'viewMenu' },
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
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FDF6EF',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'light'
  setAppMenu()
  registerIpc(() => mainWindow)

  // Che do test connection cac provider luong Remotion dung (dung key that da luu)
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
    fs.writeFileSync('/tmp/autocapcut_cfg.json', JSON.stringify({ providers: loadProviders() }))
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
      const out = process.env.STUDIO_REMOTION_OUT || '/tmp/autocapcut_remotion.mp4'
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
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopSidecar()
  stopRender()
  stopMediaServer()
  cancelCliTask()
})
