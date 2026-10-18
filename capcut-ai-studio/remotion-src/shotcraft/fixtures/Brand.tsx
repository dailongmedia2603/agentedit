// video-shotcraft 品牌件——demo 里出现 logo / 品牌名 / 宣传语时统一用这里：
// 标志 <ShotcraftMark>（「镜刻 / Frame Chisel」：开口取景框 + 琥珀斜切，与 assets/brand/logo-mark.svg 同一组路径）、
// 字标 <ShotcraftWordmark>、品牌色 BRAND、宣传文案库 PITCH。规范见 assets/brand/BRAND.md：
// 字标全小写（不做全大写科技字标）；标志不旋转斜切、不加发光/渐变/描边/投影，琥珀是唯一强调色。
// 纯 props 函数，只依赖 react；copy demo 时连同本文件一并带上并改 import 路径。
import React from 'react';
import { currentBrand, currentShotFonts } from '../runtime';

// [Agent Edit] Thuong hieu = thuong hieu CUA VIDEO (Brand Guideline cua app), doc luc ve qua runtime.
// Khong co thuong hieu -> name = '' (mau dung chu ten thuong hieu phai thay bang o chu / an di).
export const BRAND = {
  get name(): string { return currentBrand()?.name ?? ''; },
  get short(): string { return currentBrand()?.name ?? ''; },
  repo: '',
  amber: '#D3923C', // mau nhan cua dau hieu (ShotPlayer doi theo mau nhan cua video)
  ink: '#171714',
  paper: '#F5F3EE',
  slate: '#B5B0A5',
  get font(): string { return currentShotFonts().sans; },
};

// 标志的两段路径（viewBox 0 0 128 128）：frame = 开口取景框，cut = 斜切。分开导出，方便分段做动画
// （框先画出 / 斜切后划入、斜切单独上光等）。
export const MARK_PATHS = {
  frame: 'M16 16h96v26H42v44h70v26H16V16Z',
  cut: 'M92 48h28L84 84H56l36-36Z',
} as const;

// 标志。tone='dark' 用于暗底（取景框反白），'light' 用于亮底；frameColor / cutColor 可覆盖。
// cutProgress 0→1：斜切沿自身方向从无到有划入（默认 1 = 完整）；frameProgress 同理按取景框描出比例裁切。
export const ShotcraftMark: React.FC<{
  size?: number; tone?: 'dark' | 'light'; frameColor?: string; cutColor?: string;
  frameProgress?: number; cutProgress?: number; style?: React.CSSProperties;
}> = ({ size = 96, tone = 'dark', frameColor, cutColor, frameProgress = 1, cutProgress = 1, style }) => {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const brand = currentBrand();
  const fp = Math.max(0, Math.min(1, frameProgress));
  const cp = Math.max(0, Math.min(1, cutProgress));
  const fc = frameColor ?? (tone === 'dark' ? BRAND.paper : BRAND.ink);
  const cc = cutColor ?? BRAND.amber;
  if (brand?.logo) {
    // [Agent Edit] logo that cua video: hien dan theo tien do khung — giu nhip cua mau goc
    const p = Math.min(fp, 0.35 + 0.65 * cp);
    return (
      <div style={{ width: size, height: size, display: 'block', ...style }}>
        <img src={brand.logo} style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: p, transform: `scale(${(0.9 + 0.1 * p).toFixed(3)})` }} />
      </div>
    );
  }
  // [Agent Edit] khong co logo: khung bo goc trung tinh + chu viet tat ten thuong hieu (hoac cham mau nhan)
  const name = (brand?.name || '').trim();
  const initials = name ? name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '';
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: 'block', overflow: 'visible', ...style }}>
      <defs>
        <clipPath id={`f${id}`}><rect x={0} y={0} width={128 * fp} height={128} /></clipPath>
      </defs>
      {fp > 0 && (
        <rect x={14} y={14} width={100} height={100} rx={26} fill="none" stroke={fc} strokeWidth={12} clipPath={fp < 1 ? `url(#f${id})` : undefined} />
      )}
      {cp > 0 && (initials ? (
        <text x={64} y={64} textAnchor="middle" dominantBaseline="central" style={{ fontFamily: currentShotFonts().sans, fontWeight: 800, fontSize: initials.length > 1 ? 46 : 58 }} fill={cc} opacity={cp}>{initials}</text>
      ) : (
        <circle cx={64} cy={64} r={18 * cp} fill={cc} />
      ))}
    </svg>
  );
};

// 字标：标志 + video-shotcraft 横排（logo-lockup.svg 的比例：标志高 ≈ 字号 2.1 倍，700 字重，+0.03em 字距）。
// size = 字号（px）；只要字不要标志时 mark={false}。
export const ShotcraftWordmark: React.FC<{
  size?: number; tone?: 'dark' | 'light'; color?: string; mark?: boolean;
  markScale?: number; gap?: number; weight?: number; fontFamily?: string; style?: React.CSSProperties;
}> = ({ size = 48, tone = 'dark', color, mark = true, markScale = 2.1, gap, weight, fontFamily, style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: gap ?? size * 0.5, ...style }}>
    {mark && <ShotcraftMark size={size * markScale} tone={tone} />}
    {BRAND.name ? <span style={{
      fontFamily: fontFamily ?? BRAND.font,
      fontSize: size, fontWeight: weight ?? 700, lineHeight: 1, letterSpacing: '0.03em', whiteSpace: 'nowrap',
      color: color ?? (tone === 'dark' ? BRAND.paper : BRAND.ink),
    }}>{BRAND.name}</span> : null}
  </div>
);

// 宣传文案库——要写口号 / 标题 / 副标题 / 评价时从这里挑或照这个口径改写，别编与事实不符的数字
// （卡片数、star 数、用户数这类会变的数字不要写进画面）。
export const PITCH = {
  en: {
    motto: 'Frame motion. Craft the shot.', // 品牌短句（BRAND.md）
    taglines: [
      'One prompt to a finished promo.',
      'Cinematic product videos, crafted by your agent.',
      'Every shot, tuned in one place.',
      'Shot recipes for cinematic product films.',
      'Storyboard. Animate. Sound-design. Deliver.',
      'Your product, in motion.',
      'From screenshot to showreel.',
      'Direct the film. Let the agent shoot it.',
    ],
    features: [
      'Shot recipe cards', 'Real page captures', '2.5D camera moves', 'Beat-synced cuts',
      'Film-grade SFX', 'Motion workbench', 'Remotion render', 'JianYing export',
    ],
    praise: [
      'Feels like a launch film from a real studio.',
      'The first agent skill that actually understands pacing.',
      'Our promo shipped the same afternoon.',
      'Camera moves I would have keyframed for a week.',
      'Motion design without the motion designer bill.',
    ],
    works: 'An agent skill for Claude Code & Codex · Built on Remotion',
  },
  zh: {
    motto: '把运动，刻成镜头。', // 品牌短句（BRAND.md）
    taglines: [
      '一句话，出一支片。',
      '镜头配方卡，宣传片一键直出。',
      '让你的 agent 拍出电影感产品片。',
      '每一个镜头，都调到了位。',
      '分镜、动效、音效、交付，一条龙。',
      '把截图拍成大片。',
    ],
    features: ['镜头配方卡', '真实页面实拍', '2.5D 运镜', '踩点剪辑', '电影级音效', '动效工作台', 'Remotion 渲染', '剪映工程导出'],
    praise: [
      '像专业工作室做的发布片。',
      '第一个真正懂节奏的 agent 技能。',
      '下午提需求，晚上片子就上线了。',
      '这些运镜，我自己 K 帧要一周。',
    ],
    works: '适用于 Claude Code 与 Codex 的 agent 技能 · 基于 Remotion',
  },
} as const;
