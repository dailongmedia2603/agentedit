// paper-title-card —— 一句话逐词 letterpress 压印上纸字卡
// 章节转场/价值主张呼吸位：单句文案逐词压印入场（scale 大→1 + blur→0），
// 每句恰一个强调色斜体重点词，强调色下划线 scaleX 收束，尾部整卡淡出。
// 全片多张字卡统一 50–55f；纸底+中心暖光与纸墨风格产品画面同色系。
// 参数化：words/sub/subDigits 可换成目标产品文案；subDigits 走 DigitRoll
// 数字滚动（必须在本卡淡出前落定）。渲染本 demo 前把 text 复制进项目即可。
// [Agent Edit] o chu: title (cau chinh, ep tung tu), accent (tu/cum tu NHAN trong cau — dung y nguyen chu trong title;
// khong co -> tu cuoi), number (con so cuon kieu dong ho, tuy chon), subtitle (dong mono nho canh con so, tuy chon).
// Cau dai ngan bat ky: tach dong can bang theo be ngang that (font serif that), 2 dong dai gan bang nhau, khong mo coi;
// nhip ep tung tu nen theo so tu de MOI tu ep xong truoc khung 40. Mau nhan = LOOKS.paper.accent (doi theo mau video).
// Khung doc (native): chu to hon, toi da 5 dong, ca khoi giua khung; nen giay phu kin chieu cao.
// Cuoi canh chi CHU mo dan (nen giay giu nguyen) -> cat sang canh sau khong bi nhay trang.
import { useCurrentFrame, useVideoConfig, useText, useShotFonts, useBackdrop, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import { LOOKS, SERIF } from '../../../fixtures/Look';

export const PAPER_TITLE_CARD_DURATION = 55; // ≈1.8s @30fps

// 数字滚动列（odometer 风格，数字带双份拼接保证任何目标位都有滚感；tabular-nums 防横向抖）
const DIGITS = '0123456789';
const DigitColumn: React.FC<{ ch: string; delay: number; lineH: number; fs: number; color: string; family: string }> = ({ ch, delay, lineH, fs, color, family }) => {
  const frame = useCurrentFrame();
  if (ch < '0' || ch > '9') {
    return <span style={{ fontSize: fs, lineHeight: `${lineH}px`, color, fontFamily: family }}>{ch}</span>;
  }
  const target = DIGITS.indexOf(ch);
  const t = interpolate(frame, [delay, delay + 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.25, 0.8, 0.25, 1),
  });
  const offset = (10 + target) * t * lineH;
  return (
    <span style={{ display: 'inline-block', height: lineH }}>
      <span style={{ display: 'block', transform: `translateY(${-offset}px)` }}>
        {(DIGITS + DIGITS).split('').map((d, j) => (
          <span key={j} style={{ display: 'block', fontSize: fs, lineHeight: `${lineH}px`, color, fontFamily: family, fontVariantNumeric: 'tabular-nums' }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
};

const DigitRoll: React.FC<{ value: string; delay: number; color: string; fs: number; family: string }> = ({ value, delay, color, fs, family }) => {
  const lineH = fs * 1.15;
  // 数字滚动必须在本卡淡出前落定：位数多时压缩错峰
  const step = Math.min(4, 10 / Math.max(1, value.length - 1));
  return (
    <span style={{ display: 'inline-flex', overflow: 'hidden', height: lineH, verticalAlign: 'bottom' }}>
      {value.split('').map((c, i) => (
        <DigitColumn key={i} ch={c} delay={delay + i * step} lineH={lineH} fs={fs} color={color} family={family} />
      ))}
    </span>
  );
};

const norm = (w: string) => w.toLowerCase().replace(/[.,!?;:…"“”'‘’()]/g, '');

export const PaperTitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const duration = PAPER_TITLE_CARD_DURATION;
  const ACCENT = LOOKS.paper.accent;
  const title = useText('title', 'Mỗi dự án đều được nối thẳng vào báo cáo tuần.');
  const accentText = useText('accent', 'báo cáo tuần');
  const number = useText('number', '12');
  const subtitle = useText('subtitle', 'video đã xuất hôm nay');

  // 版式：逐行均衡折行（两行长度接近，不留孤词）
  const maxW = portrait ? 1640 : 1500;
  const baseFs = portrait ? 230 : 116;
  const maxLines = portrait ? 5 : 3;
  const wOf = (t: string, fs: number) => measureText(t, SERIF, fs, 600) * 1.0 - Math.max(0, t.length - 1) * 0.012 * fs;
  const balanced = (t: string, fs: number, n: number) => {
    let lo = 0, hi = wOf(t, fs) + 1;
    let best = [t];
    for (let it = 0; it < 18; it++) {
      const mid = (lo + hi) / 2;
      const ls = wrapLines(t, SERIF, fs, mid, 600, 99);
      if (ls.length <= n) { best = ls; hi = mid; } else lo = mid;
    }
    return best;
  };
  const words0 = title.trim().split(/\s+/).filter(Boolean);
  const greedy = wrapLines(title, SERIF, baseFs, maxW, 600, 99);
  const nLines = Math.min(maxLines, Math.max(greedy.length, words0.length >= 5 ? 2 : 1), words0.length);
  const lineTexts = nLines === 1 ? [title.trim()] : balanced(title, baseFs, nLines);
  const fs = Math.min(baseFs, ...lineTexts.map((l) => fitSize(l, { family: SERIF, size: baseFs, maxWidth: maxW, weight: 600, minSize: baseFs * 0.45 })));

  // 重点词：accent 在句中按词匹配（恰好一处）；找不到 → 末词
  const flat = lineTexts.flatMap((l, li) => l.split(/\s+/).filter(Boolean).map((w) => ({ w, li })));
  const acc = accentText.trim().split(/\s+/).filter(Boolean).map(norm);
  let accStart = -1;
  if (acc.length) {
    for (let i = 0; i + acc.length <= flat.length && accStart < 0; i++) {
      if (acc.every((a, j) => norm(flat[i + j].w) === a)) accStart = i;
    }
  }
  const accSet = new Set<number>();
  if (accStart >= 0) for (let j = 0; j < acc.length; j++) accSet.add(accStart + j);
  else if (flat.length) accSet.add(flat.length - 1);

  // 逐词压印：原版 delay = 4 + i·4、9f；词多时压缩词间，保证 ~40f 前全部压完
  const step = Math.min(4, 27 / Math.max(1, flat.length - 1));

  const fadeOut = interpolate(frame, [duration - 8, duration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const underline = interpolate(frame, [16, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const subT = interpolate(frame, [10, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const subFs0 = portrait ? 54 : 26;
  const hasSub = !!(number.trim() || subtitle.trim());
  const subFs = subtitle.trim()
    ? fitSize(subtitle.toUpperCase(), { family: fonts.mono, size: subFs0, maxWidth: maxW - (number.length + 1) * subFs0 * 0.7, weight: 400, minSize: subFs0 * 0.6, letterSpacingEm: 0.12 })
    : subFs0;
  const lineH = fs * 1.18; // 越南语叠加声调：行距 ≥ 1.1
  const scale = portrait ? 1.8 : 1;

  let wi = 0;
  // [Agent Edit] DOT 2: co nen anh AI -> bo nen giay + quang sang am; chu ep in nam thang tren anh -> bong sang nhe
  const bd = useBackdrop();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: bd ? 'transparent' : 'oklch(97.5% 0.008 82)',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundImage: bd ? undefined : `radial-gradient(${1100 * scale}px ${750 * scale}px at 50% 46%, oklch(99.3% 0.014 88 / 0.85), transparent 65%)`,
      }}
    >
      <div style={{ textAlign: 'center', width: maxW + 40, opacity: fadeOut, paddingTop: fs * 0.1, textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined }}>
        {lineTexts.map((l, li) => (
          <div
            key={li}
            style={{
              fontFamily: SERIF,
              fontSize: fs,
              fontWeight: 600,
              lineHeight: `${lineH}px`,
              color: 'oklch(18% 0.006 82)',
              letterSpacing: '-0.012em',
              display: 'flex',
              justifyContent: 'center',
              columnGap: '0.26em',
              whiteSpace: 'nowrap',
            }}
          >
            {l.split(/\s+/).filter(Boolean).map((w) => {
              const i = wi++;
              const delay = 4 + i * step;
              const t = interpolate(frame, [delay, delay + 9], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.2, 0.75, 0.3, 1),
              });
              const accent = accSet.has(i);
              return (
                <span
                  key={i}
                  style={{
                    opacity: t,
                    transform: `scale(${1.28 - 0.28 * t})`,
                    filter: t >= 0.999 ? undefined : `blur(${(1 - t) * 7}px)`,
                    display: 'inline-block',
                    fontStyle: accent ? 'italic' : 'normal',
                    color: accent ? ACCENT : undefined,
                  }}
                >
                  {w}
                </span>
              );
            })}
          </div>
        ))}
        <div
          style={{
            height: 6 * scale,
            width: 220 * scale,
            margin: `${38 * scale}px auto 0`,
            borderRadius: 3 * scale,
            background: ACCENT,
            transform: `scaleX(${underline})`,
          }}
        />
        {hasSub ? (
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: subFs,
              letterSpacing: '0.12em',
              color: 'oklch(50% 0.006 82)',
              marginTop: 34 * scale,
              opacity: subT,
              textTransform: 'uppercase',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'baseline',
              gap: '0.5em',
              whiteSpace: 'nowrap',
            }}
          >
            {number.trim() ? <DigitRoll value={number.trim()} delay={12} color={ACCENT} fs={subFs0} family={fonts.mono} /> : null}
            {subtitle.trim() ? <span>{subtitle}</span> : null}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
