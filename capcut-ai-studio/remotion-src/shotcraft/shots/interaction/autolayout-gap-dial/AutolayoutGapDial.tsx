// autolayout-gap-dial —— framer-ai 4.5–5.5s
// 间距拨盘驱动布局：一个 gap 数值同帧驱动整排导航块的位置、测量线、徽章与读数。
//
// 第二轮重设计（石墨暗场 · 设计工具检查器海报）：
// - look = graphite（近单色暗场）。设计工具的"选择白 + 测量金"两色语义：框选描边/手柄用近白，
//   间距测量线/徽章/拨盘指针用 accent2 香槟金——画面里只有"被拨动的那个数"是有颜色的。
// - 主角是"数"：顶部 196px 超大 tabular 读数（GAP 眉题 + 数值 + px 单位），下面一把 760px 拨盘刻度尺，
//   刻度随 gap 横向滚过中心金针；拨动时读数由白转金、松手后回白——数值就是缰绳。
// - 布局主体：一排 120px 高的导航块（video-shotcraft 站点的顶部导航），占画宽 ~64–86%；激活项白底黑字，
//   其余是带色相深灰面板 + 发丝线 + 顶部内高光；块按自身速度做横向运动模糊（外侧块位移最大，拖影最长）。
// - 节奏「预备—拉开—屏息—回弹」：开场先把 gap 往里收一点（anticip 预备，12→6），再 swift 不对称曲线
//   拉到 104；hold 一拍屏息；松手后欠阻尼弹簧过冲到比起点更紧再回稳（过冲段 ×0.45 压缩，gap 永不为负）。
//
// 时间表（30fps，共 150f）：
//   0–20    入场：舞台光 + 点阵画布；导航块错峰上浮（父先到）、框选描边从外侧收拢、8 手柄 2f 错峰弹出
//   6–22    读数入场：眉题字距收拢、数值从线下升起、刻度尺淡入
//   22–32   预备：gap 12→6（anticip，观众先看到"往回收"再看到"冲出去"）
//   32–66   主动作：gap 6→104（34f swift），读数逐 2 跳、转金；测量线与徽章实时拉长
//   66–86   屏息 hold 20f：相机极缓推近（总 +2.5%），金色读数停在 104
//   86–118  回弹：spring(damping 9, stiffness 80) 104→~7→12，~118f 落定，读数回白
//   118–150 落定 hold：完整海报（读数 12 + 收紧的导航条），相机继续极缓推进
//
// [Agent Edit] O chu: `items` (3-5 nhan cua cac khoi — muc menu / buoc / tinh nang; khoi dau = dang chon), `kicker`
// (nhan nho tren so doc). Be ngang khoi do theo chu that (khong con bang be ngang co dinh); qua dai -> thu nho chu cho
// ca hang vua khung o gap lon nhat. Khung doc (portrait.mode = 'native'): auto layout DOC — cac khoi xep chong (rong
// bang nhau), gap day cac khoi theo chieu doc, duong do + huy hieu nam ben phai, mo hinh mo theo chieu doc; so doc +
// thuoc xoay to hon (x2); ca khoi can giua chieu cao that. Moi thong so nhip (du bi 12->6, 34f swift, hold 20f,
// lo xo damping 9, buoc 2) giu nguyen.
import { useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, spring } from 'remotion';
import { EASE, FONT, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt, type } from '../../../fixtures/Look';

export const AUTOLAYOUT_GAP_DIAL_DURATION = 150;

const L = LOOKS.graphite;
const FPS = 30;
const SEL = 'rgba(244,244,242,0.92)'; // 选择白：框选描边 / 手柄

const BLOCK_H0 = 120;
const ROW_Y = 684; // 行中心（横屏）
const G_REST = 12;
const G_PRE = 6; // 预备回收值
const G_MAX = 104;

const PRE_START = 22;
const PRE_END = 32;
const GROW_END = 66;
const HOLD_END = 86;
// damping 9 的原始过冲 ≈18%×106px 会把 gap 拉成负数；过冲段 ×0.45 → 最紧约 6px，仍"比起点更紧再回稳"
const OVERSHOOT_K = 0.45;

// 同一个 gap 参数派生全部几何（块位置、测量线、徽章、读数、刻度尺）
const gapAt = (f: number) => {
  if (f < PRE_END) return G_REST + (G_PRE - G_REST) * ramp(f, PRE_START, PRE_END - PRE_START, EASE.swift);
  if (f < HOLD_END) return G_PRE + (G_MAX - G_PRE) * ramp(f, PRE_END, GROW_END - PRE_END, EASE.swift);
  const s = spring({ frame: f - HOLD_END, fps: FPS, config: { damping: 9, stiffness: 80, mass: 1.1 } });
  const s2 = s > 1 ? 1 + (s - 1) * OVERSHOOT_K : s;
  return G_MAX + (G_REST - G_MAX) * s2;
};

// 两个 hex 颜色按 t 混合
const mixHex = (a: string, b: string, t: number) => {
  const pa = a.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16));
  const pb = b.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16));
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${pa.slice(0, 3).map((x, i) => Math.round(x + (pb[i] - x) * k)).join(',')})`;
};

const IconAutoLayout: React.FC<{ c: string; size?: number; vertical?: boolean }> = ({ c, size = 22, vertical }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={vertical ? { transform: 'rotate(90deg)' } : undefined}>
    <rect x={1} y={3} width={3.4} height={8} rx={1} fill={c} />
    <rect x={5.3} y={3} width={3.4} height={8} rx={1} fill={c} opacity={0.7} />
    <rect x={9.6} y={3} width={3.4} height={8} rx={1} fill={c} opacity={0.45} />
  </svg>
);

// 拨盘刻度尺：每 1 单位 = UNIT px，中心金针读当前 gap（K = 竖屏放大）
const RULER_W = 760;
const UNIT = 6.5;
const Ruler: React.FC<{ gap: number; op: number; hot: number; top: number; K: number; gold: string }> = ({ gap, op, hot, top, K, gold }) => {
  const RW = RULER_W * K;
  const ticks: React.ReactNode[] = [];
  for (let u = -60; u <= 180; u += 2) {
    const x = RW / 2 + (u - gap) * UNIT * K;
    if (x < -10 || x > RW + 10) continue;
    const major = u % 10 === 0;
    const edge = Math.max(0, Math.min(1, Math.min(x, RW - x) / (150 * K))); // 两端淡出
    const near = Math.abs(x - RW / 2);
    ticks.push(
      <div key={u} style={{
        position: 'absolute', left: x - K, bottom: 0, width: 2 * K, height: (major ? 30 : 14) * K, borderRadius: K,
        background: u < 0 ? alpha(L.ink, 0.08) : major ? alpha(L.ink, 0.5) : alpha(L.ink, 0.22), opacity: edge,
      }} />,
    );
    if (major && u >= 0) {
      ticks.push(
        <div key={`l${u}`} style={{
          position: 'absolute', left: x, bottom: 40 * K, transform: 'translateX(-50%)',
          ...type(22 * K, 500, { mono: true }), color: L.ink3,
          opacity: edge * Math.min(1, Math.max(0, (near - 18 * K) / (22 * K))), // 靠近指针的数字让位
        }}>{u}</div>,
      );
    }
  }
  return (
    <div style={{ position: 'absolute', left: 960 - RW / 2, top, width: RW, height: 76 * K, opacity: op }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>{ticks}</div>
      {/* 基线 */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: K, background: `linear-gradient(90deg, transparent, ${alpha(L.ink, 0.18)} 20%, ${alpha(L.ink, 0.18)} 80%, transparent)` }} />
      {/* 金针：拨动时泛光 */}
      <div style={{
        position: 'absolute', left: RW / 2 - 1.5 * K, bottom: -6 * K, width: 3 * K, height: 50 * K, borderRadius: 2 * K, background: gold,
        boxShadow: `0 0 ${8 + hot * 14}px ${alpha(gold, 0.35 + hot * 0.4)}`,
      }} />
      <div style={{
        position: 'absolute', left: RW / 2 - 8 * K, bottom: 44 * K, width: 0, height: 0,
        borderLeft: `${8 * K}px solid transparent`, borderRight: `${8 * K}px solid transparent`, borderTop: `${10 * K}px solid ${gold}`,
      }} />
    </div>
  );
};

export const AutolayoutGapDial: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const GOLD = L.accent2; // 测量金：间距线 / 徽章 / 指针 / 拨动中的读数（随视频强调色）
  const portrait = SH > 1080 * 1.2;
  const labels = useList('items', ['Trang chủ', 'Khám phá', 'Thư viện', 'Cửa hàng', 'Hồ sơ']).slice(0, 5);
  const kicker = useText('kicker', 'Tự động căn chỉnh · Khoảng cách');
  const n = Math.max(1, labels.length);
  const K = portrait ? 2 : 1; // 竖屏：读数 / 尺 / 块放大
  const BH = portrait ? 240 : BLOCK_H0;

  // ── 块尺寸：按真实字宽 ──
  let fontSize = 36 * (portrait ? 2.3 : 1);
  const padX = (portrait ? 80 : 50);
  const dotW = portrait ? 44 : 26;
  const natural = (fs: number) => labels.map((t, i) => Math.max(portrait ? 300 : 160, measureText(t, fonts.sans, fs, i === 0 ? 650 : 520) + padX * 2 + (i === 0 ? dotW : 0)));
  let widths = natural(fontSize);
  if (!portrait) {
    const avail = 1760 - (n - 1) * G_MAX;
    const sum = widths.reduce((a, b) => a + b, 0);
    if (sum > avail) {
      const f = Math.max(0.55, avail / sum);
      fontSize = 36 * f;
      widths = natural(fontSize).map((w) => Math.min(w, (avail / n) * 1.6));
      const s2 = widths.reduce((a, b) => a + b, 0);
      if (s2 > avail) widths = widths.map((w) => (w * avail) / s2);
    }
  } else {
    // 竖屏：等宽（填满容器），右侧留出测量标注
    const maxW = 1100;
    let W = Math.max(...widths);
    if (W > maxW) {
      const longest = labels.reduce((a, b) => (measureText(a, fonts.sans, fontSize, 650) > measureText(b, fonts.sans, fontSize, 650) ? a : b));
      fontSize = fitSize(longest, { family: fonts.sans, size: fontSize, maxWidth: maxW - padX * 2 - dotW, weight: 650, minSize: 34 });
      W = maxW;
    }
    widths = labels.map(() => W);
  }

  const gap = gapAt(frame);
  const gapShown = Math.max(0, Math.round(gap / 2) * 2); // 逐格跳数（步进 2 = 拨盘咔哒的颗粒）
  const v = gapAt(frame + 0.5) - gapAt(frame - 0.5); // gap 速度（px/帧）
  const moving = Math.min(1, Math.abs(v) / 1.2);
  // 拨动热度：读数白→金，带 ~6f 余温（松手回稳后慢慢褪回白）
  let hot = 0;
  for (let k = 0; k <= 6; k++) hot = Math.max(hot, Math.min(1, Math.abs(gapAt(frame - k + 0.5) - gapAt(frame - k - 0.5)) / 1.5) * (1 - k / 7));
  // 跳数脉冲：相位由数值本身驱动（每跨一个步进格脉冲一次）× 速度门限
  const tickPulse = 1 + 0.06 * Math.abs(Math.sin((Math.PI * gap) / 2)) * moving;

  // ── 竖向排版（竖屏）：读数块 + 堆叠块，整体垂直居中；横屏保持原版坐标 ──
  const gp = gap * K; // 画面上的 gap 物理长度
  const stackMaxH = n * BH + (n - 1) * G_MAX * K;
  const readH = (40 + 36 + 220 + 30 + 76) * K; // 眉题 + 数值 + 尺
  const topBlock = portrait ? Math.max(110, Math.round((SH - (readH + 150 + 90 + stackMaxH + 40)) / 2)) : 150;
  const stackCY = portrait ? topBlock + readH + 150 + 90 + stackMaxH / 2 : ROW_Y;
  const rects = (g: number) => {
    const gg = g * K;
    if (!portrait) {
      const total = widths.reduce((a, b) => a + b, 0) + gg * (n - 1);
      let acc = (1920 - total) / 2;
      const r = widths.map((w) => {
        const o = { x: acc, y: ROW_Y - BH / 2, w, h: BH };
        acc += w + gg;
        return o;
      });
      return { r, total };
    }
    const total = n * BH + gg * (n - 1);
    let acc = stackCY - total / 2;
    const W = widths[0];
    const r = widths.map(() => {
      const o = { x: 960 - W / 2, y: acc, w: W, h: BH };
      acc += BH + gg;
      return o;
    });
    return { r, total };
  };
  const { r: R, total } = rects(gap);

  // 相机：整段极缓推近（smooth，起止无速度突变）
  const cam = 1 + 0.025 * ramp(frame, 0, AUTOLAYOUT_GAP_DIAL_DURATION, EASE.smooth);

  // 框选描边：spring 从外侧 26px 收拢
  const selIn = springAt(frame, 4, { damping: 16, stiffness: 140 });
  const pad = 30 * K;
  const grow = (1 - selIn) * 26 * K;
  const bx0 = Math.min(...R.map((b) => b.x));
  const bx1 = Math.max(...R.map((b) => b.x + b.w));
  const by0 = Math.min(...R.map((b) => b.y));
  const by1 = Math.max(...R.map((b) => b.y + b.h));
  const selX = bx0 - pad - grow;
  const selW = bx1 - bx0 + pad * 2 + grow * 2;
  const selY = by0 - pad - grow;
  const selH = by1 - by0 + pad * 2 + grow * 2;

  const measOp = ramp(frame, 14, 10, EASE.out);
  const eyebrow = ramp(frame, 4, 18, EASE.snappy);
  const numIn = ramp(frame, 8, 18, EASE.snappy);
  const rulerIn = ramp(frame, 12, 16, EASE.out);

  // 读数颜色：白 ↔ 金
  const numColor = mixHex(L.ink, GOLD, hot);
  const kickSize = fitSize(kicker.toUpperCase(), { family: fonts.sans, size: 22 * K * (portrait ? 1.3 : 1), maxWidth: 1600, weight: 600, minSize: 16, letterSpacingEm: 0.28 });
  const eyebrowTop = topBlock;
  const numTop = topBlock + 36 * K;
  const rulerTop = topBlock + (36 + 220 + 42) * K;
  const layerName = `Thanh điều hướng`;

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden', fontFamily: FONT.sans }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.0 }} fill={{ x: 0.5, y: 1.05 }} horizon={portrait ? 0.7 : 0.62} breathe={0.4} style={{ height: SH, bottom: 'auto' }}>
        {/* 画布点阵：围绕导航条清楚、四周隐去 */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 1920, height: SH,
          backgroundImage: `radial-gradient(${alpha(L.ink, 0.13)} 1.4px, transparent 1.7px)`,
          backgroundSize: '36px 36px', backgroundPosition: '6px 16px',
          WebkitMaskImage: `radial-gradient(ellipse 52% ${portrait ? 30 : 40}% at 50% ${((stackCY / SH) * 100).toFixed(1)}%, #000 20%, transparent 100%)`,
          maskImage: `radial-gradient(ellipse 52% ${portrait ? 30 : 40}% at 50% ${((stackCY / SH) * 100).toFixed(1)}%, #000 20%, transparent 100%)`,
        }} />
      </Stage>
      {/* 导航条落脚的光池：条子"站"在画布上 */}
      <div style={{
        position: 'absolute', left: 260, right: 260, top: portrait ? stackCY + stackMaxH / 2 - 60 : ROW_Y + 40, height: 200 * K,
        background: `radial-gradient(ellipse 50% 50% at 50% 30%, ${alpha(L.light, 0.1)} 0%, transparent 70%)`,
      }} />

      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: `50% ${portrait ? ((stackCY / SH) * 100).toFixed(1) : 52}%` }}>
        {/* ── 读数：眉题 + 超大数值 + 单位 ── */}
        {kicker ? (
          <div style={{
            position: 'absolute', left: 0, right: 0, top: eyebrowTop, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 * K,
            opacity: eyebrow, letterSpacing: `${(0.28 + (1 - eyebrow) * 0.4).toFixed(3)}em`,
            ...type(kickSize, 600, { caps: true }), color: L.ink2, whiteSpace: 'nowrap', lineHeight: 1.3,
          }}>
            <IconAutoLayout c={L.ink2} size={22 * K} vertical={portrait} />
            <span style={{ letterSpacing: 'inherit' }}>{kicker}</span>
          </div>
        ) : null}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: numTop, height: 220 * K, overflow: 'hidden',
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 18 * K,
            transform: `translateY(${((1 - numIn) * 105).toFixed(2)}%)`,
          }}>
            <span style={{
              ...type(196 * K, 300), letterSpacing: '-0.05em', color: numColor, display: 'inline-block',
              minWidth: '1.9em', textAlign: 'right', transform: `scale(${tickPulse})`, transformOrigin: '100% 80%',
              textShadow: hot > 0.05 ? `0 0 ${(40 * hot).toFixed(1)}px ${alpha(GOLD, 0.35 * hot)}` : undefined,
            }}>{gapShown}</span>
            <span style={{ ...type(60 * K, 500), color: L.ink3, width: '1.9em' }}>px</span>
          </div>
        </div>
        <Ruler gap={gap} op={rulerIn} hot={hot} top={rulerTop} K={K} gold={GOLD} />

        {/* ── 块 ── */}
        {R.map((b, i) => {
          const inP = ramp(frame, 1 + i * 2, 16, EASE.snappy);
          const active = i === 0;
          const vel = (i - (n - 1) / 2) * v * K; // 块速度 = (i−中)·dgap/dt：外侧块位移最大
          const blur = Math.min(9 * K, Math.abs(vel) * 0.5);
          const fid = `nb${i}`;
          const dy = (1 - inP) * 34 * K;
          return (
            <div key={i} style={{
              position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h,
              opacity: inP, transform: `translateY(${dy.toFixed(2)}px)`,
            }}>
              {blur > 0.5 && (
                <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
                  <filter id={fid} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
                    <feGaussianBlur stdDeviation={portrait ? `0 ${blur.toFixed(2)}` : `${blur.toFixed(2)} 0`} />
                  </filter>
                </svg>
              )}
              <div style={{
                position: 'absolute', inset: 0, boxSizing: 'border-box', borderRadius: 24 * K,
                background: active ? 'linear-gradient(180deg, #fbfbf8, #e6e6e1)' : 'linear-gradient(180deg, #212327, #17181b)',
                border: active ? '1px solid rgba(255,255,255,0.7)' : `1px solid ${alpha('#ffffff', 0.09)}`,
                boxShadow: active
                  ? `inset 0 1px 0 rgba(255,255,255,1), inset 0 -2px 0 rgba(0,0,0,0.08), ${softShadow(18, { color: '#000000', strength: 2.4 })}`
                  : `inset 0 1px 0 ${alpha('#ffffff', 0.08)}, ${softShadow(12, { color: '#000000', strength: 2.4 })}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 * K,
                filter: blur > 0.5 ? `url(#${fid})` : undefined,
              }}>
                {active && <div style={{ width: 12 * K, height: 12 * K, borderRadius: 99, background: '#111214', flex: 'none' }} />}
                <span style={{ ...type(fontSize, active ? 650 : 520), lineHeight: 1.3, whiteSpace: 'nowrap', color: active ? '#0d0e10' : alpha(L.ink, 0.86) }}>{labels[i]}</span>
              </div>
            </div>
          );
        })}

        {/* ── 框选描边 + 8 手柄 + 图层名 ── */}
        <div style={{
          position: 'absolute', left: selX, top: selY, width: selW, height: selH, boxSizing: 'border-box',
          border: `${2 * K}px solid ${SEL}`, borderRadius: 6 * K, opacity: Math.min(1, selIn * 1.4),
        }}>
          <div style={{
            position: 'absolute', left: -2, top: -54 * K, display: 'flex', alignItems: 'center', gap: 10 * K,
            ...type(26 * K, 560), color: SEL, whiteSpace: 'nowrap', lineHeight: 1.3,
          }}>
            <IconAutoLayout c={SEL} size={20 * K} vertical={portrait} />
            {layerName}
            <span style={{ ...type(22 * K, 500, { mono: true }), color: L.ink3, marginLeft: 8 * K }}>
              {portrait ? `${Math.round(widths[0] / K)} × ${Math.round(total / K)}` : `${Math.round(total)} × ${BH}`}
            </span>
          </div>
          {[[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]].map(([hx, hy], i) => {
            const hp = springAt(frame, 7 + i * 1.2, { damping: 13, stiffness: 240 });
            return (
              <div key={i} style={{
                position: 'absolute', left: `${hx * 100}%`, top: `${hy * 100}%`, width: 16 * K, height: 16 * K, marginLeft: -8 * K, marginTop: -8 * K,
                background: L.bg[1], border: `${2 * K}px solid ${SEL}`, borderRadius: 3 * K, boxSizing: 'border-box', transform: `scale(${hp})`,
              }} />
            );
          })}
        </div>

        {/* ── 间距标注：延长线 ×2 + 测量线 + 徽章（全部由 gap 实时重算） ── */}
        {R.slice(0, -1).map((b, i) => {
          const bp = ramp(frame, 14 + i * 2, 12, EASE.snappy);
          const span = Math.max(0, gp);
          const badge: React.CSSProperties = {
            opacity: bp, minWidth: 64 * K, textAlign: 'center', boxSizing: 'border-box', padding: `${6 * K}px ${14 * K}px`, borderRadius: 10 * K,
            background: GOLD, color: L.onAccent, ...type(28 * K, 700), lineHeight: 1.1,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 18px -6px ${alpha(GOLD, 0.6)}`,
          };
          if (!portrait) {
            const gx = b.x + b.w;
            const cy = ROW_Y + BH / 2 + 74;
            const extTop = ROW_Y + BH / 2 + 34;
            return (
              <div key={i} style={{ position: 'absolute', left: 0, top: 0, opacity: measOp }}>
                {[gx, gx + gp].map((lx, k) => (
                  <div key={k} style={{
                    position: 'absolute', left: lx - 0.75, top: extTop, width: 1.5, height: 58,
                    backgroundImage: `linear-gradient(${GOLD} 55%, transparent 55%)`, backgroundSize: '1.5px 7px', opacity: 0.7,
                  }} />
                ))}
                <div style={{ position: 'absolute', left: gx, top: cy - 1, width: span, height: 2, background: GOLD, boxShadow: `0 0 10px ${alpha(GOLD, 0.4)}` }} />
                <div style={{ position: 'absolute', left: gx - 1, top: cy - 8, width: 2, height: 16, background: GOLD }} />
                <div style={{ position: 'absolute', left: gx + gp - 1, top: cy - 8, width: 2, height: 16, background: GOLD }} />
                <div style={{
                  position: 'absolute', left: gx + gp / 2, top: cy + 20,
                  transform: `translateX(-50%) translateY(${((1 - bp) * 10).toFixed(1)}px) scale(${(tickPulse * (0.7 + 0.3 * bp)).toFixed(3)})`, ...badge,
                }}>{gapShown}</div>
              </div>
            );
          }
          // 竖屏：标注在右侧，延长线横向、测量线竖向、徽章在线右
          const gy = b.y + b.h;
          const right = b.x + b.w;
          const cx = right + 74 * K;
          const extL = right + 34 * K;
          return (
            <div key={i} style={{ position: 'absolute', left: 0, top: 0, opacity: measOp }}>
              {[gy, gy + gp].map((ly, k) => (
                <div key={k} style={{
                  position: 'absolute', left: extL, top: ly - 0.75 * K, width: 58 * K, height: 1.5 * K,
                  backgroundImage: `linear-gradient(90deg, ${GOLD} 55%, transparent 55%)`, backgroundSize: `${7 * K}px ${1.5 * K}px`, opacity: 0.7,
                }} />
              ))}
              <div style={{ position: 'absolute', left: cx - K, top: gy, width: 2 * K, height: span, background: GOLD, boxShadow: `0 0 10px ${alpha(GOLD, 0.4)}` }} />
              <div style={{ position: 'absolute', left: cx - 8 * K, top: gy - K, width: 16 * K, height: 2 * K, background: GOLD }} />
              <div style={{ position: 'absolute', left: cx - 8 * K, top: gy + gp - K, width: 16 * K, height: 2 * K, background: GOLD }} />
              <div style={{
                position: 'absolute', left: cx + 26 * K, top: gy + gp / 2,
                transform: `translateY(-50%) translateX(${((1 - bp) * 10).toFixed(1)}px) scale(${(tickPulse * (0.7 + 0.3 * bp)).toFixed(3)})`, transformOrigin: '0 50%', ...badge,
              }}>{gapShown}</div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
