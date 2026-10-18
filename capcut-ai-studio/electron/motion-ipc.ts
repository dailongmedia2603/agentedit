// IPC cua "Tao video" + "Automation Video" + SaydiVoice (2026-10-14). Tach khoi electron/ipc.ts (Edit Video) de 2 luong
// khong dung nhau. Kenh: motion:* / automation:* / saydi:*; su kien: motion:job, automation:changed.
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mediaUrl } from './services/media-server'
import { findBinary } from './services/env'
import { loadProviders } from './services/secrets'
import {
  busyMotionIds,
  cancelMotionJob,
  createMotionJob,
  deleteMotionJob,
  getMotionJob,
  listMotionJobs,
  motionLimit,
  motionLog,
  onMotionJob,
  onMotionRemoved,
  rerunMotionJob,
  setMotionLimit
} from './services/motion/runner'
import { openTabs, setOpenTabs } from './services/motion/store'
import { chromeStatus, ffmpegPath, pythonStatus, DEFAULT_CLAUDE_MODEL } from './services/motion/tools'
import { listSaydiVoices, saydiMasked, saydiPreviewFile, setSaydiKey, testSaydiKey, SAYDI_SITE } from './services/motion/saydi'
import {
  checkAutoProject,
  deleteAutoProject,
  onAutomationChange,
  publicProjects,
  saveAutoProject,
  testAutoSource,
  toggleAutoProject
} from './services/motion/automation'
import { VIDEO_TYPES } from './services/motion/prompt'
import { mvdStatus } from './services/motion/mvd'
import type { MotionBrief } from './services/motion/types'

const errOf = (e: unknown) => String((e as Error)?.message || e)

export function registerMotionIpc(getWindow: () => BrowserWindow | null): void {
  onMotionJob((job) => getWindow()?.webContents.send('motion:job', job))
  onMotionRemoved((id) => getWindow()?.webContents.send('motion:removed', id))
  onAutomationChange((list) => getWindow()?.webContents.send('automation:changed', list))

  // ---- Tao video ----
  ipcMain.handle('motion:meta', () => ({ videoTypes: VIDEO_TYPES.map(({ id, label }) => ({ id, label })), saydiSite: SAYDI_SITE }))
  ipcMain.handle('motion:check', () => {
    const cfg = loadProviders().claude
    const claudeBin = findBinary('claude')
    const py = pythonStatus()
    const chrome = chromeStatus()
    return {
      claude: {
        installed: !!claudeBin,
        mode: cfg?.auth_mode === 'api_key' ? 'api_key' : 'subscription',
        hasKey: !!cfg?.api_key,
        model: (cfg?.auth_mode === 'api_key' ? cfg?.model : cfg?.sub_model) || DEFAULT_CLAUDE_MODEL
      },
      saydi: saydiMasked(),
      python: py,
      ffmpeg: { ok: !!ffmpegPath() },
      chrome,
      mvd: (({ available, version, elevenlabs }) => ({ available, version, elevenlabs }))(mvdStatus())
    }
  })
  ipcMain.handle('motion:list', (_e, filter?: { kind?: 'single' | 'auto'; automationId?: string }) => listMotionJobs(filter || {}))
  ipcMain.handle('motion:get', (_e, id: string) => getMotionJob(String(id)) || null)
  ipcMain.handle('motion:create', async (_e, brief: MotionBrief) => {
    try {
      return { ok: true, job: await createMotionJob(brief, { kind: 'single' }) }
    } catch (e) {
      return { ok: false, error: errOf(e) }
    }
  })
  ipcMain.handle('motion:rerun', (_e, id: string) => {
    try {
      return { ok: true, job: rerunMotionJob(String(id)) }
    } catch (e) {
      return { ok: false, error: errOf(e) }
    }
  })
  ipcMain.handle('motion:cancel', (_e, id: string) => ({ ok: cancelMotionJob(String(id)) }))
  ipcMain.handle('motion:delete', (_e, id: string) => deleteMotionJob(String(id)))
  ipcMain.handle('motion:log', (_e, id: string, from?: number) => motionLog(String(id), Number(from) || 0))
  ipcMain.handle('motion:busy', () => busyMotionIds())
  ipcMain.handle('motion:openTabs', () => openTabs())
  ipcMain.handle('motion:setOpenTabs', (_e, ids: string[], active: string | null) => setOpenTabs(Array.isArray(ids) ? ids : [], active || null))
  ipcMain.handle('motion:getLimit', () => motionLimit())
  ipcMain.handle('motion:setLimit', (_e, n: number) => setMotionLimit(n))
  ipcMain.handle('motion:pickAssets', async () => {
    const win = getWindow()
    const opts = {
      title: 'Chọn logo / ảnh sản phẩm / ảnh chụp màn hình',
      properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
      filters: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? [] : r.filePaths
  })

  // ---- SaydiVoice ----
  ipcMain.handle('saydi:openSite', () => shell.openExternal(SAYDI_SITE))
  ipcMain.handle('saydi:get', () => saydiMasked())
  ipcMain.handle('saydi:save', (_e, key: string) => {
    setSaydiKey(String(key || ''))
    return saydiMasked()
  })
  ipcMain.handle('saydi:test', (_e, key?: string) => testSaydiKey(key ? String(key) : undefined))
  ipcMain.handle('saydi:voices', async (_e, force?: boolean) => {
    try {
      return { ok: true, ...(await listSaydiVoices(!!force)) }
    } catch (e) {
      return { ok: false, error: errOf(e), voices: [] }
    }
  })
  ipcMain.handle('saydi:preview', async (_e, id: string, custom?: boolean) => {
    try {
      const file = await saydiPreviewFile(String(id), !!custom)
      return { ok: true, url: await mediaUrl(file) }
    } catch (e) {
      return { ok: false, error: errOf(e) }
    }
  })

  // ---- Automation Video ----
  ipcMain.handle('automation:list', () => publicProjects())
  ipcMain.handle('automation:save', (_e, p: unknown) => {
    try {
      return { ok: true, project: saveAutoProject((p || {}) as never) }
    } catch (e) {
      return { ok: false, error: errOf(e) }
    }
  })
  ipcMain.handle('automation:delete', (_e, id: string) => {
    deleteAutoProject(String(id))
    return { ok: true }
  })
  ipcMain.handle('automation:toggle', (_e, id: string, enabled: boolean) => {
    toggleAutoProject(String(id), !!enabled)
    return { ok: true }
  })
  ipcMain.handle('automation:checkNow', (_e, id: string) => checkAutoProject(String(id), true))
  ipcMain.handle('automation:testSource', (_e, s: unknown) => testAutoSource((s || {}) as never))
}
