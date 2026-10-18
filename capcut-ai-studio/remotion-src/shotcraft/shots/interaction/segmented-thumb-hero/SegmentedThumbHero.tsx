// segmented-thumb-hero —— 分段控件 thumb 位移当叙事主角拍特写
// 源：perplexity-promo 2.3–5s。胶囊分段控件（Ask/Computer）带阴影浮入，
// 超大描边箭头光标（k = khung doc phong to）从画外滑入点击，白 thumb 左→右 ~8f ease-out 滑动，
// 到位瞬间新选项前弹出小图标、旧图标收起。
// 质感升级：柔光纸面底 + 暗角颗粒；轨道做成下凹槽（内阴影 + 发丝线），thumb 是受光的凸起件
// （顶沿高光 + 近实远虚两层影）；thumb 8f 内前缘先走、后缘跟随的橡皮筋拉伸 + 速度拖影，
// 到位后 1.5% 过冲回弹；段标签颜色随 thumb 位置连续过渡；新图标带强调色笑脸；
// 光标起点挪到真正画外，两层投影；涟漪换强调色细环。时间轴不变。
// 品牌轮：两段从 Perplexity 的 Ask / Computer 换成 video-shotcraft 的 Prompt → Film
// （"一句话出一支片"），图标换成对话气泡 / 带笑脸的场记板，几何与时间轴不动。
//
// [Agent Edit] o chu: from (doan cu, trai) / to (doan moi, phai — duoc chon) / title (cau tren control, tuy chon).
// Icon trung tinh: mat "bình thường" (doan cu) -> mat cuoi mau nhan (doan moi, giu "phan thuong"). Mau nhan = LOOKS (theo video).
// Nhan dai: co chu chung 2 doan tu thu nho vua be ngang doan. Khung doc (native): control phong to x1.66, ca khoi
// (title + control) can giua theo chieu doc; toa do con tro / diem nhan tinh tu hinh hoc control (khong con so cung).
import { useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, wrapLines, useShot } from '../../../runtime';
import { LOOKS, alpha } from '../../../fixtures/Look';
import React from 'react';
import { AbsoluteFill, interpolate, Easing, spring } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { Backdrop, FONT, SpeedBlur, mix, velocity } from '../../../fixtures/Polish';

// [Agent Edit] o chu TUY CHON: app da gui noi dung (co texts) ma bo trong o nay -> '' (an di), khong hien chu mau
const useOptText = (id: string, sample: string): string => {
  const d = useShot();
  const v = useText(id, sample);
  const t = d?.texts[id];
  const app = !!d && Object.keys(d.texts).length > 0;
  return app && (t === undefined || (typeof t === 'string' && !t.trim())) ? '' : v;
};


export const SEGMENTED_THUMB_HERO_DURATION = 110; // 浮入 18f + 光标 24f + 点击 + 滑动 8f + 弹出 + hold 50f

const INK = G.ink1;
const DIM = '#8e9097';

// 超大描边箭头光标（k = khung doc phong to）（白芯墨描边，两层投影：近地实、远地虚）
const ArrowCursor: React.FC<{ x: number; y: number; press: number; k?: number }> = ({ x, y, press, k = 1 }) => (
  <svg
    width={130 * k}
    height={150 * k}
    viewBox="0 0 26 30"
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `scale(${1 - press * 0.14})`,
      transformOrigin: '15% 10%',
      filter: `drop-shadow(0 ${(2 - press) * k}px ${(3 - press) * k}px rgba(16,18,24,0.22)) drop-shadow(0 ${(12 - press * 6) * k}px ${(18 - press * 6) * k}px rgba(16,18,24,0.20))`,
    }}
  >
    <path
      d="M4 2 L4 24 L9.5 18.5 L13 27 L16.8 25.4 L13.3 17 L21 17 Z"
      fill="#fff"
      stroke={INK}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </svg>
);

// 新身份图标：带表情的笑脸（表情用唯一强调色，是"奖励感"的一半）
const SmileFace: React.FC<{ size: number; accent: string }> = ({ size, accent }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <circle cx={20} cy={20} r={14.6} fill="none" stroke={INK} strokeWidth={2.8} />
    <circle cx={15} cy={16.8} r={2} fill={accent} />
    <circle cx={25} cy={16.8} r={2} fill={accent} />
    <path d="M13.4 23.2 Q20 29.6 26.6 23.2" stroke={accent} strokeWidth={2.7} fill="none" strokeLinecap="round" />
  </svg>
);

// 旧身份图标：面无表情（一条直线嘴）
const PlainFace: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <circle cx={20} cy={20} r={14.6} fill="none" stroke={INK} strokeWidth={2.8} />
    <circle cx={15} cy={17} r={1.9} fill={INK} />
    <circle cx={25} cy={17} r={1.9} fill={INK} />
    <path d="M14.5 25.4 H25.5" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
  </svg>
);

// 颜色插值（#rrggbb）
const lerpHex = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
};

export const SegmentedThumbHero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const fromLabel = useText('from', 'Thủ công');
  const toLabel = useText('to', 'Tự động');
  const title = useOptText('title', 'Chỉ một chạm để đổi chế độ');
  const portrait = SH > 1080 * 1.2;
  const ACC = LOOKS.porcelain.accent;

  // ---- 时间轴 ----
  const FLOAT_IN = 0; // 控件浮入 0–18
  const CURSOR_IN = 20; // 光标滑入 20–44
  const CLICK = 48; // 按下
  const SLIDE = 52; // thumb 开始滑 52–60 (~8f)
  const SLIDE_END = 60;

  // 控件浮入：从下 200px 带阴影弹簧浮入
  const floatT = spring({ frame: frame - FLOAT_IN, fps, config: { damping: 14, stiffness: 120, mass: 0.9 } });

  // 控件几何（特写尺寸）；khung doc phong to K
  const K = portrait ? 1.66 : 1;
  const ctrlY = interpolate(floatT, [0, 1], [200 * K, 0]);
  const CW = 1080 * K; // 控件宽
  const CH = (portrait ? 240 : 220) * K;
  const PAD = 16 * K;
  const SEGW = (CW - PAD * 2) / 2;
  const TH = CH - PAD * 2; // thumb 高
  const ICON = (portrait ? 88 : 78) * K;
  const IGAP = 22 * K;
  // 两段共用字号：减去图标 + 间距 + 两侧留白后一行放下
  const labelMax = SEGW - ICON - IGAP - 44 * K;
  const L0 = (portrait ? 84 : 72) * K;
  const LSIZE = Math.min(
    fitSize(fromLabel, { family: fonts.sans, size: L0, maxWidth: labelMax, weight: 650, minSize: 30 * K, letterSpacingEm: -0.025 }),
    fitSize(toLabel, { family: fonts.sans, size: L0, maxWidth: labelMax, weight: 650, minSize: 30 * K, letterSpacingEm: -0.025 }),
  );

  // 标题（可选）：控件上方，最多 2 行（khung doc 3 行）
  const TSIZE0 = portrait ? 140 : 64;
  const tMaxW = portrait ? 1720 : 1500;
  const tLines = title ? wrapLines(title, fonts.sans, TSIZE0, tMaxW, 700, portrait ? 3 : 2) : [];
  const TSIZE = tLines.length
    ? Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: TSIZE0, maxWidth: tMaxW, weight: 700, minSize: TSIZE0 * 0.5, letterSpacingEm: -0.02 })))
    : 0;
  const tLH = TSIZE * 1.22;
  const tGap = tLines.length ? (portrait ? 150 : 90) : 0;
  const blockH = tLines.length * tLH + tGap + CH;
  const top0 = Math.round(SH / 2 - blockH / 2 + (portrait ? -40 : 0));
  const CX = 960 - CW / 2; // 控件左上
  const CY = top0 + tLines.length * tLH + tGap;
  const titleP = interpolate(frame, [6, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  // 光标滑入：ease-out 从右下画外（整只光标在画框外）飘到"新"段上（原片：尖端落在控件 75% 宽、77% 高处）
  const curT = interpolate(frame, [CURSOR_IN, CURSOR_IN + 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const TIP = { x: CW * 0.75, y: CH * 0.77 }; // 控件 padding 盒坐标
  const tipOff = { x: 20 * K, y: 10 * K }; // 光标尖端在 svg 内 (4,2)×5
  const endX = CX + 1 + TIP.x - tipOff.x;
  const endY = CY + 1 + TIP.y - tipOff.y;
  const curX = interpolate(curT, [0, 1], [1920 + 100, endX]);
  const curY = interpolate(curT, [0, 1], [SH + 120, endY]);
  // 按下动作
  const press = interpolate(frame, [CLICK, CLICK + 3, CLICK + 7], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // thumb 位移：~8f ease-out（主曲线），前缘略快、后缘略慢 → 滑动中被拉长 ~10%，到位收回；
  // 到位后 1.5% 过冲回弹（6f 内收敛），给"落定"一个物理感
  const slide = (f: number, ease: (x: number) => number) =>
    interpolate(f, [SLIDE, SLIDE_END], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const thumbT = slide(frame, Easing.out(Easing.cubic));
  const settle = (f: number) =>
    f < SLIDE_END ? 0 : 0.015 * Math.sin(Math.min(1, (f - SLIDE_END) / 6) * Math.PI) * (1 - Math.min(1, (f - SLIDE_END) / 6));
  const leadAt = (f: number) => slide(f, Easing.out(Easing.poly(4))) + settle(f);
  const trailAt = (f: number) => slide(f, Easing.out(Easing.quad)) + settle(f);
  const thumbL = PAD + trailAt(frame) * SEGW; // 后缘（左）
  const thumbR = PAD + SEGW + leadAt(frame) * SEGW; // 前缘（右）
  const thumbV = velocity((f) => PAD + slide(f, Easing.out(Easing.cubic)) * SEGW, frame);

  // 到位瞬间：新图标弹出（过冲），旧图标收起
  const iconIn = spring({ frame: frame - SLIDE_END, fps, config: { damping: 10, stiffness: 220, mass: 0.6 } });
  const newScale = frame >= SLIDE_END ? iconIn : 0;
  const oldScale = interpolate(frame, [SLIDE, SLIDE + 6], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

  // 点击涟漪
  const rippleT = interpolate(frame, [CLICK, CLICK + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  const RR = 130 * K;

  const labelStyle = (activeAmt: number): React.CSSProperties => ({
    fontFamily: FONT.sans,
    fontWeight: 650,
    fontSize: LSIZE,
    lineHeight: 1.25,
    letterSpacing: '-0.025em',
    whiteSpace: 'nowrap',
    color: lerpHex(DIM, INK, activeAmt),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: IGAP,
    width: SEGW,
    height: TH,
    position: 'relative',
    zIndex: 2,
  });

  // 标签激活度跟着 thumb 位置连续变（不再在 0.5 处硬跳色）
  const compAmt = Math.min(1, Math.max(0, (thumbT - 0.2) / 0.6));
  // 旧图标 width 与 scale 同步归零（文字回流）
  const oldW = oldScale < 0.05 ? 0 : ICON * oldScale;
  const newW = newScale < 0.05 ? 0 : ICON * Math.min(1, newScale);

  return (
    <AbsoluteFill>
      <Backdrop tone="light" light={{ x: 0.5, y: portrait ? 0.4 : 0.3 }} accent={ACC} />
      {/* 控件身下的接触光池：浮入落定后把控件"放"在台面上 */}
      <div
        style={{
          position: 'absolute',
          left: 960 - 700 * K,
          top: CY + CH / 2 - 90 * K,
          width: 1400 * K,
          height: 260 * K,
          background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 70%)',
          opacity: floatT,
        }}
      />
      {tLines.length ? (
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: top0, textAlign: 'center',
            fontFamily: fonts.sans, fontWeight: 700, fontSize: TSIZE, lineHeight: `${tLH}px`, letterSpacing: '-0.02em', color: INK,
            opacity: titleP, transform: `translateY(${((1 - titleP) * 30 * K).toFixed(2)}px)`,
          }}
        >
          {tLines.map((l, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>
          ))}
        </div>
      ) : null}
      {/* 分段控件：下凹轨道 */}
      <div
        style={{
          position: 'absolute',
          left: CX,
          top: CY,
          width: CW,
          height: CH,
          borderRadius: CH / 2,
          background: 'linear-gradient(180deg, #e2e2df 0%, #e9e9e6 100%)',
          border: '1px solid rgba(20,22,28,0.09)',
          boxShadow: [
            `inset 0 ${2 * K}px ${5 * K}px rgba(16,18,24,0.08)`,
            'inset 0 -1px 0 rgba(255,255,255,0.7)',
            '0 1px 0 rgba(255,255,255,0.9)',
            `0 ${(mix(30, 14, floatT) * K).toFixed(1)}px ${(mix(80, 44, floatT) * K).toFixed(1)}px ${-18 * K}px rgba(16,18,24,${mix(0.32, 0.2, floatT).toFixed(3)})`,
          ].join(', '),
          transform: `translateY(${ctrlY}px)`,
          opacity: Math.min(1, floatT * 1.5),
          display: 'flex',
          alignItems: 'center',
          padding: PAD,
          boxSizing: 'border-box',
        }}
      >
        {/* 白色 thumb：受光凸起件，滑动中前后缘错开形成拉伸 + 速度拖影 */}
        <SpeedBlur vx={thumbV} amount={0.06} max={6} style={{ zIndex: 1 }}>
          <div
            style={{
              position: 'absolute',
              left: thumbL,
              top: PAD,
              width: thumbR - thumbL,
              height: TH,
              borderRadius: TH / 2,
              background: 'linear-gradient(180deg, #ffffff 0%, #fbfbfa 100%)',
              boxShadow: `inset 0 1.5px 0 rgba(255,255,255,1), 0 0 0 1px rgba(20,22,28,0.06), 0 ${2 * K}px ${4 * K}px rgba(16,18,24,0.08), 0 ${12 * K}px ${28 * K}px ${-8 * K}px rgba(16,18,24,0.20)`,
            }}
          />
        </SpeedBlur>
        {/* 点击涟漪（圆心锁点击点，压在 thumb 之上） */}
        {rippleT > 0 && rippleT < 1 && (
          <div
            style={{
              position: 'absolute',
              left: TIP.x - RR * rippleT,
              top: TIP.y - RR * rippleT,
              width: 2 * RR * rippleT,
              height: 2 * RR * rippleT,
              borderRadius: '50%',
              boxSizing: 'border-box',
              border: `${3 * K}px solid ${ACC}`,
              background: `radial-gradient(circle, ${alpha(ACC, 0)} 50%, ${alpha(ACC, 0.12)} 100%)`,
              opacity: (1 - rippleT) * 0.9,
              zIndex: 3,
            }}
          />
        )}
        {/* 旧段 */}
        <div style={labelStyle(1 - compAmt)}>
          <span style={{ display: 'inline-flex', justifyContent: 'center', transform: `scale(${oldScale})`, width: oldW, marginRight: -IGAP * (1 - oldScale), overflow: 'visible' }}>
            <PlainFace size={ICON} />
          </span>
          {fromLabel}
        </div>
        {/* 新段 */}
        <div style={labelStyle(compAmt)}>
          <span style={{ display: 'inline-flex', justifyContent: 'center', transform: `scale(${newScale})`, width: newW, marginRight: -IGAP * (1 - Math.min(1, newScale)), overflow: 'visible' }}>
            <SmileFace size={ICON} accent={ACC} />
          </span>
          {toLabel}
        </div>
      </div>
      <ArrowCursor x={curX} y={curY} press={press} k={K} />
    </AbsoluteFill>
  );
};
