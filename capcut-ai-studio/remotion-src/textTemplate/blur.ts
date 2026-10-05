// Port 1:1 hieu ung CapCut "Mo" (mo-hu, 7399464929830423813): 2 luot nhoe ngang + doc, 17 mau trong so co dinh.
// blurSize = 4 * thanh truot effects_adjust_blur (SeekModeScript.lua); buoc = blurSize * 1.25 / (720 theo chieu ngan).
import type { Img } from './deepGlow'

const W8 = [0.2, 0.19, 0.17, 0.15, 0.13, 0.11, 0.08, 0.05, 0.02]

function pass(src: Img, horizontal: boolean, blurSize: number): Img {
  const { w, h, d } = src
  const out = new Float32Array(d.length)
  const mn = Math.min(w, h)
  // buoc theo pixel: uv step * kich thuoc = (1 / (size*720/mn)) * blurSize * 1.25 * size
  const stepPx = (blurSize * 1.25 * mn) / 720
  let sumW = W8[0]
  for (let i = 1; i <= 8; i++) sumW += W8[i] * 2
  const n = horizontal ? w : h
  const line = new Float32Array(n * 4)
  for (let o = 0; o < (horizontal ? h : w); o++) {
    // chep 1 hang/cot ra mang tam
    for (let i = 0; i < n; i++) {
      const idx = horizontal ? (o * w + i) * 4 : (i * w + o) * 4
      line[i * 4] = d[idx]
      line[i * 4 + 1] = d[idx + 1]
      line[i * 4 + 2] = d[idx + 2]
      line[i * 4 + 3] = d[idx + 3]
    }
    for (let i = 0; i < n; i++) {
      let r = line[i * 4] * W8[0]
      let g = line[i * 4 + 1] * W8[0]
      let b = line[i * 4 + 2] * W8[0]
      let a = line[i * 4 + 3] * W8[0]
      for (let k = 1; k <= 8; k++) {
        for (const sgn of [1, -1]) {
          // lay mau song tuyen tinh tai tam pixel + k*buoc, kep bien
          const x = i + sgn * k * stepPx
          let x0 = Math.floor(x)
          const f = x - x0
          let x1 = x0 + 1
          x0 = x0 < 0 ? 0 : x0 >= n ? n - 1 : x0
          x1 = x1 < 0 ? 0 : x1 >= n ? n - 1 : x1
          const wt = W8[k]
          r += (line[x0 * 4] * (1 - f) + line[x1 * 4] * f) * wt
          g += (line[x0 * 4 + 1] * (1 - f) + line[x1 * 4 + 1] * f) * wt
          b += (line[x0 * 4 + 2] * (1 - f) + line[x1 * 4 + 2] * f) * wt
          a += (line[x0 * 4 + 3] * (1 - f) + line[x1 * 4 + 3] * f) * wt
        }
      }
      const idx = horizontal ? (o * w + i) * 4 : (i * w + o) * 4
      out[idx] = r / sumW
      out[idx + 1] = g / sumW
      out[idx + 2] = b / sumW
      out[idx + 3] = a / sumW
    }
  }
  return { w, h, d: out }
}

/** Anh premultiplied; blurSize <= 0 -> giu nguyen */
export function capcutBlur(img: Img, blurSize: number): Img {
  if (blurSize <= 1e-4) return img
  return pass(pass(img, true, blurSize), false, blurSize)
}

/** CapCut "Mo chrome" (7399470160203107589): nhoe huong tam 21 mau (VerticalBlur.frag) + tach mau R/B
 *  (VerticalAberration.frag); alpha giu nguyen nhu alphaOutput.frag. blur = effects_adjust_blur,
 *  offset = 0.32 * effects_adjust_horizontal_chromatic - 0.16. Anh premultiplied. */
export function chromeBlur(img: Img, blur: number, offset: number, flipY = false): Img {
  const { w, h, d } = img
  const pass1 = new Float32Array(d.length)
  const smp = (src: Float32Array, u: number, v: number, c: number) => {
    // texture2D song tuyen tinh, kep bien
    const x = u * w - 0.5
    const y = v * h - 0.5
    let x0 = Math.floor(x)
    let y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    let x1 = x0 + 1
    let y1 = y0 + 1
    x0 = x0 < 0 ? 0 : x0 >= w ? w - 1 : x0
    x1 = x1 < 0 ? 0 : x1 >= w ? w - 1 : x1
    y0 = y0 < 0 ? 0 : y0 >= h ? h - 1 : y0
    y1 = y1 < 0 ? 0 : y1 >= h ? h - 1 : y1
    return (
      src[(y0 * w + x0) * 4 + c] * (1 - fx) * (1 - fy) +
      src[(y0 * w + x1) * 4 + c] * fx * (1 - fy) +
      src[(y1 * w + x0) * 4 + c] * (1 - fx) * fy +
      src[(y1 * w + x1) * 4 + c] * fx * fy
    )
  }
  const step = 20 / 720
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w
      const i = (y * w + x) * 4
      const dx = u - 0.5
      const dy = v - 0.5
      const dist = Math.hypot(dx, dy) * blur
      let r = 0
      let g = 0
      let b = 0
      if (dist === 0) {
        r = d[i]
        g = d[i + 1]
        b = d[i + 2]
      } else {
        for (let t = -10; t <= 10; t++) {
          const uu = u + step * t * dx * dist
          const vv = v + step * t * dy * dist
          r += smp(d, uu, vv, 0)
          g += smp(d, uu, vv, 1)
          b += smp(d, uu, vv, 2)
        }
        r /= 21
        g /= 21
        b /= 21
      }
      pass1[i] = r
      pass1[i + 1] = g
      pass1[i + 2] = b
      pass1[i + 3] = d[i + 3]
    }
  }
  const out = new Float32Array(d.length)
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w
      const i = (y * w + x) * 4
      const s = Math.hypot(u - 0.5, v - 0.5) * offset
      // uv cua GPU: v huong LEN -> trong anh (v huong xuong) dich doc nguoc dau
      const sv = flipY ? -s : s
      out[i] = smp(pass1, u + s, v + sv, 0)
      out[i + 1] = pass1[i + 1]
      out[i + 2] = smp(pass1, u - s, v - sv, 2)
      out[i + 3] = d[i + 3]
    }
  }
  return { w, h, d: out }
}
