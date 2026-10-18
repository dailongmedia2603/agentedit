// radial-wave — Grid Radial Wave 点阵涟漪（motion-lab 定稿转原生 Remotion）
// 17×9 圆点阵列，波从中心向外按欧氏距离 stagger 扩散：每点 scale 0→1.5→1 +
// 亮度脉冲，波前过后留下常亮点阵；第二道波反向收拢。offset = k·dist(cell, origin)。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
//
// [Agent Edit] Bo DesignStage: ve truc tiep tren san khau 1920 x height (he so 4x so voi toa do thiet ke 480×270 —
// diem 10px -> 40px, buoc luoi 1920/17). Khung doc (portrait.mode = 'native'): giu 17 cot, so hang tang theo chieu cao that
// (luon le de nguon song o tam), song van chuan hoa theo khoang cach xa nhat -> lan het luoi trong cung thoi gian.
// O chu (tuy chon): kicker + title — dong chu giua man hinh hien len khi tam luoi vua "co dien" (f≈28), co quang toi
// phia sau de cham khong lam roi chu. Khong co chu -> dung nhu ban goc (chi luoi cham).
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { E, seg, useT } from '../../../fixtures/Motion';
import { EASE, ramp } from '../../../fixtures/Polish';
import { useCurrentFrame, useVideoConfig, useText, useShotFonts, wrapLines, fitSize } from '../../../runtime';

export const RADIAL_WAVE_DURATION = 114; // 3800ms @30fps

const COLS = 17;
const K = 4; // 480 -> 1920
const STEP = 1920 / COLS;

// xuong dong can doi
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

export const RadialWave: React.FC = () => {
  const t = useT();
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', '');
  const title = useText('title', '');

  // luoi: 17 cot; so hang = 9 (khung ngang) hoac tang theo chieu cao (le)
  const ROWS = portrait ? Math.max(9, 2 * Math.round((SH / STEP - 1) / 2) + 1) : 9;
  const rowStep = portrait ? STEP : 1080 / 9;
  const top0 = (SH - ROWS * rowStep) / 2;
  const CX = (COLS - 1) / 2;
  const CY = (ROWS - 1) / 2;
  const MAX_D = Math.hypot(CX, CY);

  // chu giua
  const W = portrait ? 1640 : 1500;
  const TS = portrait ? 200 : 150;
  const tl = title ? wrapBalanced(title, fonts.sans, TS, W, 800, portrait ? 3 : 2) : [];
  const tSz = tl.length ? Math.min(...tl.map((l) => fitSize(l, { family: fonts.sans, size: TS, maxWidth: W, weight: 800, minSize: portrait ? 90 : 64, letterSpacingEm: -0.035 }))) : TS;
  const kSz = portrait ? 52 : 38;
  const kFit = kicker ? fitSize(kicker, { family: fonts.sans, size: kSz, maxWidth: W, weight: 650, minSize: kSz * 0.6, letterSpacingEm: 0.2 }) : kSz;
  const txtIn = ramp(f, 28, 22, EASE.out);
  const kIn = ramp(f, 24, 18, EASE.out);
  const hasText = tl.length > 0 || !!kicker;
  const blockH = (kicker ? kFit * 1.4 + 24 : 0) + tl.length * tSz * 1.15;

  return (
    <AbsoluteFill style={{ background: '#0a0b10', overflow: 'hidden' }}>
      {Array.from({ length: ROWS * COLS }, (_, i) => {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const dist = Math.hypot(c - CX, r - CY) / MAX_D;
        // 第一道波：扩散点亮；第二道波：反向脉冲
        const w1 = seg(t, dist * 0.35, dist * 0.35 + 0.18, E.outCubic);
        const w2 = seg(t, 0.62 + (1 - dist) * 0.25, 0.62 + (1 - dist) * 0.25 + 0.15);
        const pulse2 = Math.sin(w2 * Math.PI);
        const s = w1 * (1 + 0.5 * Math.sin(w1 * Math.PI)) + pulse2 * 0.8;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 10 * K,
              height: 10 * K,
              borderRadius: '50%',
              left: (c + 0.5) * STEP,
              top: top0 + (r + 0.5) * rowStep,
              margin: -5 * K,
              background: pulse2 > 0.3 ? '#b9f2ff' : '#6c8cff',
              transform: `scale(${s})`,
              opacity: 0.25 + w1 * 0.5 + pulse2 * 0.25,
              boxShadow: pulse2 > 0.3 ? `0 0 ${12 * K}px #7fd8ff` : 'none',
            }}
          />
        );
      })}
      {hasText ? (
        <>
          {/* quang toi sau chu: cham van thay o rìa, chu doc ro */}
          <div style={{
            position: 'absolute', left: '50%', top: SH / 2, width: W + 400, height: blockH + 360, transform: 'translate(-50%, -50%)', opacity: txtIn,
            background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(10,11,16,0.92) 0%, rgba(10,11,16,0.8) 55%, rgba(10,11,16,0) 100%)',
          }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: SH / 2 - blockH / 2, textAlign: 'center' }}>
            {kicker ? (
              <div style={{
                fontFamily: fonts.sans, fontSize: kFit, fontWeight: 650, letterSpacing: '0.2em', lineHeight: 1.4, color: '#b9f2ff', marginBottom: 24, whiteSpace: 'nowrap',
                opacity: kIn, transform: `translateY(${((1 - kIn) * 16).toFixed(2)}px)`, textShadow: '0 0 18px rgba(127,216,255,0.6)',
              }}>{kicker}</div>
            ) : null}
            {tl.map((l, i) => {
              const p = ramp(f, 28 + i * 4, 22, EASE.out);
              return (
                <div key={i} style={{
                  fontFamily: fonts.sans, fontSize: tSz, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.15, color: '#f2f6ff', whiteSpace: 'nowrap',
                  opacity: p, filter: p >= 0.999 ? undefined : `blur(${((1 - p) * 14).toFixed(2)}px)`, transform: `scale(${(1.06 - 0.06 * p).toFixed(4)})`,
                  textShadow: '0 0 40px rgba(108,140,255,0.45)',
                }}>{l}</div>
              );
            })}
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
