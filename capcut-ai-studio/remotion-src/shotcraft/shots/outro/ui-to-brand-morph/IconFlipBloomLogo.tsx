// icon-flip-bloom-logo —— 图标 Y 轴翻转压扁成竖线，绽放成花形 mark + wordmark 扫出
// 源：perplexity-promo 88–91.5s。笑脸 laptop 图标 anticipation 晃两下 →
// 沿 Y 轴翻转压扁成竖线（拖影/模糊）→ 翻过最薄处绽放花形 mark（花瓣张开）→
// wordmark 逐字由大变小落位（大时模糊、落位清晰，scale+blur 联动）。
// 质感：柔光亮场背景 + 图标的接地软影（随晃动/翻扁变化）。
// 品牌轮：终点 logo 换成 video-shotcraft「镜刻」标志——翻过最薄处，标志从竖线按同一个过冲 spring
// 撑开（取景框），随后琥珀斜切沿 45° 划入（替代原花瓣张开的第二拍）；字标 video-shotcraft 全小写、
// 品牌字体，逐字由大变小落定；全片唯一强调色是标志的琥珀斜切。
//
// [Agent Edit] Logo = thuong hieu cua VIDEO: co logo anh -> logo that; khong co -> khung bo goc + chu viet tat cua ten.
// o chu name (ten san pham / kenh / thuong hieu; bo trong -> ten thuong hieu cua video). Khong co ca hai -> chi con
// dau hieu trung tinh o giua (khong co chu). Do be ngang ten that de can giua ca cum logo + ten.
// Khung doc (portrait.mode = 'native'): cum logo xep DOC (logo dich len, ten hien ben duoi), logo + chu to hon.
import { useBackdrop, useCurrentFrame, useVideoConfig, useBrand, useShotFonts, useText, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate, Easing, spring } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { Backdrop, EASE, ramp } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const ICON_FLIP_BLOOM_LOGO_DURATION = 130;
const MARK0 = 300; // 标志尺寸（viewBox 128 → 可见取景框约 244×225）

// 无品牌 logo 时的标志：圆角取景框 + 名称首字母（cutProgress 驱动首字母的第二拍出现）
const NeutralMark: React.FC<{ size: number; word: string; cut: number }> = ({ size, word, cut }) => {
  const fonts = useShotFonts();
  const initials = word.trim() ? word.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '';
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: 'block', overflow: 'visible' }}>
      <rect x={14} y={14} width={100} height={100} rx={26} fill="none" stroke={BRAND.ink} strokeWidth={12} />
      {initials ? (
        <text x={64} y={64} textAnchor="middle" dominantBaseline="central" style={{ fontFamily: fonts.sans, fontWeight: 800, fontSize: initials.length > 1 ? 46 : 58 }} fill={BRAND.amber} opacity={cut} transform={`translate(${(1 - cut) * -10} ${(1 - cut) * 10})`}>{initials}</text>
      ) : (
        <circle cx={64} cy={64} r={18 * cut} fill={BRAND.amber} />
      )}
    </svg>
  );
};

const SmileLaptop: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <rect x={7} y={6} width={26} height={20} rx={3.5} fill="#fff" stroke={G.ink} strokeWidth={3} />
    <circle cx={15.5} cy={13.5} r={2} fill={G.ink} />
    <circle cx={24.5} cy={13.5} r={2} fill={G.ink} />
    <path d="M14 18.5 Q20 23.5 26 18.5" stroke={G.ink} strokeWidth={2.8} fill="none" strokeLinecap="round" />
    <path d="M3.5 31.5 L36.5 31.5" stroke={G.ink} strokeWidth={3.6} strokeLinecap="round" />
  </svg>
);

export const IconFlipBloomLogo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height: SH } = useVideoConfig();
  const brand = useBrand();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const WORD = useText('name', ' ').trim() || (brand?.name ?? '').trim();
  const MARK = portrait ? 500 : MARK0;
  const MV = MARK * (244 / 300); // 可见取景框宽
  const GAP = MARK * (65 / 300);
  const FS0 = portrait ? 190 : 112;
  const fs = WORD ? fitSize(WORD, { family: fonts.sans, size: FS0, maxWidth: portrait ? 1640 : 1700 - MV - GAP, weight: 700, letterSpacingEm: 0.03, minSize: 44 }) : FS0;
  const wordW = WORD ? measureText(WORD, fonts.sans, fs, 700) * 1.0 + 0.03 * fs * WORD.length : 0;
  const cy = SH / 2;

  // ---- 时间轴 ----
  // 0–10: 图标登场（淡入微弹）
  // 12–34: anticipation 倾斜蓄力晃两下
  // 34–46: Y 轴翻转压扁成竖线（scaleX -> 0.04，带拖影）
  // 46–62: 翻过最薄处标志撑开（bloom 0->1 带过冲），53 起琥珀斜切划入
  // 64–100: mark 左移让位 + wordmark 逐字符方向模糊扫出
  const FLIP_START = 34;
  const FLIP_MID = 46;
  const BLOOM_END = 62;
  const WORD_START = 66;

  // 登场
  const inT = spring({ frame, fps, config: { damping: 13, stiffness: 140, mass: 0.8 } });

  // anticipation：两次倾斜摆动，幅度递增（-10° / +14°），最后向反方向压一下蓄力
  const wobble =
    interpolate(frame, [12, 18, 24, 30, FLIP_START], [0, -12, 14, -18, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.sin),
    });

  // 翻转前半：scaleX 1 -> 0.04（加速入），伴随拖影
  const flipIn = interpolate(frame, [FLIP_START, FLIP_MID], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const iconScaleX = interpolate(flipIn, [0, 1], [1, 0.04]);

  // 绽放：spring 过冲
  const bloomSpring = spring({
    frame: frame - FLIP_MID,
    fps,
    config: { damping: 11, stiffness: 130, mass: 0.9 },
  });
  const bloom = frame < FLIP_MID ? 0 : bloomSpring;
  // mark 从竖线厚度撑开：scaleX 0.04 -> 1
  const markScaleX = interpolate(bloom, [0, 1], [0.04, 1]);
  // 第二拍：琥珀斜切沿自身 45° 方向划入（取景框撑开过半后起步）
  const cut = frame < FLIP_MID + 7 ? 0 : spring({ frame: frame - FLIP_MID - 7, fps, config: { damping: 16, stiffness: 170 } });

  // mark 左移让位（wordmark 登场时）
  const shift = interpolate(frame, [WORD_START - 2, WORD_START + 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  // lockup 整组视觉居中：landscape 标志左移让位（原版 -471 / 字标起点 +187）；portrait 标志上移、字标在下
  const lockW = MV + GAP + wordW;
  const markX = WORD && !portrait ? interpolate(shift, [0, 1], [0, -lockW / 2 + MV / 2]) : 0;
  const markY = WORD && portrait ? interpolate(shift, [0, 1], [0, -(fs * 1.25 + GAP) / 2]) : 0;

  const showIcon = frame < FLIP_MID;
  const bd = useBackdrop();

  // 拖影帧（翻转期间画 2 个残影）
  const ghosts = frame >= FLIP_START && frame < FLIP_MID ? [0.12, 0.24] : [];

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : G.bg, alignItems: 'center', justifyContent: 'center' }}>
      {/* [Agent Edit] nen anh AI: khong ve nen sang code */}
      {!bd && <Backdrop tone="light" light={{ x: 0.5, y: 0.36 }} accent={BRAND.amber} />}
      {/* 接地软影：图标阶段随晃动偏移、翻扁时收窄，绽放后淡去（logo 是平面符号，不需要落地影） */}
      <div style={{
        position: 'absolute', left: 960 + markX - (MARK / 2) * (showIcon ? iconScaleX : markScaleX) + wobble * 2.2, top: cy + MARK / 2,
        width: MARK * (showIcon ? iconScaleX : markScaleX), height: 26, borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(20,22,28,0.22) 0%, rgba(20,22,28,0) 70%)',
        opacity: inT * (1 - ramp(frame, FLIP_MID, 14, EASE.out)),
      }} />
      <div style={{ position: 'relative', width: 1920, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* 图标 / mark 容器 */}
        <div
          style={{
            position: 'absolute',
            left: 960 + markX,
            top: 200 + markY,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {showIcon ? (
            <>
              {ghosts.map((g, i) => {
                const gs = Math.min(1, iconScaleX + g);
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: `translate(-50%, -50%) scaleX(${gs})`,
                      opacity: 0.22 - i * 0.08,
                      filter: 'blur(6px)',
                    }}
                  >
                    <SmileLaptop size={MARK * 1.13} />
                  </div>
                );
              })}
              <div
                style={{
                  transform: `scale(${inT}) rotate(${wobble}deg) scaleX(${iconScaleX})`,
                  transformOrigin: 'center 78%',
                  filter: flipIn > 0.3 ? `blur(${flipIn * 5}px)` : 'none',
                  opacity: inT,
                }}
              >
                <SmileLaptop size={MARK * 1.13} />
              </div>
            </>
          ) : (
            <div style={{ transform: `scaleX(${markScaleX})` }}>
              {brand ? <ShotcraftMark size={MARK} tone="light" cutProgress={cut} /> : <NeutralMark size={MARK} word={WORD} cut={cut} />}
            </div>
          )}
        </div>

        {/* wordmark：逐字由大变小落位——大时模糊、落位清晰（scale + blur 联动），原点钉在基线 */}
        <div
          style={{
            position: 'absolute',
            left: portrait ? 960 - wordW / 2 : 960 + markX + MV / 2 + GAP,
            top: portrait ? 200 + markY + MV / 2 + GAP + fs * 0.62 : 200,
            transform: 'translateY(-50%)',
            display: 'flex',
            fontFamily: BRAND.font,
            fontWeight: 700,
            fontSize: fs,
            lineHeight: 1.3,
            color: BRAND.ink,
            textShadow: bd ? (bd.dark ? '0 2px 18px rgba(0,0,0,0.55)' : '0 1px 12px rgba(255,255,255,0.7)') : undefined,
            letterSpacing: '0.03em',
            whiteSpace: 'nowrap',
          }}
        >
          {Array.from(WORD).map((ch, i, arr) => {
            const st = WORD_START + i * Math.min(2.6, 34 / Math.max(1, arr.length)); // 长名压密错峰，保证落定 // 每字独立的"由大变小"动作，错峰拉到 2.6f 才读得清
            const cT = ramp(frame, st, 12, EASE.snappy);
            const op = ramp(frame, st, 5, EASE.out);
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  opacity: op,
                  transform: `scale(${(1.9 - 0.9 * cT).toFixed(4)})`,
                  transformOrigin: '50% 78%',
                  filter: cT < 0.995 ? `blur(${((1 - cT) * 14).toFixed(2)}px)` : undefined,
                }}
              >
                {ch === ' ' ? '\u00a0' : ch}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
