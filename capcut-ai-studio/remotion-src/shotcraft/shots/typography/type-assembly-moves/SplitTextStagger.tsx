// 逐字遮罩裂升（split-text-stagger）——GSAP SplitText 惯用入场。
// 标题按字符拆 span，每字外包 overflow:hidden 的行高盒，
// 内层从 translateY(115%) 升到 0，各 14f Easing.out(cubic)，带 10% 过冲
// 再 6f 回落（原案 6% 过冲，按可感性红线加码到 10%）。delay = 字符索引×2f。
// 底部基线细线在首字起跳同帧从左向右生长，暗示裁切线存在。
// 关键帧：0–12 空场 hold → 12 首字起跳 + 基线开始生长 → 每字 12+i*2 起跳，
// 14f 升至 -10% 过冲 → 再 6f 回落归 0 → 末字(索引12)于 56f 落定 →
// 56–130 全静止（74f ≥ 40f，无逐帧噪声层）。
//
// 质感升级：去掉调试标题；柔光 Backdrop；系统 SF 栈 700、字号 120→136；
// 升起快速段按每字竖向速度加 y 向运动模糊（静止为 0）；基线改强调色、宽度与文字行严格等宽，
// 生长用强 ease-out；补导出时长 130f（原工作台按 56f 推断，末字刚落定就切走）。
//
// [Agent Edit] o chu: title (cau chot ngan, chu that dai ngan bat ky) + kicker (tuy chon, dong nho phia tren).
// Tu xuong dong theo be ngang that (khung ngang <=2 dong, khung doc <=3 dong, co chu tu vua); nhip 2f/ky tu duoc nen
// khi chu dai de ky tu cuoi van dap truoc ~f70. Mat na moi ky tu: tren 0.3em + duoi 0.25em (giu dau tieng Viet, chan g y).
// Khung doc (native): chu to ~220px, khoi chu can giua theo chieu doc.
import { useCurrentFrame, useVideoConfig, useText, useShotFonts, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { interpolate, Easing } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { LOOKS, alpha } from '../../../fixtures/Look';
import { Backdrop, EASE, ramp } from '../../../fixtures/Polish';

export const SPLIT_TEXT_STAGGER_DURATION = 130;

const START = 12; // 首字起跳帧
const RISE = 14; // 升起时长
const SETTLE = 6; // 过冲回落时长
const OVERSHOOT = -10; // 过冲到 -10%（原案 6%，加码）
const FROM = 125; // 起点（%）：mat na co dem duoi 0.25em -> can xuong sau hon 115% de dau tieng Viet khong lo ra
const LINE_H = 1.05; // span 行高（translateY 百分比以此为基准）

// 单字符纵向位移（%）：FROM → -10（out cubic）→ 0（out quad），帧确定
const charY = (f: number, t0: number): number => {
  if (f < t0 + RISE) {
    return interpolate(f, [t0, t0 + RISE], [FROM, OVERSHOOT], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  }
  return interpolate(f, [t0 + RISE, t0 + RISE + SETTLE], [OVERSHOOT, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });
};

export const SplitTextStagger: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const TEXT = useText('title', 'Làm ít hơn. Đạt nhiều hơn.');
  const kicker = useText('kicker', '');
  const ACC = LOOKS.porcelain.accent;
  const maxW = portrait ? 1680 : 1680;
  const size0 = portrait ? 220 : 136;
  const lines0 = wrapLines(TEXT, fonts.sans, size0, maxW, 700, portrait ? 3 : 2);
  const FONT = Math.min(...lines0.map((l) => fitSize(l, { family: fonts.sans, size: size0, maxWidth: maxW, weight: 700, letterSpacingEm: -0.015, minSize: size0 * 0.45 })));
  const lines = wrapLines(TEXT, fonts.sans, FONT, maxW, 700, portrait ? 3 : 2);
  const total = lines.reduce((a, l) => a + Array.from(l).length, 0);
  const step = Math.min(2, 38 / Math.max(1, total - 1)); // 字多时压密 delay
  // 基线：首字起跳同帧开始，从左向右生长到 100%
  const lineW = ramp(frame, START, 30, EASE.snappy) * 100;
  const kickFs = portrait ? 44 : 28;
  const kickIn = ramp(frame, 4, 16, EASE.out);
  let idx = 0;

  return (
    <div style={{ width: 1920, height: SH, position: 'relative', overflow: 'hidden' }}>
      <Backdrop tone="light" light={{ x: 0.42, y: 0.3 }} accent={ACC} grain={0.045} vignette={0.12} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* 行容器：基线与文字行同宽 */}
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
          {kicker ? (
            <div style={{ fontFamily: fonts.sans, fontSize: kickFs, fontWeight: 650, letterSpacing: '0.16em', color: ACC, marginBottom: kickFs * 0.5, whiteSpace: 'nowrap', opacity: kickIn, transform: `translateY(${((1 - kickIn) * 10).toFixed(2)}px)` }}>
              {kicker}
            </div>
          ) : null}
          {lines.map((ln, li) => (
            <div key={li} style={{ display: 'flex', marginTop: li ? -FONT * 0.42 : 0 }}>
              {Array.from(ln).map((c) => {
                const i = idx++;
                const t0 = START + i * step;
                const y = charY(frame, t0);
                // 竖向速度（px/帧）→ y 向模糊
                const vy = Math.abs(charY(frame + 0.5, t0) - charY(frame - 0.5, t0)) * FONT * (LINE_H + 0.25) * 0.01;
                const blur = Math.min(10, vy * 0.32);
                const id = `sts-vb-${i}`;
                return (
                  <div key={i} style={{
                    // 遮罩盒：上方留 0.3em 头部空间容纳过冲 / 声调符号，下方 0.25em 容纳 g y 下伸；底边即裁切线
                    overflow: 'hidden', height: FONT * 1.6, display: 'flex', alignItems: 'flex-end',
                  }}>
                    {blur > 0.3 && (
                      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
                        <filter id={id} x="-10%" y="-50%" width="120%" height="200%">
                          <feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} />
                        </filter>
                      </svg>
                    )}
                    <span style={{
                      display: 'inline-block', fontFamily: fonts.sans, fontWeight: 700, fontSize: FONT, lineHeight: LINE_H, paddingBottom: '0.25em',
                      color: G.ink1, letterSpacing: '-0.015em', whiteSpace: 'pre',
                      transform: `translateY(${y.toFixed(3)}%)`, filter: blur > 0.3 ? `url(#${id})` : undefined,
                    }}>
                      {c === ' ' ? ' ' : c}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {/* 基线细线：宽度从 0 生长到全文宽（强调色，暗示裁切线） */}
          <div style={{ marginTop: -FONT * 0.12, height: portrait ? 5 : 3, display: 'flex', alignSelf: 'stretch' }}>
            <div style={{ height: '100%', width: `${lineW.toFixed(3)}%`, borderRadius: 2, background: `linear-gradient(90deg, ${ACC}, ${alpha(ACC, 0.6)})` }} />
          </div>
        </div>
      </div>
    </div>
  );
};
