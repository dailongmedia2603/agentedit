// Test CHE DO CLI (electron/cli/util.ts + jobs.ts). Chay (Node >= 23):
//   HOME=$(mktemp -d) node tests/test_cli.mts
// HOME tam: job / khoa nam o ~/.capcut-studio/cli cua HOME -> khong dung du lieu that.
//
// Can dam bao:
//  1. Tham so: --khoa gia-tri, --khoa=gia-tri, khoa lap lai, co bat (--json...), khoa la khong nuot --khoa ke tiep, vi tri
//  2. Job: luu / doc nguyen tu; tien trinh cua job chet giua chung -> "loi bat thuong" (khong treo "dang chay" mai)
//  3. Lan: render chi 1 cho; claude theo state.json; tien trinh giu khoa chet -> khoa tu het hieu luc; huy khi dang cho
//  4. withLock: 2 viec cung ten chay NOI TIEP
//  5. File yeu cau huy dat dung cho
import { register } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'

register('./helpers/electron-mock-loader.mjs', import.meta.url)
const U = await import('../electron/cli/util.ts')
const J = await import('../electron/cli/jobs.ts')

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)))
  if (!cond) FAILS.push(name)
}

const H = homedir().replace(/\\/g, '/').toLowerCase()
if (!H.includes('tmp') && !H.includes('/t/') && !H.includes('/temp/') && !H.startsWith('/var/folders')) {
  console.log('Chay voi HOME tam: HOME=$(mktemp -d) node tests/test_cli.mts')
  process.exit(2)
}

console.log('[1] tham so dong lenh')
let a = U.parseArgs(['make', '--video', '/a b.mp4', '--video=/c.mov', '--json', '--request', 'Giới thiệu: sản phẩm', 'x.mp4'])
check('lenh + vi tri', a.cmd === 'make' && a.pos.length === 1 && a.pos[0] === 'x.mp4', a)
check('khoa lap lai -> mang (ca dang --k=v)', JSON.stringify(U.optAll(a, 'video')) === JSON.stringify(['/a b.mp4', '/c.mov']), a.opts)
check('co bat --json', a.flags.has('json'))
check('gia tri co dau ":" giu nguyen', U.opt(a, 'request') === 'Giới thiệu: sản phẩm')
a = U.parseArgs(['make', '--new-plan', '--video', '/v.mp4', '--la-hoac', '--landscape'])
check('--new-plan la co, khong nuot --video', a.flags.has('new-plan') && U.opt(a, 'video') === '/v.mp4', a)
check('khoa la dung truoc --khoa khac -> coi la co', a.flags.has('la-hoac') && a.flags.has('landscape'), a)
a = U.parseArgs([])
check('khong lenh -> help', a.cmd === 'help')
a = U.parseArgs(['wait', 'r_abc123', '--timeout', '0'])
check('wait --timeout 0', a.cmd === 'wait' && a.pos[0] === 'r_abc123' && U.opt(a, 'timeout') === '0', a)
a = U.parseArgs(['wait', '--until-change', 'r_abc123', '--json'])
check('--until-change la co, khong nuot ma viec', a.flags.has('until-change') && a.pos[0] === 'r_abc123' && a.flags.has('json'), a)

console.log('[1b] moc tien do (wait --until-change)')
{
  const base = { id: 'r_x', createdAt: 0, updatedAt: 0, status: 'running' as const, input: { videos: [], inserts: [], orientation: 'portrait' as const, fresh: false } }
  const M = (o: Record<string, unknown>) => J.jobMilestone({ ...base, ...o } as Parameters<typeof J.jobMilestone>[0])
  check('queued -> running cung buoc: KHONG doi moc', M({ status: 'queued', step: 'prepare' }) === M({ step: 'prepare' }))
  check('dong Doctor khac nhau cung buoc: KHONG doi moc', M({ step: 'prepare', message: 'a' }) === M({ step: 'prepare', message: 'b' }))
  check('sang buoc moi: doi moc', M({ step: 'prepare' }) !== M({ step: 'import' }))
  check('bat dau cho luot: doi moc', M({ step: 'analyze' }) !== M({ step: 'analyze', waiting: 'gemini' }))
  check('render 10% -> 20%: KHONG doi moc', M({ step: 'render', progress: 0.1 }) === M({ step: 'render', progress: 0.2 }))
  check('render 20% -> 26%: doi moc', M({ step: 'render', progress: 0.2 }) !== M({ step: 'render', progress: 0.26 }))
  check('progress ngoai buoc render bi bo qua', M({ step: 'finish', progress: 1 }) === M({ step: 'finish' }))
}

console.log('[2] job: luu / doc / tien trinh chet')
const id = J.newJobId()
check('ma viec dang r_...', /^r_[a-z0-9]{6,24}$/.test(id), id)
const input = { videos: ['/x.mp4'], inserts: [], orientation: 'portrait' as const, fresh: false }
J.saveJob({ id, createdAt: Date.now(), updatedAt: 0, status: 'running', step: 'plan', message: 'Đang tạo video…', input, pid: process.pid })
let j = J.loadJob(id)
check('doc lai dung', j?.status === 'running' && j?.message === 'Đang tạo video…' && j?.input.videos[0] === '/x.mp4', j)
check('ma la / ../ -> null', J.loadJob('../../etc') === null && J.loadJob('khong-co') === null)
// tien trinh chet: tao 1 tien trinh roi doi no thoat -> pid chet
const dead = await new Promise<number>((res) => {
  const p = spawn(process.execPath, ['-e', '0'])
  p.on('exit', () => res(p.pid as number))
})
J.saveJob({ ...(j as NonNullable<typeof j>), pid: dead, status: 'running' })
j = J.loadJob(id)
check('tien trinh chet giua chung -> error + goi y', j?.status === 'error' && /bất thường/.test(j?.error?.message || '') && !!j?.error?.hint, j)
check('activeJobs khong tinh job da chet', !J.activeJobs().some((x) => x.id === id))
const id2 = J.newJobId()
J.saveJob({ id: id2, createdAt: Date.now(), updatedAt: 0, status: 'done', input, pid: process.pid, tail: true })
check('job xong nhung con viec nen (tail) -> activeJobs co', J.activeJobs().some((x) => x.id === id2))
check('listJobs moi nhat truoc', J.listJobs()[0]?.createdAt >= J.listJobs()[1]?.createdAt)
check('file huy nam trong thu muc job', J.cancelFile(id2) === join(J.jobDir(id2), 'cancel'))

console.log('[3] lan cho luot giua tien trinh')
const never = () => false
const r1 = await J.acquireLane('render', 'job-a', () => undefined, never)
let waited = false
let got2 = false
const p2 = J.acquireLane('render', 'job-b', () => (waited = true), never).then((rel) => {
  got2 = true
  return rel
})
await U.sleep(300)
check('render: viec thu 2 phai cho', waited && !got2)
r1()
const r2 = await p2
check('tra cho -> viec cho duoc chay', got2)
r2()
// khoa cua tien trinh da chet -> tu het hieu luc
mkdirSync(U.LOCKS_DIR, { recursive: true })
writeFileSync(join(U.LOCKS_DIR, 'render-0.lock'), JSON.stringify({ pid: dead, owner: 'chet' }))
const r3 = await Promise.race([J.acquireLane('render', 'job-c', () => undefined, never), U.sleep(3000).then(() => null)])
check('khoa cua tien trinh chet -> lay lai duoc ngay', typeof r3 === 'function')
if (typeof r3 === 'function') r3()
// gioi han lan claude theo state.json (Cai dat "Tao nhieu video cung luc")
mkdirSync(join(homedir(), '.capcut-studio'), { recursive: true })
writeFileSync(join(homedir(), '.capcut-studio', 'state.json'), JSON.stringify({ video_jobs_claude: 2 }))
const c1 = await J.acquireLane('claude', 'a', () => undefined, never)
let c2waited = false
const c2 = await J.acquireLane('claude', 'b', () => (c2waited = true), never)
check('claude gioi han 2 -> 2 viec chay cung luc', !c2waited)
let cancel = false
let c3err = ''
const c3 = J.acquireLane('claude', 'c', () => undefined, () => cancel).catch((e) => (c3err = String(e.message)))
await U.sleep(300)
cancel = true
await c3
check('dang cho ma huy -> nem loi cancelled', c3err === 'cancelled', c3err)
c1()
c2()

console.log('[4] withLock: noi tiep')
const order: string[] = []
const w1 = J.withLock('thu', async () => {
  order.push('1-bat-dau')
  await U.sleep(400)
  order.push('1-xong')
})
await U.sleep(50)
const w2 = J.withLock('thu', async () => {
  order.push('2-bat-dau')
})
await Promise.all([w1, w2])
check('viec 2 bat dau sau khi viec 1 xong', order.join(',') === '1-bat-dau,1-xong,2-bat-dau', order)
check('khoa duoc go sau khi xong', !existsSync(join(U.LOCKS_DIR, 'thu.lock')))

console.log('[5] ghi nguyen tu')
const f = join(U.CLI_HOME, 'thu.json')
U.writeJsonAtomic(f, { a: 1 })
check('doc lai', U.readJson(f, null as unknown as { a: number })?.a === 1)
check('doc file hong -> gia tri mac dinh', U.readJson(join(U.CLI_HOME, 'khong-co.json'), 'md') === 'md')

console.log(FAILS.length ? `\nFAIL ${FAILS.length}: ${FAILS.join(', ')}` : '\nTAT CA PASS')
process.exit(FAILS.length ? 1 : 0)
