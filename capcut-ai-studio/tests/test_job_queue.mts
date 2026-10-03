// Test hang doi nhieu video cung luc (src/lib/jobQueue.ts). Chay (Node >= 23):
//   node tests/test_job_queue.mts
// Can dam bao:
//  1. Con cho -> chay ngay; het cho -> cho FIFO, nha luot thi video dau hang chay
//  2. Render luon 1 video 1 luc; gemini / claude theo gioi han (mac dinh 2 / 1), kep trong [1, tran]
//  3. Huy cho -> Promise nem QueueCancelled, khong dong vao luot dang chay; nha luot 2 lan vo hai
//  4. Tang gioi han -> video dang cho chay ngay; giam -> video dang chay KHONG bi dung
//  5. Cac lan doc lap nhau (dang render van phan tich / lap plan duoc)
const Q = await import('../src/lib/jobQueue.ts')

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)))
  if (!cond) FAILS.push(name)
}
const tick = () => new Promise((r) => setTimeout(r, 0))
/** Promise da xong chua (khong cho) */
async function settled(p: Promise<unknown>): Promise<'ok' | 'err' | 'pending'> {
  let st: 'ok' | 'err' | 'pending' = 'pending'
  p.then(() => (st = 'ok'), () => (st = 'err'))
  await tick()
  return st
}

console.log('[1] Render: 1 video 1 luc, FIFO')
Q._resetForTest()
const r1 = await Q.acquire('render', 'v1', 'Video 1')
const p2 = Q.acquire('render', 'v2', 'Video 2')
const p3 = Q.acquire('render', 'v3', 'Video 3')
check('v1 chay ngay, v2 v3 cho', (await settled(p2)) === 'pending' && (await settled(p3)) === 'pending')
check('vi tri cho', Q.waitPosition('render', 'v2') === 0 && Q.waitPosition('render', 'v3') === 1 && Q.waitPosition('render', 'v1') === -1)
let snap = Q.snapshot()
check('anh chup: v1 dang giu, v2 v3 cho', snap.render.active.map((a) => a.jobId).join() === 'v1' && snap.render.queue.map((a) => a.jobId).join() === 'v2,v3', snap.render)
r1()
check('nha luot v1 -> v2 chay, v3 van cho', (await settled(p2)) === 'ok' && (await settled(p3)) === 'pending')
r1()
check('nha luot 2 lan vo hai (v3 van cho)', (await settled(p3)) === 'pending' && Q.snapshot().render.active.length === 1)
const r2 = await p2
r2()
const r3 = await p3
check('v3 chay sau v2', Q.snapshot().render.active.map((a) => a.jobId).join() === 'v3')
r3()
check('het video -> lan trong', Q.snapshot().render.active.length === 0 && Q.snapshot().render.queue.length === 0)

console.log('[2] Gioi han mac dinh + kep')
Q._resetForTest()
check('mac dinh gemini 2, claude 1, render 1', JSON.stringify(Q.getLimits()) === JSON.stringify({ gemini: 2, claude: 1, render: 1 }), Q.getLimits())
const g1 = await Q.acquire('gemini', 'a', 'A')
const g2 = await Q.acquire('gemini', 'b', 'B')
const g3 = Q.acquire('gemini', 'c', 'C')
check('gemini 2 video cung luc, video thu 3 cho', (await settled(g3)) === 'pending')
const c1 = await Q.acquire('claude', 'd', 'D')
const c2 = Q.acquire('claude', 'e', 'E')
check('claude 1 video, video thu 2 cho', (await settled(c2)) === 'pending')
const rr = Q.acquire('render', 'f', 'F')
check('cac lan doc lap: render chay du gemini / claude dang day', (await settled(rr)) === 'ok')
;(await rr)()
Q.setLimits({ gemini: 99, claude: 0, render: 5 } as never)
check('kep gioi han: gemini <= 20, claude >= 1, render luon 1', JSON.stringify(Q.getLimits()) === JSON.stringify({ gemini: 20, claude: 1, render: 1 }), Q.getLimits())
check('tang gioi han gemini -> video dang cho chay ngay', (await settled(g3)) === 'ok')
check('clampLimit chuoi rac -> mac dinh', Q.clampLimit('claude', 'abc') === 1 && Q.clampLimit('gemini', '3') === 3)

console.log('[3] Giam gioi han khong dung video dang chay')
Q.setLimits({ gemini: 1 })
check('3 video gemini van giu luot', Q.snapshot().gemini.active.length === 3)
const g4 = Q.acquire('gemini', 'g', 'G')
g1()
check('nha 1 (con 2 > gioi han 1) -> video moi van cho', (await settled(g4)) === 'pending')
g2()
;(await g3)()
check('nha het -> video moi chay', (await settled(g4)) === 'ok')
;(await g4)()

console.log('[4] Huy cho')
const c3 = Q.acquire('claude', 'h', 'H')
const n = Q.cancelWait('e')
check('huy video e dang cho -> nem QueueCancelled', n === 1 && (await settled(c2)) === 'err')
let err: unknown = null
await c2.catch((e) => (err = e))
check('loi dung loai QueueCancelled', err instanceof Q.QueueCancelled)
check('huy khong dong luot dang chay (d van giu claude)', Q.snapshot().claude.active.map((a) => a.jobId).join() === 'd')
check('video sau trong hang (h) len dau', Q.waitPosition('claude', 'h') === 0)
check('huy video khong cho -> 0', Q.cancelWait('khong-co') === 0)
c1()
check('nha d -> h chay (khong phai e da huy)', (await settled(c3)) === 'ok' && Q.snapshot().claude.active.map((a) => a.jobId).join() === 'h')
;(await c3)()

console.log('[5] Bao thay doi')
let calls = 0
const off = Q.subscribe(() => calls++)
const v0 = Q.getVersion()
const x = await Q.acquire('render', 'z', 'Z')
x()
off()
check('subscribe nhan su kien + version tang', calls >= 2 && Q.getVersion() > v0, { calls })

console.log(FAILS.length ? `\n${FAILS.length} FAIL: ${FAILS.join(', ')}` : '\nTAT CA PASS')
process.exit(FAILS.length ? 1 : 0)
