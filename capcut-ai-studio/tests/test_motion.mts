// Test "Tao video" (skill motionmaxxing) + "Automation Video" (electron/services/motion/*). Chay (Node >= 23):
//   node tests/test_motion.mts
// HOME tam -> khong dong vao du lieu that. Claude GIA (script trong <HOME>/.local/bin/claude) -> khong ton han muc.
// Can dam bao:
//  1. Skill: phien ban theo noi dung, chep 1 lan, doi noi dung -> ban moi + xoa ban cu; job tro skill qua lien ket.
//  2. Prompt: kiem brief; brief.md du truong; prompt CHAY KHONG CAN NGUOI, giong Saydi dung id / khong loi doc, luat tin tuc.
//  3. Doc stream-json: buoc theo lenh skill (brand / render final / look.py...), ket qua thanh cong / loi.
//  4. Lay tin: RSS (CDATA, enclosure), Atom, tim RSS trong trang, link bai tren trang chuyen muc, bai viet, Facebook.
//  5. Runner (claude gia): co --setting-sources project + --tools + prompt qua stdin + SAYDI_API_KEY khi co loi doc;
//     ra final.mp4 -> done + meta; khong ra -> error; huy; chay lai.
//  6. Automation: lan dau chi ghi nhan; tin moi -> video (brief tu tin + anh bai); tran / lan + tran / ngay; loi nguon.
import { register } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, chmodSync, lstatSync, realpathSync, symlinkSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { join } from 'path'

register('./helpers/electron-mock-loader.mjs', import.meta.url)

const REAL_HOME = homedir()
const HOME = mkdtempSync(join(tmpdir(), 'motion-test-'))
process.env.HOME = HOME
process.env.STUDIO_LICENSE = 'off' // ban quyen: test rieng o test_license.mts
process.env.USERPROFILE = HOME
;(globalThis as any).__USERDATA = join(HOME, 'userdata')
mkdirSync((globalThis as any).__USERDATA, { recursive: true })

const FAILS: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : ' -> ' + JSON.stringify(detail)?.slice(0, 600)))
  if (!cond) FAILS.push(name)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const SK = await import('../electron/services/motion/skill.ts')
const PR = await import('../electron/services/motion/prompt.ts')
const ST = await import('../electron/services/motion/stages.ts')
const SO = await import('../electron/services/motion/sources.ts')

// ------------------------------------------------------------------ 1. skill
console.log('[1] skill dong goi')
{
  const bundle = join(HOME, 'bundle', 'motionmaxxing')
  mkdirSync(join(bundle, 'scripts'), { recursive: true })
  writeFileSync(join(bundle, 'SKILL.md'), '# skill v1')
  writeFileSync(join(bundle, 'scripts', 'a.py'), 'print(1)')
  const mh = join(HOME, 'mh')
  const v1 = SK.skillVersion(bundle)
  check('phien ban on dinh', v1 === SK.skillVersion(bundle) && v1.length === 12)
  const a = SK.installSkill(bundle, mh)
  check('lan dau chep', a.fresh && existsSync(join(a.dir, 'SKILL.md')) && existsSync(join(a.dir, 'scripts', 'a.py')))
  const b = SK.installSkill(bundle, mh)
  check('lan 2 khong chep lai', !b.fresh && b.dir === a.dir)
  writeFileSync(join(bundle, 'SKILL.md'), '# skill v2')
  const c = SK.installSkill(bundle, mh)
  check('doi noi dung -> ban moi', c.fresh && c.version !== v1 && readFileSync(join(c.dir, 'SKILL.md'), 'utf-8') === '# skill v2')
  check('xoa ban cu', !existsSync(a.dir) && readdirSync(join(mh, 'skill')).length === 1)
  const job = join(HOME, 'job1')
  const link = SK.linkSkill(job, c.dir)
  check('job tro skill', lstatSync(link).isSymbolicLink() && realpathSync(link) === realpathSync(c.dir))
  SK.linkSkill(job, c.dir)
  check('lien ket lai khong loi', existsSync(join(link, 'SKILL.md')))
  // skill that trong repo cai duoc
  const real = SK.installSkill(join(process.cwd(), 'skills', 'motionmaxxing'), join(HOME, 'mh-real'))
  check('skill that: co SKILL.md + voice.py + gsap', ['SKILL.md', 'scripts/voice.py', 'runtime/vendor/gsap.min.js', 'NOTICE'].every((f) => existsSync(join(real.dir, f))))
  check('skill that: GSAP 3.15', readFileSync(join(real.dir, 'runtime/vendor/gsap.min.js'), 'utf-8').includes('GSAP 3.15.0'))
}

// ------------------------------------------------------------------ 2. prompt
console.log('[2] brief + prompt')
const baseBrief = () => ({
  name: 'Agent Edit',
  website: 'https://agentedit.vn',
  videoType: 'promo',
  message: 'App tự edit video TikTok bằng AI.',
  audience: 'creator',
  goal: 'tải app',
  cta: 'Dùng thử tại agentedit.vn',
  tone: 'nhanh',
  aspect: '9:16' as const,
  duration: 20,
  language: 'vi',
  colors: '#FF7A1A',
  fonts: 'Be Vietnam Pro',
  assets: [] as string[],
  voice: { enabled: true, voiceId: 'vi-mark-rober-hot-tiktok', voiceName: 'Mark Rober', speed: 1.1, script: '' },
  notes: 'tránh màu tím'
})
{
  check('brief hop le', PR.validateBrief(baseBrief() as any) === null)
  check('thieu ten', !!PR.validateBrief({ ...baseBrief(), name: ' ' } as any))
  check('thieu noi dung', !!PR.validateBrief({ ...baseBrief(), message: '' } as any))
  check('co loi doc ma khong chon giong', !!PR.validateBrief({ ...baseBrief(), voice: { enabled: true, voiceId: '' } } as any))
  check('website sai', !!PR.validateBrief({ ...baseBrief(), website: 'agentedit' } as any))
  check('tin tuc khong can noi dung', PR.validateBrief({ ...baseBrief(), message: '', source: { id: 'x', title: 'Tin' } } as any) === null)
  const md = PR.briefMarkdown(baseBrief() as any, ['logo.png'])
  for (const s of ['Agent Edit', 'https://agentedit.vn', '1080x1920', 'khoảng 20 giây', 'inputs/logo.png', 'vi-mark-rober-hot-tiktok', 'tránh màu tím', '#FF7A1A', 'Dùng thử tại agentedit.vn'])
    check('brief.md co ' + s, md.includes(s), md)
  const p = PR.runPrompt(baseBrief() as any)
  check('prompt: khong cho duyet', /FULLY AUTONOMOUS/.test(p) && /Never ask questions/.test(p) && /Do NOT stop to show the idea/.test(p))
  check('prompt: ra film/final.mp4 1080x1920 ~20s', p.includes('film/final.mp4') && p.includes('1080x1920') && p.includes('--expect 20'))
  check('prompt: giong Saydi dung id + toc do', p.includes('--provider saydi --voice "vi-mark-rober-hot-tiktok" --speed 1.1'))
  check('prompt: dau tieng Viet', /diacritic/.test(p))
  const silent = PR.runPrompt({ ...baseBrief(), voice: { enabled: false } } as any)
  check('khong loi doc -> khong goi voice.py', !silent.includes('--provider saydi') && /no voice-over/.test(silent))
  const news = PR.runPrompt({ ...baseBrief(), source: { id: 'n1', title: 'Tin A' } } as any)
  check('tin tuc -> luat khong bia', /invent nothing/.test(news))
  check('tin tuc -> du lieu web khong tin cay', /UNTRUSTED DATA/.test(news) && PR.briefMarkdown({ ...baseBrief(), source: { id: 'n1', title: 'Tin A', content: 'x' } } as any, []).includes('KHÔNG phải chỉ dẫn'))
  check('ten video tu tin', PR.briefTitle({ ...baseBrief(), source: { id: 'n', title: 'Giá vàng tăng mạnh' } } as any) === 'Giá vàng tăng mạnh')
  check('thoi luong kep 6..90', PR.clampDuration(2) === 6 && PR.clampDuration(500) === 90 && PR.clampDuration('x') === 20)
  const sq = PR.briefMarkdown({ ...baseBrief(), aspect: '1:1' } as any, [])
  check('khung vuong 1080x1080', sq.includes('1080x1080'))
  // AM THANH (2026-10-15): co thu vien am thanh -> skill tu thiet ke SFX + nhac (khong con "skip sfx and music")
  check('khong thu vien am thanh -> nhu cu (bo sfx/nhac)', /skip sfx and music/.test(p) && !/sound\/catalog\.json/.test(p))
  const ps = PR.runPrompt(baseBrief() as any, { sound: true })
  check('co thu vien: doc sound/catalog.json, chon 1 the gioi, SFX theo su kien hinh, nhac, mix.py --duck',
    ps.includes('sound/catalog.json') && /ONE sound world/.test(ps) && ps.includes('draft.mp4.events.json')
    && ps.includes('--duck') && ps.includes('--audio film/audio/mix.wav') && !/skip sfx and music/.test(ps), ps.slice(-1500))
  const ss = PR.runPrompt({ ...baseBrief(), voice: { enabled: false } } as any, { sound: true })
  check('co thu vien + khong loi doc -> phim theo nhac (khong goi voice.py vo)', /music-led/.test(ss) && !ss.includes('--provider saydi')
    && !/works silent/.test(ss), ss.slice(-900))
}

// ------------------------------------------------------------------ 2b. thu vien am thanh cho job
console.log('[2b] thu vien am thanh <job>/sound/')
{
  const SD = await import('../electron/services/motion/sound.ts')
  const root = mkdtempSync(join(tmpdir(), 'motion-sound-'))
  const sfxDir = join(root, 'sfx'), musicDir = join(root, 'music'), job = join(root, 'job')
  mkdirSync(sfxDir, { recursive: true }); mkdirSync(musicDir, { recursive: true }); mkdirSync(job, { recursive: true })
  writeFileSync(join(sfxDir, 'kw-am_ap-pop.wav'), 'x'); writeFileSync(join(sfxDir, 'ding.mp3'), 'x')
  writeFileSync(join(musicDir, 'm1.mp3'), 'x')
  const sum = SD.prepareSound(job, {
    sfx_worlds: { am_ap: { name: 'Ấm áp', character: 'mộc', sounds: [{ family: 'pop', file: join(sfxDir, 'kw-am_ap-pop.wav') },
      { family: 'ding', file: join(sfxDir, 'mat.wav') }] } },
    sfx_library: [{ id: 'ding', file: join(sfxDir, 'ding.mp3') }, { id: 'ngoai', file: join(root, 'ngoai.mp3') }],
    music: [{ id: 'm1', file: join(musicDir, 'm1.mp3') }]
  }, sfxDir, musicDir)
  const cat = JSON.parse(readFileSync(join(job, 'sound', 'catalog.json'), 'utf8'))
  check('dem dung muc dung duoc (file mat / ngoai kho bi bo)', sum?.worlds === 1 && sum?.library === 1 && sum?.music === 1, sum)
  check('duong dan tuong doi trong job + lien ket doc duoc', cat.sfx_worlds.am_ap.sounds[0].file === 'sound/sfx/kw-am_ap-pop.wav'
    && cat.music[0].file === 'sound/music/m1.mp3' && existsSync(join(job, cat.music[0].file))
    && lstatSync(join(job, 'sound', 'sfx')).isSymbolicLink(), cat)
  check('danh muc rong -> null, khong ghi file', SD.prepareSound(join(root, 'job2'), { sfx_worlds: {}, music: [] }, sfxDir, musicDir) === null
    && !existsSync(join(root, 'job2', 'sound', 'catalog.json')))
  check('khong co danh muc -> null', SD.prepareSound(job, null, sfxDir, musicDir) === null)
}

// ------------------------------------------------------------------ 3. stream-json
console.log('[3] doc tien do Claude')
{
  const tool = (name: string, input: object) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })
  check('init', ST.parseStreamLine(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-opus-5', skills: ['motionmaxxing'] })).model === 'claude-opus-5')
  check('canh bao thieu skill', ST.parseStreamLine(JSON.stringify({ type: 'system', subtype: 'init', skills: [] })).lines.some((l) => /không nạp được skill/.test(l)))
  check('brand.mjs -> brand', ST.parseStreamLine(tool('Bash', { command: 'node "$SKILL/scripts/brand.mjs" https://x film/brand' })).stage === 'brand')
  check('STORYBOARD -> idea', ST.parseStreamLine(tool('Write', { file_path: '/j/film/STORYBOARD.md' })).stage === 'idea')
  check('voice.py vo -> voice', ST.parseStreamLine(tool('Bash', { command: 'python3 "$SKILL/scripts/voice.py" vo --provider saydi' })).stage === 'voice')
  check('index.html -> build', ST.parseStreamLine(tool('Write', { file_path: '/j/film/index.html' })).stage === 'build')
  check('render draft -> build', ST.parseStreamLine(tool('Bash', { command: 'node render.mjs film/index.html film/draft.mp4 --scale 0.5' })).stage === 'build')
  check('look.py -> review', ST.parseStreamLine(tool('Bash', { command: 'python3 look.py film/draft.mp4 --out film/look' })).stage === 'review')
  check('render final -> final', ST.parseStreamLine(tool('Bash', { command: 'node render.mjs film/index.html film/final.mp4 --audio x' })).stage === 'final')
  check('NOTE.md -> note', ST.parseStreamLine(tool('Write', { file_path: 'film/NOTE.md' })).stage === 'note')
  check('heredoc NOTE.md nhac brand.mjs -> note', ST.parseStreamLine(tool('Bash', { command: "cat > film/NOTE.md <<'EOF'\n# NOTE\nnode brand.mjs da chay\nEOF" })).stage === 'note')
  check('heredoc python sua index.html khong tinh', ST.parseStreamLine(tool('Bash', { command: "python3 - <<'PY'\nprint('look.py')\nPY" })).stage === undefined)
  check('grep look.py khong tinh', ST.parseStreamLine(tool('Bash', { command: 'grep -n G2 "$SKILL/scripts/look.py" | head' })).stage === undefined)
  check('--help khong tinh', ST.parseStreamLine(tool('Bash', { command: 'python3 "$SKILL/scripts/voice.py" vo --help' })).stage === undefined)
  check('cd roi chay render final', ST.parseStreamLine(tool('Bash', { command: 'cd film && node ../.claude/skills/motionmaxxing/scripts/render.mjs index.html final.mp4 --audio a.wav' })).stage === 'final')
  check('lenh khac khong doi buoc', ST.parseStreamLine(tool('Bash', { command: 'ls' })).stage === undefined)
  const ok = ST.parseStreamLine(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'MOTION_RESULT film/final.mp4', total_cost_usd: 1.5 }))
  check('ket qua thanh cong', ok.result?.ok === true && ok.result.costUsd === 1.5)
  const bad = ST.parseStreamLine(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' }))
  check('ket qua loi', bad.result?.ok === false)
  check('dong hong', ST.parseStreamLine('{khong phai json').lines.length === 0)
}

// ------------------------------------------------------------------ 4. lay tin
console.log('[4] lay tin')
const RSS = (items: { id: string; title: string; img?: string }[]) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Báo X</title>
${items
  .map(
    (i) => `<item><title><![CDATA[${i.title}]]></title><link>https://bao.vn/${i.id}.html</link><guid>https://bao.vn/${i.id}.html</guid>
<description><![CDATA[<a href="https://bao.vn/${i.id}.html"><img src="https://bao.vn/img/${i.id}.jpg"></a>Tóm tắt ${i.title} &amp; thêm]]></description>
<pubDate>Tue, 14 Oct 2026 08:00:00 +0700</pubDate>${i.img ? `<enclosure url="${i.img}" type="image/jpeg" length="1"/>` : ''}</item>`
  )
  .join('\n')}
</channel></rss>`
{
  const items = SO.parseFeed(RSS([{ id: 'a1', title: 'Giá vàng tăng', img: 'https://bao.vn/e.jpg' }, { id: 'a2', title: 'Bão số 5' }]), 'https://bao.vn/rss', 'bao.vn')
  check('RSS: 2 tin', items.length === 2)
  check('RSS: CDATA + entity', items[0].title === 'Giá vàng tăng' && /Tóm tắt Giá vàng tăng & thêm/.test(items[0].summary || ''), items[0])
  check('RSS: anh enclosure', items[0].image === 'https://bao.vn/e.jpg')
  check('RSS: anh trong mo ta', items[1].image === 'https://bao.vn/img/a2.jpg')
  check('RSS: id = guid', items[1].id === 'https://bao.vn/a2.html')
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>B</title><entry><title>Bài Atom</title><link rel="alternate" href="/p/1"/><id>tag:b,1</id><summary>Tóm &lt;b&gt;tắt&lt;/b&gt;</summary><updated>2026-10-14</updated></entry></feed>`
  check('Atom co nhan dien', SO.looksLikeFeed(atom))
  const at = SO.parseFeed(atom, 'https://b.vn/feed')
  check('Atom: tin + link tuyet doi', at.length === 1 && at[0].url === 'https://b.vn/p/1' && at[0].id === 'tag:b,1' && at[0].summary === 'Tóm tắt', at)
  const page = `<html><head><link rel="alternate" type="application/rss+xml" href="/rss/tin-moi.rss"><title>Báo</title></head><body>
<a href="/kinh-doanh/gia-vang-hom-nay-tang-manh-4812345.html">Giá vàng hôm nay tăng mạnh lên đỉnh mới</a>
<a href="/kinh-doanh/gia-vang-hom-nay-tang-manh-4812345.html">Giá vàng hôm nay tăng mạnh lên đỉnh mới</a>
<a href="/the-thao/">Thể thao</a><a href="/tag/vang">tag vàng thật dài dài dài</a>
<a href="https://other.com/a-b-c-d.html">Bài ở trang khác dài dài dài</a>
<a href="/thoi-su/bao-so-5-do-bo-vao-mien-trung">Bão số 5 đổ bộ vào miền Trung chiều nay</a>
<a href="/khoa-hoc-cong-nghe">Khoa học công nghệ (chuyên mục)</a><a href="/hoat-dong-bo-khcn-don-vi">Hoạt động Bộ KH&amp;CN và đơn vị</a></body></html>`
  check('entity co dau + ma hoa 2 lan', SO.decodeEntities('h&oacute;a v&igrave; &Ecirc;m &amp;agrave; &#7853;') === 'hóa vì Êm à ậ', SO.decodeEntities('h&oacute;a v&igrave; &Ecirc;m &amp;agrave; &#7853;'))
  check('diem link bai', SO.articleScore('/khoa-hoc-cong-nghe') === 0 && SO.articleScore('/hoat-dong-bo-khcn-don-vi') === 1 && SO.articleScore('/robot-nasa-lap-ky-luc-4980123.html') === 2 && SO.articleScore('/2026/10/14/abc') === 2)
  check('doan duong RSS', SO.guessFeeds('https://vnexpress.net/so-hoa').includes('https://vnexpress.net/rss/so-hoa.rss'))
  check('tim RSS trong trang', SO.discoverFeeds(page, 'https://bao.vn/kinh-doanh')[0] === 'https://bao.vn/rss/tin-moi.rss')
  const links = SO.extractLinks(page, 'https://bao.vn/kinh-doanh', 'bao.vn')
  check('link bai: dung 2, bo trung / tag / chuyen muc / trang khac', links.length === 2 && links[0].url === 'https://bao.vn/kinh-doanh/gia-vang-hom-nay-tang-manh-4812345.html', links)
  const art = SO.extractArticle(
    `<html><head><meta property="og:title" content="Giá vàng &amp; USD"><meta property="og:description" content="Mô tả ngắn"><meta property="og:image" content="/i/1.jpg"><meta property="article:published_time" content="2026-10-14T08:00"></head><body><nav><p>menu</p></nav><article><p>Đoạn một của bài viết có đủ dài để được lấy vào nội dung chính.</p><p>ngắn</p><p>Đoạn hai của bài viết cũng đủ dài để được giữ lại trong nội dung.</p></article></body></html>`,
    'https://bao.vn/a.html'
  )
  check('bai viet: og + doan dai', art.title === 'Giá vàng & USD' && art.image === 'https://bao.vn/i/1.jpg' && art.content.split('\n').length === 2 && art.published.startsWith('2026'), art)
  check('fb id tu link', SO.fbPageId('https://www.facebook.com/vnexpress/') === 'vnexpress' && SO.fbPageId('https://facebook.com/profile.php?id=123') === '123' && SO.fbPageId('@abc') === 'abc')
  const fb = SO.fbItems({ data: [{ id: '1_2', message: 'Dòng đầu\nnội dung', created_time: 't', permalink_url: 'https://fb.com/p', full_picture: 'https://img' }, { id: '3' }] })
  check('fb: bo bai rong, tieu de = dong dau', fb.length === 1 && fb[0].title === 'Dòng đầu' && fb[0].id === 'fb_1_2' && fb[0].image === 'https://img')
}

// ------------------------------------------------------------------ fetch gia lap (nguon tin, anh, Saydi)
const WEB: Record<string, { body: string | Buffer; type: string; status?: number }> = {}
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: any) => {
  const url = String(input?.url || input)
  const r = WEB[url]
  if (!r) return new Response('not found', { status: 404 })
  return new Response(r.body as any, { status: r.status || 200, headers: { 'content-type': r.type } })
}) as typeof fetch

// ------------------------------------------------------------------ 5. runner (claude gia)
console.log('[5] runner voi claude gia')
const FFMPEG = join(REAL_HOME, '.capcut-studio', 'tools', 'bin', 'ffmpeg')
// nhu may that: Doctor da cai ffmpeg + ffprobe vao ~/.capcut-studio/tools/bin
const toolsBin = join(HOME, '.capcut-studio', 'tools', 'bin')
mkdirSync(toolsBin, { recursive: true })
for (const t of ['ffmpeg', 'ffprobe']) symlinkSync(join(REAL_HOME, '.capcut-studio', 'tools', 'bin', t), join(toolsBin, t))
const binDir = join(HOME, '.local', 'bin')
mkdirSync(binDir, { recursive: true })
// claude gia: ghi tham so + stdin + env, in stream-json, tao film/final.mp4 (ffmpeg that) tru khi FAKE_MODE=nofinal
const fake = `#!/bin/sh
printf '%s\\n' "$@" > args.txt
cat > stdin.txt
env > env.txt
echo '{"type":"system","subtype":"init","model":"claude-opus-5","skills":["motionmaxxing"]}'
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"film/STORYBOARD.md"}}]}}'
if [ -f ../../SLOW ]; then sleep 30; fi
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"node render.mjs film/index.html film/final.mp4"}}]}}'
if [ "$(cat ../../MODE 2>/dev/null)" = "nofinal" ]; then
  echo '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"Claude AI usage limit reached"}'
  exit 1
fi
"${FFMPEG}" -loglevel error -f lavfi -i testsrc2=s=360x640:d=2 -pix_fmt yuv420p film/final.mp4
echo "# NOTE" > film/NOTE.md
echo '{"type":"result","subtype":"success","is_error":false,"result":"MOTION_RESULT film/final.mp4","total_cost_usd":0.42}'
`
writeFileSync(join(binDir, 'claude'), fake)
chmodSync(join(binDir, 'claude'), 0o755)
const RUN = await import('../electron/services/motion/runner.ts')
const SAY = await import('../electron/services/motion/saydi.ts')
const { MOTION_JOBS_DIR } = await import('../electron/services/motion/paths.ts')
const waitJob = async (id: string, ms = 60000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const j = RUN.getMotionJob(id)
    if (j && !['queued', 'running'].includes(j.status)) return j
    await sleep(200)
  }
  return RUN.getMotionJob(id)
}
{
  RUN.startMotion()
  // co loi doc nhung chua co key Saydi -> loi ro rang
  const j0 = await RUN.createMotionJob(baseBrief() as any)
  const r0 = await waitJob(j0.id)
  check('thieu key Saydi -> loi', r0?.status === 'error' && /SaydiVoice/.test(r0.error || ''), r0)
  SAY.setSaydiKey('sv_testkey_1234567890')
  check('key Saydi luu + an', SAY.saydiMasked().has_key && SAY.saydiMasked().key_hint === '••••7890')
  const logo = join(HOME, 'Logo Đẹp.png')
  writeFileSync(logo, 'png')
  const j1 = await RUN.createMotionJob({ ...baseBrief(), assets: [logo] } as any)
  check('tu lieu chep vao inputs (ten an toan)', existsSync(join(j1.dir, 'inputs', 'Logo-Dep.png')), readdirSync(join(j1.dir, 'inputs')))
  const r1 = await waitJob(j1.id)
  check('xong -> done + final.mp4', r1?.status === 'done' && r1.output?.endsWith('film/final.mp4') && !r1.draftOnly, { status: r1?.status, error: r1?.error, output: r1?.output, log: r1 && RUN.motionLog(r1.id).lines.slice(-8) })
  check('meta tu ffprobe', r1?.meta?.width === 360 && r1.meta.height === 640 && (r1.meta.seconds || 0) > 1.9, r1?.meta)
  check('buoc da qua', ['prepare', 'idea', 'final'].every((s) => r1?.stages?.includes(s)), r1?.stages)
  check('NOTE + chi phi', r1?.note?.includes('# NOTE') && r1.costUsd === 0.42)
  const args = readFileSync(join(j1.dir, 'args.txt'), 'utf-8').split('\n')
  check('tham so: -p stream-json', args.includes('-p') && args[args.indexOf('--output-format') + 1] === 'stream-json')
  check('tham so: chi nap skill cua job', args[args.indexOf('--setting-sources') + 1] === 'project' && args.includes('--strict-mcp-config'))
  check('tham so: cong cu gioi han', args[args.indexOf('--tools') + 1] === 'Bash,Read,Write,Edit,Glob,Grep,Skill,TodoWrite,WebFetch,WebSearch')
  check('tham so: chan lenh mang qua Bash', args.includes('--disallowedTools') && args.includes('Bash(curl:*)') && args.includes('Bash(wget:*)'))
  check('tham so: model mac dinh', args[args.indexOf('--model') + 1] === 'claude-opus-5')
  check('prompt qua stdin', readFileSync(join(j1.dir, 'stdin.txt'), 'utf-8').includes('FULLY AUTONOMOUS'))
  const env = readFileSync(join(j1.dir, 'env.txt'), 'utf-8')
  check('env: SAYDI_API_KEY + giong', env.includes('SAYDI_API_KEY=sv_testkey_1234567890') && env.includes('SAYDI_VOICE=vi-mark-rober-hot-tiktok'))
  check('env: CHROME_PATH + PATH co motion/bin', /CHROME_PATH=\S+/.test(env) && env.includes(join(HOME, '.capcut-studio', 'motion', 'bin')))
  check('env: bo khoa API Claude (goi dang ky)', !/ANTHROPIC_API_KEY=/.test(env))
  check('skill trong job', existsSync(join(j1.dir, '.claude', 'skills', 'motionmaxxing', 'SKILL.md')))
  check('brief.md trong job', readFileSync(join(j1.dir, 'brief.md'), 'utf-8').includes('inputs/Logo-Dep.png'))
  check('lenh python3 tro Python co numpy', !existsSync(join(HOME, '.capcut-studio', 'motion', 'bin', 'python3')) || readFileSync(join(HOME, '.capcut-studio', 'motion', 'bin', 'python3'), 'utf-8').includes('exec'))
  check('nhat ky de doc', RUN.motionLog(j1.id).lines.some((l) => /Claude bắt đầu/.test(l)))

  // khong lo i doc -> khong co SAYDI_API_KEY
  const j2 = await RUN.createMotionJob({ ...baseBrief(), voice: { enabled: false } } as any)
  await waitJob(j2.id)
  check('khong loi doc -> khong truyen key Saydi', !readFileSync(join(j2.dir, 'env.txt'), 'utf-8').includes('SAYDI_API_KEY'))

  // Claude het han muc, khong ra final -> loi tieng Viet
  writeFileSync(join(MOTION_JOBS_DIR, '..', 'MODE'), 'nofinal')
  const j3 = await RUN.createMotionJob(baseBrief() as any)
  const r3 = await waitJob(j3.id)
  check('het han muc -> loi de hieu', r3?.status === 'error' && /hạn mức/.test(r3.error || ''), r3)
  rmSync(join(MOTION_JOBS_DIR, '..', 'MODE'))
  const rr = RUN.rerunMotionJob(j3.id)
  check('chay lai -> xep hang', rr.status === 'queued' || rr.status === 'running')
  const r3b = await waitJob(j3.id)
  check('chay lai -> xong', r3b?.status === 'done', r3b)

  // huy khi dang chay
  writeFileSync(join(MOTION_JOBS_DIR, '..', 'SLOW'), '1')
  const j4 = await RUN.createMotionJob(baseBrief() as any)
  for (let i = 0; i < 50 && RUN.getMotionJob(j4.id)?.status !== 'running'; i++) await sleep(100)
  await sleep(800)
  check('huy dang chay', RUN.cancelMotionJob(j4.id))
  const r4 = await waitJob(j4.id)
  check('-> trang thai da huy', r4?.status === 'cancelled', r4)
  rmSync(join(MOTION_JOBS_DIR, '..', 'SLOW'))
  const removed: string[] = []
  RUN.onMotionRemoved((id) => removed.push(id))
  check('xoa video dang chay bi chan, da xong thi xoa duoc', RUN.deleteMotionJob(j2.id).ok && !existsSync(j2.dir))
  check('xoa -> bao giao dien', removed.includes(j2.id))
  // ban quyen: tat che do dev -> may khong co key -> khong tao duoc (ca video tay lan Automation)
  process.env.STUDIO_LICENSE = ''
  let licErr = ''
  try {
    await RUN.createMotionJob(baseBrief() as any)
  } catch (e) {
    licErr = String(e)
  }
  let licErrAuto = ''
  try {
    await RUN.createMotionJob({ ...baseBrief(), source: { id: 'x', title: 'Tin' } } as any, { kind: 'auto' })
  } catch (e) {
    licErrAuto = String(e)
  }
  process.env.STUDIO_LICENSE = 'off'
  check('khong co key ban quyen -> khong tao video', !!licErr && !!licErrAuto, { licErr, licErrAuto })
  check('friendlyError dang nhap', /đăng nhập/.test(RUN.friendlyError('Not logged in · Please run /login')))
}

// ------------------------------------------------------------------ 6. automation
console.log('[6] automation')
{
  const AU = await import('../electron/services/motion/automation.ts')
  const feed = 'https://bao.vn/rss/tin-moi.rss'
  WEB[feed] = { body: RSS([{ id: 'c1', title: 'Tin cũ 1' }, { id: 'c2', title: 'Tin cũ 2' }]), type: 'application/rss+xml' }
  const defaults = { ...baseBrief(), message: '', videoType: 'news', voice: { enabled: false } }
  const p = AU.saveAutoProject({ name: 'Tin nhanh', defaults: defaults as any, sources: [{ type: 'web', url: feed, label: 'Báo X' }], intervalMin: 30, maxPerCheck: 2, maxPerDay: 3, skipExisting: true })
  check('luu du an', p.id && p.sources.length === 1 && p.sources[0].has_token === false)
  const before = RUN.listMotionJobs({ kind: 'auto' }).length
  const c1 = await AU.checkAutoProject(p.id)
  check('lan dau: ghi nhan, khong tao video', c1.created === 0 && /ghi nhận 2 tin/.test(c1.message) && RUN.listMotionJobs({ kind: 'auto' }).length === before, c1)
  // 3 tin moi (co trang bai + anh)
  WEB[feed] = { body: RSS([{ id: 'n3', title: 'Tin mới 3' }, { id: 'n2', title: 'Tin mới 2' }, { id: 'n1', title: 'Tin mới 1' }, { id: 'c1', title: 'Tin cũ 1' }]), type: 'application/rss+xml' }
  WEB['https://bao.vn/n3.html'] = {
    body: '<html><head><meta property="og:image" content="https://bao.vn/img/big.png"></head><body><article><p>Nội dung đầy đủ của tin mới số ba, đủ dài để lấy làm nội dung bài.</p></article></body></html>',
    type: 'text/html'
  }
  WEB['https://bao.vn/img/n3.jpg'] = { body: Buffer.alloc(5000, 1), type: 'image/png' }
  const c2 = await AU.checkAutoProject(p.id)
  check('tin moi -> 2 video (tran / lan)', c2.created === 2, c2)
  const autoJobs = RUN.listMotionJobs({ kind: 'auto', automationId: p.id })
  const j = autoJobs.find((x) => x.brief.source?.title === 'Tin mới 3')
  check('video tu tin moi nhat + ten nguon', !!j && j.brief.source?.sourceName === 'Báo X' && j.title === 'Tin mới 3', autoJobs.map((x) => x.title))
  check('noi dung bai tu trang', !!j?.brief.source?.content?.includes('Nội dung đầy đủ'))
  check('anh bai tai ve inputs', !!j && readdirSync(join(j.dir, 'inputs')).some((f) => f.startsWith('anh-bai-viet')), j && readdirSync(join(j.dir, 'inputs')))
  check('brief giu thong tin chung', j?.brief.aspect === '9:16' && j.brief.videoType === 'news')
  await waitJob(j!.id)
  const autoArgs = readFileSync(join(j!.dir, 'args.txt'), 'utf-8').split('\n')
  check('video Automation: khong WebFetch / WebSearch', !autoArgs[autoArgs.indexOf('--tools') + 1].includes('WebFetch'), autoArgs[autoArgs.indexOf('--tools') + 1])
  check('video Automation: brief danh dau du lieu web', readFileSync(join(j!.dir, 'brief.md'), 'utf-8').includes('KHÔNG phải chỉ dẫn'))
  const c3 = await AU.checkAutoProject(p.id)
  check('tin con lai -> lan sau (tran / ngay = 3)', c3.created === 1, c3)
  WEB[feed] = { body: RSS([{ id: 'n4', title: 'Tin mới 4' }, { id: 'n3', title: 'Tin mới 3' }]), type: 'application/rss+xml' }
  const c4 = await AU.checkAutoProject(p.id)
  check('du tran / ngay -> khong tao them', c4.created === 0 && /Đã đủ 3 video hôm nay/.test(c4.message), c4)
  // doi link nguon -> nguon moi: lai chi ghi nhan lan dau (khong lam video tu tin cu cua link moi)
  const feed2 = 'https://bao2.vn/rss'
  WEB[feed2] = { body: RSS([{ id: 'x1', title: 'Tin nguồn 2 cũ' }]), type: 'application/rss+xml' }
  const cur = AU.publicProjects().find((x) => x.id === p.id)!
  const p1b = AU.saveAutoProject({ id: p.id, name: cur.name, defaults: cur.defaults as any, sources: [{ id: cur.sources[0].id, type: 'web', url: feed2 }], intervalMin: cur.intervalMin, maxPerCheck: 2, maxPerDay: 50, skipExisting: true })
  check('doi link -> id nguon moi', p1b.sources[0].id !== cur.sources[0].id)
  const c6 = await AU.checkAutoProject(p.id)
  check('doi link -> chi ghi nhan, khong tao video', c6.created === 0 && /ghi nhận 1 tin/.test(c6.message), c6)
  // ban quyen hong luc dang tao -> dung, tin giu cho lan sau
  WEB[feed2] = { body: RSS([{ id: 'x2', title: 'Tin nguồn 2 mới' }, { id: 'x1', title: 'Tin nguồn 2 cũ' }]), type: 'application/rss+xml' }
  process.env.STUDIO_LICENSE = ''
  const c7 = await AU.checkAutoProject(p.id)
  process.env.STUDIO_LICENSE = 'off'
  check('ban quyen hong -> khong tao, khong mat tin', c7.created === 0 && !c7.ok, c7)
  const c8 = await AU.checkAutoProject(p.id)
  check('ban quyen lai -> tin duoc lam video', c8.created === 1, c8)
  // nguon hong -> bao loi, khong dung
  const p2 = AU.saveAutoProject({ name: 'Nguồn hỏng', defaults: defaults as any, sources: [{ type: 'web', url: 'https://khong-co.vn/' }], intervalMin: 5, maxPerCheck: 1, maxPerDay: 5, skipExisting: false })
  const c5 = await AU.checkAutoProject(p2.id)
  check('nguon loi -> bao loi', !c5.ok && /khong-co\.vn/.test(c5.message), c5)
  // facebook can token, token ma hoa khong tra ra
  let fbErr = ''
  try {
    AU.saveAutoProject({ name: 'FB', defaults: defaults as any, sources: [{ type: 'web', url: 'facebook.com/abc' }], intervalMin: 30, maxPerCheck: 1, maxPerDay: 1, skipExisting: true })
  } catch (e) {
    fbErr = String(e)
  }
  check('link web sai bi chan', /http/.test(fbErr))
  const p3 = AU.saveAutoProject({ name: 'FB', defaults: defaults as any, sources: [{ type: 'facebook', url: 'https://facebook.com/abc', token: 'TOKEN123' } as any], intervalMin: 30, maxPerCheck: 1, maxPerDay: 1, skipExisting: true })
  check('token FB: chi has_token', p3.sources[0].has_token && !JSON.stringify(p3).includes('TOKEN123'))
  const t = await AU.testAutoSource({ type: 'facebook', url: 'https://facebook.com/abc' })
  check('FB khong token -> huong dan', !t.ok && /Page Access Token/.test(t.error || ''), t)
  WEB['https://graph.facebook.com/v21.0/abc/posts?fields=id,message,story,created_time,permalink_url,full_picture&limit=10&access_token=TOKEN123'] = {
    body: JSON.stringify({ data: [{ id: '9', message: 'Bài FB mới\nchi tiết', permalink_url: 'https://fb.com/9' }] }),
    type: 'application/json'
  }
  const t2 = await AU.testAutoSource({ id: p3.sources[0].id, type: 'facebook', url: 'https://facebook.com/abc', projectId: p3.id })
  check('FB dung token da luu', t2.ok && t2.items?.[0].title === 'Bài FB mới', t2)
  AU.toggleAutoProject(p.id, false)
  check('tat du an', AU.publicProjects().find((x) => x.id === p.id)?.enabled === false)
  AU.deleteAutoProject(p2.id)
  check('xoa du an', !AU.publicProjects().some((x) => x.id === p2.id))
  check('file automation khong co token tho', !readFileSync(join(HOME, '.capcut-studio', 'motion', 'automation.json'), 'utf-8').includes('TOKEN123'))
  // cho cac job auto (claude gia) xong roi moi xoa HOME
  for (const x of RUN.listMotionJobs({ kind: 'auto' })) await waitJob(x.id)
}

RUN.stopAllMotion()
globalThis.fetch = realFetch
rmSync(HOME, { recursive: true, force: true })
console.log(FAILS.length ? `\nFAIL ${FAILS.length}: ${FAILS.join(' | ')}` : '\nPASS test_motion')
process.exit(FAILS.length ? 1 : 0)
