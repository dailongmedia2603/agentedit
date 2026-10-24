// TAI FILE LON QUA MTProto (2026-10-24) — Bot API chi cho bot tai file <= 20 MB (getFile). Bot dang nhap MTProto bang CHINH
// token BotFather (GramJS, npm `telegram`, goi thang vao out/main — devDependency) tai duoc file nguoi dung gui toi ~2 GB
// (4 GB neu nguoi gui co Premium). Vong nhan tin / gui tin van la Bot API (api.ts) — MTProto CHI dung de tai file > 20 MB.
//
// - api_id / api_hash: cua chu app (my.telegram.org, 2026-10-24). Ban dev doi bang STUDIO_TG_API_ID / STUDIO_TG_API_HASH.
// - Phien dang nhap (StringSession) MA HOA safeStorage o <userData>/telegram-mt.enc, gan voi dau van tay token -> khong goi
//   auth.importBotAuthorization moi lan (Telegram gioi han dang nhap bot lien tuc). Doi / xoa token -> bo phien cu.
// - Lay tin bang messages.getMessages (bot duoc dung, KHONG can access_hash cua nguoi gui) theo message_id cua Bot API (chat
//   rieng: cung 1 day so) -> tai media cua tin vua lay (file_reference moi).
// - Ket noi: TCP obfuscated cong 443 (kho bi chan hon cong 80 thuong); he thong dat proxy SOCKS -> di qua proxy do. Khong
//   theo VPN/proxy HTTP nhu net.fetch — mang chan Telegram ma chi co proxy HTTP thi tai loi -> bot huong dan gui link.
// - Khong dung qua IDLE_MS -> ngat ket noi (khong giu socket + vong cap nhat cua GramJS khi khong tai gi).
import { app, safeStorage, session as electronSession } from 'electron'
import { createHash } from 'crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { open } from 'fs/promises'
import { join } from 'path'
// duong dan file day du (.js): goi CJS khong co "exports" -> Node ESM (tests/test_telegram.mts) khong tu tim index.js
import { Api, Logger, sessions, TelegramClient } from 'telegram'
import { ConnectionTCPObfuscated } from 'telegram/network/index.js'
import { LogLevel } from 'telegram/extensions/Logger.js'

const API_ID = 32202333
const API_HASH = '45473e804ed77fdc0ef18eadb9c29ca3'
const devEnv = (k: string) => (!app.isPackaged ? process.env[k] || '' : '')
const apiId = () => Number(devEnv('STUDIO_TG_API_ID')) || API_ID
const apiHash = () => devEnv('STUDIO_TG_API_HASH') || API_HASH

/** Gioi han tai qua MTProto: file thuong toi 2 GB, nguoi gui Premium toi 4 GB */
export const MT_DOWNLOAD_MAX = 4 * 1024 ** 3
const IDLE_MS = 10 * 60 * 1000

const sessionPath = () => join(app.getPath('userData'), 'telegram-mt.enc')
const tokenPrint = (t: string) => createHash('sha256').update('agent-edit-mt:' + t).digest('hex').slice(0, 32)

function loadSession(token: string): string {
  try {
    if (!existsSync(sessionPath())) return ''
    const raw = readFileSync(sessionPath())
    const j = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf-8'))
    return j?.tp === tokenPrint(token) ? String(j.s || '') : ''
  } catch {
    return ''
  }
}

function saveSession(token: string, s: string): void {
  try {
    const txt = JSON.stringify({ tp: tokenPrint(token), s })
    writeFileSync(sessionPath(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, 'utf-8'))
  } catch {
    /* khong luu duoc -> lan sau dang nhap lai */
  }
}

/** Proxy SOCKS cua he thong (Chromium resolveProxy) — proxy HTTP thi GramJS khong dung duoc -> di thang. */
async function systemSocks(): Promise<{ ip: string; port: number; socksType: 4 | 5 } | undefined> {
  try {
    const r = await electronSession.defaultSession.resolveProxy('https://api.telegram.org')
    const m = /SOCKS(5|4)?\s+([^\s:;]+):(\d+)/i.exec(r)
    if (m) return { ip: m[2], port: Number(m[3]), socksType: m[1] === '4' ? 4 : 5 }
  } catch {
    /* khong doc duoc proxy */
  }
  return undefined
}

let current: { token: string; client: Promise<TelegramClient> } | null = null
let active = 0
let idleTimer: NodeJS.Timeout | null = null

async function connect(token: string, fresh: boolean): Promise<TelegramClient> {
  const proxy = await systemSocks()
  const client = new TelegramClient(new sessions.StringSession(fresh ? '' : loadSession(token)), apiId(), apiHash(), {
    connection: ConnectionTCPObfuscated,
    useWSS: !proxy, // Node + socket thuong: chi doi sang cong 443 (proxy thi GramJS khong cho)
    proxy,
    connectionRetries: 3,
    requestRetries: 3,
    downloadRetries: 5,
    timeout: 20,
    autoReconnect: true,
    floodSleepThreshold: 120,
    deviceModel: 'Agent Edit',
    appVersion: app.getVersion(),
    baseLogger: new Logger(LogLevel.NONE)
  })
  try {
    await client.start({ botAuthToken: token })
  } catch (e) {
    await client.destroy().catch(() => undefined)
    throw e
  }
  saveSession(token, String(client.session.save() as unknown as string))
  return client
}

function getClient(token: string, fresh = false): Promise<TelegramClient> {
  if (current && current.token === token && !fresh) return current.client
  void closeMtproto()
  const c = connect(token, fresh)
  current = { token, client: c }
  c.catch(() => {
    if (current?.client === c) current = null
  })
  return c
}

/** Ngat ket noi MTProto (tat bot / doi token / app thoat). forget = xoa luon phien da luu. */
export async function closeMtproto(forget = false): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  const c = current
  current = null
  if (forget) rmSync(sessionPath(), { force: true })
  if (c) await c.client.then((cl) => cl.destroy()).catch(() => undefined)
}

function armIdle(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = active ? null : setTimeout(() => void closeMtproto(), IDLE_MS)
}

/** Loi do phien dang nhap hong / token bi thu hoi -> dang nhap lai tu dau 1 lan */
const authBroken = (e: unknown) => /AUTH_KEY|SESSION_REVOKED|SESSION_EXPIRED|ACCESS_TOKEN|USER_DEACTIVATED/i.test(String((e as Error)?.message || e))

function friendly(e: unknown): Error {
  const m = String((e as Error)?.message || e)
  if (/ACCESS_TOKEN_INVALID|ACCESS_TOKEN_EXPIRED/i.test(m)) return new Error('Token bot không còn hợp lệ — lấy lại token ở @BotFather.')
  if (/FILE_REFERENCE|MEDIA_EMPTY/i.test(m)) return new Error('Telegram không cho tải lại tin này — gửi lại file.')
  if (/FLOOD_WAIT_(\d+)/i.test(m)) return new Error(`Telegram yêu cầu chờ ${/FLOOD_WAIT_(\d+)/i.exec(m)?.[1]} giây rồi gửi lại.`)
  if (/timeout|ECONN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|socket|connect/i.test(m))
    return new Error('Không kết nối được máy chủ Telegram để tải file lớn (mạng chặn — thử bật VPN).')
  return new Error(m.slice(0, 300))
}

/**
 * Tai media cua tin `messageId` (chat rieng voi bot) ve `dest`. Ghi tung manh bang FileHandle (doi ghi xong moi tra ve —
 * writeStream cua GramJS khong doi flush). onProgress(da tai, tong).
 */
export async function mtDownload(token: string, messageId: number, dest: string, size: number, onProgress?: (done: number, total: number) => void): Promise<number> {
  active++
  armIdle()
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const client = await getClient(token, attempt > 0)
        const r = await client.invoke(new Api.messages.GetMessages({ id: [new Api.InputMessageID({ id: messageId })] }))
        const msg = 'messages' in r ? r.messages.find((x) => x instanceof Api.Message && x.id === messageId) : undefined
        if (!(msg instanceof Api.Message) || !msg.media) throw new Error('Không tìm thấy file trong tin nhắn (tin đã bị xoá?).')
        const fh = await open(dest, 'w')
        let done = 0
        try {
          await client.downloadMedia(msg, {
            outputFile: {
              write: async (chunk: Buffer) => {
                await fh.write(chunk)
                done += chunk.length
                onProgress?.(done, size)
              }
            } as never
          })
        } finally {
          await fh.close()
        }
        if (!done) throw new Error('Telegram trả về file rỗng.')
        return done
      } catch (e) {
        rmSync(dest, { force: true })
        if (attempt === 0 && authBroken(e)) {
          rmSync(sessionPath(), { force: true })
          continue
        }
        throw friendly(e)
      }
    }
  } finally {
    active--
    armIdle()
  }
}
