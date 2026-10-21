// Tach 1 tien trinh app (khong cua so) chay 1 viec nen cua CLI (`__run-job` / `__run-setup` / `__run-login`) — dung chung
// cho lenh CLI (`make`, `setup --background`...) va bot Telegram (chay trong tien trinh giao dien / dich vu nen).
import { app } from 'electron'
import { spawn } from 'child_process'
import { openSync } from 'fs'
import { jobLog } from './jobs'
import { CLI_FLAG } from './util'

/** Tham so app can giu cho tien trinh con (vd --user-data-dir khi tu kiem) — ban dev: them thu muc app (`electron <app> ...`). */
export function appBaseArgs(): string[] {
  const argv = process.argv
  const at = argv.indexOf(CLI_FLAG)
  let pre: string[]
  if (at >= 0) {
    // dang o che do CLI: giu nguyen moi tham so dung TRUOC co CLI
    pre = argv.slice(1, at)
    if (!app.isPackaged && pre.length && !pre[0].startsWith('-')) pre[0] = app.getAppPath()
  } else {
    // giao dien / dich vu nen: chi lay tham so ve du lieu (khong lay --inspect, co dich vu...)
    pre = []
    for (let i = 1; i < argv.length; i++) {
      const x = argv[i]
      if (/^--(user-data-dir|use-mock-keychain)(=|$)/.test(x)) {
        pre.push(x)
        if (x === '--user-data-dir' && i + 1 < argv.length) pre.push(argv[++i])
      }
    }
    if (!app.isPackaged) pre.unshift(app.getAppPath())
  }
  return pre.filter((x) => !/^--agent-edit-update/.test(x))
}

/** cmd: __run-job (tao video) · __run-setup (cai dat) · __run-login (dang nhap). Tra pid (undefined = khong chay duoc). */
export function spawnCliJob(id: string, cmd = '__run-job'): number | undefined {
  const fd = openSync(jobLog(id), 'a')
  const args = [...appBaseArgs(), CLI_FLAG, cmd, id]
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  // file ket qua cua lenh `make` (script Windows) KHONG phai cua viec nen
  delete env.AGENT_EDIT_OUT_FILE
  delete env.AGENT_EDIT_ERR_FILE
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', fd, fd], env, windowsHide: true })
  child.unref()
  return child.pid
}
