// LAY TIN MOI cho Automation Video (2026-10-14). Khong them thu vien: fetch cua Node + phan tich bang regex.
//  - web: link RSS / Atom -> doc thang; link trang (trang chu / chuyen muc) -> tim <link rel="alternate" RSS> trong
//    trang, co thi doc RSS; khong co thi lay cac link bai viet cung ten mien tren trang (moi nhat thuong o tren cung).
//    Bai chua co noi dung (tu trang chuyen muc) -> tai trang bai, lay og:title / og:description / og:image + cac doan <p>.
//  - facebook: Graph API /<trang>/posts — can Page Access Token (Facebook khong cho doc trang khi khong co token; cach
//    khac: tao link RSS cua trang o rss.app / fetchrss roi them nguon kieu "Website / RSS").
// Phan tich (parseFeed / discoverFeeds / extractLinks / extractArticle / fbItems) la ham thuan -> tests/test_motion.mts.
import { createHash } from 'crypto'
import type { MotionSourceItem } from './types'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', copy: '©', reg: '®', deg: '°' }
// Chu co dau co ten entity HTML (&oacute; &igrave; &ecirc; &atilde;...) — bao Viet hay dung trong RSS
const MARKS: Record<string, string> = { grave: '\u0300', acute: '\u0301', circ: '\u0302', tilde: '\u0303', uml: '\u0308' }
for (const base of 'aeiouyAEIOUYnN') for (const [k, mk] of Object.entries(MARKS)) NAMED[base + k] ??= (base + mk).normalize('NFC')

function decodeOnce(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m
  })
}

/** Giai entity HTML (ca chuoi bi ma hoa 2 lan: &amp;oacute; -> o). */
export function decodeEntities(s: string): string {
  const once = decodeOnce(s)
  return /&(#x[0-9a-f]+|#\d+|[a-z]+);/i.test(once) ? decodeOnce(once) : once
}

/** HTML -> chu thuan (bo the, script/style, gop khoang trang). */
export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

const cdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')

function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i')
  const m = re.exec(block)
  return m ? cdata(m[1]) : ''
}

function attr(tagHtml: string, name: string): string {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tagHtml)
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : ''
}

function absUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return ''
  }
}

const hashId = (s: string) => 'h_' + createHash('sha1').update(s).digest('hex').slice(0, 16)

export function looksLikeFeed(text: string): boolean {
  const head = text.slice(0, 2000)
  return /<rss[\s>]|<feed[\s>][\s\S]*?xmlns="http:\/\/www\.w3\.org\/2005\/Atom"|<rdf:RDF/i.test(head) || /<feed[\s>]/i.test(head)
}

/** RSS 2.0 / RSS 1.0 (RDF) / Atom -> tin (thu tu nhu trong feed: moi nhat tren cung). */
export function parseFeed(xml: string, baseUrl: string, sourceName?: string): MotionSourceItem[] {
  const items: MotionSourceItem[] = []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
  for (const b of blocks) {
    const title = stripTags(tag(b, 'title'))
    let link = stripTags(tag(b, 'link'))
    if (!link) {
      const lt = /<link\b[^>]*>/i.exec(b)
      if (lt) link = attr(lt[0], 'href')
    }
    const guid = stripTags(tag(b, 'guid'))
    const descHtml = tag(b, 'description')
    const contentHtml = tag(b, 'content:encoded')
    let image = ''
    const enc = /<(?:enclosure|media:content|media:thumbnail)\b[^>]*>/i.exec(b)
    if (enc && (/image/i.test(attr(enc[0], 'type')) || /media:/i.test(enc[0]) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(attr(enc[0], 'url'))))
      image = attr(enc[0], 'url')
    if (!image) {
      const im = /<img\b[^>]*>/i.exec(descHtml + contentHtml)
      if (im) image = attr(im[0], 'src')
    }
    const url = link ? absUrl(link, baseUrl) : ''
    if (!title && !url) continue
    items.push({
      id: guid || url || hashId(title),
      title: title || url,
      url: url || undefined,
      summary: stripTags(descHtml).slice(0, 1500) || undefined,
      content: stripTags(contentHtml).slice(0, 8000) || undefined,
      image: image ? absUrl(image, baseUrl) : undefined,
      published: stripTags(tag(b, 'pubDate') || tag(b, 'dc:date')) || undefined,
      sourceName
    })
  }
  if (items.length) return items
  const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
  for (const e of entries) {
    const title = stripTags(tag(e, 'title'))
    let url = ''
    for (const lt of e.match(/<link\b[^>]*>/gi) || []) {
      const rel = attr(lt, 'rel')
      if (!rel || rel === 'alternate') {
        url = absUrl(attr(lt, 'href'), baseUrl)
        break
      }
    }
    const id = stripTags(tag(e, 'id'))
    const summary = tag(e, 'summary')
    const content = tag(e, 'content')
    let image = ''
    const mt = /<media:(?:thumbnail|content)\b[^>]*>/i.exec(e)
    if (mt) image = attr(mt[0], 'url')
    if (!image) {
      const im = /<img\b[^>]*>/i.exec(decodeEntities(summary + content))
      if (im) image = attr(im[0], 'src')
    }
    if (!title && !url) continue
    items.push({
      id: id || url || hashId(title),
      title: title || url,
      url: url || undefined,
      summary: stripTags(decodeEntities(summary)).slice(0, 1500) || undefined,
      content: stripTags(decodeEntities(content)).slice(0, 8000) || undefined,
      image: image ? absUrl(image, baseUrl) : undefined,
      published: stripTags(tag(e, 'published') || tag(e, 'updated')) || undefined,
      sourceName
    })
  }
  return items
}

/** <link rel="alternate" type="application/rss+xml|atom+xml" href> trong trang. */
export function discoverFeeds(html: string, baseUrl: string): string[] {
  const out: string[] = []
  for (const lt of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/alternate/i.test(attr(lt, 'rel'))) continue
    if (!/(rss|atom)\+xml/i.test(attr(lt, 'type'))) continue
    const u = absUrl(attr(lt, 'href'), baseUrl)
    if (u && !out.includes(u)) out.push(u)
  }
  return out
}

const SKIP_PATH = /\/(tag|tags|category|categories|chuyen-muc|author|tac-gia|search|tim-kiem|login|dang-nhap|register|page|trang|video-clip|lien-he|contact|about|gioi-thieu|rss|feed|privacy|terms)(\/|$)/i

/** Muc "giong link bai viet" cua 1 duong dan: 2 = chac chan (.html + ma so, ngay trong duong dan, ma so dai, slug rat dai),
 *  1 = co the (slug kha dai / .html / duong dan sau), 0 = khong (trang chu, chuyen muc ngan). */
export function articleScore(path: string): number {
  const segs = path.split('/').filter(Boolean)
  const last = segs[segs.length - 1] || ''
  const stem = last.replace(/\.(html?|aspx?|php)$/i, '')
  const hyphens = (stem.match(/-/g) || []).length
  const ext = /\.(html?|aspx?|php)$/i.test(last)
  if (/\/20\d{2}\/\d{1,2}\//.test(path) || /\d{5,}/.test(last) || (ext && hyphens >= 4) || hyphens >= 6) return 2
  if (hyphens >= 4 || ext || segs.length >= 3) return 1
  return 0
}

/** Link bai viet tren trang chuyen muc (cung ten mien). Co link "chac chan la bai" thi CHI lay loai do (bo menu / chuyen
 *  muc nhu "khoa-hoc-cong-nghe"); khong co moi lay link "co the". */
export function extractLinks(html: string, baseUrl: string, sourceName?: string): MotionSourceItem[] {
  let host = ''
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, '')
  } catch {
    return []
  }
  const seen = new Set<string>()
  const out: MotionSourceItem[] = []
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = attr(' ' + m[1], 'href')
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) continue
    const u = absUrl(href, baseUrl)
    if (!u) continue
    let url: URL
    try {
      url = new URL(u)
    } catch {
      continue
    }
    if (url.hostname.replace(/^www\./, '') !== host) continue
    url.hash = ''
    const path = url.pathname
    if (path === '/' || SKIP_PATH.test(path)) continue
    const score = articleScore(path)
    if (!score) continue
    const text = (stripTags(m[2]) || attr(' ' + m[1], 'title')).replace(/\s+/g, ' ').trim()
    if (text.length < 15) continue
    const key = url.toString()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: key, title: text.slice(0, 200), url: key, sourceName, score } as MotionSourceItem & { score: number })
  }
  const strong = (out as (MotionSourceItem & { score: number })[]).filter((x) => x.score === 2)
  return (strong.length >= 2 ? strong : out).map(({ score, ...x }: any) => (void score, x as MotionSourceItem))
}

/** Duong dan RSS hay gap cua 1 trang chuyen muc (khi trang khong khai <link rel="alternate">). */
export function guessFeeds(pageUrl: string): string[] {
  try {
    const u = new URL(pageUrl)
    const path = u.pathname.replace(/\.(html?|aspx?|php)$/i, '').replace(/\/+$/, '')
    const out = path ? [`${u.origin}/rss${path}.rss`, `${u.origin}${path}.rss`, `${u.origin}${path}/feed`] : []
    out.push(`${u.origin}/rss`, `${u.origin}/feed`)
    return out
  } catch {
    return []
  }
}

function meta(html: string, keys: string[]): string {
  for (const mt of html.match(/<meta\b[^>]*>/gi) || []) {
    const k = (attr(mt, 'property') || attr(mt, 'name') || attr(mt, 'itemprop')).toLowerCase()
    if (keys.includes(k)) {
      const v = attr(mt, 'content').trim()
      if (v) return v
    }
  }
  return ''
}

/** Trang bai viet -> tieu de, mo ta, anh, ngay dang, noi dung (cac doan <p> trong <article> hoac ca trang). */
export function extractArticle(html: string, url: string): { title: string; summary: string; image: string; published: string; content: string } {
  const title = meta(html, ['og:title', 'twitter:title']) || stripTags(tag(html, 'title'))
  const summary = meta(html, ['og:description', 'description', 'twitter:description'])
  const img = meta(html, ['og:image', 'og:image:url', 'twitter:image'])
  const published = meta(html, ['article:published_time', 'pubdate', 'datepublished', 'date'])
  const art = /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] || html
  const paras = (art.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []).map((p) => stripTags(p)).filter((t) => t.length >= 40)
  return { title, summary: stripTags(summary), image: img ? absUrl(img, url) : '', published, content: paras.join('\n').slice(0, 8000) }
}

/** Ten / id trang Facebook tu link (facebook.com/<ten>, profile.php?id=<so>) hoac chuoi da la id. */
export function fbPageId(input: string): string {
  const s = input.trim()
  if (!/facebook\.com|fb\.com/i.test(s)) return s.replace(/^@/, '').replace(/\/+$/, '')
  try {
    const u = new URL(/^https?:/i.test(s) ? s : 'https://' + s)
    const id = u.searchParams.get('id')
    if (id) return id
    const segs = u.pathname.split('/').filter(Boolean)
    if (segs[0] === 'pages' && segs.length >= 3) return segs[2]
    return segs[0] || ''
  } catch {
    return ''
  }
}

/** Ket qua Graph API /posts -> tin. */
export function fbItems(json: any, sourceName?: string): MotionSourceItem[] {
  const out: MotionSourceItem[] = []
  for (const p of Array.isArray(json?.data) ? json.data : []) {
    const msg = String(p.message || p.story || '').trim()
    if (!msg && !p.full_picture) continue
    const first = msg.split('\n').find((l: string) => l.trim()) || msg
    out.push({
      id: 'fb_' + String(p.id),
      title: (first || 'Bài đăng Facebook').slice(0, 160),
      url: p.permalink_url || undefined,
      content: msg.slice(0, 8000) || undefined,
      image: p.full_picture || undefined,
      published: p.created_time || undefined,
      sourceName
    })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Tai qua mang
// ---------------------------------------------------------------------------------------------------------------
export async function fetchText(url: string, timeoutMs = 25000): Promise<{ text: string; url: string; type: string }> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'vi,en;q=0.8' }
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 8 * 1024 * 1024) throw new Error('trang quá lớn')
    return { text: buf.toString('utf-8'), url: r.url || url, type: r.headers.get('content-type') || '' }
  } catch (e) {
    const msg = (e as Error)?.name === 'AbortError' ? 'quá thời gian chờ' : String((e as Error)?.message || e)
    throw new Error(`Không tải được ${url}: ${msg}`)
  } finally {
    clearTimeout(t)
  }
}

/** Tin moi nhat cua 1 nguon web (toi da `limit`). */
export async function fetchWebItems(url: string, limit = 20): Promise<{ items: MotionSourceItem[]; via: string }> {
  const name = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return url
    }
  })()
  const page = await fetchText(url)
  if (looksLikeFeed(page.text) || /(rss|atom)\+xml|\/xml/i.test(page.type)) {
    const items = parseFeed(page.text, page.url, name)
    if (items.length) return { items: items.slice(0, limit), via: 'RSS' }
  }
  for (const f of discoverFeeds(page.text, page.url).slice(0, 2)) {
    try {
      const feed = await fetchText(f)
      const items = parseFeed(feed.text, feed.url, name)
      if (items.length) return { items: items.slice(0, limit), via: 'RSS ' + f }
    } catch {
      /* thu cach sau */
    }
  }
  // Trang khong khai RSS: link bai chac chan tren trang > duong dan RSS hay gap > link "co the"
  const links = extractLinks(page.text, page.url, name)
  const strong = links.filter((l) => l.url && articleScore(new URL(l.url).pathname) === 2)
  if (strong.length >= 3) return { items: strong.slice(0, limit), via: 'link bài trên trang' }
  for (const f of guessFeeds(page.url).slice(0, 4)) {
    try {
      const feed = await fetchText(f, 12000)
      if (!looksLikeFeed(feed.text)) continue
      const items = parseFeed(feed.text, feed.url, name)
      if (items.length) return { items: items.slice(0, limit), via: 'RSS ' + f }
    } catch {
      /* thu duong khac */
    }
  }
  if (!links.length) throw new Error('Không tìm thấy RSS hay link bài viết nào trên trang này — thử dán link RSS hoặc link trang chuyên mục.')
  return { items: links.slice(0, limit), via: 'link trên trang' }
}

/** Tin moi nhat cua 1 trang Facebook (Graph API, can Page Access Token). */
export async function fetchFacebookItems(pageUrl: string, token: string, limit = 10): Promise<{ items: MotionSourceItem[]; via: string }> {
  const page = fbPageId(pageUrl)
  if (!page) throw new Error('Link trang Facebook không hợp lệ.')
  if (!token) throw new Error('Nguồn Facebook cần Page Access Token (hoặc dùng link RSS của trang từ rss.app / fetchrss với nguồn kiểu Website / RSS).')
  const u = `https://graph.facebook.com/v21.0/${encodeURIComponent(page)}/posts?fields=id,message,story,created_time,permalink_url,full_picture&limit=${limit}&access_token=${encodeURIComponent(token)}`
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 25000)
  try {
    const r = await fetch(u, { signal: ctl.signal })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j?.error) throw new Error('Facebook từ chối: ' + (j?.error?.message || `HTTP ${r.status}`))
    return { items: fbItems(j, 'Facebook ' + page), via: 'Facebook Graph API' }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error('Facebook: quá thời gian chờ')
    throw e
  } finally {
    clearTimeout(t)
  }
}

/** Bo sung noi dung bai (tin lay tu link tren trang / RSS chi co tieu de): tai trang bai. Loi -> giu nguyen. */
export async function enrichItem(it: MotionSourceItem): Promise<MotionSourceItem> {
  if (!it.url || (it.content && it.content.length > 400)) return it
  try {
    const p = await fetchText(it.url)
    const a = extractArticle(p.text, p.url)
    return {
      ...it,
      title: it.title && it.title.length >= 15 ? it.title : a.title || it.title,
      summary: it.summary || a.summary || undefined,
      content: a.content.length > (it.content?.length || 0) ? a.content : it.content,
      image: it.image || a.image || undefined,
      published: it.published || a.published || undefined
    }
  } catch {
    return it
  }
}

/** Tai anh cua tin ve `destNoExt` + duoi theo loai anh (jpg/png/webp/gif, <= 15MB). Tra duong dan file hoac null. */
export async function downloadImage(url: string, destNoExt: string): Promise<string | null> {
  const { writeFileSync } = await import('fs')
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 25000)
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } })
    const type = r.headers.get('content-type') || ''
    if (!r.ok || !/image\//i.test(type)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 1000 || buf.length > 15 * 1024 * 1024) return null
    const ext = /png/i.test(type) ? '.png' : /webp/i.test(type) ? '.webp' : /gif/i.test(type) ? '.gif' : '.jpg'
    writeFileSync(destNoExt + ext, buf)
    return destNoExt + ext
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
