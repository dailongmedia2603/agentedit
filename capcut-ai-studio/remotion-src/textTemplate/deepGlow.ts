// Port 1:1 LumiDeepGlow (threshold.frag + GlowIter x8 (blur.frag X/Y) + blend.frag) sang JS.
// Anh vao/ra: Float32Array RGBA da nhan alpha (premultiplied), 0..1. Lay mau song tuyen tinh + kep bien nhu GPU.
import type { DeepGlowEffect } from './spec'

export interface Img {
  w: number
  h: number
  d: Float32Array // RGBA
}

const newImg = (w: number, h: number): Img => ({ w, h, d: new Float32Array(w * h * 4) })

/** texture2D(tex, uv) — bilinear, CLAMP_TO_EDGE */
function sample(img: Img, u: number, v: number, out: Float32Array, o = 0) {
  const x = u * img.w - 0.5
  const y = v * img.h - 0.5
  let x0 = Math.floor(x)
  let y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  let x1 = x0 + 1
  let y1 = y0 + 1
  const W = img.w - 1
  const H = img.h - 1
  x0 = x0 < 0 ? 0 : x0 > W ? W : x0
  x1 = x1 < 0 ? 0 : x1 > W ? W : x1
  y0 = y0 < 0 ? 0 : y0 > H ? H : y0
  y1 = y1 < 0 ? 0 : y1 > H ? H : y1
  const d = img.d
  const i00 = (y0 * img.w + x0) * 4
  const i10 = (y0 * img.w + x1) * 4
  const i01 = (y1 * img.w + x0) * 4
  const i11 = (y1 * img.w + x1) * 4
  const w00 = (1 - fx) * (1 - fy)
  const w10 = fx * (1 - fy)
  const w01 = (1 - fx) * fy
  const w11 = fx * fy
  for (let c = 0; c < 4; c++) out[o + c] = d[i00 + c] * w00 + d[i10 + c] * w10 + d[i01 + c] * w01 + d[i11 + c] * w11
}

const pw = (x: number, g: number) => (x <= 0 ? 0 : Math.pow(x, g))

function thresholdPass(input: Img, w: number, h: number, p: DeepGlowEffect): Img {
  const out = newImg(w, h)
  const s = new Float32Array(4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      sample(input, (x + 0.5) / w, (y + 0.5) / h, s)
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        let v = Math.max(s[c], 0)
        if (v < p.threshold) {
          const pct = v / Math.max(p.threshold, 0.0001)
          v = pct * v * p.thresholdSmooth
        }
        out.d[i + c] = p.gammaCorrect ? pw(v, p.gammaValue) : v
      }
      out.d[i + 3] = 1
    }
  }
  return out
}

const normpdf = (x: number, sigma: number) => (0.39894 * Math.exp((-0.5 * x * x) / (sigma * sigma))) / sigma

function blurPass(input: Img, angle: number, samples: number, downSample: number, gamma: number): Img {
  const { w, h } = input
  const out = newImg(w, h)
  const theta = (angle / 180) * 3.1415926
  const mn = Math.min(w, h)
  const rx = (720 * w) / mn
  const ry = (720 * h) / mn
  const ux = (Math.cos(theta) / rx) * downSample
  const uy = (Math.sin(theta) / ry) * downSample
  const sigma = 4
  const first = normpdf(0, sigma)
  const weights: number[] = []
  for (let i = 1; i <= samples; i++) weights.push(normpdf((i / samples) * 16, sigma))
  let sumW = first
  for (const wt of weights) sumW += wt * 2
  const a = new Float32Array(4)
  const b = new Float32Array(4)
  const inv = 1 / gamma
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w
      sample(input, u, v, a)
      let r = pw(a[0], gamma) * first
      let g = pw(a[1], gamma) * first
      let bl = pw(a[2], gamma) * first
      for (let k = 0; k < samples; k++) {
        const i = k + 1
        const wt = weights[k]
        sample(input, u + i * ux, v + i * uy, a)
        sample(input, u - i * ux, v - i * uy, b)
        r += (pw(a[0], gamma) + pw(b[0], gamma)) * wt
        g += (pw(a[1], gamma) + pw(b[1], gamma)) * wt
        bl += (pw(a[2], gamma) + pw(b[2], gamma)) * wt
      }
      const o = (y * w + x) * 4
      out.d[o] = pw(r / sumW, inv)
      out.d[o + 1] = pw(g / sumW, inv)
      out.d[o + 2] = pw(bl / sumW, inv)
      out.d[o + 3] = 1
    }
  }
  return out
}

const screen = (a: number, b: number) => 1 - (1 - a) * (1 - b)
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Tra ve anh moi (cung kich thuoc input). radius <= 0 -> giu nguyen. */
export function deepGlow(input: Img, p: DeepGlowEffect, gain = 1): Img {
  if (p.radius <= 0) return input
  const W = input.w
  const H = input.h
  // LumiDeepGlow:onUpdate — RT nhoe = OutputTex * 0.5 * quality
  const w = Math.max(1, Math.round(W * 0.5 * p.quality))
  const h = Math.max(1, Math.round(H * 0.5 * p.quality))
  const r = p.radius
  const down = [1, 1, Math.max(Math.min(r / 128, 2), 1), Math.max(Math.min(r / 64, 4), 1), Math.max(r / 32, 1), Math.max(r / 16, 1), Math.max(r / 8, 1), Math.max(r / 4, 1)]
  const inten = [
    (r / 16) * 0.125,
    (r / 16) * 0.25,
    (r / 16 / down[2]) * 0.5,
    r / 16 / down[3],
    (r / down[4]) * 0.125,
    (r / down[5]) * 0.25,
    (r / down[6]) * 0.5,
    r / down[7]
  ]
  let cur = thresholdPass(input, w, h, p)
  const comps: Img[] = []
  for (let k = 0; k < 8; k++) {
    const n = Math.floor(Math.max(inten[k], 0))
    const bx = blurPass(cur, 0, n, down[k], p.gammaValue)
    cur = blurPass(bx, 90, n, down[k], p.gammaValue)
    comps.push(cur)
  }
  // blend.frag
  const out = newImg(W, H)
  const intensity = pw(p.glowIntensity * p.exposure, 1 / p.gammaValue) * gain
  const s = new Float32Array(4)
  const dis = new Float32Array(4)
  const g = p.gammaValue
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W
      for (let k = 0; k < 8; k++) {
        sample(comps[k], u, v, s)
        for (let c = 0; c < 4; c++) {
          const d = clamp01(s[c] * intensity)
          if (k === 0) dis[c] = d
          else dis[c] = p.blendMode === 'screen' ? screen(dis[c], d) : Math.min(dis[c] + d, 1)
        }
      }
      const m = Math.max(intensity, 1)
      // glowColor -> pow(gamma) -> (gammaCorrect) rgb pow(1/gamma)
      let gr = clamp01(dis[0] * m)
      let gg = clamp01(dis[1] * m)
      let gb = clamp01(dis[2] * m)
      let ga = pw(clamp01(dis[3] * m), g)
      gr = pw(gr, g)
      gg = pw(gg, g)
      gb = pw(gb, g)
      if (p.gammaCorrect) {
        gr = pw(gr, 1 / g)
        gg = pw(gg, 1 / g)
        gb = pw(gb, 1 / g)
      }
      if (p.unmult) {
        const br = Math.max(gr, gg, gb)
        if (br > 0) ga = br
        else gr = gg = gb = ga = 0
      }
      const i = (y * W + x) * 4
      const ar = input.d[i]
      const ag = input.d[i + 1]
      const ab = input.d[i + 2]
      const aa = input.d[i + 3]
      // composite(inputTex, result)
      const ia = Math.max(aa, 0.0001)
      const ib = Math.max(ga, 0.0001)
      const cr = ar * (1 - ga) + gr * (1 - aa) + aa * ga * screen(ar / ia, gr / ib)
      const cg = ag * (1 - ga) + gg * (1 - aa) + aa * ga * screen(ag / ia, gg / ib)
      const cb = ab * (1 - ga) + gb * (1 - aa) + aa * ga * screen(ab / ia, gb / ib)
      const ca = aa + ga - aa * ga
      const so = p.sourceOpacity
      out.d[i] = gr + (cr - gr) * so
      out.d[i + 1] = gg + (cg - gg) * so
      out.d[i + 2] = gb + (cb - gb) * so
      out.d[i + 3] = ga + (ca - ga) * so
    }
  }
  return out
}
