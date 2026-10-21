// LENH CLI DAY DU CHUC NANG APP (2026-10-20): Tao video, Automation Video, dang Phone Agent, Video da tao, cai dat, font,
// "lam duoc gi". Moi lenh THAY DOI du lieu chung di qua dich vu nen (service-client.ts -> electron/service/handlers.ts) —
// cung tien trinh / hang doi voi app dang mo. Key / token: CHI qua bien moi truong (ky nang GetTime: Keychain cua GetTime).
import { isAbsolute, resolve } from 'path'
import { Args, opt, optAll, out, outJson } from './util'
import { svcCall } from './service-client'
import type { SvcResponse } from '../service/protocol'

const EXIT = { ok: 0, error: 1, usage: 2 }
const json = (a: Args) => a.flags.has('json')
const abs = (p: string) => (p.startsWith('~/') ? resolve(process.env.HOME || '', p.slice(2)) : isAbsolute(p) ? p : resolve(process.cwd(), p))

function print(a: Args, r: SvcResponse, human?: (r: SvcResponse) => string): number {
  if (json(a)) outJson(r)
  else if (!r.ok) out('Lỗi: ' + String(r.error || 'không rõ') + (r.hint ? '\nGợi ý: ' + String(r.hint) : ''))
  else out(human ? human(r) : JSON.stringify(r, null, 2))
  return r.ok ? EXIT.ok : EXIT.error
}

async function call(a: Args, cmd: string, args: Record<string, unknown> = {}, human?: (r: SvcResponse) => string, timeoutMs?: number): Promise<number> {
  try {
    return print(a, await svcCall(cmd, args, timeoutMs), human)
  } catch (e) {
    return print(a, { ok: false, error: String((e as Error)?.message || e) })
  }
}

function usage(a: Args, text: string): number {
  if (json(a)) outJson({ ok: false, error: text })
  else out(text)
  return EXIT.usage
}

/** Tham so co / khong: --x (bat), --x yes|no|true|false|1|0 */
function yesNo(a: Args, k: string): boolean | undefined {
  if (a.flags.has(k)) return true
  const v = opt(a, k)
  if (v === undefined) return undefined
  return /^(1|true|yes|co|có|on)$/i.test(v.trim())
}

/** Brief "Tao video" tu tham so (giong form tren app) */
function briefArgs(a: Args): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  const map: [string, string][] = [
    ['name', 'name'], ['type', 'videoType'], ['message', 'message'], ['audience', 'audience'], ['goal', 'goal'], ['cta', 'cta'],
    ['tone', 'tone'], ['aspect', 'aspect'], ['duration', 'duration'], ['language', 'language'], ['website', 'website'],
    ['colors', 'colors'], ['fonts', 'fonts'], ['notes', 'notes'], ['engine', 'engine'], ['voice-id', 'voiceId'],
    ['voice-name', 'voiceName'], ['speed', 'speed'], ['script', 'script']
  ]
  for (const [flag, key] of map) {
    const v = opt(a, flag)
    if (v !== undefined) r[key] = v
  }
  const assets = optAll(a, 'asset').map(abs)
  if (assets.length) r.assets = assets
  if (yesNo(a, 'no-voice')) r.noVoice = true
  return r
}

const HELP_MOTION = `agent-edit motion create --name "<thương hiệu>" --message "<nội dung chính>" [tuỳ chọn]   Tạo video (motion graphics)
    --type promo|launch|feature|social_ad|explainer|kinetic|brand|news  --aspect 9:16|16:9|1:1  --duration 6-90  --language vi|en
    --audience --goal --cta --tone --website --colors --fonts --notes  --asset <ảnh> (lặp lại)  --engine motionmaxxing|mvd
    --voice-id <id SaydiVoice> --speed 0.7-1.3 --script "<lời đọc>" | --no-voice      --out <thư mục chép video xong>
  agent-edit motion list [--kind single|auto] [--automation <id>] [--limit N] · show <id> · status <id> · cancel <id>
  agent-edit motion rerun <id> · again <id> [thay đổi như create] (bản khác) · delete <id> · check`

export async function cmdMotion(a: Args): Promise<number> {
  const sub = (a.pos[0] || '').toLowerCase()
  const id = a.pos[1] || opt(a, 'id') || ''
  const outDir = opt(a, 'out') ? abs(opt(a, 'out') as string) : undefined
  switch (sub) {
    case 'create':
      return call(a, 'motion.create', { ...briefArgs(a), ...(outDir ? { out: outDir } : {}) }, (r) => `Đã nhận video: ${r.id} (${(r.job as { message?: string })?.message || ''})`)
    case 'list':
      return call(a, 'motion.list', { kind: opt(a, 'kind'), automationId: opt(a, 'automation'), limit: opt(a, 'limit') })
    case 'show':
    case 'get':
      return call(a, 'motion.get', { id })
    case 'status':
      return call(a, 'motion.status', { id })
    case 'brief':
      return call(a, 'motion.brief', { id })
    case 'cancel':
      return call(a, 'motion.cancel', { id })
    case 'rerun':
      return call(a, 'motion.rerun', { id, ...(outDir ? { out: outDir } : {}) })
    case 'again':
      return call(a, 'motion.again', { id, ...briefArgs(a), ...(outDir ? { out: outDir } : {}) })
    case 'delete':
      return call(a, 'motion.delete', { id })
    case 'check':
      return call(a, 'motion.check')
    default:
      return usage(a, HELP_MOTION)
  }
}

export async function cmdVoices(a: Args): Promise<number> {
  return call(a, 'saydi.voices', {
    q: opt(a, 'q') ?? a.pos.join(' '),
    language: opt(a, 'language'),
    gender: opt(a, 'gender'),
    custom: a.flags.has('custom') || undefined,
    refresh: a.flags.has('refresh') || undefined,
    limit: opt(a, 'limit')
  }, undefined, 90000)
}

const HELP_AUTO = `agent-edit auto list · show <id> · on <id> · off <id> · check <id> (kiểm tin mới ngay) · delete <id>
  agent-edit auto test-source "web|<link>" | "facebook|<link trang>"     (Facebook: token qua biến AGENT_EDIT_FB_TOKEN)
  agent-edit auto save [--id <id> để sửa] --project-name "<tên dự án>" --source "web|<link>" (lặp lại) --name "<kênh/thương hiệu>"
    [--message "<cách làm video từ tin>"] [--interval phút] [--max-per-check N] [--max-per-day N] [--skip-existing yes|no] [--enabled yes|no]
    [tuỳ chọn video như motion create: --type --aspect --duration --language --voice-id --no-voice --engine ...]
    [--post yes|no --post-device <iPhone> --post-script <kịch bản> --post-var ten=giá trị (lặp lại; mẫu {title} {summary} {link} {source} {channel} {date})
     --post-timing now|delay|slots --post-delay phút --post-slots "08:00,12:00,19:00"]`

export async function cmdAuto(a: Args): Promise<number> {
  const sub = (a.pos[0] || '').toLowerCase()
  const id = a.pos[1] || opt(a, 'id') || ''
  const fbToken = process.env.AGENT_EDIT_FB_TOKEN || ''
  switch (sub) {
    case 'list':
      return call(a, 'auto.list')
    case 'show':
    case 'get':
      return call(a, 'auto.get', { id })
    case 'on':
    case 'off':
      return call(a, 'auto.toggle', { id, enabled: sub === 'on' })
    case 'check':
      return call(a, 'auto.check', { id }, undefined, 180000)
    case 'delete':
      return call(a, 'auto.delete', { id })
    case 'test-source':
      return call(a, 'auto.testSource', { source: a.pos[1] || opt(a, 'source'), fbToken }, undefined, 90000)
    case 'save': {
      const args: Record<string, unknown> = { ...briefArgs(a), ...(opt(a, 'id') ? { id: opt(a, 'id') } : {}) }
      const sources = optAll(a, 'source')
      if (sources.length) args.sources = sources
      if (fbToken) args.fbToken = fbToken
      const m: [string, string][] = [['project-name', 'projectName'], ['interval', 'interval'], ['max-per-check', 'maxPerCheck'], ['max-per-day', 'maxPerDay'],
        ['post-device', 'postDevice'], ['post-script', 'postScript'], ['post-timing', 'postTiming'], ['post-delay', 'postDelay'], ['post-slots', 'postSlots']]
      for (const [flag, key] of m) if (opt(a, flag) !== undefined) args[key] = opt(a, flag)
      for (const [flag, key] of [['skip-existing', 'skipExisting'], ['enabled', 'enabled'], ['post', 'postEnabled']] as [string, string][]) {
        const v = yesNo(a, flag)
        if (v !== undefined) args[key] = v
      }
      const vars = optAll(a, 'post-var')
      if (vars.length) args.postVars = vars
      return call(a, 'auto.save', args, undefined, 90000)
    }
    default:
      return usage(a, HELP_AUTO)
  }
}

const HELP_POST = `agent-edit post devices · scripts · fields <id kịch bản> · test
  agent-edit post create (--video <file mp4> | --ref <id video Tạo video mv-… / dự án Edit Video r_…>) --device <iPhone> --script <kịch bản>
    [--var ten=giá trị (lặp lại)] [--at "YYYY-MM-DD HH:MM" (trống = đăng ngay)] [--title "<tên>"]
  agent-edit post list [--ref <id>] [--automation <id>] [--limit N] · show <id> · cancel <id> · retry <id> [--at] · reschedule <id> --at · delete <id>`

export async function cmdPost(a: Args): Promise<number> {
  const sub = (a.pos[0] || '').toLowerCase()
  const id = a.pos[1] || opt(a, 'id') || ''
  switch (sub) {
    case 'devices':
      return call(a, 'post.devices', {}, undefined, 60000)
    case 'scripts':
      return call(a, 'post.scripts', {}, undefined, 60000)
    case 'fields':
      return call(a, 'post.fields', { script: a.pos[1] || opt(a, 'script') }, undefined, 60000)
    case 'test':
      return call(a, 'post.test', {}, undefined, 60000)
    case 'create':
      return call(a, 'post.create', {
        video: opt(a, 'video') ? abs(opt(a, 'video') as string) : undefined,
        ref: opt(a, 'ref'),
        device: opt(a, 'device'),
        script: opt(a, 'script'),
        vars: optAll(a, 'var'),
        at: opt(a, 'at'),
        title: opt(a, 'title')
      }, undefined, 90000)
    case 'list':
      return call(a, 'post.list', { ref: opt(a, 'ref'), automationId: opt(a, 'automation'), limit: opt(a, 'limit') })
    case 'show':
    case 'get':
      return call(a, 'post.get', { id })
    case 'status':
      return call(a, 'post.status', { id })
    case 'cancel':
      return call(a, 'post.cancel', { id })
    case 'retry':
      return call(a, 'post.retry', { id, at: opt(a, 'at') })
    case 'reschedule':
      return call(a, 'post.reschedule', { id, at: opt(a, 'at') })
    case 'delete':
      return call(a, 'post.delete', { id })
    default:
      return usage(a, HELP_POST)
  }
}

export async function cmdProjects(a: Args): Promise<number> {
  const sub = (a.pos[0] || 'list').toLowerCase()
  const id = a.pos[1] || opt(a, 'id') || ''
  if (sub === 'list') return call(a, 'projects.list', { limit: opt(a, 'limit') })
  if (sub === 'show' || sub === 'get') return call(a, 'projects.get', { id })
  if (sub === 'delete') return call(a, 'projects.delete', { id, withFiles: a.flags.has('with-files') || undefined })
  return usage(a, 'agent-edit projects list [--limit N] · show <id> · delete <id> [--with-files: đưa cả thư mục dự án vào Thùng rác]')
}

const HELP_SETTINGS = `agent-edit settings show
  agent-edit settings models --account gemini|claude|codex          (model + mức suy nghĩ chọn được)
  agent-edit settings set --account gemini|claude|codex [--mode subscription|api_key] [--model <id>] [--effort <mức>] [--base-url <url>] [--api-key-env]
      (--api-key-env: API key lấy từ biến AGENT_EDIT_API_KEY)
  agent-edit settings limits [--analyze N] [--plan N] [--motion N]     (số video chạy cùng lúc)
  agent-edit settings test|logout --account gemini|claude|codex
  agent-edit settings saydi-key | phoneagent-token [--base <url>]       (key lấy từ biến AGENT_EDIT_SAYDI_KEY / AGENT_EDIT_PA_TOKEN; trống = xoá)
  agent-edit settings saydi-test`

export async function cmdSettings(a: Args): Promise<number> {
  const sub = (a.pos[0] || 'show').toLowerCase()
  const account = opt(a, 'account') || a.pos[1]
  switch (sub) {
    case 'show':
      return call(a, 'settings.get')
    case 'models':
      return call(a, 'settings.models', { account }, undefined, 120000)
    case 'set': {
      const args: Record<string, unknown> = { account }
      for (const [flag, key] of [['mode', 'mode'], ['model', 'model'], ['effort', 'effort'], ['base-url', 'baseUrl']] as [string, string][]) {
        if (opt(a, flag) !== undefined) args[key] = opt(a, flag)
      }
      if (a.flags.has('api-key-env')) args.apiKey = process.env.AGENT_EDIT_API_KEY || ''
      return call(a, 'settings.set', args)
    }
    case 'limits':
      return call(a, 'settings.limits', { analyze: opt(a, 'analyze'), plan: opt(a, 'plan'), motion: opt(a, 'motion') })
    case 'test':
      return call(a, 'settings.test', { account }, undefined, 200000)
    case 'logout':
      return call(a, 'settings.logout', { account }, undefined, 120000)
    case 'saydi-key':
      return call(a, 'saydi.setKey', { key: process.env.AGENT_EDIT_SAYDI_KEY || '' }, undefined, 60000)
    case 'saydi-test':
      return call(a, 'saydi.test', {}, undefined, 60000)
    case 'phoneagent-token':
      return call(a, 'post.setToken', { token: process.env.AGENT_EDIT_PA_TOKEN || '', base: opt(a, 'base') }, undefined, 60000)
    default:
      return usage(a, HELP_SETTINGS)
  }
}

const HELP_TELEGRAM = `agent-edit telegram status                        Bot Telegram: bật/tắt, đang chạy, @tên bot, số người dùng
  agent-edit telegram token [--off]                 Đặt token bot (lấy ở @BotFather) từ biến AGENT_EDIT_TG_TOKEN -> tự bật bot; trống = xoá token
  agent-edit telegram on | off                      Bật / tắt bot      agent-edit telegram test   Kiểm tra token (getMe)
  agent-edit telegram users · remove-user <chatId>  Người đã gửi đúng key phần mềm / gỡ quyền
  agent-edit telegram jobs [--limit N]              Video tạo qua bot (mã, trạng thái, file)`

export async function cmdTelegram(a: Args): Promise<number> {
  const sub = (a.pos[0] || 'status').toLowerCase()
  switch (sub) {
    case 'status':
      return call(a, 'telegram.status')
    case 'token':
      return call(a, 'telegram.setToken', { token: process.env.AGENT_EDIT_TG_TOKEN || '', ...(a.flags.has('off') ? { enabled: false } : {}) }, undefined, 60000)
    case 'on':
    case 'off':
      return call(a, 'telegram.toggle', { enabled: sub === 'on' }, undefined, 60000)
    case 'test':
      return call(a, 'telegram.test', { token: process.env.AGENT_EDIT_TG_TOKEN || '' }, undefined, 60000)
    case 'users':
      return call(a, 'telegram.users')
    case 'remove-user':
      return call(a, 'telegram.removeUser', { chatId: a.pos[1] || opt(a, 'chat') })
    case 'jobs':
      return call(a, 'telegram.jobs', { limit: opt(a, 'limit') })
    default:
      return usage(a, HELP_TELEGRAM)
  }
}

export const cmdCapabilities = (a: Args) => call(a, 'capabilities')
export const cmdFonts = (a: Args) => call(a, 'fonts.list', {}, undefined, 90000)

export const HELP_MORE = `
TẠO VIDEO (motion graphics, không cần video quay) — chạy trong Agent Edit (tự chạy nền nếu app chưa mở)
  ${HELP_MOTION}
  agent-edit voices [từ khoá] [--language vi] [--gender female|male] [--custom] [--limit N]   Giọng đọc SaydiVoice

AUTOMATION VIDEO (nguồn tin -> video tự động -> tự đăng)
  ${HELP_AUTO}

ĐĂNG VIDEO QUA IPHONE (Phone Agent)
  ${HELP_POST}

BOT TELEGRAM (ra lệnh Edit video / Tạo video qua Telegram — chỉ người gửi đúng key phần mềm)
  ${HELP_TELEGRAM}

VIDEO ĐÃ TẠO (Edit Video): agent-edit projects list · show <id> · delete <id> [--with-files]
CÀI ĐẶT: ${HELP_SETTINGS}
KHÁC: agent-edit capabilities (app làm được gì + tình trạng) · agent-edit fonts (font đã có cho Brand Guideline)`
