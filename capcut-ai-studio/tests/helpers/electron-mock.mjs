// Gia lap toi thieu cua 'electron' cho test service chay bang Node.
// shell.trashItem: chuyen vao globalThis.__TRASH_DIR (neu co) va ghi lai; __TRASH_FAIL = nem loi.
import { renameSync, mkdirSync } from 'fs'
import { basename, join } from 'path'
export const trashed = []
export const shell = {
  async trashItem(p) {
    if (globalThis.__TRASH_FAIL) throw new Error('trash bi tu choi (gia lap)')
    trashed.push(p)
    if (globalThis.__TRASH_DIR) {
      mkdirSync(globalThis.__TRASH_DIR, { recursive: true })
      renameSync(p, join(globalThis.__TRASH_DIR, basename(p) + '-' + trashed.length))
    }
  },
  async openPath() { return '' },
  // ghi lai link duoc mo (khong mo trinh duyet that) — globalThis.__OPENED
  async openExternal(u) { (globalThis.__OPENED ||= []).push(u) }
}
export const app = { isPackaged: false, getPath: () => '/tmp', getAppPath: () => process.cwd() }
export const safeStorage = { isEncryptionAvailable: () => false }
export default { shell, app, safeStorage }
