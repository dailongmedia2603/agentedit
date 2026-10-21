// Test BOT TELEGRAM (electron/services/telegram/*). Chay (Node >= 23):
//   node tests/test_telegram.mts
// HOME tam + may chu Telegram Bot API GIA (http cuc bo: getUpdates / sendMessage / editMessageText / getFile / tai file /
// sendVideo multipart...). Viec that (viec nen CLI, Tao video, sidecar) thay bang ban gia qua setTelegramDeps.
// Can dam bao:
//  1. Xac thuc: chat moi phai gui DUNG key; sai -> dem lan + khoa sau 5 lan; tin chua key bi xoa; nhom -> khong phuc vu.
//  2. Edit video dung thu tu: video nguon (tai ve app) -> video mau (Bo qua) -> lam gi -> style -> khach hang -> do dai ->
//     font (chon kho + tai file) -> mau (Bo qua) -> tu lieu (hoi mo ta tung tep) -> tao viec voi DUNG dau vao.
//  3. Album 2 video gui cung luc -> 2 video nguon, chi hoi tiep 1 lan. Chon video tu thu vien. File > 20 MB -> huong dan link.
//  4. Theo doi viec: sua tin trang thai theo buoc; xong -> gui video (multipart) + don file tai len; loi -> nut Chay lai.
//  5. Nhieu video cung luc: tao video thu 2 trong luc video 1 dang chay, moi video 1 ma.
//  6. Tao video: du cau hoi -> createMotion voi brief hop le (giong, khung hinh, do dai, ghi chu tu mo ta anh).
//  7. Video xong > 49 MB -> ban nen + link ban goc. 8. Doi key tren may -> chat phai gui lai key. 9. Nut cu -> "da cu".
import { register } from 'node:module'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync, truncateSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

register('./helpers/electron-mock-loader.mjs', import.meta.url)

const HOME = mkdtempSync(join(tmpdir(), 'telegram-test-'))
process.env.HOME = HOME
process.env.USERPROFILE = HOME
process.env.STUDIO_LICENSE = 'off'
;(globalThis as any).__USERDATA = join(HOME, 'userdata')
;(globalThis as any).__SAFE_STORAGE = true
mkdirSync((globalThis as any).__USERDATA, { recursive: true })

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)?.slice(0, 900)))
  if (!cond) FAILS.push(name)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(fn: () => unknown, ms = 6000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (fn()) return true
    await sleep(20)
  }
  return !!fn()
}

// ------------------------------------------------------------------ may chu Telegram gia
const TOKEN = '123456789:' + 'A'.repeat(35)
type Call = { method: string; params: any; raw?: Buffer }
const calls: Call[] = []
const updates: any[] = []
let uid = 1000
let mid = 1
const files: Record<string, { path: string; body: Buffer }> = {}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((r) => {
    const b: Buffer[] = []
    req.on('data', (c) => b.push(c))
    req.on('end', () => r(Buffer.concat(b)))
  })
}
function multipartFields(raw: Buffer, type: string): Record<string, string> {
  const boundary = /boundary=(.+)$/.exec(type)?.[1] || ''
  const out: Record<string, string> = {}
  for (const part of raw.toString('latin1').split('--' + boundary)) {
    const m = /name="([^"]+)"(?:; filename="([^"]*)")?\r\n(?:Content-Type: [^\r\n]+\r\n)?\r\n([\s\S]*)\r\n$/.exec(part)
    if (!m) continue
    out[m[1]] = m[2] !== undefined ? `FILE:${m[2]}:${Buffer.byteLength(m[3], 'latin1')}` : Buffer.from(m[3], 'latin1').toString('utf-8')
  }
  return out
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url || ''
  const fm = /^\/file\/bot[^/]+\/(.+)$/.exec(url)
  if (fm) {
    const f = Object.values(files).find((x) => x.path === fm[1])
    if (!f) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(f.body)
    return
  }
  const m = /^\/bot([^/]+)\/(\w+)$/.exec(url)
  const raw = await readBody(req)
  const json = (result: unknown) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, result }))
  if (!m || m[1] !== TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }))
    return
  }
  const method = m[2]
  const type = String(req.headers['content-type'] || '')
  const params = type.startsWith('multipart/') ? multipartFields(raw, type) : raw.length ? JSON.parse(raw.toString()) : {}
  if (method !== 'getUpdates') calls.push({ method, params, raw })
  switch (method) {
    case 'getMe':
      return json({ id: 42, is_bot: true, first_name: 'Agent Edit Bot', username: 'agentedit_test_bot' })
    case 'getUpdates': {
      const t0 = Date.now()
      while (!updates.length && Date.now() - t0 < 300) await sleep(15)
      const off = Number(params.offset || 0)
      const list = updates.filter((u) => u.update_id >= off)
      updates.length = 0
      return json(list)
    }
    case 'sendMessage':
    case 'sendVideo':
    case 'sendDocument':
      return json({ message_id: ++mid, chat: { id: Number(params.chat_id), type: 'private' }, date: 0, text: params.text })
    case 'getFile': {
      const f = files[params.file_id]
      return f ? json({ file_id: params.file_id, file_path: f.path }) : res.writeHead(400).end(JSON.stringify({ ok: false, error_code: 400, description: 'file is too big' }))
    }
    default:
      return json(true)
  }
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
const PORT = (server.address() as { port: number }).port

// ------------------------------------------------------------------ nguoi dung gia
const USER = 777
const user = { id: USER, first_name: 'Nghia', username: 'nghia' }
const chat = (id = USER, type = 'private') => ({ id, type, first_name: 'Nghia' })
function say(text: string, chatId = USER, type = 'private') {
  const id = ++mid
  updates.push({ update_id: ++uid, message: { message_id: id, from: user, chat: chat(chatId, type), date: 0, text } })
  return id
}
let fid = 0
function sendFile(kind: 'video' | 'photo' | 'document', name: string, size = 2000, extra: Record<string, unknown> = {}) {
  const file_id = 'F' + ++fid
  files[file_id] = { path: `files/${file_id}/${name}`, body: Buffer.alloc(Math.min(size, 4000), 7) }
  const ref = { file_id, file_size: size, file_name: name, mime_type: kind === 'video' ? 'video/mp4' : name.endsWith('.ttf') ? 'font/ttf' : 'image/jpeg' }
  const msg: any = { message_id: ++mid, from: user, chat: chat(), date: 0, ...extra }
  if (kind === 'video') msg.video = ref
  else if (kind === 'photo') msg.photo = [{ ...ref, file_size: 100 }, ref]
  else msg.document = ref
  updates.push({ update_id: ++uid, message: msg })
  return msg.message_id
}
function press(data: string, messageId = 1) {
  updates.push({ update_id: ++uid, callback_query: { id: 'q' + uid, from: user, message: { message_id: messageId, chat: chat(), date: 0 }, data } })
}
const texts = () => calls.filter((c) => c.method === 'sendMessage').map((c) => String(c.params.text))
const lastText = () => texts().at(-1) || ''
/** nut (callback_data) cua tin gan nhat co chu `needle` */
function buttonsOf(needle: string): { text: string; data: string; msgIdx: number }[] {
  for (let i = calls.length - 1; i >= 0; i--) {
    const c = calls[i]
    if ((c.method === 'sendMessage' || c.method === 'editMessageText') && String(c.params.text).includes(needle)) {
      return (c.params.reply_markup?.inline_keyboard || []).flat().map((b: any) => ({ text: b.text, data: b.callback_data, msgIdx: i }))
    }
  }
  return []
}
const btn = (needle: string, label: string) => buttonsOf(needle).find((b) => b.text.includes(label))?.data || ''
let seen = 0
/** cho toi khi bot gui tin moi co chu `needle` (tinh tu lan doi truoc) */
async function expectMsg(needle: string, ms = 6000): Promise<string> {
  let got = ''
  await until(() => {
    const t = texts()
    for (let i = seen; i < t.length; i++) {
      if (t[i].includes(needle)) {
        got = t[i]
        seen = i + 1
        return true
      }
    }
    return false
  }, ms)
  return got
}

// ------------------------------------------------------------------ nap bot + ban gia cua cac viec
const api = await import('../electron/services/telegram/api.ts')
api.setTelegramApiBase(`http://127.0.0.1:${PORT}`)
const bot = await import('../electron/services/telegram/bot.ts')
const store = await import('../electron/services/telegram/store.ts')
bot._test.setGather(150)
/** goi theo doi ngay — vong 4s cua bot co the dang chay (watching) thi doi no xong roi goi lai */
async function watchNow() {
  for (let i = 0; i < 3; i++) {
    await bot._test.watchJobs()
    await sleep(60)
  }
}

const KEY = 'ABCDE-FGH2J-KMNPQ-RSTUV-WXYZ3'
let FP: string | null = 'fp-1'
const LIB = join(HOME, 'lib.mp4')
writeFileSync(LIB, Buffer.alloc(3000, 1))
const editInputs: any[] = []
const editJobs: Record<string, any> = {}
const motionBriefs: any[] = []
const motionJobs: Record<string, any> = {}
let nEdit = 0
const OUT = join(HOME, 'out.mp4')
writeFileSync(OUT, Buffer.alloc(5000, 3))
const SMALL = join(HOME, 'small.mp4')
let compressed = 0
bot.setTelegramDeps({
  keyPrint: () => FP,
  keyMatches: (raw: string) => raw.toUpperCase().replace(/[^0-9A-Z]/g, '') === KEY.replace(/-/g, ''),
  licenseOk: async () => ({ ok: true }),
  libraryList: async () => [{ path: LIB, name: 'lib.mp4', duration: 12, analyzed: true }],
  fontList: async () => [{ id: 'f_be', name: 'Be Vietnam Pro' }, { id: 'f_fr', name: 'Fraunces' }],
  hasSaydi: () => true,
  voices: async () => [{ id: 'vi-a', name: 'Giọng A' }, { id: 'vc_me', name: '⭐ Giọng của tôi' }],
  probe: async () => 10,
  startEdit: (input: any) => {
    editInputs.push(input)
    const id = `r_test${String(++nEdit).padStart(4, '0')}`
    editJobs[id] = { id, status: 'queued', step: 'prepare', message: 'Đang khởi động…', input, createdAt: Date.now() }
    return id
  },
  editJob: (id: string) => editJobs[id] || null,
  cancelEdit: (id: string) => {
    editJobs[id].status = 'cancelled'
  },
  createMotion: async (b: any) => {
    motionBriefs.push(b)
    const id = 'mv-20261021-101010-abcd'
    motionJobs[id] = { id, status: 'queued', brief: b }
    return { id }
  },
  motionJob: (id: string) => motionJobs[id],
  rerunMotion: (id: string) => ({ id }),
  cancelMotion: () => undefined,
  publicLink: async () => 'https://example.com/goc.mp4',
  compress: async () => {
    compressed++
    writeFileSync(SMALL, Buffer.alloc(4000, 4))
    return SMALL
  }
})

const r0 = await bot.configureTelegram({ token: TOKEN, enabled: true })
check('luu token + getMe', r0.ok && store.tgState().bot?.username === 'agentedit_test_bot', r0)
check('bot dang chay', await until(() => bot.telegramStatus().state === 'running'), bot.telegramStatus())
check('dang ky lenh /start /edit /tao', calls.some((c) => c.method === 'setMyCommands' && c.params.commands.some((x: any) => x.command === 'edit')))

// ------------------------------------------------------------------ 1. xac thuc
console.log('[1] xac thuc bang key')
say('/start')
check('chua xac thuc -> hoi key', (await expectMsg('gửi <b>key phần mềm')) !== '')
const wrongId = say('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE')
check('key sai -> bao con 4 lan', (await expectMsg('còn 4 lần')) !== '')
check('tin chua key bi xoa', await until(() => calls.some((c) => c.method === 'deleteMessage' && c.params.message_id === wrongId)))
say('hello')
check('chu thuong khong tinh la nhap key', (await expectMsg('key phần mềm')) !== '' && store.tgState().fails[String(USER)].n === 1)
say('/start', 999, 'group')
check('nhom -> tu choi', (await expectMsg('chỉ dùng trong chat riêng')) !== '')
const okId = say(KEY.toLowerCase())
check('key dung -> xac thuc + menu', (await expectMsg('Xác thực thành công')) !== '' && !!store.tgState().chats[String(USER)])
check('menu co Edit video / Tao video', JSON.stringify(calls.at(-1)?.params.reply_markup).includes('🎬 Edit video'))
check('tin chua key dung cung bi xoa', calls.some((c) => c.method === 'deleteMessage' && c.params.message_id === okId))

// khoa sau 5 lan sai (chat khac)
for (let i = 0; i < 5; i++) say('ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZ' + i, 555)
check('sai 5 lan -> khoa 1 gio', (await expectMsg('bị khoá 1 giờ')) !== '')
say(KEY, 555)
check('dang khoa thi key dung cung khong nhan', (await expectMsg('Thử lại sau')) !== '' && !store.tgState().chats['555'])

// ------------------------------------------------------------------ 2. Edit video day du
console.log('[2] Edit video tung buoc')
say('🎬 Edit video')
check('hoi video nguon', (await expectMsg('Gửi video nguồn')) !== '')
// album 2 video
sendFile('video', 'IMG_1.MOV', 3000, { media_group_id: 'g1' })
sendFile('video', 'IMG_2.mp4', 3000, { media_group_id: 'g1' })
check('nhan video 1', (await expectMsg('Đã nhận video nguồn 1')) !== '' || calls.some((c) => c.method === 'editMessageText' && String(c.params.text).includes('video nguồn 1')))
check('hoi video mau (sau khi gom album)', (await expectMsg('Gửi video mẫu')) !== '')
const s1 = store.tgState().sessions[String(USER)]
check('album -> 2 video nguon, file nam trong thu muc tai len', s1.videos.length === 2 && s1.videos.every((v: any) => existsSync(v.path) && v.path.includes(join('telegram', 'uploads'))), s1.videos)
check('chi hoi video mau 1 lan', texts().filter((t) => t.includes('Gửi video mẫu')).length === 1)
// nut them video nguon -> quay lai -> chon tu thu vien
press(btn('Gửi video mẫu', 'Thêm video nguồn'))
check('quay lai buoc video nguon', (await expectMsg('Gửi video nguồn')) !== '')
check('co nut Tiep tuc (da co 2 video)', !!btn('Gửi video nguồn', 'Tiếp tục'))
press(btn('Gửi video nguồn', 'thư viện'))
check('hien thu vien', (await expectMsg('Chọn video nguồn từ thư viện')) !== '')
press(btn('từ thư viện', 'lib.mp4'))
check('chon tu thu vien -> sang video mau', (await expectMsg('Gửi video mẫu')) !== '')
check('3 video nguon (1 tu thu vien)', store.tgState().sessions[String(USER)].videos.length === 3)
// file > 20 MB
sendFile('video', 'big.mov', 60 * 1048576)
check('file > 20 MB -> huong dan gui link', (await expectMsg('chỉ tải được file tối đa 20 MB')) !== '')
press(btn('Gửi video mẫu', 'Bỏ qua'))
check('hoi video lam gi', (await expectMsg('Video này để làm gì')) !== '')
// nut cu
press(btn('Gửi video mẫu', 'Bỏ qua'))
await sleep(150)
check('bam nut buoc cu -> bao da qua', calls.some((c) => c.method === 'answerCallbackQuery' && /đã qua/.test(String(c.params.text || ''))))
sendFile('photo', 'x.jpg')
check('gui anh o buoc chu -> nhac', (await expectMsg('cần trả lời bằng chữ')) !== '')
say('Để chạy quảng cáo quán trà sữa')
check('hoi style', (await expectMsg('style / phong cách')) !== '')
say('Nhanh, vui, bắt trend')
check('hoi khach hang', (await expectMsg('Khách hàng là ai')) !== '')
say('Nữ 18-25')
check('hoi do dai', (await expectMsg('Độ dài video')) !== '')
press(btn('Độ dài video', '30 giây'))
check('hoi font + danh sach kho font', (await expectMsg('Font chữ')) !== '' && !!btn('Font chữ', 'Be Vietnam Pro'))
press(btn('Font chữ', 'Be Vietnam Pro'))
check('chon font -> sua tin co dau chon', await until(() => calls.some((c) => c.method === 'editMessageText' && JSON.stringify(c.params.reply_markup).includes('✅ Be Vietnam Pro'))))
sendFile('document', 'Brand-Bold.ttf')
check('tai file font', await until(() => calls.some((c) => c.method === 'editMessageText' && String(c.params.text).includes('Đã nhận font'))))
check('hoi lai font (2 font)', (await expectMsg('Đã chọn: <b>Be Vietnam Pro, Brand-Bold.ttf')) !== '')
press(btn('Đã chọn', 'Xong'))
check('hoi mau', (await expectMsg('Màu sắc')) !== '')
press(btn('Màu sắc', 'Bỏ qua'))
check('hoi tu lieu', (await expectMsg('Tư liệu chèn vào video')) !== '')
const p1 = sendFile('photo', 'logo.jpg')
sendFile('video', 'clip.mp4')
check('hoi mo ta tu lieu 1/2 (tra loi vao anh)', (await expectMsg('Mô tả tư liệu 1/2')) !== '' && calls.at(-1)?.params.reply_to_message_id === p1)
check('chi hoi mo ta 1 lan cho album', texts().filter((t) => t.includes('Mô tả tư liệu 1/2')).length === 1)
say('Logo quán, hiện ở cuối video')
check('hoi mo ta tu lieu 2/2', (await expectMsg('Mô tả tư liệu 2/2')) !== '')
press(btn('Mô tả tư liệu 2/2', 'Bỏ qua mô tả'))
check('het mo ta -> hoi them / Xong', (await expectMsg('Đã có 2 tư liệu')) !== '')
press(btn('Đã có 2 tư liệu', 'Xong'))
check('bao da nhan + ma video', (await expectMsg('Đã nhận yêu cầu')) !== '' && lastText().includes('r_test') || texts().some((t) => t.includes('Mã video: <code>r_test0001')))
const inp = editInputs[0]
check('dau vao viec: 3 video nguon, khong video mau', inp?.videos.length === 3 && inp.videos[2] === LIB && inp.reference === null, inp)
check('dau vao viec: yeu cau edit', inp?.editRequest?.purpose === 'Để chạy quảng cáo quán trà sữa' && inp.editRequest.style === 'Nhanh, vui, bắt trend' && inp.editRequest.audience === 'Nữ 18-25' && inp.editRequest.duration === '30 giây', inp?.editRequest)
check('dau vao viec: font kho + file font, khong mau', JSON.stringify(inp?.brandGuide) === JSON.stringify({ fonts: ['f_be'] }) && inp.fontFiles?.length === 1 && inp.fontFiles[0].endsWith('.ttf'), [inp?.brandGuide, inp?.fontFiles])
check('dau vao viec: 2 tu lieu + mo ta', inp?.inserts.length === 2 && inp.inserts[0].note === 'Logo quán, hiện ở cuối video' && inp.inserts[1].note === '' && inp.inserts[0].use === 'show', inp?.inserts)
check('phien hoi da bo', !store.tgState().sessions[String(USER)])
const ref1 = store.tgState().jobs.find((j: any) => j.id === 'r_test0001')
check('theo doi viec + tin trang thai', await until(() => !!ref1?.statusMsgId))

// ------------------------------------------------------------------ 5. video thu 2 trong luc video 1 dang chay
console.log('[5] nhieu video cung luc')
editJobs.r_test0001.status = 'running'
editJobs.r_test0001.step = 'analyze'
editJobs.r_test0001.message = 'Đang phân tích video…'
await watchNow()
check('sua tin trang thai: buoc phan tich', calls.some((c) => c.method === 'editMessageText' && c.params.message_id === ref1.statusMsgId && String(c.params.text).includes('Phân tích video')))
say('/edit')
await expectMsg('Gửi video nguồn')
sendFile('video', 'b.mp4')
await expectMsg('Gửi video mẫu')
sendFile('video', 'mau.mp4')
await expectMsg('Video này để làm gì')
say('Bán áo')
await expectMsg('style')
say('Sang')
await expectMsg('Khách hàng')
say('Dân văn phòng')
await expectMsg('Độ dài')
press(btn('Độ dài video', 'Bỏ qua'))
await expectMsg('Font chữ')
say('Font tròn, dễ thương')
await expectMsg('Màu sắc')
say('#FF6A00 cam')
await expectMsg('Tư liệu chèn')
press(btn('Tư liệu chèn', 'Không có tư liệu'))
check('video 2 co ma rieng', (await expectMsg('r_test0002')) !== '')
const inp2 = editInputs[1]
check('video 2: video mau + font go tay + mau', !!inp2?.reference && inp2.brandGuide?.typography === 'Font tròn, dễ thương' && inp2.brandGuide?.colors === '#FF6A00 cam' && !inp2.editRequest.duration && !inp2.inserts.length, inp2)

// ------------------------------------------------------------------ 4. xong / loi
console.log('[4] theo doi viec -> gui video / bao loi')
editJobs.r_test0001.step = 'render'
editJobs.r_test0001.progress = 0.5
editJobs.r_test0001.message = 'Đang xuất video MP4 — 50%'
await watchNow()
check('trang thai render 50%', calls.some((c) => c.method === 'editMessageText' && String(c.params.text).includes('50%')))
const upDir = ref1.uploadDir
Object.assign(editJobs.r_test0001, { status: 'done', step: 'finish', result: { output: OUT, size: 5000, seconds: 10, duration: 21.5, width: 1080, height: 1920, workDir: HOME, warnings: [] } })
await watchNow()
const vid = calls.find((c) => c.method === 'sendVideo')
check('gui video multipart', !!vid && String(vid.params.video).startsWith('FILE:out.mp4:5000') && String(vid.params.chat_id) === String(USER) && String(vid.params.caption).includes('r_test0001'), vid?.params)
check('xong -> don file tai len', !existsSync(upDir))
editJobs.r_test0002.status = 'error'
editJobs.r_test0002.error = { step: 'plan', message: 'Claude hết hạn mức' }
await watchNow()
check('loi -> bao loi + nut chay lai', (await expectMsg('bị lỗi')) !== '' && !!btn('bị lỗi', 'Chạy lại'))
press(btn('bị lỗi', 'Chạy lại'))
check('chay lai -> viec moi cung dau vao', (await expectMsg('Đang chạy lại')) !== '' && editInputs.length === 3 && editInputs[2].videos[0] === inp2.videos[0])
say('📋 Video của tôi')
check('danh sach video co ma + trang thai', (await expectMsg('Video của bạn')) !== '' && /✅ <code>r_test0001/.test(lastText()) && /❌ <code>r_test0002/.test(lastText()))
say('r_test0001')
check('gui ma -> nhan lai video', await until(() => calls.filter((c) => c.method === 'sendVideo').length === 2))

// ------------------------------------------------------------------ 7. video > 49 MB
console.log('[7] video lon')
const BIG = join(HOME, 'big.mp4')
writeFileSync(BIG, '')
truncateSync(BIG, 60 * 1048576)
Object.assign(editJobs.r_test0003, { status: 'done', result: { output: BIG, size: 60 * 1048576, seconds: 1, duration: 30, width: 1080, height: 1920, workDir: HOME, warnings: [] } })
await watchNow()
const big = calls.filter((c) => c.method === 'sendVideo').at(-1)
check('> 49 MB -> gui ban nen + link ban goc', compressed === 1 && String(big?.params.video).startsWith('FILE:big.mp4:4000') && String(big?.params.caption).includes('https://example.com/goc.mp4'), big?.params)

// ------------------------------------------------------------------ 6. Tao video
console.log('[6] Tao video')
say('✨ Tạo video')
await expectMsg('Tên sản phẩm')
say('Agent Edit')
await expectMsg('Loại video')
press(btn('Loại video', 'Ra mắt sản phẩm'))
await expectMsg('Nội dung chính')
say('Ra mắt bot Telegram dựng video tự động')
await expectMsg('Website')
say('agentedit.vn')
await expectMsg('Người xem')
press(btn('Người xem', 'Bỏ qua'))
await expectMsg('Khung hình')
press(btn('Khung hình', 'Vuông'))
await expectMsg('Độ dài (giây)')
say('100')
check('do dai ngoai 6-90 -> hoi lai', (await expectMsg('từ 6 đến 90')) !== '')
say('30')
await expectMsg('Chọn giọng đọc')
press(btn('Chọn giọng đọc', 'Giọng của tôi'))
await expectMsg('Màu thương hiệu')
press(btn('Màu thương hiệu', 'Bỏ qua'))
await expectMsg('Font thương hiệu')
say('Be Vietnam Pro')
await expectMsg('Ảnh tư liệu')
sendFile('photo', 'logo.jpg')
await expectMsg('Mô tả ảnh 1/1')
say('Logo thương hiệu')
await expectMsg('Đã có 1 ảnh')
press(btn('Đã có 1 ảnh', 'Xong'))
await expectMsg('Ghi chú thêm')
say('Kết bằng câu: thử ngay hôm nay')
check('tao video -> ma mv-', (await expectMsg('mv-20261021-101010-abcd')) !== '')
const b = motionBriefs[0]
check('brief Tao video dung', b?.name === 'Agent Edit' && b.videoType === 'launch' && b.website === 'https://agentedit.vn' && b.aspect === '1:1' && b.duration === 30 &&
  b.voice.enabled && b.voice.voiceId === 'vc_me' && b.fonts === 'Be Vietnam Pro' && b.assets.length === 1 && /Kết bằng câu/.test(b.notes) && /Logo thương hiệu/.test(b.notes), b)
Object.assign(motionJobs['mv-20261021-101010-abcd'], { status: 'running', stage: 'idea' })
await watchNow()
check('trang thai Tao video theo buoc', calls.some((c) => c.method === 'editMessageText' && String(c.params.text).includes('Lên ý tưởng')))
Object.assign(motionJobs['mv-20261021-101010-abcd'], { status: 'done', output: OUT, meta: { width: 1080, height: 1080, seconds: 30, size: 5000 } })
await watchNow()
check('Tao video xong -> gui video', calls.filter((c) => c.method === 'sendVideo').some((c) => String(c.params.caption).includes('mv-20261021-101010-abcd')))

// ------------------------------------------------------------------ 8-9. huy / doi key
console.log('[8] huy + doi key')
say('/edit')
await expectMsg('Gửi video nguồn')
say('❌ Huỷ thao tác')
check('huy bang hoi', (await expectMsg('Đã huỷ bảng hỏi')) !== '' && !store.tgState().sessions[String(USER)])
check('thu muc tai len cua phien huy da xoa', readdirSync(join(HOME, '.capcut-studio', 'telegram', 'uploads', String(USER))).every((d) => store.tgState().jobs.some((j: any) => j.uploadDir?.endsWith(d))))
FP = 'fp-2'
say('/edit')
check('doi key tren may -> phai gui lai key', (await expectMsg('Key phần mềm trên máy đã đổi')) !== '' && !store.tgState().chats[String(USER)])
check('Cai dat thay chat da het quyen', bot.telegramInfo().chats.length === 0)

const tj = bot.telegramJobs(10)
check('CLI telegram jobs: ma + loai + trang thai', tj.length >= 4 && tj.some((j: any) => j.id === 'r_test0001' && j.kind === 'edit' && j.status === 'done' && j.delivered) &&
  tj.some((j: any) => j.id === 'r_test0002' && j.status === 'error') && tj.some((j: any) => j.kind === 'motion' && j.status === 'done'), tj)
await bot.stopTelegram()
check('tat bot', bot.telegramStatus().state === 'off')
server.close()
console.log(FAILS.length ? `\nFAIL ${FAILS.length}: ${FAILS.join(' | ')}` : '\nPASS — test_telegram')
process.exit(FAILS.length ? 1 : 0)
