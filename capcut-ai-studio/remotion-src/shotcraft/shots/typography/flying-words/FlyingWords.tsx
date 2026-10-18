// flying-words — 词语纵深隧道：关键词在远处纵深生成，沿 z 轴向相机飞来擦身而过，透明度按
// [0,1,0.5,0.2,0] 生命周期曲线变化；相机不动、元素动，spawn 完全确定性、跑满 2 整圈首尾无缝。
//
// 第二轮重设计（深蓝夜 · 光速隧道 + 前景字标）：
// - look = midnight（深蓝黑 · 电光蓝）。按 1920×1080 原生作画（不再 480×270 放大），透视手算
//   s = P/(P−z)（P=4400，z −7000→+3200，与 CSS perspective 逐点等价），所以每个元素都能按屏幕速度做效果。
// - 三层纵深：① 隧道壁——10 道扁椭圆发丝环同速朝镜头推进（隧道的"结构"，近处变粗变淡出画）；
//   ② 光速流线——56 粒尘埃画成沿径向拉长的线段（长度 = 本帧屏幕位移，越近越长），速度感的主力；
//   ③ 22 个产品能力关键词：黄金角铺位、远小近大、远端大气雾失焦、近端按速度沿运动方向拖出 6 层渐虚残影
//   （text-shadow 方向拖尾，比全屏 SVG 滤镜便宜得多）+ 冲到眼前时失焦。
// - 字的层次：冷白三阶 sans 700 为主，6 个关键词用衬线斜体，4 个强调词电光蓝带泛光（光只给强调词）。
// - 隧道尽头：中心电光蓝光晕按 2 次/片呼吸（与 CYCLES 对齐），整条隧道以 sin(2πt) 极缓滚转 ±2.5°，
//   画面无一刻静止但不晃（滚转是周期的，首尾一致）。
// - 前景：中段生命曲线压到 0.5 就是为前景让位——demo 在正中压一组静态字标（mono 眉题 + 112px 标题 +
//   一层径向暗幕；飞进字标椭圆区的词压到 20%），证明隧道作背景层不打架；字标静止 = 循环无缝。
// - 品牌：眉题 = 视频品牌标志（有则显示）+ 眉题小字，标题 = 前景主句。
//
// 时间轴：t = frame / DURATION（末帧的下一帧 = 第 0 帧，真正无缝 loop）；CYCLES = 2 整圈。
//   每个元素 u = (t·CYCLES + 相位) mod 1：0 远处生成 → 0.25 亮到满 → 0.6 压到半透 → 1 擦身出画。
//
// [Agent Edit] o chu: words (danh sach tu khoa 6-22 tu; it hon 22 thi lap lai de giu mat do 22 vi tri — tham so i/N
// khong doi), kicker (dong nho tren tieu de), title (cau tien canh). Tu tieng Viet rong hon -> co chu tung tu bi gioi han
// theo be ngang do that. Khung doc (portrait.mode = 'native'): tam duong ham dat giua khung that, elip duong ham keo DOC
// (he so y 0.6 -> 1.75), chu to hon, tieu de tu xuong dong <= 3 dong; vung che (tu bay qua bi mo 20%) theo khoi tieu de that.
import { useBrand, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FONT } from '../../../fixtures/Polish';
import { LOOKS, SERIF, Stage, alpha } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const FLYING_WORDS_DURATION = 180; // 6000ms @30fps

const L = LOOKS.midnight;
const CYCLES = 2; // 整数圈 → 首尾一致

// 关键词表：词数固定 22 个位置（相位 i/N 均分），实际词少于 22 时循环填满
const SAMPLE_WORDS = ['Dòng thời gian', 'Khung hình', 'Chuyển động', 'Máy quay', 'Chiều sâu', 'Thị sai', 'Nhòe động', 'Nhịp điệu',
  'Lớp ảnh', 'Kịch bản', 'Chữ viết', 'Ánh sáng', 'Hạt phim', 'Âm thanh', 'Bắt nhịp', 'Hiệu ứng',
  'Chuyển cảnh', 'Màu sắc', 'Bố cục', 'Giọng đọc', 'Phân cảnh', 'Góc quay'];
const N = 22;
const ACCENT = new Set([3, 7, 12, 19]);
const SERIF_IDX = new Set([1, 5, 10, 14, 17, 21]);
const INKS = ['#f2f5ff', '#c3cbe2', '#8a95b5'];

const P = 4400; // 透视距离
const Z0 = -7000;
const Z1 = 3200;
const CX = 960;

const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const SLOTS = Array.from({ length: N }, (_, i) => {
  // 黄金角铺开 + 半径避开正中（近处不堆成一团）
  const a = i * 2.39996 + rand(i * 7 + 1) * 0.8;
  const r = 330 + rand(i * 13 + 2) * 660;
  const accent = ACCENT.has(i);
  return {
    accent, serif: SERIF_IDX.has(i),
    size: 64 + rand(i + 3) * 56,
    color: accent ? '#86a8ff' : INKS[Math.floor(rand(i + 5) * 3)],
    x: Math.cos(a) * r, y: Math.sin(a) * r, rz: (rand(i + 21) - 0.5) * 12, ph: i / N,
  };
});

const DUST = Array.from({ length: 56 }, (_, i) => {
  const a = i * 2.39996 + rand(i * 5 + 77) * 1.2;
  const r = 180 + rand(i * 3 + 91) * 1500;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, ph: rand(i * 9 + 13), w: 1 + rand(i + 50) * 1.6 };
});

const RINGS = Array.from({ length: 10 }, (_, k) => ({ ph: k / 10 }));

// 生命周期透明曲线 [0,1,0.5,0.2,0] @ [0,0.25,0.6,0.85,1]，分段线性
const OP = [0, 1, 0.5, 0.2, 0];
const OT = [0, 0.25, 0.6, 0.85, 1];
const curve = (u: number) => {
  for (let k = 0; k < 4; k++) {
    if (u <= OT[k + 1]) return OP[k] + ((OP[k + 1] - OP[k]) * (u - OT[k])) / (OT[k + 1] - OT[k]);
  }
  return 0;
};

export const FlyingWords: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const CY = SH / 2;
  const YK = portrait ? 1.75 : 0.6; // 隧道截面纵横比：横版扁椭圆，竖版拉成竖椭圆
  const WS = portrait ? 1.3 : 1; // 竖版词整体放大
  const words = useList('words', SAMPLE_WORDS).map((w) => w.trim()).filter(Boolean);
  const list = words.length ? words : SAMPLE_WORDS;
  const kicker = useText('kicker', 'BỘ CÔNG CỤ DỰNG PHIM');
  const title = useText('title', 'Mọi thứ bạn cần cho một thước phim.');

  // z 线性推进；drift = 0.5 + u·1.35（远处收拢、越近越向外散开）；roll = 整条隧道的滚转角
  const project = (x: number, y: number, u: number, roll: number, drift = true) => {
    const z = Z0 + (Z1 - Z0) * u;
    const d = drift ? 0.5 + u * 1.35 : 1;
    const s = P / (P - z);
    const c = Math.cos(roll), sn = Math.sin(roll);
    const yy = y * YK;
    const rx = x * c - yy * sn, ry = x * sn + yy * c;
    return { sx: CX + rx * d * s, sy: CY + ry * d * s, s };
  };

  // 每个位置的词 + 字号（越南语词更宽：按实测宽度把字号封顶，近处不至于占满画面）
  const ITEMS = SLOTS.map((sl, i) => {
    const text = list[i % list.length];
    const fam = sl.serif ? fonts.serif : fonts.sans;
    const size0 = sl.size * WS;
    const w = measureText(text, fam, size0, sl.serif ? 500 : 700, sl.serif);
    const cap = 620 * WS;
    return { ...sl, text, size: w > cap ? size0 * (cap / w) : size0 };
  });

  // 前景标题：横版 112px ≤2 行；竖版 ~200px ≤3 行
  const tMax = portrait ? 1680 : 1560;
  const tBase = portrait ? 200 : 112;
  let tSize = tBase;
  let tLines = wrapLines(title, fonts.sans, tSize, tMax, 700, portrait ? 3 : 2);
  while (tLines.length > 1 && tSize > tBase * 0.55 && tLines.some((l) => measureText(l, fonts.sans, tSize, 700) > tMax)) {
    tSize = Math.round(tSize * 0.92);
    tLines = wrapLines(title, fonts.sans, tSize, tMax, 700, portrait ? 3 : 2);
  }
  tSize = Math.min(tSize, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tSize, maxWidth: tMax, weight: 700, minSize: tBase * 0.4, letterSpacingEm: -0.045 })));
  // 行长均衡：保持行数不变时取最窄的折行宽度（避免末行只剩一个词）
  if (tLines.length > 1) {
    for (let w = tMax - 40; w > tMax * 0.45; w -= 40) {
      const alt = wrapLines(title, fonts.sans, tSize, w, 700, 9);
      if (alt.length > tLines.length) break;
      tLines = alt;
    }
  }
  const tLH = Math.round(tSize * 1.14);
  const kSize = portrait ? 44 : 30;
  const blockW = Math.min(tMax, Math.max(...tLines.map((l) => measureText(l, fonts.sans, tSize, 700))));
  const blockH = tLines.length * tLH + (kicker ? kSize * 1.3 + 24 : 0);
  // 字标遮挡椭圆（半轴）：随标题块实际大小
  const OX = Math.max(420, blockW / 2 + 140);
  const OY = Math.max(190, blockH / 2 + 70);

  const t = frame / FLYING_WORDS_DURATION;
  const roll = (2.5 * Math.PI / 180) * Math.sin(t * Math.PI * 2);
  const du = CYCLES / FLYING_WORDS_DURATION; // 每帧 u 的增量
  const glowB = 0.82 + 0.14 * Math.sin(t * Math.PI * 4);
  const GW = 1040, GH = 720 * (portrait ? 2.2 : 1);

  return (
    <AbsoluteFill>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.5 }} fill={null} intensity={0.5} vignette={0.7} grain={0.08}>
        {/* 隧道尽头光晕：呼吸 2 次/片，与 CYCLES 对齐 */}
        <div style={{
          position: 'absolute', left: CX - GW / 2, top: CY - GH / 2, width: GW, height: GH, borderRadius: '50%', opacity: glowB,
          background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.light, 0.42)} 0%, ${alpha(L.light, 0.12)} 38%, ${alpha(L.light, 0)} 70%)`,
        }} />
      </Stage>

      {/* ① 隧道壁 + ② 光速流线（一张 SVG） */}
      <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0 }}>
        {RINGS.map((rg, k) => {
          const u = (t * CYCLES + rg.ph) % 1;
          const p = project(0, 0, u, roll, false);
          const rx = 1150 * p.s;
          const op = Math.min(1, u / 0.3) * (1 - Math.min(1, Math.max(0, (u - 0.55) / 0.3)));
          if (op <= 0.01) return null;
          return (
            <ellipse key={`r${k}`} cx={CX} cy={CY} rx={rx} ry={rx * YK} fill="none"
              stroke={L.accent} strokeOpacity={op * 0.16} strokeWidth={1 + p.s * 0.8}
              transform={`rotate(${(roll * 180) / Math.PI} ${CX} ${CY})`} />
          );
        })}
        {DUST.map((d, i) => {
          const u = (t * CYCLES + d.ph) % 1;
          const u0 = Math.max(0, u - du * 2.6);
          const a = project(d.x, d.y, u0, roll);
          const b = project(d.x, d.y, u, roll);
          const op = curve(u) * 0.75;
          if (op <= 0.01) return null;
          return (
            <line key={`d${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#cfdcff" strokeOpacity={op}
              strokeWidth={d.w * Math.min(2.4, b.s)} strokeLinecap="round" />
          );
        })}
      </svg>

      {/* ③ 关键词：远端雾、中段清晰、近端方向拖尾 + 失焦 */}
      {ITEMS.map((it, i) => {
        const u = (t * CYCLES + it.ph) % 1;
        const p = project(it.x, it.y, u, roll);
        const q = project(it.x, it.y, Math.max(0, u - du), roll);
        const vx = p.sx - q.sx, vy = p.sy - q.sy; // 屏幕速度 px/帧
        // 前景字标区（椭圆）里的词压到 20%：像被暗幕遮住，不和标题打架
        const k = ((p.sx - CX) / OX) ** 2 + ((p.sy - CY) / OY) ** 2;
        const occl = k < 1 ? 0.2 + 0.8 * k * k : 1;
        const op = curve(u) * occl;
        if (op <= 0.005) return null;
        const fog = u < 0.22 ? (1 - u / 0.22) * 2.2 : 0;
        const near = u > 0.86 ? (u - 0.86) * 60 : 0;
        const blur = fog + near;
        const sp = Math.hypot(vx, vy);
        const trail = sp > 6
          ? [1, 2, 3, 4, 5, 6].map((j) => {
            const k = (j / 6) * 0.9 / p.s;
            return `${(-vx * k).toFixed(1)}px ${(-vy * k).toFixed(1)}px ${(j * 0.8).toFixed(1)}px ${alpha(it.color, 0.2 - j * 0.026)}`;
          }).join(', ')
          : '';
        const glowS = it.accent ? `0 0 18px ${alpha(L.accent, 0.55)}, 0 0 48px ${alpha(L.accent, 0.3)}` : '';
        return (
          <div key={i} style={{
            position: 'absolute', left: p.sx, top: p.sy, whiteSpace: 'nowrap', lineHeight: 1.25,
            transform: `translate(-50%,-50%) scale(${p.s.toFixed(4)}) rotate(${it.rz + (roll * 180) / Math.PI}deg)`,
            fontFamily: it.serif ? SERIF : FONT.sans, fontStyle: it.serif ? 'italic' : undefined,
            fontWeight: it.serif ? 500 : 700, fontSize: it.size, letterSpacing: it.serif ? '-0.01em' : '-0.03em',
            color: it.color, opacity: op,
            textShadow: [glowS, trail].filter(Boolean).join(', ') || undefined,
            filter: blur > 0.05 ? `blur(${(blur / Math.max(0.6, p.s)).toFixed(2)}px)` : undefined,
          }}>
            {it.text}
          </div>
        );
      })}

      {/* 前景字标：静态（循环无缝），一层极淡径向暗幕把它和隧道分开 */}
      <div style={{
        position: 'absolute', left: CX - OX * 1.0, top: CY - OY * 1.37, width: OX * 2, height: OY * 2.74, borderRadius: '50%',
        background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha('#04060d', 0.7)} 0%, ${alpha('#04060d', 0.38)} 45%, ${alpha('#04060d', 0)} 72%)`,
      }} />
      <div style={{ position: 'absolute', left: 0, width: 1920, top: CY - blockH / 2, textAlign: 'center' }}>
        {kicker ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, height: kSize * 1.3,
            fontFamily: FONT.sans, fontWeight: 600, fontSize: kSize, letterSpacing: '0.24em', color: L.accent, marginBottom: 24, whiteSpace: 'nowrap',
          }}>
            {brand ? <ShotcraftMark size={kSize * 1.4} tone="dark" /> : null}
            <span>{kicker.toUpperCase()}</span>
          </div>
        ) : null}
        {tLines.map((l, i) => (
          <div key={i} style={{
            fontFamily: FONT.sans, fontSize: tSize, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: `${tLH}px`, color: L.ink, whiteSpace: 'nowrap',
            textShadow: `0 4px 40px ${alpha('#000', 0.6)}`,
          }}>
            {l}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
