// Cong dieu khien cua dich vu nen (protocol.ts) — chay trong tien trinh app (giao dien hoac --agent-edit-service).
import { app } from 'electron'
import { createServer, Server, Socket } from 'net'
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { randomBytes, timingSafeEqual } from 'crypto'
import { ServiceInfo, SvcRequest, SvcResponse, SVC_DIR, svcInfoFile, svcSocketPath } from './protocol'

export type SvcHandler = (args: Record<string, unknown>) => Promise<SvcResponse> | SvcResponse

declare const __APP_BUILD__: string
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : ''

const MAX_REQ = 2 * 1024 * 1024
let server: Server | null = null
let infoPath = ''
let socketPath = ''
let lastRequestAt = Date.now()

export const lastServiceRequest = () => lastRequestAt

export function startControlServer(handlers: Record<string, SvcHandler>, mode: 'service' | 'gui', log: (m: string) => void): void {
  if (server) return
  const userData = app.getPath('userData')
  infoPath = svcInfoFile(userData)
  socketPath = svcSocketPath(userData)
  const token = randomBytes(24).toString('hex')
  const tok = Buffer.from(token)
  try {
    mkdirSync(SVC_DIR, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') chmodSync(SVC_DIR, 0o700)
  } catch {
    /* bo qua */
  }
  // socket con sot lai tu lan tat bat thuong (khoa "1 phien" bao dam khong con tien trinh nao dang nghe o day)
  if (process.platform !== 'win32' && existsSync(socketPath)) rmSync(socketPath, { force: true })

  const reply = (sock: Socket, r: SvcResponse) => {
    try {
      sock.end(JSON.stringify(r) + '\n')
    } catch {
      /* client da dong */
    }
  }
  server = createServer((sock) => {
    let buf = ''
    let done = false
    sock.setEncoding('utf8')
    sock.on('error', () => undefined)
    sock.on('data', (chunk: string) => {
      if (done) return
      buf += chunk
      if (buf.length > MAX_REQ) {
        done = true
        return reply(sock, { ok: false, error: 'Yêu cầu quá lớn.' })
      }
      const nl = buf.indexOf('\n')
      if (nl < 0) return
      done = true
      let req: SvcRequest
      try {
        req = JSON.parse(buf.slice(0, nl))
      } catch {
        return reply(sock, { ok: false, error: 'Yêu cầu không phải JSON.' })
      }
      const got = Buffer.from(String(req?.token || ''))
      if (got.length !== tok.length || !timingSafeEqual(got, tok)) return reply(sock, { ok: false, error: 'Sai mã dịch vụ.' })
      const fn = handlers[String(req.cmd || '')]
      if (!fn) return reply(sock, { ok: false, error: `Dịch vụ không có lệnh "${req.cmd}".` })
      lastRequestAt = Date.now()
      Promise.resolve()
        .then(() => fn((req.args && typeof req.args === 'object' ? req.args : {}) as Record<string, unknown>))
        .then((r) => reply(sock, r))
        .catch((e) => reply(sock, { ok: false, error: String((e as Error)?.message || e) }))
    })
  })
  server.on('error', (e) => log('cong dieu khien loi: ' + String(e)))
  server.listen(socketPath, () => {
    if (process.platform !== 'win32') {
      try {
        chmodSync(socketPath, 0o600)
      } catch {
        /* bo qua */
      }
    }
    const info: ServiceInfo = {
      pid: process.pid,
      version: app.getVersion(),
      build: APP_BUILD,
      socket: socketPath,
      token,
      mode,
      startedAt: Date.now(),
      userData
    }
    writeFileSync(infoPath, JSON.stringify(info), { mode: 0o600 })
    log(`cong dieu khien san sang (${mode}): ${socketPath}`)
  })
}

export function stopControlServer(): void {
  try {
    server?.close()
  } catch {
    /* bo qua */
  }
  server = null
  try {
    if (infoPath) rmSync(infoPath, { force: true })
    if (socketPath && process.platform !== 'win32') rmSync(socketPath, { force: true })
  } catch {
    /* bo qua */
  }
}
