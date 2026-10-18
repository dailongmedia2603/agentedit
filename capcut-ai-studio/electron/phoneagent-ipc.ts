// IPC "Phone Agent" — dang video len kenh qua iPhone (2026-10-19). Kenh phoneagent:*; su kien phoneagent:posts.
import { BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { extname } from 'path'
import { mediaUrl } from './services/media-server'
import { PHONEAGENT_SITE, getToken, phoneAgentMasked, setPhoneAgentConfig } from './services/phoneagent/client'
import { paDevices, paMe, paScriptFields, paScripts } from './services/phoneagent/api'
import { cancelPost, createPost, deletePost, listPosts, onPostsChange, reschedulePost, retryPost, type NewPost } from './services/phoneagent/posts'
import { getMotionJob } from './services/motion/runner'
import { templateContext } from './services/phoneagent/auto'

const errOf = (e: unknown) => String((e as Error)?.message || e)

export function registerPhoneAgentIpc(getWindow: () => BrowserWindow | null): void {
  onPostsChange((list) => getWindow()?.webContents.send('phoneagent:posts', list))

  ipcMain.handle('phoneagent:openSite', () => shell.openExternal(PHONEAGENT_SITE))
  ipcMain.handle('phoneagent:get', () => phoneAgentMasked())
  ipcMain.handle('phoneagent:save', (_e, cfg: { token?: string; base?: string }) => {
    setPhoneAgentConfig({ token: cfg?.token, base: cfg?.base })
    return phoneAgentMasked()
  })
  // token / base dang go (chua luu) hoac da luu
  ipcMain.handle('phoneagent:test', async (_e, cfg?: { token?: string; base?: string }) => {
    const token = cfg?.token?.trim() || undefined
    if (!token && !getToken()) return { ok: false, error: 'Chưa nhập API token Phone Agent.' }
    if (token && !token.startsWith('pa_live_')) return { ok: false, error: 'API token phải bắt đầu bằng pa_live_ (lấy ở Phone Agent > Cài đặt > Profile > API Token).' }
    try {
      const me = await paMe(token, cfg?.base?.trim() || undefined)
      const st = me.stats
      return {
        ok: true,
        name: me.name,
        email: me.email,
        detail: `Kết nối OK · ${me.name || me.email}${st ? ` · ${st.onlineDevices}/${st.totalDevices} iPhone online · ${st.totalScripts} kịch bản` : ''}`
      }
    } catch (e) {
      return { ok: false, error: errOf(e) }
    }
  })
  ipcMain.handle('phoneagent:devices', async () => {
    try {
      return { ok: true, devices: await paDevices() }
    } catch (e) {
      return { ok: false, error: errOf(e), devices: [] }
    }
  })
  ipcMain.handle('phoneagent:scripts', async () => {
    try {
      return { ok: true, scripts: await paScripts() }
    } catch (e) {
      return { ok: false, error: errOf(e), scripts: [] }
    }
  })
  ipcMain.handle('phoneagent:scriptFields', async (_e, id: string) => {
    try {
      return { ok: true, ...(await paScriptFields(String(id))) }
    } catch (e) {
      return { ok: false, error: errOf(e) }
    }
  })

  ipcMain.handle('phoneagent:posts', (_e, filter?: { refId?: string; automationId?: string }) => listPosts(filter || {}))
  ipcMain.handle('phoneagent:create', (_e, input: NewPost) => {
    try {
      const v = String(input?.video || '')
      if (!['.mp4', '.mov', '.m4v'].includes(extname(v).toLowerCase()) || !existsSync(v)) throw new Error('File video không hợp lệ hoặc không còn trên máy.')
      return { ok: true, post: createPost(input) }
    } catch (e) {
      return { ok: false, error: errOf(e) }
    }
  })
  ipcMain.handle('phoneagent:cancel', (_e, id: string) => cancelPost(String(id)))
  ipcMain.handle('phoneagent:retry', (_e, id: string, at?: number) => retryPost(String(id), at ? Number(at) : undefined))
  ipcMain.handle('phoneagent:delete', (_e, id: string) => deletePost(String(id)))
  ipcMain.handle('phoneagent:reschedule', (_e, id: string, at: number) => reschedulePost(String(id), Number(at)))
  ipcMain.handle('phoneagent:shotUrl', async (_e, file: string) => {
    if (!file || !existsSync(file)) return ''
    return mediaUrl(file)
  })
  // mau caption cho video "Tao video" / "Automation Video" ({title} {summary} {link} ...)
  ipcMain.handle('phoneagent:motionContext', (_e, jobId: string) => {
    const j = getMotionJob(String(jobId))
    return j ? templateContext(j) : null
  })
}
