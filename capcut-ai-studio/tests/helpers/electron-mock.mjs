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
export const app = {
  // globalThis.__PACKAGED / __APP_VERSION: test tu cap nhat gia lap ban dong goi
  get isPackaged() {
    return !!globalThis.__PACKAGED
  },
  getPath: (n) => (n === 'userData' && globalThis.__USERDATA) || '/tmp',
  getAppPath: () => process.cwd(),
  getVersion: () => globalThis.__APP_VERSION || '0.0.0-test',
  // ghi lai thay vi thoat that (globalThis.__APP_CALLS)
  quit: () => (globalThis.__APP_CALLS ||= []).push('quit'),
  exit: (c) => (globalThis.__APP_CALLS ||= []).push('exit:' + c)
}
export class UtilityProcess {}
export const utilityProcess = {
  fork() {
    throw new Error('utilityProcess khong co trong test')
  }
}
// globalThis.__SAFE_STORAGE = true -> ma hoa gia lap gan voi "may" globalThis.__MACHINE (doi may = khong giai ma duoc)
export const safeStorage = {
  isEncryptionAvailable: () => !!globalThis.__SAFE_STORAGE,
  encryptString: (s) => Buffer.from(`MOCK:${globalThis.__MACHINE || 'A'}:` + Buffer.from(s).toString('base64')),
  decryptString: (b) => {
    const [tag, machine, data] = String(b).split(':')
    if (tag !== 'MOCK' || machine !== (globalThis.__MACHINE || 'A')) throw new Error('Error while decrypting the ciphertext')
    return Buffer.from(data, 'base64').toString()
  }
}
export const net = { fetch: (...a) => fetch(...a) }
export default { shell, app, safeStorage, net, utilityProcess }
