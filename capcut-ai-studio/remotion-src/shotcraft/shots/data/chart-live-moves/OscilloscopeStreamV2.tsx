// oscilloscope-stream-v2 —— 示波流线：曲线写入点钉在右侧上下起伏，旧数据向左流出画；
// 中途一次突发尖峰（振幅 2.2×，读数跳大变强调色），最后刹停真静止。
//
// 第二轮重设计（深蓝夜 · 满版示波监控墙）：
// - look = midnight（深蓝夜 · 电光蓝），事件色单独给一抹珊瑚红（只给尖峰）。不再是"卡片里的小图"：
//   整个画面就是一块示波器屏——1728×520 的满版绘图区，示波器式刻度网（主格实线 + 次格点阵 + 中心十字刻度），
//   电光蓝磷光迹线（实线 + 两层泛光），写入头在 86% 处：竖向扫描线 + 光斑 + 一条横向读数参考线。
// - 文字层级：左上 video-shotcraft 标志 + 字标眉题（渲染农场 · 帧/秒）+ LIVE 灯、168px 实时读数（每 3 帧采样保持，像真的仪表）；
//   右上 p99 延迟 / 错误率两枚副读数，跟着尖峰一起跳。
// - 尖峰事件：写入头经过时迹线该段整段变珊瑚红并加粗，大读数放大 + 变珊瑚红，p99 跳到 3 位数；
//   写完后峰顶钉一枚「Burst」事件标签 + 竖向落线，随流向左带走。
// - 刹停：流速 out-cubic 刹车（初速与流速相同，无速度跳变），LIVE → PAUSED，写入头光斑熄灭；
//   之后相机缓推 3% 对准尖峰（有明确目标与落点），真静止 hold。
//
// 时间表（30fps，共 165f）：
//   0–16    屏幕点亮：刻度网从中心展开、迹线已在流动（直播感，第 1 帧即有内容）、读数/眉题浮入
//   0–104   匀速流动 8px/f（采样窗平移是机械语义，刻意匀速）
//   46–68   尖峰写入（读数/副读数随包络跳变）；~70f 事件标签 overshoot 弹出
//   104–118 刹停 14f（out-cubic）
//   118–165 hold 47f：相机 1 → 1.03 缓推向尖峰（smooth），其余静止
//
// [Agent Edit] o chu (so lieu lay tu loi noi): label (眉题 — dang do gi), value (muc thuong) / peak (dinh dot bien) / unit,
// event (nhan su kien o dinh), stat1_label/stat1 + stat2_label/stat2 (2 so phu, gia tri tai dinh; luc thuong ~1/3).
// Bien do song / truc y tu tinh tu value & peak -> dinh nhon dung bang so nguoi noi. Khung doc (native): chu to,
// xep doc (thuong hieu + LIVE -> nhan -> so lon -> 2 so phu -> man song cao), ca khoi can giua.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';
import { balance2, compact, fmtBare, fmtNum, niceStep, parseNum } from './numfmt';

export const OSCILLOSCOPE_STREAM_V2_DURATION = 165;

const L = LOOKS.midnight;
const TRACE = L.accent; // 电光蓝
const HOT = '#ff6b5b'; // 事件色：珊瑚红（只给尖峰）

// 绘图区（横向；纵向 PY/PH 随画面高度重排）
const PX = 96;
const PW = 1728;
const HEAD = Math.round(PW * 0.86); // 写入头位置（绘图区内 x）

const SPEED = 8;
const FREEZE0 = 104;
const FREEZE1 = 118;
const OFFSET = 1400; // 世界坐标偏移：第 0 帧时窗口里已有完整历史

// 有效时间（世界 x）：匀速，FREEZE 段 out-cubic 刹停；刹车距离 = SPEED×dur/3（初速连续）
const worldAt = (f: number) => {
  if (f <= FREEZE0) return OFFSET + f * SPEED;
  const brake = (SPEED * (FREEZE1 - FREEZE0)) / 3;
  return OFFSET + FREEZE0 * SPEED + brake * ramp(f, FREEZE0, FREEZE1 - FREEZE0, (x) => 1 - Math.pow(1 - x, 3));
};

// 尖峰：写入头在 f46 起经过 worldX [S0, S0+SW]；主峰是一记尖锐的高斯脉冲（+2.2× 常态振幅），
// 前后各带一个小的前兆 / 余震，峰段内原波形抖动加倍
const S0 = OFFSET + 46 * SPEED;
const SW = 176;
const SC = S0 + SW * 0.5;
const gauss = (x: number, c: number, w: number) => Math.exp(-Math.pow((x - c) / w, 2));
const bump = (x: number) => 2.2 * gauss(x, SC, 26) + 0.45 * gauss(x, SC - 62, 18) + 0.6 * gauss(x, SC + 48, 20);
const burstK = (x: number) => Math.min(1, bump(x) / 2.2);
const wave = (x: number) =>
  0.34 * Math.sin(x * 0.019) + 0.27 * Math.sin(x * 0.047 + 1.7) + 0.18 * Math.sin(x * 0.011 + 4.2) + 0.11 * Math.sin(x * 0.083 + 2.3);
const inSpike = (x: number) => gauss(x, SC, SW * 0.45);
const waveP = (x: number) => wave(x) * (1 + 0.6 * inSpike(x));
const signal = (x: number) => waveP(x) + bump(x);

const PEAK_X = (() => {
  let best = S0;
  for (let x = S0; x <= S0 + SW; x += 0.5) if (signal(x) > signal(best)) best = x;
  return best;
})();

const hexMix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};

export const OscilloscopeStreamV2: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const label = useText('label', 'Lượt truy cập · thời gian thực');
  const valueS = useText('value', '1.350');
  const peakS = useText('peak', '2.680');
  const unit = useText('unit', 'lượt/giây');
  const event = useText('event', 'Đột biến');
  const s1Label = useText('stat1_label', 'Độ trễ');
  const s1S = useText('stat1', '126 ms');
  const s2Label = useText('stat2_label', 'Tỉ lệ lỗi');
  const s2S = useText('stat2', '0,14%');

  // ── 数据：常态 B、尖峰 P（来自口播）→ 波形振幅 / y 轴满刻度 ──
  const vB = parseNum(valueS, 1350);
  const vP = parseNum(peakS, vB.value * 2);
  const B = Math.max(1e-6, vB.value);
  const P = vP.value > B ? vP.value : B * 2;
  const kw = B * 0.415; // 常态起伏（原版 560 / 1350）
  const kb = Math.max(0, (P - B - kw * waveP(PEAK_X)) / bump(PEAK_X)); // 尖峰刚好顶到 P
  const valueOf = (x: number) => Math.max(0, B + kw * waveP(x) + kb * bump(x));
  const step = niceStep(Math.max(P * 1.08, B * 1.6) / 3, true);
  const MAXV = step * 3;
  const valDec = Math.max(vB.dec, B < 10 ? 1 : 0);
  const fmtV = (n: number) => fmtBare(n, vB, valDec);
  const s1 = parseNum(s1S, 126);
  const s2 = parseNum(s2S, 0.14);

  // ── 版式 ──
  const R = portrait ? 1.62 : 1; // 纵向字号倍率
  const brandName = BRAND.name;
  const markSz = 40 * R;
  const brandW = brandName ? markSz + 12 + measureText(brandName, fonts.sans, 32 * R, 700) * 1.03 : 0;
  const pillText = frame < FREEZE0 + 7 ? 'TRỰC TIẾP' : 'TẠM DỪNG';
  const pillW = measureText('TRỰC TIẾP', fonts.sans, 26 * R, 750) * 1.08 + 70 * R;
  // 眉题：横向与品牌 / LIVE 同一行（单行缩字）；纵向独占 1–2 行
  const labelRoomL = PW - (brandW ? brandW + 22 : 0) - pillW - 22;
  const labelSizeL = fitSize(label, { family: fonts.sans, size: 32, maxWidth: labelRoomL, weight: 500, minSize: 20 });
  const labelSizeP = 76;
  const labelWrap = portrait ? wrapLines(label, fonts.sans, labelSizeP, PW, 500, 2) : [label];
  const labelLinesP = labelWrap.length === 2 ? balance2(label.split(/\s+/).filter(Boolean), (t) => measureText(t, fonts.sans, labelSizeP, 500)) ?? labelWrap : labelWrap;
  const labelSizeP2 = Math.min(...labelLinesP.map((l) => fitSize(l, { family: fonts.sans, size: labelSizeP, maxWidth: PW, weight: 500, minSize: 40 })));
  // 大读数：数字 + 单位，整体不超过可用宽
  const readSize0 = portrait ? 300 : 176;
  const readRoom = portrait ? PW : 1000;
  const readMax = fmtV(P * 1.02);
  const unitRatio = portrait ? 0.24 : 0.27;
  const readW = (sz: number) => measureText(readMax, fonts.sans, sz, 700) * 0.97 + (unit ? 22 + measureText(unit, fonts.sans, sz * unitRatio, 500) : 0);
  const readSize = readW(readSize0) <= readRoom ? readSize0 : Math.max(readSize0 * 0.45, Math.floor((readSize0 * readRoom) / readW(readSize0)));
  // 副读数
  const statColW = portrait ? (PW - 80) / 2 : 330;
  const statLabSize = (t: string) => fitSize(t, { family: fonts.sans, size: 32 * (portrait ? 1.9 : 1), maxWidth: statColW, weight: 500, minSize: 20 });
  const statValSize = (t: string) => fitSize(t, { family: fonts.sans, size: portrait ? 160 : 84, maxWidth: statColW, weight: 650, minSize: 40 });

  // 纵向：整块竖直居中
  let PY = 404;
  let PH = 520;
  let headTop = 92;
  let labelTop = 92;
  let readTop = 140;
  let statTop = 150;
  if (portrait) {
    const hHead = 64 * R * 0.9;
    const hLabel = labelLinesP.length * labelSizeP2 * 1.3;
    const hRead = readSize * 1.1;
    const hStat = 62 + 12 + 176;
    PH = Math.round(Math.min(1700, Math.max(1000, SH - 1720)));
    const axisH = 110;
    const block = hHead + 44 + hLabel + 40 + hRead + 70 + hStat + 110 + PH + axisH;
    const y0 = Math.max(110, Math.round((SH - block) / 2));
    headTop = y0;
    labelTop = y0 + hHead + 44;
    readTop = labelTop + hLabel + 40 - readSize * 0.1;
    statTop = labelTop + hLabel + 40 + hRead + 70;
    PY = Math.round(statTop + hStat + 110);
  }
  const yOf = (x: number) => PH - (valueOf(x) / MAXV) * PH;

  const T = worldAt(frame); // 写入头的世界 x
  const worldOf = (px: number) => T - (HEAD - px);

  // 迹线采样（写入头以左）
  const STEP = 4;
  const pts: Array<[number, number, number]> = [];
  for (let px = 0; px <= HEAD; px += STEP) pts.push([px, yOf(worldOf(px)), worldOf(px)]);
  if (pts[pts.length - 1][0] !== HEAD) pts.push([HEAD, yOf(T), T]);
  const toD = (a: Array<[number, number, number]>) => a.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const lineD = toD(pts);
  const areaD = `${lineD} L${HEAD},${PH} L0,${PH} Z`;
  const spike = pts.filter(([, , w]) => w >= S0 + 10 && w <= Math.min(T, S0 + SW - 10));
  const spikeD = spike.length > 1 ? toD(spike) : '';
  const headY = yOf(T);
  const freshD = toD(pts.filter(([x]) => x >= HEAD - 284));

  // 读数：每 3 帧采样保持（真仪表的刷新感）；尖峰包络驱动放大 + 变色
  const held = worldAt(Math.floor(frame / 3) * 3);
  // 峰值保持（真仪表的 peak-hold）：尖峰热度期间读数停在近 30 帧内的最高值，不会"红着却显示低谷"
  let recentMax = valueOf(held);
  for (let w = held - 240; w < held; w += 4) recentMax = Math.max(recentMax, valueOf(w));
  // 读数热度：写入头附近 ±40px 的尖峰强度（峰前两帧就开始升温，峰后缓降）
  const spikeK = Math.max(burstK(T), 0.8 * burstK(T - 30), 0.5 * burstK(T - 60));
  const hot = EASE.out(Math.min(1, spikeK * 1.6));
  const readScale = 1 + 0.08 * spikeK;
  // 副读数：口播给的是尖峰时的值；常态 ≈ 1/3（原版 42 → 126 ms）
  const statVal = (n: typeof s1, wob: number) => {
    const v = n.value * (0.333 + 0.667 * spikeK) * (1 + wob);
    return fmtNum(v, n, Math.max(n.dec, n.value < 10 && n.dec === 0 ? 1 : n.dec));
  };
  const s1Now = statVal(s1, 0.016 * Math.sin(frame / 5));
  const s2Now = statVal(s2, 0);

  const live = 1 - ramp(frame, FREEZE0, FREEZE1 - FREEZE0, EASE.out);
  const pulse = 0.5 + 0.5 * Math.cos((frame / 24) * Math.PI * 2);

  // 事件标签：写入头越过峰顶后弹出，钉在峰顶随流向左（标签放在峰左侧——左侧是更低的旧数据，不撞线、不出右框）
  const peakPx = HEAD - (T - PEAK_X);
  const peakY = yOf(PEAK_X);
  const passF = (PEAK_X - OFFSET) / SPEED;
  const tagIn = ramp(frame, passF + 3, 14, EASE.overshoot);
  const tagFs = 32 * (portrait ? 1.6 : 1);
  const tagH = 72 * (portrait ? 1.5 : 1);
  const tagVal = `${vP.ok ? peakS.trim() : fmtV(P)}${unit && !(vP.ok && vP.post.trim()) ? ' ' + unit : ''}`;

  // 屏幕点亮
  const on = ramp(frame, 0, 16, EASE.snappy);
  const headIn = ramp(frame, 2, 16, EASE.out);

  // 刹停后缓推向尖峰
  const push = ramp(frame, FREEZE1 - 4, 165 - FREEZE1 + 4, EASE.smooth);
  const cam = mix(1, 1.025, push);
  const camOX = PX + mix(HEAD, peakPx, 0.6);
  const camOY = PY + PH * 0.45;

  const gridV = 12;
  const gridH = portrait ? 12 : 6;

  const pill = (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 10 * R, padding: `${6 * R}px ${16 * R}px ${6 * R}px ${12 * R}px`, borderRadius: 99, flexShrink: 0,
      background: live > 0.5 ? alpha(L.accent2, 0.12) : alpha('#ffffff', 0.06),
      border: `1px solid ${live > 0.5 ? alpha(L.accent2, 0.35) : alpha('#ffffff', 0.12)}`,
      ...type(26 * R, 750), letterSpacing: '0.04em', color: live > 0.5 ? L.accent2 : L.ink3,
    }}>
      <span style={{
        width: 12 * R, height: 12 * R, borderRadius: 6 * R, background: live > 0.5 ? L.accent2 : L.ink3,
        boxShadow: live > 0.5 ? `0 0 0 ${(3 + 5 * pulse).toFixed(1)}px ${alpha(L.accent2, 0.25 * (1 - pulse))}` : 'none',
      }} />
      {pillText}
    </span>
  );
  const brandEl = brandName ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12 * R, flexShrink: 0 }}>
      <ShotcraftMark size={markSz} tone="dark" />
      <span style={{ ...type(32 * R, 700), fontFamily: BRAND.font, letterSpacing: '0.03em', color: L.ink, whiteSpace: 'nowrap' }}>{brandName}</span>
    </span>
  ) : null;
  // [Agent Edit] nen anh AI: bo nen dac (Stage tu bo gradient); chu nam tren nen -> bong do nhe de doc ro tren anh
  const bd = useBackdrop();
  const bdShadow = bd ? (bd.dark ? '0 2px 18px rgba(0,0,0,0.55)' : '0 1px 12px rgba(255,255,255,0.7)') : undefined;
  const stats = [
    { k: s1Label, v: s1Now, hotK: hot },
    { k: s2Label, v: s2Now, hotK: hot * 0.8 },
  ].filter((s) => s.k || s.v);

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.62, y: portrait ? 0.62 : 0.55 }} fill={{ x: 0.08, y: 0.1 }} intensity={0.8} breathe={0.4} />

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam.toFixed(5)})`, transformOrigin: `${camOX}px ${camOY}px`, textShadow: bdShadow }}>
        {/* 眉题 + LIVE */}
        {portrait ? (
          <>
            <div style={{ position: 'absolute', left: PX, width: PW, top: headTop, display: 'flex', alignItems: 'center', justifyContent: brandEl ? 'space-between' : 'flex-start', opacity: headIn }}>
              {brandEl}
              {pill}
            </div>
            {labelLinesP.map((l, i) => (
              <div key={i} style={{ position: 'absolute', left: PX, top: labelTop + i * labelSizeP2 * 1.3, ...type(labelSizeP2, 500), lineHeight: 1.3, color: L.ink2, whiteSpace: 'nowrap', opacity: headIn }}>{l}</div>
            ))}
          </>
        ) : (
          <div style={{ position: 'absolute', left: PX, top: headTop, width: PW, display: 'flex', alignItems: 'center', gap: 22, opacity: headIn }}>
            {brandEl}
            <span style={{ ...type(labelSizeL, 500), color: L.ink3, whiteSpace: 'nowrap' }}>{label}</span>
            {pill}
          </div>
        )}

        {/* 大读数 */}
        <div style={{
          position: 'absolute', left: PX - 8, top: readTop, display: 'flex', alignItems: 'baseline', gap: 22, whiteSpace: 'nowrap',
          transform: `scale(${readScale.toFixed(4)})`, transformOrigin: 'left bottom', opacity: headIn,
        }}>
          <span style={{
            ...type(readSize, 700), color: hexMix('#f2f5ff', HOT, hot),
            textShadow: hot > 0.02 ? `0 0 40px ${alpha(HOT, 0.35 * hot)}${bdShadow ? `, ${bdShadow}` : ''}` : bdShadow,
          }}>{fmtV(mix(valueOf(held), recentMax, hot))}</span>
          {unit ? <span style={{ ...type(readSize * unitRatio, 500), color: hexMix('#a9b4d0', HOT, hot) }}>{unit}</span> : null}
        </div>

        {/* 副读数：横向右上；纵向两栏 */}
        <div style={{
          position: 'absolute', ...(portrait ? { left: PX, width: PW, justifyContent: 'space-between' } : { right: 1920 - PX - PW }), top: statTop,
          display: 'flex', gap: portrait ? 80 : 72, opacity: ramp(frame, 6, 14, EASE.out),
        }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: portrait && i === 0 ? 'left' : 'right', width: portrait ? statColW : undefined, maxWidth: statColW, whiteSpace: 'nowrap' }}>
              <div style={{ ...type(statLabSize(s.k), 500), lineHeight: 1.3, color: L.ink3 }}>{s.k}</div>
              <div style={{ marginTop: 8, ...type(statValSize(s.v), 650), lineHeight: 1.1, color: hexMix('#f2f5ff', HOT, s.hotK) }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* 示波屏 */}
        <div style={{ position: 'absolute', left: PX, top: PY, width: PW, height: PH }}>
          <svg width={PW} height={PH + 120} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            <defs>
              <linearGradient id="osArea" x1="0" y1="0" x2="0" y2={PH} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={TRACE} stopOpacity={0.3} />
                <stop offset="1" stopColor={TRACE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="osFade" x1="0" y1="0" x2={PW} y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" stopOpacity={0} />
                <stop offset="0.14" stopColor="#fff" stopOpacity={1} />
                <stop offset="1" stopColor="#fff" stopOpacity={1} />
              </linearGradient>
              <mask id="osMask" maskUnits="userSpaceOnUse" x={-20} y={-200} width={PW + 40} height={PH + 300}>
                <rect x={-20} y={-200} width={PW + 40} height={PH + 300} fill="url(#osFade)" />
              </mask>
              <filter id="osGlowA" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
              <filter id="osGlowB" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="16" /></filter>
              <radialGradient id="osHead">
                <stop offset="0" stopColor="#ffffff" stopOpacity={1} />
                <stop offset="0.25" stopColor={hexMix('#5b8cff', HOT, hot)} stopOpacity={0.8} />
                <stop offset="1" stopColor={hexMix('#5b8cff', HOT, hot)} stopOpacity={0} />
              </radialGradient>
              <linearGradient id="osFresh" x1={HEAD - 280} y1="0" x2={HEAD} y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#ffffff" stopOpacity={0} />
                <stop offset="1" stopColor="#ffffff" stopOpacity={0.95} />
              </linearGradient>
            </defs>

            {/* 刻度网：主格线 + 次格点阵 + 中心十字刻度；从中心展开 */}
            <g opacity={on}>
              {Array.from({ length: gridV + 1 }, (_, i) => {
                const x = (i / gridV) * PW;
                const reach = (PH / 2) * on;
                return <line key={`v${i}`} x1={x} x2={x} y1={PH / 2 - reach} y2={PH / 2 + reach} stroke={L.accent} strokeOpacity={i === 0 || i === gridV ? 0.22 : 0.1} strokeWidth={1.2} />;
              })}
              {Array.from({ length: gridH + 1 }, (_, i) => {
                const y = (i / gridH) * PH;
                const reach = (PW / 2) * on;
                return <line key={`h${i}`} x1={PW / 2 - reach} x2={PW / 2 + reach} y1={y} y2={y} stroke={L.accent} strokeOpacity={i === 0 || i === gridH ? 0.22 : 0.1} strokeWidth={1.2} />;
              })}
              {Array.from({ length: gridV * 5 + 1 }, (_, i) => (
                <line key={`tk${i}`} x1={(i / (gridV * 5)) * PW} x2={(i / (gridV * 5)) * PW} y1={PH / 2 - (i % 5 ? 5 : 10)} y2={PH / 2 + (i % 5 ? 5 : 10)} stroke={L.accent} strokeOpacity={0.28} strokeWidth={1.2} />
              ))}
            </g>

            {/* 迹线：面积 + 两层泛光 + 实线（左端渐隐出画） */}
            <g mask="url(#osMask)">
              <path d={areaD} fill="url(#osArea)" />
              <path d={lineD} fill="none" stroke={TRACE} strokeWidth={10} opacity={0.5} filter="url(#osGlowB)" />
              <path d={lineD} fill="none" stroke={TRACE} strokeWidth={5} opacity={0.75} filter="url(#osGlowA)" />
              <path d={lineD} fill="none" stroke="#cfdcff" strokeWidth={3.5 * (portrait ? 1.3 : 1)} strokeLinejoin="round" strokeLinecap="round" />
              {/* 最新 280px：磷光最亮的"新鲜"段 */}
              <path d={freshD} fill="none" stroke="url(#osFresh)" strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.4 + 0.6 * live} />
              {spikeD && (
                <>
                  <path d={spikeD} fill="none" stroke={HOT} strokeWidth={14} opacity={0.55} filter="url(#osGlowB)" />
                  <path d={spikeD} fill="none" stroke={HOT} strokeWidth={5 * (portrait ? 1.3 : 1)} strokeLinejoin="round" strokeLinecap="round" />
                </>
              )}
            </g>

            {/* 写入头：竖向扫描线 + 横向读数参考线 + 光斑 */}
            <line x1={HEAD} x2={HEAD} y1={0} y2={PH} stroke={hexMix('#5b8cff', HOT, hot)} strokeOpacity={0.45 * live + 0.12} strokeWidth={1.5} />
            <line x1={HEAD} x2={PW} y1={headY} y2={headY} stroke={hexMix('#cfdcff', HOT, hot)} strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="4 6" />
            <circle cx={HEAD} cy={headY} r={70} fill="url(#osHead)" opacity={0.55 * live} />
            <circle cx={HEAD} cy={headY} r={9 * (portrait ? 1.4 : 1)} fill={hexMix('#ffffff', HOT, hot * 0.6)} stroke={L.bg[1]} strokeWidth={3} />

            {/* 事件：峰顶标记 + 竖向落线 */}
            {tagIn > 0 && peakPx > 40 && (
              <g opacity={Math.min(1, tagIn * 1.5)}>
                <line x1={peakPx} x2={peakPx} y1={peakY + 14} y2={PH} stroke={HOT} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="3 5" />
                <circle cx={peakPx} cy={peakY} r={9 * tagIn * (portrait ? 1.4 : 1)} fill={HOT} stroke={L.bg[1]} strokeWidth={3} />
              </g>
            )}

            {/* 时间轴 */}
            {['−50s', '−40s', '−30s', '−20s', '−10s', 'bây giờ'].map((t, i) => (
              <text key={t} x={(HEAD * (i + 1)) / 6} y={PH + 52 * (portrait ? 1.45 : 1)} textAnchor="middle" fill={i === 5 ? L.ink2 : L.ink3}
                style={{ ...type(32 * (portrait ? 1.45 : 1), 500), fontFamily: FONT.sans }} opacity={headIn}>{t}</text>
            ))}
          </svg>

          {/* y 轴刻度（屏内左上，压在主格线上方） */}
          {[3, 2, 1].map((k, i) => (
            <div key={k} style={{ position: 'absolute', left: 14, top: (i * PH) / 3 + 8, ...type(28 * (portrait ? 1.55 : 1), 600), color: L.ink3, opacity: on }}>{compact(step * k, vB)}</div>
          ))}

          {/* 事件标签（峰左侧，右缘对齐峰顶左 22px） */}
          {tagIn > 0 && peakPx > 40 && (
            <div style={{
              position: 'absolute', right: PW - (peakPx - 22 * (portrait ? 1.4 : 1)), top: peakY - tagH / 2, height: tagH, padding: `0 ${26 * (portrait ? 1.4 : 1)}px 0 ${20 * (portrait ? 1.4 : 1)}px`,
              display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14 * (portrait ? 1.4 : 1), whiteSpace: 'nowrap',
              background: `linear-gradient(180deg, ${alpha(HOT, 0.22)}, ${alpha(HOT, 0.12)})`, border: `1px solid ${alpha(HOT, 0.55)}`,
              boxShadow: `0 16px 40px -10px ${alpha('#000000', 0.6)}`, backdropFilter: 'blur(6px)',
              transform: `scale(${tagIn.toFixed(4)})`, transformOrigin: '100% 50%', opacity: Math.min(1, tagIn * 1.5),
            }}>
              {event ? <span style={{ ...type(tagFs, 800), color: HOT }}>{event}</span> : null}
              <span style={{ ...type(tagFs, 600), color: '#ffe3de' }}>{tagVal}</span>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
