// stroke-segment-build —— 断笔成字（《异形》式）：标题拆成十几段互不相连的笔画，乱序逐段点亮，
// 前 70% 读不出字，最后几段"钥匙段"落位的瞬间意义"啪"地成立。
//
// 第二轮重设计（极光夜 · 霓虹灯牌）：
// - look = aurora。标题重画成 400px 高的单线几何字（S 用两段反向弧，P 有圆弧碗），拆成十几根
//   互不相连的霓虹灯管（灯管之间留电极缝），挂在一面深紫墙上。每根灯管"点亮"是霓虹起辉：
//   亮—灭—亮—半亮—亮 的 7f 抖闪，之后以 0.58 亮度稳住；揭晓前整块灯牌处于"半亮碎片"态。
// - 节奏「疏 → 密 → 屏息 → 一、二、三 → 轰」：前 N 段的起点按 ease-out 分布（间隔越来越密），
//   然后 14f 屏息（只有灯管电流的微弱嗡动），最后 3 根钥匙段以 7f/6f 的拍子落下，
//   末段落位帧整块灯牌电流涌起：全部灯管 0.58→1 并冲到 1.25 再回落、灯牌自身的宽泛光涌起一次、墙面与地面被照亮。
// - 空间：墙面的环境光 = 已点亮灯管数（物理：灯越多墙越亮）；下方是一块光亮地面，倒映灯牌下半截
//   （模糊 + 渐隐）+ 一条地面光带；整个镜头 1→1.035 极缓推近。
// - 揭晓后才浮出副题（不提前泄底）。
//
// 时间表（30fps，共 165f）：
//   0–12    暗墙 + 极淡的墙面光（开场不是死黑）
//   12–72   乱序段点亮，间隔越来越快
//   72–86   屏息 14f：什么都不新增，只有灯管嗡动
//   86/93/99 三根钥匙段（取首 / 中 / 末字母各自的"可读性钥匙段"，左→右）
//   105     末段起辉完毕 = 揭晓：电流涌起 + 泛光 + 墙/地亮起
//   113–129 副题升起
//   129–165 hold：灯牌稳定发光，镜头极缓推近
//
// [Agent Edit] o chu `word` (1 tu ngan in hoa, <= 8 ky tu) ve bang BO CHU NEON NET DON tu dung: A-Z, 0-9, % + - ! . / va DAU
// TIENG VIET (Ă Â Ê Ô Ơ Ư Đ + sac huyen hoi nga nang — moi dau la 1 ong neon rieng, chen vao luot sang loan). Moi chu cai
// tach 2-6 doan + 1 "doan khoa"; 3 doan khoa (chu dau / giua / cuoi) de cuoi -> giu nguyen nhip giau nghia cua the.
// Tu dai -> ca bien thu nho vua be ngang. o chu `subtitle` (dong phu hien SAU khi lo chu) + ten thuong hieu (neu co).
// Khung doc (native): bien to hon (~1.36x), tuong / san / bong phan chieu xep theo chieu cao that.
import { useBackdrop, useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { EASE, FONT, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, stagger } from '../../../fixtures/Look';
import { BRAND } from '../../../fixtures/Brand';

export const STROKE_SEGMENT_BUILD_DURATION = 165;

const L = LOOKS.aurora;
const TUBE = '#ff5cab'; // 灯管本色（霓虹粉）
const CORE = '#fff2f8'; // 白热芯

// —— 字形：字高 400（顶 20 / 中 200 / 底 380），默认字宽 260，字间 70；单线几何字，笔画线宽 30 ——
const LH = 400;
const GAP = 70;
const SPACE = 150;
const SW = 30;

type GSeg = { d: string; key?: boolean };
type Glyph = { w: number; segs: GSeg[]; horn?: string };
const ln = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`;
const K = 0.5523;
// 椭圆四段弧：右上 / 右下 / 左下 / 左上
const ell = (cx: number, cy: number, rx: number, ry: number) => [
  `M ${cx} ${cy - ry} C ${cx + K * rx} ${cy - ry} ${cx + rx} ${cy - K * ry} ${cx + rx} ${cy}`,
  `M ${cx + rx} ${cy} C ${cx + rx} ${cy + K * ry} ${cx + K * rx} ${cy + ry} ${cx} ${cy + ry}`,
  `M ${cx} ${cy + ry} C ${cx - K * rx} ${cy + ry} ${cx - rx} ${cy + K * ry} ${cx - rx} ${cy}`,
  `M ${cx - rx} ${cy} C ${cx - rx} ${cy - K * ry} ${cx - K * rx} ${cy - ry} ${cx} ${cy - ry}`,
];
const join2 = (a: string, b: string) => a + ' ' + b.replace(/^M [^C]*C/, 'C');
const g = (w: number, ...segs: (string | [string, true])[]): Glyph => ({
  w,
  segs: segs.map((s) => (Array.isArray(s) ? { d: s[0], key: true } : { d: s })),
});
const O_ARCS = ell(130, 200, 98, 180);
const GLYPHS: Record<string, Glyph> = {
  A: g(260, ln(30, 380, 80, 200), ln(80, 200, 130, 20), ln(130, 20, 180, 200), ln(180, 200, 230, 380), [ln(76, 262, 184, 262), true]),
  B: g(260, ln(34, 20, 34, 196), ln(34, 204, 34, 380), `M 58 20 L 126 20 C 184 20 212 50 212 106 C 212 162 184 196 126 196 L 58 196`,
    [`M 58 204 L 136 204 C 196 204 228 240 228 292 C 228 344 196 380 136 380 L 58 380`, true]),
  C: g(260, `M 224 92 C 208 44 174 20 130 20`, `M 130 20 C 68 20 34 84 34 200`, `M 34 200 C 34 316 68 380 130 380`, [`M 130 380 C 174 380 208 356 224 308`, true]),
  D: g(260, ln(34, 20, 34, 196), ln(34, 204, 34, 380), `M 58 20 L 104 20 C 186 20 226 92 226 200`, [`M 226 200 C 226 308 186 380 104 380 L 58 380`, true]),
  Đ: g(260, ln(34, 20, 34, 196), ln(34, 204, 34, 380), `M 58 20 L 104 20 C 186 20 226 92 226 200`, [`M 226 200 C 226 308 186 380 104 380 L 58 380`, true], ln(-6, 200, 92, 200)),
  E: g(250, ln(34, 20, 34, 196), ln(34, 204, 34, 380), ln(58, 20, 220, 20), [ln(58, 200, 192, 200), true], ln(58, 380, 220, 380)),
  F: g(240, ln(34, 20, 34, 196), ln(34, 204, 34, 380), ln(58, 20, 214, 20), [ln(58, 200, 186, 200), true]),
  G: g(270, `M 230 92 C 214 44 178 20 134 20`, `M 134 20 C 70 20 34 84 34 200`, `M 34 200 C 34 316 70 380 134 380 C 190 380 230 346 230 286 L 230 226`, [ln(230, 222, 142, 222), true]),
  H: g(260, ln(34, 20, 34, 196), ln(34, 204, 34, 380), ln(226, 20, 226, 380), [ln(58, 200, 202, 200), true]),
  I: g(120, ln(60, 20, 60, 196), [ln(60, 204, 60, 380), true]),
  J: g(230, ln(190, 20, 190, 286), [`M 190 286 C 190 348 160 380 112 380 C 66 380 36 350 30 302`, true]),
  K: g(260, ln(34, 20, 34, 196), ln(34, 204, 34, 380), ln(222, 20, 64, 214), [ln(112, 168, 228, 380), true]),
  L: g(230, ln(34, 20, 34, 196), ln(34, 204, 34, 380), [ln(58, 380, 214, 380), true]),
  M: g(320, ln(34, 380, 34, 20), ln(54, 32, 160, 250), [ln(160, 250, 266, 32), true], ln(286, 20, 286, 380)),
  N: g(270, ln(34, 380, 34, 20), [ln(56, 36, 214, 364), true], ln(236, 380, 236, 20)),
  O: g(260, O_ARCS[0], O_ARCS[1], [O_ARCS[2], true], O_ARCS[3]),
  P: g(250, ln(34, 20, 34, 196), ln(34, 204, 34, 380), `M 58 20 L 140 20 C 196 20 228 56 228 108`, [`M 228 108 C 228 160 196 196 140 196 L 58 196`, true]),
  Q: g(270, O_ARCS[0], O_ARCS[1], O_ARCS[2], O_ARCS[3], [ln(160, 300, 246, 400), true]),
  R: g(260, ln(34, 20, 34, 196), ln(34, 204, 34, 380), `M 58 20 L 140 20 C 196 20 228 56 228 108 C 228 160 196 196 140 196 L 58 196`, [ln(128, 210, 230, 380), true]),
  S: g(260, `M 228 92 C 214 44 176 20 130 20`, `M 130 20 C 72 20 34 54 34 104`, `M 34 104 C 34 156 78 178 130 196`,
    [`M 130 196 C 186 214 228 240 228 296`, true], `M 228 296 C 228 348 186 380 130 380`, `M 130 380 C 80 380 42 356 30 306`),
  T: g(260, ln(20, 20, 126, 20), [ln(134, 20, 240, 20), true], ln(130, 44, 130, 200), ln(130, 208, 130, 380)),
  U: g(260, ln(34, 20, 34, 250), [`M 34 250 C 34 336 74 380 130 380 C 186 380 226 336 226 250`, true], ln(226, 250, 226, 20)),
  V: g(260, ln(30, 20, 80, 200), ln(80, 200, 130, 380), ln(130, 380, 180, 200), [ln(180, 200, 230, 20), true]),
  W: g(340, ln(20, 20, 94, 380), ln(94, 380, 170, 110), [ln(170, 110, 246, 380), true], ln(246, 380, 320, 20)),
  X: g(260, ln(32, 20, 130, 200), ln(130, 200, 228, 380), [ln(228, 20, 32, 380), true]),
  Y: g(260, ln(30, 20, 130, 200), [ln(230, 20, 130, 200), true], ln(130, 216, 130, 380)),
  Z: g(260, ln(36, 20, 224, 20), [ln(220, 40, 40, 360), true], ln(36, 380, 226, 380)),
  '0': g(260, O_ARCS[0], O_ARCS[1], [O_ARCS[2], true], O_ARCS[3]),
  '1': g(170, [ln(110, 20, 44, 84), true], ln(110, 20, 110, 196), ln(110, 204, 110, 380)),
  '2': g(260, `M 38 100 C 38 50 80 20 130 20 C 186 20 222 56 222 108`, [`M 222 108 C 222 172 160 226 40 380`, true], ln(40, 380, 228, 380)),
  '3': g(260, `M 38 70 C 58 36 92 20 130 20 C 182 20 216 52 216 104 C 216 160 176 194 118 194`, [`M 118 206 C 186 206 226 240 226 296 C 226 350 186 380 130 380 C 88 380 54 362 34 326`, true]),
  '4': g(270, ln(184, 20, 30, 270), [ln(30, 270, 244, 270), true], ln(184, 110, 184, 380)),
  '5': g(260, ln(216, 20, 58, 20), ln(50, 20, 42, 178), [`M 42 178 C 76 160 106 154 130 154 C 190 154 226 200 226 266 C 226 336 186 380 126 380 C 84 380 50 360 34 326`, true]),
  '6': g(260, `M 210 58 C 192 32 164 20 130 20 C 72 20 34 92 34 236`, join2(ell(130, 290, 96, 90)[1], ell(130, 290, 96, 90)[2]), [join2(ell(130, 290, 96, 90)[3], ell(130, 290, 96, 90)[0]), true]),
  '7': g(260, ln(34, 20, 226, 20), [ln(222, 40, 98, 380), true]),
  '8': g(260, join2(ell(130, 108, 84, 88)[3], ell(130, 108, 84, 88)[0]), join2(ell(130, 108, 84, 88)[1], ell(130, 108, 84, 88)[2]),
    join2(ell(130, 290, 96, 90)[3], ell(130, 290, 96, 90)[0]), [join2(ell(130, 290, 96, 90)[1], ell(130, 290, 96, 90)[2]), true]),
  '9': g(260, join2(ell(130, 110, 96, 90)[3], ell(130, 110, 96, 90)[0]), join2(ell(130, 110, 96, 90)[1], ell(130, 110, 96, 90)[2]),
    [`M 226 110 C 226 290 186 380 126 380 C 88 380 58 362 44 330`, true]),
  '%': g(300, join2(ell(76, 92, 52, 72)[0], ell(76, 92, 52, 72)[1]) + ' ' + join2(ell(76, 92, 52, 72)[2], ell(76, 92, 52, 72)[3]).replace(/^M [^C]*/, ''),
    [ln(250, 20, 50, 380), true], join2(ell(224, 308, 52, 72)[0], ell(224, 308, 52, 72)[1]) + ' ' + join2(ell(224, 308, 52, 72)[2], ell(224, 308, 52, 72)[3]).replace(/^M [^C]*/, '')),
  '+': g(260, ln(130, 90, 130, 310), [ln(30, 200, 230, 200), true]),
  '-': g(200, [ln(30, 210, 170, 210), true]),
  '!': g(110, ln(55, 20, 55, 280), [ln(55, 366, 55, 372), true]),
  '.': g(100, [ln(50, 366, 50, 372), true]),
  '/': g(220, [ln(200, 20, 20, 380), true]),
};
// Ơ / Ư 的"角"：右上角向外的小钩
const HORN: Record<string, string> = {
  O: `M 214 74 C 244 66 258 44 252 12`,
  U: `M 226 44 C 254 40 268 22 264 -8`,
};

// 越南语声调 / 附加符号（组合字符）→ 一根独立灯管，cx = 字中线，lv = 叠放层（0 紧贴字顶，1 再上一层）
const markPath = (m: string, cx: number, lv: number): string | null => {
  const y = -26 - lv * 84; // 该层底沿
  switch (m) {
    case '́': return ln(cx - 14, y, cx + 30, y - 62); // sắc
    case '̀': return ln(cx + 14, y, cx - 30, y - 62); // huyền
    case '̉': return `M ${cx - 22} ${y - 52} C ${cx - 14} ${y - 76} ${cx + 28} ${y - 76} ${cx + 28} ${y - 50} C ${cx + 28} ${y - 30} ${cx + 2} ${y - 32} ${cx + 2} ${y - 8}`; // hỏi
    case '̃': return `M ${cx - 52} ${y - 18} C ${cx - 36} ${y - 58} ${cx - 14} ${y - 58} ${cx} ${y - 36} C ${cx + 14} ${y - 14} ${cx + 36} ${y - 14} ${cx + 52} ${y - 54}`; // ngã
    case '̂': return `M ${cx - 62} ${y} L ${cx} ${y - 56} L ${cx + 62} ${y}`; // mũ
    case '̆': return `M ${cx - 58} ${y - 56} C ${cx - 50} ${y + 4} ${cx + 50} ${y + 4} ${cx + 58} ${y - 56}`; // trăng
    default: return null;
  }
};

type Built = { segs: { d: string; tx: number; key: boolean; letter: number }[]; width: number; top: number; bottom: number };
const buildWord = (word: string): Built => {
  const segs: Built['segs'] = [];
  let x = 0;
  let top = 0;
  let bottom = LH;
  let letter = 0;
  const chars = Array.from(word.normalize('NFC').toUpperCase());
  chars.forEach((ch) => {
    if (/\s/.test(ch)) {
      x += SPACE;
      return;
    }
    const isD = ch === 'Đ';
    const nfd = isD ? 'Đ' : ch.normalize('NFD');
    const base = isD ? 'Đ' : nfd[0];
    const marks = isD ? [] : Array.from(nfd.slice(1));
    const gl = GLYPHS[base];
    if (!gl) {
      x += SPACE;
      return;
    }
    const keyIdx = Math.max(0, gl.segs.findIndex((s) => s.key));
    gl.segs.forEach((s, i) => segs.push({ d: s.d, tx: x, key: i === keyIdx, letter }));
    if (marks.includes('̛') && HORN[base]) segs.push({ d: HORN[base], tx: x, key: false, letter });
    const cx = gl.w / 2;
    let lv = 0;
    for (const m of ['̂', '̆', '́', '̀', '̉', '̃']) {
      if (!marks.includes(m)) continue;
      const d = markPath(m, cx, lv);
      if (d) {
        segs.push({ d, tx: x, key: false, letter });
        top = Math.min(top, -26 - lv * 84 - 80);
        lv++;
      }
    }
    if (marks.includes('̣')) {
      segs.push({ d: ln(cx, 444, cx, 450), tx: x, key: false, letter }); // nặng
      bottom = Math.max(bottom, 470);
    }
    x += gl.w + GAP;
    letter++;
  });
  return { segs, width: Math.max(1, x - GAP), top, bottom };
};

const FIRST = 12;
const SPAN = 60; // 乱序段起点分布在 12–72
const KEY_AT = [86, 93, 99]; // 屏息 14f 后的三拍
const STRIKE = 7; // 单根起辉时长
const REVEAL = KEY_AT[2] + 6; // 105
const rnd = (s: number) => {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// 乱序表：钥匙段 = 首 / 中 / 末字母的钥匙笔画（左→右压到最后三拍）；其余段确定性洗牌，相邻尽量不同字母（读不出）
const schedule = (b: Built): number[] => {
  const nLetters = b.segs.reduce((m, s) => Math.max(m, s.letter + 1), 0);
  const keyLetters = nLetters >= 3 ? [0, Math.floor((nLetters - 1) / 2), nLetters - 1] : Array.from({ length: nLetters }, (_, i) => i);
  const uniq = Array.from(new Set(keyLetters));
  const keySegs = uniq.map((l) => b.segs.findIndex((s) => s.letter === l && s.key)).filter((i) => i >= 0);
  const pool = b.segs.map((_, i) => i).filter((i) => !keySegs.includes(i));
  pool.sort((a, c) => rnd(a * 3.7 + 1) - rnd(c * 3.7 + 1));
  for (let i = 1; i < pool.length; i++) {
    if (b.segs[pool[i]].letter === b.segs[pool[i - 1]].letter) {
      const j = pool.findIndex((p, k) => k > i && b.segs[p].letter !== b.segs[pool[i - 1]].letter);
      if (j > 0) [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  const starts = new Array<number>(b.segs.length).fill(0);
  pool.forEach((si, rank) => (starts[si] = FIRST + stagger(rank, pool.length, SPAN, EASE.out)));
  keySegs.forEach((si, k) => (starts[si] = KEY_AT[KEY_AT.length - keySegs.length + k]));
  return starts;
};

// 霓虹起辉：亮—灭—亮—半亮—亮 → 稳在 0.58（揭晓后到 1）
const strike = (f: number, s: number) =>
  interpolate(f, [s, s + 1, s + 2, s + 3, s + 4, s + 5, s + STRIKE], [0, 1, 0.12, 0.95, 0.4, 1, 0.58], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

// 确定性"电流嗡动"：极小的亮度起伏（每根相位不同）
const hum = (f: number, i: number) => 1 + 0.035 * Math.sin(f * 0.9 + i * 2.3) * Math.sin(f * 0.37 + i);

// 揭晓的"泛光一次"不另画光斑，而是让灯牌自己的宽泛光随电流涌起一下（形状就是字，Q4 只给主角）
const Sign: React.FC<{ frame: number; surge: number; reveal: number; idPrefix: string; b: Built; starts: number[]; ox: number; oy: number; s: number; W: number; H: number }> = ({
  frame, surge, reveal, idPrefix, b, starts, ox, oy, s, W, H,
}) => {
  const GLOW = L.accent2; // 泛光
  const lit = b.segs.map((seg, i) => {
    const st = starts[i];
    if (frame < st) return null; // 未亮段不渲染（真静止 / 不泄底）
    const br = strike(frame, st);
    const settled = frame >= st + STRIKE;
    const level = settled ? 0.58 + 0.42 * reveal : br;
    return { i, d: seg.d, tx: seg.tx, b: level * (settled ? hum(frame, i) : 1) * (1 + 0.25 * surge) };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  // 电极缝：每根灯管两端各留 4% 不画
  const dash = { pathLength: 1, strokeDasharray: '0.92 1', strokeDashoffset: -0.04 } as const;
  return (
    <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <defs>
        <filter id={`${idPrefix}w`} x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="22" /></filter>
        <filter id={`${idPrefix}n`} x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <g transform={`translate(${ox} ${oy}) scale(${s})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 宽泛光（墙上的光晕） */}
        <g filter={`url(#${idPrefix}w)`}>
          {lit.map((q) => <path key={q.i} transform={`translate(${q.tx} 0)`} d={q.d} stroke={GLOW} strokeWidth={SW + 46} opacity={Math.min(1, 0.4 * q.b + 0.4 * surge)} {...dash} />)}
        </g>
        {/* 近泛光（灯管周围的辉） */}
        <g filter={`url(#${idPrefix}n)`}>
          {lit.map((q) => <path key={q.i} transform={`translate(${q.tx} 0)`} d={q.d} stroke={TUBE} strokeWidth={SW + 12} opacity={Math.min(1, 0.75 * q.b)} {...dash} />)}
        </g>
        {/* 灯管本体 + 白热芯 */}
        {lit.map((q) => <path key={q.i} transform={`translate(${q.tx} 0)`} d={q.d} stroke={TUBE} strokeWidth={SW} opacity={Math.min(1, 0.35 + 0.65 * q.b)} {...dash} />)}
        {lit.map((q) => <path key={q.i} transform={`translate(${q.tx} 0)`} d={q.d} stroke={CORE} strokeWidth={SW * 0.32} opacity={Math.min(1, q.b)} {...dash} />)}
      </g>
    </svg>
  );
};

export const StrokeSegmentBuild: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const word = useText('word', 'LIVE');
  const sub = useText('subtitle', 'TỐI NAY 20:00 · ĐỪNG BỎ LỠ');
  const GLOW = L.accent2;
  // [Agent Edit] nen anh AI: khong ve tuong / quang tuong / san / bong phan chieu (gia dinh co san toi) — chi con bien neon
  const bd = useBackdrop();

  const b = React.useMemo(() => buildWord(word), [word]);
  const starts = React.useMemo(() => schedule(b), [b]);
  // 版式：横版字高 400、字心 y=390（原版 SHIP 的位置），超宽就整块缩小；竖版放大到 1.36 倍
  const maxW = portrait ? 1700 : 1640;
  const s = Math.min(portrait ? 1.36 : 1, maxW / b.width);
  const capH = LH * s;
  const cy = portrait ? Math.round(SH * 0.42) : 390 + Math.max(0, (-b.top - 130) * s); // 叠放的声调高出字顶时整块下移
  const OY = cy - capH / 2;
  const OX = (1920 - b.width * s) / 2;
  const signBottom = OY + Math.max(LH, b.bottom) * s;
  const FLOOR = portrait ? Math.round(signBottom + 250) : 780; // 墙与地面交线
  const subTop = portrait ? signBottom + 70 : signBottom + 62;

  const litCount = starts.reduce((n, st) => n + (frame >= st + 1 ? 1 : 0), 0);
  // 揭晓：灯管 0.58 → 1；电流涌起（冲到 1.25 再回落）
  const reveal = ramp(frame, REVEAL, 8, EASE.snappy);
  const surge = interpolate(frame, [REVEAL, REVEAL + 3, REVEAL + 22], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out });
  const pulse = 1 + 0.02 * surge;
  const ambient = 0.12 + 0.5 * (litCount / Math.max(1, b.segs.length)) + 0.35 * reveal + 0.3 * surge; // 墙面受光
  const push = 1 + 0.035 * ramp(frame, 0, STROKE_SEGMENT_BUILD_DURATION, EASE.smooth);
  const kicker = ramp(frame, REVEAL + 8, 16, EASE.out);

  // 副题：品牌字标 ● 副句（宽字距）；整行缩到一行内
  const brand = BRAND.name;
  const subSize0 = portrait ? 66 : 32;
  const subLine = `${brand ? brand + '   ●   ' : ''}${sub}`;
  const subSize = fitSize(subLine, { family: fonts.sans, size: subSize0, maxWidth: portrait ? 1680 : 1600, weight: 600, minSize: subSize0 * 0.5, letterSpacingEm: 0.2 });
  const glowK = Math.max(1, s);

  const signLayer = (id: string) => (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${pulse})`, transformOrigin: `960px ${cy}px` }}>
      <Sign frame={frame} surge={surge} reveal={reveal} idPrefix={id} b={b} starts={starts} ox={OX} oy={OY} s={s} W={1920} H={SH} />
    </div>
  );

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[2] }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '50% 45%' }}>
        <Stage look={L} keyLight={{ x: 0.5, y: 0.0 }} fill={null} intensity={0.35} vignette={0.7} />
        {/* 墙面：灯牌照亮的一团粉紫光（随点亮数增长） */}
        {!bd && <>
        <div style={{
          position: 'absolute', left: 960 - 800 * glowK, top: cy - 430 * glowK, width: 1600 * glowK, height: 960 * glowK, opacity: Math.min(1, ambient),
          background: `radial-gradient(ellipse 50% 46% at 50% 46%, ${alpha(GLOW, 0.28)} 0%, ${alpha(L.light, 0.12)} 45%, ${alpha(L.light, 0)} 72%)`,
        }} />
        {/* 地面：更深一档 + 交线处一条受光带 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: FLOOR, bottom: 0, background: `linear-gradient(180deg, ${alpha('#05030a', 0.55)} 0%, ${alpha('#05030a', 0.85)} ${portrait ? 40 : 100}%, ${alpha('#05030a', 0.92)} 100%)` }} />
        <div style={{
          position: 'absolute', left: 260, width: 1400, top: FLOOR - 40, height: 120, opacity: Math.min(1, ambient * 0.9),
          background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(GLOW, 0.3)} 0%, ${alpha(GLOW, 0)} 70%)`,
        }} />

        {/* 地面倒影：灯牌沿地面交线镜像、模糊、渐隐 */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 1920, height: SH, transform: `translateY(${2 * FLOOR}px) scaleY(-1)`, transformOrigin: '0 0', opacity: 0.42,
          filter: 'blur(5px)', // 遮罩在镜像前的本地坐标里：本地 y≥FLOOR 会翻到墙上，必须全透明；越往上（离地越远）越淡
          WebkitMaskImage: `linear-gradient(180deg, transparent ${FLOOR - (portrait ? 560 : 340) * glowK}px, rgba(0,0,0,0.9) ${FLOOR - 40}px, #000 ${FLOOR - 1}px, transparent ${FLOOR}px)`,
        }}>
          {signLayer('ssbr')}
        </div>
        </>}

        {/* 灯牌 */}
        {signLayer('ssb')}

        {/* 揭晓后的副题：只在落位之后出现 */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: subTop, textAlign: 'center', fontFamily: FONT.sans, whiteSpace: 'nowrap',
          fontSize: subSize, fontWeight: 600, letterSpacing: '0.2em', color: L.ink2, opacity: kicker, lineHeight: 1.4,
          textShadow: bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined,
          transform: `translateY(${((1 - kicker) * 14).toFixed(2)}px)`,
        }}>
          {brand ? (
            <>
              <span style={{ fontFamily: BRAND.font, fontWeight: 700, letterSpacing: '0.06em', color: L.ink }}>{brand}</span>
              <span style={{ color: TUBE, margin: '0 0.5em 0 0.8em' }}>●</span>
            </>
          ) : null}
          {sub}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
