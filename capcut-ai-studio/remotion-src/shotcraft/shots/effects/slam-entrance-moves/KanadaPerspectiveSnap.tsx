// 金田透视急停（kanada-perspective-snap）——金田伊功式夸张透视入场：卡片以鱼眼级透视姿态贴着镜头
// 从左侧甩进画面中心，透视随减速从短焦收敛到长焦，落定瞬间"啪"地弹平（rotateY 过冲再回零）。
//
// 第二轮重设计（极光夜 · 首映卡）：
// - look = aurora（紫黑 · 紫 · 粉）。主角是一张首映 / 发布卡（1000×580）：左半是程序化插画
//   （霓虹黄昏天空 + 条纹落日 + 城市剪影 + 水面倒影），右半是 92px 大标题、信息行与 CTA 按钮。
//   顶部一条 168px 低透明大字带（标题重复）做海报底，缓慢反向漂移（视差）。
// - 甩入 18f（2→20f）：translateX −1350→0 + 轻微下弧、rotate3d(0.5,1,0.1) 62°→0、scale 1.8→1、
//   perspective 260→1800px，全部 EASE.snappy（先猛后缓的急停）；按 x 速度给水平 SpeedBlur + 身后 7 条粉白速度线。
// - "啪"在过冲：16–20f rotateY 冲到 +6°，20f 起弹簧（damping 16）回零；同帧 2f 震屏 8px、
//   一圈动漫集中线（48 道细楔形从画框边缘指向卡心）8f 内向外退散——金田流的"定格一拍"。
// - 跟随：卡内文字比卡片晚 3f 落定（片名带 −10° skew 收正的"拖影"），落定后字幕逐词升起。
//
// 时间表（30fps，共 120f）：
//   0–2     预备：舞台光、背景大字已在，卡片近角在左缘外
//   2–20    透视甩入（主动作 18f）
//   16–26   rotateY 过冲 +6° → 弹簧回零；20f 震屏 2f + 集中线 8f
//   23–36   跟随：卡内文字晚一拍滑入落定、片名 skew 收正
//   34–56   字幕逐词升起（+ 品牌名）
//   56–120  hold：极缓推镜 1→1.025、背景大字慢漂
//
// [Agent Edit] o chu: badge (nhan tren the) / title (tieu de lon, tu xuong dong 1-3 dong) / subtitle / meta (dong thong tin
// nho) / cta (nut) / caption (dong chu duoi the, + ten thuong hieu neu co). O anh `cover` (optional): anh minh hoa nua trai
// the (khung doc: nua tren), objectFit cover; khong co -> giu tranh ve hoang hon thanh pho. Khung doc (native): the doc
// 1300 rong (anh tren, chu duoi), chu to, ca khoi can giua; quang duong bay / phoi canh nhan theo co the.
import { useBackdrop, useCurrentFrame, useImage, useShotFonts, useText, useVideoConfig, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, FONT, SpeedBlur, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, springAt } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const KANADA_PERSPECTIVE_SNAP_DURATION = 120;

const L = LOOKS.aurora;
const PINK = L.accent2;
const T0 = 2; // 甩入起点
const SNAP = 20; // 落定帧
const CH0 = 580; // 横屏卡高（插画 viewBox 高）

// 确定性伪随机
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const progAt = (f: number) => ramp(f, T0, SNAP - T0, EASE.snappy);
// 姿态（透视 / 扭转 / 缩放）比位移晚收：卡片"扭着"冲到位，最后几帧才被拍平——金田流的关键
const TWIST = bezier(0.62, 0, 0.3, 1);
const twistAt = (f: number) => ramp(f, T0, SNAP - T0 - 2, TWIST);
const txAt = (f: number, k = 1) => mix(-1350 * k, 0, progAt(f));
const tyAt = (f: number, k = 1) => 120 * k * Math.sin((1 - progAt(f)) * Math.PI * 0.5) * (1 - progAt(f)); // 轻微下弧

// 速度线（相对卡片中心 y、长度系数、粗细）
const STREAKS = [-250, -170, -90, -20, 60, 140, 230].map((y, i) => ({ y, len: 0.7 + rnd(i + 3) * 0.6, w: 2 + rnd(i + 11) * 3 }));
// 集中线：48 道细楔形
const FOCUS = Array.from({ length: 48 }, (_, i) => ({
  a: (i / 48) * Math.PI * 2 + (rnd(i * 3.3) - 0.5) * 0.09,
  w: 0.006 + rnd(i * 5.1) * 0.014, // 楔形角宽（弧度）
  r0: 560 + rnd(i * 7.7) * 220, // 内端半径
}));
// 城市剪影：确定性楼宇
const TOWERS = Array.from({ length: 16 }, (_, i) => ({ x: i * 36 - 6, w: 30 + rnd(i * 2.1) * 18, h: 50 + rnd(i * 4.7) ** 1.4 * 150 }));

const Artwork: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <svg width={w} height={h} viewBox={`0 0 560 ${CH0}`} preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', left: 0, top: 0 }}>
    <defs>
      <linearGradient id="kps-sky" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#1d0b3d" />
        <stop offset="0.38" stopColor="#5b1f78" />
        <stop offset="0.6" stopColor="#ff5fa2" />
        <stop offset="0.7" stopColor="#ffb36b" />
      </linearGradient>
      <linearGradient id="kps-sun" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fff1a8" />
        <stop offset="0.55" stopColor="#ffb15e" />
        <stop offset="1" stopColor="#ff4f9a" />
      </linearGradient>
      <linearGradient id="kps-water" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#ff7aa8" stopOpacity="0.55" />
        <stop offset="1" stopColor="#14082a" stopOpacity="1" />
      </linearGradient>
      <mask id="kps-stripes">
        <rect x={0} y={0} width={560} height={CH0} fill="#fff" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={0} y={300 + i * 18 + i * i * 1.2} width={560} height={3 + i * 2.2} fill="#000" />
        ))}
      </mask>
    </defs>
    <rect x={0} y={0} width={560} height={CH0} fill="url(#kps-sky)" />
    {/* 高空星点 */}
    {Array.from({ length: 30 }, (_, i) => (
      <circle key={i} cx={rnd(i * 9.1) * 560} cy={rnd(i * 3.7 + 1) * 180} r={0.8 + rnd(i * 1.3) * 1.6} fill="#fff" opacity={0.4 + rnd(i * 6.2) * 0.5} />
    ))}
    {/* 条纹落日 */}
    <circle cx={280} cy={330} r={150} fill="url(#kps-sun)" mask="url(#kps-stripes)" />
    <circle cx={280} cy={330} r={190} fill="none" stroke="#ffd3a1" strokeOpacity={0.18} strokeWidth={30} />
    {/* 城市剪影 + 零星亮窗 */}
    {TOWERS.map((t, i) => (
      <g key={i}>
        <rect x={t.x} y={410 - t.h} width={t.w} height={t.h} fill={i % 3 === 0 ? '#2a0f45' : '#1b0a30'} />
        {Array.from({ length: Math.floor(t.h / 26) }, (_, k) =>
          rnd(i * 13 + k * 3.1) > 0.62 ? (
            <rect key={k} x={t.x + 6 + (k % 2) * 10} y={410 - t.h + 10 + k * 24} width={5} height={8} fill={rnd(i + k) > 0.5 ? '#ff8fc0' : '#ffd27a'} opacity={0.85} />
          ) : null,
        )}
      </g>
    ))}
    {/* 水面倒影 */}
    <rect x={0} y={410} width={560} height={CH0 - 410} fill="url(#kps-water)" />
    {Array.from({ length: 9 }, (_, i) => (
      <rect key={i} x={170 + rnd(i * 2.7) * 40 - i * 4} y={424 + i * 15} width={220 - i * 18 + rnd(i) * 30} height={3} rx={1.5} fill="#ffd7a0" opacity={0.55 - i * 0.05} />
    ))}
  </svg>
);


// 多行自适应：从 size 往下试，直到按真实宽度折行 ≤ maxLines 且每行不超宽（字距 em 计入）
const fitWrap = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number, trackEm = 0, minK = 0.42) => {
  const words = text.split(/\s+/).filter(Boolean);
  const w = (t: string, sz: number) => measureText(t, family, sz, weight) + Math.max(0, t.length - 1) * trackEm * sz;
  for (let sz = size; ; sz *= 0.94) {
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const t = cur ? cur + ' ' + word : word;
      if (cur && w(t, sz) > maxW) { lines.push(cur); cur = word; } else cur = t;
    }
    if (cur) lines.push(cur);
    const ok = lines.length <= maxLines && lines.every((l) => w(l, sz) <= maxW);
    if (ok || sz <= size * minK) {
      const fit = Math.min(sz, ...lines.map((l) => (sz * maxW) / Math.max(1, w(l, sz))));
      return { lines, size: Math.max(size * minK * 0.8, fit) };
    }
  }
};

export const KanadaPerspectiveSnap: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const bd = !!useBackdrop(); // nen anh AI: Stage tu bo gradient, bo dai chu nen mo; chu tren nen them bong
  const badge = useText('badge', 'RA MẮT');
  const title = useText('title', 'Phiên bản mới');
  const sub = useText('subtitle', 'Nhanh hơn, gọn hơn, thông minh hơn.');
  const meta = useText('meta', 'THỨ SÁU · 20:00');
  const cta = useText('cta', 'Xem ngay');
  const caption = useText('caption', 'Công chiếu tối thứ Sáu');
  const cover = useImage('cover');

  // ── 卡片几何：横屏 1000×580（左图右字）；竖屏 1300 宽竖排（上图下字），高度按文字排版 ──
  const CW = portrait ? 1300 : 1000;
  const k = CW / 1000; // 飞行距离 / 透视 / 速度线随卡片尺寸缩放
  const PAD = portrait ? 80 : 0;
  const infoW = portrait ? CW - PAD * 2 : 360;
  const T0S = portrait ? 150 : 92; // 标题字号
  const { lines: tLines, size: tSize } = fitWrap(title, fonts.sans, T0S, infoW, 880, 3, -0.05);
  const sS0 = portrait ? 64 : 30;
  const sub2 = sub ? fitWrap(sub, fonts.sans, sS0, infoW, 600, 2, -0.01, 0.6) : { lines: [] as string[], size: 0 };
  const sLines = sub2.lines;
  const sSize = sub2.size;
  const mSize = meta ? fitSize(meta, { family: fonts.mono, size: portrait ? 46 : 26, maxWidth: infoW, weight: 500, letterSpacingEm: 0.04, minSize: 16 }) : 0;
  const bS0 = portrait ? 44 : 22;
  const markSz = portrait ? 84 : 44;
  const bSize = badge ? fitSize(badge, { family: fonts.mono, size: bS0, maxWidth: infoW - markSz - 60, weight: 800, letterSpacingEm: 0.1, minSize: 14 }) : 0;
  const btnH = portrait ? 116 : 64;
  const cS0 = portrait ? 50 : 28;
  const ctaSize = cta ? fitSize(cta, { family: fonts.sans, size: cS0, maxWidth: infoW - btnH - 14 - btnH * 1.3, weight: 750, minSize: cS0 * 0.6 }) : 0;
  const tLH = 1.1; // 越南语叠加声调：多行标题行高 ≥1.1
  const infoH =
    (badge ? (portrait ? 84 : 44) + (portrait ? 40 : 30) : 0) +
    tLines.length * tSize * tLH + (portrait ? 30 : 22) +
    sLines.length * sSize * 1.3 + (meta ? (portrait ? 14 : 8) + mSize * 1.4 : 0) +
    (cta ? (portrait ? 44 : 30) + btnH : 0);
  const ARTH = portrait ? 700 : CH0; // 插画区高（竖屏在上）
  const CH = portrait ? ARTH + infoH + PAD * 1.6 : CH0;
  const capS0 = portrait ? 66 : 44;
  const capText = caption || '';
  const brandName = BRAND.name;
  const capFull = [capText, brandName].filter(Boolean).join('  ·  ');
  const cap2 = capFull ? fitWrap(capFull, fonts.sans, capS0, portrait ? 1600 : 1700, 600, portrait ? 2 : 1, -0.02, 0.55) : { lines: [] as string[], size: 0 };
  const capLines = cap2.lines;
  const capSize = cap2.size;
  const capGap = portrait ? 90 : 64;
  const blockH = CH + (capLines.length ? capGap + capLines.length * capSize * 1.3 : 0);
  const CX = (1920 - CW) / 2;
  const CY = portrait ? Math.round((SH - blockH) / 2) : 236;

  const p = progAt(frame);
  const tw = twistAt(frame);
  const persp = mix(260, 1800, tw) * k; // 短焦鱼眼 → 长焦收平
  const angle3d = mix(62, 0, tw); // rotate3d(0.5,1,0.1)
  const scale = mix(1.8, 1, mix(p, tw, 0.5));
  const tx = txAt(frame, k);
  const ty = tyAt(frame, k);
  const vx = frame < SNAP + 2 ? txAt(frame + 0.5, k) - txAt(frame - 0.5, k) : 0;

  // rotateY 过冲：16–20f 冲到 +6°，20f 起弹簧回零（一次可见回弹）
  const rotY = frame < SNAP ? 6 * ramp(frame, 15, 5, EASE.swift) : 6 * (1 - springAt(frame, SNAP, { damping: 16, stiffness: 260 }));

  // 落定震屏：20f 起 8px，2f 衰减（之后恒为 0）
  const shakeAmp = frame >= SNAP && frame < SNAP + 3 ? 8 * (1 - (frame - SNAP) / 3) : 0;
  const shakeX = shakeAmp * (rnd(frame * 7 + 1) * 2 - 1);
  const shakeY = shakeAmp * (rnd(frame * 13 + 2) * 2 - 1);

  // 阴影：飞行期拉长斜影 → 落定收为静置投影
  const air = 1 - ramp(frame, T0, SNAP - T0 + 4, EASE.out);
  const cardShadow =
    `0 ${(2 + air * 8).toFixed(1)}px ${(6 + air * 14).toFixed(1)}px ${alpha('#05010d', 0.5 - air * 0.2)}, ` +
    `${(air * 90).toFixed(1)}px ${(40 + air * 50).toFixed(1)}px ${(90 + air * 40).toFixed(1)}px -20px ${alpha('#05010d', 0.75)}, ` +
    `0 0 0 1px ${alpha('#d9c6ff', 0.14)}`;

  // 速度线：长度 ∝ 速度，减速到 ~5px/帧时淡没
  const streakA = ramp(Math.abs(vx) / k, 5, 40, EASE.linear);

  // 集中线：落定帧起 8f，内端半径向外退、整体淡出
  const fT = (frame - SNAP) / 9;
  const focusOn = fT >= 0 && fT < 1;
  const fK = portrait ? Math.max(k, CH / CH0 * 0.75) : 1;

  // 跟随：卡内文字晚 3f 落定
  const follow = ramp(frame, SNAP + 3, 13, EASE.snappy);
  const skew = mix(-10, 0, follow);

  // 背景大字：视差慢漂 + 甩入时被"带"一下
  const bgX = -40 * ramp(frame, 0, 120, EASE.linear) - 60 * (1 - ramp(frame, 0, SNAP + 6, EASE.out));
  const push = 1 + 0.025 * ramp(frame, SNAP, 100, EASE.swift);
  const band = title.toUpperCase();
  const bandSize = portrait ? 230 : 168;
  const bandTop = portrait ? Math.max(60, CY - bandSize - 120) : 28;

  const sans = fonts.sans;
  const mono = fonts.mono;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: portrait ? 0.3 : 0.18 }} fill={{ x: 0.14, y: 0.92 }} horizon={portrait ? undefined : 0.83} />
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px) scale(${push.toFixed(5)})` }}>
        {/* 顶部低透明实心大字带（标题重复）：海报主视觉式跑马，画框两端裁切 */}
        {!bd && <div style={{
          position: 'absolute', left: -400, top: bandTop, transform: `translateX(${bgX.toFixed(1)}px)`,
          font: `900 ${bandSize}px ${sans}`, letterSpacing: '-0.035em', lineHeight: 1.25, color: alpha('#c9b6ff', 0.085), whiteSpace: 'nowrap',
          opacity: ramp(frame, 0, 10, EASE.out),
        }}>
          {band} <span style={{ color: alpha(PINK, 0.22) }}>✦</span> {band} <span style={{ color: alpha(PINK, 0.22) }}>✦</span> {band}
        </div>}

        {/* 集中线 */}
        {focusOn && (
          <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, opacity: (1 - fT) * 0.9 }}>
            {FOCUS.map((l, i) => {
              const r0 = (l.r0 + EASE.out(fT) * 420) * fK;
              const r1 = 1500 * Math.max(1, SH / 1080);
              const cx = 960;
              const cy = CY + CH / 2;
              const pts = [
                [cx + Math.cos(l.a - l.w) * r1, cy + Math.sin(l.a - l.w) * r1],
                [cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0],
                [cx + Math.cos(l.a + l.w) * r1, cy + Math.sin(l.a + l.w) * r1],
              ];
              return <polygon key={i} points={pts.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ')} fill={i % 4 === 0 ? PINK : '#f3ecff'} opacity={i % 4 === 0 ? 0.75 : 0.5} />;
            })}
          </svg>
        )}

        {/* 速度线（卡片身后，水平拖尾） */}
        {streakA > 0.001 &&
          STREAKS.map((s, i) => {
            const len = Math.min(1400 * k, Math.abs(vx) * 9 * s.len);
            const x1 = CX + tx + 120 * k;
            return (
              <div key={i} style={{
                position: 'absolute', left: x1 - len, top: CY + CH / 2 + ty + s.y * k * (CH / CH0 / k > 1.5 ? 1.8 : 1) * mix(1.5, 1, p) - s.w / 2, width: len, height: s.w * k, borderRadius: s.w,
                background: `linear-gradient(90deg, ${alpha(i % 3 === 0 ? PINK : '#f3ecff', 0)} 0%, ${alpha(i % 3 === 0 ? PINK : '#f3ecff', 0.7)} 100%)`,
                opacity: streakA,
              }} />
            );
          })}

        {/* 透视容器 + 卡片 */}
        <SpeedBlur vx={vx} amount={0.2} max={26}>
          <div style={{ position: 'absolute', left: CX, top: CY, width: CW, height: CH, perspective: `${persp.toFixed(1)}px`, perspectiveOrigin: '30% 50%' }}>
            <div style={{
              position: 'absolute', inset: 0,
              transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(4)}) rotate3d(0.5, 1, 0.1, ${angle3d.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg)`,
              transformOrigin: '20% 50%',
            }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 30 * k, overflow: 'hidden', background: '#170f2a', boxShadow: cardShadow }}>
                {/* 插画区：横屏左 560 / 竖屏顶部整宽 */}
                <div style={{ position: 'absolute', left: 0, top: 0, width: portrait ? CW : 560, height: ARTH, overflow: 'hidden' }}>
                  {cover ? (
                    <Img src={cover} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Artwork w={portrait ? CW : 560} h={ARTH} />
                  )}
                </div>
                {/* 插画与信息区的过渡 */}
                {portrait ? (
                  <div style={{ position: 'absolute', left: 0, top: ARTH - 160, width: CW, height: 168, background: `linear-gradient(180deg, ${alpha('#170f2a', 0)} 0%, #170f2a 100%)` }} />
                ) : (
                  <div style={{ position: 'absolute', left: 470, top: 0, width: 98, height: CH, background: `linear-gradient(90deg, ${alpha('#170f2a', 0)} 0%, #170f2a 100%)` }} />
                )}
                {/* 信息区：晚一拍落定 */}
                <div style={{
                  position: 'absolute', left: portrait ? PAD : 600, top: portrait ? ARTH : 0, width: infoW, height: portrait ? CH - ARTH : CH,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', fontFamily: sans, color: L.ink,
                  transform: `translateX(${mix(-36 * k, 0, follow).toFixed(2)}px)`, opacity: mix(0.4, 1, follow),
                }}>
                  {badge ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: portrait ? 40 : 30 }}>
                      <div style={{ height: portrait ? 84 : 44, padding: `0 ${portrait ? 28 : 16}px`, borderRadius: portrait ? 14 : 10, background: PINK, color: '#1a0614', display: 'flex', alignItems: 'center', font: `800 ${bSize}px ${mono}`, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                        {badge}
                      </div>
                      {/* 出品方标志：与签同排右对齐 */}
                      <ShotcraftMark size={markSz} tone="dark" />
                    </div>
                  ) : null}
                  <div style={{ marginLeft: -4, font: `880 ${tSize}px ${sans}`, letterSpacing: '-0.05em', lineHeight: tLH, transform: `skewX(${skew.toFixed(2)}deg)`, transformOrigin: '0 100%', whiteSpace: 'nowrap' }}>
                    {tLines.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                  <div style={{ height: portrait ? 30 : 22 }} />
                  {sLines.map((l, i) => (
                    <div key={i} style={{ font: `600 ${sSize}px ${sans}`, color: L.ink2, letterSpacing: '-0.01em', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{l}</div>
                  ))}
                  {meta ? <div style={{ marginTop: portrait ? 14 : 8, font: `500 ${mSize}px ${mono}`, color: L.ink3, letterSpacing: '0.04em', lineHeight: 1.4, whiteSpace: 'nowrap' }}>{meta}</div> : null}
                  {cta ? (
                    <div style={{ marginTop: portrait ? 44 : 30, display: 'flex', gap: 14 * k }}>
                      <div style={{ height: btnH, padding: `0 ${btnH * 0.44}px`, borderRadius: btnH / 2, background: '#f7f2ff', color: '#140a24', display: 'flex', alignItems: 'center', gap: 12 * k, font: `750 ${ctaSize}px ${sans}`, letterSpacing: '-0.01em', whiteSpace: 'nowrap', boxShadow: `0 10px 30px -10px ${alpha(PINK, 0.7)}` }}>
                        <svg width={btnH * 0.31} height={btnH * 0.34} viewBox="0 0 20 22"><path d="M2 2 L18 11 L2 20 Z" fill="#140a24" /></svg>
                        {cta}
                      </div>
                      <div style={{ width: btnH, height: btnH, borderRadius: btnH / 2, border: `2px solid ${alpha('#f7f2ff', 0.3)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `400 ${btnH * 0.56}px ${sans}`, color: L.ink }}>+</div>
                    </div>
                  ) : null}
                </div>
                {/* 顶缘内高光 */}
                <div style={{ position: 'absolute', inset: 0, borderRadius: 30 * k, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)', pointerEvents: 'none' }} />
              </div>
            </div>
          </div>
        </SpeedBlur>

        {/* 字幕：落定后逐词升起（+ 品牌名，强调色） */}
        {capLines.map((l, i) => {
          const brandAt = brandName ? l.lastIndexOf(brandName) : -1;
          const head = brandAt >= 0 && i === capLines.length - 1 ? l.slice(0, brandAt) : l;
          const tail = brandAt >= 0 && i === capLines.length - 1 ? l.slice(brandAt) : '';
          return (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: CY + CH + capGap + i * capSize * 1.3, textAlign: 'center', font: `600 ${capSize}px ${sans}`, letterSpacing: '-0.02em', color: L.ink, lineHeight: 1.3, textShadow: bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined, whiteSpace: 'pre' }}>
              <TextReveal text={head} by="word" variant="rise" start={34 + i * 6} each={16} gap={Math.min(4, 14 / Math.max(1, head.split(' ').length))} />
              {tail ? (
                <span style={{ color: PINK }}>
                  <TextReveal text={tail} by="word" variant="rise" start={46} each={16} gap={4} />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
