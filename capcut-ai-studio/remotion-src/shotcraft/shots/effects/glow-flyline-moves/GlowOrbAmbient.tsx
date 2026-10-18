// glow-orb-ambient｜暗场光斑呼吸——三团大光斑有机漂移，中央卡的边缘随最近的光斑靠近而泛光。
//
// 第二轮重设计（深海潮汐 · 磨砂玻璃卡）：
// - look = custom「abyss」：带青色相的深海黑底，三团光斑 = 潮青（主光）/ 深海蓝 / 一小团珊瑚（唯一暖色点缀）。
//   光斑不再是 blur(100px) 的灰团，而是 1200 / 1000 / 760px 的多段径向渐变（screen 叠加，不用实时模糊）。
// - 主角是一张 1100×600 的磨砂玻璃卡（backdrop 模糊 + 提饱和）：光斑从卡后游过时，颜色真的透过玻璃
//   染进卡面——卡和光斑"认识"彼此不再只靠外发光。外缘辉光取最近光斑的颜色与距离，另有一道发丝线宽的
//   定向轮廓光，角度跟着主导光斑转、只在受光一侧亮。
// - 内容是成片预览卡（品牌轮由助眠 app「Nocta」换来）：镜刻标志 + 字标、160px 标题
//   「Launch film」、36px 卖点说明、64 根随潮汐缓慢起伏的音轨波形条 + 64px 等宽剩余时间（每秒跳一次）——
//   画面在呼吸，但都是慢动作。
// - 节奏：快入场、长呼吸、缓收敛。卡片 8–34f 由虚到实升起（snappy），字逐行跟进；光斑与声波共享一条
//   "潮汐时间"，115–145f 按 out-sine 减速收敛（起始斜率 = 1，速度连续），之后真静止 25f。
//
// 时间表（30fps，共 170f）：
//   0–24     光斑从暗处亮起（第 1 帧就有微光）
//   8–34     卡片升起：translateY 48→0、scale 0.96→1、淡入
//   18–56    卡内文字：标题逐字 blur 揭示（18f 起）→ 说明（32f）→ 声波条从左到右长出（36–60f）
//   0–115    正常速度漂移（周期 96–150f 交叉不等，振幅合计 ≥ 260px）
//   115–145  潮汐时间 out-sine 收敛冻结；镜头 1→1.03 极缓推进同步落定
//   145–170  真静止 hold
//
// [Agent Edit] o chu: kicker (dong tren cung trai, canh logo cua video) / label (nut "Đang phát" goc phai) /
// title (tieu de lon, hien tung chu tu mo) / subtitle (cau phu). Dong ho dem nguoc + chu "CÒN LẠI" la chi tiet giao dien.
// Chu dai: tieu de / cau phu tu xuong dong (can doi) trong be ngang the; the tu cao len theo so dong.
// Khung doc (portrait.mode = 'native'): the rong 1680, chu to hon; ba quang sang to hon va trai doc theo chieu cao that.
import { useCurrentFrame, useVideoConfig, useText, useShotFonts, useBrand, wrapLines, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, Grain, Vignette, ramp } from '../../../fixtures/Polish';
import { TextReveal, alpha } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const GLOW_ORB_AMBIENT_DURATION = 170; // ~5.7s：亮起 → 漂移 → 115–145f 收敛 → 末 25f 真静止

// 自定义 look「abyss」：深海青黑 + 潮青 / 深海蓝 / 珊瑚
const C = {
  bg: ['#071a1e', '#041114', '#02090b'],
  ink: '#eefaf7', ink2: '#a3c2bd', ink3: '#5f807b',
  teal: '#1fd1b2', blue: '#2f6bff', coral: '#ff7059',
};

const W = 1920;
const CX = W / 2;

const h = (n: number) => {
  const s = Math.sin(n * 127.3) * 43758.5453;
  return s - Math.floor(s);
};
const TAU = Math.PI * 2;

type Orb = { size: number; peak: number; c: string; bx: number; by: number; p1: number; p2: number; ax: number; ay: number; seed: number };
const ORBS: Orb[] = [
  { size: 1200, peak: 0.55, c: C.teal, bx: 560, by: 360, p1: 118, p2: 150, ax: 300, ay: 200, seed: 1 },
  { size: 1000, peak: 0.5, c: C.blue, bx: 1420, by: 660, p1: 132, p2: 96, ax: 280, ay: 190, seed: 2 },
  { size: 760, peak: 0.42, c: C.coral, bx: 1240, by: 220, p1: 104, p2: 142, ax: 300, ay: 160, seed: 3 },
];

// sy: he so doc (khung doc: vi tri / bien do doc trai theo chieu cao that)
const orbPos = (o: Orb, t: number, sy: number, sa: number) => {
  const f1 = h(o.seed * 7 + 1) * TAU, f2 = h(o.seed * 7 + 2) * TAU, f3 = h(o.seed * 7 + 3) * TAU, f4 = h(o.seed * 7 + 4) * TAU;
  return {
    x: o.bx + o.ax * (0.62 * Math.sin((TAU * t) / o.p1 + f1) + 0.38 * Math.sin((TAU * t) / o.p2 + f2)),
    y: (sy > 1 ? o.by * sy * 0.9 + 1080 * sy * 0.05 : o.by) + o.ay * sa * (0.6 * Math.sin((TAU * t) / o.p2 + f3) + 0.4 * Math.sin((TAU * t) / o.p1 + f4)),
  };
};

// 潮汐时间：0–115 与帧同速；115–145 out-sine 减速（A = 60/π 使起始斜率 = 1，速度连续）；之后冻结
const T0 = 115, TS = 30;
const tide = (f: number) => (f <= T0 ? f : T0 + (2 * TS / Math.PI) * Math.sin((Math.PI / 2) * Math.min(1, (f - T0) / TS)));

// 声波条高度（潮汐时间的纯函数 → 收敛时一起停）
const BARS = 64;
const barH = (i: number, t: number) => {
  const x = i / (BARS - 1);
  const env = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, x * 1.05)) ** 0.8;
  const w = 0.5 + 0.28 * Math.sin(i * 0.42 + t / 9) + 0.16 * Math.sin(i * 1.13 - t / 14) + 0.06 * Math.sin(i * 2.7 + t / 5);
  return Math.max(0.08, env * w);
};

// xuong dong can doi (giu so dong cua cach tach tham lam, thu hep be ngang de khong co tu mo coi)
const wrapBalanced = (text: string, family: string, size: number, maxWidth: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxWidth, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxWidth * 0.4, hi = maxWidth;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length > base.length) lo = mid; else hi = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

export const GlowOrbAmbient: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'BẢN TIN SÁNG NAY');
  const label = useText('label', 'Đang phát');
  const title = useText('title', 'Chậm lại một nhịp').normalize('NFC');
  const sub = useText('subtitle', 'Năm phút mỗi sáng để đầu óc thật sự nghỉ ngơi').normalize('NFC');
  const t = tide(f);

  // ── bo cuc the ──
  const K = portrait ? 1.45 : 1; // he so co chu / chi tiet trong the
  const CARD_W = portrait ? 1680 : 1100;
  const PAD = 64 * (portrait ? 1.25 : 1);
  const TW = CARD_W - PAD * 2 - 10;
  let TSZ = portrait ? 210 : 160;
  let tl = wrapBalanced(title, fonts.sans, TSZ, TW, 650, portrait ? 3 : 2);
  if (tl.length > 1) TSZ = Math.round(TSZ * (portrait ? 0.82 : 0.72));
  tl = wrapBalanced(title, fonts.sans, TSZ, TW, 650, portrait ? 3 : 2);
  TSZ = Math.min(...tl.map((l) => fitSize(l, { family: fonts.sans, size: TSZ, maxWidth: TW, weight: 650, minSize: portrait ? 90 : 60, letterSpacingEm: -0.045 })));
  const tLH = TSZ * (tl.length > 1 ? 1.12 : 1.05);
  const SSZ = portrait ? 56 : 36;
  const sl = sub ? wrapBalanced(sub, fonts.sans, SSZ, TW, 450, portrait ? 3 : 2) : [];
  const sLH = SSZ * 1.32;
  const topBar = 56 * K;
  const titleTop = topBar + 94 * K;
  const subTop = titleTop + tl.length * tLH + 26 * K;
  const barsH = 96 * K;
  const CARD_H = Math.max(portrait ? 900 : 600, subTop + sl.length * sLH + 56 * K + barsH + 64 * K);
  const CY = portrait ? SH / 2 : 1080 / 2 + 10;
  const sy = portrait ? SH / 1080 : 1;
  const sa = portrait ? 1.8 : 1;
  const sz = portrait ? 2 : 1;

  const orbIn = 0.35 + 0.65 * ramp(f, 0, 24, EASE.out);
  const cardIn = ramp(f, 8, 26, EASE.snappy);
  const cam = 1 + 0.03 * ramp(f, 0, 145, EASE.smooth);

  const pos = ORBS.map((o) => orbPos(o, t, sy, sa));

  // 卡缘：最近光斑距离 → 辉光强度（按峰值加权取 max）；主导光斑决定轮廓光方向与颜色
  let glowK = 0, lead = 0;
  ORBS.forEach((o, i) => {
    const d = Math.hypot(pos[i].x - CX, pos[i].y - CY);
    const p = Math.min(1, Math.max(0, (760 * sz - d) / (520 * sz)));
    const g = p * (o.peak / 0.55);
    if (g > glowK) { glowK = g; lead = i; }
  });
  const leadC = ORBS[lead].c;
  const lp = pos[lead];
  const ang = (Math.atan2(lp.x - CX, -(lp.y - CY)) * 180) / Math.PI;
  const gAng = (ang + 180).toFixed(1); // 渐变 0% 落在朝光一侧

  // 剩余时间：每秒跳一次（收敛后停住）
  const secs = 42 - Math.floor(Math.min(f, 145) / 30);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  const barsIn = (i: number) => ramp(f, 36 + i * 0.36, 14, EASE.snappy);
  const nChars = Math.max(1, tl.join('').length);
  const cGap = Math.min(2.2, 34 / nChars);
  let ci = 0;
  const sWords = Math.max(1, sub.split(/\s+/).filter(Boolean).length);
  const sGap = Math.min(2.5, 22 / sWords);
  let swi = 0;
  const topName = [brand?.name, kicker].filter(Boolean).join(' · ');
  // dong tren cung: thu nho vua phan con trong (tru logo + nut trang thai), khong cat chu
  const pillW = label ? measureText(label, fonts.sans, 30 * K, 550) + 80 * K : 0;
  const nameW = CARD_W - PAD * 2 - (brand ? 74 * K : 0) - pillW - 30 * K;
  const nameSz = fitSize(topName, { family: fonts.sans, size: 34 * K, maxWidth: nameW, weight: 650, minSize: 20 * K, letterSpacingEm: 0.03 });

  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.bg[0]} 0%, ${C.bg[1]} 55%, ${C.bg[2]} 100%)`, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: `${CX}px ${CY}px` }}>
        {/* 光斑：多段径向渐变（不做实时 blur），screen 叠加 */}
        {ORBS.map((o, i) => (
          <div key={i} style={{
            position: 'absolute', left: pos[i].x - (o.size * sz) / 2, top: pos[i].y - (o.size * sz) / 2, width: o.size * sz, height: o.size * sz, borderRadius: '50%',
            background: `radial-gradient(circle closest-side, ${alpha(o.c, o.peak)} 0%, ${alpha(o.c, o.peak * 0.62)} 22%, ${alpha(o.c, o.peak * 0.3)} 48%, ${alpha(o.c, o.peak * 0.1)} 72%, ${alpha(o.c, 0)} 100%)`,
            opacity: orbIn, mixBlendMode: 'screen',
          }} />
        ))}
        {/* [Agent Edit] bo luoi cham trang tri (远景细点阵) theo yeu cau: khong luoi ke o / luoi cham */}

        {/* 主角：磨砂玻璃卡 */}
        <div style={{
          position: 'absolute', left: CX - CARD_W / 2, top: CY - CARD_H / 2, width: CARD_W, height: CARD_H, borderRadius: 44 * K,
          // 注意：玻璃卡的祖先不能带 filter / opacity<1（会成为 backdrop root，玻璃里看不到光斑）——
          // 入场的透明度放在玻璃层自身，外层只做 transform
          transform: `translateY(${(1 - cardIn) * 48}px) scale(${0.96 + 0.04 * cardIn})`,
          boxShadow: `0 0 ${(90 * glowK).toFixed(1)}px ${(8 * glowK).toFixed(1)}px ${alpha(leadC, 0.32 * glowK)}, 0 50px 120px -30px rgba(0,0,0,0.85)`,
        }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 44 * K, overflow: 'hidden', opacity: Math.min(1, cardIn * 1.3),
            background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.035) 45%, rgba(255,255,255,0.05) 100%)',
            backdropFilter: 'blur(44px) saturate(1.5)', WebkitBackdropFilter: 'blur(44px) saturate(1.5)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 1.5px 0 rgba(255,255,255,0.18)',
          }}>
            {/* 卡面受光余晖：主导光斑方向一侧 */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.7 * glowK, background: `linear-gradient(${gAng}deg, ${alpha(leadC, 0.16)} 0%, ${alpha(leadC, 0)} 55%)` }} />

            {/* 顶栏 */}
            <div style={{ position: 'absolute', left: PAD, right: PAD, top: topBar, display: 'flex', alignItems: 'center', gap: 18 * K, opacity: ramp(f, 14, 14, EASE.out) }}>
              {brand ? <ShotcraftMark size={56 * K} tone="dark" /> : null}
              <div style={{ fontFamily: fonts.sans, fontSize: nameSz, fontWeight: 650, letterSpacing: '0.03em', color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto' }}>{topName}</div>
              {label ? (
                <div style={{
                  marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 12 * K, padding: `${10 * K}px ${22 * K}px`, borderRadius: 40 * K,
                  background: 'rgba(255,255,255,0.07)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', fontFamily: fonts.sans, fontSize: 30 * K, fontWeight: 550, color: C.ink2, whiteSpace: 'nowrap',
                }}>
                  <div style={{ width: 12 * K, height: 12 * K, borderRadius: 6 * K, background: C.teal, boxShadow: `0 0 12px ${C.teal}` }} />
                  {label}
                </div>
              ) : null}
            </div>

            {/* 标题 + 说明 */}
            {tl.map((l, i) => {
              const st = 18 + ci * cGap;
              ci += l.length;
              return (
                <div key={i} style={{ position: 'absolute', left: PAD - 4, top: titleTop + i * tLH, whiteSpace: 'nowrap' }}>
                  <TextReveal text={l} by="char" variant="blur" start={st} each={20} gap={cGap}
                    style={{ fontFamily: fonts.sans, fontSize: TSZ, fontWeight: 650, lineHeight: 1.12, letterSpacing: '-0.045em', color: C.ink }} />
                </div>
              );
            })}
            {sl.map((l, i) => {
              const st = 32 + swi * sGap;
              swi += l.split(/\s+/).filter(Boolean).length;
              return (
                <div key={i} style={{ position: 'absolute', left: PAD + 2, top: subTop + i * sLH, whiteSpace: 'nowrap' }}>
                  <TextReveal text={l} by="word" variant="blur" start={st} each={16} gap={sGap}
                    style={{ fontFamily: fonts.sans, fontSize: SSZ, fontWeight: 450, lineHeight: 1.32, letterSpacing: '-0.02em', color: C.ink2 }} />
                </div>
              );
            })}

            {/* 声波条 + 剩余时间 */}
            <div style={{ position: 'absolute', left: PAD + 2, bottom: 64 * K, width: 700 * K, height: barsH, display: 'flex', alignItems: 'center', gap: 5 * K }}>
              {Array.from({ length: BARS }, (_, i) => {
                const k = barsIn(i);
                const played = i < 22;
                return (
                  <div key={i} style={{
                    width: 6 * K, flex: 'none', height: Math.max(6, barsH * barH(i, t) * k), borderRadius: 3 * K,
                    background: played ? C.ink : alpha(C.ink, 0.28), opacity: k,
                  }} />
                );
              })}
            </div>
            <div style={{ position: 'absolute', right: PAD, bottom: 58 * K, textAlign: 'right', opacity: ramp(f, 40, 16, EASE.out) }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 64 * K, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {mm}:{ss}
              </div>
              <div style={{ fontFamily: fonts.sans, fontSize: 26 * K, fontWeight: 500, letterSpacing: '0.14em', color: C.ink3, marginTop: 12 * K }}>CÒN LẠI</div>
            </div>
          </div>
          {/* 定向轮廓光：发丝线宽渐变边，只在朝向主导光斑的一侧亮 */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 44 * K, padding: 1.5 * K, boxSizing: 'border-box', pointerEvents: 'none', opacity: cardIn,
            background: `linear-gradient(${gAng}deg, ${alpha(leadC, 0.2 + 0.75 * glowK)} 0%, rgba(255,255,255,${(0.14 * glowK).toFixed(3)}) 35%, rgba(255,255,255,0) 62%)`,
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude',
          }} />
        </div>
      </AbsoluteFill>
      <Vignette strength={0.5} inner={0.4} color="#010506" />
      <Grain opacity={0.1} blend="soft-light" />
    </AbsoluteFill>
  );
};
