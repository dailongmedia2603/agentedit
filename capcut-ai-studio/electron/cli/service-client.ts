// CLI -> dich vu nen (electron/service/): goi 1 lenh trong tien trinh app dang chay (giao dien hoac chay nen); chua co
// thi bat app CHAY NEN (`--agent-edit-service`, khong cua so) roi goi. Dich vu ban cu (app vua cap nhat) dang ranh -> bao
// no thoat roi bat ban moi.
import { app } from 'electron'
import { spawn } from 'child_process'
import { connect } from 'net'
import { existsSync } from 'fs'
import { ServiceInfo, SERVICE_FLAG, SvcResponse, svcInfoFile } from '../service/protocol'
import { CLI_FLAG, pidAlive, readJson, sleep } from './util'

const START_WAIT_MS = 20000

function readInfo(): ServiceInfo | null {
  const f = svcInfoFile(app.getPath('userData'))
  if (!existsSync(f)) return null
  const i = readJson<ServiceInfo | null>(f, null)
  return i && i.socket && i.token && pidAlive(i.pid) ? i : null
}

function request(info: ServiceInfo, cmd: string, args: Record<string, unknown>, timeoutMs: number): Promise<SvcResponse> {
  return new Promise((resolve, reject) => {
    const sock = connect(info.socket)
    let buf = ''
    const timer = setTimeout(() => {
      sock.destroy()
      reject(new Error('Dịch vụ Agent Edit không trả lời kịp.'))
    }, timeoutMs)
    sock.setEncoding('utf8')
    sock.on('connect', () => sock.write(JSON.stringify({ token: info.token, cmd, args }) + '\n'))
    sock.on('data', (d: string) => (buf += d))
    sock.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    sock.on('close', () => {
      clearTimeout(timer)
      const line = buf.split('\n')[0]
      try {
        resolve(JSON.parse(line))
      } catch {
        reject(new Error('Dịch vụ Agent Edit trả lời không hợp lệ.'))
      }
    })
  })
}

/** Bat app chay nen (cung tham so truoc co CLI — vd --user-data-dir khi tu kiem; ban dev: thu muc app). */
function spawnService(): void {
  const pre = process.argv.slice(1, process.argv.indexOf(CLI_FLAG)).filter((x) => !/^--agent-edit-update/.test(x))
  if (!app.isPackaged && pre.length && !pre[0].startsWith('-')) pre[0] = app.getAppPath()
  const env = { ...process.env }
  for (const k of ['ELECTRON_RUN_AS_NODE', 'AGENT_EDIT_OUT_FILE', 'AGENT_EDIT_ERR_FILE', 'AGENT_EDIT_KEY', 'AGENT_EDIT_SAYDI_KEY', 'AGENT_EDIT_PA_TOKEN', 'AGENT_EDIT_FB_TOKEN', 'AGENT_EDIT_API_KEY']) delete env[k]
  const child = spawn(process.execPath, [...pre, SERVICE_FLAG], { detached: true, stdio: 'ignore', env, windowsHide: true })
  child.unref()
}

async function waitInfo(ms: number, notPid?: number): Promise<ServiceInfo | null> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const i = readInfo()
    if (i && i.pid !== notPid) return i
    await sleep(300)
  }
  return null
}

/** Goi 1 lenh dich vu. Loi ket noi / khong bat duoc -> nem loi (CLI in JSON loi). */
export async function svcCall(cmd: string, args: Record<string, unknown> = {}, timeoutMs = 60000): Promise<SvcResponse> {
  let info = readInfo()
  if (info && info.version !== app.getVersion() && info.mode === 'service') {
    // dich vu ban cu (app vua cap nhat) -> bao thoat (chi khi ranh), bat ban moi
    const r = await request(info, 'quit', {}, 5000).catch(() => null)
    if (r?.ok) {
      const old = info.pid
      for (let i = 0; i < 40 && pidAlive(old); i++) await sleep(250)
      info = null
    }
  }
  if (info) {
    try {
      return await request(info, cmd, args, timeoutMs)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'ECONNREFUSED' && code !== 'ENOENT' && code !== 'EPIPE') throw e
      info = null
    }
  }
  spawnService()
  info = await waitInfo(START_WAIT_MS)
  if (!info) throw new Error('Không khởi động được Agent Edit chạy nền — mở app Agent Edit rồi thử lại.')
  return request(info, cmd, args, timeoutMs)
}

/** Dich vu dang chay (khong bat moi) — cho `update`: thoat dich vu nen truoc khi thay app. */
export async function svcPing(): Promise<(SvcResponse & { mode?: string; windows?: number; pid?: number }) | null> {
  const info = readInfo()
  if (!info) return null
  return request(info, 'ping', {}, 5000).catch(() => null) as Promise<(SvcResponse & { mode?: string; windows?: number; pid?: number }) | null>
}

export async function svcQuit(): Promise<SvcResponse | null> {
  const info = readInfo()
  if (!info) return null
  const r = await request(info, 'quit', {}, 5000).catch(() => null)
  if (r?.ok) for (let i = 0; i < 60 && pidAlive(info.pid); i++) await sleep(250)
  return r
}
