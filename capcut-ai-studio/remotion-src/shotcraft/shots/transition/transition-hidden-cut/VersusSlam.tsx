// versus-slam 对撞开屏：左右两个半屏（78° 斜切边）从画外加速对冲，沿斜缝砰地撞合；
// 撞击帧白闪 + 整机震屏指数衰减 + "VS" 圆章盖章压出，切点就是撞击本身，结尾静止 hold。
//
// 第二轮重设计（瑞士海报 · 对阵比较 "一支发布片要花多少"）：
// - look = paper（暖白纸 · 墨 · 朱红），粗黑体海报排版，不用 dashboard。两方 = 两张色块海报：
//   左「旧方式」墨黑底 + 纸白 340px 大数字，右「新方式」朱红底 + 纸白大数字——
//   一墨一朱撞在一起，数字本身就是对比结论；说明文字 44px、清单 32px，都按"能读"排。
// - 建立段（0–18f）不是空屏：纸面上一行设问（124px，墨线在字带处留空），
//   斜缝位置一根墨线从中点向两端长出（预示撞线）；两半屏 ease-in(cubic) 10f 对冲，扫过时把设问吞掉。
// - 撞击三件套同帧起跑（28f）：纸白闪 0.85→0 共 3f、整机震屏 16px·e^(−t/1.7)、VS 圆章弹簧压出
//   （damping 12，一次可见过冲）；同帧再发一圈墨色冲击环 + 12 根放射速度线（6f 收）。
//   撞合后斜缝是一道 6px 纸白"切口"，两侧各压窄投影——像两张卡纸被压在一起。
// - 对冲按速度给横向运动模糊（末速 ~360px/帧，封顶 36px）；撞后两侧数字 1.04→1 回弹落座（晚 2f，跟随）。
//
// 时间表（30fps，共 105f）：
//   0–18    建立：设问逐词升起（1–14），斜缝墨线长出
//   18–28   对冲 10f（ease-in cubic：越来越快 = 砸）
//   28      撞击：闪 / 震 / 章 / 冲击环 / 速度线
//   30–44   数字回弹落座；36–60 两侧说明与清单错峰升起（左先右后，4f 错位）
//   54–70   底部结论条（品牌标志 + 结论句）从下升起，压在斜缝上
//   70–105  hold 35f：整机 1 → 1.015 极缓推进
//
// [Agent Edit] o chu: question (+ question_kicker) = cau hoi mo dau; left_* / right_* = hai ben doi dau (label, number,
// unit, caption, items 0-4 muc — ben trai gach ngang, ben phai dau tick); verdict = thanh ket luan (tuy chon).
// Con so + don vi tu thu nho vua nua man hinh; caption tu xuong dong <= 3 dong; muc danh sach tu xuong hang.
// Khung doc (portrait.mode = 'native'): doi truc — hai nua TREN / DUOI (duong cat xeo ~12 do) lao vao nhau theo chieu doc
// (ease-in cubic 10f nhu ban goc), moi nua la mot tam poster rong 1920; VS / vong xung kich dat giua khung that.
import { useBrand, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, Grain, SpeedBlur, mix, ramp, velocity } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const VERSUS_SLAM_DURATION = 105;

const P = LOOKS.paper;
const INK = P.ink;
const PAPER = '#f8f4ec';
const PAD = 120;
const RUSH = 18; // 对冲起
const IMPACT = 28; // 撞击帧

// 斜缝几何（横版）：78° 斜边 → 1080 高度上水平偏移 ≈ 230px，中线 x=960 ±115
const SEAM_TOP_X = 1075;
const SEAM_BOT_X = 845;
const SEAM_DEG = (Math.atan2(SEAM_TOP_X - SEAM_BOT_X, 1080) * 180) / Math.PI; // ≈ +12°
// 竖版：斜缝横贯画面，左低右高 ±200px（≈ 12°）
const SEAM_DY = 200;
const SEAM_DEG_P = -(Math.atan2(SEAM_DY * 2, 1920) * 180) / Math.PI;

// 折行 + 缩字号（真实台词长短不定）
const fitWrap = (text: string, family: string, weight: number, size: number, minSize: number, maxW: number, maxLines: number) => {
  let sz = size;
  let lines = wrapLines(text, family, sz, maxW, weight, 99);
  while (lines.length > maxLines && sz > minSize) {
    sz = Math.max(minSize, Math.round(sz * 0.93));
    lines = wrapLines(text, family, sz, maxW, weight, 99);
  }
  if (lines.length > maxLines) {
    lines = wrapLines(text, family, sz, maxW, weight, maxLines);
    sz = Math.min(sz, ...lines.map((l) => fitSize(l, { family, size: sz, maxWidth: maxW, weight, minSize: minSize * 0.6 })));
    return { size: sz, lines };
  }
  if (lines.length > 1) {
    for (let w = maxW - 24; w > maxW * 0.45; w -= 24) {
      const alt = wrapLines(text, family, sz, w, weight, 99);
      if (alt.length > lines.length) break;
      lines = alt;
    }
  }
  return { size: sz, lines };
};

type SideT = { label: string; number: string; unit: string; caption: string; items: string[] };

// 一侧海报（box = 该侧内容区：x0 起点、y0 顶、w 宽）
const Side: React.FC<{ side: 'L' | 'R'; f: number; t: SideT; portrait: boolean; x0: number; y0: number; w: number }> = ({ side, f, t, portrait, x0, y0, w }) => {
  const fonts = useShotFonts();
  const left = side === 'L';
  const fg = PAPER;
  const sub = left ? alpha(PAPER, 0.62) : alpha(INK, 0.82);
  const K = portrait ? 1.45 : 1;
  // 撞后数字回弹落座（晚 2f 跟随）
  const settle = springAt(f, IMPACT + 2, { damping: 14, stiffness: 220 });
  const numScale = f < IMPACT ? 1 : mix(1.05, 1, settle);
  const d = left ? 0 : 4;
  const cap = ramp(f, IMPACT + 8 + d, 18, EASE.snappy);
  const list = ramp(f, IMPACT + 14 + d, 18, EASE.snappy);
  // 大数字 + 单位：整体缩到该侧宽度内
  const nS = 360 * K;
  const uS = 96 * K;
  const raw = measureText(t.number, fonts.sans, nS, 900) * 0.95 + (t.unit ? 22 + measureText(t.unit, fonts.sans, uS, 800) : 0);
  const k = Math.min(1, (w - 20) / Math.max(1, raw));
  const capF = t.caption ? fitWrap(t.caption, fonts.sans, 600, 44 * K, 32 * K, w, 3) : { size: 44, lines: [] as string[] };
  const labS = fitSize(t.label.toUpperCase(), { family: fonts.sans, size: 30 * K, maxWidth: w - 40, weight: 800, letterSpacingEm: 0.16, minSize: 18 });
  const numTop = y0 + 56 * K;
  const numH = nS * k * 0.9;
  const capTop = portrait ? numTop + numH + 60 : 590;
  const listTop = portrait ? capTop + capF.lines.length * capF.size * 1.22 + 50 : Math.max(800, capTop + capF.lines.length * capF.size * 1.2 + 40);
  return (
    <>
      <div style={{ position: 'absolute', left: x0, top: y0, display: 'flex', alignItems: 'center', gap: 16 * K, fontFamily: FONT.sans, fontSize: labS, fontWeight: 800, lineHeight: 1.3, letterSpacing: '0.16em', color: left ? alpha(PAPER, 0.7) : INK, whiteSpace: 'nowrap' }}>
        <span style={{ width: 16 * K, height: 16 * K, background: left ? alpha(PAPER, 0.7) : INK, borderRadius: left ? 0 : 8 * K }} />
        {t.label.toUpperCase()}
      </div>
      <div style={{
        position: 'absolute', left: x0 - 14 * k, top: numTop, display: 'flex', alignItems: 'baseline', gap: 22 * k, whiteSpace: 'nowrap',
        transform: `scale(${numScale.toFixed(4)})`, transformOrigin: 'left bottom',
      }}>
        <span style={{ fontFamily: FONT.sans, fontSize: nS * k, fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 0.9, color: fg, fontVariantNumeric: 'tabular-nums' }}>
          {t.number}
        </span>
        {t.unit ? <span style={{ fontFamily: FONT.sans, fontSize: uS * k, fontWeight: 800, letterSpacing: '-0.03em', color: fg }}>{t.unit}</span> : null}
      </div>
      {capF.lines.length ? (
        <div style={{ position: 'absolute', left: x0, top: capTop, width: w, fontFamily: FONT.sans, fontSize: capF.size, fontWeight: 600, lineHeight: 1.22, letterSpacing: '-0.015em', color: fg, opacity: cap, transform: `translateY(${(1 - cap) * 26}px)` }}>
          {capF.lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
        </div>
      ) : null}
      {t.items.length ? (
        <div style={{ position: 'absolute', left: x0, top: listTop, display: 'flex', flexWrap: 'wrap', columnGap: 30 * K, rowGap: 12 * K, width: w, opacity: list, transform: `translateY(${(1 - list) * 20}px)` }}>
          {t.items.map((it, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 * K, fontFamily: FONT.sans, fontSize: 32 * K, fontWeight: 600, lineHeight: 1.35, color: sub, whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 26 * K, color: left ? alpha(PAPER, 0.4) : alpha(INK, 0.55) }}>{left ? `0${i + 1}` : '✓'}</span>
              <span style={{ textDecoration: left ? 'line-through' : undefined, textDecorationThickness: 2 * K }}>{it}</span>
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
};

export const VersusSlam: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const CY = SH / 2;
  const question = useText('question', 'Làm một video quảng cáo mất bao lâu?');
  const qKicker = useText('question_kicker', 'Video ra mắt sản phẩm');
  const L: SideT = {
    label: useText('left_label', 'Cách cũ'),
    number: useText('left_number', '14'),
    unit: useText('left_unit', 'ngày'),
    caption: useText('left_caption', 'Viết kịch bản, quay dựng và ba vòng sửa đi sửa lại.'),
    items: useList('left_items', ['Kịch bản', 'Quay', 'Dựng', 'Sửa lại']).slice(0, 4),
  };
  const R: SideT = {
    label: useText('right_label', 'Cách mới'),
    number: useText('right_number', '1'),
    unit: useText('right_unit', 'buổi chiều'),
    caption: useText('right_caption', 'AI lên kịch bản, dựng cảnh và ghép nhạc đúng nhịp.'),
    items: useList('right_items', ['Tự chọn cảnh', 'Khớp nhịp nhạc']).slice(0, 4),
  };
  const verdictText = useText('verdict', 'Bạn chỉ cần ý tưởng, phần còn lại để AI lo.');

  // 两半屏对冲：ease-in cubic，10f 从画外冲到位（横版 ±1240px；竖版沿纵向 ±0.62·SH）
  const D = portrait ? SH * 0.62 : 1240;
  const offAt = (f: number) => -D * (1 - Math.pow(ramp(f, RUSH, IMPACT - RUSH, EASE.linear), 3));
  const off = offAt(frame);
  const v = velocity(offAt, frame);
  const impacted = frame >= IMPACT;

  // 撞击帧起：整机震屏指数衰减（~5f 收干）
  const since = frame - IMPACT;
  const env = since >= 0 ? 16 * Math.exp(-since / 1.7) : 0;
  const shakeX = env * Math.sin(since * 3.3);
  const shakeY = env * 0.55 * Math.sin(since * 4.2 + 0.8);
  const push = 1 + 0.015 * ramp(frame, IMPACT + 10, 105 - IMPACT - 10, EASE.smooth);

  const flash = impacted ? 0.85 * (1 - ramp(frame, IMPACT, 3, EASE.linear)) : 0;
  const stamp = springAt(frame, IMPACT, { damping: 12, stiffness: 260 });
  const wave = ramp(frame, IMPACT, 16, EASE.out);
  const lines = ramp(frame, IMPACT, 7, EASE.out);

  // 建立段墨线：中点向两端长出，逼近时加粗
  const preGrow = ramp(frame, 2, 14, EASE.snappy);
  const preW = mix(2, 6, ramp(frame, RUSH, IMPACT - RUSH, EASE.exit));
  const verdict = ramp(frame, IMPACT + 26, 18, EASE.snappy);
  const VS = portrait ? 1.35 : 1; // VS 章 / 冲击环 竖版放大

  // 设问：逐词从线下升起（遮罩留足越南语叠加符号空间）
  const qMax = portrait ? 1680 : 1680;
  const qF = fitWrap(question, fonts.sans, 900, portrait ? 160 : 124, portrait ? 100 : 80, qMax, portrait ? 3 : 2);
  const qLH = Math.round(qF.size * 1.14);
  const qKS = portrait ? 40 : 30;
  const qBlockH = qKS * 1.3 + 30 + qF.lines.length * qLH;
  // 横版设问居中于 540（墨线在字带处留空）；竖版放在上三分之一，墨线横贯中线不穿字
  const qTop = portrait ? Math.round(SH * 0.3 - qBlockH / 2) : Math.round(540 - qBlockH / 2 + 10);
  const gapA = ((qTop - (540 - 700)) / 1400) * 100;
  const gapB = ((qTop + qBlockH - (540 - 700)) / 1400) * 100;
  const SEAM_GAP = `linear-gradient(180deg, #000 0%, #000 ${(gapA - 3).toFixed(1)}%, transparent ${(gapA - 0.5).toFixed(1)}%, transparent ${(gapB - 1).toFixed(1)}%, #000 ${(gapB + 1.5).toFixed(1)}%, #000 100%)`;
  let wi = 0;

  const clipFor = (side: 'L' | 'R') => portrait
    ? side === 'L'
      ? `polygon(0px 0px, 1920px 0px, 1920px ${CY - SEAM_DY}px, 0px ${CY + SEAM_DY}px)`
      : `polygon(0px ${CY + SEAM_DY}px, 1920px ${CY - SEAM_DY}px, 1920px ${SH}px, 0px ${SH}px)`
    : side === 'L'
      ? `polygon(0px 0px, ${SEAM_TOP_X}px 0px, ${SEAM_BOT_X}px 1080px, 0px 1080px)`
      : `polygon(${SEAM_TOP_X}px 0px, 1920px 0px, 1920px 1080px, ${SEAM_BOT_X}px 1080px)`;

  const half = (side: 'L' | 'R') => {
    const sgn = side === 'L' ? 1 : -1;
    const tr = portrait ? `translateY(${(sgn * off).toFixed(2)}px)` : `translateX(${(sgn * off).toFixed(2)}px)`;
    // 竖版：上半 = 左方（墨），下半 = 右方（朱）
    const box = portrait
      ? side === 'L'
        ? { x0: PAD, y0: Math.round(Math.max(200, CY - SEAM_DY - 1250)), w: 1680 }
        : { x0: PAD, y0: Math.round(CY + SEAM_DY + 120), w: 1680 }
      : side === 'L'
        ? { x0: PAD, y0: 140, w: 680 }
        : { x0: 1190, y0: 140, w: 620 };
    return (
      <SpeedBlur vx={portrait ? 0 : sgn * v} vy={portrait ? sgn * v : 0} amount={0.1} max={36}>
        <div style={{ position: 'absolute', inset: 0, transform: tr, clipPath: clipFor(side) }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: side === 'L'
              ? `radial-gradient(ellipse 70% 80% at 18% 10%, #2a231c 0%, ${INK} 60%, #0e0b08 100%)`
              : `radial-gradient(ellipse 70% 80% at 85% ${portrait ? 90 : 10}%, ${alpha('#ffffff', 0.12)} 0%, ${alpha('#ffffff', 0)} 55%), linear-gradient(180deg, ${P.accent} 0%, ${P.accent} 100%)`,
          }} />
          <Side side={side} f={frame} t={side === 'L' ? L : R} portrait={portrait} {...box} />
        </div>
      </SpeedBlur>
    );
  };

  const verdictS = verdictText ? fitSize(verdictText, { family: fonts.sans, size: portrait ? 50 : 38, maxWidth: (portrait ? 1680 : 1500) - (brand ? 70 : 0) - 88, weight: 800, minSize: portrait ? 30 : 24 }) : 0;

  return (
    <AbsoluteFill style={{ background: P.bg[1], overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px) scale(${push.toFixed(5)})` }}>
        {/* 建立段：纸面 + 设问 + 斜缝墨线 */}
        {!impacted && (
          <>
            <Stage look={P} keyLight={{ x: 0.5, y: 0.2 }} fill={null} vignette={0.14} grain={0} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: qTop, textAlign: 'center' }}>
              {qKicker ? (
                <div style={{ fontFamily: FONT.sans, fontSize: qKS, fontWeight: 800, lineHeight: 1.3, letterSpacing: '0.2em', color: P.accent, marginBottom: 30, whiteSpace: 'nowrap' }}>{qKicker.toUpperCase()}</div>
              ) : null}
              {qF.lines.map((l, li) => (
                <div key={li} style={{ height: qLH, fontFamily: FONT.sans, fontSize: qF.size, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: `${qLH}px`, color: INK, whiteSpace: 'nowrap' }}>
                  {l.split(/\s+/).filter(Boolean).map((wd, k) => {
                    const p = ramp(frame, 1 + (wi++) * Math.min(3, 12 / Math.max(1, question.split(/\s+/).length)), 14, EASE.snappy);
                    return (
                      <span key={k} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em', marginRight: '0.2em' }}>
                        <span style={{ display: 'inline-block', transform: `translateY(${((1 - p) * 1.7).toFixed(4)}em)` }}>{wd}</span>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            {portrait ? (
              <div style={{
                position: 'absolute', left: 960 - 1000, top: CY - preW / 2, width: 2000, height: preW, background: INK,
                transform: `rotate(${SEAM_DEG_P}deg) scaleX(${preGrow.toFixed(4)})`,
              }} />
            ) : (
              <div style={{
                position: 'absolute', left: 960 - preW / 2, top: 540 - 700, width: preW, height: 1400, background: INK,
                transform: `rotate(${SEAM_DEG}deg) scaleY(${preGrow.toFixed(4)})`,
                // 设问那一带留空：墨线只在字的上下长出，不划过字
                WebkitMaskImage: SEAM_GAP, maskImage: SEAM_GAP,
              }} />
            )}
          </>
        )}

        {half('L')}
        {half('R')}

        {impacted && (
          <>
            {/* 撞合切口：纸白 6px + 两侧窄投影 */}
            {portrait ? (
              <div style={{
                position: 'absolute', left: 960 - 1100, top: CY - 22, width: 2200, height: 44, transform: `rotate(${SEAM_DEG_P}deg)`,
                background: `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(10,6,4,0.35) 38%, ${PAPER} 43%, ${PAPER} 57%, rgba(10,6,4,0.35) 62%, rgba(0,0,0,0) 100%)`,
              }} />
            ) : (
              <div style={{
                position: 'absolute', left: 960 - 22, top: 540 - 700, width: 44, height: 1400, transform: `rotate(${SEAM_DEG}deg)`,
                background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(10,6,4,0.35) 38%, ${PAPER} 43%, ${PAPER} 57%, rgba(10,6,4,0.35) 62%, rgba(0,0,0,0) 100%)`,
              }} />
            )}
            {/* 冲击环 + 放射速度线（单次） */}
            {wave < 1 && (
              <div style={{
                position: 'absolute', left: 960 - mix(130, 640, wave) * VS, top: CY - mix(130, 640, wave) * VS,
                width: mix(260, 1280, wave) * VS, height: mix(260, 1280, wave) * VS, borderRadius: '50%',
                border: `${(mix(14, 1, wave) * VS).toFixed(2)}px solid ${alpha(PAPER, 0.85 * (1 - wave))}`,
              }} />
            )}
            {lines < 1 && (
              <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0 }}>
                {Array.from({ length: 12 }, (_, i) => {
                  const a = (i / 12) * Math.PI * 2 + 0.26;
                  const r0 = mix(170, 420, lines) * VS;
                  const r1 = mix(260, 720, lines) * VS;
                  return (
                    <line key={i} x1={960 + Math.cos(a) * r0} y1={CY + Math.sin(a) * r0} x2={960 + Math.cos(a) * r1} y2={CY + Math.sin(a) * r1}
                      stroke={PAPER} strokeWidth={mix(8, 2, lines) * VS} strokeLinecap="round" opacity={1 - lines} />
                  );
                })}
              </svg>
            )}
            {/* VS 圆章 */}
            <div style={{
              position: 'absolute', left: 960 - 130, top: CY - 130, width: 260, height: 260, borderRadius: '50%',
              transform: `rotate(${((portrait ? SEAM_DEG_P : SEAM_DEG) - 8 * (1 - stamp)).toFixed(3)}deg) scale(${(mix(1.9, 1, stamp) * VS).toFixed(4)})`,
              opacity: Math.min(1, stamp * 4),
              background: PAPER, border: `8px solid ${INK}`, boxSizing: 'border-box',
              boxShadow: `0 4px 0 ${alpha(INK, 0.9)}, 0 30px 60px -12px rgba(10,6,4,0.6)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: `2px solid ${alpha(INK, 0.35)}` }} />
              <span style={{ fontFamily: FONT.sans, fontSize: 124, fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.06em', color: INK, marginLeft: -10, marginTop: -4 }}>
                VS
              </span>
            </div>
            {/* 结论条 */}
            {verdictText ? (
              <div style={{
                position: 'absolute', left: 960, top: portrait ? SH - 330 : 930, transform: `translate(-50%, ${((1 - verdict) * 40).toFixed(2)}px)`, opacity: verdict,
                height: portrait ? 120 : 84, padding: `0 ${portrait ? 54 : 44}px`, borderRadius: portrait ? 60 : 42, background: PAPER, display: 'flex', alignItems: 'center', gap: 18, whiteSpace: 'nowrap',
                boxShadow: '0 20px 44px -14px rgba(10,6,4,0.55)', fontFamily: FONT.sans, fontSize: verdictS, fontWeight: 800, letterSpacing: '-0.02em', color: INK,
              }}>
                {brand ? <ShotcraftMark size={portrait ? 60 : 44} tone="light" /> : null}
                {verdictText}
              </div>
            ) : null}
          </>
        )}
      </div>
      {/* 撞击白闪（不随震屏） */}
      <AbsoluteFill style={{ background: PAPER, opacity: flash, pointerEvents: 'none' }} />
      <Grain opacity={0.06} step={2} blend="overlay" />
    </AbsoluteFill>
  );
};
