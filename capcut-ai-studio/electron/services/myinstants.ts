// Lay SFX tu Myinstants bang chinh tang trinh duyet cua Electron.
//
// Vi sao phai lam the: Myinstants dung Cloudflare chan moi request khong phai
// trinh duyet that (curl / python requests deu bi 403, ke ca link .mp3 truc tiep).
// Chay qua BrowserWindow + session persist => co cookie cf_clearance nhu khi user
// mo web binh thuong, nen tai duoc. Cookie duoc giu lai giua cac lan mo app.
import { BrowserWindow, session, Session } from 'electron'
import { join, resolve, sep } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { ENGINE_HOME } from './paths'

// UA khop he dieu hanh that (Cloudflare so UA voi navigator.platform — lech de bi thu thach hon)
const UA =
  process.platform === 'win32'
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const PARTITION = 'persist:myinstants'
const ORIGIN = 'https://www.myinstants.com'

// Noi de file vua tai ve, CHUA vao kho (user nghe thu roi moi chon luu)
export const STAGE_DIR = join(ENGINE_HOME, 'sfx_staging')

export interface StagedSfx {
  key: string
  name: string
  path: string
  pageUrl: string
  bytes: number
}

export interface FetchOutcome {
  ok: boolean
  items: StagedSfx[]
  failed: { url: string; reason: string }[]
  /** true = Cloudflare doi xac minh, can user bam 1 lan trong cua so hien ra */
  blocked?: boolean
}

let hidden: BrowserWindow | null = null
let browser: BrowserWindow | null = null

function ses(): Session {
  const s = session.fromPartition(PARTITION)
  s.setUserAgent(UA)
  return s
}

function newWindow(show: boolean, title: string): BrowserWindow {
  const w = new BrowserWindow({
    show,
    width: 1100,
    height: 820,
    title,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  w.webContents.setUserAgent(UA)
  return w
}

async function ensureHidden(): Promise<BrowserWindow> {
  if (hidden && !hidden.isDestroyed()) return hidden
  hidden = newWindow(false, 'Myinstants')
  hidden.on('closed', () => (hidden = null))
  return hidden
}

/** Cloudflare dang chan / dang bat ta xac minh? */
async function isChallenged(w: BrowserWindow): Promise<boolean> {
  try {
    const t: string = await w.webContents.executeJavaScript(
      `(document.title || '') + '||' + (document.body ? document.body.innerText.slice(0, 600) : '')`
    )
    return /just a moment|attention required|enable cookies|checking your browser|verify you are human|sorry, you have been blocked/i.test(
      t
    )
  } catch {
    return false
  }
}

async function loadAndSettle(w: BrowserWindow, url: string): Promise<void> {
  await w.loadURL(url)
  // Cloudflare chen 1 nhip JS truoc khi tra trang that
  for (let i = 0; i < 12; i++) {
    if (!(await isChallenged(w))) return
    await new Promise((r) => setTimeout(r, 900))
  }
}

/** Tach ten + link mp3 ra khoi trang instant cua Myinstants. */
const EXTRACT = `(() => {
  const html = document.documentElement.outerHTML;
  const m = html.match(/\\/media\\/sounds\\/[^"'\\s)?<>]+\\.mp3/);
  const raw =
    (document.querySelector('#instant-page-title') || {}).textContent ||
    (document.querySelector('h1') || {}).textContent ||
    document.title || '';
  const name = raw.replace(/\\s*-\\s*(Myinstants|Instant Sound Button.*)$/i, '').replace(/\\s+/g, ' ').trim();
  return { mp3: m ? new URL(m[0], location.origin).href : null, name: name };
})()`

/** Tai bytes bang fetch NGAY TRONG trang (co cookie + dung origin) -> base64. */
function fetchBytes(url: string): string {
  return `(async () => {
    try {
      const r = await fetch(${JSON.stringify(url)}, { credentials: 'include' });
      if (!r.ok) return { error: 'HTTP ' + r.status };
      const b = new Uint8Array(await r.arrayBuffer());
      if (!b.length) return { error: 'file rong' };
      let s = '';
      const CH = 0x8000;
      for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
      return { b64: btoa(s), size: b.length };
    } catch (e) { return { error: String(e && e.message || e) }; }
  })()`
}

function safeSlug(s: string): string {
  return (
    (s || 'sfx')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'sfx'
  )
}

/** Chuan hoa input cua user: chap nhan link share, link trang, hoac link .mp3 thang. */
export function normalizeLink(input: string): { kind: 'mp3' | 'page'; url: string } | null {
  let s = (input || '').trim()
  if (!s) return null
  if (s.startsWith('www.')) s = 'https://' + s
  if (!/^https?:\/\//i.test(s)) {
    // user dan moi slug, vd: vine-boom-70972
    if (/^[\w-]+$/.test(s)) return { kind: 'page', url: `${ORIGIN}/en/instant/${s}/` }
    return null
  }
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (!/myinstants\.com$/i.test(u.hostname.replace(/^www\./, ''))) return null
  if (/\.mp3$/i.test(u.pathname)) return { kind: 'mp3', url: u.toString() }
  return { kind: 'page', url: u.toString() }
}

/**
 * Tai 1 loat link ve thu muc cho (staging). Chua ghi vao kho.
 * Neu Cloudflare doi xac minh: hien cua so ra cho user bam 1 lan roi bao blocked.
 */
export async function fetchLinks(links: string[]): Promise<FetchOutcome> {
  const items: StagedSfx[] = []
  const failed: { url: string; reason: string }[] = []
  mkdirSync(STAGE_DIR, { recursive: true })

  const targets = links
    .map((l) => ({ raw: l, n: normalizeLink(l) }))
    .filter((t) => {
      if (!t.n) failed.push({ url: t.raw, reason: 'Khong phai link Myinstants' })
      return !!t.n
    })
  if (!targets.length) return { ok: false, items, failed }

  const w = await ensureHidden()

  for (const t of targets) {
    const n = t.n!
    try {
      // Trang mp3 thang -> van phai o dung origin moi co cookie, nen ghe trang chu.
      const pageUrl = n.kind === 'page' ? n.url : ORIGIN + '/en/'
      await loadAndSettle(w, pageUrl)

      if (await isChallenged(w)) {
        w.show()
        w.focus()
        return { ok: false, items, failed, blocked: true }
      }

      let mp3 = n.kind === 'mp3' ? n.url : ''
      let name = ''
      if (n.kind === 'page') {
        const got = (await w.webContents.executeJavaScript(EXTRACT)) as {
          mp3: string | null
          name: string
        }
        if (!got?.mp3) {
          failed.push({ url: t.raw, reason: 'Khong tim thay file mp3 trong trang' })
          continue
        }
        mp3 = got.mp3
        name = got.name
      }
      if (!name) {
        name = decodeURIComponent(mp3.split('/').pop() || 'sfx')
          .replace(/\.mp3$/i, '')
          .replace(/[-_]+/g, ' ')
          .trim()
      }

      const res = (await w.webContents.executeJavaScript(fetchBytes(mp3))) as {
        b64?: string
        size?: number
        error?: string
      }
      if (!res?.b64) {
        failed.push({ url: t.raw, reason: res?.error || 'Tai that bai' })
        continue
      }

      const key = `${safeSlug(name)}-${Date.now().toString(36)}${items.length}`
      const dest = join(STAGE_DIR, key + '.mp3')
      writeFileSync(dest, Buffer.from(res.b64, 'base64'))
      items.push({ key, name, path: dest, pageUrl: n.url, bytes: res.size || 0 })
    } catch (e) {
      failed.push({ url: t.raw, reason: String((e as Error)?.message || e).slice(0, 160) })
    }
  }

  return { ok: items.length > 0, items, failed }
}

/**
 * Mo Myinstants ngay trong app: user tu tim, nghe, bam Download.
 * File tai ve duoc bat lai va day thang vao danh sach cho (khong hien hop luu file).
 * Day cung la cach de qua Cloudflare 1 lan (cookie duoc giu trong session).
 */
export function openBrowser(onStaged: (item: StagedSfx) => void): void {
  if (browser && !browser.isDestroyed()) {
    browser.show()
    browser.focus()
    return
  }
  mkdirSync(STAGE_DIR, { recursive: true })
  browser = newWindow(true, 'Myinstants — chọn âm thanh')
  browser.on('closed', () => (browser = null))

  const s = ses()
  s.removeAllListeners('will-download')
  s.on('will-download', (_e, item) => {
    const base = item.getFilename().replace(/\.[^.]+$/, '')
    const key = `${safeSlug(base)}-${Date.now().toString(36)}`
    const dest = join(STAGE_DIR, key + '.mp3')
    item.setSavePath(dest)
    item.once('done', (_ev, state) => {
      if (state !== 'completed') return
      onStaged({
        key,
        name: base.replace(/[-_]+/g, ' ').trim() || base,
        path: dest,
        pageUrl: item.getURL(),
        bytes: item.getReceivedBytes()
      })
    })
  })

  browser.loadURL(ORIGIN + '/en/')
}

export function closeBrowser(): void {
  if (browser && !browser.isDestroyed()) browser.close()
  browser = null
}

/**
 * Xoa file tam sau khi da luu vao kho / user bo qua.
 * CHI dong vao thu muc staging — file user tu chon tren may khong bao gio bi xoa.
 */
export function discardStaged(paths: string[]): { removed: number } {
  let removed = 0
  // so sanh theo duong dan da chuan hoa (Windows: \ va khong phan biet hoa thuong)
  const norm = (x: string) => (process.platform === 'win32' ? resolve(x).toLowerCase() : resolve(x))
  const root = norm(STAGE_DIR) + sep
  for (const p of paths || []) {
    if (typeof p !== 'string' || !norm(p).startsWith(root)) continue
    try {
      rmSync(p, { force: true })
      removed++
    } catch {
      // file da bien mat -> bo qua
    }
  }
  return { removed }
}
