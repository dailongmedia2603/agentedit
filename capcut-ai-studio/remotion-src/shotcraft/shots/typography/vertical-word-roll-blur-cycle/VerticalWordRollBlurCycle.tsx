// vertical-word-roll-blur-cycle — Word Roll 竖向词条滚轮（motion-lab 定稿转原生 Remotion）
// 标语（句干 "Crafted for ___"）后半词用竖向滚轮循环 Launches→Demos→Promos→Every Shot：中心词清晰上色，相邻行浅灰带
// 垂直 blur（滚轮景深），每步 outQuint 前快后慢带轻微过冲，落定瞬间中心词从灰染成强调色。
// 质感：blur 改为真·纵向高斯（SVG feGaussianBlur 只在 y 向，横向笔画不糊），转动时再按滚轮
// 速度叠一层纵向运动模糊（静止为 0）；离中心越远的行按滚筒曲面轻微压扁；视窗上下沿柔边渐隐，
// 不再是硬裁切；底景柔光 + 颗粒。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
//
// [Agent Edit] o chu: stem (句干, dung yen) + words (3-5 tu cuoi, tu cuoi = ket luan). Mask rong = tu dai nhat (do bang
// font that) -> khong cat chu; co chu chung cho ca cau (句干 = 滚轮字号) tu thu nho vua be ngang. 3 lan doi tu giu nguyen
// nhip goc (STEPS / cua so 0.11); 5 tu -> 4 lan doi, cua so 0.1 + nghi 0.07 de tu cuoi van hold ~28f.
// Khung doc (native): 句干 dong tren, cuon tu ngay duoi (can giua), chu to ~2x; nen DesignStage cao theo height that.
import React from 'react';
import { useList, useShotFonts, useText, useVideoConfig, fitSize, measureText } from '../../../runtime';
import { DesignStage, E, seg, useT } from '../../../fixtures/Motion';
import { Backdrop, Grain } from '../../../fixtures/Polish';
import { LOOKS } from '../../../fixtures/Look';

export const VERTICAL_WORD_ROLL_BLUR_CYCLE_DURATION = 150; // 5000ms @30fps

const ROW_K = 44 / 30; // 行高 = 字号 × 44/30（原版 30px 字 / 44px 行）

const ACCENT_DIM = '#B9B9BE';
const INK = '#17181c';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// 十六进制颜色按 k 混合（与原 effect.js 的 mixHex 等价）
const mixHex = (a: string, b: string, k: number) => {
  k = clamp01(k);
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

// 换词拍点：3 次换词 = 原版 [0.16,0.36,0.56] 窗 0.11；4 次 = 窗 0.1 + 段间 0.07（末词仍 hold）
const stepsFor = (swaps: number): { steps: number[]; win: number } =>
  swaps >= 4
    ? { steps: [0.1, 0.27, 0.44, 0.61].slice(0, swaps), win: 0.1 }
    : { steps: [0.16, 0.36, 0.56].slice(0, Math.max(1, swaps)), win: 0.11 };

// 滚轮进度 p：每步 0.7·outQuint + 0.3·outBack（前快后极慢 + 轻微过冲回落）
const reelAt = (t: number, steps: number[], win: number) => {
  let p = 0;
  for (const s of steps) {
    const u = seg(t, s, s + win);
    p += 0.7 * E.outQuint(u) + 0.3 * E.outBack(u);
  }
  return p;
};
const DT = 0.5 / (VERTICAL_WORD_ROLL_BLUR_CYCLE_DURATION - 1); // 半帧对应的 t

export const VerticalWordRollBlurCycle: React.FC = () => {
  const t = useT();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const stem = useText('stem', 'Dành cho');
  const words = useList('words', ['nhà sáng tạo', 'chủ shop', 'giáo viên', 'tất cả mọi người']).slice(0, 5);
  const ACCENT = LOOKS.porcelain.accent;
  const portrait = SH > 1080 * 1.2;
  const DH = SH / 4; // 设计坐标高（宽恒 480）
  const W = 480;
  const MAXW = 436; // 两侧各留 22 设计 px
  const fam = fonts.sans;
  const LS = -0.5 / 30; // letter-spacing -0.5px@30px → em
  const widest = words.reduce((a, w) => (measureText(w, fam, 30, 800) > measureText(a, fam, 30, 800) ? w : a), words[0] || '');
  // 句干与滚轮同字号同字重（卡片要求）：横版一行装下 "句干 + 最长词"，竖版两行各自装下
  let size: number;
  if (portrait) {
    size = Math.min(
      fitSize(stem, { family: fam, size: 50, maxWidth: MAXW, weight: 800, minSize: 26, letterSpacingEm: LS }),
      fitSize(widest, { family: fam, size: 50, maxWidth: MAXW, weight: 800, minSize: 26, letterSpacingEm: LS }),
    );
  } else {
    const gap0 = 14;
    const total = measureText(stem, fam, 30, 800) + gap0 + measureText(widest, fam, 30, 800);
    size = total <= MAXW ? 30 : Math.max(17, Math.floor((30 * MAXW) / total * 100) / 100);
  }
  const ROW = size * ROW_K;
  const gap = (14 * size) / 30;
  const maskW = Math.ceil(measureText(widest, fam, size, 800) * 1.02 + size * 0.2);

  const { steps, win } = stepsFor(words.length - 1);
  const p = reelAt(t, steps, win);
  // 滚轮速度（行/帧）→ 纵向运动模糊（设计 px），静止时为 0
  const speed = Math.abs(reelAt(t + DT, steps, win) - reelAt(t - DT, steps, win));
  const motionBlur = Math.min(4 * (size / 30), speed * ROW * 0.22);

  const textStyle: React.CSSProperties = { fontSize: size, fontWeight: 800, letterSpacing: `${LS}em`, whiteSpace: 'nowrap' };
  const reel = (
    // 三行高的视窗，滚轮列在其中滑动，中心行 = 第二行；上下沿柔边渐隐
    <div
      style={{
        position: 'relative',
        height: ROW * 3,
        width: portrait ? MAXW : maskW,
        overflow: 'hidden',
        flexShrink: 0,
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)',
        maskImage: 'linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)',
      }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, transform: `translateY(${ROW - p * ROW}px)` }}>
        {words.map((w, i) => {
          const d = Math.abs(i - p);
          // 相邻行纵向 blur：距中心 1 行内线性 0→3px，更远 3→5px（按字号同比）；转动时叠运动模糊
          const k = size / 30;
          const blur = (d < 1 ? 3 * d : 3 + 2 * Math.min(d - 1, 1)) * k + motionBlur;
          const op = d < 1 ? 1 - 0.65 * d : Math.max(0.1, 0.35 - 0.23 * (d - 1));
          // 滚筒曲面：离中心越远越扁（最多 14%）
          const squash = 1 - 0.14 * Math.min(1, d / 1.4);
          const fid = `vroll-${i}`;
          return (
            <div key={i} style={{ position: 'relative', height: ROW }}>
              <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
                <filter id={fid} x="-10%" y="-120%" width="120%" height="340%" colorInterpolationFilters="sRGB">
                  <feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} />
                </filter>
              </svg>
              <div
                style={{
                  ...textStyle,
                  height: ROW,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: portrait ? 'center' : 'flex-start',
                  filter: blur > 0.05 ? `url(#${fid})` : undefined,
                  opacity: op,
                  transform: `scaleY(${squash.toFixed(4)})`,
                  // 落定染色：中心词灰→强调色（d 越小越彩）
                  color: mixHex(ACCENT_DIM, ACCENT, clamp01(1 - d * 2.4)),
                }}
              >
                {w}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <DesignStage bg="#F4F4F2" h={DH}>
        <Backdrop tone="light" light={{ x: 0.5, y: portrait ? 0.4 : 0.3 }} accent={ACCENT} vignette={0.12} grain={0} />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: W,
            height: DH,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: fam,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: portrait ? 'column' : 'row',
              alignItems: 'center',
              gap: portrait ? 0 : gap,
              // 结束整组淡出
              opacity: 1 - seg(t, 0.9, 0.985) * 0.999,
            }}
          >
            {/* 句干钉死：竖版独占一行（居中），与滚轮中心行相隔半行 */}
            <div style={{ ...textStyle, color: INK, lineHeight: `${ROW}px`, marginBottom: portrait ? -ROW * 0.2 : 0 }}>{stem}</div>
            {reel}
          </div>
        </div>
      </DesignStage>
      {/* 颗粒放在设计坐标容器外，按成片像素取样，不随 4× 放大变粗 */}
      <Grain opacity={0.05} />
    </div>
  );
};
