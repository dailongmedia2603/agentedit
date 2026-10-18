// blur-slide — Blur Slide 逐词入场（第二轮重设计：编辑排版海报）
// 手法不变：标题逐词入场，y 位移 + blur + opacity 三通道共用同一个进度 p、同一条缓动同步收敛
// ——词是"从虚焦里浮出来"，不是"滑进来顺便淡一下"；副标题在标题收完前错峰跟进，重叠读作一句话。
//
// 设计决定
// - look：paper（暖白纸 · 墨 · 朱红）。编辑排版语境：杂志刊头 + 大衬线标题 + 无衬线副标，
//   左对齐在 168px 安全边距的网格上，右侧留白给标题的尾巴呼吸。
// - 层级：刊头 24px 全大写（纹理级）→ 栏目眉题 30px 朱红全大写 → 主标题 170px 衬线两行 →
//   副标题 46px 无衬线。主副字号差 3.7 倍，字重 400 衬线对 400 无衬线靠字体家族区分。
// - 强调色只给一个词：第二行的斜体 "cinematic." 是朱红，它最后落定、入场窗更长（主角）。
// - 文案：主 5 词 "Make every launch / feel cinematic."、副 9 词（video-shotcraft 的宣传句）；刊头是 video-shotcraft 字标。
//
// 时间表（30fps，120f）
//   0–24   刊头与发丝线已在画面（首帧不空），发丝线从左向右画出（snappy 24f）
//   4–22   栏目眉题 blur-slide 入场（与手法同族，做"预备"）
//   10–40  主标题第一行 3 词，词间 4f，每词 22f
//   26–58  第二行：先停 6f 换气，"feel" 22f、"cinematic." 30f（最后落定，字距同 p 收紧）
//   34–80  副标题 9 词，词间 2.4f、每词 20f、位移/模糊更小——层级靠幅度不靠时长；与主标题重叠 24f
//   72–98  刊脚发丝线从右向左画出 + 页码淡入（hold 段的余波，版面闭合成完整一页）
//   80–119 落定 hold 40f：整组极缓推近 1→1.03（smooth，起止零速度）+ 纸面主光极缓呼吸
// 曲线：三通道共用 EASE.out（quint-out 级），起手快、尾巴长，词"浮"上来而不是"弹"上来。
//
// [Agent Edit] o chu: kicker (眉题) / line1 + line2 (主标题两行，line2 末词 = 强调词) / subtitle / label (刊头右) /
// folio (后景大数字)。Chu that dai ngan bat ky: moi dong tu thu nho vua be ngang; nhip vao tung tu nen theo so tu.
// Khung doc (portrait.mode = 'native'): tieu de to hon, tu xuong dong theo be ngang, ca khoi dat giua khung.
import { useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';

import { LOOKS, SERIF, Stage, alpha } from '../../../fixtures/Look';
import { EASE, FONT, ramp } from '../../../fixtures/Polish';
import { ShotcraftWordmark } from '../../../fixtures/Brand';

export const BLUR_SLIDE_DURATION = 120; // 4000ms @30fps

const L = LOOKS.paper;
const LEFT = 168; // 左侧安全边距 / 网格起点

// 单词：start 起始帧、dur 入场时长、dy 位移（px）、blur 最大模糊（px）。
// opacity / translateY / blur（及可选字距）全部绑同一个 p —— 本卡的核心，不可拆成多条缓动。
type Word = { text: string; start: number; dur: number; style?: React.CSSProperties; track?: [number, number] };

const Words: React.FC<{ words: Word[]; dy: number; blur: number; gap: string; style: React.CSSProperties }> = ({ words, dy, blur, gap, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap, whiteSpace: 'nowrap', ...style }}>
      {words.map((w, i) => {
        const p = ramp(frame, w.start, w.dur, EASE.out);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${((1 - p) * dy).toFixed(2)}px)`,
              filter: p >= 0.999 ? undefined : `blur(${((1 - p) * blur).toFixed(2)}px)`,
              letterSpacing: w.track ? `${(w.track[0] + (w.track[1] - w.track[0]) * p).toFixed(4)}em` : undefined,
              ...w.style,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

const words = (text: string, start: number, step: number, dur: number) =>
  text.split(/\s+/).filter(Boolean).map((t, i) => ({ text: t, start: start + i * step, dur }));

export const BlurSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const kicker = useText('kicker', 'GHI CHÚ PHÁT HÀNH');
  const line1 = useText('line1', 'Mỗi lần ra mắt');
  const line2 = useText('line2', 'đều thật điện ảnh.');
  const sub = useText('subtitle', 'Công thức cảnh quay và chuyển động máy, do trợ lý AI dựng.');
  const label = useText('label', 'SỐ 07 — THÁNG 10');
  const folio = useText('folio', '07');
  const portrait = SH > 1080 * 1.2;
  const W = 1920 - LEFT * 2;
  // 主标题：portrait 时字号放大、按宽度折行；landscape 保持两行、每行缩到一行内
  const H1 = portrait ? 230 : 170;
  const head1 = portrait ? wrapLines(`${line1} ${line2}`, fonts.serif, H1, W, 400, 4) : [line1, line2];
  const size1 = Math.min(...head1.map((l) => fitSize(l, { family: fonts.serif, size: H1, maxWidth: W, weight: 400, minSize: 70 })));
  // 第一行词间 4f；最后一行先停 6f 换气，末词（强调）入场窗更长
  let t = 10;
  const lines = head1.map((l, li) => {
    const isLast = li === head1.length - 1;
    if (isLast && li > 0) t += 6;
    const ws = l.split(/\s+/).filter(Boolean);
    const step = Math.min(4, 22 / Math.max(1, ws.length));
    const row: Word[] = ws.map((w, i) => {
      const last = isLast && i === ws.length - 1;
      const o: Word = { text: w, start: t + i * step, dur: last ? 30 : 22 };
      if (last) Object.assign(o, { track: [0.03, -0.025], style: { fontStyle: 'italic', color: L.accent } });
      return o;
    });
    t += ws.length * step;
    return row;
  });
  const h1End = t;
  // 副标题：词间按词数压密（最多 2.4f），与主标题重叠
  const subWords = sub.split(/\s+/).filter(Boolean);
  const subSize = portrait ? 66 : 46;
  const subStep = Math.min(2.4, 40 / Math.max(1, subWords.length));
  const subStart = Math.max(26, h1End - 22);
  const subLines = wrapLines(sub, fonts.sans, subSize, W, 400, portrait ? 4 : 2);
  let si = 0;
  const subRows = subLines.map((l) => {
    const ws = l.split(/\s+/).filter(Boolean);
    const row = ws.map((w) => ({ text: w, start: subStart + (si++) * subStep, dur: 20 }));
    return row;
  });
  // dau tieng Viet chong tang (ỗ, ầ, ắ) cao hon chu hoa ~0.3em: gian dong >= 1.1 + chua khoang phia tren dong dau
  const lineH1 = size1 * 1.12;
  const lineSub = subSize * 1.2;
  // 垂直排布：portrait 以整块居中；landscape 保持原版网格位置
  const blockH = 60 + size1 * 0.3 + lines.length * lineH1 + 70 + subRows.length * lineSub;
  const y0 = portrait ? Math.round(SH / 2 - blockH / 2) : 318;
  const yH1 = portrait ? y0 + 60 + Math.round(size1 * 0.3) : 384 + Math.round(size1 * 0.08);
  const ySub = portrait ? yH1 + lines.length * lineH1 + 70 : Math.max(800, yH1 + lines.length * lineH1 + 40);
  const footY = portrait ? Math.min(SH - 220, ySub + subRows.length * lineSub + 90) : 972;
  const headY = portrait ? Math.max(120, y0 - 260) : 92;
  // 整组极缓推近：以文字块左缘为原点，全程 smooth，尾段速度归零
  const push = 1 + 0.03 * ramp(frame, 0, 119, EASE.smooth);
  const rule = ramp(frame, 0, 24, EASE.snappy);
  const kick = ramp(frame, 4, 18, EASE.out);
  const folioP = ramp(frame, 0, 48, EASE.out);
  const foot = ramp(frame, 72, 26, EASE.snappy);
  const headline: React.CSSProperties = {
    fontFamily: SERIF, fontSize: size1, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.035em', color: L.ink,
  };
  return (
    <Stage look={L} keyLight={{ x: 0.3, y: 0.18 }} fill={null} breathe={0.6} grain={0.06} vignette={0.1}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 40% 50% at 96% 100%, ${alpha(L.accent, 0.06)}, ${alpha(L.accent, 0)} 70%)` }} />
      {/* 后景：刊号大数字（5% 墨色），比文字层推得更慢且反向漂移 → 前后景视差 */}
      <div
        style={{
          position: 'absolute', right: 120, top: portrait ? y0 - 120 : 150, fontFamily: SERIF, fontSize: portrait ? 900 : 760, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.06em',
          color: alpha(L.ink, 0.045 * folioP), filter: folioP >= 0.999 ? undefined : `blur(${((1 - folioP) * 24).toFixed(2)}px)`,
          transform: `translateX(${(-24 * ramp(frame, 0, 119, EASE.smooth)).toFixed(2)}px)`,
        }}
      >
        {folio}
      </div>
      {/* 刊头：品牌字标（视频自己的品牌）+ 右侧小标签 */}
      <div style={{ position: 'absolute', left: LEFT, right: LEFT, top: headY, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: FONT.sans, fontSize: portrait ? 34 : 24, fontWeight: 600, letterSpacing: '0.2em', color: L.ink2, opacity: 0.4 + 0.6 * rule }}>
        <ShotcraftWordmark size={portrait ? 34 : 24} markScale={1.5} gap={12} tone="light" color={L.ink2} />
        <span style={{ color: L.ink3 }}>{label}</span>
      </div>
      <div style={{ position: 'absolute', left: LEFT, top: headY + (portrait ? 64 : 48), width: W, height: 1.5, background: alpha(L.ink, 0.22), transform: `scaleX(${rule.toFixed(4)})`, transformOrigin: '0 50%' }} />
      {/* 刊脚：副标题落定后从右向左画出一条发丝线 */}
      <div style={{ position: 'absolute', left: LEFT, top: footY, width: W, height: 1.5, background: alpha(L.ink, 0.18), transform: `scaleX(${foot.toFixed(4)})`, transformOrigin: '100% 50%' }} />

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(5)})`, transformOrigin: `${LEFT}px ${yH1 + 170}px` }}>
        {kicker ? (
          <div
            style={{
              position: 'absolute', left: LEFT, top: y0, display: 'flex', alignItems: 'center', gap: 18,
              fontFamily: FONT.sans, fontSize: portrait ? 40 : 30, fontWeight: 650, letterSpacing: '0.16em', color: L.accent,
              opacity: kick, transform: `translateY(${((1 - kick) * 18).toFixed(2)}px)`, filter: kick >= 0.999 ? undefined : `blur(${((1 - kick) * 6).toFixed(2)}px)`,
            }}
          >
            <span style={{ width: 14, height: 14, background: L.accent, display: 'inline-block' }} />
            {kicker.toUpperCase()}
          </div>
        ) : null}
        {lines.map((row, i) => (
          <Words key={i} words={row} dy={64} blur={18} gap="0.24em" style={{ ...headline, position: 'absolute', left: LEFT - 6, top: yH1 + i * lineH1 }} />
        ))}
        {subRows.map((row, i) => (
          <Words
            key={i}
            words={row}
            dy={26}
            blur={9}
            gap="0.26em"
            style={{ position: 'absolute', left: LEFT, top: ySub + i * lineSub, fontFamily: FONT.sans, fontSize: subSize, fontWeight: 400, letterSpacing: '-0.012em', color: L.ink2, lineHeight: 1.2 }}
          />
        ))}
      </div>
    </Stage>
  );
};
