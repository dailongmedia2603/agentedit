// HIEU UNG TU VIET (2026-09-27) — HOP CACH LY chay code hieu ung do AI viet.
//
// Code AI viet KHONG BAO GIO chay trong app (trinh xem truoc co cau noi toi file / khoa API) hay
// trong trinh duyet render. No chi chay O DAY: mot tien trinh Node rieng (sidecar goi qua
// Electron-as-node), trong `vm` context KHONG co require / process / fetch, API tu dinh nghia BEN
// TRONG context (khong truyen object cua host vao -> khong leo prototype ra ngoai), gioi han thoi
// gian moi lan goi. Ket qua la cay phan tu -> loc (the / thuoc tinh cho phep) -> chuoi SVG/HTML
// an toan, tinh san CHO TUNG KHUNG. Remotion chi hien chuoi do -> xem truoc = render, tat dinh.
//
// Vao (stdin JSON):  {"mode": "check" | "frames", "effects": [{id, kind, code, duration, fps, W, H,
//                     face?, params?, palette?, out?}]}
// Ra  (stdout JSON): {"results": [{id, ok, errors: [], warnings: [], stats: {...}, file?, values?}]}
//   kind "overlay"   : code dinh nghia function render(ctx) -> cay h(...) ve DE LEN video
//   kind "transform" : code dinh nghia function transform(ctx) -> {scale, x, y, rotate, blur, brightness,
//                      contrast, saturate, hueRotate} ap len KHUNG VIDEO (rung, zoom, nghieng, doi mau...)
import vm from 'node:vm'
import fs from 'node:fs'
import path from 'node:path'

export const FX_RUNTIME_VERSION = 1
const MAX_CODE = 14000
const MAX_NODES = 900
const CALL_TIMEOUT_MS = 250
const MAX_AVG_MS = 30
const MAX_SEC = 8

// Tu KHONG duoc xuat hien trong code (ngoai cac lop chan khac): truy cap moi truong, bat dong bo,
// thoi gian thuc / ngau nhien khong tat dinh, leo prototype.
const BLOCK = [
  'window', 'document', 'globalThis', 'process', 'require', 'import', 'eval', 'Function', 'constructor',
  'prototype', '__proto__', '__defineGetter__', '__lookupGetter__', 'this', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'Worker', 'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'Date', 'performance', 'crypto',
  'localStorage', 'sessionStorage', 'indexedDB', 'postMessage', 'Reflect', 'Proxy', 'WebAssembly', 'Atomics',
  'SharedArrayBuffer', 'queueMicrotask', 'async', 'await', 'yield', 'studio', 'Buffer'
]
const BLOCK_RE = new RegExp('\\b(' + BLOCK.join('|') + ')\\b')

// API dinh nghia BEN TRONG vm context (moi object / ham thuoc realm cua context).
const API_SRC = String.raw`
'use strict';
var __M = {}; Object.getOwnPropertyNames(Math).forEach(function (k) { if (k !== 'random') __M[k] = Math[k]; });
__M.random = function () { throw new Error('Math.random bi cam — dung random(seed)'); };
var Math = __M;
function h(t, p) { var c = []; for (var i = 2; i < arguments.length; i++) c.push(arguments[i]); return { t: t, p: p || {}, c: c }; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function range(n) { var o = []; for (var i = 0; i < n; i++) o.push(i); return o; }
var Easing = {
  linear: function (t) { return t; },
  quad: function (t) { return t * t; }, cubic: function (t) { return t * t * t; },
  sin: function (t) { return 1 - Math.cos((t * Math.PI) / 2); }, circle: function (t) { return 1 - Math.sqrt(1 - t * t); },
  exp: function (t) { return t === 0 ? 0 : Math.pow(2, 10 * (t - 1)); },
  back: function (s) { s = s === undefined ? 1.70158 : s; return function (t) { return t * t * ((s + 1) * t - s); }; },
  elastic: function (b) { b = b === undefined ? 1 : b; var p = b * Math.PI; return function (t) { return 1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * p); }; },
  bounce: function (t) { if (t < 1 / 2.75) return 7.5625 * t * t; if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; } if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; } t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375; },
  in: function (f) { return f; }, out: function (f) { return function (t) { return 1 - f(1 - t); }; },
  inOut: function (f) { return function (t) { return t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2; }; }
};
function interpolate(v, a, b, o) {
  o = o || {}; var n = a.length; if (n < 2 || b.length !== n) throw new Error('interpolate: inRange / outRange phai cung do dai >= 2');
  var i = 1; while (i < n - 1 && v > a[i]) i++;
  var x0 = a[i - 1], x1 = a[i], t = x1 === x0 ? 0 : (v - x0) / (x1 - x0);
  if (o.extrapolate !== 'extend') t = clamp(t, 0, 1);
  if (o.easing) t = o.easing(t);
  return b[i - 1] + (b[i] - b[i - 1]) * t;
}
function spring(t, c) {
  c = c || {}; var m = c.mass || 1, k = c.stiffness || 100, d = c.damping || 10; if (t <= 0) return 0;
  var w0 = Math.sqrt(k / m), z = d / (2 * Math.sqrt(k * m));
  if (z < 1) { var wd = w0 * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t)); }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}
function __hash(s) { s = String(s); var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
function random(seed) { var x = __hash(seed) + 0x6D2B79F5; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }
function __g(ix, iy) { return random(ix * 7919 + iy * 104729) * 2 - 1; }
function noise(x, y) { y = y || 0; var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  var a = lerp(__g(x0, y0), __g(x0 + 1, y0), sx), b = lerp(__g(x0, y0 + 1), __g(x0 + 1, y0 + 1), sx); return lerp(a, b, sy); }
function env(t, d, fin, fout) { fin = fin === undefined ? 0.2 : fin; fout = fout === undefined ? 0.2 : fout;
  var a = fin > 0 ? clamp(t / fin, 0, 1) : 1, b = fout > 0 ? clamp((d - t) / fout, 0, 1) : 1; return Math.min(a, b); }
function polar(cx, cy, r, ang) { return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]; }
function __rgb(c) { c = String(c).trim(); var m = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (m) { var s = m[1]; if (s.length <= 4) s = s.split('').map(function (q) { return q + q; }).join('');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), s.length >= 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1]; }
  m = /^rgba?\(([^)]*)\)$/i.exec(c); if (m) { var p = m[1].split(',').map(function (q) { return parseFloat(q); }); return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1]; }
  return [255, 255, 255, 1]; }
function alpha(c, a) { var r = __rgb(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }
function mix(c1, c2, t) { var a = __rgb(c1), b = __rgb(c2); t = clamp(t, 0, 1);
  return 'rgba(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ',' + lerp(a[3], b[3], t).toFixed(3) + ')'; }
function hsl(hh, s, l, a) { return 'hsla(' + hh + ',' + s + '%,' + l + '%,' + (a === undefined ? 1 : a) + ')'; }
`

const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs',
  'linearGradient', 'radialGradient', 'stop', 'filter', 'feGaussianBlur', 'feColorMatrix', 'feOffset', 'feMerge',
  'feMergeNode', 'feBlend', 'feTurbulence', 'feDisplacementMap', 'feComposite', 'feFlood', 'feMorphology',
  'mask', 'clipPath', 'pattern', 'use'])
const HTML_TAGS = new Set(['div'])
const UNITLESS = new Set(['opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'fontWeight', 'lineHeight', 'order',
  'scale', 'fillOpacity', 'strokeOpacity', 'stopOpacity', 'strokeMiterlimit'])
const BAD_ATTR = /^(on|href$|xlink:href$|src$|srcdoc$|formaction$|action$|style$|class$|classname$|dangerouslysetinnerhtml$)/i

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function kebab(k) {
  return k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}
function safeValue(v, err) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw err('gia tri so khong hop le (NaN / Infinity)')
    return String(Math.round(v * 1000) / 1000)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v !== 'string') throw err('gia tri thuoc tinh phai la chuoi / so')
  const s = v.trim()
  if (/javascript:|expression\s*\(|@import|<\/?script/i.test(s)) throw err('gia tri thuoc tinh bi cam: ' + s.slice(0, 40))
  if (/url\s*\(/i.test(s) && !/^(.*url\(\s*#[\w-]+\s*\).*)$/i.test(s)) throw err('chi duoc url(#id) noi bo')
  return s
}

/** Cay phan tu -> chuoi SVG/HTML da loc. `pre` = tien to id (hai hieu ung cung luc khong trung id). */
function serialize(node, pre, stats, err) {
  if (node === null || node === undefined || node === false) return ''
  if (Array.isArray(node)) return node.map((n) => serialize(n, pre, stats, err)).join('')
  if (typeof node === 'string' || typeof node === 'number') {
    if (String(node).trim()) throw err('KHONG duoc ve chu trong hieu ung (chu di qua lop chu co quy tac rieng)')
    return ''
  }
  if (typeof node !== 'object' || typeof node.t !== 'string') throw err('phan tu khong hop le — dung h(the, thuoc_tinh, ...con)')
  const tag = node.t
  if (!SVG_TAGS.has(tag) && !HTML_TAGS.has(tag)) throw err("the '" + tag + "' khong duoc phep")
  stats.nodes += 1
  if (stats.nodes > MAX_NODES) throw err('qua nhieu phan tu (> ' + MAX_NODES + ') — ve gon hon')
  const attrs = []
  const p = node.p || {}
  for (const k of Object.keys(p)) {
    const v = p[k]
    if (v === undefined || v === null || v === false) continue
    if (k === 'style') {
      if (typeof v !== 'object') throw err('style phai la object')
      const css = []
      for (const sk of Object.keys(v)) {
        if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(sk)) throw err('ten thuoc tinh style khong hop le: ' + sk)
        let sv = v[sk]
        if (sv === undefined || sv === null || sv === false) continue
        if (typeof sv === 'number' && !UNITLESS.has(sk)) sv = safeValue(sv, err) + 'px'
        else sv = safeValue(sv, err)
        css.push(kebab(sk) + ':' + sv.replace(/url\(\s*#([\w-]+)\s*\)/g, (_m, id) => 'url(#' + pre + id + ')'))
      }
      if (css.length) attrs.push('style="' + esc(css.join(';')) + '"')
      continue
    }
    if (k === 'href' || k === 'xlinkHref') {
      const s = String(v)
      if (tag !== 'use' || !/^#[\w-]+$/.test(s)) throw err('href chi duoc #id noi bo tren the use')
      attrs.push('href="#' + esc(pre + s.slice(1)) + '"')
      continue
    }
    if (BAD_ATTR.test(k) || !/^[a-zA-Z][a-zA-Z0-9:-]*$/.test(k)) throw err('thuoc tinh bi cam: ' + k)
    let sv = safeValue(v, err)
    if (k === 'id') sv = pre + sv
    sv = sv.replace(/url\(\s*#([\w-]+)\s*\)/g, (_m, id) => 'url(#' + pre + id + ')')
    attrs.push(k + '="' + esc(sv) + '"')
  }
  if (tag === 'svg' && !p.xmlns) attrs.push('xmlns="http://www.w3.org/2000/svg"')
  const inner = (node.c || []).map((n) => serialize(n, pre, stats, err)).join('')
  return '<' + tag + (attrs.length ? ' ' + attrs.join(' ') : '') + '>' + inner + '</' + tag + '>'
}

const T_KEYS = { scale: [0.5, 2.5, 1], x: [-1080, 1080, 0], y: [-1920, 1920, 0], rotate: [-30, 30, 0], blur: [0, 30, 0],
  brightness: [0, 3, 1], contrast: [0, 3, 1], saturate: [0, 3, 1], hueRotate: [-360, 360, 0] }

function staticCheck(e) {
  const errs = []
  const code = String(e.code || '')
  if (!code.trim()) errs.push('khong co code')
  if (code.length > MAX_CODE) errs.push('code qua dai (> ' + MAX_CODE + ' ky tu)')
  const m = BLOCK_RE.exec(code)
  if (m) errs.push("dung '" + m[1] + "' bi cam trong hieu ung")
  if (/Math\s*\.\s*random/.test(code)) errs.push('Math.random bi cam — dung random(seed) cho tat dinh')
  const fn = e.kind === 'transform' ? 'transform' : 'render'
  if (!new RegExp('function\\s+' + fn + '\\s*\\(').test(code)) errs.push('phai dinh nghia function ' + fn + '(ctx)')
  return errs
}

function makeRunner(e) {
  // context KHONG co gi cua host; tat eval / new Function / wasm ben trong
  const box = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } })
  vm.runInContext(API_SRC, box, { timeout: 1000 })
  const fn = e.kind === 'transform' ? 'transform' : 'render'
  vm.runInContext("'use strict';\n" + e.code + '\n;var __fx = ' + fn + ';', box, { timeout: 1000, filename: 'hieu_ung.js' })
  // chi CHUOI (primitive) di qua bien gioi: vao la JSON, ra la JSON -> khong object nao cua host lot vao
  vm.runInContext(
    "var __run = function (inp) { var c = JSON.parse(inp); c.p = c.d > 0 ? c.t / c.d : 0; var r = __fx(c);" +
      " return r === undefined ? 'null' : JSON.stringify(r); };", box, { timeout: 1000 })
  const base = {
    d: e.duration, fps: e.fps, W: e.W, H: e.H, face: e.face || null, avoid: Array.isArray(e.avoid) ? e.avoid : [],
    params: e.params || {}, palette: e.palette || {}, seed: String(e.id)
  }
  return (t, frame) => {
    box.__in = JSON.stringify(Object.assign({}, base, { t, frame }))
    const out = vm.runInContext('__run(__in)', box, { timeout: CALL_TIMEOUT_MS })
    return typeof out === 'string' ? JSON.parse(out) : null
  }
}

function frameTimes(e) {
  const n = Math.max(1, Math.round(e.duration * e.fps))
  return { n, times: Array.from({ length: n }, (_, i) => i / e.fps) }
}

function checkOrFrames(e, mode) {
  const res = { id: e.id, ok: false, errors: [], warnings: [], stats: {} }
  const errOf = (msg) => new Error(msg)
  if (!(e.duration > 0.1) || e.duration > MAX_SEC) {
    res.errors.push('do dai hieu ung ' + e.duration + 's ngoai khoang 0.1-' + MAX_SEC + 's')
    return res
  }
  res.errors.push(...staticCheck(e))
  if (res.errors.length) return res
  let run
  try {
    run = makeRunner(e)
  } catch (ex) {
    res.errors.push('loi cu phap / khoi tao: ' + String(ex && ex.message || ex).slice(0, 300))
    return res
  }
  const pre = 'fx' + String(e.id).replace(/[^\w]/g, '') + '_'
  const d = e.duration
  const samples = [0, d * 0.1, d * 0.25, d * 0.5, d * 0.75, d * 0.9, Math.max(0, d - 1 / e.fps)]
  const t0 = process.hrtime.bigint()
  let calls = 0
  const one = (t) => {
    calls += 1
    const v = run(t, Math.round(t * e.fps))
    if (e.kind === 'transform') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw errOf('transform phai tra ve object {scale, x, y, rotate, ...}')
      const o = {}
      for (const k of Object.keys(v)) {
        if (!T_KEYS[k]) throw errOf("transform khong co khoa '" + k + "' (chi: " + Object.keys(T_KEYS).join(', ') + ')')
        const x = v[k]
        if (typeof x !== 'number' || !Number.isFinite(x)) throw errOf("transform.'" + k + "' phai la so huu han")
        const [lo, hi] = T_KEYS[k]
        o[k] = Math.round(Math.min(hi, Math.max(lo, x)) * 10000) / 10000
      }
      return o
    }
    const st = { nodes: 0 }
    const s = serialize(v, pre, st, errOf)
    return { s, nodes: st.nodes }
  }
  try {
    const outs = samples.map(one)
    const again = one(samples[3])
    if (JSON.stringify(again) !== JSON.stringify(outs[3])) throw errOf('KHONG tat dinh: cung mot thoi diem ra hai ket qua khac nhau')
    if (e.kind !== 'transform') {
      if (!outs[3].nodes) throw errOf('giua hieu ung khong ve gi (cay rong)')
      res.stats.nodes = Math.max(...outs.map((o) => o.nodes))
    }
  } catch (ex) {
    res.errors.push(String(ex && ex.message || ex).slice(0, 300))
    return res
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / Math.max(1, calls)
  res.stats.avg_ms = Math.round(ms * 100) / 100
  if (ms > MAX_AVG_MS) {
    res.errors.push('qua nang: ' + res.stats.avg_ms + 'ms / khung (toi da ' + MAX_AVG_MS + 'ms) — ve it phan tu hon')
    return res
  }
  if (mode === 'frames') {
    const { n, times } = frameTimes(e)
    try {
      if (e.kind === 'transform') {
        const values = {}
        for (const t of times) {
          const o = one(t)
          for (const k of Object.keys(T_KEYS)) (values[k] = values[k] || []).push(k in o ? o[k] : T_KEYS[k][2])
        }
        for (const k of Object.keys(values)) if (values[k].every((x) => x === T_KEYS[k][2])) delete values[k]
        res.values = values
        res.n = n
      } else {
        const uniq = []
        const idx = []
        const seen = new Map()
        for (const t of times) {
          const s = one(t).s
          if (!seen.has(s)) {
            seen.set(s, uniq.length)
            uniq.push(s)
          }
          idx.push(seen.get(s))
        }
        const out = e.out
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out + '.part', JSON.stringify({ v: FX_RUNTIME_VERSION, fps: e.fps, n, frames: uniq, idx }))
        fs.renameSync(out + '.part', out)
        res.file = out
        res.n = n
        res.unique = uniq.length
      }
    } catch (ex) {
      res.errors.push('loi khi ve khung: ' + String(ex && ex.message || ex).slice(0, 300))
      return res
    }
  }
  res.ok = true
  return res
}

function main() {
  const raw = fs.readFileSync(0, 'utf-8')
  const job = JSON.parse(raw || '{}')
  const mode = job.mode === 'frames' ? 'frames' : 'check'
  const results = []
  for (const e of job.effects || []) {
    const eff = {
      id: String(e.id || 'fx'), kind: e.kind === 'transform' ? 'transform' : 'overlay', code: String(e.code || ''),
      duration: Number(e.duration) || 0, fps: Number(e.fps) || 30, W: Number(e.W) || 1080, H: Number(e.H) || 1920,
      face: e.face || null, avoid: e.avoid || [], params: e.params || {}, palette: e.palette || {}, out: e.out
    }
    try {
      results.push(checkOrFrames(eff, mode))
    } catch (ex) {
      results.push({ id: eff.id, ok: false, errors: ['loi hop cach ly: ' + String(ex && ex.message || ex).slice(0, 300)] })
    }
  }
  process.stdout.write(JSON.stringify({ v: FX_RUNTIME_VERSION, results }))
}

main()
