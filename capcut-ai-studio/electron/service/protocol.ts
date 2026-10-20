// DICH VU NEN CUA AGENT EDIT (2026-10-20) — giao thuc dung chung giua tien trinh app (giao dien HOAC chay nen khong cua
// so `--agent-edit-service`) va lenh CLI (`--agent-edit-cli`, ky nang GetTime).
//
// Vi sao: Tao video, Automation Video va lich dang Phone Agent la bo hen gio + hang doi SONG trong 1 tien trinh app (giu
// automation.json / motion/jobs.json / phoneagent/posts.json trong bo nho). CLI ghi thang cac file do trong luc app mo ->
// 2 ben ghi de nhau. Nen: moi lenh THAY DOI cac phan do di qua 1 cong dieu khien trong CHINH tien trinh app dang chay
// (app giao dien dang mo thi dung no; khong thi CLI tu bat app chay nen khong cua so).
//
// Cong: macOS Unix socket trong ~/.capcut-studio/cli/svc (thu muc 0700) · Windows named pipe theo nguoi dung. Moi yeu cau
// kem MA BI MAT doc tu file svc-*.json (0600) — tien trinh cua nguoi dung khac khong goi duoc.
// Goi: 1 ket noi = 1 yeu cau: client ghi 1 dong JSON {token, cmd, args}, server tra 1 dong JSON {ok, ...} roi dong.
import { createHash } from 'crypto'
import { homedir, tmpdir, userInfo } from 'os'
import { join } from 'path'
import { CLI_HOME } from '../cli/util'

/** Co dong lenh: app khoi dong CHAY NEN (khong cua so, an Dock) lam dich vu cho CLI */
export const SERVICE_FLAG = '--agent-edit-service'

export const SVC_DIR = join(CLI_HOME, 'svc')

export interface ServiceInfo {
  pid: number
  version: string
  build: string
  socket: string
  token: string
  /** service = chay nen do CLI bat; gui = app giao dien nguoi dung tu mo */
  mode: 'service' | 'gui'
  startedAt: number
  userData: string
}

/** Moi thu muc du lieu Electron (userData) 1 dich vu rieng — tu kiem dung --user-data-dir tam khong dung dich vu that. */
export function svcKey(userData: string): string {
  return createHash('sha1').update(userData).digest('hex').slice(0, 10)
}

export const svcInfoFile = (userData: string) => join(SVC_DIR, `svc-${svcKey(userData)}.json`)

export function svcSocketPath(userData: string): string {
  const key = svcKey(userData)
  if (process.platform === 'win32') {
    let user = ''
    try {
      user = userInfo().username
    } catch {
      /* bo qua */
    }
    return `\\\\.\\pipe\\agent-edit-${createHash('sha1').update(homedir() + '|' + user).digest('hex').slice(0, 8)}-${key}`
  }
  const p = join(SVC_DIR, `${key}.sock`)
  // Unix socket: duong dan toi da ~104 byte (macOS) — HOME dai (tu kiem trong thu muc tam) -> dat o tmpdir
  return Buffer.byteLength(p) < 100 ? p : join(tmpdir(), `ae-svc-${key}.sock`)
}

export interface SvcRequest {
  token: string
  cmd: string
  args?: Record<string, unknown>
}

export type SvcResponse = { ok: boolean; [k: string]: unknown }
