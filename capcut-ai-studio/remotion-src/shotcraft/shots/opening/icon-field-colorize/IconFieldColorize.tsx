// icon-field-colorize —— 灰阶图标原野错峰浮现铺满全屏，停一拍后多道品牌色横带波纹极快向下扫翻全场，
// 终态多色横带。对标 bear-app.mp4 0–3s（密帧核实：非同帧硬翻，是极快多道波纹翻色）。
//
// 第二轮重设计（余烬暗场 · 熄灯的键帽阵列被一道道光点亮）：
// - look = ember（暖黑 + 橙 / 金）。170 枚图标做成熄灯的深色键帽（暖黑底、发丝边、顶沿受光、暗灰字形）——
//   灰阶在暗场里读作"还没通电"；翻色 = 通电：键帽变成发光的色块（深色字形），带同色泛光、翻转瞬间白闪 + 1.22× pop，
//   同时这一行身后的舞台被染上同色的光（光溢出），整片原野真的"亮起来"。
// - 色波是一组暖色日出渐变（金 → 琥珀 → 橙 → 珊瑚红）：4 道波依次从各自起始行向下快扫，后波覆盖更低的行带，
//   终态四段横带由上到下由暖金过渡到珊瑚红——同色系分段，不是彩虹。
// - 节奏：中心向外浮现（46f）→ 静置时整场轻轻"吸气"压暗 → 色波 ~28f 扫完 → 光稳定后中心起一层暗幕、
//   落 video-shotcraft 字标 + 两行 132px 标题「Every shot, / one place.」，结尾帧是一张品牌海报。
//
// 时间表（30fps，共 170f）：
//   0–48    浮现：10 批按离中心距离（+噪声）错峰，批间 4f + 批内 ≤3f；每枚 0.6→1.06→1 过冲 + 上浮 10px
//   48–66   静置（58–66 整场压暗 12% = 蓄力）
//   66–96   翻色：4 道波（66/72/78/84f 起），行差 1.4f + 列微倾 0.25f + ≤1.5f 抖动，每枚 4f 翻转 + pop + 白闪
//   96–118  余波：泛光与光溢出稳定
//   118–140 暗幕 + 字标 + 标题两行升起
//   140–170 hold；全程极缓推近 4%
//
// [Agent Edit] o chu: kicker (dong nhan tren tieu de, vd "HƠN 400 TÍCH HỢP"), line1 / line2 (tieu de 2 vế; line2 to mau
// vang cua dot song dau). Thuong hieu (neu co): ten + dau hieu tren kicker. Chu dai: moi vế tu xuong toi da 2 dong,
// khong vuot be ngang man toi giua. Khung doc (native): phim to 1.5x (99px), luoi 11 cot x ~20 hang phu kin chieu cao,
// 4 dot song chia theo ti le hang, buoc hang thu lai de tong thoi gian quet giu nhu goc.
import { useCurrentFrame, useVideoConfig, useText, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftWordmark } from '../../../fixtures/Brand';

const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 16 个简笔图标（viewBox 0 0 24 24，纯填充），求可辨认不求精致
const SHAPES: ((c: string, k: string) => React.ReactNode)[] = [
  (c) => <path fill={c} d="M12 21s-7.5-4.7-9.6-9C.9 8.7 2.7 5 6.2 5c2 0 3.3 1 4 2.1h3.6C14.5 6 15.8 5 17.8 5c3.5 0 5.3 3.7 3.8 7-2.1 4.3-9.6 9-9.6 9z" transform="scale(0.92) translate(1,0)" />,
  (c) => <path fill={c} d="M12 2l2.7 6.3 6.8.5-5.2 4.4 1.6 6.6L12 16.2 6.1 19.8l1.6-6.6L2.5 8.8l6.8-.5z" />,
  (c) => <path fill={c} d="M13 2L4 14h6l-1 8 9-12h-6z" />,
  (c) => <circle fill={c} cx="12" cy="12" r="9" />,
  (c) => <path fill={c} d="M9 3v12.3A3.5 3.5 0 1 0 11 18V7h7v6.3A3.5 3.5 0 1 0 20 16V3z" transform="scale(0.85) translate(1.5,1.5)" />,
  (c) => <path fill={c} d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2z" transform="scale(0.85) translate(2,2)" />,
  (c, k) => <><rect fill={c} x="3" y="6" width="18" height="13" rx="2.5" /><circle fill={k} cx="12" cy="12.5" r="3.6" /><rect fill={c} x="8" y="3.5" width="8" height="4" rx="1.5" /></>,
  (c) => <path fill={c} d="M6.5 19a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 17.8 8.7 4.2 4.2 0 0 1 17.5 19z" />,
  (c) => <path fill={c} d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" transform="scale(0.9) translate(1.2,0.5)" />,
  (c) => <path fill={c} d="M3.5 10L12 3l8.5 7V21h-6v-6h-5v6h-6z" />,
  (c, k) => <><rect fill={c} x="3" y="8" width="18" height="4" rx="1" /><rect fill={c} x="5" y="12" width="14" height="9" rx="1" /><rect fill={k} x="10.9" y="8" width="2.2" height="13" /></>,
  (c) => <path fill={c} d="M9.4 20.6l-1 1.9 7.2-.1 4.9-8.5-2.2.1-2 3.4L13 4.5h-2.1L7.6 17.3z" transform="scale(0.9) translate(1,1)" />,
  (c) => <path fill={c} d="M20.3 6.7L9.6 17.4l-5.9-5.9 2.1-2.1 3.8 3.8 8.6-8.6z" />,
  (c) => <path fill={c} d="M21.5 15.5L14 12V5.5a2 2 0 1 0-4 0V12l-7.5 3.5v2l7.5-2v4l-2.5 2v1.5l4.5-1 4.5 1V21.5l-2.5-2v-4l7.5 2z" transform="scale(0.85) translate(1.8,1.8)" />,
  (c) => <><circle fill={c} cx="12" cy="12" r="4" /><path fill={c} d="M12 1.5l1.4 3.6h-2.8zM12 22.5l-1.4-3.6h2.8zM1.5 12l3.6-1.4v2.8zM22.5 12l-3.6 1.4v-2.8zM4.6 4.6l3.5 1.5-2 2zM19.4 19.4l-3.5-1.5 2-2zM19.4 4.6l-1.5 3.5-2-2zM4.6 19.4l1.5-3.5 2 2z" /></>,
  (c) => <path fill={c} d="M20 4C10 4 4.5 9 4 15.7 3.9 17.5 4 20 4 20s2.7-.2 4.4-.3C15 19.2 20 13.5 20 4zM6.8 17.2C10 11 15 8 15 8s-5.5 1.5-8.8 8z" />,
];

export const ICON_FIELD_COLORIZE_DURATION = 170; // 浮现 ~48f + 静置 18f + 翻色 ~30f + 余波 / 标题 / hold

const L = LOOKS.ember;
// 熄灯态字形：3 档暖灰
const GRAYS = ['#6e5c50', '#806b5d', '#5f4f45'];
// 四道色波：日出渐变（金 → 琥珀 → 橙 → 珊瑚红），后波覆盖更低的行带（fromRow 为行比例）
type RGB = [number, number, number];
const WAVES: { color: RGB; from: number; start: number }[] = [
  { color: [255, 196, 84], from: 0, start: 66 },
  { color: [255, 150, 62], from: 0.3, start: 72 },
  { color: [255, 108, 46], from: 0.5, start: 78 },
  { color: [240, 70, 86], from: 0.8, start: 84 },
];
const shade = (c: RGB, k: number): RGB => c.map((v) => Math.round(Math.max(0, Math.min(255, v + k * 255)))) as RGB;
const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const FLIP = 4; // 每枚翻转帧数

// 键帽：tint=null 为熄灯态
const Key: React.FC<{ shape: (c: string, k: string) => React.ReactNode; gray: string; tint: RGB | null; glowK?: number; s: number }> = ({ shape, gray, tint, glowK = 1, s }) => {
  const lit = tint !== null;
  const top = lit ? shade(tint, 0.08) : null;
  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: 18 * s,
      background: lit ? `linear-gradient(180deg, ${css(top!)} 0%, ${css(tint)} 55%, ${css(shade(tint, -0.08))} 100%)` : 'linear-gradient(180deg, #2a1e17 0%, #1d1510 100%)',
      boxShadow: lit
        ? `inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 ${css(shade(tint, -0.2), 0.5)}, 0 0 ${(26 * glowK * s).toFixed(1)}px ${css(tint, 0.42 * glowK)}, 0 ${10 * s}px ${22 * s}px -${8 * s}px ${css(shade(tint, -0.3), 0.6)}`
        : `inset 0 1px 0 rgba(255,220,190,0.07), inset 0 0 0 1px rgba(255,200,160,0.06), 0 ${6 * s}px ${14 * s}px -${6 * s}px rgba(0,0,0,0.7)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg viewBox="0 0 24 24" width={32 * s} height={32 * s} style={{ display: 'block' }}>
        {shape(lit ? alpha(L.onAccent, 0.86) : gray, lit ? css(tint) : '#241a14')}
      </svg>
    </div>
  );
};

// 越南语逐词升起（遮罩上 0.32em / 下 0.26em 留白，叠加声调不被裁）
const Rise: React.FC<{ text: string; start: number; g: number; style: React.CSSProperties }> = ({ text, start, g, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ whiteSpace: 'nowrap', ...style }}>
      {text.split(/\s+/).filter(Boolean).map((w, i) => {
        const p = EASE.snappy(Math.min(1, Math.max(0, (frame - start - i * g) / 20)));
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em', marginRight: '0.24em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))` }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

export const IconFieldColorize: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'HƠN 400 TÍCH HỢP');
  const line1 = useText('line1', 'Mọi tính năng,');
  const line2 = useText('line2', 'chung một nơi.');

  // ── 图标场几何（横向 = 原版 17×10；纵向键帽放大 1.5×、行数铺满高度）──
  const S = portrait ? 1.5 : 1;
  const CELL_X = 108 * S, CELL_Y = 106 * S; // 格距（行间半格错位）
  const TILE = 66 * S; // 键帽边长
  const COLS = portrait ? 11 : 17;
  const ROWS = portrait ? Math.max(10, Math.floor((SH - 60) / CELL_Y)) : 10;
  const X0 = (1920 - ((COLS - 1) * CELL_X + CELL_X / 2 + TILE)) / 2;
  const Y0 = (SH - ((ROWS - 1) * CELL_Y + TILE)) / 2;
  const ROW_STEP = (1.4 * 10) / ROWS; // 行差（总扫程与原版 10 行一致）
  const rnd = mulberry32(20260718);
  const ICONS = Array.from({ length: ROWS * COLS }, (_, idx) => {
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const r1 = rnd(), r2 = rnd(), r3 = rnd();
    const x = X0 + c * CELL_X + (r % 2) * (CELL_X / 2);
    const y = Y0 + r * CELL_Y;
    const d = Math.hypot(x + TILE / 2 - 960, y + TILE / 2 - SH / 2) / Math.hypot(960, SH / 2);
    const batch = Math.min(9, Math.floor((d * 0.75 + r1 * 0.35) * 10));
    return {
      r, c, x, y,
      t0: 2 + batch * 4.4 + r2 * 3,
      gray: GRAYS[Math.floor(r2 * GRAYS.length)],
      jit: (r1 - 0.5) * 0.08, // 同色带内 ±4% 明度微差
      shape: SHAPES[Math.floor(r3 * SHAPES.length) % SHAPES.length],
      arrive: WAVES.map((w) => ({ w, row0: Math.round(w.from * ROWS) })).filter(({ row0 }) => r >= row0).map(({ w, row0 }) => ({ w, at: w.start + (r - row0) * ROW_STEP + c * 0.25 + r3 * 1.5 })),
    };
  });

  // 静置段"吸气"：翻色前整场压暗 12%，第一道波到达时回满
  const inhale = ramp(frame, 56, 10, EASE.smooth) * (1 - ramp(frame, 66, 8, EASE.out));
  const rowLit = new Array(ROWS).fill(0);
  const rowColor: (RGB | null)[] = new Array(ROWS).fill(null);

  const icons = ICONS.map((ic) => {
    const op = ramp(frame, ic.t0, 7, EASE.out);
    if (op <= 0) return null;
    const appearScale = mix(0.6, 1, ramp(frame, ic.t0, 13, EASE.overshoot));
    const lift = (1 - ramp(frame, ic.t0, 13, EASE.snappy)) * 10 * S;
    let prev: RGB | null = null;
    let cur: RGB | null = null;
    let p = 0;
    let since = -1;
    for (const a of ic.arrive) {
      const q = Math.min(1, Math.max(0, (frame - a.at) / FLIP));
      if (q > 0) { prev = cur; cur = shade(a.w.color, ic.jit); p = q; since = frame - a.at; }
    }
    if (cur) { rowLit[ic.r] += 1 / COLS; rowColor[ic.r] = cur; }
    const flipping = p > 0 && p < 1;
    const pop = flipping ? 1 + Math.sin(p * Math.PI) * 0.22 : 1;
    // 通电白闪 + 泛光过冲：白闪等新色灌满后才起，screen 叠加只提亮不发灰
    const flash = since >= FLIP ? Math.max(0, 1 - (since - FLIP) / 5) : 0;
    const glowK = since >= 0 ? 1 + 1.2 * Math.max(0, 1 - since / 12) : 1;
    return (
      <div key={`${ic.r}-${ic.c}`} style={{
        position: 'absolute', left: ic.x, top: ic.y + lift, width: TILE, height: TILE,
        opacity: op, transform: `scale(${(appearScale * pop).toFixed(4)})`,
      }}>
        <Key shape={ic.shape} gray={ic.gray} tint={flipping ? prev : cur} glowK={glowK} s={S} />
        {flipping && (
          // 新色自上而下"灌满"键帽（与波的方向一致）：clip 擦入不做透明度混合，免得暖金叠在暗底上发橄榄色
          <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 ${((1 - EASE.out(p)) * 100).toFixed(2)}% 0 round ${18 * S}px)` }}>
            <Key shape={ic.shape} gray={ic.gray} tint={cur} glowK={glowK} s={S} />
          </div>
        )}
        {flash > 0 && <div style={{ position: 'absolute', inset: 0, borderRadius: 18 * S, mixBlendMode: 'screen', background: `rgba(255,244,226,${(0.45 * flash).toFixed(3)})` }} />}
      </div>
    );
  });

  // ── 标题：每行 ≤2 行，宽度不超过中心暗幕 ──
  const tSize0 = portrait ? 210 : 132;
  const tMaxW = portrait ? 1500 : 1320;
  const rowsOf = (t: string) => {
    if (!t) return [] as string[];
    if (measureText(t, fonts.sans, tSize0 * 0.72, 750) <= tMaxW) return [t];
    const w = wrapLines(t, fonts.sans, tSize0 * 0.72, tMaxW, 750, 2);
    if (w.length < 2) return w;
    // 两行均衡：避免第二行只剩一两个词
    const ws = t.split(/\s+/).filter(Boolean);
    let best = w;
    let bw = Infinity;
    for (let i = 1; i < ws.length; i++) {
      const a = ws.slice(0, i).join(' ');
      const b = ws.slice(i).join(' ');
      const m = Math.max(measureText(a, fonts.sans, tSize0 * 0.72, 750), measureText(b, fonts.sans, tSize0 * 0.72, 750));
      if (m < bw) { bw = m; best = [a, b]; }
    }
    return best;
  };
  const rows1 = rowsOf(line1);
  const rows2 = rowsOf(line2);
  const multi = rows1.length + rows2.length > 2;
  const tSize = Math.min(...[...rows1, ...rows2].map((t) => fitSize(t, { family: fonts.sans, size: multi ? tSize0 * 0.72 : tSize0, maxWidth: tMaxW, weight: 750, minSize: tSize0 * 0.36 })));
  const kSize = portrait ? 52 : 32;
  // 暗幕尺寸跟随标题块（只压文字区域，四周的光保留）
  const blockW = Math.max(...[...rows1, ...rows2].map((t) => measureText(t, fonts.sans, tSize, 750)), 400);
  const blockH = (rows1.length + rows2.length) * tSize * 1.16 + (kicker ? kSize * 1.6 : 0) + (BRAND.name ? 90 * S : 0) + 30 * S;
  const scrimRX = Math.min(1500, blockW / 2 + (portrait ? 420 : 300));
  const scrimRY = blockH / 2 + (portrait ? 380 : 230);
  const kickSz = fitSize(kicker, { family: fonts.sans, size: kSize, maxWidth: tMaxW, weight: 700, minSize: 18, letterSpacingEm: 0.12 });
  const g1 = Math.min(5, 16 / Math.max(1, line1.split(/\s+/).length));
  const g2 = Math.min(5, 16 / Math.max(1, line2.split(/\s+/).length));

  const push = 1 + 0.04 * ramp(frame, 0, ICON_FIELD_COLORIZE_DURATION, EASE.smooth);
  const title = ramp(frame, 118, 22, EASE.out);
  const litAll = ramp(frame, 66, 34, EASE.out);
  const headIn = ramp(frame, 120, 14, EASE.out);
  const headUp = (1 - ramp(frame, 120, 18, EASE.snappy)) * 12;
  return (
    <AbsoluteFill style={{ background: L.bg[2], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.0 }} fill={{ x: 0.5, y: 1.1 }} intensity={0.45 + 0.35 * litAll} grain={0} vignette={0.62} />
      {/* 光溢出：每一行亮起后身后染上同色的横向光带 */}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: `960px ${SH / 2}px` }}>
        {rowColor.map((c, r) => c && (
          <div key={r} style={{
            position: 'absolute', left: -100, right: -100, top: Y0 + r * CELL_Y + TILE / 2 - CELL_Y * 1.1, height: CELL_Y * 2.2,
            background: `linear-gradient(180deg, ${css(c, 0)} 0%, ${css(c, 0.16 * rowLit[r])} 50%, ${css(c, 0)} 100%)`,
          }} />
        ))}
      </div>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `960px ${SH / 2}px`, opacity: 1 - 0.12 * inhale }}>{icons}</AbsoluteFill>

      {/* 收尾：中心暗幕 + 标题（暗幕只压中心，四周的光保留） */}
      <AbsoluteFill style={{
        opacity: title, pointerEvents: 'none',
        background: `radial-gradient(ellipse ${scrimRX.toFixed(0)}px ${scrimRY.toFixed(0)}px at 50% 50%, ${alpha('#0a0503', 0.93)} 0%, ${alpha('#0a0503', 0.88)} 62%, ${alpha('#0a0503', 0)} 100%)`,
      }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        {/* 眉题位：视频品牌字标 + 眉题 */}
        {BRAND.name ? (
          <div style={{ opacity: headIn, transform: `translateY(${headUp.toFixed(2)}px)`, marginBottom: kicker ? 18 * S : 0 }}>
            <ShotcraftWordmark size={36 * S} tone="dark" />
          </div>
        ) : null}
        {kicker ? (
          <div style={{ ...type(kickSz, 700), lineHeight: 1.3, letterSpacing: '0.12em', color: css(WAVES[1].color), whiteSpace: 'nowrap', opacity: headIn, transform: `translateY(${headUp.toFixed(2)}px)` }}>{kicker}</div>
        ) : null}
        <div style={{ marginTop: 30 * S, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {rows1.map((t, i) => (
            <Rise key={`a${i}`} text={t} start={124 + i * 3} g={g1} style={{ ...type(tSize, 750), lineHeight: 1.16, color: L.ink, textAlign: 'center', textShadow: `0 4px 28px ${alpha('#0a0503', 0.85)}` }} />
          ))}
          {/* 第二行用第一道波的暖金（background-clip:text 遇到逐词 transform 的子元素会整行消失，不用渐变字） */}
          {rows2.map((t, i) => (
            <Rise key={`b${i}`} text={t} start={132 + i * 3} g={g2} style={{ ...type(tSize, 750), lineHeight: 1.16, color: css(WAVES[0].color), textAlign: 'center', textShadow: `0 4px 28px ${alpha('#0a0503', 0.85)}` }} />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
