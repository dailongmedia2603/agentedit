import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron'
import { join, basename, isAbsolute } from 'path'
import { existsSync, mkdirSync, copyFileSync, statSync } from 'fs'
import { runDoctor, fixCheck, autoFix, autoFixStatus, DoctorCheck } from './services/doctor'
import {
  startCodexLogin,
  openAgyLogin,
  openClaudeLogin,
  startAgyLogin,
  startClaudeLogin,
  startCliLogout,
  agyFailureText,
  sendCliInput,
  startClaudeUpdate,
  startCliInstall,
  cancelCliTask,
  CLI_PACKAGES,
  CliLoginMode
} from './services/cli-login'
import {
  maskedProviders,
  saveProviders,
  providersConfigured,
  ProvidersMap
} from './services/secrets'
import {
  startSidecar,
  sidecarRequest,
  sidecarInfo,
  pushConfig,
  sidecarLog
} from './services/sidecar'
import { ENGINE_HOME } from './services/paths'
import {
  licenseState,
  checkLicense,
  activateLicense,
  forgetLicense,
  requireLicense,
  assertLicensed,
  libraryManifest,
  fxUpload,
  onLicenseChange
} from './services/license'
import { readState, writeState, planProviderOf, PlanProvider, jobLimitsOf, saveJobLimits, JobLimits } from './services/state'
import { mediaBase, mediaUrl } from './services/media-server'
import { startRender, cancelRender, renderStatus, browserInstalled } from './services/remotion'
import { readRunLog, appendRunLog, clearRunLog, runDir } from './services/runlog'
import {
  fetchLinks as miFetchLinks,
  openBrowser as miOpenBrowser,
  closeBrowser as miCloseBrowser,
  discardStaged as miDiscardStaged
} from './services/myinstants'
import { importMedia, missingFiles, insideDir, MediaKind } from './services/project-media'
import {
  listProjects,
  getProject,
  saveProject,
  deleteProject,
  projectDiskInfo,
  getCurrent,
  setCurrent,
  getOpenTabs,
  setOpenTabs,
  Project
} from './services/projects'

// Lap plan / phan tich video mau goi GPT nhieu luot lien tiep; muc suy nghi cao (Cai dat API)
// lam moi luot lau hon; hieu video nguon dai thi nen + cat + nhieu luot Gemini -> cho toi 2 gio
// thay vi 30 phut mac dinh.
const LONG_AI_MS = 2 * 60 * 60 * 1000
// Ma build (scripts/dist.mjs, ngay-gio dong goi) — '' khi dev / build thuong
declare const __APP_BUILD__: string
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : ''

function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'project'
  )
}

export function ensureWorkDir(name: string): string {
  const dir = join(ENGINE_HOME, 'projects', slugify(name) + '-' + Date.now().toString(36))
  mkdirSync(dir, { recursive: true })
  return dir
}

export function registerIpc(getWindow: () => BrowserWindow | null) {
  // ---- App / system ----
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    build: APP_BUILD,
    name: 'Agent Edit',
    engineHome: ENGINE_HOME
  }))

  // ---- Ban quyen (1 key = 1 may): kiem online luc mo app + luc bam "Phan tich video" ----
  onLicenseChange((st) => getWindow()?.webContents.send('license:changed', st))
  ipcMain.handle('license:state', () => licenseState())
  ipcMain.handle('license:check', () => checkLicense('open'))
  ipcMain.handle('license:activate', (_e, key: string) => activateLicense(String(key || '')))
  ipcMain.handle('license:forget', () => forgetLicense())

  // ---- Doctor ----
  // Chi dung khi tu kiem giao dien (chay kem --user-data-dir tam): coi moi dieu kien
  // la dat de mo khoa cac trang, KHONG doc Keychain, KHONG cai gi.
  const fakeChecks = (): DoctorCheck[] =>
    (['system', 'media', 'python', 'ai'] as const).map((group) => ({
      id: 'test_' + group,
      label: 'Tu kiem giao dien',
      status: 'ok',
      detail: 'STUDIO_FAKE_READY',
      purpose: 'STUDIO_FAKE_READY',
      fixable: false,
      group
    }))
  ipcMain.handle('doctor:run', async () => {
    if (process.env.STUDIO_FAKE_READY) return fakeChecks()
    return runDoctor(providersConfigured())
  })
  // Mo app: tu cai moi cong cu con thieu / sai phien ban (theo thu tu phu thuoc), bao tien trinh qua su kien
  ipcMain.handle('doctor:autoFix', async () => {
    if (process.env.STUDIO_FAKE_READY) return { checks: fakeChecks(), progress: autoFixStatus() }
    const win = getWindow()
    return autoFix(
      () => providersConfigured(),
      (id, line) => win?.webContents.send('doctor:log', { id, line }),
      (p) => win?.webContents.send('doctor:progress', p)
    )
  })
  ipcMain.handle('doctor:status', () => autoFixStatus())

  ipcMain.handle('doctor:fix', async (_e, id: string) => {
    const win = getWindow()
    const res = await fixCheck(id, (line) => {
      win?.webContents.send('doctor:log', { id, line })
    })
    return res
  })

  // ---- Settings / providers ----
  ipcMain.handle('settings:get', () => maskedProviders())
  ipcMain.handle('settings:save', async (_e, providers: ProvidersMap) => {
    saveProviders(providers)
    if (sidecarInfo().ready) await pushConfig()
    return maskedProviders()
  })
  // AI lap ke hoach (GPT / Claude) — luu state.json, sidecar doc lai moi lan lap plan
  ipcMain.handle('settings:getPlanner', () => planProviderOf(readState()))
  // Tao nhieu video cung luc: so video phan tich (Gemini) / lap plan (Claude) cung luc (src/lib/jobQueue.ts)
  ipcMain.handle('settings:getJobLimits', () => jobLimitsOf(readState()))
  ipcMain.handle('settings:setJobLimits', (_e, v: Partial<JobLimits>) => saveJobLimits(v || {}))
  ipcMain.handle('settings:setPlanner', (_e, v: PlanProvider) => {
    void v // lap ke hoach co dinh Claude (2026-10-01)
    writeState({ plan_provider: 'claude' })
    return planProviderOf(readState())
  })
  // Trang thai CLI chinh chu (Claude Code / Codex) cho che do goi subscription
  ipcMain.handle('settings:cliStatus', async (_e, name?: string) => {
    if (!sidecarInfo().ready) {
      const s = await startSidecar()
      if (!s.ok) return { ok: false, error: 'Sidecar chua san sang: ' + s.error }
    }
    return sidecarRequest('/cli_status', name ? { name } : {}, 120000)
  })

  ipcMain.handle('settings:test', async (_e, name: string, providers?: ProvidersMap) => {
    // luu tam neu co (de test gia tri chua save) + push
    if (providers) {
      saveProviders(providers)
      if (sidecarInfo().ready) await pushConfig()
    }
    if (!sidecarInfo().ready) {
      const s = await startSidecar()
      if (!s.ok) return { ok: false, error: 'Sidecar chua san sang: ' + s.error }
    }
    return sidecarRequest('/test_connection', { name })
  })

  // Dang nhap CLI ngay trong app (xem services/cli-login.ts): Codex (`codex login`) hoac Antigravity
  // CLI cho Gemini (mo Terminal chay `agy`; UI tu hoi lai trang thai). Duong dan binary + thu muc lam
  // viec luon lay tu sidecar (cli_status), khong nhan tu renderer.
  // fresh = bo cache 2s cua sidecar (vua dang nhap / dang xuat xong phai doc Keychain / Credential Manager that)
  const cliStatusOf = async (id: string, fresh = false) => {
    if (!sidecarInfo().ready) {
      const s = await startSidecar()
      if (!s.ok) return { error: 'Sidecar chua san sang: ' + s.error }
    }
    const r = await sidecarRequest('/cli_status', fresh ? { name: id, fresh: true } : { name: id }, 120000).catch(() => null)
    return { st: r?.status?.[id] }
  }
  ipcMain.handle('settings:cliLogin', async (_e, mode?: CliLoginMode, name?: string) => {
    const id = name === 'gemini' || name === 'claude' ? name : 'gpt'
    const label = CLI_PACKAGES[id].label
    const cur = await cliStatusOf(id)
    if (cur.error) return { ok: false, error: cur.error }
    const st = cur.st
    if (!st?.installed || !st?.path) return { ok: false, error: `Chưa cài ${label} trên máy.` }
    if (st.logged_in) return { ok: true, already: true }
    const win = getWindow()
    const send = (line: string) => win?.webContents.send('settings:cliLoginLog', line)
    if (id === 'gemini' || id === 'claude') {
      if (mode === 'device') {
        // Du phong: dang nhap trong cua so Terminal / PowerShell -> tra ngay; renderer hoi lai cli_status den khi xong
        const r = id === 'gemini' ? await openAgyLogin(st.path, st.workdir) : await openClaudeLogin(st.path)
        return r.ok ? { ok: true, terminal: true } : r
      }
      // Mac dinh: NGAY TRONG APP (giong Codex) — CLI chay an, tu mo trinh duyet, nhan ket qua qua localhost
      const res = id === 'gemini' ? await startAgyLogin(st.path, st.workdir, send) : await startClaudeLogin(st.path, send)
      if (res.canceled) return res
      // Ma thoat khong quyet dinh (agy bi dung som khi da co phien) -> hoi trang thai THAT
      const now = (await cliStatusOf(id)).st
      if (now?.logged_in) return { ok: true }
      const err = res.ok ? now?.detail || `${label} chưa ghi nhận đăng nhập.` : res.error
      // agy: loi de hieu + bao khi ban agy tren may KHAC ban da kiem (agy hay doi cach dang nhap giua cac ban)
      return { ok: false, error: id === 'gemini' ? agyFailureText(err, now?.version || st.version, 'login') : err }
    }
    const res = await startCodexLogin(st.path, mode === 'device' ? 'device' : 'browser', send)
    if (!res.ok) return res
    // Chi bao thanh cong khi trang thai that xac nhan da dang nhap (khong tin rieng ma thoat)
    const now = (await cliStatusOf(id)).st
    if (now?.logged_in) return { ok: true }
    return { ok: false, error: now?.detail || `${label} chưa ghi nhận đăng nhập. Thử lại hoặc đăng nhập trong Terminal.` }
  })
  // Dang xuat CLI (de dang nhap tai khoan khac) bang lenh chinh chu: codex logout / claude auth logout / agy /logout.
  // Chi bao thanh cong khi trang thai THAT (sidecar cli_status) xac nhan da het phien.
  ipcMain.handle('settings:cliLogout', async (_e, name?: string) => {
    const id = name === 'gemini' || name === 'claude' ? name : 'gpt'
    const label = CLI_PACKAGES[id].label
    const cur = await cliStatusOf(id)
    if (cur.error) return { ok: false, error: cur.error }
    const st = cur.st
    if (!st?.installed || !st?.path) return { ok: false, error: `Chưa cài ${label} trên máy.` }
    if (!st.logged_in) return { ok: true, already: true }
    const win = getWindow()
    const res = await startCliLogout(id, st.path, st.workdir, (line) => win?.webContents.send('settings:cliLoginLog', line))
    if (res.canceled) return res
    const now = (await cliStatusOf(id, true)).st
    if (now && !now.logged_in) return { ok: true }
    const err = res.ok ? `${label} vẫn báo đang đăng nhập — bấm “Kiểm tra lại” hoặc thử lại.` : res.error
    return { ok: false, error: id === 'gemini' ? agyFailureText(err, now?.version || st.version, 'logout') : err }
  })
  // Ma xac thuc nguoi dung dan vao (trang dang nhap hien ma thay vi tu xong) -> stdin cua CLI dang chay
  ipcMain.handle('settings:cliLoginInput', (_e, text: string) => ({ ok: sendCliInput(text) }))
  ipcMain.handle('settings:cliLoginCancel', () => {
    cancelCliTask()
    return { ok: true }
  })
  // Cap nhat Claude Code (`claude update`) — model moi (Opus 5.5 / Fable 5.1) can ban CLI moi hon
  ipcMain.handle('settings:cliUpdate', async (_e, name: string) => {
    if (name !== 'claude') return { ok: false, error: 'Chỉ cập nhật được Claude Code trong app.' }
    const cur = await cliStatusOf('claude')
    if (cur.error) return { ok: false, error: cur.error }
    if (!cur.st?.installed || !cur.st?.path) return { ok: false, error: 'Chưa cài Claude Code CLI trên máy.' }
    const before = cur.st.version
    const win = getWindow()
    const res = await startClaudeUpdate(cur.st.path, (line) => win?.webContents.send('settings:cliLoginLog', line))
    if (!res.ok) return res
    const now = (await cliStatusOf('claude')).st
    return { ok: true, version: now?.version, changed: !!now?.version && now.version !== before }
  })
  // Cai CLI chinh chu (Codex / Claude Code: bo cai cua Doctor, dung ban ghim; agy: trinh cai cua Google)
  ipcMain.handle('settings:cliInstall', async (_e, name: string) => {
    if (!CLI_PACKAGES[name]) return { ok: false, error: 'Không có gói CLI cho ' + name }
    const win = getWindow()
    const res = await startCliInstall(name, (line) => win?.webContents.send('settings:cliLoginLog', line))
    if (!res.ok) return res
    const now = (await cliStatusOf(name)).st
    if (now?.installed) return { ok: true, version: now.version }
    return {
      ok: false,
      error: 'Trình cài đã chạy xong nhưng app chưa tìm thấy lệnh ' + CLI_PACKAGES[name].bin + ' — bấm “Kiểm tra lại”.'
    }
  })
  // Chi mo link dang nhap chinh chu (CLI in ra khi trinh duyet khong tu mo)
  ipcMain.handle('settings:openLoginUrl', (_e, url: string) => {
    try {
      const u = new URL(String(url))
      if (u.protocol === 'https:' && ['auth.openai.com', 'chatgpt.com', 'accounts.google.com', 'claude.com', 'claude.ai',
        'platform.claude.com', 'console.anthropic.com'].includes(u.hostname)) {
        return shell.openExternal(u.toString())
      }
    } catch {
      /* url hong -> bo qua */
    }
    return false
  })

  // ---- Sidecar ----
  ipcMain.handle('sidecar:start', async () => {
    const win = getWindow()
    return startSidecar((l) => win?.webContents.send('sidecar:log', l))
  })
  ipcMain.handle('sidecar:status', () => sidecarInfo())
  ipcMain.handle('sidecar:log', () => sidecarLog())

  // ---- File dialog ----
  ipcMain.handle('dialog:pickVideo', async () => {
    const win = getWindow()
    if (!win) return { canceled: true }
    const res = await dialog.showOpenDialog(win, {
      title: 'Chon cac video nguon',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'] }]
    })
    return res
  })
  ipcMain.handle('dialog:pickReferenceVideo', async () => {
    const win = getWindow()
    if (!win) return { canceled: true }
    return dialog.showOpenDialog(win, {
      title: 'Chon video mau tham khao',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'] }]
    })
  })

  // Tu lieu cua nguoi dung: anh + video de chen LEN video dang edit
  ipcMain.handle('dialog:pickInsertMedia', async () => {
    const win = getWindow()
    if (!win) return { canceled: true }
    return dialog.showOpenDialog(win, {
      title: 'Chon anh / video muon chen len video',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Anh / video',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'avif', 'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']
        }
      ]
    })
  })

  ipcMain.handle('dialog:pickOneVideo', async (_e, title?: string) => {
    const win = getWindow()
    if (!win) return { canceled: true }
    return dialog.showOpenDialog(win, {
      title: title || 'Chon video',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'] }]
    })
  })

  // Kho Text: chon 1 thu muc mau (template.json + preview.mp4 + fonts/ + audio/ + assets/) de dang ky vao kho
  ipcMain.handle('dialog:pickFolder', async (_e, title?: string) => {
    const win = getWindow()
    if (!win) return { canceled: true }
    return dialog.showOpenDialog(win, {
      title: title || 'Chọn thư mục',
      properties: ['openDirectory']
    })
  })

  // ---- Video cua du an: chep vao thu muc du an (project-media.ts) ----
  ipcMain.handle(
    'media:import',
    async (_e, workDir: string, paths: string[], kind: MediaKind, names?: (string | undefined)[]) => {
      // chi ghi vao thu muc du an cua app (~/.capcut-studio/projects/...)
      if (!workDir || !insideDir(workDir, join(ENGINE_HOME, 'projects')) || workDir === join(ENGINE_HOME, 'projects'))
        return { ok: false, items: [], error: 'Thư mục dự án không hợp lệ: ' + workDir }
      if (kind !== 'source' && kind !== 'reference' && kind !== 'insert')
        return { ok: false, items: [], error: 'Loại tệp không hợp lệ' }
      mkdirSync(workDir, { recursive: true })
      const items = await importMedia(workDir, Array.isArray(paths) ? paths : [], kind, names)
      return { ok: items.every((it) => !!it.path), items }
    }
  )
  ipcMain.handle('media:missing', (_e, paths: string[]) => missingFiles(Array.isArray(paths) ? paths : []))

  // ---- SFX ----
  ipcMain.handle('sfx:find', async (_e, params: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/find_sfx', params)
  })

  // ---- Thu muc lam viec + hieu video nguon (Gemini) ----
  ipcMain.handle('pipeline:newWorkDir', (_e, name: string) => ensureWorkDir(name))
  ipcMain.handle('pipeline:understandSources', async (_e, payload: unknown) => {
    await requireLicense() // bam "Phan tich video" -> hoi may chu ban quyen (key bi khoa = dung ngay)
    if (!sidecarInfo().ready) await startSidecar()
    // Video dai: nen 720p + cat nhieu phan + nhieu luot Gemini + buoc ghep -> co the qua 30 phut
    return sidecarRequest('/understand_sources', payload, LONG_AI_MS)
  })

  // Chi mo THU MUC (thu muc du an): Windows openPath tren .exe / .bat / .lnk se CHAY file do
  ipcMain.handle('shell:openPath', (_e, p: string) => {
    try {
      if (typeof p !== 'string' || !isAbsolute(p) || !statSync(p).isDirectory()) return 'Chỉ mở được thư mục.'
    } catch {
      return 'Không thấy thư mục.'
    }
    return shell.openPath(p)
  })

  // ---- Nhat ky xu ly theo tung lan tao video (xem services/runlog.ts) ----
  ipcMain.handle('runlog:read', (_e, runId: string, offset?: number) => readRunLog(runId, offset || 0))
  ipcMain.handle('runlog:append', (_e, runId: string, ev: { title: string; [k: string]: unknown }) => {
    try {
      appendRunLog(runId, ev)
    } catch {
      /* log khong bao gio duoc lam hong pipeline */
    }
  })
  ipcMain.handle('runlog:clear', (_e, runId: string) => clearRunLog(runId))
  ipcMain.handle('runlog:openDir', (_e, runId: string) => {
    const d = runDir(runId)
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
    return shell.openPath(d)
  })

  // ---- Prompt & quy tac (xem sidecar/prompt_store.py) ----
  // Loi kiem tra (400) tra ve {ok:false,error} de UI hien nguyen cau, khong boc "Error invoking..."
  const promptsCall = async (path: string, payload: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    try {
      return await sidecarRequest(path, payload ?? {})
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  ipcMain.handle('prompts:list', () => promptsCall('/prompts/list', {}))
  ipcMain.handle('prompts:save', (_e, payload: unknown) => promptsCall('/prompts/save', payload))
  ipcMain.handle('prompts:reset', (_e, payload: unknown) => promptsCall('/prompts/reset', payload))

  // ---- Kho meme (b-roll chen) ----
  ipcMain.handle('meme:list', async () => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/meme/list')
  })
  ipcMain.handle('meme:fetch', async (_e, payload: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/meme/fetch', payload)
  })
  ipcMain.handle('meme:import', async (_e, payload: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/meme/import', payload)
  })
  ipcMain.handle('meme:label', async (_e, id: string) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/meme/label', { id })
  })
  ipcMain.handle('meme:update', async (_e, payload: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/meme/update', payload)
  })
  ipcMain.handle('meme:delete', async (_e, id: string) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/meme/delete', { id })
  })

  // ---- Kho Text (mau chu dong, chuyen tu preset CapCut) ----
  ipcMain.handle('text:list', async () => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/text/list')
  })
  ipcMain.handle('text:register', async (_e, dir: string) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/text/register', { dir })
  })
  ipcMain.handle('text:label', async (_e, id: string) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/text/label', { id })
  })
  ipcMain.handle('text:update', async (_e, payload: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/text/update', payload)
  })
  ipcMain.handle('text:delete', async (_e, id: string) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/text/delete', { id })
  })

  // ---- Kho am thanh (SFX) ----
  ipcMain.handle('sfx:list', async () => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/sfx/list')
  })
  ipcMain.handle('sfx:searchOnline', async (_e, query: string) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/sfx/search_online', { query })
  })
  ipcMain.handle('sfx:addOnline', async (_e, payload: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/sfx/add_online', payload)
  })
  ipcMain.handle('sfx:importLocal', async (_e, payload: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/sfx/import_local', payload)
  })
  ipcMain.handle('sfx:update', async (_e, payload: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/sfx/update', payload)
  })
  ipcMain.handle('sfx:label', async (_e, ids: string[]) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/sfx/label', { ids })
  })
  ipcMain.handle('sfx:delete', async (_e, id: string) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest('/sfx/delete', { id })
  })
  // ---- Myinstants: tai bang tang trinh duyet that (Cloudflare chan curl/python) ----
  ipcMain.handle('sfx:fetchLinks', async (_e, links: string[]) => {
    try {
      return await miFetchLinks(Array.isArray(links) ? links : [])
    } catch (err) {
      return { ok: false, items: [], failed: [{ url: '', reason: String(err) }] }
    }
  })
  ipcMain.handle('sfx:openMyinstants', () => {
    const win = getWindow()
    miOpenBrowser((item) => win?.webContents.send('sfx:staged', item))
    return { ok: true }
  })
  ipcMain.handle('sfx:discardStaged', (_e, paths: string[]) =>
    miDiscardStaged(Array.isArray(paths) ? paths : [])
  )
  ipcMain.handle('sfx:closeMyinstants', () => {
    miCloseBrowser()
    return { ok: true }
  })

  ipcMain.handle('dialog:pickAudio', async () => {
    const win = getWindow()
    if (!win) return { canceled: true }
    return dialog.showOpenDialog(win, {
      title: 'Chọn file âm thanh',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] }]
    })
  })

  // ---- Kho nhac nen (sidecar music_lib.py) ----
  const musicCall = async (path: string, payload?: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest(path, payload)
  }
  ipcMain.handle('music:list', () => musicCall('/music/list'))
  ipcMain.handle('music:import', (_e, items: unknown) => musicCall('/music/import', { items: Array.isArray(items) ? items : [] }))
  ipcMain.handle('music:update', (_e, payload: unknown) => musicCall('/music/update', payload))
  ipcMain.handle('music:delete', (_e, id: string) => musicCall('/music/delete', { id }))
  ipcMain.handle('music:label', (_e, ids: string[]) => musicCall('/music/label', { ids }))
  ipcMain.handle('music:settings', (_e, payload: unknown) => musicCall('/music/settings', payload))
  ipcMain.handle('music:previewVolume', (_e, id: string) => musicCall('/music/preview_volume', { id }))
  ipcMain.handle('dialog:pickMusic', async () => {
    const win = getWindow()
    if (!win) return { canceled: true }
    return dialog.showOpenDialog(win, {
      title: 'Chọn file nhạc nền',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }]
    })
  })

  // ---- Thu vien phan tich (video nguon / video mau da phan tich) ----
  const libCall = async (path: string, payload?: unknown) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest(path, payload)
  }
  ipcMain.handle('library:list', () => libCall('/library/list'))
  ipcMain.handle('library:lookup', (_e, paths: string[]) => libCall('/library/lookup', { paths }))
  ipcMain.handle('library:delete', (_e, fp: string, part?: string) => libCall('/library/delete', { fp, part }))
  // Dong bo kho SFX + Meme + Text + Nhac nen + Hieu ung (nut "Dong bo kho" + tu chay nen luc mo app): CHI qua may chu ban quyen —
  // key dang kich hoat dung may nay moi nhan duoc manifest + link tai tam (bucket R2 khong con cong khai)
  // MOT luot dong bo tai 1 thoi diem: luot tu chay luc mo app dang do ma nguoi dung bam nut -> nhan chung ket qua (2 luot
  // song song cung ghi *_library.json -> mat du lieu). Bat dau / xong -> su kien 'library:syncState' de cac trang Tai
  // nguyen hien "Dang dong bo…" va tai lai danh sach (trang mo TRUOC khi luot mo app xong van thay muc moi).
  let libSync: Promise<Record<string, unknown>> | null = null
  // Ket qua luot gan nhat (Doctor hien "Dong bo tai nguyen": dang dong bo / xong / loi) — at = luc xong
  let libLast: { result: unknown; at: number } | null = null
  const syncState = (running: boolean, result?: unknown) => {
    if (!running) libLast = { result, at: Date.now() }
    getWindow()?.webContents.send('library:syncState', { running, result, at: libLast?.at })
  }
  ipcMain.handle('library:sync', () => {
    if (libSync) return libSync
    syncState(true)
    libSync = (async () => {
      try {
        const manifest = await libraryManifest()
        return (await libCall('/library/sync', { manifest })) as Record<string, unknown>
      } catch (e) {
        return { ok: false, error: String((e as Error).message || e) }
      }
    })().then((r) => {
      libSync = null
      syncState(false, r)
      return r
    })
    return libSync
  })
  ipcMain.handle('library:syncRunning', () => !!libSync)
  ipcMain.handle('library:syncStatus', () => ({ running: !!libSync, result: libLast?.result, at: libLast?.at }))

  // ---- Projects (luu/khoi phuc du an) ----
  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:get', (_e, id: string) => getProject(id))
  ipcMain.handle('projects:save', (_e, p: Project) => saveProject(p))
  ipcMain.handle('projects:diskInfo', (_e, id: string) => projectDiskInfo(id))
  ipcMain.handle('projects:delete', async (_e, id: string, withFiles?: boolean) => {
    if (withFiles) {
      // Dang render vao thu muc du an -> khong dua thu muc vao Thung rac giua chung
      const r = renderStatus() as { running: boolean; output?: string }
      const wd = getProject(id)?.workDir
      if (r.running && r.output && wd && insideDir(r.output, wd)) {
        return { ok: false, trashed: [], error: 'Dự án đang render — đợi render xong (hoặc huỷ) rồi xoá.' }
      }
    }
    return deleteProject(id, { withFiles: !!withFiles })
  })
  // mode: 'remotion' -> con tro "dang lam" rieng cua menu Video Remotion
  ipcMain.handle('projects:current', (_e, mode?: string) => getCurrent(mode))
  ipcMain.handle('projects:setCurrent', (_e, id: string | null, mode?: string) => setCurrent(id, mode))
  // Cac the video dang mo o "Tao video" (mo lai app van con)
  ipcMain.handle('projects:openTabs', () => getOpenTabs())
  ipcMain.handle('projects:setOpenTabs', (_e, ids: string[], active?: string | null) => setOpenTabs(ids, active))

  // ---- Video Remotion ----
  const rmCall = async (path: string, payload?: unknown, timeoutMs?: number) => {
    if (!sidecarInfo().ready) await startSidecar()
    return sidecarRequest(path, payload, timeoutMs)
  }
  // Video mau + tu lieu chay CUNG LUC voi video nguon khi bam "Phan tich video" -> cung kiem key
  // (requireLicense dung lai ket qua vua kiem < 20s, khong hoi server 3 lan)
  ipcMain.handle('remotion:understandReference', async (_e, payload: unknown) => {
    await requireLicense()
    return rmCall('/remotion/understand_reference', payload, LONG_AI_MS)
  })
  // Tu lieu cua nguoi dung: Gemini doc tung anh / video + may do kich thuoc (moi tu lieu vai chuc giay)
  ipcMain.handle('remotion:understandMedia', async (_e, payload: unknown) => {
    await requireLicense()
    return rmCall('/remotion/understand_media', payload, LONG_AI_MS)
  })
  ipcMain.handle('remotion:autoplan', (_e, payload: unknown) => rmCall('/remotion/autoplan', payload, LONG_AI_MS))

  // ---- KHO HIEU UNG tu viet (2026-10-05): bo dieu phoi nen o renderer (src/lib/fxHarvest.ts) goi lan luot:
  // dong goi (sau render) -> preview (lan render, chi khi ranh) -> Gemini nhan (lan gemini) -> gui kho chung ----
  ipcMain.handle('fxlib:list', () => rmCall('/fxlib/list'))
  ipcMain.handle('fxlib:harvest', (_e, payload: unknown) => rmCall('/fxlib/harvest', payload))
  ipcMain.handle('fxlib:renderPreview', async (_e, id: string) => {
    const job = (await rmCall('/fxlib/preview_job', { id })) as {
      ok?: boolean
      spec?: Record<string, unknown>
      out?: string
      error?: string
    }
    if (!job?.ok || !job.spec || !job.out) return { ok: false, error: job?.error || 'Không chuẩn bị được preview' }
    if ((renderStatus() as { running: boolean }).running) return { ok: false, busy: true, error: 'Đang render video khác' }
    // 540x960 khong tieng: du cho Gemini xem + UI phat, render ~10-20s
    const res = await startRender(job.spec, job.out, () => undefined, { compositionId: 'FxPreview', scale: 0.5, muted: true })
    const ok = res.type === 'done'
    const error = ok ? undefined : String(res.message || res.type).split('\n')[0].slice(0, 300)
    if (res.type !== 'cancelled') await rmCall('/fxlib/preview_done', { id, ok, error })
    return { ok, error, cancelled: res.type === 'cancelled' }
  })
  ipcMain.handle('fxlib:label', (_e, ids: string[]) => rmCall('/fxlib/label', { ids }, LONG_AI_MS))
  // Gui kho chung qua may chu ban quyen (may tin cay tu duyet, may khach cho duyet). Loi tam thoi (mat mang...)
  // -> khong danh dau, lan mo app sau thu lai; loi han (goi hong / key khoa...) -> danh dau loi, nut "Thu lai"
  ipcMain.handle('fxlib:share', async (_e, id: string) => {
    const r = (await rmCall('/fxlib/share_payload', { id })) as {
      ok?: boolean
      payload?: { meta: Record<string, unknown>; code: string; preview: string }
    }
    if (!r?.ok || !r.payload) {
      await rmCall('/fxlib/share_done', { id, status: 'error', error: 'Thiếu preview / nhãn / code' })
      return { ok: false, error: 'Thiếu preview / nhãn / code' }
    }
    const res = await fxUpload(r.payload)
    if (res.ok) await rmCall('/fxlib/share_done', { id, status: res.status })
    else if (!res.retry) await rmCall('/fxlib/share_done', { id, status: 'error', error: res.message || res.code })
    return { ok: res.ok, status: res.status, error: res.message, retry: res.retry }
  })
  ipcMain.handle('fxlib:retry', (_e, id: string) => rmCall('/fxlib/retry', { id }))
  ipcMain.handle('fxlib:toggle', (_e, id: string, disabled: boolean) => rmCall('/fxlib/toggle', { id, disabled }))
  ipcMain.handle('fxlib:delete', (_e, id: string) => rmCall('/fxlib/delete', { id }))
  ipcMain.handle('remotion:spec', (_e, payload: unknown) => rmCall('/remotion/spec', payload))
  ipcMain.handle('remotion:catalog', () => rmCall('/remotion/catalog'))
  // Goc URL may chu media cuc bo — Player trong app tai video nguon qua day
  ipcMain.handle('remotion:mediaBase', () => mediaBase())
  ipcMain.handle('remotion:mediaUrl', (_e, path: string) => mediaUrl(path))
  ipcMain.handle(
    'remotion:render',
    async (
      _e,
      payload: { spec: Record<string, unknown>; workDir?: string; name?: string; _run?: { id: string } }
    ) => {
      assertLicensed() // khong hoi server (chi 2 luc: mo app + phan tich) — lan kiem gan nhat phai OK
      const dir =
        payload.workDir && existsSync(payload.workDir) ? payload.workDir : ensureWorkDir(payload.name || 'remotion')
      const d = new Date()
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
      const out = join(dir, `${slugify(payload.name || 'video')}-${stamp}.mp4`)
      const win = getWindow()
      // Render chay trong app (khong qua sidecar) -> tu ghi nhat ky xu ly cua project
      const runId = payload._run?.id
      const log = (title: string, level = 'info', extra: Record<string, unknown> = {}) => {
        if (!runId) return
        try {
          appendRunLog(runId, { kind: 'note', step: 'render', title, level, ...extra })
        } catch {
          /* log khong bao gio duoc lam hong render */
        }
      }
      const spec = payload.spec as { duration?: number; clips?: unknown[]; captions?: unknown[]; effects?: unknown[]; audio?: unknown[] }
      log(`Bắt đầu render MP4 bằng Remotion (${Math.round(spec.duration || 0)}s video)`, 'info', {
        output: out,
        so_doan: spec.clips?.length,
        so_caption: spec.captions?.length,
        so_hieu_ung: spec.effects?.length,
        so_sfx: spec.audio?.length
      })
      let lastStage = ''
      let lastMoc = -1
      const t0 = Date.now()
      const res = await startRender(payload.spec, out, (ev) => {
        win?.webContents.send('remotion:progress', ev)
        if (ev.type === 'log' && ev.message) log(ev.message)
        if (ev.type !== 'progress') return
        if (ev.stage && ev.stage !== lastStage) {
          lastStage = ev.stage
          const ten: Record<string, string> = {
            browser: 'Tải trình render Chrome Headless (chỉ lần đầu)',
            prepare: 'Chuẩn bị bản dựng (nạp composition, font, media)',
            render: 'Đang vẽ từng khung hình',
            encode: 'Đang ghép khung hình + âm thanh thành MP4'
          }
          log(ten[ev.stage] || ev.stage)
        }
        const moc = Math.floor(((ev.progress || 0) * 100) / 25) * 25
        if (ev.stage === 'render' && moc > lastMoc && moc > 0 && moc < 100) {
          lastMoc = moc
          log(`Render ${moc}% (khung ${ev.renderedFrames ?? 0}/${ev.totalFrames ?? '?'})`)
        }
      })
      const giay = Math.round((Date.now() - t0) / 1000)
      if (res.type === 'done') {
        log(`Render xong sau ${giay}s — ${((res.size || 0) / 1e6).toFixed(1)} MB`, 'ok', { output: res.output })
      } else if (res.type === 'cancelled') {
        log(`Đã huỷ render sau ${giay}s`, 'warn')
      } else {
        log('Render lỗi', 'error', { error: res.message })
      }
      return res
    }
  )
  ipcMain.handle('remotion:cancel', () => cancelRender())
  ipcMain.handle('remotion:status', () => ({ ...renderStatus(), browserInstalled: browserInstalled() }))
  ipcMain.handle('remotion:saveAs', async (_e, src: string, name?: string) => {
    const win = getWindow()
    if (!win || !src || !existsSync(src)) return { ok: false, error: 'Không thấy file video' }
    const res = await dialog.showSaveDialog(win, {
      title: 'Lưu video',
      // thu muc Video cua he dieu hanh (macOS ~/Movies, Windows %USERPROFILE%\Videos)
      defaultPath: join(app.getPath('videos'), name ? `${slugify(name)}.mp4` : basename(src)),
      filters: [{ name: 'Video MP4', extensions: ['mp4'] }]
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    copyFileSync(src, res.filePath)
    return { ok: true, path: res.filePath }
  })
  ipcMain.handle('shell:showItem', (_e, p: string) => shell.showItemInFolder(p))
}
