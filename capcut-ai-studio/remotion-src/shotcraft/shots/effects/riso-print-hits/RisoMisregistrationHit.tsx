// 套印错位冲击帧（riso-misregistration-hit）——标题撞停瞬间裂成两份单色"印版"
// （mix-blend-mode: multiply 叠在纸上），像 riso 印刷没对准版；两版反向错位（x 为主 y 少量）
// 做衰减震荡 offset = A·cos(ωt)·exp(-t/τ) 抖两下，帧 72 啪地硬切回套准，带 4f scale 脉冲收束。
//
// 第二轮重设计（双色 riso 演出海报 · 荧光粉 × 蓝）：
// - 配色 custom：再生新闻纸 #f3eee2 + riso 两色油墨——荧光粉 FLUO #ff4fa3 与 蓝 BLUE #1f5fc4。
//   两版套准时 multiply 叠成深紫墨色（同一字形两版重合），错开时一侧粉、一侧蓝的彩边——经典 riso 毛边。
// - 版式：瑞士网格海报。左对齐 300px 黑体标题压在右侧一只半调网点大太阳上（粉版，点径随离心距离变小 = 真半调），
//   顶部版记、底部三栏卖点信息（蓝版）。只有标题两版会错，背景元素保持套准（整画面全裂读作故障而非印刷）。
// - 节奏：开场太阳像被墨辊滚上纸（自上而下的擦入 0–16f）、信息栏错峰落位 → 标题 8f ease-in 撞入
//   → 命中同帧裂版 + 整页一记 1.2% 的顿挫 → 44f 衰减震荡 → 72f 硬切套准 + 圆章盖下 → 44f 干净 hold（极缓推进）。
//
// 时间表（30fps，共 120f）：
//   0–18    预备：纸面、版记第 1 帧就在；太阳墨辊擦入 0–16f；底部信息栏 4–18f 错峰升起
//   20–28   主动作：标题从右画外 ease-in(cubic) 撞入（速度方向性模糊），28f 命中
//   28–71   余波：两版反向衰减震荡（周期 18f、τ 60f，72f 前仍余 ~11px 单版残差）
//   72–76   套准：硬切归零 + 4f scale 1.03→1；圆章 72f 盖下（scale 1.5→1，4f）
//   76–120  hold 44f：相机 smooth 极缓推进 1.000→1.012（~110f 收敛），尾段逐帧近乎相同
//
// [Agent Edit] o chu: title (tieu de lon, tu xuong dong CAN BANG 1-3 dong, co chu lon nhat vua khung; gian dong 1.12 cho dau
// chong tang tieng Viet) / kicker (ban ghi goc trai) / items + notes (2-3 cot thong tin) / stamp (chu vong tron con dau).
// Tam con dau: logo thuong hieu (neu co) / chu viet tat / dau tick. Bien do lech ban theo co chu (>= 16px moi ban, the: 20/8 @300px).
// Khung doc (native): mat troi to goc tren phai, con dau tren mat troi, tieu de giua, thong tin xep hang doc o duoi.
import { useBackdrop, useBrand, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText } from '../../../runtime';
import React from 'react';

import { EASE, Grain, SpeedBlur, Vignette, bezier, mix, ramp, velocity } from '../../../fixtures/Polish';

export const RISO_MISREGISTRATION_HIT_DURATION = 120;

const HIT = 28; // 撞停命中帧
const SNAP = 72; // 套准合一帧
const OMEGA = (2 * Math.PI) / 18; // 震荡周期 18f，44f 内抖两下半
const TAU = 60; // 缓衰减：帧 72 前仍余可见残差，被"啪地"硬切归零

const PAPER = '#f3eee2'; // 再生新闻纸
const FLUO = '#ff4fa3'; // riso 荧光粉版
const BLUE = '#1f5fc4'; // riso 蓝版
const inCubic = bezier(0.55, 0.055, 0.675, 0.19);
const TITLE_LH = 1.12; // 越南语叠放声调：行距 ≥ 1.1

// 单色印版：同字形、可调色、可错位，multiply 叠到纸上
const Plate: React.FC<{ color: string; dx: number; dy: number; scale?: number; lines: string[]; size: number; x: number; y: number; family: string; shadow?: string }> = ({
  color, dx, dy, scale = 1, lines, size, x, y, family, shadow,
}) => (
  <div style={{
    position: 'absolute', left: x, top: y,
    transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale})`, transformOrigin: '30% 60%',
    mixBlendMode: 'multiply', color, fontFamily: family, fontWeight: 900, fontSize: size, lineHeight: TITLE_LH,
    letterSpacing: '-0.045em', whiteSpace: 'nowrap', textShadow: shadow,
  }}>
    {lines.map((l, i) => <div key={i}>{l}</div>)}
  </div>
);

// 半调网点太阳：粉版，点按网格排布，点径随离心距离缩小（真半调，而非等大点阵）
const SUN_R = 372;
const SUN_STEP = 22;
const SUN_DOTS = (() => {
  const out: { x: number; y: number; r: number }[] = [];
  const n = Math.ceil(SUN_R / SUN_STEP);
  for (let iy = -n; iy <= n; iy++) {
    for (let ix = -n; ix <= n; ix++) {
      // 45° 网角：奇数行错半格
      const x = ix * SUN_STEP + (iy % 2 ? SUN_STEP / 2 : 0);
      const y = iy * SUN_STEP * 0.866;
      const d = Math.hypot(x, y) / SUN_R;
      if (d > 1) continue;
      const tone = 1 - Math.pow(d, 2.4); // 中心实、边缘点径收到 0（轮廓是圆，不是网格的六边形）
      const r = (SUN_STEP / 2) * 1.1 * Math.sqrt(tone);
      if (r > 0.9) out.push({ x, y, r });
    }
  }
  return out;
})();

const Sun: React.FC<{ reveal: number; cx: number; cy: number; k: number }> = ({ reveal, cx, cy, k }) => {
  const box = SUN_R * 2 + 40;
  return (
    <svg width={box * k} height={box * k} viewBox={`${-SUN_R - 20} ${-SUN_R - 20} ${box} ${box}`}
      style={{
        position: 'absolute', left: cx - (box * k) / 2, top: cy - (box * k) / 2, mixBlendMode: 'multiply',
        // 墨辊擦入：自上而下的硬边遮罩（印刷是一次滚过，不是淡入）
        clipPath: `inset(0 0 ${((1 - reveal) * 100).toFixed(2)}% 0)`,
      }}>
      <g fill={FLUO}>
        {SUN_DOTS.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} />)}
      </g>
    </svg>
  );
};

// 套准十字（印刷对位标）：静止布景锚点
const RegMark: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <svg width={40} height={40} viewBox="0 0 40 40" style={{ position: 'absolute', left: x - 20, top: y - 20, mixBlendMode: 'multiply' }}>
    <g fill="none" stroke={BLUE} strokeWidth={1.6} opacity={0.75}>
      <circle cx={20} cy={20} r={9} />
      <path d="M20 1 V39 M1 20 H39" />
    </g>
  </svg>
);

// 圆章：套准那一帧盖下（蓝版，环形字 + 中心：品牌 logo / 缩写 / 勾）
const Stamp: React.FC<{ s: number; o: number; cx: number; cy: number; k: number; ring: string; mono: string; sans: string }> = ({ s, o, cx, cy, k, ring, mono, sans }) => {
  const brand = useBrand();
  const name = (brand?.name || '').trim();
  const initials = name ? name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '';
  const ringW = measureText(ring, mono, 28, 700);
  const ringSize = Math.min(28, (28 * 520) / Math.max(1, ringW));
  return (
    <svg width={300 * k} height={300 * k} viewBox="-130 -130 260 260"
      style={{ position: 'absolute', left: cx - 150 * k, top: cy - 150 * k, mixBlendMode: 'multiply', opacity: o, transform: `rotate(-14deg) scale(${s.toFixed(4)})` }}>
      <defs>
        <path id="rmh-ring" d="M -88 0 A 88 88 0 1 1 88 0 A 88 88 0 1 1 -88 0" />
      </defs>
      <g fill="none" stroke={BLUE} strokeWidth={5}>
        <circle r={122} />
        <circle r={66} strokeWidth={3} />
      </g>
      <text fill={BLUE} style={{ fontFamily: mono, fontSize: ringSize, fontWeight: 700 }}>
        <textPath href="#rmh-ring" textLength={540} lengthAdjust="spacing">{ring}</textPath>
      </text>
      <g transform="rotate(14)">
        {brand?.logo ? (
          <image href={brand.logo} x={-40} y={-40} width={80} height={80} preserveAspectRatio="xMidYMid meet" style={{ filter: 'grayscale(1)' }} />
        ) : initials ? (
          <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill={BLUE} style={{ fontFamily: sans, fontWeight: 900, fontSize: initials.length > 1 ? 50 : 62 }}>{initials}</text>
        ) : (
          <path d="M -30 2 L -8 24 L 32 -22" fill="none" stroke={BLUE} strokeWidth={12} strokeLinecap="square" />
        )}
      </g>
    </svg>
  );
};

// 标题折行：在 1–3 行里选字号最大的一种；每种行数取"最长行最短"的均衡断点
const balance = (text: string, family: string, maxW: number, sizeMax: number, availH: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const W = (s: string) => measureText(s, family, 100, 900) * (1 - 0.045 * 0.9);
  let best = { lines: [text], size: 10 };
  const tryLines = (lines: string[]) => {
    const k = lines.length;
    const wMax = Math.max(...lines.map(W));
    const size = Math.min(sizeMax, (maxW * 100) / wMax, availH / (0.24 + k * TITLE_LH));
    // 多一行必须换来 >12% 的字号才值得（少断行 = 更像海报标题、少孤字）
    if (k === best.lines.length ? size > best.size : size > best.size * 1.12) best = { lines, size };
  };
  tryLines([words.join(' ')]);
  for (let i = 1; i < words.length; i++) tryLines([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
  for (let i = 1; i < words.length; i++)
    for (let j = i + 1; j < words.length; j++) tryLines([words.slice(0, i).join(' '), words.slice(i, j).join(' '), words.slice(j).join(' ')]);
  return best;
};

// 撞入位移：右画外 1700px → 0，8f ease-in(cubic)（加速撞停）
const slideAt = (f: number) => mix(1700, 0, ramp(f, 20, HIT - 20, inCubic));

export const RisoMisregistrationHit: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const P = SH > 1080 * 1.2;
  // [Agent Edit] nen anh AI: bo giay / hat / toi goc tu ve; chu tren nen co bong sang nhe (multiply voi trang = khong doi mau muc)
  const bd = useBackdrop();
  const glow = bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined;
  const SANS = fonts.sans;
  const MONO = fonts.mono;

  const title = useText('title', 'BÙNG NỔ DOANH SỐ.');
  const kicker = useText('kicker', 'BẢN TIN Nº 07');
  const items = useList('items', ['GIAO HÀNG 2 GIỜ', 'MIỄN PHÍ ĐỔI TRẢ', 'GIÁ TỐT MỖI NGÀY']).slice(0, 3);
  const notes = useList('notes', ['Nội thành Hà Nội & TP.HCM', 'Trong vòng 30 ngày', 'Cam kết hoàn tiền']);
  const stamp = useText('stamp', 'ĐÃ CHỐT ĐƠN').toUpperCase();
  const brand = useBrand();
  const RIGHT_LABEL = 'IN HAI MÀU · RISO';
  const ring = `${stamp} ✶ ${brand?.name ? brand.name.toUpperCase() : stamp} ✶`;

  // ───────── 版式 ─────────
  const n = Math.max(1, items.length);
  const hdrSize = P ? 40 : 26;
  const hdrY = P ? 150 : 104;
  const ruleTop = P ? 220 : 150;
  // 信息栏
  const headSize0 = P ? 66 : 40;
  const noteSize0 = P ? 50 : 32;
  const colW = P ? 1680 : (1680 - 48 * (n - 1)) / n;
  const headS = Math.min(...items.map((t) => fitSize(t, { family: SANS, size: headSize0, maxWidth: colW, weight: 850, minSize: headSize0 * 0.5 })));
  const noteS = Math.min(...items.map((_, i) => fitSize(notes[i] || '', { family: SANS, size: noteSize0, maxWidth: colW, weight: 450, minSize: noteSize0 * 0.55 })));
  const rowH = headS * 1.15 + 8 + noteS * 1.35;
  const infoH = P ? n * rowH + (n - 1) * 44 : rowH;
  const infoTop = P ? SH - 190 - infoH : 906;
  const ruleBot = infoTop - (P ? 44 : 28);
  // 太阳 + 圆章
  const sunK = P ? 1.7 : 1;
  const sunC = P ? { x: 1240, y: ruleTop + 60 + SUN_R * sunK } : { x: 1090 + SUN_R + 20, y: 108 + SUN_R + 20 };
  const stampK = P ? 1.7 : 1;
  const stampC = P ? { x: sunC.x + SUN_R * sunK * 0.42, y: sunC.y + SUN_R * sunK * 0.18 } : { x: 1630, y: 650 };
  // 标题
  const tTop = P ? sunC.y + SUN_R * sunK * 0.62 : ruleTop + 28;
  const tBot = ruleBot - (P ? 70 : 20);
  const fit = balance(title, SANS, P ? 1680 : 1340, P ? 380 : 300, tBot - tTop);
  const tSize = fit.size;
  const blockH = (0.24 + fit.lines.length * TITLE_LH) * tSize;
  const tY = tTop + Math.max(0, (tBot - tTop - blockH) / 2) + 0.24 * tSize - (TITLE_LH - 1) * 0.5 * tSize;
  const AX = Math.max(16, (20 * tSize) / 300); // 单版 x 错位振幅（两版反向 → 总分离 ≥32px）
  const AY = (AX * 8) / 20; // 单版 y 错位振幅（少量，更像没对准版）

  const split = frame >= HIT && frame < SNAP;
  const slideX = frame < HIT ? slideAt(frame) : 0;
  const vx = frame >= 20 && frame < HIT ? velocity(slideAt, frame) : 0;

  // 错位震荡包络：t 自命中起，衰减余弦；帧 72 硬切归零
  const t = frame - HIT;
  const m = split ? Math.cos(OMEGA * t) * Math.exp(-t / TAU) : 0;
  const dx = AX * m;
  const dy = AY * m;

  // 套准脉冲：72f 起 4f scale 1.03 → 1
  const pulse = frame >= SNAP && frame < SNAP + 4 ? 1 + 0.03 * (1 - (frame - SNAP) / 4) : 1;
  // 命中顿挫：整页 1.2% 一帧到位、指数回落（10f 窗口外精确 1）
  const th = frame - HIT;
  const kick = th >= 0 && th < 10 ? 1 + 0.012 * Math.exp(-th / 2.5) : 1;
  // 相机：smooth 极缓推进，110f 收敛
  const cam = 1 + 0.012 * ramp(frame, 0, 110, EASE.smooth);

  // 圆章：72f 盖下，4f 由 1.5 压到 1（ease-out），之后静止
  const sp = ramp(frame, SNAP, 4, EASE.out);
  const stampS = frame < SNAP ? 1.5 : mix(1.5, 1, sp);
  const stampO = frame < SNAP ? 0 : Math.min(1, sp * 2.5);

  const sunReveal = ramp(frame, 0, 16, EASE.swift);
  const info = (i: number) => {
    const p = ramp(frame, 4 + i * 4, 14, EASE.snappy);
    return { opacity: p, transform: `translateY(${((1 - p) * 26).toFixed(2)}px)` };
  };
  const hdrW = P ? 820 : 800;
  const plate = (color: string, pdx: number, pdy: number, scale = 1) => (
    <Plate color={color} dx={pdx} dy={pdy} scale={scale} lines={fit.lines} size={tSize} x={120} y={tY} family={SANS} shadow={glow} />
  );

  return (
    <div style={{ width: 1920, height: SH, background: bd ? 'transparent' : PAPER, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${(cam * kick).toFixed(5)})`, transformOrigin: '40% 50%' }}>
        {/* 纸面：中心略亮 + 静态纸纤维（multiply） */}
        {!bd && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 72% 70% at 42% 44%, #f8f4ea 0%, #f3eee2 58%, #e8e1d1 100%)' }} />}
        {!bd && <Grain opacity={0.11} step={100000} scale={2.4} freq={0.55} blend="multiply" />}

        <Sun reveal={sunReveal} cx={sunC.x} cy={sunC.y} k={sunK} />

        {/* 版记：四角套准十字 + 顶栏（蓝版） */}
        <RegMark x={64} y={64} />
        <RegMark x={1856} y={64} />
        <RegMark x={64} y={SH - 64} />
        <RegMark x={1856} y={SH - 64} />
        <div style={{
          position: 'absolute', left: 120, right: 120, top: hdrY, display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap',
          fontFamily: MONO, fontWeight: 600, letterSpacing: '0.12em', color: BLUE, mixBlendMode: 'multiply',
          opacity: ramp(frame, 0, 10, EASE.out), lineHeight: 1.3, textShadow: glow,
        }}>
          <span style={{ fontSize: fitSize(kicker, { family: MONO, size: hdrSize, maxWidth: hdrW, weight: 600, minSize: hdrSize * 0.55, letterSpacingEm: 0.12 }) }}>{kicker}</span>
          <span style={{ fontSize: hdrSize }}>{RIGHT_LABEL}</span>
        </div>
        <div style={{ position: 'absolute', left: 120, right: 120, top: ruleTop, height: P ? 6 : 4, background: BLUE, mixBlendMode: 'multiply', transformOrigin: '0 50%', transform: `scaleX(${ramp(frame, 0, 18, EASE.snappy).toFixed(4)})` }} />

        {/* 底部演出信息（蓝版）：横版三栏 / 竖版逐行 */}
        <div style={{ position: 'absolute', left: 120, right: 120, top: ruleBot, height: P ? 6 : 4, background: BLUE, mixBlendMode: 'multiply', transformOrigin: '0 50%', transform: `scaleX(${ramp(frame, 2, 18, EASE.snappy).toFixed(4)})` }} />
        <div style={{
          position: 'absolute', left: 120, right: 120, top: infoTop, display: 'grid', color: BLUE, mixBlendMode: 'multiply',
          gridTemplateColumns: P ? '1fr' : `repeat(${n}, 1fr)`, gap: P ? 44 : 48, textShadow: glow,
        }}>
          {items.map((a, i) => (
            <div key={i} style={{ ...info(i), whiteSpace: 'nowrap' }}>
              <div style={{ fontFamily: SANS, fontSize: headS, fontWeight: 850, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{a}</div>
              {notes[i] ? <div style={{ fontFamily: SANS, fontSize: noteS, fontWeight: 450, letterSpacing: '-0.01em', lineHeight: 1.35, marginTop: 8 }}>{notes[i]}</div> : null}
            </div>
          ))}
        </div>

        {/* 撞入：两版重合（套准态）整体横飞，带方向性运动模糊 */}
        {frame >= 20 && frame < HIT && (
          <SpeedBlur vx={vx} amount={0.09} max={34}>
            <div style={{ position: 'absolute', inset: 0, transform: `translateX(${slideX.toFixed(1)}px)` }}>
              {plate(FLUO, 0, 0)}
              {plate(BLUE, 0, 0)}
            </div>
          </SpeedBlur>
        )}

        {/* 双版错位：粉版与蓝版反向偏移，multiply 叠出"重影套印"；套准后两版归零重合成深紫 */}
        {frame >= HIT && (
          <>
            {plate(FLUO, -dx, dy, pulse)}
            {plate(BLUE, dx, -dy, pulse)}
          </>
        )}

        <Stamp s={stampS} o={stampO} cx={stampC.x} cy={stampC.y} k={stampK} ring={ring} mono={MONO} sans={SANS} />
      </div>

      {/* 油墨颗粒：screen 细噪让墨块带 riso 那种不均匀的白点（静态）+ 暖褐暗角 */}
      {!bd && <Grain opacity={0.2} step={100000} freq={1.25} blend="screen" />}
      {!bd && <Vignette strength={0.13} inner={0.55} color="#5a4a32" />}
    </div>
  );
};
