// May chu media CUC BO cho luong Video Remotion.
//
// Vi sao can: Player trong app (trang file:// hoac localhost khi dev) va trinh duyet
// headless cua Remotion luc render MP4 deu can doc video/nhac nguon tren o dia. Trinh
// duyet headless chay tren http:// nen khong mo duoc file:// — mot may chu http nho
// la cach DUY NHAT dung chung cho ca xem truoc lan render.
//
// An toan: chi nghe 127.0.0.1, moi URL phai mang token ngau nhien sinh luc mo app,
// chi tra file co duoi media (video/am thanh/anh/font) + JSON khung hieu ung trong cache/fx — khong phai may
// chu file tuy y.
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { createReadStream, statSync } from 'fs'
import { extname, isAbsolute, join, resolve, sep } from 'path'
import { ENGINE_HOME } from './paths'
import { randomBytes } from 'crypto'

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  // font cua mau chu Kho Text (~/.capcut-studio/text_templates/<id>/fonts) — FontFace trong Player + luc render
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

// Khung hieu ung tu viet: JSON do hop cach ly ve san — CHI trong thu muc nay
const FX_DIR = join(ENGINE_HOME, 'cache', 'fx')

function typeOf(path: string): string | undefined {
  const ext = extname(path).toLowerCase()
  if (ext === '.json') {
    // Windows: duong dan khong phan biet hoa thuong
    const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
    return norm(resolve(path)).startsWith(norm(resolve(FX_DIR) + sep)) ? 'application/json' : undefined
  }
  return TYPES[ext]
}

let server: Server | null = null
let base = ''
const token = randomBytes(12).toString('hex')
let starting: Promise<string> | null = null

function handle(req: IncomingMessage, res: ServerResponse) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range' }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, HEAD' })
    res.end()
    return
  }
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const path = url.searchParams.get('p') || ''
  if (!url.pathname.startsWith(`/${token}/`) || !path || !isAbsolute(path)) {
    res.writeHead(404, cors)
    res.end()
    return
  }
  const type = typeOf(path)
  if (!type) {
    res.writeHead(415, cors)
    res.end()
    return
  }
  let size = 0
  try {
    const st = statSync(path)
    if (!st.isFile()) throw new Error('not a file')
    size = st.size
  } catch {
    res.writeHead(404, cors)
    res.end()
    return
  }
  const headers: Record<string, string | number> = {
    ...cors,
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''))
  if (range && size > 0) {
    let start = range[1] ? parseInt(range[1], 10) : 0
    let end = range[2] ? parseInt(range[2], 10) : size - 1
    if (!range[1] && range[2]) {
      // bytes=-N : N byte cuoi
      start = Math.max(0, size - parseInt(range[2], 10))
      end = size - 1
    }
    end = Math.min(end, size - 1)
    if (start > end || start >= size) {
      res.writeHead(416, { ...cors, 'Content-Range': `bytes */${size}` })
      res.end()
      return
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    if (req.method === 'HEAD') return void res.end()
    createReadStream(path, { start, end }).on('error', () => res.destroy()).pipe(res)
    return
  }
  res.writeHead(200, { ...headers, 'Content-Length': size })
  if (req.method === 'HEAD') return void res.end()
  createReadStream(path).on('error', () => res.destroy()).pipe(res)
}

/** Goc URL dang `http://127.0.0.1:<port>/<token>` (khoi dong lan dau khi can). */
export function mediaBase(): Promise<string> {
  if (base) return Promise.resolve(base)
  if (starting) return starting
  starting = new Promise((resolve, reject) => {
    const srv = createServer(handle)
    srv.on('error', (e) => {
      starting = null
      reject(e)
    })
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      server = srv
      base = `http://127.0.0.1:${port}/${token}`
      resolve(base)
    })
  })
  return starting
}

/** URL cho 1 file (cung cong thuc voi remotion/AutoEdit.tsx -> mediaSrc). */
export async function mediaUrl(path: string): Promise<string> {
  const b = await mediaBase()
  const name = path.split(/[\\/]/).pop() || 'media'
  return `${b}/${encodeURIComponent(name)}?p=${encodeURIComponent(path)}`
}

export function stopMediaServer(): void {
  server?.close()
  server = null
  base = ''
  starting = null
}
