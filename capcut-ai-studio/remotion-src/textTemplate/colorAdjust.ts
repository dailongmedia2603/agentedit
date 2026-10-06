// Chinh mau CapCut (goi 7501974767453474064 "adjust_collection") — port 1:1 shader + Lua doc duoc trong goi:
// AmazingFeature_curves (fshader + curveLut), AmazingFeature_primaryWheel (fshader), AmazingFeature_adjustColor
// (colorAdjust.frag + SeekModeScript.lua). Thu tu = zorder trong config.json: curves (5017) -> primaryWheel (5018) ->
// adjustColor (8004). Kiem: dai sang "Co hoi" LE VIP2-04 — CapCut (248..255, 88..96, 248..255), cong thuc (255, 100, 255).
// Ap tren mau CHUA nhan alpha, giu alpha. Tinh qua LUT 3D (65^3, noi suy tam tuyen) — moi mau anh deu dung duoc.

export interface CurvePoint {
  x: number
  y: number
}
/** 1 kenh duong cong: day diem dieu khien bezier a0, r0, l1, a1, r1, ... (nhu curveLut.frag) */
export type CurveCtl = CurvePoint[]

export type ColorOp =
  | { op: 'curves'; luma?: CurveCtl; red?: CurveCtl; green?: CurveCtl; blue?: CurveCtl }
  | {
      // uniform DA quy doi (adjustLift / adjustGamma / adjustGain cua SeekModeScript.lua)
      op: 'wheel'
      intensity: number
      lift: [number, number, number, number, number] // Y R G B S
      gamma: [number, number, number, number, number]
      gain: [number, number, number, number, number]
      offset: [number, number, number, number] // R G B S
      lumaMix: number
    }
  | {
      // log_color_wheels (AmazingFeature_logWheel) khi shadow / midtone / highlight = 0: processWheel = x + offset (kenh), bao hoa + OffsetS
      op: 'logOffset'
      offset: [number, number, number, number] // R G B S (da kep [-1, 1])
    }
  | {
      op: 'adjust'
      brightness?: number
      contrast?: number
      highlight?: number
      shadow?: number
      saturation?: number
      white?: number
      black?: number
      /** light_sensation: muc (-1..1) + LUT 17^3 (anh lightSensation_min / _max cua goi, [b][g][r] rgb 0..1) */
      light?: number
      lightLut?: number[]
    }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const bez = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const a = (1 - t) * p0 + t * p1
  const b = (1 - t) * p1 + t * p2
  const c = (1 - t) * p2 + t * p3
  const d = (1 - t) * a + t * b
  const e = (1 - t) * b + t * c
  return (1 - t) * d + t * e
}

function curveFn(cp: CurveCtl): (x: number) => number {
  const n = (cp.length + 2) / 3
  const lin = (a: CurvePoint, b: CurvePoint, x: number) => (b.x <= a.x ? (x > b.x ? b.y : a.y) : ((x - a.x) * (b.y - a.y)) / (b.x - a.x) + a.y)
  return (x: number) => {
    if (x < cp[0].x) return lin(cp[0], cp[1], x)
    if (x > cp[(n - 1) * 3].x) return lin(cp[(n - 1) * 3 - 1], cp[(n - 1) * 3], x)
    let i = 0
    for (let j = 0; j < n; j++) {
      i = j
      if (x < cp[j * 3].x) break
    }
    if (i === 0) i = 1
    const p0 = cp[(i - 1) * 3]
    const p1 = cp[(i - 1) * 3 + 1]
    const p2 = cp[(i - 1) * 3 + 2]
    const p3 = cp[i * 3]
    let t: number
    if (Math.abs(p0.x - x) < 5e-5) t = 0
    else if (Math.abs(p3.x - x) < 5e-5) t = 1
    else {
      let s = 0
      let e = 1
      t = 0.5
      let h = bez(p0.x, p1.x, p2.x, p3.x, t)
      for (let k = 0; k < 20; k++) {
        if (Math.abs(h - x) < 5e-5) break
        if (h < x) s = t
        else e = t
        t = (s + e) / 2
        h = bez(p0.x, p1.x, p2.x, p3.x, t)
      }
    }
    return bez(p0.y, p1.y, p2.y, p3.y, t)
  }
}

const gray = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

function processWheel(src: number, lift: number, gamma: number, gain: number, offset: number) {
  lift = Math.min(lift, 0.4995)
  let liftX = lift / (lift - 0.5)
  gain = Math.max(gain, 0.001)
  const gainX = 1 / gain
  liftX = Math.min(liftX, gainX - 0.0005)
  const r = (src - offset - liftX) / (gainX - liftX) + offset
  return r >= 0 ? Math.pow(r, gamma) : -Math.pow(-r, gamma)
}

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  const l = (mx + mn) / 2
  if (d < 1e-5) return [0, 0, l]
  const s = l <= 0.5 ? d / (mx + mn) : d / (2 - (mx + mn))
  let h: number
  if (mx - r < 1e-5) h = g >= b ? (60 * (g - b)) / d : (60 * (g - b)) / d + 360
  else if (mx - g < 1e-5) h = (60 * (b - r)) / d + 120
  else h = (60 * (r - g)) / d + 240
  return [h, s, l]
}
function hue2rgb(p: number, q: number, t: number) {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}
function hsl2rgb(h: number, s: number, l: number): number[] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hh = h / 360
  return [hue2rgb(p, q, hh + 1 / 3), hue2rgb(p, q, hh), hue2rgb(p, q, hh - 1 / 3)]
}

function applyOp(c: number[], o: ColorOp): number[] {
  if (o.op === 'curves') {
    const out = [...c]
    const chans: [number, CurveCtl | undefined][] = [
      [0, o.red],
      [1, o.green],
      [2, o.blue]
    ]
    for (const [k, cv] of chans) if (cv?.length) out[k] = c[k] + (curveFn(cv)(c[k]) - c[k])
    if (o.luma?.length) {
      const ys = gray(c)
      const inc = curveFn(o.luma)(ys) - ys - (gray(out) - ys)
      for (let k = 0; k < 3; k++) out[k] += inc
    }
    return out.map(clamp01)
  }
  if (o.op === 'wheel') {
    const off = [o.offset[0], o.offset[1], o.offset[2]]
    const res = c.map((v, k) => v + off[k])
    const offGray = gray(off)
    const baseY = processWheel(gray(res), o.lift[0], o.gamma[0], o.gain[0], offGray)
    for (let k = 0; k < 3; k++) res[k] = processWheel(res[k], o.lift[k + 1], o.gamma[k + 1], o.gain[k + 1], off[k])
    const resY = gray(res)
    for (let k = 0; k < 3; k++) res[k] = clamp01(res[k] + (baseY - resY) * o.lumaMix)
    const y2 = gray(res)
    const hsl = rgb2hsl(res[0], res[1], res[2])
    let dS = o.offset[3]
    dS += processWheel(y2, o.lift[4], 1, 1, 0) - y2
    dS += processWheel(y2, 0, o.gamma[4], 1, 0) - y2
    dS += processWheel(y2, 0, 1, o.gain[4], 0) - y2
    dS = Math.min(2, Math.max(-1, dS))
    let out = res
    if (Math.abs(dS) > 1e-5) out = hsl2rgb(hsl[0], clamp01(hsl[1] * (1 + dS)), hsl[2])
    return out.map((v, k) => clamp01(c[k] + (v - c[k]) * o.intensity))
  }
  if (o.op === 'logOffset') {
    const res = c.map((v, k) => clamp01(v + o.offset[k]))
    const dS = o.offset[3]
    if (Math.abs(dS) > 1e-5) {
      const hsl = rgb2hsl(res[0], res[1], res[2])
      return hsl2rgb(hsl[0], clamp01(hsl[1] * (1 + dS)), hsl[2]).map(clamp01)
    }
    return res
  }
  // adjustColor (colorAdjust.frag + getXxxParam cua SeekModeScript.lua)
  let r = [...c]
  const cl = (x: number) => Math.min(1, Math.max(-1, x))
  if (o.brightness && Math.abs(o.brightness) > 1e-5) {
    const i = cl(o.brightness)
    const bp = i > 0 && i <= 0.7 ? 0.3 * i : i > 0.7 && i <= 1 ? 0.6333 * i - 0.2333 : i
    let p: number
    if (bp > 0) p = 1 + bp * 5
    else {
      p = 1 / (1 - bp * 2.5)
      r = r.map((v) => v + bp * 0.01)
    }
    r = r.map((v) => clamp01(1 - Math.pow(Math.max(0, 1 - v), p)))
  }
  if (o.contrast && Math.abs(o.contrast) > 1e-5) {
    const piv = 0.435
    const param = o.contrast <= 0 ? o.contrast * 0.4 + 1 : o.contrast * 0.6 + 1
    const a = Math.exp(8.33 * param - 12.16) + 5.82 * param - 1.72
    const sg = (x: number): [number, number] => {
      const s = 1 / (1 + Math.exp(-a * (x - piv)))
      return [s + piv - 0.5, a * s * (1 - s)]
    }
    const [lv, ls] = sg(0)
    const [rv, rs] = sg(1)
    const ps = sg(piv)[1]
    const enh = (x: number) => {
      const [y, k] = sg(x)
      if (x <= piv) return y + ((ps - k) / (ps - ls)) ** 2 * (0 - lv)
      return y + ((ps - k) / (ps - rs)) ** 2 * (1 - rv)
    }
    r = r.map((v) => clamp01(param <= 1 ? param * (v - piv) + piv : enh(v)))
  }
  if (o.saturation && Math.abs(o.saturation) > 1e-5) {
    const sp = cl(o.saturation) + 1
    const L = [0.20854, 0.702086, 0.089374]
    const base = L.map((l) => l * (1 - sp))
    r = [0, 1, 2].map((k) => clamp01(r[0] * (base[0] + (k === 0 ? sp : 0)) + r[1] * (base[1] + (k === 1 ? sp : 0)) + r[2] * (base[2] + (k === 2 ? sp : 0))))
  }
  if (o.highlight && Math.abs(o.highlight) > 1e-5) {
    const p = cl(o.highlight)
    const P = 1 + 0.503 * p + 0.183 * p * p + 0.147 * p ** 3 + 0.067 * p ** 4
    r = r.map((v) => {
      const t = 1 - v
      return clamp01(1 - Math.pow(t, P) - (P - 1) * (t * t - t * t * t))
    })
  }
  if (o.shadow && Math.abs(o.shadow) > 1e-5) {
    const p = cl(o.shadow)
    const P = 1 - 0.503 * p + 0.183 * p * p - 0.147 * p ** 3 + 0.067 * p ** 4
    r = r.map((v) => clamp01(Math.pow(v, P) + (P - 1) * (v * v - v * v * v)))
  }
  if ((o.white && Math.abs(o.white) > 1e-5) || (o.black && Math.abs(o.black) > 1e-5)) {
    const w = cl(o.white ?? 0)
    const bk = cl(o.black ?? 0)
    let [xw, yw] = w >= 0 ? [1 - w * 0.5, 1] : [1, 1 + w * 0.5]
    let [xb, yb] = bk >= 0 ? [0, bk * 0.5] : [-bk * 0.5, 0]
    xw = Math.max(xw, 0.005)
    yw = Math.max(yw, 0.005)
    xb = Math.min(xb, xw - 0.005)
    yb = Math.min(yb, yw - 0.005)
    const sl = (yw - yb) / (xw - xb)
    const bi = yb - sl * xb
    r = r.map((v) => clamp01(sl * v + bi))
  }
  if (o.light && Math.abs(o.light) > 1e-5 && o.lightLut) {
    // applyLut3D(17, 17, 17, 1): noi suy tuyen tinh r, g trong o + tron 2 lat b (floor / ceil)
    const L = o.lightLut
    const at = (b: number, g: number, rr: number, c: number) => L[((b * 17 + g) * 17 + rr) * 3 + c]
    const fr = r[0] * 16
    const fg = r[1] * 16
    const fb = r[2] * 16
    const r0 = Math.min(15, Math.floor(fr))
    const g0 = Math.min(15, Math.floor(fg))
    const b0 = Math.floor(fb)
    const b1 = Math.ceil(fb)
    const tr = fr - r0
    const tg = fg - g0
    const tb = fb - b0
    const lv = [0, 1, 2].map((c) => {
      const sl2 = (b: number) =>
        (at(b, g0, r0, c) * (1 - tr) + at(b, g0, r0 + 1, c) * tr) * (1 - tg) + (at(b, g0 + 1, r0, c) * (1 - tr) + at(b, g0 + 1, r0 + 1, c) * tr) * tg
      return sl2(b0) * (1 - tb) + sl2(b1) * tb
    })
    const a = Math.abs(cl(o.light))
    r = r.map((v, c) => clamp01(v * (1 - a) + lv[c] * a))
  }
  return r
}

export function colorFn(ops: ColorOp[]) {
  return (c: number[]) => ops.reduce((acc, o) => applyOp(acc, o), c)
}

const N = 65
const lutCache = new Map<string, Float32Array>()
function lutOf(ops: ColorOp[]): Float32Array {
  const key = JSON.stringify(ops)
  let lut = lutCache.get(key)
  if (lut) return lut
  lut = new Float32Array(N * N * N * 3)
  const f = colorFn(ops)
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const o = f([r / (N - 1), g / (N - 1), b / (N - 1)])
        const i = ((b * N + g) * N + r) * 3
        lut[i] = o[0]
        lut[i + 1] = o[1]
        lut[i + 2] = o[2]
      }
  lutCache.set(key, lut)
  return lut
}

/** Ap chinh mau len canvas (mau chua nhan alpha cua ImageData), giu alpha */
export function applyColorOps(cv: HTMLCanvasElement, ops: ColorOp[]) {
  const lut = lutOf(ops)
  const c = cv.getContext('2d')!
  const img = c.getImageData(0, 0, cv.width, cv.height)
  const d = img.data
  const s = (N - 1) / 255
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    const fr = d[i] * s
    const fg = d[i + 1] * s
    const fb = d[i + 2] * s
    const r0 = Math.min(N - 2, Math.floor(fr))
    const g0 = Math.min(N - 2, Math.floor(fg))
    const b0 = Math.min(N - 2, Math.floor(fb))
    const tr = fr - r0
    const tg = fg - g0
    const tb = fb - b0
    for (let k = 0; k < 3; k++) {
      const at = (r: number, g: number, b: number) => lut[((b * N + g) * N + r) * 3 + k]
      const c00 = at(r0, g0, b0) * (1 - tr) + at(r0 + 1, g0, b0) * tr
      const c10 = at(r0, g0 + 1, b0) * (1 - tr) + at(r0 + 1, g0 + 1, b0) * tr
      const c01 = at(r0, g0, b0 + 1) * (1 - tr) + at(r0 + 1, g0, b0 + 1) * tr
      const c11 = at(r0, g0 + 1, b0 + 1) * (1 - tr) + at(r0 + 1, g0 + 1, b0 + 1) * tr
      const v = (c00 * (1 - tg) + c10 * tg) * (1 - tb) + (c01 * (1 - tg) + c11 * tg) * tb
      d[i + k] = Math.round(v * 255)
    }
  }
  c.putImageData(img, 0, 0)
}
